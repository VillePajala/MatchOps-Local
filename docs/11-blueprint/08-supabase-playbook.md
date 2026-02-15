# 08. Supabase Playbook — Schema, RLS, Migrations, RPC, Edge Functions

> **Audience**: AI agent building the new app
> **Purpose**: How to design and deploy a Supabase backend that pairs with the local-first architecture

---

## Architecture

```
┌──────────────────────────────┐
│       SupabaseDataStore      │
│  (app-level transforms)      │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│      Supabase Client         │
│  (singleton, lazy-loaded)    │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│        PostgreSQL             │
│  Schema + RLS + RPC          │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│       Edge Functions          │
│  (account deletion, billing)  │
└──────────────────────────────┘
```

---

## 1. Schema Design Principles

### Table Naming
- **snake_case** for all tables and columns
- App uses **camelCase** — transforms happen in DataStore layer
- One table per entity, plus junction tables for many-to-many

### ID Strategy
- App-generated text IDs: `exercise_1707912345678_a3f8k2`
- **NOT** database-generated UUIDs — enables offline creation without server round-trip
- `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` on every table

### Example Schema

```sql
-- exercises table
CREATE TABLE exercises (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL,
  subcategory text,
  tags text[] DEFAULT '{}',
  duration_minutes integer NOT NULL,
  intensity text CHECK (intensity IN ('low', 'medium', 'high')),
  player_count_min integer DEFAULT 1,
  player_count_max integer DEFAULT 0,
  age_group_suitability text[] DEFAULT '{}',
  coaching_points text[] DEFAULT '{}',
  equipment jsonb DEFAULT '[]'::jsonb,
  field_setup jsonb,
  variations jsonb DEFAULT '[]'::jsonb,
  progressions text[] DEFAULT '{}',
  is_favorite boolean DEFAULT false,
  source text DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- practice_sessions table
CREATE TABLE practice_sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  date date NOT NULL,
  start_time text,
  total_duration_minutes integer NOT NULL,
  team_id text,
  season_id text,
  location text,
  notes text,
  status text DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- practice_blocks table (child of practice_sessions)
CREATE TABLE practice_blocks (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  title text NOT NULL,
  duration_minutes integer NOT NULL,
  block_type text NOT NULL CHECK (block_type IN ('warmup', 'main', 'cooldown', 'break', 'free')),
  exercise_id text REFERENCES exercises(id) ON DELETE SET NULL,
  coaching_points text[] DEFAULT '{}',
  field_diagram jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_exercises_user ON exercises(user_id);
CREATE INDEX idx_practice_sessions_user ON practice_sessions(user_id);
CREATE INDEX idx_practice_sessions_date ON practice_sessions(user_id, date);
CREATE INDEX idx_practice_blocks_session ON practice_blocks(session_id);
```

### Key Schema Decisions

