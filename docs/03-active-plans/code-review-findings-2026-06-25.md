# Full Review 2026-11 — Fix Checklist

**Status (2026-11-20):** ✅ **complete except three owner research tasks: 2.2, 2.3 and 2.5** (Step 2). Every fix item has shipped (PR numbers on each line, #893–#1051); the owner question at 4.34 was decided 2026-11-20 (the recorded kicks decide a shootout result; no change). Review completed 2026-11-11.
**How to use:** work top to bottom. Before implementing an item, discuss it: confirm it is still real, agree the fix, then implement with its test. One PR per item unless an item says otherwise.

**Source.** Five read-only review runs, plus the onboarding research.
- 171 findings, of which 4 were refuted.
- The remaining 167 are merged here into **119 fix items** (duplicates found by several reviewers are one item), plus owner tasks.
- 3 extra items came from the onboarding work: two bugs the planner depends on, and Supabase PITR.

**Verification labels.**
- "confirmed" / "plausible": an independent Fable 5.2 verifier tried to refute the finding against the code.
- "unverified (Sonnet sweep)": the i18n/docs/test sweep, where only high findings were verified. Re-check these before fixing.

**Raw evidence** (full scenarios, code quotes, verifier reasoning) is in `review-2026-11/` (local only, git-excluded). The flat list is in `review-2026-11/all-findings.json`.

**Related.** The onboarding/adoption plan, which runs alongside Steps 4–7, is in `review-2026-11/onboarding/FINAL-PLAN.md`. Mock-ups: https://claude.ai/artifact/7HCoabML7mSSmATML9XTYF

## Step 1 — Match-day bugs and safety (do now)

Bugs that hit active coaches every weekend, plus the two bugs the advisory planner itself depends on. Each is small; ship one PR per item.

- [x] **1.1** [high] ✅ *#893* Offline banner covers the whole screen and blocks every tap
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/app/page.tsx:1963-1967 (banner, direct child of body) + src/app/globals.css:40-44 (`body > div { height: 100%; display: flex; flex-direction: column }`); screenshots /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J3c/g1-match.png and g1-start.png
  - **What goes wrong:** Coach (cloud mode, which is every Play Store user) opens the app at a pitch with no signal more than about an hour after the last online use, or the app force-reloads after 5+ minutes in the pocket at half-time. The access token has expired and cannot be refreshed, so the app enters the offline grace period and shows the amber 'Offline - changes saved locally...' banner. Expected: a one-line banner at the top. Actual: the banner is 100% of the viewport high, 90% opaque amber, fixed at z-40 above the page, so the whole app is tinted orange and no button on the start screen or the match field reacts (New game, Continue, player discs, timer, menu). The coach cannot start or record the match until the connection comes back. The same happens after a 20 s auth timeout on a weak connection (grace trigger 2).
  - **Suggested fix:** Give the banner an explicit height that the global rule cannot override (e.g. `h-auto bottom-auto` plus `pointer-events-none`), or render it inside the existing wrapper div instead of as a direct child of body; better, narrow the global rule to the app root (`body > div:first-of-type` or a dedicated id). Add a test that the banner's height is below ~60px.
  - **Note:** Most urgent finding. One-line CSS fix; ship alone.
  - **Raw evidence:** `run3/J3-offline-multidevice.grace-banner-covers-and-blocks-whole-app`

  </details>
- [x] **1.2** [high] ✅ *#895* Coming back online mid-match swaps the match for a loading screen and drops the running clock
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/contexts/AuthProvider.tsx:705-719 (online handler sets isLoading=true and re-runs init); src/app/page.tsx:~850 (checkAppState effect keyed on isAuthLoading) and :1741 (showLoadingScreen unmounts the match); src/components/HomePage/hooks/useGameOrchestration.ts:1150-1171 (timer anchor consumed and cleared on first mount, correction kept only in a ref)
  - **What goes wrong:** Coach started the app offline (grace period), the match clock is running. The phone regains a bar of signal and the browser fires 'online'. Expected: the banner disappears and sync starts in the background. Actual: the whole match view is swapped for the full-screen 'Loading...' screen while auth re-initialises (about 2-5 s when Supabase is reachable, the full 20 s timeout when the signal is too weak to reach it, and again on every later online event). When the match view returns, the clock shows the value last written to the game record (00:00 in the test after 8-11 s of running time; the record is not updated while the clock runs), the timer is stopped (button reads 'Start'), and the stored game status went from inProgress back to notStarted. The coach has to notice, restart the clock and has lost the elapsed minutes, which also shifts playing-time totals. Any open dialog is closed as well.
  - **Suggested fix:** Do not set isLoading=true when leaving the grace period: re-validate the session in the background and keep the current tree mounted (the user id does not change). Independently, make the boot clock recovery survive a remount: clear the anchor only after the correction has actually been applied in loadGameStateFromData, not when it is read.
  - **Raw evidence:** `run3/J3-offline-multidevice.grace-exit-remounts-match-and-drops-running-clock`

  </details>
- [x] **1.3** [high] ✅ *#896* Fair-play card from one game is pre-set on the same player in every new game
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/HomePage/hooks/useGameOrchestration.ts:2008-2016; src/components/NewGameSetupModal.tsx:267,1056; src/components/HomePage/utils/newGameHandlers.ts:216-219,288
  - **What goes wrong:** The coach gives player X the fair-play card in Saturday's game. When the next game is created, its availablePlayers is copied from the master roster, where X still has receivedFairPlayCard=true. X already holds the card in the new game. Unless the coach notices it in Game Settings and moves or clears it, X gets one more fair-play card in playerStats (and in the per-game Excel sheets) for every game X plays until the card is next awarded to someone else.
  - **Suggested fix:** Clear receivedFairPlayCard on every player when building a new game's availablePlayers. Better still, stop writing the per-game award to the master roster at all.
  - **Raw evidence:** `run4/F-stats-exports.fair-play-carries-into-new-games`

  </details>
- [x] **1.4** [high] ✅ *#897* A failed roster refetch during a match wipes the live lineup and autosaves it
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/components/HomePage/hooks/useGameOrchestration.ts:489-516 (roster prune effect); src/utils/masterRosterManager.ts:18-28 and src/utils/masterRoster.ts:17-31 (errors become []); src/hooks/useGameDataQueries.ts:67-68 · src/hooks/__tests__/useRoster.test.tsx; src/components/HomePage/hooks/__tests__/useGameOrchestration.*.test.tsx
  - **What goes wrong:** A coach has the match open with a lineup placed and players selected. They switch apps and come back more than 5 minutes later. The masterRoster query is stale (staleTime 5 min, refetchOnWindowFocus true), so it refetches. The IndexedDB read fails transiently, which CLAUDE.md documents on mobile, or the DataStore reports NOT_INITIALIZED during a transition. getMasterRoster catches the error and resolves []. React Query's retry: 3 never runs because nothing was thrown, and [] is cached as success. diffRemovedRosterIds(prev = all ids, current = []) reports every player as removed, so the effect filters every player off the field and dispatches SET_SELECTED_PLAYER_IDS with an empty list. Autosave writes the game with no players on the field and none selected. On the next successful refetch the prune sees nothing removed, so nothing is restored. The coach finds an empty pitch and has to rebuild the lineup. If they don't notice, selection-based stats for that game are wrong.
  - **Suggested fix:** Make the roster query function throw on read failure, so React Query retries and keeps the last good data instead of caching []. In the prune effect, skip pruning when the new roster is empty but the previous one was not (or when more than a few players vanish at once), and prune only after a real removal (for example, have useRoster's remove path signal the removed id).
  - **Raw evidence:** `run4/G-orchestration-ui.live-roster-prune-on-swallowed-read-error`, `run5/L-test-quality.roster-refetch-failure-untested`

  </details>
- [x] **1.5** [high] ✅ *#898* Linking an existing game to a season/tournament rewrites its date, venue, period length, age group
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/GameSettingsModal.tsx:731-761 (season; date at :746-748) and :903-933 (tournament; date at :921-923). Screenshots: /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J4/shots/c1-after-season-pick.png, /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J4/shots/c2-home-after.png
  - **What goes wrong:** A coach played a game on 26.9. (2x20 min, away venue) without linking it to a league. Later they open the game, Menu > Match details > Link to competition > League, and pick the season. Expected: only the link changes. Actual: the game's date becomes the season's start date (1.5.), the venue name becomes the season's default venue while the old pinned address and coordinates stay, the period length becomes the season's (2x25), and age group and league are replaced. Nothing warns the coach; the date field is further down the same long form. Home then shows the game as played on 1.5. and it drops out of its place in the recent strip; date-based club-season stats, Excel, recap and the Taso text carry the wrong date. The same happens with a tournament (start date, venue, level, periods).
  - **Suggested fix:** In GameSettingsModal, do not prefill date, venue or period settings from the season/tournament for a game that already has them (at minimum: never touch gameDate; skip venue/period prefill when the game is played or has time on the clock). If the venue name is replaced, clear lat/lng/address as the new-game form does.
  - **Raw evidence:** `run3/J4-edit-propagation.J4-season-link-rewrites-played-game`

  </details>
- [x] **1.6** [high] ✅ *#899* Planned-sub prompt hides any sub that brings a starter back
  <details><summary>Details</summary>

  - **Verification:** verified
  - **Where:** src/hooks/usePlannedSubPrompts.ts:130-132
  - **What goes wrong:** A due planned sub is skipped when the incoming player is already on the pitch. Coaches do not move discs during play (owner decision: advisory planner), so every planned sub that brings a starter back silently never shows. The hook also returns only the earliest due sub, and its dismissal keys are never cleaned up.
  - **Suggested fix:** Suppress only when the incoming player is on the pitch AND the outgoing player is off; group subs due at the same time into one prompt; drop stored dismissals. See onboarding FINAL-PLAN (Phase 1, "Seuraava vaihto").
  - **Raw evidence:** onboarding check C1 (Fable), verified in FINAL-PLAN

  </details>
- [x] **1.7** [high] ✅ *#900* Plan suggester gives some bench players zero minutes
  <details><summary>Details</summary>

  - **Verification:** verified
  - **Where:** src/utils/playtimePlanner/suggest.ts:129
  - **What goes wrong:** `bench.slice(0, subTargets.length)` only rotates as many bench players as there are outfield slots, and all subs land at half time. 10 or 12 players in 5v5, or 16 in 8v8, leaves one or more children with 0 minutes and "1 pelaaja ilman peliaikaa". Contradicts the owner rule that every selected junior plays.
  - **Suggested fix:** Add k = ceil(bench/slots) sub windows so every selected player gets time; unchanged for small squads. Tests named in onboarding FINAL-PLAN (Phase 1, 1.6).
  - **Raw evidence:** onboarding concept judge (Fable), verified in FINAL-PLAN

  </details>
- [x] **1.8** [medium] ✅ *#901* Offline launch after an update fails: new service worker deletes the cached shell; "Reload to apply" deletes every cache
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** public/sw.js:82-98 (activate deletes every other matchops-* cache); public/sw.js:24-35 (precache list excludes '/' and all /_next chunks); src/components/ServiceWorkerRegistration.tsx:60-77 (internal releases and dismissed banners leave the worker waiting until the next launch); scripts/generate-manifest.mjs:119-131 (new CACHE_NAME per build) · src/components/ServiceWorkerRegistration.tsx:266-273
  - **What goes wrong:** 1) The coach opens the app at home while online. The 'initial' or visibility update check finds the newer sw.js, which happens after every deploy because CACHE_NAME is re-stamped on every build. The new worker installs and waits, either silently (internal release) or behind a banner the coach ignores or dismisses. 2) The app is closed or killed. 3) At the pitch with no signal, the coach launches the PWA/TWA. There are no clients, so the browser activates the waiting worker before it dispatches the navigation. Its activate handler deletes the old 'matchops-<prev>' cache, which held the cached '/' HTML and every JS/CSS chunk. 4) The navigation fetch fails offline. caches.match('/') misses because the new cache holds only STATIC_RESOURCES, so the SW serves offline.html ('Sovellusta ei voitu ladata'). 'Try Again' reloads into the same page. The coach cannot run the match offline until they get a connection, although the data is still in IndexedDB.
  - **Suggested fix:** Make offline readiness survive activation. At install, precache the app shell ('/' HTML) and the build's static chunks: emit a list of /_next/static files at build time (for example from the build manifest) and cache.addAll it. Then a newly activated worker can boot offline on its own. A cheaper option is to stop deleting the previous cache in activate until the new cache holds a '/' entry, and to fall back to any matchops-* cache in the fetch handler. Deleting old caches only after a successful online navigation under the new worker also works.
  - **Raw evidence:** `run4/J-pwa-perf.sw-activation-wipes-offline-shell`, `run4/J-pwa-perf.update-reload-deletes-all-caches`

  </details>
- [x] **1.9** [medium] ✅ *#902* Lazily loaded modals (New game, Load game, Stats, Roster, Settings, Planner…) fail offline
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/components/ClubModalsHost.tsx:73-85 (next/dynamic modals mounted only when open, e.g. :417 NewGameSetupModal); src/components/HomePage/containers/ModalManager.tsx:17,199 (GameStatsModal mounted only when open); public/sw.js:191-229 (chunks cached only on first use); src/app/page.tsx:1765,1946 (nearest ErrorBoundary is the app root / the whole HomePage) · src/components/ClubModalsHost.tsx:73-85 and :395-571 (next/dynamic modals rendered only when open); src/components/HomePage/containers/ModalManager.tsx:10,17,199; public/sw.js (runtime cache-first only for scripts, no precache of chunks, CACHE_NAME regenerated per build by scripts/generate-manifest.mjs:119-137); screenshot /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J3/offline-lazy.png
  - **What goes wrong:** After any update activates, whether at an online launch or through the banner's reload, the new cache holds only the chunks the boot actually requested. Modal chunks are fetched only when the modal is first opened. The coach drives to the field and is offline there, with the app still running or relaunched from the cached '/'. They tap 'New game'. NewGameSetupModal's chunk is not cached and the fetch fails, so the React.lazy rejection is thrown during render. ClubModalsHost sits only under the root ErrorBoundary, so the entire app is replaced by 'Something went wrong'. 'Try Again' re-renders the same lazy component, whose rejection is memoized, and it fails again. 'Refresh Page' reloads, and opening New Game fails again. The same happens mid-match when the coach opens the stats or wrap-up modal (GameStatsModal in ModalManager): the HomePage boundary unmounts the whole field and timer view during a live game. There is no chunk prefetch and no ChunkLoadError handling anywhere in src.
  - **Suggested fix:** Precache the build's chunk list at SW install (same fix as the activation finding), or warm the dynamic imports after boot, for example by calling each modal's import() in requestIdleCallback once the app is interactive. Also wrap lazy modals in a local boundary that catches ChunkLoadError and shows a 'needs connection' toast instead of unmounting the app or match view.
  - **Raw evidence:** `run4/J-pwa-perf.lazy-modal-chunks-offline-crash`, `run3/J3-offline-multidevice.lazy-modal-chunks-unavailable-offline`

  </details>
- [x] **1.10** [medium] ✅ *#903* Every offline cold start in cloud mode waits 20 s on the loading screen
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/contexts/AuthProvider.tsx:305-306 (getCurrentUser/getSession wait on a token refresh that cannot complete) and :636-668 (20 s safety timeout is what finally enters the grace period); src/hooks/useAppResume.ts:178-185 (force reload after 5 min background has no offline check)
  - **What goes wrong:** No signal at the pitch, access token older than its one-hour life. The coach opens the app, or returns to it after it sat in the background for more than 5 minutes while the clock was not running (before kick-off, at half-time). Expected: local data appears at once, as the offline banner promises. Actual: 'Loading...' for 20 seconds each time, because the grace period is only entered by the init timeout rather than by the failed refresh. At half-time this is 20 s of a 5-10 minute break, repeated every time the phone has been pocketed.
  - **Suggested fix:** When navigator.onLine is false (or the first refresh attempt fails with a network error) and a cached identity exists, enter the grace period immediately instead of waiting for the 20 s timeout. Skip the 5-minute force reload while offline.
  - **Raw evidence:** `run3/J3-offline-multidevice.offline-cold-start-20s-loading`

  </details>
- [x] **1.11** [medium] ✅ *#904* Clock reaching full time before the real match does cannot be continued
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/TimerOverlay.tsx:367 (Start disabled at gameEnd); src/hooks/useGameTimer.ts:46-93 (startPause has no gameEnd branch); src/components/GameSettingsModal.tsx:2049-2096 (period settings stay editable)
  - **What goes wrong:** A game is created as 2 x 20 (season default) but is played 2 x 25, or as 1 period instead of 2. At 40:00 the app declares 'Game over' while play continues. The coach corrects the period length or count in Match details, but the timer still says 'Game over' with Start disabled. The only control left is Reset, which sends the clock to 00:00 of period 1. Every later goal is stamped with the frozen full-time minute, or with minutes from a restarted clock. In the first-half version, after lengthening the period at the false half-time the only option is 'Start period 2', which jumps the clock to the new period boundary.
  - **Suggested fix:** When period length or count changes so that the current clock is below the new period/game end, move gameStatus back to inProgress (paused) so Start resumes; or offer 'Continue playing' at gameEnd/periodEnd.
  - **Raw evidence:** `run3/J2-match-day.J2-clock-ended-early-cannot-continue`

  </details>
- [x] **1.12** [medium] ✅ *#905* Match report being typed in the wrap-up is thrown away on close
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/GameStatsModal.tsx:285-289, :866-876 (report text is local state, written only by handleSaveNotes), :956-962 (Escape is guarded while editing, back is not); src/components/HomePage/containers/ModalManager.tsx:166 (hardware back -> toggleGameStatsModal)
  - **What goes wrong:** After the game the coach opens 'Viimeistele ottelu', taps the Otteluraportti box and types a paragraph. The small Tallenna button sits under the text box and is easily behind the keyboard. The coach presses back (first press hides the keyboard, second closes the modal) or taps the header close on desktop. The modal closes and the report is gone; reopening shows 'Ei muistiinpanoja'. Expected: the text is kept (saved or still in the editor) or the coach is asked.
  - **Suggested fix:** On close (any path) while isEditingNotes and the text differs from the saved report, save it, as the Save button would. Alternatively keep the draft across close/open, or make back leave edit mode first as Escape does.
  - **Raw evidence:** `run3/J5-navigation-interaction.match-report-lost-on-close`

  </details>
