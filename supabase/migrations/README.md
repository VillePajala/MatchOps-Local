# Supabase Migration Files

This directory contains SQL migration files for the MatchOps-Local cloud backend.

## Files

| File | Description |
|------|-------------|
| `000_schema.sql` | Creates all tables and indexes |
| `001_rpc_functions.sql` | Creates atomic transaction functions (RPC) |
| `002_rls_policies.sql` | Enables Row Level Security on all tables |
| `003_fix_composite_uniqueness.sql` | Removes overly restrictive unique constraints |
| `004_add_series_gin_index.sql` | Adds GIN index for tournaments.series JSONB queries |
| `005_clear_all_user_data.sql` | Adds RPC for atomic deletion of all user data |
| `006_backfill_games_created_at.sql` | Backfills created_at for existing games |
| `007_add_tactical_data_user_index.sql` | Adds missing user_id index on game_tactical_data |
| `008_user_consents.sql` | Creates user_consents table for GDPR compliance |
| `009_fix_user_consents_gdpr.sql` | Fixes ON DELETE to SET NULL for consent retention |
| `010_subscriptions.sql` | Creates subscriptions table for Play Store billing |
| `011_add_game_version_column.sql` | Adds version column to games table for optimistic locking |
| `012_optimistic_locking.sql` | Updates save_game_with_relations for optimistic locking |
| `013_composite_primary_keys.sql` | Changes PRIMARY KEY (id) → PRIMARY KEY (user_id, id) for user isolation |
| `014_update_rpc_for_composite_keys.sql` | Updates save_game_with_relations for composite keys |
| `015_composite_fk_indexes.sql` | Performance indexes for composite FK CASCADE operations (optional) |

## Deployment Order

**Run these in order via Supabase Dashboard > SQL Editor:**

1. `000_schema.sql` - Creates all tables and indexes
2. `001_rpc_functions.sql` - Creates atomic transaction functions
3. `002_rls_policies.sql` - Enables Row Level Security
4. `003_fix_composite_uniqueness.sql` - Fixes unique constraints for composite keys
5. `004_add_series_gin_index.sql` - Adds performance index for tournaments
6. `005_clear_all_user_data.sql` - Adds RPC for "Clear All Cloud Data" feature
7. `006_backfill_games_created_at.sql` - Backfills created_at for existing games
8. `007_add_tactical_data_user_index.sql` - Adds missing user_id index for RLS performance
9. `008_user_consents.sql` - Creates GDPR consent tracking table
10. `009_fix_user_consents_gdpr.sql` - Fixes consent retention on account deletion
11. `010_subscriptions.sql` - Creates subscription tracking for billing
12. `011_add_game_version_column.sql` - Adds version column for optimistic locking
13. `012_optimistic_locking.sql` - Updates RPC for optimistic locking
14. `013_composite_primary_keys.sql` - **CRITICAL**: Composite keys for user isolation
15. `014_update_rpc_for_composite_keys.sql` - Updates RPC for composite keys
16. `015_composite_fk_indexes.sql` - (Optional) Performance indexes for CASCADE operations

### Deployment Order - CRITICAL

**Scenario 1: Initial Deployment (No Existing Users)**
1. Run all migrations 000-015 (no client needed first)
2. Deploy client application
3. Verify end-to-end functionality

**Scenario 2: Production Update (Active Users)**
1. Deploy client code first (handles both old and new schemas)
2. Run migrations 013-014 during low-traffic window
3. Verify RPC and RLS still work
4. Monitor for errors

**Why client-first matters for Scenario 2:**
- Old client + new schema = broken (client expects single-column PK behavior)
- New client + old schema = works (client uses RPC which is schema-agnostic)
- New client + new schema = works (target state)

### Migration 013-014 Timing Estimates

These migrations acquire table locks during PK changes. Expected duration:

| Data Volume | Estimated Time | Notes |
|-------------|----------------|-------|
| Empty/Small (<100 games) | ~1-2 seconds | Typical for new deployments |
| Medium (100-500 games) | ~5-10 seconds | Monitor for completion |
| Large (500+ games) | ~30-60 seconds | Schedule during low-traffic |

