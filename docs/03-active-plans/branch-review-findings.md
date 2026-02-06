# Branch Review Findings: `feature/supabase-cloud-backend`

**Date**: 2026-02-06
**Reviewed by**: 5 Opus 4.6 agents (auth/security, data layer/sync, UI/orchestration, test coverage, Supabase infrastructure)
**Scope**: 350 files, 88,555 lines — full branch
**Test status at review**: 222/222 suites, 4543 tests, 0 failures

---

## How to Use This Document

- Check off items `[x]` as they are fixed
- Items are grouped by priority tier, ordered by suggested fix sequence within each tier
- Each item has effort estimate: **S** (< 30 min), **M** (1-2 hours), **L** (half day+)
- Cross-reference: items that were verified as non-issues are noted

---

## Tier 1: Launch Blockers (Fix Before Play Store)

- [x] **C1. Subscription RLS policy widened to FOR ALL** — Effort: **S** *(fixed 2026-02-06)*
  - File: `supabase/migrations/016_optimize_rls_policies_initplan.sql:57-60`
  - New migration `018_fix_subscription_rls_select_only.sql` reverts to `FOR SELECT` with initplan optimization

- [x] **C2. Subscription enforcement disabled** — **NOT AN ISSUE** *(verified 2026-02-06)*
  - Intentional feature flag for dev/internal testing phase, thoroughly documented
  - Tracked by issue #354, roadmap Phase 8, and explicit test (`premium-env.test.ts`)
  - Will be enabled at Play Store launch — no action needed now

- [x] **H2. CORS regex mismatch between Edge Functions** — Effort: **S** *(fixed 2026-02-06)*
  - `verify-subscription/index.ts:47` updated to match `delete-account` pattern
  - Test file already had the correct pattern

---

## Tier 2: Fix Before Merge to Master

### Quick wins (S effort)

- [x] **H7. Hardcoded `lang="fi"` in layout** — Effort: **S** *(fixed 2026-02-06)*
  - File: `src/app/layout.tsx:49`
  - Change `<html lang="fi">` to `<html lang="en">` (default language)
  - Screen readers currently announce English content with Finnish pronunciation

- [x] **H9. useLayoutEffect with async in SettingsModal** — Effort: **S** *(fixed 2026-02-06)*
  - File: `src/components/SettingsModal.tsx:171-205`
  - Change `React.useLayoutEffect` to `React.useEffect` — async ops don't benefit from layout effect
  - Also triggers SSR warnings

- [x] **L12. Comment/code mismatch on timeout** — Effort: **S** *(fixed 2026-02-06)*
  - File: `src/app/page.tsx:103-115`
  - Comment says "90 seconds", code is `120000` (120 seconds)
  - Update comment to say 120 seconds

- [x] **L3. usePlayBilling logs full userId** — Effort: **S** *(fixed 2026-02-06)*
  - File: `src/hooks/usePlayBilling.ts:213-221`
  - Truncate `userId` to first 8 chars (matches pattern used elsewhere)
  - Remove `accessTokenLength` (no debugging value)

### Accessibility fixes (S-M effort)

- [x] **H4. ReConsentModal missing focus trap & ARIA** — Effort: **M** *(fixed 2026-02-06)*
  - File: `src/components/ReConsentModal.tsx:51-139`
  - Add: `useFocusTrap`, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Escape key handler
  - Highest z-index modal (z-100) — WCAG 2.1 Level A violation

- [x] **H5. DeleteBlockedDialog missing same a11y features** — Effort: **M** *(fixed 2026-02-06)*
  - File: `src/components/DeleteBlockedDialog.tsx:40-95`
  - Same fixes as H4

- [x] **M15. LoadingScreen missing accessibility attributes** — Effort: **S** *(fixed 2026-02-06)*
  - File: `src/components/LoadingScreen.tsx:13-25`
  - Add `role="status"`, `aria-live="polite"` to container

### Critical test gaps (M effort each)

- [x] **C3. Entity reference methods untested** — Effort: **M** *(fixed 2026-02-06)*
  - Source: `src/datastore/SupabaseDataStore.ts:4067-4230`
  - Test: `src/datastore/__tests__/SupabaseDataStore.test.ts`
  - Added 7 tests: getSeasonReferences (3), getTeamReferences (2), getTournamentReferences (2)