| Decision | Rationale |
|----------|-----------|
| `text` IDs (not uuid) | App generates IDs offline. UUIDs would require server. |
| `ON DELETE CASCADE` from auth.users | GDPR: deleting Supabase user removes ALL their data |
| `jsonb` for field diagrams | Complex nested objects that don't need indexing |
| `text[]` for tags, coaching_points | Simple arrays that Supabase handles natively |
| `order_index` on blocks | Preserves ordering (arrays don't exist in SQL) |
| No FK from exercises to sessions | Exercises are library items used across many sessions |

---

## 2. Row-Level Security (RLS)

**Every table MUST have RLS enabled.** Without it, any authenticated user can read/write all data.

```sql
-- Enable RLS
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

-- Policy pattern: user can only access their own rows
CREATE POLICY "Users can read own exercises"
  ON exercises FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own exercises"
  ON exercises FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own exercises"
  ON exercises FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own exercises"
  ON exercises FOR DELETE
  USING (auth.uid() = user_id);
```

**Apply this pattern to EVERY table.** No exceptions.

**Key traps**:
- `USING` filters rows for read. `WITH CHECK` validates data for write.
- UPDATE needs BOTH `USING` (which rows can be updated) and `WITH CHECK` (what values are allowed).
- Forgetting RLS on a new table = data leakage. Run security advisors regularly.

---

## 3. Migration Strategy

### File Convention

```
supabase/migrations/
├── 000_schema.sql            # Initial schema (all tables)
├── 001_rpc_functions.sql     # RPC functions
├── 002_rls_policies.sql      # All RLS policies
├── 003_add_exercise_fields.sql  # Schema evolution
└── ...
```

### Migration Rules

1. **Never modify a deployed migration** — always create a new one
2. **Test on staging first** — always apply to staging before production
3. **Separate DDL from DML** — schema changes in one migration, data backfills in another
4. **RPC functions: DROP + CREATE** — always drop before recreating to handle signature changes

```sql
-- Pattern for RPC updates
DROP FUNCTION IF EXISTS save_practice_session CASCADE;

CREATE OR REPLACE FUNCTION save_practice_session(
  p_session jsonb,
  p_blocks jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  -- Validate user owns the session
  IF NOT EXISTS (
    SELECT 1 FROM practice_sessions
    WHERE id = (p_session->>'id')::text AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Session not found or not owned by user';
  END IF;

  -- Upsert session
  INSERT INTO practice_sessions (id, user_id, title, date, total_duration_minutes, ...)
  VALUES (...)
  ON CONFLICT (id) DO UPDATE SET ...;

  -- Delete existing blocks, insert new ones
  DELETE FROM practice_blocks WHERE session_id = (p_session->>'id')::text AND user_id = v_user_id;
  -- Insert blocks from JSON array...
END;
$$;
```

### Lesson Learned: Never Rewrite RPC When Adding Columns

When adding a new column to a table that an RPC function writes to:
1. **Migration A**: `ALTER TABLE ADD COLUMN new_field text;`
2. **Migration B**: Update the RPC function to include the new column

**NEVER** combine these. If the RPC rewrite references the new column before it exists, the migration fails.

---

## 4. RPC Functions — When and Why

Use RPC when you need **multi-table atomic writes**:

```
Single table operation → Direct Supabase client query
Multi-table operation  → RPC function (PostgreSQL transaction)
```

### Example: Save Practice Session with Blocks

Direct client calls would require:
1. Upsert session → might succeed
2. Delete old blocks → might succeed
3. Insert new blocks → might FAIL

If step 3 fails, you have a session with no blocks. RPC wraps everything in a transaction:

```sql
CREATE FUNCTION save_practice_with_blocks(
  p_session jsonb,
  p_blocks jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session_id text := p_session->>'id';
  elem jsonb;
BEGIN
  -- Session upsert
  INSERT INTO practice_sessions (id, user_id, title, date, ...)
  VALUES (v_session_id, v_user_id, ...)
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    date = EXCLUDED.date,
    updated_at = now();

  -- Replace blocks atomically
  DELETE FROM practice_blocks
  WHERE session_id = v_session_id AND user_id = v_user_id;

  FOR elem IN SELECT * FROM jsonb_array_elements(p_blocks)
  LOOP
    INSERT INTO practice_blocks (id, user_id, session_id, order_index, ...)
    VALUES (
      elem->>'id',
      v_user_id,
      v_session_id,
      (elem->>'order_index')::integer,
      ...
    );
  END LOOP;
END;
$$;
```

**SECURITY DEFINER**: Runs with the function creator's permissions (bypasses RLS). The function MUST validate `auth.uid()` explicitly.

---

## 5. Supabase Client Singleton

```typescript
// src/datastore/supabase/client.ts

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

let client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase configuration missing');
  }

  client = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: (url, options) => {
        // 30-second timeout for all Supabase requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);

        return fetch(url, {
          ...options,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));
      },
    },
  });

  return client;
}
```

**Key patterns**:
- **Singleton** — only one client instance
- **30-second timeout** — prevents hanging requests from blocking the UI
- **Dynamic import** — the factory uses `await import('./supabase/client')` so the Supabase SDK isn't in the local-mode bundle

---

## 6. Edge Functions

### Shared CORS Module

Edge Functions need CORS headers for browser requests. Create a shared module:

```typescript
// supabase/functions/_shared/cors.ts

const ALLOWED_ORIGINS = [
  'https://app.yoursite.com',
  'https://yoursite.app',
  'http://localhost:3000',
  // Add other dev/preview origins
];

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  if (isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin!;
  }

  return headers;
}
```

### Account Deletion (GDPR)

```typescript
// supabase/functions/delete-account/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace('Bearer ', '');

    // Two-client pattern:
    // 1. Admin client (service role) — for auth.admin.deleteUser
    // 2. User-scoped client (anon key + JWT) — for RPC calls that use auth.uid()
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    // Verify the JWT and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Delete all user data BEFORE deleting the auth user
    // Uses user-scoped client so auth.uid() works inside the RPC function
    const { error: dataDeleteError } = await supabaseUser.rpc('clear_all_user_data');

    if (dataDeleteError) {
      return new Response(
        JSON.stringify({ error: 'Failed to delete account data. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Delete the auth user (service role required)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: 'Deletion failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in delete-account:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

**Key patterns**:
- Uses **`https://esm.sh/@supabase/supabase-js@2`** import — the correct CDN path for Deno Edge Functions (NOT `jsr:` which is outdated)
- **Two-client pattern**: Admin client (service role key) for `auth.admin.deleteUser`, user-scoped client (anon key + JWT) for RPC calls that use `auth.uid()`. Using service role for RPC makes `auth.uid()` return NULL.
- **Data deletion before auth deletion**: Always delete user data first. If auth deletion fails after data is gone, the user can retry and the empty auth account is harmless.
- **CORS on every response**: Preflight handler for OPTIONS, and `corsHeaders` included in all JSON responses.
- Uses **service role key** (server-side only) — never expose to client
- `ON DELETE CASCADE` on all tables means deleting the auth user cascades to all data
- JWT verification ensures only the account owner can delete

> **Rate Limiting**: Production Edge Functions should implement rate limiting. MatchOps-Local uses distributed rate limiting via a PostgreSQL RPC function (`check_rate_limit`) that tracks requests per IP in a database table. This works across all Edge Function instances (unlike in-memory rate limiting). At minimum, add rate limiting to destructive endpoints like account deletion.

---

## 7. Type Generation

After schema changes, regenerate TypeScript types:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/supabase.ts
```

This generates:
- Table row types (`Database['public']['Tables']['exercises']['Row']`)
- Insert types (`Database['public']['Tables']['exercises']['Insert']`)
- Update types (`Database['public']['Tables']['exercises']['Update']`)

Use these for type-safe Supabase queries:

```typescript
const { data, error } = await supabase
  .from('exercises')
  .select('*')
  .eq('user_id', userId);
// data is typed as ExerciseRow[]
```

---

## 8. Staging vs Production

Always maintain two Supabase projects:

| | Staging | Production |
|---|---------|-----------|
| Purpose | Test migrations, new features | Live user data |
| Data | Test data only | Real user data |
| Migrations | Apply here FIRST | Apply after staging verified |
| Edge Functions | Test here FIRST | Deploy after staging verified |

**Never test schema changes directly on production.**

---

## Traps

1. **Forgetting RLS on a new table** = data leakage. Run `get_advisors(type: 'security')` after every DDL change.

2. **SECURITY DEFINER RPC must validate auth.uid()**: The function bypasses RLS, so it MUST check user ownership explicitly.

3. **Empty string ↔ NULL**: PostgreSQL stores empty strings and NULL differently. App uses empty strings for optional fields. Transform: `value === '' ? null : value` on write, `value ?? ''` on read.

4. **JSONB type mismatch**: Supabase codegen types use `Json` which is `string | number | boolean | null | { [key: string]: Json } | Json[]`. Your app types won't match. Cast: `value as unknown as Json` for writes, `value as unknown as AppType` for reads.

5. **Migration ordering**: Always apply schema changes before RPC changes that reference new columns.

6. **`ON DELETE CASCADE`**: Deleting a parent row deletes all children. This is intentional for user deletion but dangerous for entity deletion. Use `ON DELETE SET NULL` for optional references (e.g., exercise_id in blocks).
