# Supabase Implementation Review (feature/supabase-cloud-backend)

Date: 2026-01-21
Reviewer: Codex
Branch: feature/supabase-cloud-backend
Scope: SupabaseDataStore, SupabaseAuthService, migrations, cloud migration services, and related helpers.

## Summary
Deep review of the current Supabase cloud backend implementation after recent fixes. Focus is on remaining data integrity risks, parity with local storage behavior, and bundling/runtime concerns. Findings are ordered by severity.

## Findings

### High
1) Warmup plan saves can fail for existing cloud users due to legacy rows
- Symptom: Warmup plans now use user-specific IDs, but legacy rows with `id = 'user_warmup_plan'` can still exist. Because the table also enforces `UNIQUE(user_id)`, an upsert by `id` can conflict with the existing row for the same user.
- Evidence: `src/datastore/SupabaseDataStore.ts:2874`, `src/datastore/SupabaseDataStore.ts:2926`, `supabase/migrations/000_schema.sql:130`
- Impact: Users with existing cloud warmup plans may not be able to save changes after the ID scheme change.
- Recommendation: Migrate legacy warmup plan IDs (or upsert by `user_id`), so a single row per user is guaranteed.

### Medium
1) Warmup plan metadata normalization missing in cloud saves
- Symptom: `saveWarmupPlan` does not normalize `lastModified` or force `isDefault=false`, while LocalDataStore does.
- Evidence: `src/datastore/SupabaseDataStore.ts:2874`, `src/datastore/LocalDataStore.ts:2032`
- Impact: Stale timestamps and default flags can persist after edits; parity with local mode is broken.
- Recommendation: Normalize in SupabaseDataStore (or shared util) before persisting.

2) Older cloud games keep null `created_at` after RPC timestamp fix
- Symptom: The RPC now injects timestamps for new saves, but existing rows with null `created_at` are not backfilled. `getGames` sorts by `created_at`.
- Evidence: `supabase/migrations/001_rpc_functions.sql:77`, `src/datastore/SupabaseDataStore.ts:2380`
- Impact: Unstable ordering of older games until resaved or backfilled.
- Recommendation: Add a one-time backfill or set `created_at` on update when null.

### Low/Medium
1) Supabase SDK imported in a local-mode component
- Symptom: `CloudAuthModal` statically imports Supabase services, which likely bundles Supabase into local-mode UI.
- Evidence: `src/components/CloudAuthModal.tsx:16`
- Impact: Larger bundles in local mode and weaker lazy-load isolation.
- Recommendation: Use dynamic imports similar to the factory pattern.

2) Warmup plan tests do not cover the new ID scheme or metadata normalization
- Symptom: Tests assert success/error only, missing user-specific ID and `lastModified`/`isDefault` behavior.
- Evidence: `src/datastore/__tests__/SupabaseDataStore.test.ts:2893`
- Impact: Regressions can slip for warmup plan persistence and parity.
- Recommendation: Add test coverage for ID rewriting and metadata normalization.

## Open Questions
- Should warmup plan upserts target `user_id` instead of `id` to avoid legacy conflicts?
- Should cloud saves enforce `lastModified` and `isDefault` normalization?
- Do we want a backfill for `games.created_at` to stabilize ordering for older rows?

## Testing
- No tests run (per project instructions).