- [x] **1.13** [medium] ✅ *#906, #907; real-data files purged from git history 2026-11-12 (GitHub Support cache purge requested by owner)* Developer pages are served in production; a real-data backup sits in public/example_data
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** public/debug-state.html, public/clear-cache.html, public/demos/font-demo.html, public/example_data/MatchOpsLocal_Backup_20260127_101142.json (+ :Zone.Identifier)
  - **What goes wrong:** Anyone can open /debug-state.html (an IndexedDB inspector with buttons that mutate currentGameId/guide flags in the user's own IndexedDB), /clear-cache.html and /demos/font-demo.html on the production origin; all are git-tracked and served same-origin. public/example_data is gitignored (.gitignore:63) so a git-based Vercel deploy omits it, but there is no .vercelignore, so a CLI deploy or local `next build` bundles a 1.1MB backup containing real player names of a youth team. Roadmap 'stop publishing internal docs' covered only the docs site, not public/.
  - **Suggested fix:** Delete debug-state.html and demos/ from public (or gate to dev); move example_data outside public and anonymise; add .vercelignore for public/example_data.
  - **Note:** Move the backup out of public/ even though it is gitignored: it would ship with any deploy from the local folder.
  - **Raw evidence:** `run5/M-docs-drift.D1`

  </details>
- [x] **1.14** [high] ✅ *#908, #909: free nightly encrypted backup to R2 (EU) running since 2026-11-13; restore verified 2026-11-13 (every app table matched production). Owner decision 2026-11-13: keep this backup system until there is revenue to pay for Supabase Pro.* Production database has no point-in-time recovery
  <details><summary>Details</summary>

  - **Verification:** verified
  - **Where:** Supabase project aybjmnxxtgspqesdiqxd
  - **What goes wrong:** Other people's children's data sits on the free tier with no PITR. A bad migration or accidental delete cannot be rolled back.
  - **Suggested fix:** Upgrade prod to Supabase Pro (~25 EUR/month) and confirm PITR is on.
  - **Raw evidence:** product review rec. 19 / roadmap P0

  </details>

- [x] **1.15** [high] ✅ *#894 (next, source-map-js, fast-uri; zod v4 still open)* Dependency advisories fail the Security Scan on every PR (Next.js critical, source-map-js and zod high)
  <details><summary>Details</summary>

  - **Verification:** CI Security Scan on PR #893 (2026-11-11). `npm audit` reports 10 vulnerabilities: 1 critical, 2 high, 7 moderate.
  - **Where:** package.json / package-lock.json. next 16.3.8: image optimization RCE with SVG, Server Actions DoS, `use cache` RCE. source-map-js ≤1.2.1. zod <4.6.6; its fix is a breaking major bump.
  - **What goes wrong:** every PR's "All CI Checks Passed" is red. Exposure looks low: no SVG image config and no `use server` / `use cache` in src. It still needs patching.
  - **Suggested fix:** `npm audit fix` for the non-breaking updates in its own PR, with tests, build and lint; check zod separately (who depends on it, and whether 4.6.7 breaks anything).
  - **Raw evidence:** Security Scan log, PR #893

  </details>

- [x] **1.16** [low] ✅ *#910* Fair-play follow-up: clean stale roster flags and remove the dead setter
  <details><summary>Details</summary>

  - **Why:** since #896 the fair-play card is per-game only. Every roster-to-game copy strips the flag (`withoutFairPlayCard`).
  - **What is left over:**
    - Older app versions left `receivedFairPlayCard: true` on master/team roster rows, both locally and in Supabase (`received_fair_play_card`). They are inert, but a future copy path that skips the helper would leak again.
    - `setPlayerFairPlayCardStatus` (masterRoster.ts:264) and its wrapper (masterRosterManager.ts:123) are unused in production code.
  - **Suggested fix:**
    - A one-time idempotent cleanup that writes false on roster rows, or stop persisting the field on roster rows.
    - Remove the dead setter and its tests.
    - Check `SupabaseDataStore.ts:2937` (per-game rows fallback) and `migration.ts:176` (legacy copy).
  - **Raw evidence:** Claude review on PR #896

  </details>

## Step 2 — Measure and talk (owner tasks, little code)

Answers that may change Steps 3+ and the onboarding plan. Details in `review-2026-11/onboarding/FINAL-PLAN.md` (Phase 0).

- [x] **2.1** ✅ *Baseline recorded 2026-11-13 in new-user-funnel-fix-plan.md (Measurement); Play Console installs still to read by the owner* Split the production funnel by sign-up date before/after the SetupWizard (2026-09-04); read installs from Play Console
- [ ] **2.2** Write to the ~15 coaches who stopped after one or two games and ask why (Finnish draft in FINAL-PLAN)
- [ ] **2.3** Watch 1–2 coaches who have never seen the app set up and run a game on today's app
- [x] **2.4** ✅ *Captured 2026-11-13 on staging (prod build pointed at staging): review-2026-11/screens/cloud-wizard/ - sign-up, wizard team + players, finished Home, new-game form. Not captured: the email-code screen (staging auto-confirms). Seen: reopening mid-wizard restarts at step 1 with fields empty (nothing is saved until Valmis, so no duplicates); the new-game form after the wizard has no team pre-selected and 0/10 players ticked.* Capture the cloud SetupWizard screens on staging (never captured in the review)
- [ ] **2.5** Go through the open decisions (D1–D29 in FINAL-PLAN) and finalise the onboarding plan into the existing `new-user-funnel-fix-plan.md` (the older `onboarding-funnel-plan.md` is archived in `docs/08-archived/completed-active-plans/`), linked from UNIFIED-ROADMAP

## Step 3 — Data integrity: cloud, sync, sign-in/out

Silent data loss. Root-cause groups first; each fix lands with the test that would have caught it. Do before the April wave of new coaches.

- [x] **3.1** [high] ✅ *#914* Legacy/anonymous data is re-imported on every launch: deleted items come back, and another account gets a copy
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 4 findings
  - **Where:** src/services/legacyMigrationService.ts:219-300 (migrateLegacyData), :397; src/app/page.tsx:915-990 · src/services/legacyMigrationService.ts:290-305 (called from src/app/page.tsx:940) · src/services/legacyMigrationService.ts:205-305; src/app/page.tsx:916-991 · src/services/__tests__/legacyMigrationService.test.ts:20-22,223-325
  - **What goes wrong:** A coach used the app without an account (or imported a backup on the welcome screen, which writes to the anonymous store) and later signed in. On sign-in the anonymous data is copied into the user database and, in cloud mode, queued to the cloud. The anonymous database is never cleared or marked as consumed. (1) The coach deletes a game, player, season or team; on the next app launch the migration sees that id missing from the user store and writes it back, and in cloud mode pushes it up again. Deleted items reappear after every launch. (2) After 'Re-sync from Cloud' or 'Factory Reset' the user store is empty, so the run counts as a fresh migration: all the old pre-sign-in games and the old settings are written back with updatedAt = now and queued to the cloud, where they can replace newer cloud versions of the same games. (3) A second account signing in on the same browser receives a full copy of the first coach's anonymous data, pushed to that account's cloud. (4) In cloud mode the copy and upload happen regardless of what the coach picks in the migration wizard ('Not now').
  - **Suggested fix:** Record completion per user (for example a key in the user database, or a per-user localStorage flag set when the result is 'migrated' or 'already_migrated') and skip the migration afterwards. Also mark the anonymous data as consumed after the first successful migration (clear it, or stamp it with the owning user id) so a second account never imports it. Do not treat an emptied user store as a fresh migration once the flag is set.
  - **Note:** Fix the test that asserts the resurrecting behaviour as correct.
  - **Raw evidence:** `run1/A-local-storage.legacy-migration-reruns-every-launch`, `run1/D-auth-lifecycle.legacy-db-resurrects-deleted-data`, `run1/D-auth-lifecycle.legacy-db-imported-into-every-account`, `run5/L-test-quality.legacy-migration-test-codifies-bug`

  </details>
- [x] **3.2** [high] ✅ *#915* Migration wizard reappears after every sign-in and "Sync to Cloud" overwrites newer cloud data; "Discard local data" wipes the wrong store
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/app/page.tsx:1132-1172; src/services/migrationService.ts:445,1241,1427; src/contexts/AuthProvider.tsx:886-888 · src/app/page.tsx:1499-1505
  - **What goes wrong:** User migrated local data to cloud months ago and has edited games/players since. They sign out (signOut clears the migration-completed flag) and sign in again. The post-login check sees the user-scoped store has data and the anonymous store has a non-zero count, so it shows 'local data found' again. Tapping the primary 'Sync to Cloud' button uploads the months-old anonymous copies with unconditional upserts; every game/player/team with the same id in the cloud is replaced by the old version. The following hydration then sees cloud updated_at = now and overwrites the local mirror too, so the edits are lost on all devices.
  - **Suggested fix:** After a successful wizard migration mark the anonymous store as migrated (or clear it) so it is never offered again; in merge mode skip entities whose cloud updatedAt is newer than the local one.
  - **Raw evidence:** `run1/D-auth-lifecycle.wizard-reoffered-stale-overwrites-cloud`, `run1/D-auth-lifecycle.wizard-discard-clears-wrong-store`

  </details>
- [x] **3.3** [high] ✅ *#916* Deletions never reach other devices (hydration is add/update only)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/services/reverseMigrationService.ts:93-102,1700-1900
  - **What goes wrong:** (a) Coach deletes a game or player on the phone. The tablet keeps it forever, so season stats and exports on the tablet include a deleted game; if the tablet later saves that game (open + auto-save) it is re-created in the cloud and comes back on the phone. (b) Coach deletes a game offline; on the next online launch hydration can run before the queued delete is pushed, sees the game in the cloud and not locally, and writes it back locally; the delete then removes it from the cloud only.
  - **Suggested fix:** When the sync queue is empty, remove local entities that are absent from a successfully fetched cloud set (or add tombstones); skip any entity that has a pending queue operation.
  - **Raw evidence:** `run1/D-auth-lifecycle.hydration-never-propagates-deletes`

  </details>
- [x] **3.4** [medium] ✅ *#916, #917* Startup hydration overwrites local data without comparing timestamps or checking the sync queue
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 4 findings
  - **Where:** src/services/reverseMigrationService.ts:1779 (related: :1881, :1906, :1920, :1932; src/app/page.tsx:1071) · src/services/reverseMigrationService.ts:1917-1938; src/datastore/SupabaseDataStore.ts:2733-2767 (getSettings), :2845 (updatedAt carried but unused) · src/services/reverseMigrationService.ts:1779,1906,1920,1932 · src/services/reverseMigrationService.ts:1917-1927 (settings saved over local, includes currentGameId via src/datastore/SupabaseDataStore.ts:2805); src/components/HomePage/hooks/useGameOrchestration.ts:1150-1171 (timer anchor for another game id is discarded)
  - **What goes wrong:** Coach deletes a game (or an external-games adjustment) while offline and closes the app. On the next online start the background hydration and the sync engine run concurrently; if hydration fetches before the queued delete is pushed (several ops ahead of it, delete in backoff, or delete in 'failed' state), the entity is absent locally so it is written back. The delete then removes it from cloud, leaving a local-only zombie that counts in stats until deleted again. Separately, rosters, adjustments, warmup plan and settings are written unconditionally from a snapshot fetched seconds earlier, so a roster or settings change made in the first seconds after launch (for example picking a game, which saves currentGameId) is reverted locally while the queue still pushes the newer value; a second roster edit from the reverted state permanently drops the first.
  - **Suggested fix:** Before applying, read the queue and skip any entity that has a pending/syncing/failed op (and skip recreating entities with a queued delete); or wait for the queue to drain before hydrating. Apply the same timestamp guard to settings and rosters that the other entities use.
  - **Raw evidence:** `run1/B-sync.hydration-ignores-pending-queue`, `run1/C-supabase.hydration-overwrites-settings-and-warmup`, `run1/D-auth-lifecycle.hydration-unconditional-overwrites`, `run3/J3-offline-multidevice.current-game-pointer-replaced-by-cloud-value-on-reconnect`

  </details>
- [x] **3.5** [medium] ✅ *#918* A match opened before the launch-time pull keeps the stale copy and autosaves over the newer one
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/HomePage/hooks/useGameOrchestration.ts:1080-1097 (savedGames copied from the query only before initialLoadComplete) and :1452-1456 (loadedGameIdRef skips reloading the current game); src/app/page.tsx:1056-1068 (app released before hydration), :397-403 (live match auto-restored on launch), :1097-1112 (refetch only when games+players+teams were imported)
  - **What goes wrong:** The coach changes Saturday's line-up or logs a correction in game G on the tablet. On the phone G is the live game (in progress or at a period break), so launching the phone restores straight into the match view, or the coach taps 'Continue' within the first seconds. The pull from the cloud runs in the background and writes the tablet's newer G into the phone's storage a few seconds later, but the match view never re-reads it: the phone keeps showing the old line-up/score. The first change on the phone autosaves the old in-memory copy over the pulled one and queues it for upload, where the known retry override (run-1 sync-retry-defeats-optimistic-lock) lets it replace the tablet's version. Separately, when the pull brings only seasons, tournaments, personnel, external games or settings, no refetch is triggered at all (totalImported counts games, players and teams only), so Home lists stay stale until the next launch.
  - **Suggested fix:** After a hydration that updated the currently loaded game (and when no local edit is pending for it), reload that game into the session, or delay entering the match until the pull has finished when the device is online. Trigger the query refetch for any imported entity type, not only games/players/teams.
  - **Raw evidence:** `run3/J3-offline-multidevice.match-view-ignores-data-pulled-after-it-mounted`

  </details>
- [x] **3.5b** [medium] ✅ *#919* *(found while verifying #918)* Opening a match saves it even when the coach changes nothing, so a stale copy opened offline wins over a newer edit from another device
  <details><summary>Details</summary>

  - **Where:** src/components/HomePage/hooks/useGameOrchestration.ts (load normalisation: club-roster merge into availablePlayers) → src/components/HomePage/hooks/useGamePersistence.ts (useAutoSave short tier watches availablePlayers)
  - **What goes wrong:** Loading a game merges the club roster into its player list, which changes a watched field, so autosave fires right after mount with no user action. Offline, that save stays in the sync queue; on the next online launch the startup pull keeps the queued local copy (correct for real edits, #916) and the queue then pushes it, replacing a newer edit made on another device in the meantime. Reproduced on staging during #918 verification.
  - **Suggested fix:** Make load-time normalisation not count as a change (seed autosave's change baseline after normalisation, or persist the normalisation only together with the next real edit).

  </details>
- [x] **3.6** [high] ✅ *#920* A failed sync op replays its stale snapshot after a newer op for the same item has synced
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/sync/SyncQueue.ts:334 (related: src/sync/SyncQueue.ts:677, src/sync/SyncQueue.ts:866, src/sync/SyncEngine.ts:1087, src/sync/SyncEngine.ts:1350, src/services/reverseMigrationService.ts:1881)
  - **What goes wrong:** Flaky mobile network near the end of a match. Game save A (snapshot D1) is in flight ('syncing'). The coach logs the final goal / ends the game: enqueue skips the 'syncing' op, so a second op B (snapshot D2) is created. A fails (network error, 90s timeout, or Chrome Mobile abort) and goes back to 'pending' with lastAttempt=now, i.e. in backoff (1s+, or 2s for aborts). B has no lastAttempt, so the engine's immediate re-check picks B first and pushes D2. A then becomes ready and pushes D1 over it. No further edit follows, so cloud keeps the older state while the indicator shows synced. On the next app start hydration sees cloud updated_at (server time of A's replay) newer than local updatedAt (device time of B's local save) and overwrites the local game with D1: the last edit is gone on the device too. Same root with update-in-flight then delete: the delete syncs, the stale update replays, the game is recreated in cloud and hydration brings it back locally.
  - **Suggested fix:** When an op returns to pending (markFailed / resetOperationToPending) or just before executing it, look up the entity index; if a newer op for the same entityType+entityId exists, drop the older one (or collapse them keeping the newest data, preserving create/delete semantics). Alternatively have the executor read the current local entity instead of the stored snapshot for create/update.
  - **Raw evidence:** `run1/B-sync.stale-op-replay-after-newer-op`

  </details>
- [x] **3.6b** [low] *(found by the independent review of 3.6; pre-existing)* A superseded op that hits a conflict where the cloud copy wins writes that cloud copy over the newer local edit — ✅ #1023
  <details><summary>Details</summary>

  - **Where:** src/sync/conflictResolution.ts:349, :432 (writeToLocal) - the executor has no queue access to check `superseded`
  - **What goes wrong:** Op A (in flight) is superseded by op B. A hits a version conflict, the cloud copy wins, and writeToLocal stores it locally over the user's newer edit. B still carries the newer data and pushes it, so cloud gets the newer state while the device shows the older one until the next pull.
  - **Suggested fix:** Pass the queue (or a supersede check) to the executor and skip writeToLocal for a superseded op.

  </details>
- [x] **3.7** [high] ✅ *#921 (migration 055 on staging + prod)* Version conflict on game push is auto-overridden on retry, so a stale device wipes the newer cloud game
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/datastore/SupabaseDataStore.ts:3727 (related: src/datastore/SupabaseDataStore.ts:3844, src/sync/createSyncExecutor.ts:184, src/sync/SyncEngine.ts:1350, src/components/HomePage/hooks/useGameOrchestration.ts:1457)
  - **What goes wrong:** Coach prepares game G on the tablet, runs the match on the phone (all events pushed). Later the tablet is opened: it boots from its local pre-match copy; hydration runs in the background and updates local storage, but a match view that already loaded G is not reloaded (loadedGameIdRef guard), and a tablet that was not backgrounded 5+ minutes does not reload at all. Any edit there autosaves the stale in-memory game and queues a whole-game push. The push either conflicts once (PT409) and succeeds on the retry a second later, or does not conflict at all on a cold version cache. Cloud now holds the pre-match game; the phone's next hydration sees the newer cloud timestamp and replaces its full match record with it. Events, score and playing time are lost on both devices.
  - **Suggested fix:** Treat ConflictError in the executor as a real conflict: fetch the cloud game and compare with the op (e.g. cloud updated_at vs op.timestamp, or keep the richer event list), write the cloud copy locally when it wins, and never retry blindly with a re-fetched version. For the cold-cache case, pass the version the local copy was based on (store the last synced version with the local game) instead of whatever the cloud has now. Also reload the open game when hydration replaces it.
  - **Raw evidence:** `run1/B-sync.sync-retry-defeats-optimistic-lock`

  </details>
- [x] **3.8** [medium] ✅ *#922* Sync ops become permanently "failed" after ~10 minutes of bad signal and are never retried
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/sync/SyncQueue.ts:677 (related: src/sync/types.ts:239, src/sync/SyncEngine.ts:1350, src/sync/SyncEngine.ts:707)
  - **What goes wrong:** The coach's final save of a match (or a roster/player edit) is made where the phone reports online but requests fail. The op is retried with 1s..256s backoff and reaches maxRetries=10 within roughly 10-15 minutes, then is marked 'failed'. Back home on Wi-Fi, and after any number of app restarts, the op stays failed; only tapping retry in the sync UI or editing the same entity again revives it. Until then the cloud and any second device keep the old data.
  - **Suggested fix:** Do not count connectivity errors toward maxRetries (keep them pending with capped backoff), and/or reset failed ops whose last error was network-like on engine start, on the online event and on app resume.
  - **Raw evidence:** `run1/B-sync.failed-ops-never-auto-retried`

  </details>
- [x] **3.9** [medium] ✅ *#923* After an unexpected IndexedDB close, the sync queue and storage adapter never reopen (status still says "synced")
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/sync/SyncQueue.ts:243 (related: src/datastore/SyncedDataStore.ts:509, src/sync/SyncEngine.ts:493) · src/utils/indexedDbKvAdapter.ts:84-89, :139-146, :523; src/datastore/LocalDataStore.ts:472-477
  - **What goes wrong:** The browser closes the queue database mid-session (storage pressure, backing-store error). From then on every save writes locally but enqueue throws NOT_INITIALIZED; the user gets an error toast per save, the engine skips processing, and getStatus reports state 'synced' with zero pending. Reloading restores the queue, but the edits made meanwhile were never queued; because their local timestamps are newer than cloud, hydration skips them and they are never pushed unless each entity is edited again.
  - **Suggested fix:** Reopen the queue lazily in ensureInitialized/enqueue when db is null, report a non-synced state when the queue is unavailable, and on start reconcile local entities whose updatedAt is newer than cloud but have no queued op.
  - **Raw evidence:** `run1/B-sync.queue-db-closed-never-reopened`, `run1/A-local-storage.idb-terminated-adapter-never-recovers`

  </details>
- [x] **3.10** [medium] ✅ *#924* Transient network errors pause sync with a false "session expired" that never auto-resumes
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/datastore/SupabaseDataStore.ts:796 (related: src/sync/SyncEngine.ts:1238, src/sync/SyncEngine.ts:896, src/components/SyncStatusIndicator.tsx:156)
  - **What goes wrong:** Match in a hall with poor reception while navigator.onLine stays true. Every 5 minutes the user-id cache expires and the next push calls auth.getUser(), which fails on the network; this is thrown as AuthError('Session expired'). The counter is reset only by a successful op, so three such failures spread over 10-15 minutes pause the engine. When reception returns nothing clears the pause: the online handler, the 30s interval, nudges and app-resume all return early. The indicator shows 'Session expired - tap to sign in again' although the session is valid, and every later edit only queues until the user finds Sync now or the app is restarted.
  - **Suggested fix:** In getUserId treat retryable/network errors from getUser() as NetworkError (keep the cached id), and only raise AuthError for a definite auth response. In the engine, probe again after a cool-down or clear the auth pause on online/app-resume and on a token_refreshed/signed_in auth event.
  - **Raw evidence:** `run1/B-sync.auth-pause-sticky-on-transient-network`

  </details>
- [x] **3.11** [high] Signing out while offline does not sign out; the user is silently signed back in — ✅ #925
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/auth/SupabaseAuthService.ts:711-754; src/contexts/AuthProvider.tsx:505-508 · src/auth/__tests__/SupabaseAuthService.test.ts:483-510; src/contexts/__tests__/AuthProvider.test.tsx; src/hooks/useAppSettingsController.test.tsx
  - **What goes wrong:** Coach taps Sign out at a field with no connectivity (e.g. before handing a shared tablet back). The UI shows the login screen. But the session is still in localStorage and in the client: switching away from the app and back fires SIGNED_IN with that session and AuthProvider sets user/session again; a reload restores it too (init trusts the cached session on network error). The account and its local data are open again without a password, and sync resumes when online.
  - **Suggested fix:** On a failed sign-out, remove the stored session explicitly (delete the `sb-<ref>-auth-token` key and stop auto-refresh / recreate the client), and make onAuthStateChange ignore non-null sessions while isIntentionalSignOutRef is set. Do not log success without checking the returned error.
  - **Raw evidence:** `run1/D-auth-lifecycle.offline-signout-does-not-sign-out`, `run5/L-test-quality.signout-offline-and-account-deletion-local-wipe`

  </details>
- [x] **3.12** [medium] Sign-out uses global scope and signs the user out of all their devices — ✅ #926
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/auth/SupabaseAuthService.ts:724
  - **What goes wrong:** Coach uses phone and tablet. Signing out on the phone revokes every refresh token. Within an hour the tablet's token refresh fails, Supabase fires SIGNED_OUT, AuthProvider honours it and the tablet drops to the login screen, possibly mid-match. The same global sign-out runs after a password reset reload-cleanup (AuthProvider.tsx:289).
  - **Suggested fix:** Call `signOut({ scope: 'local' })` for the normal sign-out; keep global only for the completed password reset.
  - **Raw evidence:** `run1/D-auth-lifecycle.signout-is-global-scope`

  </details>
- [x] **3.12b** [low] *(found by the independent review of 3.12; pre-existing)* Cancelling the account-deletion window while offline leaves the re-authenticated session stored: `CloudAuthModal` cancel calls supabase-js `signOut` directly, so the 3.11 direct stored-session removal does not run. Fix: route it through `SupabaseAuthService.signOut()` or clear the stored session afterwards. — ✅ #1024
- [x] **3.13** [medium] No unsynced-changes warning on sign-out; previous user's sync engine keeps running; next user discards the pending changes — ✅ #927
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/datastore/factory.ts:451 (related: src/datastore/SyncedDataStore.ts:276, src/contexts/AuthProvider.tsx:864) · src/contexts/AuthProvider.tsx:858-943; src/components/StartScreen.tsx:1031; src/components/CloudSyncSection.tsx:290-325
  - **What goes wrong:** Shared club tablet. Coach A has pending or failed ops (offline edits, ops in backoff) and signs out; no pending-sync warning is shown (that modal exists only for switching to local mode). Coach B signs in without a reload, which force-closes A's store and clears A's queue. A's edits remain in A's local database only. When A later signs in on that tablet the queue is empty, hydration skips those entities because local is newer, the indicator shows synced, and the changes never reach the cloud or A's other devices.
  - **Suggested fix:** Do not clear a user-scoped queue on close (just close the connection) so the ops resume when that user returns, and show the existing pending-sync warning on sign-out when pendingCount or failedCount is above zero.
  - **Raw evidence:** `run1/B-sync.user-switch-clears-unsynced-queue`, `run1/D-auth-lifecycle.signout-no-pending-warning-engine-left-running`

  </details>
- [x] **3.13b** [low] *(found by the independent review of 3.13; risk made more likely by keeping each account's queue)* Queued non-game changes (players, teams, seasons, settings) that wait a long time on a device are last-write-wins: when that account signs in there again, a kept upsert can overwrite a newer edit made on another device, or bring back a player deleted there. Games are safe (base versions → cloud wins). Fix: for non-game upserts, compare the op's timestamp with the cloud row's `updated_at` and let the newer one win. — **Owner decision 2026-11-17: newer edit wins; a record deleted on another device stays deleted (no resurrection by a queued edit).** — ✅ #1041 (migration 059 on staging + prod)
- [x] **3.14** [high] Local-mode "Delete All Data" misses the signed-in user's database — ✅ #928
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/utils/appSettings.ts:396-435 (resetAppSettings); src/hooks/useAppSettingsController.ts:123; src/components/SettingsModal.tsx:1020
  - **What goes wrong:** A coach is signed in but in local data mode (reachable on the web: auth is independent of data mode, and the cloud-to-local reverse migration switches to local mode while leaving the user signed in). Their data lives in the per-user database matchops_user_{id}. In Settings, the danger zone shows the local-mode 'Delete All Data'. Confirming it clears the anonymous MatchOpsLocal database and all of localStorage (which also drops the auth session) and reloads. The app looks empty, but every game, player and assessment is still in matchops_user_{id}. Signing in again on that browser brings all of it back.
  - **Suggested fix:** In handleHardResetConfirmed, when a userId exists, also clear the user-scoped store (resetUserAppSettings(userId) or getDataStore(userId).clearAllUserData()) before clearing localStorage, or delete the user databases outright as account deletion does.
  - **Raw evidence:** `run1/A-local-storage.hard-reset-misses-user-db`

  - **Design note (2026-11-17, before implementing):** the cloud's `updated_at` on non-game rows is the PUSH time (`now()` in the Supabase upserts), not the edit time - so a plain "op timestamp vs cloud updated_at" check is wrong (an earlier edit pushed later would lose to an older edit pushed first). Needed: (1) store the edit time in the cloud (an `edited_at` column per non-game table, written from the app's `updatedAt`); (2) conditional writes per table (`ON CONFLICT ... WHERE edited_at <= EXCLUDED.edited_at`, migration-038 pattern) returning whether they applied, with the executor adopting the cloud row locally when refused (unless superseded, 3.6b); (3) a deletions record (tombstones: user, entity, id, deleted_at) so a queued update to a row deleted on another device is refused instead of re-inserting it. Tables: players, teams, team rosters, seasons, tournaments, personnel, settings, player adjustments, warmup plan. Migration 059+, staging first, independent review.
  </details>
- [x] **3.15** [low] Device-global leftovers survive sign-out and account deletion (AI key and consent, last replaced report, backup-reminder state, conflict backups) — ✅ #929
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 5 findings
  - **Where:** src/utils/aiProvider.ts:25-29; src/contexts/AuthProvider.tsx:858-943,1029-1117 · src/utils/aiProvider.ts:25-29, :131-135 (revokeAiConsent has no caller); src/contexts/AuthProvider.tsx:1062-1109 (account-deletion cleanup omits matchops_ai_*); src/components/AiSettingsCard.tsx:91-94 · src/utils/reportUndo.ts:21, :34-45, :48-62; src/contexts/AuthProvider.tsx:1062-1109 · src/utils/appSettings.ts:313-388 · src/datastore/SupabaseDataStore.ts:3806-3816, :5085, :5124-5145; src/contexts/AuthProvider.tsx:1071-1104
  - **What goes wrong:** Coach A connects their OpenAI key and accepts the AI consent gate, then signs out or deletes the account. Coach B signs in on the same device: Kirjuri shows as connected, B's transcription/drafting is sent under A's key and billed to A, and B never sees the consent gate. After account deletion the secret key remains readable in localStorage.
  - **Suggested fix:** Scope the key/consent/model keys by user id, and call revokeAiConsent() in deleteAccount (and on sign-out, or at least on a different user signing in).
  - **Raw evidence:** `run1/D-auth-lifecycle.ai-key-and-consent-not-account-scoped`, `run1/I-security-ai.ai-key-and-consent-survive-signout-and-account-deletion`, `run1/I-security-ai.report-undo-text-left-after-account-deletion`, `run1/A-local-storage.backup-reminder-state-shared-across-accounts`, `run1/A-local-storage.conflict-backups-in-shared-db`

  </details>
- [x] **3.16** [medium] Backup restore in cloud mode: failed pushes dropped from sync, failed cloud clear is silent, cloud clear skipped when not attached — ✅ #930
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 3 findings
  - **Where:** src/utils/fullBackup.ts:1183-1252 (warning text :1212, :1240; comment :1245-1249); src/datastore/SyncedDataStore.ts:1123-1125 (queue cleared), :1400-1545 (failures only recorded) · src/utils/fullBackup.ts:932-943 (failure only logged); src/datastore/SyncedDataStore.ts:1590-1611 · src/datastore/SyncedDataStore.ts:1591-1600; src/hooks/useAppSettingsController.ts:186-203; src/utils/fullBackup.ts:932-943
  - **What goes wrong:** A coach signs in on a new phone and restores the season backup over a weak connection (the code's own comments name Chrome Android AbortErrors as common here). The restore writes everything locally, then pushAllToCloud uploads item by item. Some games (or players, plans, adjustments) fail after their retries. The results modal says 'N items failed to sync to cloud (3 games). You can retry from Settings.' The coach opens Settings: 'Sync now' and 'Retry failed' have nothing to do, and the status reads synced. Those items now exist only on this phone. They never reach the cloud unless the coach happens to edit each one. On a second device, after a reinstall, or after 'Re-sync from Cloud', they are gone.
  - **Suggested fix:** After pushAllToCloud, re-enqueue a sync op for every id in summary.failures (or do not clear the queue entries for items that failed), so the engine retries them. Until that exists, change the message so it does not point to a retry that is not there, and translate it.
  - **Raw evidence:** `run3/J6-season-end.restore-cloud-push-failures-never-retried`, `run3/J6-season-end.restore-cloud-clear-failure-silent`, `run1/A-local-storage.cloud-clear-skipped-when-remote-not-attached`

  </details>
- [x] **3.17** [medium] "Download then delete cloud" verifies against a silently partial getGames result — ✅ #931
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/datastore/SupabaseDataStore.ts:3592 (getGames, partial return at 3563-3600); src/services/reverseMigrationService.ts:771 (downloadFromCloud), :581 (verifyReverseMigration(cloudData, ...)), :627 (clearAllUserData)
  - **What goes wrong:** A web user switches from cloud to local mode with 'delete cloud data'. During the game download the connection drops for roughly 15-20 seconds near the end of the batch loop (wifi to cellular handoff, tunnel) and comes back. The games in the affected batches fail their 4 attempts, fail again in the retry pass, and getGames returns the rest without throwing. The following calls (getAllPlayerAdjustments etc.) succeed through their own retries. saveToLocal stores the partial set, verifyReverseMigration compares local against the same partial snapshot and passes, the mode switches, and clear_all_user_data deletes everything in the cloud. The missing games are gone for good and the wizard reports success. The same silent truncation makes a fresh device hydrate with fewer games and no warning (that case heals on the next hydration).
  - **Suggested fix:** Have getGames expose the failed IDs (return them alongside the collection, or throw a typed PartialLoadError carrying the loaded games) and make downloadFromCloud abort when any game failed. Independently, before clearAllUserData compare the downloaded game count with an exact server count (select id, count: 'exact', head: true).
  - **Raw evidence:** `run1/C-supabase.partial-getgames-then-delete-cloud`

  </details>
- [x] **3.18** [medium] Clearing an external game's score or note never clears it in the cloud — ✅ #932
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/datastore/SupabaseDataStore.ts:4379-4394 (transformAdjustmentToDb), :4227 (upsertPlayerAdjustment); src/components/ExternalGamesSection.tsx:788-797; src/services/reverseMigrationService.ts:1903-1906
  - **What goes wrong:** A coach edits an external game and empties the score fields or the note. Locally the fields become undefined. The sync op calls upsertPlayerAdjustment, whose row has score_for/score_against/note set to undefined, so those keys are dropped from the JSON body and PostgREST only updates the columns present in the payload. The cloud row keeps the old score and note. On the next app start the background hydration writes every cloud adjustment over the local copy unconditionally, so the cleared score and note reappear on the same device, and the W/L/D result derived from the score (playerStats.ts:240) is shown again in the player's game log. Every other device shows the old values too.
  - **Suggested fix:** Write explicit nulls in transformAdjustmentToDb for score_for, score_against, fair_play_cards_delta, note and created_by (e.g. 'adjustment.scoreFor ?? null'), matching the other transforms. Add a round-trip test that clears each optional field.
  - **Raw evidence:** `run1/C-supabase.adjustment-upsert-omits-cleared-fields`

  </details>
- [x] **3.19** [low] Deleting a season/tournament leaves external-game rows pointing at it; re-push fails the cloud FK — ✅ #933
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/datastore/LocalDataStore.ts:1242-1256 (deleteSeason), :2529 and :2581 ('will be unlinked'); supabase/migrations/028_fix_composite_fk_set_null_columns.sql (player_adjustments_season_fkey / _tournament_fkey); src/datastore/SyncedDataStore.ts:1530-1541
  - **What goes wrong:** A coach deletes a season that only external games reference. The dialog says the adjustments 'will be unlinked', the cloud does that through ON DELETE SET NULL, but the local store keeps seasonId on those rows. If the coach edits one of those external games in the same session (the edit form sends the stored seasonId back), or runs a bulk push from Settings, the upsert carries the deleted season id and is rejected with 23503. The sync op ends up marked failed and the edit (goals, assists) never reaches the cloud; in the bulk push the adjustment is listed as a failure. It self-heals only after the next launch hydration copies the cloud row down, which also discards the unsynced edit.
  - **Suggested fix:** In LocalDataStore.deleteSeason and deleteTournament clear seasonId/tournamentId on the affected adjustments (mirroring the cloud SET NULL), and reuse the migrationService reference check in the SyncedDataStore bulk push.
  - **Raw evidence:** `run1/C-supabase.adjustment-dangling-season-fk`

  </details>
- [x] **3.20** [low] CREATE+DELETE cancellation ignores that the create may already have reached the server — ✅ #934
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/sync/SyncQueue.ts:442 (related: src/sync/SyncQueue.ts:526)
  - **What goes wrong:** A new game is created and its push is attempted; the server commits it but the response is lost (timeout, abort on backgrounding), so the op returns to pending as a 'create'. The coach deletes the game. Both ops are removed from the queue, no delete is sent, and the game stays in cloud. The next hydration brings the deleted game back onto the device.
  - **Suggested fix:** Only cancel when the create was never attempted (no lastAttempt and retryCount 0); otherwise replace it with a delete op, which is idempotent in the cloud store.
  - **Raw evidence:** `run1/B-sync.create-delete-cancel-after-attempt`

  </details>
- [x] **3.21** [low] Same-name staff member added on two devices leaves a permanently failing sync op — ✅ #935 (migration 056 applied to staging + prod)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** supabase/migrations/000_schema.sql:126 (personnel_name_user_unique UNIQUE (user_id, name)); src/sync/conflictResolution.ts handleMissingCloudRecord ('likely a name/unique collision; surfacing instead of acking'); src/datastore/SupabaseDataStore.ts:2716 (upsert on user_id,id only)
  - **What goes wrong:** The coach adds assistant 'Matti Meikalainen' on the phone at the pitch and, not seeing him on the tablet later (the tablet has not been relaunched), adds him there too. Each device generates its own id. The second upload violates the name constraint; the resolver finds no row with that id, retries, and the op ends up failed. The red indicator and 'operations failed - tap to retry' stay until the coach discards the failed op; games on that device keep pointing at a staff id that does not exist in the cloud.
  - **Suggested fix:** On a name collision for personnel, adopt the existing cloud row (remap the local id to it) or drop the database constraint in favour of the app-level check used for other entities; at minimum show which name collided.
  - **Raw evidence:** `run3/J3-offline-multidevice.same-name-personnel-on-two-devices-fails-forever`

  </details>
- [x] **3.21b** [low] *(found by the independent review of 3.21)* Teams, seasons and tournaments still have composite unique indexes (migration 011: `idx_{teams,seasons,tournaments}_composite_unique` on name + context). Two devices that create the same team/season/tournament (same name and context) while out of sync get different ids; the second upsert hits 23505 and the sync op fails forever, with that device's games pointing at an id the cloud never got - the 3.21 failure mode. Fix: drop the three indexes (app-level composite checks stay), verified on staging like 056. — ✅ #1025 (migration 058 on staging + prod)
- [x] **3.22** [medium] Backing out of "Set new password" leaves a flag that signs the user out on next launch — ✅ #936
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/contexts/AuthProvider.tsx:279-298,786,930; src/components/AuthForm.tsx:340-345
  - **What goes wrong:** User requests a reset, enters the code, then on the new-password screen taps back (remembered the password) and signs in normally. Everything works until the app is next opened: init finds `matchops-password-reset-in-progress`, calls service.signOut() (global) and forces the no-session path with the grace period skipped. The user lands on the login screen, also offline at a match, and other devices are signed out.
  - **Suggested fix:** Call setPasswordResetInProgress(false) wherever isPasswordResetFlowRef is reset to false (signOut and successful signIn/verifySignUpOtp).
  - **Raw evidence:** `run1/D-auth-lifecycle.password-reset-flag-left-set`

  </details>
- [x] **3.23** [medium] A failed or unfinished assessment load lets autosave overwrite stored ratings with an empty map — ✅ #937
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/hooks/usePlayerAssessments.ts:25-37; src/components/HomePage/hooks/useGamePersistence.ts:238, :579
  - **What goes wrong:** A coach opens a finished game that has player assessments. The assessments hook starts with an empty map and loads the stored ones asynchronously. If that read fails (a transient IndexedDB read failure on mobile, which the project already documents) the map stays empty and only an error flag is set. The autosave snapshot always includes `assessments: playerAssessments`, so the next autosave for any reason (editing notes, toggling a setting, the timer state flipping) saves the game with no assessments. Every assessment for that game is lost locally and the empty set is synced to the cloud. The same overwrite can happen if an immediate-tier autosave fires between mount and the load resolving.
  - **Suggested fix:** Track a loaded flag in usePlayerAssessments and, until it is true (and whenever the load failed), have the autosave snapshot carry the stored assessments forward (as is already done for isFriendly and captainId from savedGames) instead of the hook state.
  - **Raw evidence:** `run1/A-local-storage.assessments-wiped-after-failed-load`

  </details>

## Step 4 — Match session: undo, autosave, load, clock

Root cause: newer game fields are missing from the undo history sets, the autosave watch list and LOAD_PERSISTED_GAME_DATA. Bundle with onboarding Phase 1 PRs that touch the same code.

- [x] **4.1** [high] Undo back to the load baseline wipes team, shootout/overtime, tournament fields and the clock, then autosaves — ✅ #938
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/HomePage/hooks/useGameOrchestration.ts:1386-1429 (newHistoryState); src/components/HomePage/hooks/useGameSessionCoordination.ts:506-551 (applyHistoryState); src/hooks/useGameSessionReducer.ts:174-176 (LOAD_STATE_FROM_HISTORY spread)
  - **What goes wrong:** A coach reopens a saved in-progress tournament game (teamId, ageGroup, tournamentLevel, tournamentSeriesId set; maybe a recorded shootout). Opening it loads as notStarted, and RESUME_GAME pushes no history, so the first undo goes back to the baseline. The coach moves a player on the field, or logs a goal, and taps Undo (the 'Goal logged' toast offers it). applyHistoryState passes teamId, ageGroup, tournamentLevel, tournamentSeriesId, wentToOvertime, wentToPenalties, shootoutKicks, showPositionLabels, gameNotesAiMeta and timeElapsedInSeconds as explicit undefined, and the reducer spreads them over the live state. The short and immediate autosave tiers watch teamId, ageGroup, tournament fields, shootoutKicks and wentTo* and save the full snapshot, so the game is persisted without its team (dropping out of team-filtered lists and stats), without its shootout/overtime result (W/L changes), and without tournament level. If the clock was paused or not yet resumed, timeElapsedInSeconds becomes undefined: useGameTimer syncs stableStartTime to undefined, usePrecisionTimer falls back to startTime=0, and pressing Start (START_TIMER, since the baseline's gameStatus is the raw 'inProgress') restarts the match clock at 0:00 mid-game.
  - **Suggested fix:** Build the baseline from the same field list as buildGameSessionHistorySlice (or from the full gameData merged with the session slice) so every key applyHistoryState reads exists. Also make applyHistoryState skip keys that are absent from the history entry (`'teamId' in state`), so a partial entry can never blank a field.
  - **Raw evidence:** `run4/E-session-timer.undo-baseline-incomplete`

  </details>
- [x] **4.2** [medium] SET_SHOOTOUT_KICKS, SET_PLAYER_POSITIONS, APPLY_REPORT_DRAFT are in neither history set — ✅ #939
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 3 findings
  - **Where:** src/hooks/useGameSessionWithHistory.ts:31-102,169-180; src/hooks/__tests__/useGameSessionWithHistory.actionValidation.test.ts:24-76; dispatchers at src/components/HomePage/hooks/useGameSessionCoordination.ts:361,469 and useGameOrchestration.ts:1689 · src/hooks/useGameSessionWithHistory.ts:31-99; src/hooks/useGameSessionReducer.ts:120-121,140; src/components/HomePage/hooks/useGameSessionCoordination.ts:361,469; src/components/HomePage/hooks/useGameOrchestration.ts:1689; src/hooks/__tests__/useGameSessionWithHistory.actionValidation.test.ts:24 · src/hooks/useGameSessionWithHistory.ts; src/hooks/__tests__/useGameSessionWithHistory.actionValidation.test.ts (111 lines); src/hooks/__tests__/useUndoRedo.test.tsx
  - **What goes wrong:** Prod: the coach re-edits a recorded shootout with wentToPenalties already true (GameSettingsModal dispatches only SET_SHOOTOUT_KICKS), edits positions played in GameStatsModal (only SET_PLAYER_POSITIONS), or reverts an AI report draft (ReportDraftPanel calls onApply with noteEvents: [], so only APPLY_REPORT_DRAFT). No history entry is pushed. The next Undo reverts the previous action and also these edits, and Redo returns the pre-edit snapshot, so the kicks/positions/report text are gone. Autosave then persists the reverted values (shootoutKicks is in the immediate tier, so a changed shootout result can be saved). Dev: the effect throws 'Uncategorized action', which crashes the match tree whenever these handlers dispatch alone.
  - **Suggested fix:** Add the three actions to HISTORY_SAVING_ACTIONS. Derive the test's action list from the reducer union (for example an exported const array the type is built from) so a new action cannot slip past.
  - **Note:** Add an undo/redo test with the real reducer.
  - **Raw evidence:** `run4/E-session-timer.uncategorized-history-actions`, `run4/H-new-features.uncategorized-history-actions`, `run5/L-test-quality.useGameSessionWithHistory-no-behaviour-test`

  </details>
- [x] **4.3** [medium] Undo while paused rewinds the match clock — ✅ #940
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/HomePage/hooks/useGameSessionCoordination.ts:544 (timeElapsedInSeconds in applyHistoryState); src/hooks/useGameTimer.ts:177-181 (stableStartTime sync when not running); src/hooks/useGameSessionWithHistory.ts:78 (PAUSE_TIMER saves history)
  - **What goes wrong:** Period 1: a goal is logged at 08:00 (history entry, t=480). Play continues without other actions and the coach pauses at 19:30 for an injury (PAUSE_TIMER entry, t=1170). To fix something, the coach taps Undo. The undo pops the pause entry, so LOAD_STATE_FROM_HISTORY sets timeElapsedInSeconds=480 while isTimerRunning stays false (it is not restored). The useLayoutEffect syncs stableStartTime to 480, and on Start the precision timer counts from 08:00. The clock is 11.5 minutes behind, the period ends late, and the next event-triggered autosave persists the rewound clock. While running, the next tick hides this. While paused, nothing corrects it.
  - **Suggested fix:** Treat the match clock as non-undoable: drop timeElapsedInSeconds (and isTimerRunning/startTimestamp) from applyHistoryState, or keep the live value when gameStatus/currentPeriod are unchanged. Consider making PAUSE_TIMER a no-history action, since undoing a pause is not meaningful.
  - **Raw evidence:** `run4/E-session-timer.undo-rewinds-paused-clock`

  </details>
- [x] **4.4** [low] Undoing a sub confirmation does not restore the next-sub-due time — ✅ #941
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/HomePage/hooks/useGameSessionCoordination.ts:537-539 (applyHistoryState) and 267-307 (history slice); src/hooks/useGameSessionReducer.ts:442-462 (CONFIRM_SUBSTITUTION), 404-418 (SET_TIMER_ELAPSED); src/components/HomePage/hooks/useTimerManagement.ts:130-133
  - **What goes wrong:** Sub interval is 5 minutes and the sub is due at 10:00 (alert 'due'). The coach mis-taps 'sub made' at 10:05 (nextSubDue becomes 15:05) and immediately taps Undo on the 'Substitution logged' toast. lastSubConfirmationTimeSeconds and completedIntervalDurations revert, but nextSubDueTimeSeconds stays 15:05, so the next tick recomputes subAlertLevel as 'none'. The sub that is still owed shows no reminder until the warning at 14:05. After a reload the value is recomputed as lastSub+interval (10:00), so the UI disagrees between sessions.
  - **Suggested fix:** In LOAD_STATE_FROM_HISTORY, recompute nextSubDueTimeSeconds = lastSubConfirmationTimeSeconds + subIntervalMinutes*60 and the alert level, as LOAD_PERSISTED_GAME_DATA does.
  - **Raw evidence:** `run4/E-session-timer.undo-sub-confirm-silences-reminder`

  </details>
- [x] **4.5** [low] Undo of a venue change reverts the name but keeps the new pin/address/pitch — ✅ #942
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/HomePage/hooks/useGameSessionCoordination.ts:267-307 (buildGameSessionHistorySlice) and :506-552 (applyHistoryState); src/hooks/useGameSessionWithHistory.ts:49-51
  - **What goes wrong:** The coach picks a different venue in Game Settings, which dispatches SET_GAME_LOCATION and SET_LOCATION_COORDS, both history-saving, and then taps Undo in the control bar. The history slice never captures fieldNumber, locationLat, locationLng or locationAddress, and LOAD_STATE_FROM_HISTORY merges over the current state. Undo therefore restores the old venue name but leaves the new venue's coordinates and address. 'Check on map', the Home directions link and the departure estimate then point at the new venue while the name says the old one, and autosave persists that pair. The modal code says the name and pin 'can never disagree on a saved game'.
  - **Suggested fix:** Add fieldNumber, locationLat, locationLng and locationAddress to buildGameSessionHistorySlice and to applyHistoryState (and to newHistoryState in loadGameStateFromData, which already has them).
  - **Raw evidence:** `run4/G-orchestration-ui.undo-splits-venue-name-from-pin`

  </details>
- [x] **4.6** [medium] Opening a game re-saves it: travel/arrival settings erased, stored status altered — ✅ #943 (re-save on open already fixed by #919)
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 4 findings
  - **Where:** src/components/HomePage/hooks/useGamePersistence.ts:631 (autosave enabled before the game is loaded); src/hooks/useAutoSave.ts:190-216 (change detection); src/components/HomePage/hooks/useGameOrchestration.ts:1446-1490 (async load after enable) · src/components/HomePage/hooks/useGamePersistence.ts:195-262 (createGameSnapshot); related src/app/page.tsx:1615-1628 (handleAdjustTravel), src/utils/homeSummary.ts:380-419, src/datastore/LocalDataStore.ts:1869-1875, src/datastore/SupabaseDataStore.ts:3122-3123 · src/components/HomePage/hooks/useGamePersistence.ts:216-250; src/app/page.tsx:1615-1623; src/datastore/LocalDataStore.ts:1869-1875 · src/hooks/useAutoSave.test.ts; src/components/HomePage/hooks/__tests__/useGamePersistence.test.tsx
  - **What goes wrong:** The coach taps a game on Home or in Saved games only to look at it. Within about two seconds the app writes the whole game back at least twice, with a new updatedAt. Three things follow. (1) The arrival buffer and measured drive time set on the Home card are gone, so Home falls back to the default departure time; run 4 reported this loss as needing an edit, but opening alone is enough. (2) A paused in-progress game is stored as 'notStarted', so the next cold launch lands on Home instead of in the match. (3) In cloud mode every view queues a full push of this device's copy with the newest timestamp. On a second device whose local copy is older (offline, or opened before background hydration finishes), viewing the game can replace the newer cloud version under the last-write-wins rules already reported in run 1. The coach expects that looking at a game changes nothing.
  - **Suggested fix:** Do not arm autosave until the loaded game has been applied: gate `enabled` on loadedGameIdRef matching currentGameId and the load having committed, and set the three tier baselines from the first post-load render. Separately carry arrivalBufferMinutes and travelMinutes over in createGameSnapshot, and persist the real gameStatus rather than the load-coerced one.
  - **Note:** Add an autosave field-coverage test.
  - **Raw evidence:** `run3/J2-match-day.J2-opening-a-game-rewrites-it`, `run4/G-orchestration-ui.autosave-drops-per-match-travel`, `run4/H-new-features.travel-fields-dropped-by-autosave`, `run5/L-test-quality.autosave-field-coverage-untested`

  </details>
- [x] **4.7** [low] AI-report provenance (gameNotesAiMeta) dropped on load and erased by the next autosave — ✅ #944
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/components/HomePage/hooks/useGameOrchestration.ts:1236-1278 (payload); src/hooks/useGameSessionReducer.ts:520; src/components/HomePage/hooks/useGamePersistence.ts:208-218 · src/components/HomePage/hooks/useGameOrchestration.ts:1236-1278 (LOAD_PERSISTED_GAME_DATA payload); src/hooks/useGameSessionReducer.ts:520,592; src/components/HomePage/hooks/useGamePersistence.ts:218
  - **What goes wrong:** The coach applies an AI-drafted report (gameNotesAiMeta={model, packet} is saved), then later reopens the game and changes anything. The load payload omits gameNotesAiMeta, the reducer stores undefined, and the next autosave writes the full snapshot with no meta (game_notes_ai_meta = null in cloud). The record of which text came from an AI draft is silently lost.
  - **Suggested fix:** Add `gameNotesAiMeta: gameData.gameNotesAiMeta` to the load payload (and to the history baseline).
  - **Raw evidence:** `run4/E-session-timer.ai-meta-dropped-on-load`, `run4/G-orchestration-ui.ai-notes-provenance-dropped-on-reload`

  </details>
- [x] **4.8** [medium] Any note on a fixture marks it played permanently (phantom 0-0 draw) — ✅ #945 (matches already wrongly promoted stay played; coach can toggle)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/utils/matchPlayedDefault.ts:61; src/components/HomePage/hooks/useGamePersistence.ts:228; src/components/HomePage/hooks/useGameOrchestration.ts:1618; src/components/GameStatsModal.tsx:1073
  - **What goes wrong:** A coach opens Saturday's fixture on Thursday, which is booked ahead and so has isPlayed=false. In the match's stats/notes step they type or dictate a pre-match note, such as 'their #9 is fast, double up'. The GameNoteComposer and the mic have no gameStatus gate, so the note is saved as a gameEvents entry of type 'note'. On the next autosave, `isPlayed: isPlayed || hasBeenPlayed(state)` becomes true because `gameEvents.length > 0`. The fixture disappears from the Home next-match card, because buildHomeSummary requires isPlayed === false. It also shows in the recent strip and the Vuosi record as a 0-0 draw that never happened. If the coach flips 'not played' back in Game Settings, the next autosave promotes it again for as long as the note exists. A spoken summary saved as a note, or AI-drafted player notes, have the same effect.
  - **Suggested fix:** In hasBeenPlayed, count only result-bearing events (goal, opponentGoal, substitution and similar) and never 'note'. Better still, ignore events and rely on the clock and the scoreline.
  - **Raw evidence:** `run4/H-new-features.note-promotes-fixture-to-played`

  </details>
- [x] **4.9** [medium] "Not played yet" on a game with clock time is undone by the next autosave — ✅ #946 (accepted edge: a past note-only game marked not played is re-promoted)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/GameSettingsModal.tsx:2110-2119 (toggle) vs src/components/HomePage/hooks/useGamePersistence.ts:228 (isPlayed: isPlayed || hasBeenPlayed(...)). Screenshots: /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J4/shots/b2-unplayed-toggle.png, /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J4/shots/b3-switch-after-autosave.png
  - **What goes wrong:** A coach wants a game out of the record (clock started on the wrong fixture, a test run, a game recorded against the wrong entry). In Match details they switch on 'Not played yet'. It is saved: Home's season record changes (4-2-1 became 3-2-1) and the game leaves the recent list. Then any change in the match that autosaves (a field toggle, a note, a score fix) silently writes isPlayed back to true. The game is back in the record and stats, but the switch in Match details still shows 'Not played yet' until the game is reopened. The coach believes the game is excluded and it is not. Related to the known run-4 finding 'note promotes fixture to played' (same OR at :228); this is the user-facing toggle being overridden for any game with elapsed time or events.
  - **Suggested fix:** Let an explicit coach choice win: store that the coach set isPlayed by hand (or only auto-promote on the transition where time/events first appear), or disable the switch with an explanation when the game has time or events.
  - **Raw evidence:** `run3/J4-edit-propagation.J4-unplayed-toggle-reverts`

  </details>
- [x] **4.10** [medium] Resetting the clock while paused or at a break is not saved — ✅ #947
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/HomePage/hooks/useGamePersistence.ts:542-577 (immediate tier watches isTimerRunning but not gameStatus, currentPeriod or the clock); src/hooks/useGameSessionReducer.ts:464-486 (RESET_TIMER_ONLY)
  - **What goes wrong:** Before kick-off the coach starts the clock by mistake (or to try it), pauses it, and taps Reset and confirms. The timer shows 00:00 and 'Start'. The phone is then locked for more than five minutes during warm-up (the app force-reloads when no clock is running), or the coach goes to Home and back. The match now shows the old time, and tapping Start at kick-off resumes from it instead of starting period 1 at 00:00. The same happens when Reset is used at half-time or after full time. The fixture is also left stored as played, so it counts as a 0-0 draw until a result is logged.
  - **Suggested fix:** Save explicitly in the reset handler (useGameTimer.reset or its caller), or add gameStatus and currentPeriod to the immediate tier. Consider letting a reset to 0:00 with no events clear the played promotion.
  - **Raw evidence:** `run3/J2-match-day.J2-reset-after-pause-not-saved`

  </details>
- [x] **4.11** [medium] Reopening the running match from Saved games rewinds the clock and pauses it — ✅ #948 (visit-another-game-then-back left for 4.20)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/hooks/useLoadGameController.ts:113-123 (clearTimerState + clearTimerAnchor for any picked game); src/components/HomePage/hooks/useGameOrchestration.ts:1154-1171 (boot consumes and clears the anchor even when it belongs to another game)
  - **What goes wrong:** During a half the coach leaves the match for Home (Home button or Android back) and returns through 'Saved games' by picking the same match, instead of the 'Continue' card. The clock comes back at the value of the last save (the last goal, sub confirmation or period start, possibly many minutes ago) and is paused; nothing says so. If no save had happened since kick-off it shows 00:00, and Start begins period 1 again. Opening a different game while the clock runs and then returning has the same effect, because booting the other game clears the first game's recovery anchor.
  - **Suggested fix:** In handleLoadGame skip clearTimerState/clearTimerAnchor when gameId equals the anchor's gameId (or the current game id). In the boot path clear the anchor only when it was consumed for the booted game or is older than the period it belongs to. Optionally save the running clock when the match unmounts.
  - **Raw evidence:** `run3/J2-match-day.J2-reopen-running-match-drops-clock`

  </details>
- [x] **4.12** [medium] Changing Home/Away after a shootout flips its result — ✅ #949
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/hooks/useGameSessionReducer.ts:210-228 (SET_HOME_OR_AWAY swaps the scores but not shootoutKicks[].team); src/utils/gameResult.ts (resolveGameResult); src/components/ShootoutModal.tsx:68-69
  - **What goes wrong:** A tournament game ends level and the coach logs the shootout, which the team wins 2-1. At wrap-up the coach notices the game is set to Home but they were Away, and switches it in Match details. The goals and score swap sides correctly, but the kicks stay on their old sides: the shootout line now reads 1-2, named shooters appear as the opponent's kicks, and the game counts as a loss on penalties in the record, stats, recap and Excel.
  - **Suggested fix:** In SET_HOME_OR_AWAY, when the side changes, also map each kick's team to the other side. Longer term store kicks as 'us'/'opponent' like goal events.
  - **Raw evidence:** `run3/J2-match-day.J2-home-away-toggle-flips-shootout`

  </details>
- [x] **4.13** [low] Sub-due time differs after a reload — ✅ #955 (owner: last sub + interval)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/hooks/useGameSessionReducer.ts:421-441 vs 571-574
  - **What goes wrong:** The last sub was confirmed at 05:00. At 06:40 the coach changes the interval from 5 to 7 minutes, and SET_SUB_INTERVAL sets the next due time to ceil(401/420)*420 = 07:00. The app then reloads (for example a force-reload after more than 5 minutes in the background while paused) and LOAD_PERSISTED_GAME_DATA recomputes due = 05:00 + 7:00 = 12:00. The reminder the coach was expecting at 07:00 now fires at 12:00, or the other way round.
  - **Suggested fix:** Use one rule in both places, for example lastSubConfirmationTimeSeconds + interval in SET_SUB_INTERVAL, or persist nextSubDueTimeSeconds.
  - **Raw evidence:** `run4/E-session-timer.sub-due-diverges-after-reload`

  </details>
- [x] **4.14** [low] ✅ *#899 (stored dismissals removed)* Dismissed planned-sub prompts come back after the app is killed
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/hooks/usePlannedSubPrompts.ts:63-80, :100-110 (dismissals kept in sessionStorage)
  - **What goes wrong:** In a plan-based game the coach has acknowledged the 10:00 and 15:00 planned subs with 'Got it'. The OS kills the app (low memory or battery) and the coach reopens it from the launcher. The clock recovers, but the timer again shows the oldest planned sub as due, for any incoming player who is not on the pitch at that moment (for example one who has since been rotated off, or a sub the coach chose to skip). Each has to be dismissed again before the current prompt appears.
  - **Suggested fix:** Keep dismissed prompt ids in localStorage or with the game's planned-sub record, and clear them when the game is deleted or the plan is re-applied.
  - **Note:** Becomes moot if 1.6 removes stored dismissals.
  - **Raw evidence:** `run3/J2-match-day.J2-planned-sub-dismissals-session-only`

  </details>
- [x] **4.15** [low] Editing a goal logged while paused shows fractional time — ✅ #950
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/GameStatsModal/hooks/useGoalEditor.ts:42-46 (formatTime does not floor seconds), :94-110 (strict MM:SS check)
  - **What goes wrong:** The coach pauses the clock (the paused time is fractional, for example 610.09 s) and logs a goal, or adds a forgotten goal while paused. Later, in the wrap-up goal list, they open that goal to change the scorer. The time field is prefilled with a long decimal, and Save answers 'Invalid time format' until the time is retyped by hand.
  - **Suggested fix:** Floor the seconds in useGoalEditor.formatTime (or reuse utils/time formatTime), and store whole seconds for event times.
  - **Raw evidence:** `run3/J2-match-day.J2-stats-goal-edit-fractional-time`

  </details>
- [x] **4.16** [medium] Last assessment edit lost if the modal closes within 0.8 s — ✅ #951
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/PlayerAssessmentCard.tsx:47-57 (800 ms debounced autosave, cleared on unmount without a flush)
  - **What goes wrong:** The coach rates the last metric for a player, or finishes a note, and immediately presses back or Valmis. The modal closes; the last value or the end of the note was never saved. Next time the card shows the older rating. Nothing indicates that a change was dropped. Expected: everything shown when the modal closes is saved.
  - **Suggested fix:** Flush the pending save in the effect cleanup / on unmount (keep the latest values in a ref and call onSave if they differ from the last saved snapshot), or flush from the modal's close handler.
  - **Raw evidence:** `run3/J5-navigation-interaction.assessment-last-edit-lost-on-quick-close`

  </details>
- [x] **4.17** [medium] Kick-off time and period length typed in Match details are lost on back — ✅ #952
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/GameSettingsModal.tsx:620-646 and :1889,:1906 (commitGameTime on blur), :2076-2094 (period duration on blur); same pattern src/components/SettingsModal.tsx:764 (default team name) and src/components/TimerOverlay.tsx:318 (opponent name)
  - **What goes wrong:** Before kick-off the coach opens Ottelun tiedot, changes the period length from 25 to 30 (or types the minutes of the kick-off time) and presses back while the cursor is still in the field. On a phone the header X is hidden, so back is the normal way to close. The modal closes and nothing is saved: the clock still runs 25-minute periods and the Home card still shows the old time. When the coach reopens Match details it shows 30 and the new time, because the modal kept its local text, so the screen and the stored game disagree until the page reloads. Expected: the value the coach typed is applied when the modal closes.
  - **Suggested fix:** Commit pending field values in the modal's close path (call commitGameTime and the period commit from closeGameSettingsModal / when isOpen turns false), and re-seed the local text from props on every open so the modal can never show something that was not saved. Apply the same to the Settings default team name and the timer overlay opponent name.
  - **Raw evidence:** `run3/J5-navigation-interaction.blur-commit-fields-dropped-on-back`

  </details>
- [x] **4.18** [medium] Back while recording a shootout closes the overlay and loses the kicks — ✅ #953 (back = cancel; keeping kicks on back is an owner decision)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/ShootoutModal.tsx:46,:62,:101-104 (working copy, saved only by Tallenna; Escape only, no hardware-back registration); opened from src/components/HomePage/containers/FieldContainer.tsx:411-430 and src/components/GameSettingsModal.tsx:2227
  - **What goes wrong:** The game goes to penalties. The coach opens the timer overlay -> Jatkoaika / Rangaistuslaukaukset -> Rangaistuslaukaukset and taps Maali/Ohi after each kick. Mid-shootout they press back (edge swipe, or wanting to cancel; on a phone the X is hidden). Nothing visible happens, because back closed the timer overlay hidden behind the shootout. A second back sends them to Home; every recorded kick is gone and the game is not marked as decided on penalties. Opened from Match details instead, one back closes both and loses the kicks. Expected: back closes the shootout (ideally keeping or confirming the kicks) and never leaves the match while it is open.
  - **Suggested fix:** Register the shootout with useHardwareBackSubLevel(isOpen, ...) and store kicks as they are entered (or save on close), since the screen itself says to record each kick as it happens.
  - **Raw evidence:** `run3/J5-navigation-interaction.shootout-kicks-lost-on-back`

  </details>
- [x] **4.19** [low] Opening a match from a Home card opens the previous game when persisting the new id fails — ✅ #954 (Load Game path had the same unchecked result; both fixed)
  <details><summary>Details</summary>

  - **Verification:** plausible
  - **Where:** src/app/page.tsx:1696-1709 (handleOpenGameById)
  - **What goes wrong:** On Home the coach taps the next-match card for Saturday's game. saveCurrentGameIdSetting fails (a transient IndexedDB write failure on mobile). The catch only logs a warning, and enterMatch() still remounts the match view. The view boots whatever id is persisted, which is the last game the coach had open, for example last week's match. The coach lands in the wrong match, and if they start the clock or record events before noticing, those land in the old game's record. The Load Game path in useLoadGameController handles the same failure by showing an error and staying put.
  - **Suggested fix:** Call enterMatch() only after the persist succeeds; on failure show the same 'Error loading game state' toast. Better: route Home card opens through useLoadGameController.handleLoadGame so both entry points share one level-crossing implementation, including its pre-switch hygiene.
  - **Raw evidence:** `run4/G-orchestration-ui.open-game-by-id-ignores-persist-failure`

  </details>

- [x] **4.20** [high] Match timer: deep, independent review (owner request 2026-11-11) — ✅ done 2026-11-16: four Fable 5.2 reviewers; findings 4.21–4.36 fixed (#956–#969); 4.33b fixed (#970); owner question on the Penalties checkbox (4.34) decided 2026-11-20: recorded kicks decide; no change
  <details><summary>Details</summary>

  - **Why:** the timer is the core of match day, and this review found clock bugs in several separate places. A dedicated review of the whole timer design is wanted, not item-by-item patches.
  - **Known timer findings to fold in:**
    - 1.2: a remount mid-match drops the running clock. The recovery anchor is only written on backgrounding, so a remount has nothing to recover from.
    - 1.11: the clock can't continue past a wrong full time.
    - 4.3: undo while paused rewinds the clock.
    - 4.4: undoing a sub confirmation restores the wrong sub-due time.
    - 4.10: a clock reset while paused is not saved.
    - 4.11: reopening the running match rewinds the clock.
    - 4.12: changing Home/Away flips the shootout result.
    - 4.13: the sub-due time changes after a reload.
    - 4.15: goal times can be fractional.
    - June L1 (fractional pause time) and June M2 (stale anchor).
  - **Scope:**
    - the timer state model: reducer, `usePrecisionTimer`, wall-clock anchor, IndexedDB timer state;
    - every lifecycle path: background/foreground, kill/cold start, remount, game switch, offline/online, a service-worker update mid-match, sleep, wake lock;
    - periods, half time, overtime and shootout boundaries;
    - interaction with undo/redo and autosave;
    - what is persisted when.
  - **Output:** a timer design note (the invariants it must keep) plus a fix plan. The fixes then replace the individual items above where they overlap.
  - **Suggested approach:** a dedicated review run (Fable find + verify), like the 2026-11 review, plus a scripted scenario test harness for the lifecycle paths.

  </details>

- **4.20 result (2026-11-16):** four Fable 5.2 reviewers (state/persistence, lifecycle, periods/boundaries, undo/autosave); the top claims were spot-checked in code. Owner: fix all; the priority is the clock stopping across screen lock, background and reload. Items 4.21 onward, in fix order:
- [x] **4.21** [high] Lifecycle scenario test bench: kill mid-period, kill past the period end, return after more than 30 s, double remount, half-time with more than 5 min away, Home → other game → back, paused across a reload, boot with unsettled data. Each later fix lands with its scenario. — ✅ #956 (bench started; scenarios added per fix)
- [x] **4.22** [high] Recovery anchor is one-shot and single-slot: — ✅ #956
  - cleared when READ at boot (useGameOrchestration ~1184), so a second unmount before the first tick loses the clock;
  - cleared by opening another game;
  - written only on the first tick, not at start;
  - elapsed is computed at read time, not when RESUME is dispatched.
  - **Fix:** a per-game anchor, cleared only on pause, period end, reset or delete; written synchronously at start; elapsed computed at resume time.
- [x] **4.23** [high] Every return after more than 30 s remounts the live match (checkAppState raises the full-screen loading gate, page.tsx ~853/1731): — ✅ #957 (resume refresh runs without the gate; browser-verified)
  - dialogs and undo history are lost;
  - about a second is lost per remount;
  - a re-lock during boot is not recorded;
  - a paused match loses its wake lock.
  - Overlaps 7.1. **Fix:** the gate is raised only on the first check of a page load.
- [x] **4.24** [medium] The force-reload guard after 5 min away treats only a RUNNING clock as live: half-time or paused gets a slow full reload, and a Start tap during the 800 ms wait is lost. — ✅ #958 (SW navigation timeout not done; folded into 4.33)
  - **Fix:** a "match is live" signal (inProgress or periodEnd); re-check after the wait; a timeout on the SW navigation fetch.
- [x] **4.25** [medium] The clock is re-synced to wall time on return only if the hide event was seen (bfcache, missed visibilitychange, re-lock during boot), and the re-anchor floors to whole seconds (about 0.5 s lost per lock/unlock), with no guard against a backward clock step. — ✅ #959
- [x] **4.26** [high] A clock reopened at or past the period boundary is left as notStarted/Start at 25:00 and not saved: Start runs 1 s, then stops at "Start Period 2"; a second reload can restore an older time. — ✅ #960
  - **Fix:** load it as periodEnd/gameEnd at the boundary and save it explicitly.
  - The same normalisation applies to a paused inProgress clock at or past the boundary (pause in the last sub-second; a length shortened while paused).
- [x] **4.27** [high] Undo crosses clock boundaries (#940 still restores the clock when period or status differ): — ✅ #961 (Codex: undoing a half-time shortening that 4.30's bug moved into period 2 - resolved by 4.30)
  - at half-time or full time, undo reopens the period or game and rewinds the clock;
  - undo just after Start leaves isTimerRunning=true with notStarted, so the clock freezes and Start is dead;
  - undo after a Reset restores the old clock;
  - the toast Undo just after the whistle undoes the whistle.
  - **Fix (owner: yes):** applyHistoryState never restores gameStatus/currentPeriod/timeElapsedInSeconds (nor sub tracking when they differ); START_PERIOD, END_PERIOD_OR_GAME, CONTINUE_CLOCK and PAUSE_TIMER become no-history actions; LOAD_STATE_FROM_HISTORY forces isTimerRunning false when not inProgress; resetHistory after a confirmed Reset.
- [x] **4.28** [medium] Saving: — ✅ #963 (read-before-write not changed)
  - the autosave retry never runs (handleQuickSaveGame swallows errors, so saveWithRetry never sees a throw);
  - nothing is flushed on hide;
  - leaving a running match does not save the clock;
  - the silent save reads before it writes.
- [x] **4.29** [medium] Opening another game mid-match loses the running clock (the anchor is cleared, nothing was saved on leaving). Covered by 4.22 and 4.28; verify with its scenario. — ✅ covered by #956 (per-game anchor) + #963 (save on leaving a running match); bench scenario "opening another game keeps the running game's clock record" and "returning after 3 min counts the time"
- [x] **4.30** [medium] Shortening the period length at half time (25 → 20) turns the break into "period 2, paused", and the second half ends 5 min early (reconcilePeriodBreak / clockContinuation; no shortening test). — ✅ #962
- [x] **4.31** [medium] Period arithmetic assumes equal periods from 0:00: a length change during period 2 sizes the half wrongly, and there is no manual "end period now" — **owner decision 2026-11-16: add "End period now"** in the timer view while a period is in progress (running or paused), behind a confirm ("End the 1st half at 18:42?"); on the last period it ends the match. The next period still starts at the nominal time ((n-1)×length, football convention), so event minutes stay consistent. A mid-match length change then only has to stop producing wrong numbers. — ✅ #964 (End period / End match, confirmed; a mid-match length change in period 2 still sizes the half by (n)×length - End period is the tool for an early whistle)
- [x] **4.32** [medium] The boot "wait for refetch" branch does not wait: it consumes the anchor and completes the initial load, so the wrong or default game can open (useGameOrchestration ~1121-1195). — ✅ #966
- [x] **4.33** [low] Timer small items: — ✅ #967 (update banner: covered by #956+#963; Match details race split out as 4.33b)
  - a double-tap on Start/Start Period 2 starts and then pauses;
  - Reset awaits IndexedDB before resetting;
  - the dead periodic timer-state save;
  - END_PERIOD_OR_GAME has no isTimerRunning guard;
  - the sub-interval "−" does nothing at 1 min;
  - the update banner offers a reload mid-match;
  - a history entry is skipped when a tick lands between an async dispatch and its effect;
  - Match details read-modify-write races the snapshot autosave.
- [x] **4.33b** [low] Match details writes (`updateGameDetails`, src/utils/savedGames.ts) are a read-modify-write outside the key lock and race the snapshot autosave (two quick modal writes can drop the first field; a modal write landing around an autosave can put back older status/clock/events until the next autosave). Fix: merge inside `withKeyLock` as a DataStore-level `updateGame(id, patch)`; stop double-writing fields the reducer owns; functional `setSavedGames(prev => ...)` in handleQuickSaveGame. Split from 4.33 (storage-level change). — ✅ #970 (per-game write queue in savedGames.ts; functional setSavedGames)
- [x] **4.34** [low] Interval-derived numbers: — ✅ #968 (owner question - should the Penalties checkbox decide the result instead of the recorded kicks? - decided by the owner 2026-11-20: recorded kicks decide; no change)
  - Excel "Total Game Duration" and assessment minutesPlayed sum only the between-sub intervals (a game with no subs gives 00:00);
  - IntervalLog.timestamp is rendered as a 1970 date;
  - the Penalties checkbox does not gate the result (the comment says it does).
- [x] **4.35** [low] Shootout: back discards the recorded kicks (#953). **Owner decision 2026-11-16: keep them** - back and close both save the working copy, like Save; an untouched window saves nothing; no confirm prompt. — ✅ #965
- [x] **4.36** [docs] Timer design note: invariants from the four reports (one source of truth while running; isTimerRunning ⇒ inProgress; anchor per game, cleared only by its own stop; the boundary is always periodEnd/gameEnd; undo never touches the clock; every stop is saved before any reload). — ✅ #969 (Match Clock Architecture section in docs/02-technical/architecture.md)
- [x] **9.x-flaky** [test] `TeamManagerModal.test.tsx` › "blocks team unarchive when free limit is reached" fails intermittently under full-suite load (seen locally and in CI on #956, passes in isolation). Suspects: the default 1 s `waitFor` for the Unarchive menu item under load, and `useResourceLimit` monkey-patched on the module without try/finally (a failure leaks the patch into later tests). Capture the failure message, then fix at the source. — ✅ fixed in #967 (waits for the listed actions, 5 s waits under load, try/finally restore of the patched hook)

## Step 5 — Numbers coaches see (stats, exports)

- [x] **5.1** [medium] Season and Tournament records count penalty-shootout games as ties — ✅ #971
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/components/GameStatsModal/hooks/useTournamentSeasonStats.ts:91-96, :156-161, :210-215, :283-288 (raw score comparison); compare src/utils/teamRecord.ts:34 and src/utils/exportExcel.ts:156, :635 · src/components/GameStatsModal/hooks/useTournamentSeasonStats.ts:93 (also :165, :219, :289); shown at src/components/GameStatsModal.tsx:1525
  - **What goes wrong:** A tournament final ends 2-2 and is decided in the penalty shootout the coach logged. On the Tournament tab the record card shows the game as a tie (0-0-1) and the win percentage as 0%. The Overall tab counts the same game as a loss (or win), the 'by opponent' table shows it as a decided game, and 'Export Excel' pressed on that same Tournament tab writes a Team Performance sheet with a win/loss. The coach has two different tournament records for the same games depending on where they look.
  - **Suggested fix:** Build the season/tournament cards from computeTeamRecord (or call resolveGameResult) so every surface resolves a result the same way.
  - **Raw evidence:** `run3/J6-season-end.tournament-season-record-ignores-shootout`, `run4/F-stats-exports.season-tournament-record-ignores-shootout`

  </details>
- [x] **5.2** [medium] Win/draw/loss record shown in different orders without labels — ✅ #972
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 3 findings
  - **Where:** src/components/GameStatsModal/components/TeamPerformanceCard.tsx:80; src/components/GameStatsModal.tsx:1572; src/components/HomeDashboard.tsx:830 (also :505 'Wins - draws - losses'); src/utils/exportExcel.ts:558, :593, :657 · src/components/GameStatsModal/components/TeamPerformanceCard.tsx:80; src/components/GameStatsModal.tsx:1572; src/utils/exportExcel.ts:558,593,657 (vs src/components/HomeDashboard.tsx:513,785,830 and HeadToHeadCard.tsx:60,87) · src/components/GameStatsModal/components/TeamPerformanceCard.tsx:80, src/utils/exportExcel.ts:558,593,657 vs src/components/HomeDashboard.tsx:495-509 and HeadToHeadCard.tsx:60 (W-D-L)
  - **What goes wrong:** Home shows the season as 4-2-1 (wins-draws-losses). The coach opens team stats and reads 'Rekordi 4-1-2' for the same seven games. Read the Finnish way, that is one draw and two losses, which is wrong: it is one loss and two ties. On the Overall tab the opponent table directly above the card is headed 'V-T-H' (W-D-L), so two orders sit on one screen. The Excel 'Record' columns use W-L-T as well, with no hint of the order.
  - **Suggested fix:** Use one order everywhere (W-D-L matches Home, the opponent table and Finnish convention) and label it, including the Excel 'Record' columns.
  - **Raw evidence:** `run3/J6-season-end.record-order-differs-between-screens`, `run3/J7-language-format.record-order-wld-vs-wdl`, `run5/K-i18n-a11y.K3`

  </details>
- [x] **5.3** [medium] Excel "Fair Play Awards" column is always 0 — ✅ #973
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/utils/exportExcel.ts:422 and :844 (`player.fpAwards ?? 0`); src/components/GameStatsModal/hooks/useGameStats.ts:139-150 (rows built without fpAwards) · src/utils/exportExcel.ts:422 and :844; src/utils/exportGames.ts:193; producer src/components/GameStatsModal/hooks/useGameStats.ts:142-190
  - **What goes wrong:** At season end the coach exports the season stats to Excel to see who earned fair play cards. The 'Player Stats Summary' sheet has a 'Fair Play Awards' column that is 0 for every player. Exporting one player gives a 'Player Summary' sheet with Fair Play Awards 0, while the same workbook's 'Season Performance' sheet and the on-screen player view show the real count (for example 3). The stats table sort by this column is also a no-op.
  - **Suggested fix:** Compute fpAwards in useGameStats while walking processedGameIds (count games where the player's snapshot has receivedFairPlayCard, plus fairPlayCardsDelta of in-scope adjustments), or compute it inside the export from the games it is given.
  - **Raw evidence:** `run3/J6-season-end.excel-fair-play-awards-always-zero`, `run4/F-stats-exports.fair-play-awards-always-zero`

  </details>
- [x] **5.4** [medium] Single-game Excel from Saved games uses today's roster, not the game's players — ✅ #974
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/hooks/useLoadGameController.ts:209-217 (passes masterRosterQuery.data); src/utils/exportExcel.ts:204, :227, :252-257 · src/hooks/useLoadGameController.ts:209-216 -> src/utils/exportExcel.ts:209,227-228 (same pattern in src/utils/exportGames.ts:94-101)
  - **What goes wrong:** After the season the coach removes two players who left the club, then exports last spring's games to Excel from the games list. In each workbook the Player Stats sheet lacks those two players, and the goals they scored appear in the Events sheet with 'player_1712345_ab12' as the scorer. In every game exported this way, the Fair Play column says 'No' for all players, including the one who got the card. The same game exported from inside the match view is correct.
  - **Suggested fix:** Have exportCurrentGameExcel take player data from game.availablePlayers (the per-game snapshot), with the master roster only as a fallback for names.
  - **Raw evidence:** `run3/J6-season-end.loadgame-excel-uses-master-roster`, `run4/F-stats-exports.loadgame-excel-uses-master-roster`

  </details>
- [x] **5.5** [medium] Excel season/tournament breakdowns merge same-named competitions — ✅ #975 (friendly-skip not added: the export gets the screen-scoped games)
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/utils/exportExcel.ts:520-523 and :619-622 (team export), :931-936 and :967-972 (player export) · src/utils/exportExcel.ts:522 and :621 (aggregate); :937 and :974 (player export)
  - **What goes wrong:** The club plays 'Aluesarja' every year, so the coach has 'Aluesarja' for 24/25 and for 25/26. The app allows this and shows them apart as 'Aluesarja 24/25' and 'Aluesarja 25/26'. Exporting the Overall tab to Excel gives a single 'Aluesarja' row whose games, record and goals are the two seasons added together. The player export's 'Season Performance' sheet does the same. Nothing in the file says two seasons were combined.
  - **Suggested fix:** Key the maps by season/tournament id and label the rows with getSeasonDisplayName/getTournamentDisplayName; skip isFriendly games as the screen does.
  - **Raw evidence:** `run3/J6-season-end.excel-breakdown-merges-same-named-seasons`, `run4/F-stats-exports.excel-breakdown-keyed-by-name`

  </details>
- [x] **5.6** [low] Player Excel season/tournament sheets leave out external games the screen counts — ✅ #976
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/utils/exportExcel.ts:927-960, :963-996, :999-1026; src/utils/exportGames.ts:299-301
  - **What goes wrong:** A player has 10 season games in the app plus 3 external games added to that season with 'include in season stats'. With the team filter set, the on-screen player view shows 13 games for the season. The exported workbook's summary says 13, its 'Season Performance' sheet says 10, and 'Added Stats' also lists the player's external games for other teams and years that neither the summary nor the screen counts, with nothing marking which rows were counted.
  - **Suggested fix:** Pass the in-scope adjustments to the export and fold them into the season/tournament sheets the way calculatePlayerStats does, or add a 'counted' column to Added Stats.
  - **Raw evidence:** `run3/J6-season-end.player-excel-sheets-disagree-with-screen-on-external-games`

  </details>
- [x] **5.7** [low] Player-tab "Export Excel" silently does nothing when the player has no row — ✅ #977
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/GameStatsModal.tsx:1636-1644; src/components/GameStatsModal/hooks/useGameStats.ts:212-213; src/components/GameStatsModal.tsx:891-894
  - **What goes wrong:** On the Overall tab the coach types 'Lee' in 'Filter By Name' and taps Player B's row, which opens the Player tab. There the coach picks Aino from the player box and presses 'Export Excel'. Nothing happens: no file, no toast. The same happens for a player with no counted games in the current scope (a new player, or one who only played friendlies while friendlies are excluded).
  - **Suggested fix:** Compute the player's row without the name filter (or clear filterText on entering the Player tab), and disable the button or show a toast when there is nothing to export.
  - **Raw evidence:** `run3/J6-season-end.player-export-button-silently-does-nothing`

  </details>
- [x] **5.8** [low] Home top-scorer tile ignores external games — ✅ #978
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/utils/homeSummary.ts:300-318 (goal tally from game events only); stats side src/components/GameStatsModal/hooks/useGameStats.ts:170-188. Screenshots: /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J4/shots/d2-home-stats-after-ext.png, /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J4/shots/d3-overall.png
  - **What goes wrong:** On Home > Tilastot the coach taps 'Täydennä pelaajan tilastoja' (the row directly under the tiles) and adds a game a player played for the same team with 6 goals; the form says added games count in the totals. Back on Home the tile still says the top scorer is Player B with 5. Opening Overall statistics for the same season shows Player A with 6 goals and Player B with 5. The code comment says the Home numbers are meant to match the stats modal exactly.
  - **Suggested fix:** Feed the in-scope adjustments (adjustmentInScope with the same team and club-season scope) into the top-scorer tally, or label the tile as counting app-recorded games only.
  - **Raw evidence:** `run3/J4-edit-propagation.J4-home-top-scorer-ignores-external-games`

  </details>
- [x] **5.9** [low] Stats table and aggregate Excel show a player's oldest name — ✅ #979
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/GameStatsModal/hooks/useGameStats.ts:138-152
  - **What goes wrong:** A coach fixes a misspelled name, or changes a jersey number or nickname, in the roster. The Season/Overall stats table, its name search and the aggregate Excel keep the old spelling, taken from whichever game is first in savedGames. The Player tab and drop-down (master roster) show the new name, so the same child appears under two names and searching the table for the corrected name finds nothing.
  - **Suggested fix:** When building a row, take display fields (name, nickname, jerseyNumber) from playerPool by id when the player exists there, and fall back to the game snapshot for removed players.
  - **Raw evidence:** `run4/F-stats-exports.stats-table-stale-player-name`

  </details>
- [x] **5.10** [medium] Opponent-name checker "N games" count is inflated — ✅ #980
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** src/hooks/useOpponentVariantGroups.ts:76-77, src/utils/opponentNames.ts:203-228, OpponentNameSweepModal.tsx:221
  - **What goes wrong:** useAllOpponents builds occurrences from every saved game opponentName PLUS every name in each season.opponents list, then listOpponents counts occurrences. An opponent with 1 game that is also in the season opponent list shows "2 games"; label is "{{count}} games". Confirms the screenshot observation (1-game opponents shown as 2, one with 2 games as 3). Also "{{count}} games" has no plural forms ("1 games").
  - **Suggested fix:** Count only game occurrences for the usage number (use season lists only to include names with count 0), or relabel as "uses".
  - **Raw evidence:** `run5/K-i18n-a11y.K2`

  </details>
- [x] **5.11** [low] Player ratings "Current season" picks the season from unplayed fixtures — ✅ #981
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/PlayerStatsView.tsx:135-140, :152-159
  - **What goes wrong:** Near the end of the club season the coach has already entered next season's first fixtures. They open a player's development view to prepare end-of-season feedback and tap 'Current season'. The view is filtered to next season, which has no rated games, so the report is empty even though this season has a full set of assessments.
  - **Suggested fix:** Derive the current season from today's date, or from the latest played game that has an assessment for this player.
  - **Raw evidence:** `run3/J6-season-end.assessment-current-season-uses-unplayed-fixtures`

  </details>
- [x] **5.12** [low] Menu "finish this game" badge count differs from the checklist total — ✅ #982
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** src/components/HomePage/hooks/useGameOrchestration.ts:1661 vs src/components/GameWrapUpCard.tsx:39, src/utils/gameCompleteness.ts:122-151
  - **What goes wrong:** The wrap-up card calls completenessProgress(completeness, {voiceClipsPending}) which adds a voice-notes item when a game has clips; the menu badge calls completenessProgress(completeness) without options, so the audio item is never counted. Badge and checklist header disagree by one (4/6 vs 4/7) exactly for games with dictation. Confirms the screenshot mismatch. Badge also can report done while clips are still unreviewed (and clips are auto-deleted after 30 days).
  - **Suggested fix:** Pass the same voiceClipsPending to both call sites (or compute once).
  - **Note:** Superseded if the onboarding "valmis" rule ships (one rule for all surfaces).
  - **Raw evidence:** `run5/K-i18n-a11y.K4`

  </details>

## Step 6 — Privacy and AI (Kirjuri)

- [x] **6.1** [medium] Player codes P1..Pn collide with Finnish age groups (P11, P12); partitive endings mangled — ✅ #983 (codes X1..Xn)
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/utils/applyReportDraft.ts:110-131 (resolveRefsInText); src/utils/gamePacket.ts:371 (ref = `P${index + 1}`), :423 (teamName sent as-is); src/components/GameStatsModal/components/TranslateReportPanel.tsx:84-110; src/components/PlayerNotesSummaryCard.tsx:102-136 · src/utils/applyReportDraft.ts:72,86-92
  - **What goes wrong:** Pseudonymisation is on by default. A Finnish boys' team is almost always named with its age group, e.g. teamName 'FC Esimerkki P11' against 'HJK P12', and the squad has 11+ selected players. The packet sends teamName/opponentName verbatim and the system prompt repeats them, so the drafted section text says 'FC Esimerkki P11 voitti...'. On the way back, resolveRefsInText replaces every standalone P<number> that is a known ref with that player's name, so the review list and the saved report read 'FC Esimerkki Pelaaja A voitti HJK Pelaaja B:n 3-1' - the 11th and 12th selected children's names inserted where the teams were. The translate panel is worse: it assigns a code to EVERY roster player (P1..P25), so a coach's own report containing 'P12' comes back with a roster child's name in it. The model can also conflate the team token 'P11' with player ref P11 and file a team observation as a player note for that child.
  - **Suggested fix:** Use a ref format that cannot occur in football text (e.g. '[[P1]]' or a 'Pelaaja#1'-style token with a sentinel character), or before sending escape any pre-existing token in teamName/opponentName/notes/report that matches the ref pattern and unescape it after resolving. Add tests with teamName 'FC Esimerkki P11' and a 12-player squad for draft, translate and player-notes paths.
  - **Raw evidence:** `run1/I-security-ai.ref-code-collides-with-age-group-names`, `run4/H-new-features.finnish-partitive-name-ending`

  </details>
- [x] **6.2** [medium] Pseudonymisation leaks real first names in Finnish inflected forms — ✅ #984
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/utils/gamePacket.ts:262-286 (tokenMatchesHandle), :304-338 (redactPlayerNames); callers src/utils/gamePacket.ts:403,463, src/components/GameStatsModal/components/TranslateReportPanel.tsx:93, src/components/PlayerNotesSummaryCard.tsx:112
  - **What goes wrong:** Coach has pseudonymisation on (default) and a player called Joonas or Otto. A note or the report says 'Joonaksen syotto oli hieno' / 'Oton laukaus'. tokenMatchesHandle only accepts handle+ending, a kk/pp/tt stem for handles of 5+ letters, or a 1-edit typo of the same length +-1. 'joonaksen' does not start with 'joonas' and is 3 characters longer; 'oton' vs 'otto' is 2 edits and 'otto' is under the 5-letter gradation threshold. The word is sent to OpenAI unchanged, although the consent gate and the copy-to-parents text promise 'player names are replaced with codes before any drafting request'. Nobody reviews the outgoing text, so the coach never learns of it.
  - **Suggested fix:** Add stem rules: names ending in -as/-is/-us/-os/-es also match stem (minus 's') + 'ks' + ending; drop the length>=5 guard for the doubled-consonant rule (keep the exact stem + bounded ending); add -i -> -e stem for the Helmi/Lumi class. Extend tests with the top Finnish given names in genitive/allative/adessive.
  - **Raw evidence:** `run1/I-security-ai.redaction-misses-common-finnish-inflections`

  </details>
- [x] **6.3** [low] Players deleted from the roster are not redacted in older reports — ✅ #985
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/GameStatsModal.tsx:1165 and :1187 (`players={masterRoster.length > 0 ? masterRoster : availablePlayers}`); src/utils/gamePacket.ts:355-358, :403; src/components/PlayerStatsView.tsx:830 (`roster={masterRoster ?? []}`)
  - **What goes wrong:** A player leaves the club and the coach removes them from the roster. Later the coach drafts, tidies or translates the report of a game that player took part in. buildGamePacket resolves the squad and the redaction handles only from the current master roster, so that player gets no ref (their goals lose the scorer), and every mention of their name in notes and in the coach's report is sent to OpenAI in clear text although pseudonymisation is on. The game's own availablePlayers snapshot still holds the name but is ignored whenever masterRoster is non-empty.
  - **Suggested fix:** Pass the union of masterRoster and the game's own availablePlayers snapshot (by id) to ReportDraftPanel/TranslateReportPanel, and include the viewed player explicitly in PlayerNotesSummaryCard's roster.
  - **Raw evidence:** `run1/I-security-ai.redaction-skips-players-removed-from-master-roster`

  </details>
- [x] **6.4** [medium] Voice clips not deleted after 30 days unless the mic or inbox is opened — ✅ #986 (rotation at app start)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/utils/audioClipStore.ts:227-240 (rotateOldClips); only callers src/hooks/useDictationCapture.ts:210 and src/components/GameStatsModal/components/DictationInbox.tsx:109
  - **What goes wrong:** A coach tries voice notes for a couple of matches, leaves clips untranscribed (or transcribes them but never saves/discards them), and then stops using the feature - or just stops opening the notes step of the game stats modal. Nothing ever calls rotateOldClips again, so raw audio naming children stays in IndexedDB for months. The app's own text (locale keys at public/locales/en/common.json:2580 and :2604, and the header of audioClipStore.ts) states the recording is deleted 'in any case after 30 days'. The same copy says a clip is deleted 'as soon as it has been turned into text', but transcribing only stores the transcript on the clip; the audio stays until the note is saved or discarded.
  - **Suggested fix:** Call rotateOldClips(Date.now(), userId) once per app start after auth resolves (it already no-ops cheaply when the audio DB does not exist), and either delete the audio when the transcript is stored or change the two locale strings to say 'turned into a note'.
  - **Raw evidence:** `run1/I-security-ai.audio-30-day-cap-only-enforced-on-reuse`

  </details>
- [x] **6.5** [medium] Deleting a game no longer deletes its voice clips (cleanup lives in a dead hook) — ✅ #986
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/hooks/useLoadGameController.ts:136-180 (live handleDeleteGame); src/components/HomePage/hooks/useSavedGameManager.ts:298-302 (the only deleteClipsForGame call, in a hook nothing uses)
  - **What goes wrong:** A coach records voice notes during a match (audio of the coach talking about named children) and later deletes that game in Load Game. The live delete path (useLoadGameController.handleDeleteGame, used by ClubModalsHost) deletes the game, its planner subs and its plan link, but not the audio clips. They stay in the user's IndexedDB audio store, unreachable from any UI because the dictation inbox is per game. They are removed only if the 30-day rotation happens to run, which itself needs the mic armed or an inbox opened (reported separately). Deleting a match does not remove the personal recordings made in it.
  - **Suggested fix:** In useLoadGameController.handleDeleteGame, after a successful delete, call `deleteClipsForGame(gameId, userId)` (best effort, like the planner cleanup). Delete useSavedGameManager and its test so the next feature does not wire into it again.
  - **Raw evidence:** `run4/G-orchestration-ui.voice-clips-not-deleted-with-game`

  </details>
- [x] **6.6** [low] upsert_subscription and check_rate_limit not revoked from anon — ✅ #988 (migration 057, staging + prod 2026-11-16)
  <details><summary>Details</summary>

  - **Verification:** plausible
  - **Where:** supabase/migrations/010_subscriptions.sql:197-198; supabase/migrations/024_distributed_rate_limiting.sql:75-76
  - **What goes wrong:** Supabase's default privileges grant EXECUTE on new public functions to anon, authenticated and service_role individually, so revoking from PUBLIC and authenticated leaves the anon grant in place. Anyone holding the public anon key (it is committed in .env.development and shipped in the client) can POST /rest/v1/rpc/upsert_subscription with no user JWT and write an 'active' subscription row for any user id, including their own, with an arbitrary period_end. That is harmless while PREMIUM_ENFORCEMENT_ENABLED is false and becomes a free-premium bypass the day enforcement is switched on. The same caller can call check_rate_limit with p_key 'delete-acct:<ip>' repeatedly and keep that IP at 429 for account deletion, or bloat rate_limits.
  - **Suggested fix:** Confirm with select has_function_privilege('anon', 'public.upsert_subscription(uuid, subscription_status, text, text, text, timestamptz, timestamptz, timestamptz)', 'execute') on staging. If true, add a migration that revokes EXECUTE on both functions from anon (and authenticated, PUBLIC) and grants it to service_role only; optionally also reject inside the function when auth.role() is not 'service_role'.
  - **Raw evidence:** `run1/C-supabase.anon-execute-on-service-only-functions`

  </details>
- [x] **6.7** [low] Marketing consent prompt dismissed for good even when saving the choice failed — ✅ #987
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/MarketingConsentPrompt.tsx:62-86
  - **What goes wrong:** User taps Accept (or Decline) while the network is flaky. setMarketingConsent returns an error, which is only logged; the `finally` still calls dismissMarketingPrompt(), which sets the per-user seen flag. No error is shown, nothing is recorded server-side, and the prompt never returns, so a user who agreed is not opted in and believes they are.
  - **Suggested fix:** Only dismiss on success; on error show a toast and leave the prompt (or retry later without setting the seen flag).
  - **Raw evidence:** `run1/D-auth-lifecycle.marketing-prompt-dismissed-on-failure`

  </details>
- [x] **6.8** [low] Raw error text shown to users (premium toast, import results, error boundary stack) — ✅ #989 (toast; ErrorBoundary dev-only, ImportResultsModal unrendered)
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep) · merged from 3 findings
  - **Where:** src/components/UpgradePromptModal.tsx:188-190 · src/components/ImportResultsModal.tsx:215 · src/components/ErrorBoundary.tsx:184-200
  - **What goes wrong:** On grantMockSubscription failure the toast is "Subscription failed: {{error}}" with result.error from the edge function ("Always show the actual error message for debugging"). Leaks backend detail; CLAUDE.md requires sanitized messages. Only reachable in internal/preview variant (mock token path) so impact is limited.
  - **Suggested fix:** Log the detail, show a generic message.
  - **Raw evidence:** `run5/K-i18n-a11y.K6`, `run5/K-i18n-a11y.K7`, `run5/K-i18n-a11y.K15`

  </details>

## Step 7 — Navigation, forms, first run, edit propagation

- [x] **7.1** [medium] Returning after 30 s in the background throws away open forms and the setup wizard — ✅ #990 (forced reload waits while a form is open; 30 s part already fixed by 4.23)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/app/page.tsx:1525 (handleAppResume -> setRefreshTrigger), :364-365 (checkAppState sets isCheckingState true), :1731 (showLoadingScreen), :1738-1742 (showSetupWizard requires !showLoadingScreen), :1787-1791 (ClubModalsHost gated the same way); src/components/SetupWizard.tsx:72-80 (all wizard input in useState); src/hooks/useAppResume.ts:183 (full reload after 5 minutes)
  - **What goes wrong:** A new coach signs up and lands in the setup wizard. They type the team name, pick the format and start entering players, switching to WhatsApp or the club's roster app to read the names. Any switch that lasts more than 30 seconds brings them back to a brief loading screen and then wizard step 1 with an empty team name and an empty player list; nothing they typed was saved and nothing tells them why. The same happens to a half-filled add-player form and to a half-filled New Game form (opponent, ticked players, formation) on Home. After 5 minutes away the page is fully reloaded with the same result. Expected: the form is still there when they come back.
  - **Suggested fix:** Do not raise the full-screen loading gate for re-checks: show LoadingScreen only for the first checkAppState of a page load, and let later runs (resume, refreshTrigger) update the Home flags in place, as refreshSetupSignals already does. Independently, keep the wizard draft (team name, format, age group, names) in sessionStorage keyed by user id so a reload or WebView recreation restores it.
  - **Raw evidence:** `run3/J1-first-run.resume-discards-wizard-and-open-forms`

  </details>
- [x] **7.1b** [low, follow-up of 7.1] Android destroying the WebView in the background still loses the setup wizard's input — keep a sessionStorage draft (team name, format, age group, names) keyed by user id; mind 7.6's partial-create retry state. — ✅ #1008
- [x] **7.2** [medium] Sign-up code screen cannot be recovered after a reload — ✅ #991
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/AuthForm.tsx:61-63 (pendingVerification/pendingEmail in useState only), :379-385 (exitVerification), :119-129 (sign-in error path); src/auth/SupabaseAuthService.ts:683-685 ('Email not confirmed' mapped to the invalid-credentials message); src/hooks/useAppResume.ts:183 (forced reload after 5 minutes hidden)
  - **What goes wrong:** A new coach on the Play build creates an account and gets the 'Enter Verification Code' screen. They switch to their mail app. If they are away for more than 5 minutes (slow mail, spam folder), or Android discards the app in the background, the app reloads to the Create Account form. The natural next step, 'Sign in' with the password they just chose, answers 'Invalid email or password. If you recently signed up, please check your email for confirmation' - but the email contains a code and no screen accepts it. Tapping 'Back to sign in' on the code screen by mistake has the same effect. The only route back to the code field is to fill in Create Account again with the same email, which sends a new code and invalidates the one they just went to fetch. Expected: sign-in for an unconfirmed account (or a remembered pending sign-up) leads to the code entry screen.
  - **Suggested fix:** Persist the pending sign-up email (sessionStorage or localStorage with a short expiry) and restore the code screen on mount. In signIn, detect 'Email not confirmed' and route to the code screen with a resend, instead of the generic error. Offer an 'I have a code' link on the sign-in form.
  - **Raw evidence:** `run3/J1-first-run.signup-otp-screen-not-recoverable`

  </details>
- [x] **7.3** [medium] Network hiccup on first sign-in sends a returning coach into the new-coach wizard — ✅ #992 (cloudCheckPending + usePendingCloudPull; Skip/Discard now pull)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/app/page.tsx:1213-1224 (cloud check failed -> toast + setMigrationCompleted + proceed), :1301-1313 (hydration failed after retries -> same), :1062-1126 (background path refreshes queries but never re-runs checkAppState), :329 (isFirstTimeUser), :1738-1742 (showSetupWizard); src/services/reverseMigrationService.ts:1272-1347 (hasCloudData: single attempt per table, any error = checkFailed)
  - **What goes wrong:** A coach with a season of data signs in on a second phone. One of the count queries in the cloud check fails (flaky mobile network). The app shows 'Could not check cloud data. Your data will load automatically', marks the migration as completed and lets them in. Local storage is empty, so they are treated as a first-time user: the setup wizard asks for a team name and players. Nothing loads in this session. If they follow the wizard, a second team and duplicate players are created and pushed to their real account. On the next launch the cloud data is merged in the background next to the duplicates. If they instead skip the wizard, Home stays in the new-coach layout (no Continue, no saved games) until a relaunch. Expected: the check is retried, or the coach is told their data has not loaded yet, and the wizard is not offered.
  - **Suggested fix:** Retry hasCloudData before giving up, and on failure do not set the migration flag: keep the blocking path for the next attempt and offer a 'Try again' action. Never show SetupWizard when the cloud check did not complete successfully. After a successful background hydration, re-derive the Home flags (call refreshSetupSignals extended with hasSavedGames/canResume) instead of leaving them at their boot values.
  - **Raw evidence:** `run3/J1-first-run.returning-coach-shown-setup-wizard-after-failed-cloud-check`

  </details>
- [x] **7.4** [medium] Local-mode web user tapping Welcome / Enable Cloud Sync is locked out behind sign-in — ✅ #993 (way back to local on sign-in; Welcome link hidden where it offers no choice; gear confirmation not added — owner call)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/app/page.tsx:1928 (onShowWelcome), :1840 (hideLocalModeOptions), :1890-1891 (LoginScreen gets neither onBack nor onUseLocalMode), :676-700 (handleWelcomeUseCloudSync), :804-809 (handleEnableCloudSync); src/components/StartScreen.tsx:410-413 (Welcome link shown in local mode), :980-989 (gear sheet 'Enable Cloud Sync'); src/components/WelcomeScreen.tsx:135 (local option hidden)
  - **What goes wrong:** A coach who has used the web app without an account (a full season of local data) taps the 'Tervetuloa' link in the Home header, or 'Ota pilvisynkronointi käyttöön' in the gear sheet. From the Welcome link they get a 'choose how to start' screen whose only option is 'Käytä pilvisynkronointia'; there is no back button and browser back leaves the app. Tapping the only button (or the gear entry, which has no confirmation) switches the stored mode to cloud and reloads into the Create Account screen. That screen has no Back and no 'continue without an account', and the mode sticks across reloads. The coach cannot reach their games again unless they create an account. Expected: a way to cancel and return to local data.
  - **Suggested fix:** When the device already holds local-mode data (or mode was 'local' before the switch), pass onUseLocalMode/onBack to LoginScreen so the coach can return. Hide the Home 'Welcome' link when hideLocalModeEntry is true (the screen it opens has no choice to make), and put a confirmation in front of the gear-sheet 'Enable Cloud Sync'.
  - **Raw evidence:** `run3/J1-first-run.local-user-cloud-switch-has-no-way-back`

  </details>
- [x] **7.5** [low] Marketing prompt can open over the first live match — ✅ #994
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/MarketingConsentPrompt.tsx:41 (gate: showMarketingPrompt && !tourActive && !wizardActive && hasFirstGame, then 5 s timer); src/app/page.tsx:1747-1749 (hasFirstGame published from hasSavedGames, which only updates in checkAppState); src/app/layout.tsx:96 (mounted app-wide)
  - **What goes wrong:** A new coach creates their first game and starts the clock. The prompt is designed to wait until a first game exists, but that flag is only refreshed when the app re-checks its state - which happens when the coach returns to Home, or when the phone has been locked or in a pocket for more than 30 seconds. In the second case the coach unlocks the phone mid-match and, five seconds later, a full-screen dimmed dialog asks about product emails while they are trying to log a goal or a substitution. Expected: the prompt appears on Home, not over a live match.
  - **Suggested fix:** Publish the screen (or 'match on screen') alongside the first-game signal and only arm the prompt while Home is showing and no modal is open.
  - **Raw evidence:** `run3/J1-first-run.marketing-prompt-can-open-over-first-live-match`

  </details>
- [x] **7.6** [low] SetupWizard retry after a partial failure ignores edits made in between — ✅ #995
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/components/SetupWizard.tsx:140-151 (retry loop indexes finalNames by createdPlayersRef.current.length), :221-226 (generic error toast); src/datastore/LocalDataStore.ts:691 (100-character player name limit), :836 (48-character team name limit); no maxLength on the wizard inputs · src/components/SetupWizard.tsx:140-161
  - **What goes wrong:** A coach pastes several names into one row (or a name over 100 characters), or a team name over 48 characters. 'Done' creates the players before the bad row, then fails with 'Saving failed - please try again' and no hint about which entry is wrong; retrying fails the same way every time. If the coach then fixes the list by removing or reordering earlier rows and taps Done again, creation resumes at the old position: a removed player stays in the roster and team, and a player now sitting at an already-used position is never created. The wizard closes as if everything was saved. Expected: the error names the problem, and the saved roster matches the list on screen.
  - **Suggested fix:** Track created players by the name row they came from (give each row an id) instead of by position, add maxLength to the team-name and player inputs to match VALIDATION_LIMITS, and show which entry failed.
  - **Raw evidence:** `run3/J1-first-run.setup-wizard-retry-resumes-by-position`, `run4/H-new-features.wizard-retry-misassigns-after-edit`

  </details>
- [x] **7.7** [medium] A modal handing off to another leaves back history one entry short — ✅ #996 (needs on-device check of go(-n) on the TWA)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/hooks/useModalHardwareBack.ts:128-136 (removeSubGuard calls history.back() synchronously) with same-commit pushes from src/components/HomePage/hooks/useModalOrchestration.ts:465-478 (wrapUpToGameSettings / wrapUpToAssessments / wrapUpToGoalLog) and src/components/ClubModalsHost.tsx:152-161 (club stats game log -> onEnterMatch) + src/app/page.tsx:590
  - **What goes wrong:** (a) After a match the coach opens 'Viimeistele ottelu' and taps the checklist row 'Sarja ja joukkue' (or 'Pelaaja-arviot'), which closes the wrap-up and opens Match details in the same tap. Back closes Match details as expected. The next back, which should go to Home, closes the app (in a browser tab: navigates to the previous site). If instead the coach taps the menu's 'Koti' button, the app itself calls history.back() and the browser leaves the app. (b) From Home: Tilastot -> Pelaajatilastot -> a player -> tap a game in the game log. The match opens; the first back exits the app instead of returning Home. Expected in both: back returns to Home and never leaves the app from the match screen. In an installed app with no earlier history entry the stray history.back() is a no-op, which leaves one 'ignore the next back' count stuck, so a later real back press is swallowed while a modal stays open.
  - **Suggested fix:** Give removeSubGuard the same treatment as the sentinel: defer the history.back() to a macrotask and cancel it when another guard or the sentinel is pushed in the same tick (reuse the still-live entry instead of back()+pushState). Add a test that closes one sub-guard and opens another, and one that closes a sub-guard while the page sentinel registers, in a single commit.
  - **Raw evidence:** `run3/J5-navigation-interaction.subguard-swap-desyncs-history`

  </details>
- [x] **7.8** [low] Back closes the modal underneath (Settings from Stats) — ✅ #997
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/hooks/useModalHardwareBack.ts:143-156 (any open sub-guard is popped before the sentinel's topmost modal); src/components/ClubModalsHost.tsx:516 (club stats opens Settings without closing) with :314 and :326
  - **What goes wrong:** Home -> Tilastot -> Sarjatilastot -> Suodattimet -> 'Määritä ajanjakso' opens Settings on top of the stats screen so the coach can set the season dates. They press back to return to the stats. Nothing appears to happen (the stats screen behind was closed). A second back closes Settings and they are on Home, not on the stats they came from. Same when club stats was opened from the match menu. Expected: back closes Settings and returns to the stats screen.
  - **Suggested fix:** Either close club stats before opening Settings and reopen it on return, or keep one ordered list of all registered surfaces (stack entries and sub-guards) so a back always closes the most recently opened one.
  - **Raw evidence:** `run3/J5-navigation-interaction.back-closes-modal-underneath`

  </details>
- [x] **7.9** [low] Back with the match menu or formation panel open leaves the match — ✅ #998
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/app/page.tsx:590 (match-level back = go Home) with no registration for the ControlBar menu, FormationPicker, PlanSubSheet or planned-subs overlay; contract stated at src/components/HomePage/containers/ModalManager.tsx:158-164
  - **What goes wrong:** During a match the coach opens the Valikko side menu (or the formation panel) and presses back to dismiss it, as on any Android app. The whole match view closes and they are on Home; they have to tap 'Jatka' to get back to the pitch while the clock runs. Expected: back closes the open panel first, which is the rule the code states for match-scope modals.
  - **Suggested fix:** Register the side menu and the pitch-side panels with useHardwareBackSubLevel while open.
  - **Raw evidence:** `run3/J5-navigation-interaction.match-overlays-not-registered-for-back`

  </details>
- [x] **7.10** [medium] Adding a player with a duplicate shirt number closes the form and drops input — ✅ #999
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/PlayerDetailsModal.tsx:84-110 (onAddPlayer not awaited, onClose always called); src/hooks/useRosterSettingsController.ts:153-160 (duplicate-number check sets rosterError and returns); src/components/RosterSettingsModal.tsx:326 (error rendered under the whole list)
  - **What goes wrong:** The coach taps Lisää Pelaaja, enters name, nickname, number 1 and a note, and taps Lisää. Another player already has number 1. The form closes, the roster list looks unchanged, and the only message is a red line under the last player, off-screen on any roster longer than about 8 players. To the coach the player was added and then is not there; reopening the form shows it empty. The same happens when the storage write fails. Expected: the form stays open with the message next to the number field, as it already does for a duplicate name.
  - **Suggested fix:** Have the add handler return success/failure (it already returns a promise) and close the form only on success; run the number check in the form alongside the name check and show the error inline.
  - **Raw evidence:** `run3/J5-navigation-interaction.add-player-duplicate-number-closes-form`

  </details>
- [x] **7.11** [low] Double tap on "Lisää" opens another player's edit — ✅ #1000
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/PlayerDetailsModal.tsx:104-110 (form closes immediately on the first tap); src/styles/modalStyles.tsx:311-330 (sticky primary button sits over the roster rows)
  - **What goes wrong:** The coach double-taps Lisää (two taps about 0.1 s apart). The player is added once, the form closes at once, and the second tap lands on the roster row that was under the button, opening 'Pelaajan tiedot' for a different player (Player B Lehtonen in the demo). It looks as if the app opened the wrong player, and a further tap on Tallenna there is confusing. Expected: the second tap does nothing.
  - **Suggested fix:** Ignore pointer input on the list for a short moment after a child form closes (or keep the form mounted and inert until the add promise settles).
  - **Raw evidence:** `run3/J5-navigation-interaction.double-tap-save-opens-row-underneath`

  </details>
- [x] **7.12** [medium] Renaming a player drops them from their team's preselection — ✅ already fixed by 7c52e7ace (teamMemberIds: id match, name fallback; used by New Game, Match details and both planner pickers; tested in gamePlayerList.test.ts) — verified 2026-11-16
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/NewGameSetupModal.tsx:823-833; src/components/GameSettingsModal.tsx:1143-1153; src/components/PlaytimePlannerModal.tsx:325-328 and :1280-1283; root: src/datastore/LocalDataStore.ts:712-752 (updatePlayer writes only the master roster). Screenshot: /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J4/shots/a2-newgame-team-selected.png
  - **What goes wrong:** A coach fixes a typo in a player's name (Seura > Pelaajat > player > save). The team list still says the team has 14 players and the team editor still shows the player ticked. But the next time the coach creates a game and picks that team, only 13 of 14 players are preselected and the renamed child is left out with no message; a coach who trusts the team preselection starts the match without that player in the squad. The planner's team picker does the same, and re-picking the team on an existing plan treats the renamed player as no longer in the team and removes them from the plan.
  - **Suggested fix:** Match team roster to master roster by player id in all three places (keep the name match only as a fallback for legacy rosters whose ids differ), or cascade name changes into team rosters in updatePlayer.
  - **Raw evidence:** `run3/J4-edit-propagation.J4-rename-drops-player-from-team`

  </details>
- [x] **7.13** [medium] Opponent rename reverted by an open match / rewrites games from a stale cache — ✅ #1001
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/hooks/useOpponentRename.ts:81-85 (writes storage); src/components/HomePage/hooks/useGameOrchestration.ts:1456-1459 (loaded game is never re-read); src/components/HomePage/hooks/useGamePersistence.ts:216-218 and :323-325 (full-overwrite snapshot from session state). Screenshot: /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J4/shots/b1-after-sweep.png · src/hooks/useOpponentRename.ts:59-84; src/app/QueryProvider.tsx:63; src/app/page.tsx:1615-1623,1652-1656
  - **What goes wrong:** During or after a match the coach opens Menu > Team statistics, sees the banner '1 team is written several ways', opens 'Check team names' and applies one spelling everywhere. The toast says the games were renamed. Back in the match the score bar still shows the old spelling, and the next autosave of the open match (any goal, note, clock start/stop, setting) writes the old opponent name back to that game. The duplicate opponent reappears in the stats and the banner returns; the coach fixed it and it came back. This is a different path from the known run-4 finding about the rename writing stale cached games: here the open match overwrites the rename.
  - **Suggested fix:** When a rename (or any club-side game write) touches the game that is mounted in the match view, push the change into the session (dispatch SET_OPPONENT_NAME via the registered live-game hooks) or flush and remount the match afterwards, as the load-game crossing already does.
  - **Raw evidence:** `run3/J4-edit-propagation.J4-sweep-rename-reverted-by-live-match`, `run4/H-new-features.opponent-rename-writes-stale-cache`

  </details>
- [x] **7.14** [low] "All teams" rename silently and irreversibly merges two opponents — ✅ #1002 (owner: confirm before merging, no undo)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/OpponentNameSweepModal.tsx:222-238; src/utils/opponentRename.ts:37-71,82-94
  - **What goes wrong:** In the sweep's 'All teams' list the coach opens 'ABC' (their shorthand for ABC Punainen) and types 'ABC Sininen' by mistake or autocorrect, or deliberately believes they are the same team. 'Use this everywhere' immediately rewrites every ABC game to 'ABC Sininen'. There is no warning that this name already belongs to another opponent with N games, no confirmation and no undo. From then on the two squads' games share one normalised key, so head-to-head, stats and the sweep tool treat them as one team. Because every tool works per normalised key, no rename can separate them again. The module itself names this as the worse bug: 'would offer to merge two real squads, which is a worse bug than the typo it fixes'.
  - **Suggested fix:** Before applying, test whether the new spelling normalises to a different existing key. If it does, ask explicitly ('X already has N games - merge them? This cannot be split again'). Consider keeping the pre-rename id->name map so the merge can be undone.
  - **Raw evidence:** `run4/H-new-features.sweep-rename-merges-teams-irreversibly`

  </details>
- [x] **7.15** [medium] Removing a tournament level orphans its games and teams — ✅ #1003 (removal of a used level refused; same-edit re-add keeps id)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/TournamentSeriesManager.tsx:50-52 (remove) and :41-44 (new id on add); src/datastore/LocalDataStore.ts:2542-2565 (references are checked only for deleting the whole tournament); src/components/GameStatsModal/utils/gameFilters.ts:207-210
  - **What goes wrong:** A tournament has levels (e.g. Kilpa) and games or a team are linked to one. The coach edits the tournament and removes the level, or 'changes' it by removing it and adding another, then saves. Deleting the tournament itself is blocked while games reference it, but removing a level is not checked and shows no confirmation. Afterwards those games keep a tournamentSeriesId that no longer exists: they lose their level badge in the saved-games list, they can no longer be reached with the Level filter in tournament stats, and a team bound to that level loses its binding. Re-adding the same level does not help, because it gets a new id; each game has to be edited by hand.
  - **Suggested fix:** Before removing a level, count games and teams that reference it (reuse the series check in getTournamentReferences) and either block with the same DeleteBlockedDialog or confirm and clear the references; when a level is re-added with the same name, reuse the old id.
  - **Raw evidence:** `run3/J4-edit-propagation.J4-series-removal-orphans-games`

  </details>
- [x] **7.15b** [low, test reliability] `TeamManagerModal.test.tsx` › "blocks team unarchive when free limit is reached" still times out under full-suite load (seen #956, #967, and again 2026-11-17 on the 7.15 branch; passes 8/8 in isolation, on master too). The 5 s wait added in #967 did not cure it — find what makes the archived team's actions render slowly under load (PremiumProvider / ToastProvider async setup?) instead of raising timeouts again. — ✅ #1009 (cause: same-millisecond createdAt ordering, not timing)
- [x] **7.16** [low] A deleted player stays in team rosters — ✅ #1004
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/datastore/LocalDataStore.ts:754-768 (deletePlayer removes only the master entry); src/components/TeamManagerModal.tsx:185-193 (count = stored roster length) vs src/components/UnifiedTeamModal.tsx:155-162
  - **What goes wrong:** The coach removes a player who has left the club (confirmation text is only 'Are you sure you want to remove this player?'). The Teams list keeps showing the old number of players for each team the child was in ('14 players'), while opening the team shows 13 ticked. The stale copy of the child's name, nickname, number and notes stays in the team roster in local storage and in the cloud team_players rows until the coach happens to re-save that team.
  - **Suggested fix:** In deletePlayer (local and synced), remove the player from all team rosters under the roster lock and queue the affected rosters for sync; say in the confirmation that past games keep the player's statistics.
  - **Raw evidence:** `run3/J4-edit-propagation.J4-deleted-player-stays-in-team-roster`

  </details>
- [x] **7.17** [low] Team rename not reflected in the match view, recap or Taso text — ✅ #1005 (owner: the game keeps its own team name)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/utils/entityLookup.ts:59 (list resolves the live team name) vs src/utils/gameRecap.ts:117 and src/utils/tasoReport.ts:122 (use game.teamName)
  - **What goes wrong:** The coach renames the team 'MePa' to 'MePa P12' in Seura > Joukkueet. The saved-games list immediately shows 'MePa P12 - Opponent' for every game of that team. Opening one of those games shows 'MePa' in the score bar and Match details, and the recap shared with parents and the Taso text still say 'MePa'. A coach who customised the team name for a single game sees the opposite: the list hides their custom name behind the team's name.
  - **Suggested fix:** Pick one rule: either resolve the team name by teamId in the match header, recap and Taso text too, or show game.teamName in the list when it differs from the team's name.
  - **Raw evidence:** `run3/J4-edit-propagation.J4-team-rename-not-in-match-or-recap`

  </details>
- [x] **7.18** [low] Home not refreshed after closing Team statistics — ✅ #1006
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/components/StartScreenLiftedBridge.tsx:93-100 (isClubStatsOpen is not in the refresh list); rename entry src/components/GameStatsModal.tsx:1316-1322, :1689. Screenshot: /tmp/claude-1000/-home-villepajala-projects-MatchOps-Local/088a28da-42e1-4a32-850d-4fa6a1ab73d3/scratchpad/run3-J4/shots/e1-home-after-sweep.png
  - **What goes wrong:** From Home the coach opens Tilastot > Sarjatilastot, uses 'Check team names' to fix 'HARJUN HAUKAT' to 'Harjun Haukat', and closes the stats. The recent-results strip and the last-opened card on Home still show the old spelling. It corrects itself only after another Home-affecting modal closes or the app reloads.
  - **Suggested fix:** Add isClubStatsOpen (and the competitions-manager sweep already covered) to anyHomeAffectingModalOpen, or have useOpponentRename call the page's refresh after a successful rename.
  - **Raw evidence:** `run3/J4-edit-propagation.J4-home-stale-after-club-stats`

  </details>
- [x] **7.19** [low] Single-tab guard hides the UI but the blocked tab still boots the data layer and a second sync engine — ✅ #1007 (tabOwnership + startSyncWhenTabOwned; page effects gated)
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/hooks/useMultiTabPrevention.ts:21-44; src/app/page.tsx:108,826-850 (checkAppState effect not gated on isBlockedByOtherTab); src/datastore/factory.ts:582 (syncedStore.startSync())
  - **What goes wrong:** A cloud-mode coach has the installed PWA/TWA open in the background holding the 'matchops-active-tab' lock. They tap an app link from an email or the website, which opens a Chrome tab on the same origin. The new tab shows 'Already open', but its checkAppState effect still runs: runMigration(), getCurrentGameIdSetting, getSavedGames, then DataStore creation, which starts a second SyncEngine on the same IndexedDB sync queue. AuthProvider and the other layout providers also boot fully. Two engines now drain one queue concurrently, and the cross-tab lock was the only protection, since the in-memory locks are per tab (CLAUDE.md 'Known Limitation - Multi-Tab'). The guard gives the impression that the second tab is inert when it is not.
  - **Suggested fix:** Resolve the lock before booting: expose a tri-state (pending/owner/blocked) from useMultiTabPrevention and gate checkAppState, and ideally DataStore/sync creation, on 'owner'. Keep the blocked tab completely passive.
  - **Raw evidence:** `run4/J-pwa-perf.blocked-tab-still-boots-data-layer`

  </details>

- [x] **7.20** [medium, found by the 7.L inventory 2026-11-17] Archived teams, leagues and tournaments can never be shown or unarchived — the managers load `getTeams/getSeasons/getTournaments(userId)` with no argument, so the stores' `includeArchived=false` default drops them: "Show Archived" shows nothing, an archived entity cannot be restored there, and with every team archived the Team manager says "No teams yet". Component tests pass archived teams in as props, which hid it. Where: src/utils/teams.ts:50, seasons.ts:31, tournaments.ts:31; hooks/useTeamQueries.ts:33, useSeasonTournamentManagement.ts:57-61. — ✅ #1010
- [x] **7.L** [review, owner request 2026-11-16] — ✅ plan done 2026-11-17 (items 7.L1–7.L11 below; owner decisions recorded on them) **All lists: filtering, ordering and search.** Inventory every list in the app (Saved games, Home strips, roster/players, teams, seasons/tournaments, personnel, stats tables, player/opponent pickers, planner, club stats, venues, external games…) and record, for each: what it shows, its default order, the sort options, the filters, whether it has search and how search matches (name/nickname/jersey, accents, partial), empty and no-results states, and how filters persist. Output: one table of the current behaviour, the inconsistencies between lists, and a prioritised enhancement plan (shared search/sort/filter behaviour, missing search on long lists, sensible default orders). Plan first; implementation items to follow from it.
  <details><summary>Result (inventory 2026-11-17 — current behaviour, inconsistencies, plan)</summary>

  **Current behaviour (condensed; file:line in the three inventory reports, summarised here).** No list remembers its filter/sort/search between visits except the Home team scope (localStorage) and the planner's open plan (sessionStorage). Each text search is its own inline `toLowerCase().includes()`: case-insensitive substring, one needle (no multi-word), no accent folding — except venues (`venueBook.fold`, accent-insensitive, prefix-first).

  | List | Default order | User sort | Filters | Search (fields) | Empty / no-results |
  |---|---|---|---|---|---|
  | Saved games (LoadGameModal) | date desc → time → creation | — | opponent (2+), unplayed only | team (game + current), opponent, raw ISO date, league, tournament, type/gender words | both; "No games saved yet" wrongly shown when only "unplayed" filters everything out |
  | Home recent / upcoming strips | date (string) desc / asc, no time tie-break | — | team scope (Stats tab only) | — | strip hidden |
  | External games (per player) | **entry time** desc (not game date); sorts state in place | — | — | — | nothing |
  | Player game log | date desc, no tie-break | — | stats filter panel | — | "…selected club season" even when sport/gender hid them |
  | Stats player table | points desc | header click | filter panel (reset on every tab click) | **name only** | "No Players Match Filter" even with no filter |
  | Stats player combobox | roster order (unsorted) | — | — | name + nickname | list hidden |
  | Head-to-head | played → GD → name | — | tab filters | — | hidden <2 rows |
  | Club roster | last name (own copy, no tie-break) | last name / newest / oldest | show archived (link + count) | name + nickname (**no jersey**) | **none** |
  | Teams manager | created desc | — | Show Archived (**never shows anything — 7.20**) | name, age, raw gameType, bound season/tournament | both |
  | Leagues / tournaments manager | **unsorted** (storage order) | — | Show Archived (**same bug — 7.20**) | name | "No leagues yet" also for no search hits |
  | Personnel manager | created desc | — | — | name + role | both |
  | Opponent sweep "All teams" | games desc → name | — | — | normalised name, box only >8 | **no no-results text** |
  | Opponent chips (New Game) | curated, then played, then first-seen | — | — | normalised substring | hidden |
  | Opponent field (Match details) | **no chips at all** | | | | |
  | Venues | last used → times used | — | — | accent-insensitive, prefix first | hidden |
  | Squad / team-roster picker (PlayerSelectionSection) | last name → full name | — | callers hide archived | **none** (50–100 players) | per caller |
  | Scorer select | **first name** A–Z | — | squad | — | — |
  | Assister, edit selects, captain, fair-play, note composer, PlayerBar, assessments | **unsorted** (storage order) | — | squad | — | — |
  | Shootout shooter | unsorted | — | **whole game list, not the squad** | — | — |
  | Voice inbox player select | first name A–Z | — | squad | — | — |
  | Team selects (New Game, Match details, planner) | **unsorted** | — | archived removed | — | — |
  | League / tournament selects | start date desc → name | — | archived removed, **no option for an archived current value** | — | — |
  | Official league select | config order | — | Level/Area filters in Match details, **none in New Game** | — | — |
  | Planner plans | updated desc | — | archived hidden (toggle) | — | — |
  | New Game "prefill from plan" | updated desc | — | **archived plans included** | — | — |
  | Rules directory | rulebook page | — | football/futsal, age | fi+en topic/law text, law number | yes |

  **Inconsistencies.** Player order: last name (pickers) vs first name (scorer, voice inbox) vs unsorted (most match selects); the roster keeps its own last-name copy without the tie-break. Player name shown as "name (nickname)", name only, or nickname first, by list. Search fields differ (name / +nickname / never jersey) and only venues fold accents. Date sorts use three methods (Date parse with tie-breaks, ISO string compare, entry time). Two Show-Archived UIs (link with count vs pill). Empty vs no-results text missing or identical in several lists. Seasons/tournaments sorted in pickers but not in their manager; teams sorted nowhere.

  **Plan (prioritised).** P1 are bugs (do without asking); P2 make lists behave the same; P3 add missing capability. Items marked *owner* need a decision first.
  </details>
- [x] **7.L1** [P1] Saved games: "No games saved yet" shown when only the "unplayed" toggle filters everything out (`hasFilters` ignores it); date search matches the stored ISO date, not the shown date ("17.9." finds nothing); text search and the opponent filter disagree (raw vs normalised name). — ✅ #1011
- [x] **7.L2** [P1] Shootout shooter list offers the whole game list, not the squad (unlike every other match picker). — ✅ #1012
- [x] **7.L3** [P1] League / tournament / team selects drop an archived current value with no option (the field looks empty); New Game "prefill from plan" includes archived plans while the planner hides them. — ✅ #1013 (Match details; New Game selects unchanged)
- [x] **7.L4** [P1] Small list bugs: external-games list sorts React state in place during render and orders by entry time not game date; player game-log empty message always blames the club season; stats table says "No Players Match Filter" with no filter; Select All compares lengths only and selects in storage order; Leagues/tournaments say "No leagues yet" when only the search hides them; opponent "All teams" has no no-results text. — ✅ #1014
- [x] **7.L5** [P2] One player order everywhere: `sortPlayersByLastName` (last name → full name, locale 'fi') for every player list and select — scorer/assister/edit/captain/fair-play/shootout/note/voice inbox/assessments/stats combobox; the roster uses the shared helper. Team selects sorted by name; leagues/tournaments manager in the same order as their pickers (start date desc → name). — ✅ #1015
- [x] **7.L6** [P2, owner 2026-11-17: ignore accents] One shared text-match helper (`utils/listSearch`): case- and accent-insensitive (ä→a), every word must match (multi-word AND), per-list field sets: players = name + nickname + jersey; games = team, opponent (normalised), shown date, league, tournament. Adopted by every existing search box. — ✅ #1016
- [x] **7.L7** [P2] Consistent empty vs no-results states and one Show-Archived control (link with count, shown only when there is something archived). — ✅ #1017
- [x] **7.L8** [P2, owner 2026-11-17: "Name (nickname)"] One player-name format in every player list and dropdown: "Name (nickname)". — ✅ #1015
- [x] **7.L9** [P3] Search box in the squad / team-roster picker (50–100 players), and on the opponent chips field in Match details (bring the New Game chips). — ✅ #1018
- [x] **7.L10** [P3, owner 2026-11-17: remember per device] Lists remember their settings between visits on this device (Saved games filters/sort, roster sort, Show archived). — ✅ #1019
- [x] **7.L11** [P3, owner 2026-11-17: both] Sort options for Saved games (date default / opponent / result), and the official-league Level/Area filters in New Game as in Match details. — ✅ #1019 (Saved games sort) + #1020 (New Game league filters)
## Step 8 — Language and formats

- [x] **8.1** [medium] Language chosen in Settings is not persisted; Home toggle and Settings select disagree — ✅ #1026
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/hooks/useAppSettingsController.ts:87-94 (changeAppLanguage); src/i18n.ts:31-41 (loadLanguagePreference reads only localStorage) · src/components/StartScreen.tsx:343-375; src/hooks/useAppSettingsController.ts:60-69,87-94
  - **What goes wrong:** A coach opens Settings > Language and picks English. The whole UI switches at once, so the choice looks saved. On the next launch (or any reload, including the automatic 5-minute background reload and "Reload to apply" after an update) the app is back in Finnish. The same happens the other way round. The Home EN/FI toggle and the login-screen toggle do persist, so the two controls for the same setting behave differently. The value written by Settings (appSettings.language, synced to the cloud) is never read back anywhere, so a second device does not follow it either.
  - **Suggested fix:** Call saveLanguagePreference(next) in changeAppLanguage (one shared changeLanguage helper for all five call sites would stop this class recurring).
  - **Raw evidence:** `run3/J7-language-format.settings-language-not-persisted`, `run3/J7-language-format.language-controls-stale-state`

  </details>
- [x] **8.2** [medium] ~45-48 translation keys missing in both locales; hardcoded English aria-labels/titles — ✅ #1027
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 3 findings
  - **Where:** src/app/page.tsx:1566 (page.syncError), :1509, :1521, :725, :657; src/components/OpponentNameSweepModal.tsx:182-221; src/components/ExternalGamesSection.tsx:552,818,513,808; src/components/SettingsModal.tsx:333,421; src/components/HomePage/utils/newGameHandlers.ts:358; src/components/NewGameSetupModal.tsx:1479; src/hooks/useAppSettingsController.ts:214; src/components/SeasonTournamentManagementModal.tsx:335 · public/locales/{en,fi}/common.json; e.g. src/components/OpponentNameSweepModal.tsx:182-221, ExternalGamesSection.tsx:552,639-657,513,808, FieldContainer.tsx:522, PlayerStatsView.tsx:910,941,944, TeamListItem.tsx:74-170, SettingsModal.tsx:333,421, ToastProvider.tsx:138, page.tsx:657,725,1509,1521,1566, SoccerField.tsx:2433, GoalLogModal.tsx:376, RosterSettingsModal.tsx:201, PlayerAssessmentModal.tsx:123 · src/components/SeasonTournamentManagementModal.tsx:335 (`${type} actions`), UnifiedTeamModal.tsx:798,835 ("Tournament/Season placement for ..."), RulesDirectoryModal.tsx:50 ("Open ... in new window"); CloudAuthModal.tsx:500 and ReverseMigrationWizard.tsx:598 placeholder "DELETE" (typed-confirmation literal, check vs Finnish prompt)
  - **What goes wrong:** A Finnish coach in cloud mode whose background sync fails gets the toast "Failed to sync <internal entity type> to cloud. Changes saved locally." A failed backup restore says "Failed to restore backup. The file may be corrupted or invalid."; a failed new-game save says "Failed to save the new game. Please try again."; a partial factory reset warns in English that cloud data may remain. In normal use the opponent-name checker shows "All teams", "Rename any team, even one that is spelled the same way everywhere.", "Search teams" and "3 games"; the added-stats form label is "Season / Tournament"; the new-game tournament field is labelled "Series". Screen-reader labels such as "Toggle position labels", "season actions", "Decrease goals", "Goal Log", "Player Assessments" are English too. Messages that explain a failure are the ones a non-English reader most needs.
  - **Suggested fix:** Add the missing keys to both locale files; extend src/__tests__/i18n-validation.test.ts to fail when a t() key used in src/ is absent from the locale files.
  - **Raw evidence:** `run3/J7-language-format.untranslated-strings-in-finnish`, `run5/K-i18n-a11y.K1`, `run5/K-i18n-a11y.K11`

  </details>
- [x] **8.3** [medium] Auth error messages hardcoded in English — ✅ #1028
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** src/auth/SupabaseAuthService.ts:156-1179 (new AuthError("...")), src/contexts/AuthProvider.tsx:802,860,952,987,1018,1115,1145,1206,1220,1248,1300, src/components/AuthForm.tsx:149-152,192,223,255,301,332
  - **What goes wrong:** AuthForm shows error.message for every AuthError/NetworkError and result.error from AuthProvider. Those are English literals ("Invalid email or password...", "Too many requests...", "This email is already registered"), so Finnish users (default locale, Play Store users must sign in) see English on every sign-in/sign-up failure. AuthProvider also returns raw error.message for any Error type, so a non-AuthError (e.g. consent RPC / Postgres error) reaches setError unsanitized wherever result.error is displayed directly (AuthForm.tsx:98,123,135).
  - **Suggested fix:** Give AuthError a code and map codes to t() keys in the UI; return generic message from AuthProvider catch blocks.
  - **Raw evidence:** `run5/K-i18n-a11y.K5`

  </details>
- [x] **8.4** [medium] Dates and numbers not locale-aware (month.day on Home, decimal point, device-locale dates) — ✅ #1029
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 3 findings
  - **Where:** src/components/HomeDashboard.tsx:482 (UpcomingCard) and :542 (RecentCard) · src/components/GameStatsModal/components/TeamPerformanceCard.tsx:85,106,110; src/components/GameStatsModal.tsx:1577,1598,1602; src/components/GameStatsModal/components/PlayerStatsTable.tsx:154,175; src/components/PlayerStatsView.tsx:458-468; src/components/SeasonTournamentManagementModal.tsx:292; src/components/SettingsModal.tsx:979,993; src/components/TeamManagerModal.tsx:498; src/components/MetricTrendChart.tsx:25; src/utils/exportExcel.ts:336,356,761 · src/components/HomeDashboard.tsx:542 (date.slice(5).replace("-",".") gives "09.19" month.day), SeasonTournamentManagementModal.tsx:292 (raw ISO "2026-10-03 - 2026-10-03"), GameStatsModal.tsx:1577,1598,1602, TeamPerformanceCard.tsx:85-110, PlayerStatsView.tsx:458-468,106 (toFixed gives "57.1%" with a point), TeamListItem.tsx:116 & TeamManagerModal.tsx:498 & MetricAreaChart.tsx:21 & SparklineChart.tsx:18 (toLocaleDateString() with no locale = browser locale, not app language), exportExcel.ts:336,356,761,918,1023 (toLocaleString() default), PlayerAssessmentModal.tsx:109 (manual d.M.yyyy even in English)
  - **What goes wrong:** A coach books a fixture for 3 October. The upcoming strip on Home shows it as "10.03." - with the trailing dot, exactly the Finnish form for 10 March. Recent results show "09.26", "09.19", "09.12". For any date with day 12 or lower the chip is a valid but wrong Finnish date (5 September shows "09.05" = 9 May). The big card on the same screen shows the same match correctly as "la 26.9.", so the two parts of Home disagree.
  - **Suggested fix:** Use formatDayMonth(game.date) in both cards.
  - **Raw evidence:** `run3/J7-language-format.home-chip-date-month-day`, `run3/J7-language-format.formats-ignore-app-language`, `run5/K-i18n-a11y.K10`

  </details>
- [x] **8.5** [medium] Launching in English: Finnish "Ladataan…" and a hydration error — ✅ #1030
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/i18n.ts:60-78 (init then loadLanguagePreference in a microtask); src/app/page.tsx:1727; src/app/layout.tsx:57 · src/i18n.ts:60-77 (async loadLanguagePreference), src/components/StartScreen.tsx:291-346 (only a few screens guarded)
  - **What goes wrong:** A coach who uses the app in English opens it. The server-rendered HTML says "Ladataan..."; the client has already switched i18n to English before React hydrates, renders "Loading...", and React throws "Hydration failed because the server rendered text did not match the client" and regenerates the whole tree on the client. The coach sees a Finnish flash on every start, and each English launch produces a recoverable error (the Sentry issues MATCHOPS-LOCAL-8K / -3 named in the code comments are this class). The comments in StartScreen, LoginScreen and useAppSettingsController assume i18n is still "fi" at hydration; it is not.
  - **Suggested fix:** Apply the stored language after hydration (in an effect in I18nInitializer), or render the pre-hydration loading text without i18n. Set document.documentElement.lang at the same point.
  - **Raw evidence:** `run3/J7-language-format.hydration-mismatch-english`, `run5/K-i18n-a11y.K9`

  </details>
- [x] **8.6** [medium] <html lang> always "fi" — ✅ #1030
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/app/layout.tsx:57 · src/app/layout.tsx:57; no document.documentElement.lang assignment anywhere in src/
  - **What goes wrong:** An English-language coach using a screen reader hears the English UI read with Finnish pronunciation rules, and browser features that key on the page language (hyphenation, translate prompt, spellcheck language in the notes and report text boxes) treat the English text as Finnish.
  - **Suggested fix:** Set document.documentElement.lang from an i18n languageChanged listener.
  - **Raw evidence:** `run3/J7-language-format.html-lang-always-fi`, `run5/K-i18n-a11y.K8`

  </details>
- [x] **8.7** [low] Plural forms for one are wrong in both languages — ✅ #1031
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** public/locales/fi/common.json: gameStatsModal.wrapUpVoiceNotes, dictation.clipCount, dictation.transcribe, dictation.transcribeDone, teamManager.playersCount, reportDraft.usedIn, opponentSweep.applied, syncStatus.pendingTitle, cloudSync.pendingSync.warning, reverseMigration.preview.* (same keys in en) · CloudSyncSection.tsx:506-510,648; FormationPicker.tsx:84; TeamManagerModal.tsx:493; SyncStatusIndicator.tsx:132,223,233; PendingSyncWarningModal.tsx:130,136; GameWrapUpCard.tsx:58; OpponentNameSweepModal.tsx:85,221; HeadToHeadCard.tsx:120; DictationInbox.tsx:320-372 and others
  - **What goes wrong:** After a match with a single dictated note the wrap-up checklist says "1 äänimuistiinpanoa käsittelemättä" / "1 voice notes to review" and the button "Litteroi 1 klippiä" / "Transcribe 1 clips". One pending change shows "1 muutosta odottaa synkronointia" / "1 changes waiting to sync"; a team with one player "1 pelaajaa" / "1 players"; an opponent met once "1 games".
  - **Suggested fix:** Split these keys into _one/_other in both locale files.
  - **Raw evidence:** `run3/J7-language-format.count-one-plural-forms`, `run5/K-i18n-a11y.K14`

  </details>
- [x] **8.8** [low] "Cannot delete" dialog mixes languages; "{count}" printed literally in player stats — ✅ #1032
  <details><summary>Details</summary>

  - **Verification:** confirmed · merged from 2 findings
  - **Where:** src/components/DeleteBlockedDialog.tsx:71-92; summary built in src/datastore/LocalDataStore.ts:2534,2586,2685 and src/datastore/SupabaseDataStore.ts:4697,4770,5064; public/locales/fi/common.json:3471 · src/components/PlayerStatsView.tsx:941-944
  - **What goes wrong:** A Finnish coach tries to delete a season, tournament or team that has games. The dialog reads: "Tämä sarja on used by 7 games and 1 team." and then "siirrä pelit toiseen sarjan tai poista ne" (for a tournament "toiseen turnausn", for a team "toiseen joukkuen"). The reason the delete is blocked - the one thing the dialog exists to explain - is in English.
  - **Suggested fix:** Build the sentence in the dialog from the reference counts with translated, pluralised keys; give the Finnish hint one full string per entity type instead of a suffix.
  - **Raw evidence:** `run3/J7-language-format.delete-blocked-dialog-mixed-language`, `run3/J7-language-format.player-stats-other-seasons-count-placeholder`

  </details>
- [x] **8.9** [low] Inconsistent Finnish terminology and capitalisation; "Violetti" twice in the colour list — ✅ #1033
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep) · merged from 2 findings
  - **Where:** public/locales/fi/common.json:1739 (numPeriodsLabel "Erien lukumäärä") vs :598,1087,1294 ("Jaksot"); title-cased labels "Kirjaa Maalitapahtuma", "Ottelun Tiedot", "Lisää Pelaaja" · public/locales/fi/common.json:1565 ("purple") and :1576 ("violet")
  - **What goes wrong:** Same setting is called Jaksot in new game and Erien lukumäärä in match details; confirms screenshot observation. Cosmetic.
  - **Suggested fix:** Rename one (e.g. violet -> "Liila") and add a space before the parenthesis.
  - **Raw evidence:** `run5/K-i18n-a11y.K13`, `run5/K-i18n-a11y.K12`

  </details>

## Step 9 — Test-suite hygiene

Tests tied to specific bugs are listed with those bugs above. These are the remaining, cross-cutting ones.

- [x] **9.1** [medium] Backup tests use hand-built backups; add an export→import round trip over a populated store — ✅ #1037
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** src/utils/fullBackup.test.ts:519-1000 (2601 lines)
  - **What goes wrong:** Restore tests feed crafted JSON and assert localStorage-like keys. Only 'teams and rosters' (l.655) and planner stores (l.715) resemble round trips. There is no test that export of a fully populated store (games with assessments, adjustments, personnel, settings incl. club-season dates) restored into an empty store equals the original; run1 found restore recomputes club season with wrong dates, which such a test would catch.
  - **Suggested fix:** Add property-style round trip comparing deep-equal state after export/import.
  - **Raw evidence:** `run5/L-test-quality.backup-restore-roundtrip-lacks-full-fidelity`

  </details>
- [x] **9.2** [medium] No automated tests for Supabase migrations, RPCs, RLS or grants — ✅ #1046 (scripts/supabase-staging-smoke.sh, on demand)
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** supabase/migrations; supabase/functions/*/index.test.ts only
  - **What goes wrong:** Run1 C-supabase findings (anon EXECUTE on service-only functions, dangling FK, upsert omits cleared fields) are in SQL that is only covered by mocked client tests. Only edge functions delete-account and verify-subscription have tests. CLAUDE.md itself notes migrations must apply from scratch but nothing in CI checks it.
  - **Suggested fix:** Add a staging-based SQL smoke script (grants/RLS assertions) run on demand.
  - **Raw evidence:** `run5/L-test-quality.no-sql-rls-migration-tests`

  </details>
- [x] **9.3** [medium] Service-worker tests cover registration only, not the update flow — ✅ #1045 (update reload saves first; real SW path stays in the Playwright spec)
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** src/__tests__/pwa/service-worker.test.ts; src/components/__tests__/ServiceWorkerRegistration.test.tsx; tests/e2e/pwa-offline.spec.ts
  - **What goes wrong:** Tests verify registration and file content patterns; the real activate/update path with a new SW version while the app has unsaved match state is only in Playwright specs that are excluded from jest and (per jest.config.js) not run by npm test.
  - **Suggested fix:** Add e2e update scenario to CI or document manual checklist.
  - **Raw evidence:** `run5/L-test-quality.service-worker-update-test-is-shallow`

  </details>
- [x] **9.4** [medium] Storage/DataStore mocked away in tests that claim to cover flows — ✅ #1047 (shared real-store helper; planner wiring tested end to end)
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** src/services/__tests__/legacyMigrationService.test.ts:20-22; src/utils/playtimePlanner/{gameSubs,planLinks,storage}.test.ts; src/datastore/factory.test.ts
  - **What goes wrong:** Mocks of '@/datastore/factory' (9 files) and storageFactory return hand-built DataStore objects, so shape or semantics drift (e.g. real getGames returns migrated/club-season-computed records, real saveGame validates) is never detected. Mock stores accept any call and return success, so error paths of the real store (validation failure, quota) are untested in these flows.
  - **Suggested fix:** Provide a shared in-memory DataStore fake backed by LocalDataStore on fake-indexeddb for flow tests.
  - **Raw evidence:** `run5/L-test-quality.full-datastore-mocked-away-in-integration`

  </details>
- [x] **9.5** [medium] Console-failure allowlist swallows generic messages — ✅ #1038 (act() warning still global; follow-up)
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** src/setupTests.mjs:186-285
  - **What goes wrong:** Allowlist uses substring match on very generic strings ('Failed to save', 'Failed to load', 'Failed to delete', 'Failed to fetch', 'Failed to initialize', 'Error saving game', 'out of bounds', 'Game with ID') plus whole-module tags ([SyncEngine], [SyncExecutor], [SupabaseDataStore], [MigrationService], [StorageFactory], [backendConfig], [factory]) and 'was not wrapped in act(...)'. Any real regression logging via those prefixes in any test is silently tolerated, in particular the sync/migration modules where run1 found most highs. Also unhandled rejections are 'allowed' (l.136).
  - **Suggested fix:** Scope allowances per test via a helper (expectConsoleError) and drop module-wide tags and the act() allowance.
  - **Raw evidence:** `run5/L-test-quality.console-allowlist-too-broad`

  </details>
- [x] **9.6** [medium] Fixed setTimeout waits in tests (CLAUDE.md forbids) — ✅ #1036
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** 14 files: src/utils/storageMetrics.test.ts, savedGames.test.ts, lockManager.test.ts, storageMutex.test.ts, src/contexts/__tests__/AuthProvider.test.tsx:586, src/components/__tests__/VenueInput.nameField.test.tsx, VenueInput.addressField.test.tsx, src/services/__tests__/legacyMigrationService.test.ts:498,519,540, src/datastore/factory.test.ts:301,331, src/sync/__tests__/SyncQueue.test.ts:173 (50ms), src/components/HomePage/hooks/__tests__/useGameDataManagement.test.tsx, tests/integration/edge-cases.test.tsx, tests/performance/*.test.ts
  - **What goes wrong:** Real-time sleeps make tests either flaky on slow CI or pass before the awaited work finishes (a 50ms/0ms sleep can end before the async work, so the assertion runs against not-yet-updated state or is trivially true). Some (setTimeout 0) are just microtask flushes and acceptable but should use act/waitFor.
  - **Suggested fix:** Replace with waitFor/fake timers.
  - **Raw evidence:** `run5/L-test-quality.fixed-timeouts`

  </details>
- [x] **9.7** [low] Skipped tests, assertions that can never fail, argument-less toHaveBeenCalled() — ✅ #1035
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep) · merged from 3 findings
  - **Where:** src/hooks/__tests__/useSyncStatus.test.ts:342 (sync engine init failure); src/contexts/__tests__/SubscriptionContext.test.tsx:82,86 (none/expired status) · src/utils/storageAdapter.test.ts:196 (expect(true).toBe(true) 'Placeholder'); src/hooks/__tests__/usePersonnel.test.tsx:483,486 (waitFor(() => expect(true).toBe(true))) · 766 occurrences of toHaveBeenCalled() across src tests, 41 toBeTruthy/expect.anything; 201 toBeDefined-only lines
  - **What goes wrong:** Three it.skip remain, one on a sync-engine failure path. CLAUDE.md prohibits skipping.
  - **Suggested fix:** Fix or delete with replacement.
  - **Raw evidence:** `run5/L-test-quality.skipped-tests`, `run5/L-test-quality.vacuous-assertions`, `run5/L-test-quality.weak-assertions-volume`

  </details>

## Step 10 — Docs and low-value storage hygiene

- [x] **10.1** [medium] Staging project ref disagrees across docs — ✅ #1039
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** CLAUDE.md (staging = uncyxrffqrloypgjalzz, created 2026-06-22) and .env.development:7,18 vs docs/03-active-plans/README.md:38 (hwcqpvvqnmetjrwvzlfr) and the auto-memory MEMORY.md
  - **What goes wrong:** Someone following the active-plans README or memory to apply a migration via the Management API curl in CLAUDE.md hits the wrong (likely deleted) project, or worse, mistakes which project is staging while prod is aybjmnxxtgspqesdiqxd. Code (.env.development) agrees with CLAUDE.md, so the README is stale.
  - **Suggested fix:** Fix README ref to uncyxrffqrloypgjalzz; update memory file.
  - **Raw evidence:** `run5/M-docs-drift.D3`

  </details>
- [x] **10.2** [medium] USER_MANUAL.md (published) omits most shipped features — ✅ #1048 (site guide covers the features; USER_MANUAL points to it)
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** docs/USER_MANUAL.md (0 hits for planner, voice, rulebook, Taso, assessment, Excel, friendly); docs/QUICK_START.md
  - **What goes wrong:** The published manual covers only roster/game-day basics while the store listing (docs/04-features/store-listing-en.txt) advertises playing-time planner, voice notes, rules directory/rulebook, Taso copy-out, player summaries, Excel export. Coaches following the manual cannot find these features. Check the site/content/guide/*.mdx is the actual guide; two parallel manuals drift.
  - **Suggested fix:** Either add sections or retire docs/USER_MANUAL.md in favour of site/content/guide and drop it from ALLOW_FILES.
  - **Raw evidence:** `run5/M-docs-drift.D4`

  </details>
- [x] **10.3** [low] README and docs README still promise local mode / no account — ✅ #1039
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** README.md:7,18-25,111,137; docs/QUICK_START.md; CLAUDE.md 'Dual-Mode Operation'
  - **What goes wrong:** README sells 'works offline, no account needed, zero setup'; USER_MANUAL.md:25 says Welcome Screen invites to sign in and Play build is cloud-only. Roadmap P0 listed this mismatch; README partially patched (line 22 note) but headline claims remain. Visitors/reviewers get contradictory promises.
  - **Suggested fix:** Make headline reflect Play (cloud) vs web (local) distinction consistently.
  - **Raw evidence:** `run5/M-docs-drift.D5`

  </details>
- [x] **10.4** [low] CLAUDE.md and active-plans README list "stop publishing internal docs" as open; done in PR #435 — ✅ #1039
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep)
  - **Where:** CLAUDE.md 'What's Next'; docs/03-active-plans/README.md:'Current Focus (P0)' items 1-3; docs/03-active-plans/README.md:3 'Last Updated 2026-06-10'
  - **What goes wrong:** UNIFIED-ROADMAP.md:39 says DONE 2026-06-18 with allowlist in site/scripts/copy-docs.js (verified: only QUICK_START.md and USER_MANUAL.md copied, site/pages/docs has just those). The README still says copy-docs publishes 11-blueprint + archive tarball, and store-listing accuracy (roadmap:23 says published 2026-09-10). A future reader/agent would redo or mistrust the work. Same for the get_user_consent item, if fixed.
  - **Suggested fix:** Update the P0 lists to point at the roadmap rather than duplicating status; refresh Last Updated dates.
  - **Raw evidence:** `run5/M-docs-drift.D2`

  </details>
- [x] **10.5** [low] Stale counters/dates, billing docs describing a parked feature, internal material and a 580 KB tarball tracked, minor Supabase-rule drift — ✅ #1040 (file removals left to owner)
  <details><summary>Details</summary>

  - **Verification:** unverified (Sonnet sweep) · merged from 4 findings
  - **Where:** CLAUDE.md Quick Stats '~4,500+ tests' and 'Last Updated 2026-06-10'; docs/README.md:11 'February 2026', :15, :111, :135; docs/03-active-plans/README.md:3; MEMORY.md 'Next migration number: 029' · docs/04-features/play-billing-implementation.md (852 lines, 'Implementation Complete'); CLAUDE.md Edge Functions line; roadmap line 145 (Play Billing removed from 1.0.8 TWA) · docs/08-archived.tar.gz (tracked), DEVELOPER_PROFILE.md, TESTING-PLAN.md, AGENTS.md at repo root, docs/07-business, docs/11-blueprint · CLAUDE.md Rules 1-2 (line refs to LocalDataStore 1337/1342, 'Rule 17 No Locks'), SupabaseDataStore.ts:3108,3112,3311
  - **What goes wrong:** Repo has 56 files in supabase/migrations (latest 053_player_adjustments_positions_scope.sql, plus README.md) and ~378 test files; memory claims next migration is 029, so a new migration numbered 029 would collide/sort wrongly and fail from-scratch apply. Version stated 1.0.0 in package.json vs Play AAB 1.0.8.
  - **Suggested fix:** Next migration is 054; remove hard counters or generate them; update memory.
  - **Raw evidence:** `run5/M-docs-drift.D6`, `run5/M-docs-drift.D7`, `run5/M-docs-drift.D8`, `run5/M-docs-drift.D9`

  </details>
- [x] **10.6** [low] storage.ts retry loops never retry (missing await) — ✅ #1021
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/utils/storage.ts:869, :914, :954, :989
  - **What goes wrong:** A transient IndexedDB failure hits a read or write made through getStorageItem, setStorageItem, removeStorageItem or clearStorage (backup-reminder timestamps, the subscription cache, conflict backups, the hard reset). The documented three attempts with backoff do not happen: the rejection leaves the function directly, the first failure is final, and the user-friendly error mapping is skipped as well. Only adapter creation failures are retried.
  - **Suggested fix:** Use `return await adapter.getItem(key)` (and the same for setItem, removeItem and clear) so rejections reach the retry loop.
  - **Raw evidence:** `run1/A-local-storage.storage-helper-retries-never-run`

  </details>
- [x] **10.7** [low] "Before reset" and "Before restore" restore points evicted by daily snapshots — ✅ #1022
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/utils/backupSnapshots.ts:145-161 (rotate), :237-243
  - **What goes wrong:** A coach factory-resets or restores the wrong backup by mistake. The only copy of the previous data is the 'pre-clear' or 'pre-restore' restore point. Rotation keeps the five newest snapshots whatever their reason, and an automatic snapshot of the new (empty or wrong) data is taken on each day the app is opened. After five days of normal use the pre-reset restore point is deleted and the old data cannot be recovered on the device.
  - **Suggested fix:** Rotate automatic snapshots separately from pre-clear and pre-restore ones (for example keep the newest one or two of those regardless), and skip automatic snapshots when the data is empty or unchanged.
  - **Raw evidence:** `run1/A-local-storage.restore-points-evicted-by-auto-snapshots`

  </details>
- [x] **10.8** [low] Restore and legacy import recompute club-season labels with stale dates — ✅ #1034
  <details><summary>Details</summary>

  - **Verification:** confirmed
  - **Where:** src/datastore/LocalDataStore.ts:1293, :1522 (upsertSeason, upsertTournament), :2483 (clearAllUserData); src/utils/fullBackup.ts:1012-1030, :1090
  - **What goes wrong:** A coach who configured non-default club-season start and end dates restores a backup. Seasons and tournaments are restored before settings, and upsertSeason and upsertTournament discard the stored clubSeason and recompute it from the current season dates, which at that point are either the cached pre-restore dates or the defaults, not the dates in the backup. Seasons and tournaments whose start date falls between the two boundaries get the wrong club-season label ('24/25' instead of '25/26'), shown next to the name and used in the duplicate-name check, until each one is edited and saved.
  - **Suggested fix:** In upsertSeason and upsertTournament keep the incoming clubSeason when present (`season.clubSeason ?? calculateClubSeason(...)`), or restore settings before seasons and tournaments, and reset seasonDatesCache in clearAllUserData.
  - **Raw evidence:** `run1/A-local-storage.restore-recomputes-club-season-with-wrong-dates`

  </details>

- [x] **10.9** [low] Global `body > div { height: 100% }` rule applies to everything rendered straight into `<body>` — ✅ #1042 (focus-trap target -> 10.9b)
  <details><summary>Details</summary>

  - **Verification:** found while fixing 1.1; not yet investigated
  - **Where:** src/app/globals.css:40-44 · elements rendered as direct children of `<body>`: ModalPortal, GuidedTourOverlay, FormationPicker (desktop dropdown), GameContainer portal, the offline banner · src/hooks/useFocusTrap.ts:38 relies on `body > div:first-child`
  - **What goes wrong:** the rule is meant for the app root, but any fixed element without its own height that ends up under `<body>` becomes full-screen (this is how 1.1 happened). The formation picker's desktop dropdown may be affected.
  - **Suggested fix:** scope the rule to the app root (e.g. a dedicated id on the root wrapper) and check every portal's layout and the focus-trap selector before and after.
  - **Raw evidence:** this checklist, item 1.1

  </details>
- [x] **10.9b** [medium] *(found while fixing 10.9, verified in a real browser)* The focus trap never makes the app inert behind an open dialog: `useFocusTrap` marks `body > div:first-child` inert, which in the real DOM is Next's hidden `<div hidden>` boundary - keyboard and screen-reader users can reach the app behind every dialog. Fix needs care: 13 of the 14 focus-trapped dialogs render inside the app tree, so marking `#app-root` inert would disable them too. Options: portal every dialog to `<body>` (ModalPortal) and then inert `#app-root`, or inert the dialog's sibling subtrees. — ✅ #1044 (portalled dialogs; inline dialogs trap focus + aria-modal)
- [x] **10.9c** [low] *(dev only)* Under React StrictMode (development) `useMultiTabPrevention` shows "MatchOps is already open" in a single tab: the double effect's cleanup releases the Web Lock only on a 500 ms poll, so the second mount's `ifAvailable` request finds it held. Production is unaffected; fix by resolving the held promise directly on cleanup. — ✅ #1043

---

## Step 11 — Investigations (after the bug steps, before the product track)

- [x] **11.1** [investigate, owner request 2026-11-17] **Overtime (extra time) as a timer entity.** The app has no extra time: a match is `numberOfPeriods` × `periodDurationMinutes`, then (optionally) a penalty shootout. Investigate what real extra time would need, and write a plan before any code: — ✅ plan written 2026-11-17 (below); owner decisions 2026-11-17 (extra-time score shown separately); shipped in 3 steps: #1049 clock structure, #1050 data + migrations 060/061 (staging + prod), #1051 full-time choice, ET clock, separate extra-time score
  - **Rules:** where junior and adult games use it (cups and knockout tournaments, finals; futsal), typical formats (2 × 5 / 2 × 10 / 2 × 15 min, golden goal), and whether it is configured per tournament, per game or at the end of regulation.
  - **Clock:** how extra-time periods fit the reducer (`useGameSessionReducer`), period/boundary logic (`boundaryStop`, `periodEnd`/`gameEnd`), `useGameTimer`, the per-game wall-clock anchor (`timerAnchor.ts`), the "End period now" path (4.31) and the 12 rules in "Match Clock Architecture" (`docs/02-technical/architecture.md`).
  - **Data:** new game fields (e.g. extra-time period count/length, whether it was played), the empty-string/NULL transform rules and a Supabase migration, backups, and older games without the fields.
  - **Everything reading periods or minutes:** goal times and the event log, playing-time minutes and the planner (`playtimePlanner`), stats (results: win after extra time vs penalties, `resolveGameResult`), recap and Taso text, Excel export, the large timer overlay and the period labels.
  - **UI:** how the coach starts it at full time (offer "Extra time / Penalties / End"), and how it shows in the match bar and wrap-up.
  - **Output:** a short plan with the minimal useful version, the risks to the clock, and the open owner decisions.
  - **Plan (2026-11-17):**
    - **What exists:** a manual `wentToOvertime` flag (reducer, DB column from 021, TimerOverlay/GameSettings toggles, "OT" badge) with no clock; penalties are a free `shootoutKicks[]` log. `resolveGameResult` already gets "won after extra time" vs "won on penalties" right (extra-time goals are ordinary goals).
    - **Why it's not trivial:** the clock assumes `period × periodDurationMinutes × 60` in ~9 places (reducer `boundaryStop`/`START_PERIOD`/load, `useGameTimer` tick + end-period-now + start anchor, boot recovery, `clockContinuation`, TimerOverlay), and `numberOfPeriods`/`currentPeriod` are capped at 2 in the type, the zod schema, the DB CHECK and `savedGames` validation - a period-3 game would fail import.
    - **MVP:** at full time the overlay offers **Extra time / Penalties / End**. Extra time asks 1 or 2 periods × N min (soccer 2×15, futsal 2×5 pre-filled), runs them as periods 3-4 with the normal break/Start flow, then offers Penalties / End.
    - **Design:** two optional game fields `extraTimePeriods` (0-2) and `extraTimeMinutes`; `numberOfPeriods` stays the regulation count. Migration 060 adds the columns and re-creates `save_game_with_relations`. One pure module (`utils/matchStructure.ts`: period start/end seconds, total periods, is-extra-time) replaces every hard-coded formula - with 0 extra periods it is identical to today, so the 12 clock rules and their tests hold. One action `START_EXTRA_TIME` (only from full time, never automatic, not undoable; regulation length locked once extra time exists).
    - **Readers:** period labels ("ET 1/2"), wrap-up/recap/Taso ("after extra time"), Excel rows, AI packet; the playtime planner stays regulation-only and its reminders stop at full time (medium risk - check).
    - **Tests:** table tests for matchStructure (0 = old formula), reducer/timer boundary tests, the timer-restore scenario bench (killed during extra time, killed past its end, undo after starting), transform round trips for both stores, a legacy backup importing unchanged.
    - **Owner decisions (recommended default):** (1) choose at full time vs per tournament [full time, defaults pre-filled]; (2) offer only when level [always, highlighted when level]; (3) allow 1 × N [yes]; (4) golden goal [no - IFAB dropped it]; (5) keep the manual Overtime toggle [yes, as a flag]; (6) planner/reminders during extra time [no for the MVP]; (7) show the 90-min score separately [no - total + "after extra time"].
    - **Owner answers 2026-11-17:** 1-6 as recommended. 7 changed: show the final score AND the extra-time score separately (e.g. "3-2 (extra time 1-0)"), so it is clear how the match went - in the recap, wrap-up and the Taso report. The extra-time score is derived from goal events after the regulation end (no extra field).
    - **Rules context (assumed - Palloliitto competition rules not fetched):** IFAB max 2 × 15 then penalties; adult cups 2 × 15, futsal knockouts 2 × 5; many junior tournaments go straight to penalties or play 1-2 × 5.

## Product track (from `review-2026-11/run2/PRODUCT-REVIEW.md`)

**Verdict:** a very good tool for an organised Finnish junior coach; not yet a good product for a stranger installing from Play.
- **Best parts:** the playing-time planner, the planned-sub prompt, and the Taso export.
- **Core weakness:** the plan stops at the touchline. "Selvä" only dismisses the prompt, so the planned sub is never performed or recorded.

**Owner decisions (2026-11-11), overriding the review:**
- **Rejected: one-tap planned sub that records minutes** (review #1). The planner is advisory by design. Live games rarely follow the plan (injuries, changes), and in-game tapping would produce inaccurate playing-time data. Precise minute tracking will not be built.
- **Rejected: "games played" must mean played** (review #4). In junior games every selected player plays, so squad selection is the right proxy. A pre-game absence is handled by removing the player from that game's squad.
- **Still open:**
  - The planned-sub reminder should read as a glanceable prompt, not an action. Its "Selvä" / "Vaihto tehty" buttons are ambiguous.
  - Decide what reminders do once the game leaves the plan, e.g. pause plan reminders.
- **Main product concern: complexity and adoption barrier.**

**Production funnel (2026-11-11)**: aggregate counts only, all sign-ups 10 Feb–24 Oct 2026, excluding the owner's account.

| Stage | Users | Lost at this step |
|---|---|---|
| Accounts | 45 | |
| Email confirmed | 40 | 5 at the email code |
| Added players | 30 | **10, the empty-app barrier** |
| First game | 24 | 6 |
| 3+ games | 9 | **15, the week-two barrier** |
| 10+ games | 3 | |
| Active last 30 days | 4 | |

Other figures:
- 11 users opened the planner.
- 17 created a team.
- Terms consent rows: 56, from 41 live users plus 4 deleted accounts, so the earlier "80 consents" included marketing rows.

Conclusion: the loss is after sign-up, not at the sign-up form.
**Onboarding redesign (2026-11-11):** the final plan is `review-2026-11/onboarding/FINAL-PLAN.md`. It is local-only; move it into `docs/03-active-plans/` if adopted.
- Lifecycle concept: a reveal at first use, a weekly loop, Vuorot, and Alku/Rutiini/Kausi/Oma stages.
- Phases 0-6, with 29 owner decisions (D1-D29), each with a recommended default.
- Mocks (v2, lifecycle): https://claude.ai/artifact/7HCoabML7mSSmATML9XTYF
- Prerequisite bugs found:
  - `usePlannedSubPrompts.ts:130` hides any planned sub that brings a starter back.
  - The planner suggester (`suggest.ts:129`) gives bench players beyond the slot count zero minutes.

**Top recommendations (after owner decisions):**
1. Lower the barrier for new coaches. Covers review items 3, 6, 7, 8, 13, 16; see below.
2. A ~6-week feature freeze while recruiting ~30 coaches with 3+ matches each.
3. Rewrite the sign-up screen and store headline (they currently sell "cloud sync").
4. Default stats sort by games, not points, for recreational age groups. This is the owner's values call.

Then: smart new-game defaults (e.g. not 11v11 positions for 8v8), a one-screen new game, vibration for sub due / period end, declutter match controls, an advanced-features switch, share the plan as an image, Google sign-in.

The review also lists 18 quick wins and a must-not-change list.

**Biggest risk:** building instead of distributing. 741 commits since June, with ~8 retained coaches.

**Open questions for the owner** (they decide the product track's order):
1. What do the 80 consents count?
2. Are plan-backed minutes acceptable?
3. Should a P12 team be ranked by points?
4. Who is the user, in one sentence?
5. Personal tool or product meant to grow?
6. Was the go-to-market plan run?
7. Has anyone at Palloliitto/Torneopal been contacted?
8. Is local mode coming back?
9. What is the realistic maintenance budget?
10. Is Google OAuth the only blocker for Google sign-in?
11. What does a second coach on the same team need?

Full text in the product review.

---

# Deep Code Review — Confirmed Findings (2026-06-25)

**Method:** read-only multi-agent adversarial review. 9 review dimensions (data-persistence, sync, deletion, auth, game-state/timer, performance/memory, stats, UI/orchestration, edge/security) → **37 candidate findings** → an independent skeptic tried to *refute* each → **24 refuted, 13 confirmed**. Two of the confirmed were the same root cause (account-deletion teardown), so **12 distinct issues** below. Severities are the verifiers' final calls (some were tempered from the original — e.g. deletion is "high" not "critical" because the data is soccer stats, not sensitive PII).

**Scope reminder:** findings only. No fixes applied. We triage which to fix and in what order separately.

Priority order: **data-loss / corruption / deletion / auth first**, then logic, then low-impact.

---

## 🔴 HIGH

### H1 · Account deletion never erases the local database (erasure silently fails) — ✅ Fixed in #520
**`src/contexts/AuthProvider.tsx:972-983`** + `src/datastore/userDatabase.ts:169-217`, `src/datastore/factory.ts:414-434`
*(merges two confirmed findings with the same root cause.)*
`deleteAccount()` calls `deleteUserLocalDatabases()` but never closes the open DataStore connection (no `closeDataStore()`/`resetFactory()`). `indexedDB.deleteDatabase()` on an **open** connection fires `onblocked`, which the code treats as success and resolves (3s timeout also resolves anyway) — so the delete never completes. The local mirror of all the user's data (`matchops_user_{id}`, `matchops_sync_queue_{id}`) survives on disk after they delete their account. The in-code comment claiming "sign-out teardown has begun closing the adapter" is factually false for this path. **Triggers on every cloud-mode account deletion.**
**Fix:** `await closeDataStore({ force: true })` (or `resetFactory` + `closeUserStorageAdapter`) *before* `deleteUserLocalDatabases`, so connections release and the delete can complete. *(confidence ~0.8)*

### H2 · Corrupted saved-games blob → next save wipes ALL games — ✅ Fixed in #521
**`src/datastore/LocalDataStore.ts:2651-2668` (loadSavedGames)** feeding `saveGame`/`saveAllGames`/`addGameEvent`
`loadSavedGames()` catches a JSON.parse failure (or non-object value) and returns `{}` (empty). Every mutating method is read-modify-write: it reloads, mutates, then writes the **whole** object back. So if the stored blob is ever corrupt, the read yields `{}` and the next auto-save (which fires constantly during a match) persists only the single active game — **permanently destroying every other saved game**. No user error, no recovery; `storageRecovery` is never invoked on this path. Trigger is external/on-disk IndexedDB corruption or a non-object legacy/migration value (lower probability, catastrophic impact — a whole season's games).
**Fix:** on parse failure, quarantine the bad blob under a timestamped key and/or throw `CORRUPTED_DATA` to abort the destructive overwrite — never silently return `{}` and overwrite. *(confidence ~0.83)*

### H3 · "Save & Continue" discards the game even when the save silently failed — ✅ Fixed in #522
**`src/components/HomePage/hooks/useGameOrchestration.ts:2167-2172`**
The "Save Current Game?" path (new game from an unsaved scratch session) awaits `handleQuickSaveGame()` then unconditionally opens new-game setup. But `handleQuickSaveGame` catches all errors internally and never rethrows, so the `await` resolves even when the save **failed** (quota, IndexedDB error on mobile). The scratch game — which has no auto-save (intentionally disabled for `DEFAULT_GAME_ID`) — is then abandoned and **permanently lost**, despite the user explicitly choosing to save.
**Fix:** have `handleQuickSaveGame` return a boolean / rethrow; only proceed when the save actually succeeded, otherwise keep the dialog open and show an error to retry. *(confidence ~0.72)*

### H4 · exportPlayerExcel double-counts external adjustments — ✅ Fixed in #523
**`src/utils/exportExcel.ts:785-799`**
`playerData` already includes external-adjustment deltas (merged in `useGameStats.ts:158-162`), but the exporter adds the same deltas a second time. The per-player Excel "Player Summary" shows **double** the external games/goals/assists vs the on-screen numbers (and inflated averages/points). Triggers whenever an exported player has any external adjustment.
**Fix:** don't re-add deltas in the exporter — use `playerData.gamesPlayed/goals/assists` directly (single source of truth). *(confidence ~0.85)*

---

## 🟠 MEDIUM

### M1 · `totalGames` counts a 0-game adjustment as 1 game — ✅ Fixed in #524
**`src/utils/playerStats.ts:226-233`** — `sum + (adj?.gamesPlayedDelta || 1)`. A legitimate goals/assists-only correction with `gamesPlayedDelta=0` evaluates `0 || 1 = 1`, inflating total games and skewing `avgGoalsPerGame`/`avgAssistsPerGame`. The per-season path just above correctly uses `|| 0`, so the two are inconsistent.
**Fix:** `adj?.gamesPlayedDelta ?? 1` (nullish). *(confidence ~0.8)*

### M2 · Stale timer anchor survives a game switch → mis-resumes the clock — ✅ Fixed in #525
**`src/components/HomePage/hooks/useGamePersistence.ts:551`** (and `useSavedGameManager.ts:222`). Load paths call `clearTimerState()` (IndexedDB) but not `clearTimerAnchor()` (the localStorage wall-clock anchor). Switch away from a running game without pausing, come back to it, reload → boot replays the stale anchor and attributes the inter-session gap as elapsed match time, auto-resuming a wrong clock. (Bounded by the period cap; affects only the live clock, not saved records.)
**Fix:** `clearTimerAnchor()` alongside `clearTimerState()` in both load paths. *(confidence ~0.72)*

### M3 · Destructive confirm dialogs can double-fire — ✅ Fixed in #526
**`src/components/HomePage/containers/ModalManager.tsx:559-601`** — the noPlayers/hardReset/saveBeforeNew/startNew `ConfirmationModal`s don't pass `isConfirming`, so the confirm button isn't disabled while the async handler is in flight. A mobile double-tap on **saveBeforeNew** fires two concurrent `handleQuickSaveGame()` → two duplicate created games. (The other three are effectively idempotent.) The correct pattern already exists in `GameSettingsModal.tsx:2608`.
**Fix:** pass an in-flight `isConfirming` flag, or set the show-flag `false` synchronously before awaiting. *(confidence ~0.6)*

### M4 · Server-side sign-out can be ignored (UI stays "logged in") — ✅ Fixed in #527
**`src/contexts/AuthProvider.tsx:372-384`** — `onAuthStateChange` ignores *any* `signed_out` event while `hasSignedInThisSessionRef` is true. This swallows **legitimate** server revocations (password changed elsewhere, token revoked, account disabled): the service clears its session but the provider keeps `isAuthenticated` true, so the UI shows logged-in while API calls 401 and sync silently fails until reload. (`updatePassword` already has a manual workaround for this exact guard — confirming it's known.)
**Fix:** honor a genuine `SIGNED_OUT` event; only suppress spurious null-sessions in a narrow post-sign-in window. *(confidence ~0.5)*

---

## 🟡 LOW

### L1 · Fractional pause time not floored — ⏭️ Won't fix (decided 2026-06-25: low value, ~0.35 confidence)
**`src/hooks/useGameSessionReducer.ts:260-276`** — `PAUSE_TIMER` stores the un-floored precise time, leaving `timeElapsedInSeconds` non-integer (everything else uses floored seconds). Can cause a rare off-by-one in sub-due math and a fractional persisted value. **Fix:** `Math.floor(...)` the pause time. *(confidence ~0.35)*

### L2 · Confirmed substitution may not persist immediately — ✅ Fixed in #530
**`src/components/HomePage/hooks/useGamePersistence.ts:478-531`** — `completedIntervalDurations` / `lastSubConfirmationTimeSeconds` aren't in the auto-save watch list, so a sub confirmed mid-running-timer isn't saved until some other watched field changes. If the app is killed first, the interval log is lost and sub alerts shift. **Fix:** add those two fields to the short/immediate watch tier. *(confidence ~0.62)*

### L3 · Modern CSP reports silently dropped — ✅ Fixed in #528
**`src/app/api/csp-report/route.ts:46-47,85-88`** — endpoint only parses the legacy `report-uri` shape; modern Reporting API (`report-to`, which `next.config.ts` also emits) sends a JSON array → throws → caught → 204, never logged to Sentry. Chromium CSP violations aren't monitored. **Fix:** handle both payload shapes. *(confidence ~0.85)*

### L4 · Excel season/tournament fair-play uses player-wide flag — ✅ Fixed in #529
**`src/utils/exportExcel.ts:913,947`** — accumulates `playerData.receivedFairPlayCard` (one roster-level boolean) for every game instead of the per-game snapshot, so the fair-play count equals games-played (or 0). The on-screen stats and the Game History sheet read it correctly per-game. **Fix:** read `game.availablePlayers?.find(p => p.id === playerId)?.receivedFairPlayCard` per game. *(confidence ~0.72)*

---

## Notes
- **Refuted (24)** candidates were dropped by the adversarial pass — e.g. plausible sync/race/leak hypotheses that turned out correct-by-design or unreachable. Good signal-to-noise.
- The original synthesis agent returned a malformed stub; these findings were reconstructed directly from the verified agent transcripts (workflow run `wf_e84d8696-ccd`).
- Themes: the two genuinely scary ones are **H1 (deletion never completes)** and **H2 (corruption → mass wipe)** — both are silent. **H3** is the most *likely* real-world loss (mobile save failure on the explicit save path).
