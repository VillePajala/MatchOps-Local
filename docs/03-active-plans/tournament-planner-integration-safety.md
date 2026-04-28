# Tournament Planner Integration — Safety Rules

**Status:** active · **Last updated:** 2026-04-28 · **Owner:** @valoraami
**Companion:** `tournament-planner-integration-pr-plan.md` (PR-by-PR plan)

The integration is multi-week, schema-touching work. These rules keep production safe while we develop on `feature/planner-integration`.

## Hard rules

1. **Never touch master.** All work happens on `feature/planner-integration` (long-running) and per-PR sub-branches off of it. Sub-PRs target the feature branch, not master. The feature branch only merges to master when *every* phase is done and the user explicitly approves the final cutover.

2. **All schema changes are additive.** New columns, new tables, new optional fields. No renames, no drops, no type changes on existing fields. Existing prod transforms (CLAUDE.md Rules 1–19) keep working unchanged.

3. **Code deploys before the migration runs on prod.** Migration files live in `supabase/migrations/` and don't auto-apply. Order on prod cutover day:
   1. Code knowing about the new schema is merged to master and Vercel-deployed to prod.
   2. App still works against the *old* schema (because new columns/tables are optional).
   3. Migration is applied to prod via Supabase CLI or MCP.
   4. New features become available.
   If anything looks wrong between (b) and (c), we don't apply.

4. **Staging first, always.** Every migration applies to `matchops-staging` (project ref `hwcqpvvqnmetjrwvzlfr`) before prod. `npm run dev` already points there via `.env.development`. Soak time on staging: at minimum one full dev session of cloud-mode use; ideally a real test of the affected flow.

5. **Each migration PR contains BOTH the SQL and the matching code update.** No "schema-only" PR that leaves prod tolerating both shapes for an indeterminate time. Each PR is atomic: schema + reads + writes + tests, all together.

6. **Local mode tests are non-negotiable.** Roughly half of users run in local-only IndexedDB mode and never touch Supabase. Every PR that adds schema must also confirm the corresponding `LocalDataStore` change works. If a feature is cloud-only, that's an explicit per-feature decision, not the default.

7. **Tests come with every PR.** Unit tests for new code (Jest), integration tests for new RPCs (in `supabase/migrations/__tests__/`), DataStore parity tests for any field added to the entity model. CI's coverage thresholds (60% lines / 55% functions / 45% branches) are floors, not targets.

8. **AI review fires on every PR.** Don't merge until the AI review has run on GitHub and its concerns are addressed or explicitly dismissed. Final merge is *always* manual by the user.

9. **Sub-PR pattern.** From `feature/planner-integration`:
   ```
   git checkout feature/planner-integration
   git pull
   git checkout -b planner/NN-short-description
   ... work ...
   gh pr create --base feature/planner-integration --title "Phase X — ..."
   ```
   Each sub-PR is small enough to review in one sitting (~300 changed lines as a target, not a hard cap).

10. **Standalone planner stays deployed.** The standalone (`/home/villepajala/projects/matchops-planner/`) keeps running on its current Vercel URL throughout. Coaches can use it for tournaments while the integration is being built. Deprecation happens after Phase 5, not during.

## What can go wrong (and the answer)

| Scenario | What protects us |
|---|---|
| Phase 0's `scheduledSubs` column added to prod before code that reads it deploys | Rule 3 — code first, schema second. New column is `null` for all existing rows; old code ignores. |
| New `PlanningSession` table missing on prod when Phase 3 code tries to read | Rule 5 — migration ships in same PR as code. Vercel deploys the build only after PR merges. |
| Local-mode users get a runtime error from a cloud-only assumption | Rule 6 — LocalDataStore parity in every PR. |
| A migration corrupts existing `games` data | Rule 2 — additive only. No corruption surface. |
| Staging diverges from prod silently | This document + the foundation PR's verification: tables, columns, function-body hashes already match (verified 2026-04-28). |
| Merge to master happens before integration is done | Rule 1 — sub-PRs target the feature branch, never master. |

## What to do if something does go wrong

1. **Don't roll back code.** Roll *forward*: open a hotfix PR with the inverse migration (`DROP COLUMN IF EXISTS`) plus the code revert. Ship together.
2. **Use the AI review's concerns as a checklist.** Don't merge over them — address each one in the PR thread or a follow-up commit before merging.
3. **Pause and ask.** When in doubt, the user makes the call. This is a personal-coaching tool with a small user base — an extra day of pausing costs almost nothing; an outage on match day costs a tournament.
