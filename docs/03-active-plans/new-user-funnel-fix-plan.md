# New-user funnel fix - status & plan

**Goal:** stop new-install churn before spending energy on growth. Evidence shows
installs are lost at the front door, not to bugs.

## Onboarding v3 - APPROVED PLAN (owner, 2026-11-19) - read this first

Source: the 2026-11 review's onboarding plan (`review-2026-11/onboarding/FINAL-PLAN.md`,
decisions D1-D29), walked through with the owner one decision at a time, then reviewed
against a full mock of the path in the new navy style
(https://claude.ai/artifact/Y11CWhJ4RVtoQEJFUtMYEr). **Where this section and
FINAL-PLAN.md disagree, this section wins.** Builds on the app-wide redesign branch
(`feat/home-syke-refined`), not before it. Everything below is decided unless marked open.

### The path a new coach takes

1. **Welcome screen** (two-step sign-up; text agreed word for word):
   "Suunnittele, peluuta, kirjaa." · Pelisuunnitelma aina mukana · Ottelukello ·
   Kirjaa ottelutapahtumat · Tilastot kertyvät automaattisesti · [Luo ilmainen tili] ·
   Kirjaudu. Content block centred; the point list is a centred block with ticks in a column.
2. **Form screen:** form centred as today (`LoginScreen.tsx` `justify-center`) with a small
   logo above the title; note "Tilin ansiosta tietosi säilyvät, vaikka vaihtaisit puhelinta."
   "Ilmainen" shown (D9). One password field with show/hide; no confirm field on sign-up
   ("Set new password" keeps its confirm field, D26).
3. **Wizard:** team name; sport (Jalkapallo / Futsal); **age group, which suggests the
   format** - futsal: 7 and younger 3v3, 8-10 4v4, 11+ 5v5 (most teams); football (2027
   table): 7 and younger 3v3/4v4, to 10 5v5, to 13 8v8, then 11v11 - every format
   selectable (D10); period length from the same table, else 2 x 15, with "muuta" (D7);
   paste the player list (leading numbers stripped, D8). Last button: **"Valmis"**.
4. **"Milloin seuraava peli?"** - one short step: date + optional opponent; copy "Teemme
   pelille valmiin suunnitelman. Kaiken voi muuttaa myöhemmin."; button **"Tee
   suunnitelma"**. Only now are the game and its one-game plan created. **No placeholder
   game is ever created without this step** (supersedes D20). Date only, no time field.
   An empty opponent is saved as "Vastustaja" (en "Opponent").
5. **Plan screen** (title OPEN; mock shows "Peluutus"): the planner in compact mode for one
   game. In place: tap-to-swap two players incl. the keeper "Maalissa X · vaihda" (exists:
   `PlanFieldView.tsx`), "Sekoita uudelleen", date/length "muuta". Link **"Tarkempi
   muokkaus"** opens the FULL planner for this game as a layer; closing returns here with
   the changes. "Näyttää hyvältä" -> Home. No "Useita pelejä samana päivänä". No keeper
   question in the wizard (D12). The plan counts as seen when this screen opens; closing
   the app mid-planner lands on Home next time.
6. **Home (basic layout)**: next-game card "Seuraava peli · Peluutus valmis · 14 pelaajaa ·
   [Aloita ottelu] · Näytä peluutus · Jaa". "Näytä peluutus" opens the plan screen above;
   "Jaa" shares the plan as text. Without a next game: "Uusi ottelu".
7. **"Ketkä ovat paikalla?"** - one sheet for EVERY coach: tap the absent; that marks them
   absent for this game in the plan (`absentIds`), re-runs the suggestion and re-applies it
   to the game (line-up + squad; the absent player's game does not count as played).
   Before kick-off only. Entry points: Home card ("Aloita ottelu" on game day,
   "Merkitse poissaolijat" otherwise), inside the game before kick-off (match menu or a
   small banner), and the planner. If the line-up was edited by hand, warn first:
   "Kokoonpano tehdään uudelleen suunnitelman mukaan".
8. **Match:** opens on the PITCH in both layouts (D15; the stacked match view). Control
   capsule unchanged everywhere: five buttons, clock centred. Timer: persistent next-sub
   block without "Selvä" (D3c); at full time a clear "Viimeistele ottelu" (D3b). **Quick
   goal entry for everyone (D16):** "Maali meille" replaces "Kirjaa maali" on the timer;
   the score moves at once; then "Kuka teki?" with name buttons for ALL players in the
   game's squad (no "Muut" split - pitch/bench is only the starting line-up), "Ohita"
   (no scorer); optional assister step; the full form stays for editing. "Vaihto tehty":
   hidden in basic, renamed "Nollaa vaihtoajastin" in full (D13).
9. **"Viimeistele ottelu"** (name kept, D4; for ALL coaches): result + quick line-up/goals
   check -> amber **[Pöytäkirja]** -> **Otteluraportti** (coach's own text: template,
   dictate, AI draft) with a quiet visible **"Jaa"** at its bottom -> done. No step
   numbers (D3a). "Valmis" = squad selected + goal log matches the score, scorers optional,
   applied on read to all games after a count (D2).

### Outputs (C9, all coaches)

- **"Pöytäkirja"** (was "Pöytäkirja Tasoon"; `utils/tasoReport.ts`): unchanged content
  (squad with numbers, full names, keeper/captain; score + half-time + extra time; goals
  as minute #number name (assist)); "Kopioi". The word "Tasoon" leaves the app; buttons
  that really open the Taso website keep "Taso".
- **"Otteluraportti"** (`gameNotes`): unchanged.
- **Ottelukooste** (`utils/gameRecap.ts`: score/date/place, scorer+assist tallies, line-up
  by first name, + the whole otteluraportti): no standalone "Luo ottelukooste" button; the
  same text is the "Jaa" of the Otteluraportti section ("Jaa otteluraportti"). The word
  "ottelukooste" leaves the app.
- **Parents:** "Viesti vanhemmille" is never built. AI settings' "Teksti vanhemmille"
  (the AI-notes notice to families) is renamed "Tiedote perheille tekoälyn käytöstä".

### Copy rule

No fairness or equal-play claims in product copy ("reilu", "tasapuolinen", "kaikki
pelaavat"); fairness is the owner's value, not the app's promise. The copy says the app lets
you plan. The suggester's behaviour (every selected player gets time) is unchanged.

### First-use help (C11)

Remove the guided tour (`components/GuidedTour/*`), the Home welcome strips
(`startScreen.welcomeStrip*`) and every FirstVisitIntro note. Keep only "Näin se toimii"
(`InstructionsModal`), updated to the new flows. Add help back only where the milestones
show coaches getting stuck.

### Layouts, rollout, measurement

- Two layouts only: basic (Perusnäkymä) and full (Koko näkymä, today's app); no module
  switches (D21). Existing accounts keep the full layout (OD4), including the 6 with
  players but no game (D14).
- The basic layout goes live for new accounts **as soon as it is built** (D23).
- Milestone timestamps in the settings row (D17); no anonymous counter; one privacy-policy
  sentence; whether that bumps `POLICY_VERSION` is a legal call.
- New-game defaults for everyone (D6): team, all its players, previous settings; the four
  detail rules of D26 accepted. "Ei vielä pelattu" OFF by default in New Game for today/past dates, ON for future
  dates, and a game flips to played automatically the first time its timer starts.
- Separate small PR: the `home_view` drift (D22) - count first; nobody's view changes.
- No feature freeze (D29).

### Dropped (do not build)

"Vuorot" (starter/keeper turn tracking, D11); automatic next-game creation anywhere and the
"Milloin pelaatte seuraavan kerran?" question with its date chips (D28, Phase 4.1); the
basic layout opening on the clock (D15); module switches (D21); lapsed-coach outreach (D18,
not now); "Names first" before an account (D19, revisit only if sign-ups look low);
the three-game milestone note.

### Later / open

- **Google sign-in** via free Google brand verification (no Supabase Pro / custom domain for
  now); consent wording and policy version checked first (D25).
- **Plan screen title** (open).
- **One-game plan from New Game** without hiding the multi-game planner:
  `playing-time-fairness-and-planner.md` §10 item 5.
- Update the promo-video sign-up selector in the same PR as the sign-up copy (D27).
- After onboarding: match-ops.com review incl. the online guide (`site/content/guide`,
  13 articles x fi/en) and rebuilt promo videos.

**Status as of 2026-08-31 - ONBOARDING v2 DELIVERED. Master PR #709 is the whole
feature; validate CI + review only - the OWNER merges after phone testing.**
PRs 19-22 (#725, #726, #727, #728, #729) built, CI-greened, Claude-review-approved and
merged into `feat/new-user-funnel`: setup wizard (cloud-only, quiet skip, + round-1
polish), composed start screen + welcome strip (getting-started banner superseded),
FirstVisitIntro on 8 surfaces (store-fed, zero context imports - two CI rounds taught
that a leaf rendered by many hosts must import no contexts), and the marketing-prompt
re-gate (5s delay + no tour/wizard + first game exists). Tour demoted to opt-in
(gear -> Aloitusopastus + welcome-strip link). The paused-tour status below is history:

**Round 2 (owner phone test, delivered same day):** PRs 23-24 (#730, #731) merged: no
step-1 autofocus (keyboard covered the format chips), quiet back link, compact wordmark in
compose mode (strip overflow), FirstVisitIntro in the app-update visual language, "Linkita
kilpailuun" label fix, field intro below the field buttons, backup reminder downloads
directly (exportFullBackup deliveryMode), and the FORMATION CHOICE at game creation
("Muodostelma" select: Auto + presets for the current squad size, threaded to
buildAutoPlacement). #709 revalidated all-green + Approve after each round.

**Status as of 2026-08-26 - PAUSED (feature-complete, awaiting owner sign-off).**
Phase 1 (auth quick wins, #704) and **Phase 2 (guided first-run onboarding) are complete
and iterated through 13 owner phone-testing rounds** - PRs 1-18 all merged into
`feat/new-user-funnel`, each CI-green and Claude-review-approved. Phase 4 was found
already-resolved (no live bug). **Master PR #709 (`feat/new-user-funnel -> master`) is
open, all CI green, review Approve, synced with master (includes the #721 goalie/field
fixes) - NOT merged; the owner merges after a final satisfied test pass.** **Phase 3
(Google sign-in) is deferred** - it needs a Google OAuth client created in Google Cloud +
Supabase provider config + real-TWA redirect testing; none is a self-contained code
change. No real users yet, so phases are judged by whether the first-run flow feels right,
not by metrics.

**Why paused:** the base structure is judged right (owner, round 12-13); remaining work is
polish found by phone testing, not design. Work resumes with a test round on the preview.

**To resume:** (1) free the test account on staging (delete `vituscastor@gmail.com` via
the Supabase admin API - staging only, `uncyxrffqrloypgjalzz`); (2) test the preview
`match-ops-local-git-feat-new-user-funnel-ville-pajalas-projects.vercel.app` as a fresh
signup, or gear -> "Aloitusopastus" to re-run the tour on an existing account; (3) fix
findings as PR 19+ into `feat/new-user-funnel` (same loop: CI + Claude review, merge on
approve); (4) when satisfied, the owner merges #709 (it carries a release-notes entry -
re-date it to the merge day); (5) then Phase 3.

**Branching model:** long-lived integration branch `feat/new-user-funnel` off master.
Each phase/PR is a sub-branch -> PR into `feat/new-user-funnel`, merged after CI green +
Claude review approves. The whole thing lands on master only when all phases are done and
tested. Plan + roadmap docs now live on the integration branch with the work (not master).

---

## Onboarding v2 - decided direction (2026-08-31)

The guided tour (PRs 1-18) works but is the wrong PATTERN for a professional tool:
auto-launched step-by-step tours are the abandoned 2013-2018 idiom; modern pro tools use
empty states + contextual first-use education, and team-sport apps specifically use a
setup wizard at signup. Mockup: https://claude.ai/code/artifact/250a6877-a2c3-429a-b0d3-f77445172aa0

**Components (decisions locked with owner):**
1. **Setup wizard at first sign-in** - CLOUD/PLAY ONLY. Two steps, one-time: (a) team name
   + format 5v5/8v8/11v11; (b) rapid roster entry (name per row, Enter adds next). Creates
   REAL data via existing mutations, no demo data. Skip = QUIET text link ("Ohita, teen
   taman myohemmin"), not a button. Finish -> start screen with "Uusi ottelu" as hero.
2. **Start-screen task composition** - reorder, never hide. Signals already exist: no
   players -> "Lisaa pelaajat" hero; players, no team -> "Luo joukkue"; team, no games ->
   "Uusi ottelu"; all exist -> normal screen. Done steps show quiet check + count. One-time
   welcome strip carries the opt-in tour link.
3. **First-visit banners** - generic FirstVisitIntro component: 1-3 line highlighted note
   at the TOP of a surface, [Selva] dismisses forever (per-user localStorage keys, tour-flag
   pattern). Never a pre-modal gate. Surfaces: team form (the 3-step text), game setup,
   match view/field, timer overlay, goal dialog, stats, planner, seasons.
4. **Demotions** - tour auto-trigger OFF; tour intact behind gear -> Aloitusopastus + the
   welcome-strip link (all 18 PRs stay as the opt-in "show me" mode). Marketing-consent
   prompt re-gated: defer until wizard done AND first game exists. Getting-started
   banner/sheet (PR 4) superseded by the composed start screen.

**Build strategy - NOT from scratch:** StartScreen keeps its structure (it just got the
two-level restructure + dashboard); composition is conditional ordering on its existing
empty-state logic. New code = the wizard screen (reusing team/roster mutations) + the tiny
FirstVisitIntro. The tour is untouched apart from its trigger.

**Wizard test round 1 (owner, 2026-08-31, PR 19 on preview):** start "looking really
good". Findings for the polish pass: (1) steps 1-2 pack everything top with dead air
below - keyboard-safety reasoning is right (nothing interactive-while-typing below the
keyboard line) but the space needs composition (bigger wordmark, vertical rhythm, button
anchored lower); (2) THE find: Enter (invisible) does the frequent thing, Valmis (biggest
button) does the terminal thing -> coach adds one player and taps Valmis prematurely, and
pending-draft-counts makes it succeed silently. Fix: visible "+ Lisaa" commit button,
Valmis shows the count ("Valmis (3 pelaajaa)"), input PINNED under the hint with rows
growing below newest-first (oldest rows scroll behind the keyboard, harmless); (3) after
Valmis the plain start screen is an anticlimax - that seam is PR 20 (composed start
screen); alternative to weigh there: a third "Kaikki valmista" pane with Uusi ottelu
directly in the wizard. No banners/guidance after the wizard is BY DESIGN until PR 21.

**Execution:** continue on this branch so the auto-tour NEVER ships to prod; #709
eventually lands v2 as a whole. PR 19 wizard, PR 20 composition + welcome strip, PR 21
FirstVisitIntro + copy for 8 surfaces, PR 22 demote tour trigger + prompt re-gate. Same
loop: CI + Claude review, merge on approve, owner phone-tests on the preview.

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

**Progress:** PRs 1-4 (#705-#708) built the engine, Home steps, match steps and the
getting-started banner. PRs 5-18 (#710-#724) are the phone-testing iterations, each fixing
what the owner saw on a real device. Google sign-in (Phase 3) deferred. Master PR #709 open,
green, approved, not merged.

**What shipped in the iterations (PRs 5-18), so nobody re-litigates them:**
- *Guidance never drives the app.* No Next on action steps (the highlighted control is the
  way forward); Skip is labeled "Ohita opastus"; no close buttons injected into modals.
  The one exception is **Jatka** = `history.back()`, shown only when NOTHING in the
  step's tap chain is visible (a foreign surface covers it), gated so it can never close a
  live match (lifted-surface count vs a baseline: 0 on Start, 1 in a match).
- *Tap chains.* Each action step lists targets most-specific-first with a per-stage hint;
  the overlay spotlights the first one visible. `when(seen)` gates order coexisting form
  controls (team name while empty -> Muokkaa kokoonpanoa until its Valmis was shown ->
  Luo). A **covered higher-priority stage wins over a visible or offscreen later stage**
  (the sticky Luo bar used to make the chain skip the roster button).
- *Live signals.* Player/team counts come from the shared React Query cache
  (`GuidedTourRosterReporter`), match signals from orchestration
  (`GuidedTourMatchReporter`: timer running, goal logged, formation applied - counting
  REAL placements only). Steps advance the moment state changes, not on modal close.
- *Player goal, not gate.* Format chips 5v5/8v8/11v11 set the target (default 8); live
  counter; auto-advance at target or on closing the list with any players; explicit
  **"Seuraava vaihe"** early-out in the pill once >= 1 player exists.
- *Compact pills.* Form stages and ALL match stages are non-blocking pills (no dim, so
  the field and the running clock stay visible). Pills never pin to the bottom (phone
  keyboard) and carry a tiny x to dismiss the guide.
- *Match half.* create game -> **set formation** (new step) -> start clock -> log a goal
  (the goal dialog's own Kirjaa maali button is a guided stage) -> done.
- *Sequencing.* The tour starts as soon as the Start Screen is ready; the
  marketing-consent prompt DEFERS while a tour is active (provider hoisted to
  `layout.tsx`). Restart any time via gear -> "Aloitusopastus".
- *Visual identity.* Brand amber (logo color), not app indigo: pulsing glow ring,
  high-contrast pills, amber card accent.

**Known open polish (from the review nits, none blocking):** pill JSX is duplicated across
the two compact render branches; `set-formation`/`tour-confirm-goal` anchors are only
referenced as selectors (no test renders the real FormationPicker/GoalLogModal with the
tour). Fold in when those files are next touched.

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

### Baseline, 2026-11-13 (review item 2.1)
Production, read-only aggregate queries following review-2026-11/onboarding/PLAN.md §10.
- **Exclusions:** the owner's account is excluded.
- **Cohorts:** split at the SetupWizard's production date, 2026-09-04.
- **"Ran a match":** the clock ran or at least one event was logged.
- **3+ and 10+:** counted only for accounts at least 28 days old.

| Stage | Before wizard (35) | With wizard (10) |
|---|---|---|
| S1 accounts | 35 | 10 |
| S2 confirmed | 31 (89%) | 9 (90%) |
| S3 added players | 23 (74% of S2) | 7 (78%) |
| Set up team + players within 30 min of sign-up | 8 (23% of S1) | 7 (70%) |
| S4a created a game | 17 (74% of S3) | 7 (100%) |
| S4 ran a match | 10 (59% of S4a) | 3 (43%) |
| Second game 5-21 days after the first | 4 | 2 |
| S5 3+ played games (of mature accounts) | 6 of 35 | 0 of 8 |
| S6 10+ played games | 3 | 0 |
| Active in the last 30 days | 3 | 1 |
| Used the planner | 9 | 2 |

- **Accounts with only 1-2 games** (whether they ever ran a match):
  - before the wizard: 6 ran a match, 4 never did;
  - with the wizard: 2 ran a match, 3 never did.
- **How long accounts stayed active,** before vs with the wizard:
  - 0 days: 7 vs 4
  - 1-7 days: 2 vs 1
  - 8-30 days: 2 vs 2
  - over 30 days: 6 vs 0
- **Sign-ups per month:**
  - 2026: Feb 3, Mar 1, Apr 1, May 9, Jun 2, Jul 6, Aug 11, Sep 10, Oct 2, Nov 0 (so far).
- **Home view setting** (`home_view`): simple 19, not set 18, dashboard 2.

**Reading these small numbers:**
- **The wizard does its job.** Same-day setup rose from 8 of 35 to 7 of 10 accounts, and
  every wizard account with players created a game.
- **The leak moved later.** The losses are now between creating a game and running one
  (3 of 7), and between game one and game three (0 of 8 mature accounts so far).
- **Don't call this a regression yet.**
  - Ten accounts is too few.
  - The wizard cohort signed up in September and October, when the Finnish outdoor season
    ends, so fewer games were left to play. FINAL-PLAN §5.5 says to compare like with like.
- **The main open question is the drop in sign-ups:** October had 2 and November none so far.
  - The top of the funnel isn't measured: Play Console visitors and installs are still to be
    read by the owner.
  - Treat the decline as seasonal until those numbers show otherwise.
