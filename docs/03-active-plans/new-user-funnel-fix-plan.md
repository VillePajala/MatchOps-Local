# New-user funnel fix - status & plan

**Goal:** stop new-install churn before spending energy on growth. Evidence shows
installs are lost at the front door (the signup wall), not to bugs.

**Status as of 2026-08-12:** Phase 1 implemented and in review (PR #704, not yet
merged - paused by request). Phases 0, 2, 3, 4, 5 not started.

---

## Diagnosis (2026-08-11)

- **Sentry (production, 30 days):** no crash wall - 9 tiny issues, 1-5 events each,
  nothing systemic. Churn is **not** caused by crashes.
- **First-run audit:** the Play build is a stack of walls before any value is seen -
  account required with zero preview; the form defaulted to Sign In (Sign Up buried);
  a 12-char / 3-of-4-character password rule; a production email-OTP round-trip; GDPR
  consent; and then an under-guided empty screen. A casual installer bails long before
  reaching the (good) in-app helpers.

**Guiding constraints for every phase:** fix the leak before growth; never reverse
cloud-only or reopen the local<->cloud migration (the demo uses throwaway data;
Google sign-in is auth-only); keep each phase small, reversible, its own branch/PR.

**Sequence:** 0 (Ville) -> 1 + 4 -> 2 -> 3 -> 5.

---

## DONE

### Phase 1 - Quick wins  (PR #704, branch `feat/onboarding-quick-wins`)
Status: implemented, Claude review **Approved**, all CI green. **Not merged - paused.**

- **Funnel opens on Sign Up.** `page.tsx` passes `initialMode="signUp"` to the
  production LoginScreen; LoginScreen keeps `signIn` as its own default so other
  call sites and returning users are unaffected (they get a clear "Sign in" link).
- **Softer password rule.** 12 chars + 3-of-4 character types -> plain 8-character
  minimum, no composition (NIST 800-63B). Verified Supabase server policy is min 6 /
  no character rule on both staging and prod, so the client rule stays >= server.
  Updated EN/FI copy, both `passwordRequirements` fallbacks, and tests.
- **Setup checklist for first-timers.** `StartScreen` no longer hides the
  getting-started entry behind `!isFirstTimeUser`.
- **Upgrade modal:** no change needed - `isSubscriptionActive` already always returns
  `true` (free sync for all), so the post-login upgrade modal can't fire.

---

## TODO

### Phase 0 - Baseline  (Ville, not code)
Pull Play Console retention / acquisition funnel: day-1 vs day-7 retention and *when*
people uninstall. The "before" number; a day-0 drop confirms the wall. Needed to know
whether any of the fixes below actually move the needle.

### Phase 4 - Fix delete-account bug
Sentry shows account deletion failing for some users (delete-account edge function /
`SupabaseAuthService` path). Correctness + churn hygiene. Own PR.

### Phase 2 - Demo sandbox (try before signup)
An in-memory demo (seed team/games, banner, "sign up to save your team") so a coach
sees value before any account; discarded on signup - no migration. Reuses existing
local mode + test fixtures. Fixes the "can't try it" wall and the "empty app" first
impression at once.

### Phase 3 - Google sign-in
Google OAuth via Supabase - removes the password rules AND the email-OTP round-trip in
one move. Auth-only, no storage impact. Needs Supabase provider config + testing on
the real TWA (OAuth redirect).

### Phase 5 - Guided empty-state polish
A light first-run pointer once the walls are down. Lowest priority.

---

## Measurement
No in-app analytics (by design). After each phase, watch Play Console retention over a
week or two and compare to the Phase 0 baseline; reorder or stop at any phase.