If migration appears stalled beyond these times, check for:
- Active transactions holding locks (check `pg_stat_activity`)
- Large table requiring index rebuild

**Timing Methodology:**
Estimates based on PostgreSQL `ALTER TABLE` lock duration:
- Base overhead: ~1-2 seconds per table (13 tables in migration 013)
- Data-dependent: minimal for typical app scale (<10,000 rows total)
- Formula approximation: `time ≈ (num_tables × 2s) + (total_rows × 0.0001s)`

For datasets significantly larger than 500 games, consider:
- Running during maintenance window
- Monitoring `pg_stat_activity` for lock wait times

### Post-Migration: Validate NOT VALID Constraints

Migration 013 uses `NOT VALID` for nullable FKs to allow NULL values without validation errors.
After deployment, validate constraints to catch any orphaned references:

```sql
-- Run during low-traffic window (no locks, but CPU-intensive scan)
-- If any fail, investigate orphaned data before proceeding
ALTER TABLE games VALIDATE CONSTRAINT games_season_fkey;
ALTER TABLE games VALIDATE CONSTRAINT games_tournament_fkey;
ALTER TABLE games VALIDATE CONSTRAINT games_team_fkey;
ALTER TABLE player_adjustments VALIDATE CONSTRAINT player_adjustments_season_fkey;
ALTER TABLE player_adjustments VALIDATE CONSTRAINT player_adjustments_tournament_fkey;
```

If validation fails, query for orphaned references:
```sql
-- Example: Find games with invalid season_id
SELECT id, season_id FROM games
WHERE season_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM seasons WHERE seasons.id = games.season_id AND seasons.user_id = games.user_id);
```

---

## Production Deployment Runbook

### Pre-Deployment Checklist

Before deploying to production, verify:

- [ ] All migrations tested on staging/local Supabase instance
- [ ] `npm test` passes locally
- [ ] `npm run build` passes locally
- [ ] Supabase project exists and is accessible
- [ ] You have the project ref (from Supabase Dashboard > Settings > General)
- [ ] Database password available (for CLI linking)
- [ ] Service role key available (for Edge Functions)

### Step 1: Deploy Database Migrations

#### Option A: Supabase CLI (Recommended)

```bash
# 1. Install Supabase CLI if needed
npm install -g supabase

# 2. Login to Supabase
supabase login

# 3. Link to your production project
supabase link --project-ref YOUR_PROJECT_REF
# You'll be prompted for database password

# 4. Check migration status (see what's pending)
supabase db diff

# 5. Push all migrations
supabase db push

# 6. Verify migrations applied
supabase db remote commit
```

#### Option B: Manual via SQL Editor

1. Open Supabase Dashboard > SQL Editor
2. Copy/paste each migration file in order (000 → 014)
3. Run each script individually
4. Verify no errors before proceeding to next

**Important**: If a migration fails partway through, you may need to manually fix the state before retrying. See Rollback section below.

### Step 2: Deploy Edge Functions

Two Edge Functions require deployment:

#### deploy-account (Account Deletion)

```bash
# Deploy the function
supabase functions deploy delete-account --project-ref YOUR_PROJECT_REF

# No additional secrets required (uses built-in service role)
```

#### verify-subscription (Play Store Billing)

```bash
# Deploy the function
supabase functions deploy verify-subscription --project-ref YOUR_PROJECT_REF

# Set required secrets for production
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'

# For staging/development only (enables test tokens):
# supabase secrets set MOCK_BILLING=true
```

**Google Service Account Setup** (for production billing):
1. Go to Google Cloud Console > IAM & Admin > Service Accounts
2. Create service account with "Android Publisher" role
3. Generate JSON key
4. Copy entire JSON content to GOOGLE_SERVICE_ACCOUNT_JSON secret

### Step 3: Configure Environment Variables

#### Supabase Dashboard Secrets

Set these in Supabase Dashboard > Settings > Edge Functions > Secrets:

| Secret | Required | Description |
|--------|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Production | Google Play API credentials (full JSON) |
| `MOCK_BILLING` | Staging only | Set to `true` to accept test tokens |