- [x] **C4. ConflictError / optimistic locking untested** — Effort: **M** *(fixed 2026-02-06)*
  - Source: `src/datastore/SupabaseDataStore.ts:3296-3370`
  - Test: `src/datastore/__tests__/SupabaseDataStore.test.ts`
  - Added 5 tests: ConflictError on 40001, backup save, backup failure, non-40001 errors, version cache

- [x] **H10. AbortError recovery in SupabaseAuthService untested** — Effort: **M** *(fixed 2026-02-06)*
  - Source: `src/auth/SupabaseAuthService.ts:304-356`
  - Test: `src/auth/__tests__/SupabaseAuthService.test.ts`
  - Added 4 tests: localStorage recovery, no-fallback graceful init, non-AbortError re-throw, corrupted localStorage

---

## Tier 3: Track for Future (Post-Merge)

### Performance & architecture

- [ ] **H6. ModalProvider context value not memoized** — Effort: **S**
  - File: `src/contexts/ModalProvider.tsx:185-212`
  - Wrap value object in `useMemo` to prevent cascading re-renders

- [ ] **H8. LoginScreen/AuthModal code duplication** — Effort: **L**
  - Files: `src/components/LoginScreen.tsx`, `src/components/AuthModal.tsx`
  - ~430 lines each with near-identical form logic, styles, state
  - Extract shared `useAuthForm` hook or `AuthForm` component

- [ ] **M12. page.tsx growing complexity** — Effort: **L**
  - File: `src/app/page.tsx` (1201 lines, 15+ useState, 10+ useEffect)
  - Consider extracting: `usePostLoginOrchestration()`, `useWelcomeScreen()`, `useLegacyMigration()`

- [ ] **M14. SettingsModal duplicates modalStyles** — Effort: **S**
  - File: `src/components/SettingsModal.tsx:400-406`
  - Import from `modalStyles.tsx` instead of local redefinition

### Sync engine robustness

- [ ] **H12. isDataEqual JSON.stringify order-dependent** — Effort: **M**
  - File: `src/datastore/SyncedDataStore.ts:57-69`
  - Use deep-equal or sort keys before stringify — prevents unnecessary syncs
  - No data loss risk (upserts are idempotent)

- [ ] **M7. SyncEngine timeout has no AbortController** — Effort: **M**
  - File: `src/sync/SyncEngine.ts`
  - 90s timeout resolves promise but orphaned request continues
  - Add AbortController to cancel underlying fetch

- [ ] **M9. Missing withRetry on single-entity fetches** — Effort: **M**
  - File: `src/datastore/SupabaseDataStore.ts`
  - `getTeamById()`, `updatePlayer()` fetch, `getTeamRoster()`, `getPlayerAdjustments()`, `getWarmupPlan()` lack retry
  - List operations have retry — inconsistent

- [ ] **H11. Game version cache stale after pushAllToCloud** — Effort: **M**
  - File: `src/datastore/SyncedDataStore.ts`
  - Clear game version cache per-ID after conflict resolution

- [ ] **H13. closeUserStorageAdapter() race condition** — Effort: **S**
  - File: `src/utils/storage.ts:396-423`
  - Should acquire `userAdapterCreationMutex` before close

- [ ] **M8. SyncQueue dedup race window** — Effort: **M**
  - File: `src/sync/SyncQueue.ts`
  - Concurrent enqueue() calls could bypass dedup
  - Low practical risk for single-user PWA

### Infrastructure

- [ ] **H1. verify-subscription bypasses upsert_subscription RPC** — Effort: **M**
  - File: `supabase/functions/verify-subscription/index.ts:403-408`
  - Uses direct upsert instead of RPC that has COALESCE null-protection

- [ ] **H3. .env.development has Supabase anon key in git** — Effort: **S**
  - File: `.env.development:12`
  - Move to `.env.local` (gitignored) or document as intentional

- [ ] **M3. FOR ALL policies missing explicit WITH CHECK** — Effort: **S**
  - File: `supabase/migrations/016_optimize_rls_policies_initplan.sql`
  - Add explicit `WITH CHECK ((select auth.uid()) = user_id)` for clarity

- [ ] **M5. No index on subscriptions.google_purchase_token** — Effort: **S**
  - Add index for idempotency check performance

