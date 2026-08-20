# New-user funnel fix - status & plan

**Goal:** stop new-install churn before spending energy on growth. Evidence shows
installs are lost at the front door, not to bugs.

**Status as of 2026-08-20:** Phase 1 (auth quick wins, #704) and **Phase 2 (guided
onboarding) complete** - all four Phase-2 PRs merged into `feat/new-user-funnel` (#705
engine, #706 Home steps, #707 match steps, #708 getting-started banner), each CI-green and
Claude-approved. Phase 4 investigated and found already-resolved (no live bug). A no-merge
PR of `feat/new-user-funnel -> master` is open for review. **Phase 3 (Google sign-in) is
deferred** - it needs a Google OAuth client created in Google Cloud + Supabase provider
config + real-TWA redirect testing, none of which are self-contained code changes; it will
be a separate follow-up. No real users yet, so phases are judged by whether the first-run
flow feels right, not by metrics.

**Branching model:** long-lived integration branch `feat/new-user-funnel` off master.
Each phase/PR is a sub-branch -> PR into `feat/new-user-funnel`, merged after CI green +
Claude review approves. The whole thing lands on master only when all phases are done and
tested. Plan + roadmap docs now live on the integration branch with the work (not master).

---

## The two walls (reframe, 2026-08-20)

Churn has two distinct causes, and early phases only addressed the first:

1. **The signup wall** - "give me your email before you see anything." Phase 1 softened
   it (opens on Sign Up, 8-char password); Phase 3 (Google sign-in) nearly removes it.
2. **The usage wall** - even after signup the app is a blank, powerful *tool*: empty Home,
   four tabs, no obvious first move. A coach has to infer "add players -> make a game ->
   go into it" with nobody guiding them. This is the bigger killer.

A coach wants the whole thing - a team, their competitions, games that roll up into real
stats. So the guided onboarding guides the *proper* setup and makes it frictionless, rather
than teaching a throwaway shortcut. Value first (reach a live game), structure second.

---

## Diagnosis (2026-08-11)

- **Sentry (production, 30 days):** no crash wall - 9 tiny issues, 1-5 events each,
  nothing systemic. Churn is **not** caused by crashes.
- **First-run audit:** the Play build is a stack of walls before any value is seen -
  account required with zero preview; the form defaulted to Sign In (Sign Up buried);
  a 12-char / 3-of-4-character password rule; a production email-OTP round-trip; GDPR
  consent; and then an under-guided empty screen.

**Guiding constraints for every phase:** fix the leak before growth; never reverse
cloud-only or reopen the local<->cloud migration; keep each PR small, reversible, its
own sub-branch into the integration branch.

**Sequence:** 1 + 4 (done) -> 2 (guided onboarding, the core) + 3 (Google sign-in).

---

## DONE

### Phase 1 - Auth quick wins  (PR #704, merged into `feat/new-user-funnel`, `8c43f1c9`)
- **Funnel opens on Sign Up** (`page.tsx` passes `initialMode="signUp"`; returning users
  get a "Sign in" link).
- **Softer password rule:** 12 chars + 3-of-4 types -> plain 8-char minimum, no
  composition (NIST 800-63B). Updated EN/FI copy, both fallbacks, the i18n error map, tests.
- **Upgrade modal:** no change needed (`isSubscriptionActive` always returns `true`).

The getting-started checklist was stripped out here (`b08a47c6`) and folded into Phase 2.

### Phase 4 - Delete-account bug  (investigated 2026-08-20 - already resolved, no code change)
Traced the full flow (edge function, `SupabaseAuthService.deleteAccount`, `AuthProvider`
wrapper, SettingsModal) - already hardened (session refresh, retry, 401/lost-response
classification, rate-limit fail-closed, full GDPR erasure). **Sentry: 0 delete-account
errors in 90 days.** Nothing to ship.

---

## TODO

### Phase 2 - Guided first-run onboarding  (the core; subsumes the old demo + checklist)
Attacks the **usage wall**. Guide the proper setup one action at a time, ending at a live
game. Never make the coach think.

**The flow (finalized):**
1. **Add your players** - to the master roster, so there's a squad to draw from.
2. **Create your team** - and assign those players to it (team assignment happens here).
3. **Create your first game** - the coach *actively chooses* the team from the selector
   (not pre-filled - they learn to pick it). Competition is a light optional beat here
   ("in a league or tournament? add it here or later"), not a required step.
4. **Enter the match** - the squad is auto-placed on the field (existing behavior).
5. **Start the clock.**
6. **Log a goal** - the stat updates in front of them.
7. **"You're coaching."** Done; never shown again.

This produces a properly team-linked game from game one (team stats work immediately).
Competition is deferred to stage 2 because a brand-new coach has none yet, so "including
it" would mean creating a season mid-flow before the first game - a detour whose payoff
(season rollup) only matters once there are several games, and it is re-linkable to any
game later (verified: GameSettingsModal edits `teamId`/`seasonId`/`tournamentId`
post-creation, so nothing is orphaned).

**Stage 2 - structure after the aha:** right after the tour, the recommended-setup /
getting-started checklist surfaces (group games into a season/competition), now motivated.
This is where old Phase 5 lives; it gets a real home, not the buried gear-sheet entry.

**Design principles:** one control spotlighted at a time; always skippable; shortest line
to a live game; EN + FI; works on the real TWA; keyed off a brand-new account without
re-triggering for returning users.

**Deferred - optional pre-signup demo skin:** the same tour on throwaway in-memory sample
data before signup, decided later. Not in scope for the PRs below.

### Phase 3 - Google sign-in
Google OAuth via Supabase - removes the password rules AND the email-OTP round-trip in
one move, shrinking the **signup wall** to a couple of taps. Auth-only, no storage impact.
Independent of Phase 2. Needs Supabase provider config + testing on the real TWA (OAuth
redirect).

---

## PR-chopped execution plan (2026-08-20, grounded in three code-recon passes)

All PRs target `feat/new-user-funnel`; each merges after CI green + Claude review approves.
When all are merged, open `feat/new-user-funnel -> master` and do **NOT** merge (loop CI +
review, stop when review-ready).

**Progress:** PR 1 (#705) ✅ merged, PR 2 (#706) ✅ merged, PR 3 (#707) ✅ merged, PR 4 (#708)
✅ merged - Phase 2 done. PR 5 (Google sign-in) deferred (external deps, see status above).
Master PR opened (no merge).

**Engine design.** The tour is a small **state machine**, not a fixed coachmark reel,
because the target controls live inside modals. Each step declares a target (DOM
`data-testid`/id to spotlight), copy, and an advance-condition (a predicate over existing
app state). It reuses the signals `checkAppState()` already computes - `hasPlayers`,
`hasTeam`, `hasTeamLinkedGame`, `screen`, timer running, goal logged - so it observes real
progress instead of intercepting buttons. The overlay locates its target by selector each
render and repositions; when the target's modal is closed it spotlights the control that
opens it.
- **Provider mount:** a client `GuidedTourProvider` in `page.tsx` at the `ModalProvider`
  boundary (~line 1399), so state survives the Home->match remount. `screen: 'start'|'home'`
  (page.tsx:67) drives a mutually-exclusive ternary; `HomePage` is `key={matchInstance}`-
  remounted on `enterMatch` (~1348), so tour state must live above it.
- **Overlay:** `createPortal(document.body)` (ModalPortal pattern) above `z-[60]`; reuse
  `useFocusTrap` + `useModalHardwareBack` (Android back = skip).
- **Completion:** persist `matchops_tour_completed_${userId}` (localStorage pattern from
  `matchops_recommended_setup_dismissed_*`); trigger on `isFirstTimeUser` (page.tsx:237).

**PR 1 - Tour engine.** GuidedTourProvider + spotlight overlay + step framework +
persistence + first-run trigger, proven end-to-end with a minimal welcome+done tour.
Tests. No app-control anchors yet.

**PR 2 - Home-half steps.** Steps: add players -> create team (assign players) -> create
game (coach chooses the team). Add `data-testid` to: roster Add Player
(`RosterSettingsModal.tsx:211`), Add Team (`TeamManagerModal.tsx:308`), Edit Roster/assign
(`UnifiedTeamModal.tsx:837`); team select already has `#teamSelectTop`
(`NewGameSetupModal.tsx:792`). Advance on `hasPlayers` -> `hasTeam` -> `hasTeamLinkedGame`.
Tests.

**PR 3 - Match-half steps.** Steps: enter match -> start timer -> log a goal -> done. Add
`data-testid` to: ControlBar timer button (`ControlBar.tsx:372`), TimerOverlay Start/Pause
(`TimerOverlay.tsx:304`), TimerOverlay goal button (`TimerOverlay.tsx:409`). Advance on
`screen==='home'`, timer running, goal logged. Tests.

**PR 4 - Stage 2: structure after the aha (subsumes old Phase 5).** Rework the
getting-started / RecommendedSetupCard into the post-tour second stage with a real home
(not the buried gear entry); add the light competition awareness beat at game creation.
Tests.

**PR 5 - Google sign-in (Phase 3).** "Continue with Google" via Supabase OAuth on the auth
screen + Google provider config on staging; client + tests. TWA OAuth-redirect
verification is manual (noted in the PR).

**Final - PR to master.** `feat/new-user-funnel -> master`. Do NOT merge. Loop CI + Claude
review. Stop when review-ready.

**i18n note.** New keys go in `public/locales/{en,fi}/common.json` + `src/i18n-types.ts`,
and bump both `expect(...).toBe(2761)` assertions (`i18n-validation.test.ts:414,544`) by
the number added.

---

## Measurement
No in-app analytics (by design) and no user base yet, so there is no "before" number.
Judge each phase by whether the first-run flow feels right on a real TWA install - can a
first-time coach reach a live game without being told how? Once there are users, watch
Play Console retention and reorder or stop at any phase.