#### Application Environment (.env.production)

```bash
# Supabase connection
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Backend mode (enables cloud features)
NEXT_PUBLIC_BACKEND_MODE=cloud
```

### Step 4: Post-Deployment Verification

Run these queries in Supabase Dashboard > SQL Editor:

```sql
-- 1. Check all tables exist (should show 16 tables)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Expected: game_events, game_players, game_tactical_data, games,
-- personnel, player_adjustments, player_assessments, players,
-- seasons, subscriptions, team_players, teams, tournaments,
-- user_consents, user_settings, warmup_plans

-- 2. Verify RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
-- All should have rowsecurity = true

-- 3. Check RPC functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Expected: clear_all_user_data, delete_personnel_cascade,
-- get_subscription_status, get_user_consent, record_user_consent,
-- save_game_with_relations, set_team_roster, update_updated_at_column,
-- upsert_subscription

-- 4. Check subscription status enum exists
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'subscription_status'::regtype;

-- Expected: none, active, cancelled, grace, expired

-- 5. Verify indexes exist
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY indexname;
-- Should include idx_* for all tables

-- 6. Verify composite primary keys (after migration 013)
SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('players', 'teams', 'seasons', 'tournaments',
    'personnel', 'games', 'game_events', 'game_players',
    'game_tactical_data', 'player_assessments', 'player_adjustments',
    'warmup_plans', 'team_players')
ORDER BY tc.table_name, kcu.ordinal_position;
-- Expected: Each table should have (user_id, id) or (user_id, game_id) as composite PK

-- 7. Verify composite foreign keys exist
SELECT conname, conrelid::regclass AS table_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
  AND conname IN ('game_events_game_fkey', 'game_players_game_fkey',
    'game_tactical_data_game_fkey', 'player_assessments_game_fkey',
    'games_season_fkey', 'games_tournament_fkey', 'games_team_fkey',
    'player_adjustments_season_fkey', 'player_adjustments_tournament_fkey',
    'team_players_team_fkey')
ORDER BY conname;
-- Expected: All FKs reference (user_id, ...) composite columns

-- 8. Security test: Verify same ID allowed for different users
-- (Run this AFTER creating test data for two users)
-- INSERT INTO players (user_id, id, name) VALUES
--   ('user-a-uuid', 'test-id', 'Player A'),
--   ('user-b-uuid', 'test-id', 'Player B');
-- Should succeed (composite PK allows same id for different users)
-- SELECT user_id, id, name FROM players WHERE id = 'test-id';
-- Should return both rows
```

#### Verify Migration 013-014 (Composite Keys)

**Full verification script**: `supabase/migrations/__tests__/013_014_composite_keys.verification.sql`

Run the complete verification script in Supabase Dashboard > SQL Editor. It includes:
- Test 1: Composite key enforcement (same ID for different users)
- Test 2: Foreign key cascade behavior (game deletion)
- Test 3: Version SELECT security (user isolation in RPC)
- Test 4: Nullable foreign key references
- Test 5: Primary key structure verification

Quick security checks (if not running full script):

```sql
-- A. Verify save_game_with_relations uses user-scoped version check
-- This query shows the function definition - look for:
-- "WHERE user_id = v_user_id AND id = v_game_id" in the version SELECT
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'save_game_with_relations';

-- B. Test cascade delete behavior (games → child tables)
-- 1. Create test game as user A
INSERT INTO games (user_id, id, team_name, opponent_name)
VALUES ('test-user-a', 'cascade-test-game', 'Test Team', 'Opponent');

-- 2. Add child records
INSERT INTO game_events (user_id, id, game_id, event_type, time_seconds, order_index)
VALUES ('test-user-a', 'test-event', 'cascade-test-game', 'goal', 300, 0);

-- 3. Delete the game
DELETE FROM games WHERE user_id = 'test-user-a' AND id = 'cascade-test-game';

-- 4. Verify child records are gone (CASCADE worked)
SELECT COUNT(*) FROM game_events WHERE game_id = 'cascade-test-game';
-- Expected: 0

-- C. Test user isolation (CRITICAL security verification)
-- Create same entity ID for two users
INSERT INTO players (user_id, id, name)
VALUES ('user-a-uuid', 'isolation-test', 'User A Player');

INSERT INTO players (user_id, id, name)
VALUES ('user-b-uuid', 'isolation-test', 'User B Player');
-- Should succeed (no constraint violation)

-- Verify isolation
SELECT user_id, name FROM players WHERE id = 'isolation-test';
-- Expected: Two rows, each with correct user's data

-- Cleanup test data
DELETE FROM players WHERE id = 'isolation-test';
```