- [ ] **M6. TypeScript types stale vs composite PK migrations** — Effort: **S**
  - File: `src/types/supabase.ts`
  - Regenerate with `npx supabase gen types typescript`

- [ ] **L7. Duplicate CORS/rate-limit code in Edge Functions** — Effort: **M**
  - ~90 lines duplicated between verify-subscription and delete-account
  - Extract to `supabase/functions/_shared/cors.ts`

### Auth improvements

- [ ] **M1. Sentry PII scrubbing** — Effort: **M**
  - File: `src/instrumentation-client.ts`
  - Add `beforeBreadcrumb` to filter auth data, reduce `tracesSampleRate` for production

- [ ] **M2. CloudAuthModal independent auth session** — Effort: **M**
  - File: `src/components/CloudAuthModal.tsx:164-194`
  - Consider using AuthProvider context or calling `resetSupabaseClient()` after signOut

### Additional test coverage

- [ ] **H-Tests. Several untested methods** — Effort: **L** (combined)
  - `saveAllGames` — delegation + partial failure
  - `getAllPlayerAdjustments`, `upsertPlayerAdjustment`, `updatePlayerAdjustment`
  - Concurrent sign-in prevention (`isSigningIn` flag)
  - `refreshSession` promise deduplication
  - AuthProvider `deleteAccount` and `acceptReConsent` flows
  - Session validation timeout path

- [ ] **M-Tests. Missing test files** — Effort: **L** (combined)
  - `DeleteBlockedDialog.tsx` — no tests
  - `importHelper.ts` — no tests
  - `ImportResultsModal` — limited tests
  - Factory cloud mode integration (documented as deferred)

### Cosmetic / documentation

- [ ] **M4. delete-account partial failure window** — Effort: **S** (doc only)
  - Data can be deleted but auth deletion could fail — document as known edge case

- [ ] **M11. migrationService leaked IndexedDB connection on error** — Effort: **S**
  - File: `src/services/migrationService.ts:700`
  - Add `finally` block to close datastores

- [ ] **L8. Verification test SQL has wrong column names** — Effort: **S**
  - File: `supabase/migrations/__tests__/013_014_composite_keys.verification.sql:76-79`
  - Remove non-existent `position` column from INSERT

- [ ] **L11. reverseMigrationService lacks crash recovery flags** — Effort: **S**
  - File: `src/services/reverseMigrationService.ts`
  - Add sessionStorage flags like migrationService has

- [ ] **L13. POLICY_VERSION may need bump** — Effort: **S**
  - File: `src/config/constants.ts:31`
  - Check if policies updated since 2025-01

- [ ] **L4-Auth. Password in React state in LoginScreen/AuthModal** — Effort: **S**
  - Files: `src/components/LoginScreen.tsx:59`, `src/components/AuthModal.tsx:69`
  - CloudAuthModal uses ref-based approach (safer) — consider aligning or documenting the difference

- [ ] **L5-Auth. Email validation missing max length check** — Effort: **S**
  - File: `src/auth/SupabaseAuthService.ts:176-181`
  - Add `if (email.length > 254) throw new AuthError('Email too long')` per RFC 5321

- [ ] **L6-Infra. Edge function rate limiting per-instance only** — Effort: **S** (doc only)
  - Both Edge Functions use in-memory `Map` — state lost on instance restart
  - Acceptable at current scale, consider Upstash Redis before scaling

- [ ] **L9-Infra. player_assessments.created_at uses bigint, all others use timestamptz** — Effort: **S** (doc only)
  - File: `supabase/migrations/000_schema.sql:353`
  - Intentional to match TypeScript `number` type — document as design decision

- [ ] **L1-Infra. Migrations use sequential numbering instead of timestamps** — Effort: **S** (doc only)
  - Works fine for single-developer, document as convention

- [ ] **L10-Data. SyncQueue stats 1-second TTL shows briefly stale counts** — Effort: cosmetic
  - File: `src/sync/SyncQueue.ts`
  - Deliberate performance optimization — no action needed

- [ ] **M10-Data. Timestamp comparison as string in conflictResolution** — Effort: **S**
  - File: `src/sync/conflictResolution.ts`
  - ISO 8601 string comparison works for same-precision timestamps
  - Could break if timestamps have different millisecond precision

