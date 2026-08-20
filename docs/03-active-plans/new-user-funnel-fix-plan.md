# New-user funnel fix - status & plan

**Goal:** stop new-install churn before spending energy on growth. Evidence shows
installs are lost at the front door, not to bugs.

**Status as of 2026-08-20:** Phase 1 (auth quick wins) merged into `feat/new-user-funnel`
(PR #704). Phase 4 investigated and found already-resolved (no live bug). Remaining work
reframed (see below) into **Phase 2 - guided first-run onboarding** (the core) and
**Phase 3 - Google sign-in**. No real users yet, so phases are judged by whether the
first-run flow feels right, not by metrics.

**Branching model:** long-lived integration branch `feat/new-user-funnel` off master.
Each phase is a sub-branch -> PR into `feat/new-user-funnel`. The whole thing lands on
master only when all phases are done and tested. Plan + roadmap docs live on master
(edited directly); phase PRs are code-only.

---

## The two walls (reframe, 2026-08-20)

Churn has two distinct causes, and early phases only addressed the first:

1. **The signup wall** - "give me your email before you see anything." Phase 1 softened
   it (opens on Sign Up, 8-char password); Phase 3 (Google sign-in) nearly removes it.
2. **The usage wall** - even after signup the app is a blank, powerful *tool*: empty Home,
   four tabs, no obvious first move. A coach has to infer "add players -> make a game ->
   go into it" with nobody guiding them. This is what makes people say "I don't get it"
   and leave, and it is the bigger killer.

Good apps/games never let a new user sit and wonder: one instruction at a time, do this,
now this, and a few steps later they "get it" without having thought about it. That is
the model for Phase 2. A demo/preview alone does **not** solve the usage wall - looking
at fake data is not the same as being guided - which is why the old "demo sandbox" and
"getting-started checklist" ideas are merged into one guided-onboarding phase below.

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
cloud-only or reopen the local<->cloud migration (any pre-signup demo uses throwaway
in-memory data; Google sign-in is auth-only); keep each phase small, reversible, its
own sub-branch/PR.

**Sequence:** 1 + 4 (done) -> 2 (guided onboarding, the core) + 3 (Google sign-in,
independent quick win).

---

## DONE

### Phase 1 - Auth quick wins  (PR #704)
Status: implemented, Claude review **Approved**, all CI green, **merged** into
`feat/new-user-funnel` (squash `8c43f1c9`).

- **Funnel opens on Sign Up.** `page.tsx` passes `initialMode="signUp"` to the
  production LoginScreen; LoginScreen keeps `signIn` as its own default so other
  call sites and returning users are unaffected (they get a clear "Sign in" link).
- **Softer password rule.** 12 chars + 3-of-4 character types -> plain 8-character
  minimum, no composition (NIST 800-63B). Verified Supabase server policy is min 6 /
  no character rule on both staging and prod, so the client rule stays >= server.
  Updated EN/FI copy, both `passwordRequirements` fallbacks, i18n error map, and tests.
- **Upgrade modal:** no change needed - `isSubscriptionActive` already always returns
  `true` (free sync for all), so the post-login upgrade modal can't fire.

The getting-started checklist was originally bundled here as a one-line visibility
toggle; it was stripped out (`b08a47c6`) and folded into **Phase 2** below, where
guidance is designed properly instead of just unhidden.

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

### Phase 2 - Guided first-run onboarding  (the core; subsumes the old demo + checklist)
Attacks the **usage wall**. Never make the new coach think: guide them one action at a
time along the shortest path to the one aha moment - **running a live game** - then let
go. Everything before that (roster, team, season) is setup friction the flow should
carry them through, not dump on them.

**Core = post-signup coached tour.** Replace the empty-Home dump with a step-by-step
coachmark flow, each step spotlighting exactly one control, skippable at any point:
1. "Let's add your first player" - the empty roster *is* the button; tap and type a name
2. "Add a few more, or skip" - one tap to move on
3. "Now create your first game" - pre-fill whatever we can
4. "Tap a player to put them on the field" - spotlight the field
5. "Start the clock" - spotlight the timer
6. "Tap to log a goal" - the stat updates in front of them
7. "That's it - you're coaching."

**Design principles:** one control spotlighted at a time; always skippable; empty-states
become the CTA ("No players yet -> Add your first player"); shortest line to a live game;
EN + FI; works on the real TWA. This replaces the buried gear-sheet checklist - the
checklist, if kept at all, becomes this flow's progress/re-entry point, not a separate
thing hidden behind the gear.

**Optional pre-signup skin (formerly "demo sandbox"), decided later:** the *same* tour
can run before signup on throwaway **in-memory** sample data (no IndexedDB, no cloud,
dies on reload), entered from a link on the Sign Up screen, with a persistent
"Demo - create an account to save your team" banner. Signing up discards the demo data
and starts a fresh cloud account (no migration - preserves cloud-only). The teaching
transfers even though the data does not. Build this only if the post-signup tour alone
doesn't clear the wall - the post-signup version activates *every* real user, so it is
the higher-value half and ships first.

**To settle before coding:** the coachmark/spotlight mechanism (existing in-app help
system vs a light custom overlay), the step-sequencing state (where "current step" lives
and how it survives navigation between Home and the game view), and how the tour keys off
"brand-new account" without re-triggering for returning users.

### Phase 3 - Google sign-in
Google OAuth via Supabase - removes the password rules AND the email-OTP round-trip in
one move, shrinking the **signup wall** to a couple of taps. Auth-only, no storage impact.
Independent of Phase 2 (can be built in parallel or either order). Needs Supabase provider
config + testing on the real TWA (OAuth redirect).

---

## Measurement
No in-app analytics (by design) and no user base yet, so there is no "before" number.
Judge each phase by whether the first-run flow feels right on a real TWA install - can a
first-time coach reach a live game without being told how? Once there are users, watch
Play Console retention and reorder or stop at any phase.