#### Test Edge Functions

```bash
# Test delete-account (requires valid JWT)
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/delete-account' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'

# Test verify-subscription (mock mode)
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/verify-subscription' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"purchaseToken": "test-valid-token", "productId": "matchops_premium_monthly"}'
```

### Rollback Procedures

#### Rolling Back a Single Migration

If a specific migration fails and you need to undo it:

```sql
-- Example: Rollback 010_subscriptions.sql
DROP TABLE IF EXISTS subscriptions;
DROP TYPE IF EXISTS subscription_status;
DROP FUNCTION IF EXISTS get_subscription_status();
DROP FUNCTION IF EXISTS upsert_subscription(uuid, subscription_status, text, text, text, timestamptz, timestamptz, timestamptz);
```

Each migration file should have a corresponding rollback. Common patterns:

| Migration | Rollback Command |
|-----------|------------------|
| CREATE TABLE x | DROP TABLE IF EXISTS x |
| CREATE INDEX x | DROP INDEX IF EXISTS x |
| CREATE FUNCTION x | DROP FUNCTION IF EXISTS x |
| ALTER TABLE ADD COLUMN | ALTER TABLE DROP COLUMN |
| CREATE TYPE x | DROP TYPE IF EXISTS x |

#### Full Database Reset (Development Only)

**WARNING: This deletes ALL data. Never run in production with real users.**

```sql
-- Drop all tables and recreate schema
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Then re-run all migrations in order
```

#### Edge Function Rollback

```bash
# List function versions
supabase functions list --project-ref YOUR_PROJECT_REF

# Redeploy previous version (if you have the code)
git checkout PREVIOUS_COMMIT -- supabase/functions/verify-subscription/
supabase functions deploy verify-subscription --project-ref YOUR_PROJECT_REF
```

### Troubleshooting

#### Migration Fails with "relation already exists"

The table/index already exists. This is safe to ignore if the structure is correct, or drop and retry:

```sql
DROP TABLE IF EXISTS table_name CASCADE;
-- Then re-run migration
```

#### RLS Policy Errors

If queries return empty results unexpectedly:

```sql
-- Check if RLS is blocking (run as service role in Dashboard)
SET ROLE postgres;
SELECT * FROM table_name LIMIT 5;
-- If data exists, RLS policy is the issue

-- Verify policy
SELECT * FROM pg_policies WHERE tablename = 'table_name';
```

#### Edge Function Returns 500

Check function logs:

```bash
supabase functions logs delete-account --project-ref YOUR_PROJECT_REF
supabase functions logs verify-subscription --project-ref YOUR_PROJECT_REF
```

Common issues:
- Missing secrets (GOOGLE_SERVICE_ACCOUNT_JSON)
- Invalid JWT token
- CORS origin not in allowlist

#### "permission denied for table" Error

RLS is enabled but no policy matches:

```sql
-- Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Ensure user_id column matches auth.uid()
SELECT auth.uid();  -- Returns current user's ID
```

---

## Quick Deploy (Development)

### Option 1: Supabase CLI (Recommended)

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

### Option 2: Manual via SQL Editor

1. Open Supabase Dashboard > SQL Editor
2. Copy/paste each file in order (000 → 014)
3. Run each script and verify no errors

---

## Documentation

- [Schema Documentation](../../docs/02-technical/database/supabase-schema.md)
- [Implementation Guide](../../docs/03-active-plans/supabase-implementation-guide.md)
- [Billing Implementation](../../docs/03-active-plans/billing-implementation-plan.md)