- [ ] **M13-UI. Background hydration fire-and-forget with no cancellation** — Effort: **S**
  - File: `src/app/page.tsx:632-678`
  - Add `cancelled` flag pattern (already used elsewhere in file)

- [ ] **M4-UI. CloudSyncSection hasLocalDataToMigrate missing userId** — Effort: **S**
  - File: `src/components/CloudSyncSection.tsx:487`
  - Pass `userId` from auth context to check correct storage scope

- [ ] **M5-UI. useAutoSave setTimeout not cleaned up on unmount** — Effort: **S**
  - File: `src/hooks/useAutoSave.ts`
  - Store timeout IDs in ref, clear in cleanup

- [ ] **M6-UI. SubscriptionContext synchronous state update during render** — Effort: **S**
  - File: `src/contexts/SubscriptionContext.tsx:186-193`
  - Move user change detection to useEffect

- [ ] **M8-UI. StartScreen tagline hardcoded language check** — Effort: **S**
  - File: `src/components/StartScreen.tsx:113`
  - Uses `isEnglish ? '...' : '...'` instead of translation key

- [ ] **L1-UI. UpgradePromptModal debug logging in production** — Effort: **S**
  - File: `src/components/UpgradePromptModal.tsx:109-116`
  - Wrap in `process.env.NODE_ENV !== 'production'` or remove

- [ ] **L14-UI. useRoster local state can drift from React Query cache** — Effort: **M**
  - File: `src/hooks/useRoster.ts:14-17`
  - In cloud mode with background sync, players added from another device may not appear
  - Consider deriving from React Query cache directly

- [ ] **L4-UI. WizardBackdrop onClick on inner div instead of outer** — Effort: **S**
  - File: `src/styles/modalStyles.tsx:228-248`
  - Clicking ambient glow area doesn't dismiss wizard modals (inconsistent with DialogBackdrop)

- [ ] **L3-UI. SettingsModal verbose logging in hard reset handler** — Effort: **S**
  - File: `src/components/SettingsModal.tsx:707-712`
  - Change `logger.log` to `logger.debug`

- [ ] **L-Tests. MigrationWizard interrupted recovery UI never tested** — Effort: **S**
  - `wasMigrationInterrupted()` always mocked as false — add test for `true` case

- [ ] **L5-Infra. No deno.json for Edge Functions** — Effort: **S**
  - No import map or lock file — dependencies fetched at runtime
  - Adding deno.json would make builds more reproducible

- [ ] **M2-Infra. upsert_subscription RPC has no explicit GRANT** — Effort: **S** (doc only)
  - Works because service_role has superuser-like privileges
  - Add comment or explicit GRANT for clarity

- [x] **C1-UI. Division by zero in ImportResultsModal progress bar** — Effort: **S** *(fixed 2026-02-06)*
  - File: `src/components/ImportResultsModal.tsx:159-174`
  - When `getTotalProcessed()` returns 0, produces `NaN%` CSS width
  - Guard with zero check before rendering progress bar

---

## Verified Non-Issues

These were flagged by agents but confirmed as working correctly:

- **Personnel cascade delete**: Handled atomically by `delete_personnel_cascade` RPC in SQL — no app-level cascade needed in SyncedDataStore
- **SupabaseDataStore error handling pattern**: `throwIfTransient` + `result.error` check is correct — non-transient errors pass through to the second check
- **Timer state not synced**: Intentional — ephemeral high-frequency data stays local only
- **Client-side rate limiting**: Supabase has server-side enforcement — client-side is UX only
- **Session tokens in localStorage**: Standard Supabase pattern, mitigated by CSP + no UGC rendering

---

## Positive Findings

The review confirmed these strengths:
- All 19 SupabaseDataStore transform rules verified PASS
- Zero `dangerouslySetInnerHTML` usage (XSS vector eliminated)
- Service role key never in client code
- Defense-in-depth for mock billing (3 layers)
- Edge Functions properly verify JWTs
- Error message sanitization in auth components
- Comprehensive security headers (CSP, X-Frame-Options, COOP, CORP)
- SyncQueue tests exceptionally thorough (930 lines)
- RPC functions secure (SECURITY DEFINER, search_path, user_id override)
- Local-first architecture ensures zero data loss
