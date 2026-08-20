# New-user funnel fix - status & plan

**Goal:** stop new-install churn before spending energy on growth. Evidence shows
installs are lost at the front door (the signup wall), not to bugs.

**Status as of 2026-08-20:** Phase 1 (auth quick wins) merged into `feat/new-user-funnel`
(PR #704). Phase 4 investigated and found already-resolved (no live bug). No real users
yet, so there is no retention baseline to measure against - phases are judged by whether
the funnel feels right, not by metrics. Phases 2, 3, 5 not started.

**Branching model:** long-lived integration branch `feat/new-user-funnel` off master.
Each phase is a sub-branch -> PR into `feat/new-user-funnel`. The whole thing lands on
master only when all phases are done and tested. Plan + roadmap docs live on master
(edited directly); phase PRs are code-only.

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
Google sign-in is auth-only); keep each phase small, reversible, its own sub-branch/PR.

**Sequence:** 1 + 4 (done) -> 2 -> 3 -> 5.

---

## DONE

### Phase 1 - Auth quick wins  (PR #704)
Status: implemented, Claude review **Approved**, all CI green. Re-targeted onto
`feat/new-user-funnel`; code-only (docs stripped). **Not merged.**

- **Funnel opens on Sign Up.** `page.tsx` passes `initialMode="signUp"` to the
  production LoginScreen; LoginScreen keeps `signIn` as its own default so other
  call sites and returning users are unaffected (they get a clear "Sign in" link).
- **Softer password rule.** 12 chars + 3-of-4 character types -> plain 8-character
  minimum, no composition (NIST 800-63B). Verified Supabase server policy is min 6 /
  no character rule on both staging and prod, so the client rule stays >= server.
  Updated EN/FI copy, both `passwordRequirements` fallbacks, and tests.
- **Upgrade modal:** no change needed - `isSubscriptionActive` already always returns
  `true` (free sync for all), so the post-login upgrade modal can't fire.

> The getting-started checklist was originally bundled here as a one-line visibility
> toggle. It was stripped out (commit `b08a47c6`) because the entry only lives in the
> gear sheet - buried for a first-timer - and an inline version pushes the primary
> actions below the scroll fold. It needs a designed home, so it moved to **Phase 5**.

---

### Phase 4 - Delete-account bug  (investigated 2026-08-20 - already resolved, no code change)
The premise was stale. Traced the full flow - `delete-account` edge function,
`SupabaseAuthService.deleteAccount`, the `AuthProvider` wrapper, and the SettingsModal
handler - and it is already exhaustively hardened from prior Sentry-driven iterations:
session refresh before the call, retry on transient network errors, explicit
401 / lost-response classification, rate-limiting fail-closed, and full GDPR erasure
(RPC -> auth user -> local mirror DB + sync-queue DB + backups DB, DataStore closed
first). **Sentry: 0 delete-account errors in 90 days** - the historical issues its own
comments reference no longer occur. No fix needed; nothing to ship.

---

## TODO

### Phase 2 - Demo sandbox (try before signup)
An in-memory demo (seed team/games, banner, "sign up to save your team") so a coach
sees value before any account; discarded on signup - no migration. Reuses existing
local mode + test fixtures. Fixes the "can't try it" wall and the "empty app" first
impression at once.

### Phase 3 - Google sign-in
Google OAuth via Supabase - removes the password rules AND the email-OTP round-trip in
one move. Auth-only, no storage impact. Needs Supabase provider config + testing on
the real TWA (OAuth redirect).

### Phase 5 - Getting-started + guided empty-state (designed properly)
The getting-started checklist needs a real home in the UI, not just an unhidden gear-sheet
entry. `StartScreen` is a fixed `h-[100dvh]` flex column with one `overflow-y-auto`
content area, so anything added competes with the logo, Home tabs, and action buttons -
which is exactly why the naive version fell below the scroll fold. Treatment options:

- **Slim banner** pinned above the Home tabs - one line ("Getting started 1/4 >"),
  always visible, opens the sheet. Minimal vertical cost.
- **Compact card** shown only on the empty Games tab, collapses once there is data -
  prime real estate exactly when a new coach needs it, gone once they don't.
- **Gear badge** - keep the entry in the gear sheet but add a dot/badge on the gear so
  first-timers notice it. Smallest change, least discoverable.

Plus a light first-run pointer once the walls are down. Mock a couple of the treatments
before building.

---

## Measurement
No in-app analytics (by design) and no user base yet, so there is no "before" number.
Judge each phase by whether the first-run flow feels right on a real TWA install; once
there are users, watch Play Console retention and reorder or stop at any phase.
