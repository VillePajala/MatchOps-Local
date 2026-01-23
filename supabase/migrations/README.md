# Supabase Migration Files

This directory contains SQL migration files for the MatchOps-Local cloud backend.

## Files

| File | Description |
|------|-------------|
| `000_schema.sql` | Creates all 14 tables and indexes |
| `001_rpc_functions.sql` | Creates atomic transaction functions (RPC) |
| `002_rls_policies.sql` | Enables Row Level Security on all tables |
| `003_fix_composite_uniqueness.sql` | Removes overly restrictive unique constraints |
| `004_add_series_gin_index.sql` | Adds GIN index for tournaments.series JSONB queries |
| `005_clear_all_user_data.sql` | Adds RPC for atomic deletion of all user data |
| `006_backfill_games_created_at.sql` | Backfills created_at for existing games |
| `007_add_tactical_data_user_index.sql` | Adds missing user_id index on game_tactical_data |

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

## Quick Deploy

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
2. Copy/paste each file in order (000 → 007)
3. Run each script and verify no errors

## Verification

After running all migrations, verify the setup:

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Should show 14 tables:
-- game_events, game_players, game_tactical_data, games,
-- personnel, player_adjustments, player_assessments, players,
-- seasons, team_players, teams, tournaments, user_settings, warmup_plans

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- All tables should have rowsecurity = true

-- Check RPC functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';

-- Should show: clear_all_user_data, delete_personnel_cascade, save_game_with_relations, set_team_roster
```

## Environment Configuration

After deploying the schema, configure your environment:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## Rollback

To reset the database (development only):

```sql
-- WARNING: This deletes ALL data!
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

Then re-run all migrations.

## Documentation

- [Schema Documentation](../../docs/02-technical/database/supabase-schema.md)
- [Implementation Guide](../../docs/03-active-plans/supabase-implementation-guide.md)
