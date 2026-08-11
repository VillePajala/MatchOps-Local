# New-user funnel fix plan

**Goal:** stop new-install churn before spending energy on growth. Evidence shows
installs are being lost at the front door, not to bugs.

## Diagnosis (2026-08-11)

- **Sentry (production, 30 days):** no crash wall - 9 tiny issues, 1-5 events each,
  nothing systemic. Churn is not caused by crashes.
- **First-run audit:** the Play build is a stack of walls before any value is seen:
  account required with zero preview - form defaults to Sign In (Sign Up buried) -
  a 12-char / 3-of-4-character password rule - a production email OTP round-trip -
  GDPR consent - and then an under-guided empty screen. A casual installer bails
  long before reaching the (good) in-app helpers.

## Plan

**Sequence: 0 (Ville) -> 1 + 4 -> 2 -> 3 -> 5.** Each phase is its own branch/PR
(tested, lint, build, Claude review). Nothing here reverses cloud-only or reopens
the local<->cloud migration - the demo uses throwaway data; Google sign-in is
auth-only.

### Phase 0 - Baseline (Ville)
Pull Play Console retention / acquisition funnel: how many retain day 1 vs day 7,
and *when* people uninstall. The "before" number; day-0 drop confirms the wall.

### Phase 1 - Quick wins  (branch: feat/onboarding-quick-wins) - DONE, in review
- Default the production cloud funnel to **Sign Up** (returning users get a clear
  "Sign in" link). LoginScreen keeps `signIn` as its own default; page.tsx passes
  `initialMode="signUp"`.
- **Soften the password rule** to a plain 8-character minimum, no character-type
  requirement (NIST 800-63B; server policy is min 6, so client stays >= server).
- **Show the setup checklist to first-time users** (was gated off for exactly the
  people who need it).
- Upgrade-modal item dropped: `isSubscriptionActive` already always returns true
  (free sync for all), so the post-login upgrade modal can't fire. No change needed.

### Phase 4 - Fix delete-account bug
Sentry shows account deletion failing for some users (delete-account edge function
/ SupabaseAuthService path). Correctness + churn hygiene. Own PR.

### Phase 2 - Demo sandbox (try before signup)
An in-memory demo (seed team/games, banner, "sign up to save your team") so a coach
sees value before any account. Discarded on signup - no migration. Reuses existing
local mode + test fixtures. Fixes the "can't try it" wall and the "empty app" first
impression at once.

### Phase 3 - Google sign-in
Google OAuth via Supabase - removes the password rules AND the email-OTP round-trip
in one move. Auth-only, no storage impact. Needs Supabase provider config + testing
on the real TWA (OAuth redirect).

### Phase 5 - Guided empty-state polish
A light first-run pointer once the walls are down. Lowest priority.

## Measurement
No in-app analytics (by design). After each phase, watch Play Console retention over
a week or two and compare to the Phase 0 baseline; reorder or stop at any phase.
