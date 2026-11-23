# MatchOps-Local: Unified Project Roadmap

**Last Updated**: 2026-11-23
**Status**: 🚀 **LIVE IN PRODUCTION** (Google Play, released 2026-06-09; current build 1.0.9, targetSdk 36) · **Free** (no billing)
**Purpose**: Single, prioritized source of truth for remaining work. The open sections below list ONLY unfinished or not-started work; everything shipped, dropped or decided is one line in **✅ Completed (history)** at the bottom.

> Consolidated and triaged post-launch (2026-06-10); cleaned up 2026-11-20 so the open lists hold
> only open work. Monetization is parked (going free).
> Completed/scrapped plans are archived in `docs/08-archived/completed-active-plans/`.
> Speculative feature ideas live in `docs/04-features/future-vision.md` — not deleted, just
> off the active roadmap. Preserved code snapshots: git tags `archive/pre-cloud-backup`,
> `archive/planner-integration`, `archive/desktop-responsive-modals`.
> Items marked **(status unverified)** could not be confirmed done from git history and code; treat them as open until someone checks.

Priorities are **P0 (do first) → P4 (someday)**, ordered by what matters most for a free,
solo-maintained, live app: live correctness first, then UX, then features, then big bets.

---

## 🔴 P0 — Fix because we're live

- [ ] **Supabase Pro for prod** *(strategy memo 2026-09-19; owner-only, 25 EUR/month)* - the production database is on the free tier with no point-in-time recovery. Pro buys seven days of PITR. Owner decision 2026-11-13 (review item 1.14): stay on the nightly encrypted DB backup (#908, restore verified) until revenue covers Pro. Revisit before the marketing push, because the push is what grows the number of other coaches' data at risk.
- [ ] **Full review 2026-11: three owner research tasks remain** - 2.2 (write to the ~15 coaches who stopped after one or two games), 2.3 (watch 1–2 new coaches set up and run a game), 2.5 (finalise the onboarding decisions D1–D29 into `new-user-funnel-fix-plan.md`). Checklist: `code-review-findings-2026-06-25.md`.
- [ ] **Play Console Data Safety form** *(owner-only)* - checklist in `docs/07-business/store-listing/README.md` (written 2026-09-21; predates the 2026-11 policy, which added the error-reporting/usage-statistics switch and onboarding data). Re-check against the 2026-11 privacy policy and submit. (status unverified)
- [ ] **Play Store listing for the redesign** *(owner-only)* - the store description (`docs/04-features/store-listing-{fi,en}.txt`) and screenshots were last refreshed 2026-09-10; the site got v3 screenshots in #1064. Swap the store gallery to the v3 set and remove any development/trends shot still there. (status unverified)

### Code review 2026-06-11 — remainders

- [ ] **CR-M3 remainder (deferred):** an ambiguous-network retry of an already-committed save can still throw a spurious ConflictError (`:3571-3652`) — rare, not data loss (the save landed); a safe fix needs own-write-vs-real-conflict detection that must not mask real conflicts. Also: migration `030` was applied to staging; verified applied on prod 2026-11-20 (`save_game_with_relations` has `p_expected_version`).
- [ ] **CR-M8 remainder (dormant until billing):** purchase-token reuse race — no unique index on token (`019` is non-unique, `verify-subscription/index.ts:283`); `is_active` never expires without a client call (`010:96`); purchase never acknowledged with Google → auto-refund in ~3 days when billing goes live; `check_rate_limit` cleanup uses caller's window — latent until windows diverge (`024:46`). Do together with the `verify-subscription` deploy below.

**Verified solid (no action, 2026-06-11):** RLS on every table; `save_game_with_relations` (027) pins search_path + force-injects user_id/game_id; all 19 transform rules hold in both stores; reducer score/event atomicity; IndexedDB transaction usage; sign-out hygiene; edge-function JWT verification + fail-closed rate limiting; SW/manifest pipeline.

---

## 🟡 P2 — UX & quality polish

- [ ] **Deploy `verify-subscription` edge function** (deferred — billing) — the repo carries the CR-M8 rate-limit fix (prefer `x-forwarded-for` over `cf-connecting-ip`) but it has never been deployed. The function is dormant while billing is parked, so there's no live benefit now. **When billing is revived** (or next time that function is touched), deploy it the same careful way `delete-account` v10 was done: diff deployed-vs-repo, preserve `verify_jwt`, deploy, then smoke-test. Also fold in the other CR-M8 billing items at that time (purchase-token unique index, `is_active` expiry, Google purchase acknowledgement).
- [ ] **Local-mode deletion follow-ups (deferred while local mode is frozen)** - (b) an explicit "delete all local data" for no-account local users; (c) the reverse-migration "delete cloud account" path should mirror the device wipe. Won't-do while local mode stays frozen (decision 2026-06-23).
- [ ] **Onboarding v2 small follow-ups (unscheduled)** - tour pill markup dedupe; legacy em-dash → hyphen sweep; `applyGoalieStatus` capture-timing hardening; short-viewport wizard e2e; Phase 3 Google sign-in (needs owner's OAuth client). Some may have been overtaken by Onboarding v3 (#1054). (status unverified)

---

## 🟠 Youth game-format change (Palloliitto)

- [ ] **Football row in the formats table** - futsal formats (#810) and the football game-creation nudge (#842) shipped. Still missing: football pitch, goal, ball and playing-time columns, which Palloliitto has not published (the 2027 slide gives player counts and age bands only; football's age-to-format table lives in `config/officialFieldSize.ts`). Do NOT invent them - the futsal table's credibility rests on `gameFormats.source.txt` being verbatim. Per-series overrides only if a Taso API key is ever obtained.

| Ikäluokka | Jalkapallo | Futsal | Syntymävuodet |
|---|---|---|---|
| P/T7 ja sitä nuoremmat | 3v3 (4v4) - shared football/futsal format | same | 1.1.2027 alkaen: born 1.1.2020 and later |
| P/T8-10 | **5v5** | 4v4 | born 1.1.2017-31.12.2019 |
| P/T11-13 | **8v8** | 5v5 | born 1.1.2014-31.12.2016 |
| P/T14 ja sitä vanhemmat | 11v11 | 5v5 | born 31.12.2013 and earlier |

Source: Palloliitto's slide `dia-2-pelimuodot.jpg` from [Muutoksia lapsuus- ja nuoruusvaiheen pelimuotoihin](https://www.palloliitto.fi/ajankohtaista/muutoksia-lapsuus-ja-nuoruusvaiheen-pelimuotoihin). Football takes effect season 2027; futsal 2026-27. Checked and rejected as sources: the Taso API's `getCategoryPlayingMethods` (bracket structures, not rules); tulospalvelu (no stable per-series rules URL).

---

## 🟢 P3 — Feature backlog (value/effort ordered)

- [ ] **Plans don't pick up players added to the team** 🧊 *parked 2026-11-21 (owner: "I like the idea, but…")* - a plan copies the squad when it is created (`PlaytimePlan.players`, "Roster snapshot" in `src/utils/playtimePlanner/types.ts`), so a player added to the team later is missing from every plan until the coach adds them by hand in each one (the existing late call-up flow in `playtimePlanner/roster.ts`). Deliberate today: a tournament squad is often a subset of the team, and changing a plan's squad changes its minutes and balance.
  - **Proposed:** a plan linked to a team (`teamId`) with games still to play notices team players it doesn't have and shows a quiet notice: "Joukkueeseen on lisätty 1 pelaaja: Toivo. [Lisää suunnitelmaan] [Ei tähän suunnitelmaan]". Adding reuses the late call-up flow; "not this plan" is remembered per plan; finished plans are never bothered; removed team players are not removed from plans automatically (that would delete slots and planned subs).
  - **Why parked (owner):** adding the player to the plan puts them on every game's bench, including games they are not supposed to be in. Solve before building: let the coach choose the games when adding (a game checklist, defaulting to the upcoming ones), or add them as absent in every game so the coach opts them in per game. The planner's per-game availability (`absentIds`) already models "not in this game".
- [ ] **Pelikirja (Playbook): animated playing concepts to show the kids** 📋 *owner idea 2026-11-21 (first called "Pelitapa", renamed Pelikirja / Playbook 2026-11-23); BUILT steps 1-5 on the long-lived branch `feat/pelitapa`, hidden behind a server-side account flag; not yet on master or prod* - a concept is DATA (a formation as coordinates, then steps with player moves, arrows - pass/run/dribble/press/long ball/shot - highlighted zones, the step text and a "Pohdittavaksi" question for the kids), played by one engine. The engine is universal; the content differs per club and coach. Proved by the [PEPO 8v8 board](https://claude.ai/artifact/PbeEEDbWEvvVYYG4HsezUm); mocks: [in MatchOps](https://claude.ai/artifact/76R8nuqKLDB3x5KW4chJJN); research and first collections: [Pelikirja research](https://claude.ai/artifact/GNHxSfi81Qg2cuFkTZT6fC).
  - **Naming:** the feature is **Pelikirja** (fi) / **Playbook** (en); code in `src/playbook/`, content in `content/playbook/`, scripts in `scripts/playbook/`, i18n keys `playbook.*`. A collection keeps its own name: "PEPO Pelitapa 8v8" is the club's term for its playing style. Unchanged for compatibility (would need data migrations): the stored account flag value `'pelitapa'` (referenced only through `PLAYBOOK_FEATURE`, `src/playbook/feature.ts`), the local keys `pelitapaGameThemes` / `pelitapa_playbooks_v1` / `matchops_pelitapa_focus_mode`, and migrations 064-067 with their tables and RPCs.
  - **Decisions (owner, 2026-11-21):** inside MatchOps, not a separate app (one install/account; links to games). **Portrait only** (the app is portrait-locked; the pitch is tall). Phone = clock and log, tablet = the board, same account.
  - **ACCESS MODEL (owner, 2026-11-21):** coaches must not all GET the club content in the app. **General concepts** (our own universal collections) can be shown to every coach once the feature launches; **club collections** (PEPO's 2-1-3-1 and later other clubs') are always behind a lock: only accounts granted that collection see it (`playbook_access`, RLS). Club content lives in the database, never in the public JS bundle; the engine and UI are a lazily loaded chunk, the club content is fetched for flagged accounts and cached for offline use (tablets in arenas). Our own universal collections are built into that lazy chunk (`src/playbook/builtInPlaybooks.ts`), so they need no database and work offline from the start. Unlocking: club codes now (built, step 5); invite links or the club licence later.
  - **Built (branch `feat/pelitapa`, all behind the flag):**
    1. Engine + presentation view (#1075): classic grass, MatchOps discs with the team's own player names, step dots, prev/next/restart, "Pohdittavaksi" at the end. Account flag switch: `account_features` (**migration 064**).
    2. Library (#1079): collections in Supabase (`playbooks`, `playbook_concepts`, `playbook_access`, **migration 065**, read-only, per-account access), the PEPO 8v8 board converted to concepts (`scripts/playbook/convert-board.mjs`, `seed-playbook.mjs`), offline-cached `usePlaybooks`, format / phase / search filters and concept cards; the pitch keeps its size on every step (#1080).
    3. Motion and focus mode (#1082): players follow curved arrows, moves timed by distance; focus mode (no chrome, true pitch aspect, remembers the mode a concept was left in); one disc size for board and lint (#1084).
    4. Game themes (#1086): one or more concepts per game, picked in the new-game form, on the next-match card and in game settings, played one after another (`game_themes`, **migration 066**; "Previous" on a theme's first step goes back to the previous theme's end). The match menu has "Match themes" ("Ottelun teemat", with the number picked as a badge): plays the current game's themes in order, or opens the picker first when none is picked.
    5. Club codes (#1088): "Enter a club code" in the library unlocks a collection (`playbook_codes` + `redeem_playbook_code`, **migration 067**: hashed codes with expiry / max uses / revoke, 10 failed attempts per user per hour); codes made with `scripts/playbook/create-code.mjs` (supabase-schema.md section 22).
    - Our first universal collection, **"MatchOps: 8v8 perusteet"** (branch `feat/playbook-matchops-8v8`): **14 concepts** for a first 8v8 season (U10-U11) in a neutral 2-3-2, built into the app in place of the one demo concept (`content/playbook/matchops-8v8.json`, authoring notes `matchops-8v8.notes.md`). Tee kentästä iso, Tee kolmio, Vilkaise olan yli, Kolme kahta vastaan, Ohita ulkokautta, Vaihda puolta, Avaa peli maalivahdilta, Pelaa prässin yli, Läpi, ympäri vai yli?, Heti takaisin!, Juokse maalin puolelle, Tiiviinä ja yhdessä, Paine, tuki, tasapaino, Riisto: hyökkää vai turvaa? Alternatives are branches with a "when" cue in the step title, or a sibling concept. Held to stricter checks than club content: no lint allowances, plus `lintConceptMotion` (nobody runs through a player, no ground pass or arrow through a bystander), text-length and 8v8 checks in `playbookContent.test.ts`. Finnish only for now.
    - Content (#1083): the PEPO 8v8 collection reviewed against the club's PDF for intent and football logic - **16 concepts** (`content/playbook/pepo-8v8.json`, decision log `pepo-8v8.review-notes.md`); the content lint (`lintConcept`) is strict: any new warning fails `playbookContent.test.ts`.
  - **Next (a) - launch checklist (in order):**
    1. Prod migrations **064 → 065 → 066 → 067**, in order, through the full DB process (staging verified first).
    2. Before 066 (it recreates `clear_all_user_data`): diff prod's `pg_get_functiondef` of `clear_all_user_data` against migration 037's version; apply only if the only differences are comments/whitespace.
    3. Seed the `pepo-8v8` collection on prod (`scripts/playbook/seed-playbook.mjs`).
    4. Grant the owner's prod account (the `pelitapa` flag + PEPO access).
    5. Merge `feat/pelitapa` to master (one merge).
    6. Confirm with the club (PEPO) that its material may be used before granting anyone else a code.
  - **Next (b) - after launch:**
    - **Our own universal collections**, from the research report (§4); the 8v8 set is built (see above), the 5v5 set is next:
      - *Ensimmäinen 5v5-kausi* (U8-U9): Ohita puolustaja (1v1), Kuljeta vapaaseen tilaan, Näet maalin - laukaise!, Irrottaudu pelattavaksi, Kaksi yhtä vastaan (2v1), Seinäsyöttö, Tee kentästä iso, Avaus maalivahdilta, Heti takaisin!, Juokse maalin puolelle, Puolusta 1v1, Prässi ja tuki (bonus: Riisto - katse eteen!).
      - ✅ *Ensimmäinen 8v8-kausi* (U10-U11) = "MatchOps: 8v8 perusteet". Still open from the report's reserves: throw-in, open body, rest defence; English / Swedish texts.
    - **Age-group tags + filtering**: pre-filter by the current team's age group / format, with "show all".
    - **Half-time shortcut**: open the game's themes from the match view at half-time.
    - **Season paths** (kausipolku): a collection with time - 2-4 week blocks, "this week's concept" on match day.
    - **Alternatives side by side**: one start frame, then branch into solutions, each with its "Milloin?" cue (two-up on a tablet).
    - **Editor on the tactics board** ("record a step") so a coach can make their own concepts.
    - **Match-event suggestions**: suggest concepts from what happened in the match (e.g. goals against from a counter → Heti takaisin!, Juokse maalin puolelle).
  - **Next (c) - two devices (phone = match, tablet = board):**
    1. **Remote control first**: board mode on the tablet, its steps driven from the phone via Supabase Realtime ("Näytä taululla" on the phone).
    2. Then a **short-lived share link / QR** to show a concept on a device that isn't signed in.
    3. **Screen mirroring** (casting the phone or tablet) needs no work.
  - **Vision (d):** concept → collection → alternatives ("there is never one correct way": a concept is a game problem with sibling solutions, a club marks its preferred one as "Meidän tapa", never "right") → lock (club collections behind codes). Tags: **format / age / phase / principle / difficulty**. Club licence tie-in: a club's licence carries its collection to every coach of the club.
- [ ] **Help buttons that open the how-to videos** *(owner idea, 2026-09-29)* - nobody reads the guide, they watch. Now that the promo pipeline (`scripts/promo-video`) produces one short Finnish video per workflow (aloitus, luo ottelu, kokoonpano, kello ja vaihdot, maalit, viimeistele, ...), put a small "Näytä video" affordance where each workflow starts (the new-game form, the pitch, the timer, the finish flow, settings) that opens the matching YouTube video. Needs: a video-id map per surface, EN/FI variants once English cuts exist, and the same off-switch as the first-visit hints so it never nags. Sequence after the video catalogue itself exists; this is a link, not a feature.

- [ ] **External games: multi-player entry and guest players** - phases 1-3 shipped (#889, #891, #892). Deferred to their own design round: one external game for several guest players, and the mirror case (a guest playing for us). Playing time stays out (the app records positions and events, not minutes).

- [ ] **myClub + Taso hand-offs - Level 0 parked** *(owner 2026-09-16)*: manual "Taso report filed" / "myClub attendance marked" checkboxes in the Finish-game card, opt-in like `assessmentsEnabled`, synced booleans on the game (needs a migration). Parked because not every coach uses these systems; revisit only if hand-offs are shown to be forgotten. The pre-game Taso lineup reminder is tracked as "Taso lineup pack" in the strategy memo below. Hard fact bounding all of it: myClub and Taso can be read but not written, so the app pulls from both and pushes to neither. Findings: `docs/10-analysis/taso-torneopal-api.md` §7.

Low-effort, high-value first. Detailed concepts in `docs/04-features/future-vision.md`.

| Feature | Effort | Note |
|---------|--------|------|
| Formation Templates (one-tap switch) | Med | Save/switch CUSTOM formations; ends 11-player drag pain. NOT done (verified 2026-06-26): only read-only presets exist (`FormationPicker` + `formationPresets.ts`); no save/switch of user-defined formations. |
| Visual Analytics | Med | PARTIAL (verified 2026-06-26) — recharts trend/area charts already exist (`MetricAreaChart`, `MetricTrendChart`, `SparklineChart` for goals/assists/points). Still missing: in-game **event timeline** + **goal-log filtering** UI. |
| Player summary (Pelaajakooste) - later parts | Med | v1 shipped 2026-09-09. Later: two periods side by side for progress, and PDF/image export via the existing canvas code. Minutes deliberately not included. |

---

## 📍 What match locations unlock (recorded 2026-09-17, after #851)

Every match can carry **coordinates**, not just a name (migration 048). Departure time,
straight-line distance and the coach-measured drive time shipped (#860). The rest below is
**not scheduled**; it is written down so nobody has to re-derive what the data is for.

### Because a position groups where a string does not

- [ ] **Venue identity.** The opponent-name work exists because strings do not group -
  "IPS", "Ips" and "IPS/Sininen" are one club. Coordinates group perfectly: two coaches
  spelling a pitch differently still land on the same point. This is the natural join key
  if club-wide data is ever combined, and it is the migration path the sweep tool's own
  notes ask for ("ids become correct exactly when an external authority exists").
- [ ] **Head-to-head by venue**, not only by opponent. "We have never won at Kisapuisto."

### Because distance is a number

- [ ] **Home advantage that means something.** Not the `homeOrAway` flag, which is an
  administrative label, but distance actually travelled. "One win in six beyond 60km,
  five in seven within 20km" is a real finding about a youth team - and it is probably
  about tired children in a car rather than about football.
- [ ] **Travel load per player.** Appearances are already tracked; distance turns them
  into kilometres. Which child is doing 800km a season matters for the load-management
  idea already sitting in `future-vision.md`, and matters more for the families driving.
- [ ] **Fixture sanity check.** Two matches ninety minutes apart at venues 120km apart is
  a mistake worth catching the week before rather than on the day.
- [ ] **A season map.** Every venue played, as one picture. Cheap, and the kind of thing
  a coach shows parents in November.

### And weather stops being useless

- [ ] **Weather on the match.** The idea has sat in `future-vision.md` for months and was
  worthless without a location, because a forecast for "Keskuskentta" is a forecast for
  nowhere. Open-Meteo takes coordinates, needs **no API key**, and allows 10,000 calls a
  day free. ⚠️ **Settle one thing first:** the free tier is stated as **"for
  non-commercial use"** with no uptime guarantee, and MatchOps is free to users but is a
  distributed product. Ask them, or take the paid licence. Do NOT quietly assume the free
  tier covers it - that is precisely the shape of the myClub cost mistake.


## 🔍 Ideas to explore - surfaced from a documentation sweep (2026-09-17)

The owner asked what development ideas were buried in 109,000 lines of docs. These are
the findings, each checked against what the app actually does today rather than taken at
face value. **Nothing here is scheduled.** The point is that these existed and were
invisible.

### The big one: a second app is already fully specified

- [ ] **MatchOps Practice** - `docs/11-blueprint/` is a **20-file, 10,371-line build
  blueprint** for a training-session planner: exercise library with a visual diagram
  editor, station rotations, and a "Practice Card" (the whole session as one glanceable
  grid for the field). Written explicitly for an AI agent to build, with data layer, sync
  engine, and testing playbook included. **Last touched 2026-02-18, five commits, and
  this roadmap has never mentioned it.** `docs/01-project/business-strategy.md` names a
  three-product family - Local, Practice, and **MatchOps Analyzer** (multi-coach
  aggregation, see ADR-003) - of which two were never started. Decide whether this is a
  real intention or an artefact; either answer is fine, but it should not keep sitting
  there unacknowledged.

### Do NOT build these - experience and policy have overtaken them

- **Quick Post-Game Ratings / Comparative Ranking** (ranked #2 in the document's own build
  order). Its own Open Question #5 asks *"Is post-game rating sustainable every game, or
  just important games?"* - and the app answered empirically: assessments went **off by
  default 2026-09-09** because rating children after every match was the wrong form and
  nobody kept it up. The question was asked and is now settled.
- **Injury & Availability Tracker** (ranked #2 on the other list). The app's own AI consent
  copy now tells coaches *"Never dictate health, injuries, family matters."* A tracker for
  children's injuries would contradict a privacy position already written into the
  product. Availability without the health part might survive; the feature as described
  does not.

### Open, small, and consistent with what the app has become

- [ ] **Player milestones** - "10th appearance", "first goal", "25 games". Every input
  already exists (appearances, goals, captaincies, the Pelaajakooste). Low effort, and it
  fits the develop-don't-rate stance that the ratings feature violated - which is the
  reason to prefer it over the assessment ideas it sits next to.
- [ ] **Weather on the game card** - Open-Meteo: **free, no key, no account, no club
  administrator.** Worth noting after a night spent finding APIs that were paid
  (myClub, 10 EUR/key/month), club-gated (Taso) or read-only (both): this is the rare
  external integration that is simply available.
- [ ] **Smart warmup timer** - the warmup plan exists; the phased timer with audio cues
  does not. Fully offline, no new data.
- [ ] **Halftime board** - a clean canvas for the halftime talk, separate from the live
  tactics board that already holds current positions.
- [ ] **Random picker** - who goes in goal. Trivial, and coaches genuinely do this.
- [ ] **One-handed mode** - bottom-anchored controls and larger targets. Worth weighing
  against the standing note that touch targets are still ~36px.

### Bigger, unassessed

- [ ] **Moment capture (tap-to-log)**, **interval snapshots**, **second-screen mode**, and
  the **hub-and-spoke multi-coach model** (`future-vision.md`, ADR-003). All real ideas,
  none assessed against the current app. The multi-coach one connects to the opponent-name
  work already done: the normaliser is what would let several coaches' data merge.

---

## 🧭 Strategy memo - where MatchOps goes next (2026-09-19)

Written after reading the app, the production data (aggregates only), this roadmap and the business docs. The memo itself is at https://claude.ai/artifact/AD1u9toFVYcptkhyJ9vE5J; this section is the durable record of its items so they can be ticked, argued with or dropped here. Where a claim is a judgement rather than a measurement it is written as one.

### The numbers (prod, 2026-09-19, aggregate only)

The owner's account is 122 of 214 games, so the external picture is roughly 92 games across 19 other people.

| What | Now | Reading |
|------|-----|---------|
| Accounts | 36 | The consents table says 80 sign-ups; about half never reached settings. |
| Created at least one match | 20 | 56% activation from account to first match, with no onboarding staff. |
| Three or more matches | **8** | **The number.** Below it is trial; above it is a coach. |
| Ten or more | 4 | The owner, one steady real coach at ~29, two others. |
| Active in the last 30 days | 12 | Good for an app that has done no marketing. |
| Active in the last 7 days | 5 | Futsal season is starting: 16 futsal games already. |
| Use the playing-time planner | **10** | Half of everyone who has ever made a match. No other feature comes close. |
| Have created a team | 14 | Teams are understood; competitions less so (10 seasons, 22 tournaments). |
| Used player assessments | 4 | Switched off by default 2026-09-09. The data agrees. |
| Book fixtures ahead | 2 | The next-match card has two possible viewers today. |
| Pin a venue | 1 | The owner. This week's location work has an audience of one until pinning is effortless. |

**What they say.** One clear product-market-fit signal: fair playing time. Ten of twenty match-creating users went looking for the planner, which is a separate tab with its own model - not a feature people stumble into. The bottleneck is not features: the location system, departure times, the venue book, the one-date season and a dozen fixes shipped in three days and the number that matters is still eight. Futsal season is the moment: five people active this week and 16 futsal games mean winter is when coaches reach for this, and winter is now.

### Novel ideas (ranked by how much they build on the one signal, not by how interesting they are)

- [ ] **Follow-the-plan match mode** 🔴 *high leverage, all existing parts - first of the ideas to build.* Today the planner and the live match are two screens joined by a reminder: a game prefilled from a plan carries its sub schedule (`gameSubs.ts`, local-only), ghosts mark planned entries on the sideline (`ghostSubs.ts`), and the timer overlay raises an advisory "Planned sub · 12:00 · Anna ← Mikko" when a sub's time has passed (`usePlannedSubPrompts.ts`, dismiss-only, suppressed if the incoming player is already on). The coach still performs every sub by hand on the field, and nothing measures how far the match has drifted from the plan. In follow-the-plan mode the match *runs as the plan*: the next sub is always on screen with a countdown (not only once it is late), one tap performs it (moves the discs via `swap.ts`, logs the substitution event, arms the undo toast, advances to the next), the plan strip shows every remaining sub in order, and drift is visible as it happens - a late sub turns amber, a skipped one is marked skipped, per-player minutes ahead/behind the plan are computed live from `minutes.ts`. At full time: plan vs actual, which feeds re-apply/Suggest for the rest of the tournament so the next game's plan starts from what really happened. Not a tracker of what the coach did outside the plan; a plan that keeps up. Gate: none - build it. Effort: medium (one hook, one overlay strip, one field action, reuse the rest).
  - **EXPLORE FURTHER (owner, 2026-09-19): "quite interesting and I would like it software wise."** Animated mock with a real minutes engine at https://claude.ai/artifact/MxMkXAcKt2DDMYxRyqeg2U - a scripted 40-minute match where the coach is late, a player is hurt and a sub is skipped. The owner's main concern was what happens when reality drifts a lot from the plan; the answer that held: **the plan is a target of minutes, the clock times are only the path**, so drift redraws the path (only subs not yet made, from minutes actually played, time slots kept, done subs never rewritten) and the target stays. Late = amber and a count, nothing moves. Unplanned sub from the field = reconcile (a pending sub that is now true is marked done; one made impossible by an injury is voided and the least-played bench player proposed). Skip = the player falls behind in the meter, no other consequence. Never blocks, never nags.
  - **Where it lives (answered 2026-09-19):** no new screen. The next-sub card replaces today's advisory nudge in the large timer overlay (which is the match screen on game day - `FieldContainer.tsx` says so), the strip sits under it collapsed to marks, the drift meter is one line with the bars on tap; the field keeps its ghosts and the Vaihda tap performs the swap there; plan-vs-played is a step in the Finish-game flow.
  - **Plan-less minutes tracking - open question, reopens a September decision.** The engine reads the field, not the plan, so it would also track minutes when a coach just drags discs with no plan behind them. But "actual playing time - segments" was DROPPED by the owner 2026-09-09 because minutes are hard to keep true: the field lags the pitch (a sub updated 40 s late, or at the next stoppage). With a plan the Vaihda tap is the record and the minutes are true by construction; without one they are inferred. If plan-less tracking is ever built it needs a "tapahtui aiemmin" time-correction on the substitution toast and an "arvio" label until the coach confirms the minutes at full time. Do not build the plan-less half until the owner says the reason for dropping it no longer applies.
- [ ] **Playing-time transparency for parents** 🟡 *build toward.* A coach-initiated, read-only view of one child's minutes this season, as a link or a PDF. No competitor has it; it gets talked about at the pitch; it lands on Palloliitto's Kaikki Pelaa values, which is the language a valmennuspäällikkö already speaks. Privacy is tractable: per-child, coach chooses to share. Relation to what exists: the Player summary (Pelaajakooste, P3 table) is the seed; this is that summary aimed at one parent. Gate: follow-the-plan first, so the minutes it shows are real.
- [ ] **The fairness report for a club** 🟢 *the business wedge (see Business path B).* The Ecosystem note (P4) says: the app collects, something else analyses. Scope the something to one thing first: a per-team, per-season PDF showing how minutes were distributed across the squad. That is the document a valmennuspäällikkö would pay for because it answers the parent complaint before it reaches them. It is the Analyzer idea with a buyer attached. Gate: parents' view first (same data, one child at a time).
- [ ] **Tournament day** 🧊 *after fixtures grow.* Several matches, one venue, one day, is what the planner already models; with departure times real, a tournament-day screen chains them: leave at 8:05, first match 9:30, then 11:00, then 13:15, with the plan's lineups underneath. Gate: more than two people book ahead. Until then it is a beautiful screen for one person.
- [ ] **Taso lineup pack** 🟢 *cheap, real.* The match report in Taso's order shipped (P3, 2026-09-09). The pre-match half did not: the lineup is due in Taso four hours before kick-off, the app knows the lineup and the kick-off. A nudge at the deadline with a copy-ready lineup removes the one piece of double entry that has a hard deadline attached. No API needed. Belongs with the myClub + Taso hand-off item (P3).
- [ ] **Kirjuri, hosted** 🧊 *not yet.* Voice notes work and nobody uses them because BYOK asks a volunteer to create an OpenAI account. Hosted transcription with a monthly cap would be the first thing worth charging for - but four people use assessments and fewer write notes. Prove the writing habit before paying to transcribe it.

### Business path

The monetisation doc is honest: Finnish youth football, price-sensitive volunteers, a ceiling around 500 EUR/month. That is not a business. It can be three other things, not mutually exclusive:

- **A. Reputation asset, kept free now.** What it is today, and fine. The one cost not being paid is data safety - see the P0 Supabase Pro item.
- **B. Club licensing - the 12-month goal.** The buyer is the valmennuspäällikkö, not the coach. The product is the fairness report across all a club's teams. 200-500 EUR per club per year is plausible; ten clubs is 2-5 kEUR. Small but real money from a real buyer with a real problem, and it is the shape the Ecosystem note already describes. Needs no billing in the app: clubs get invoiced, coaches keep the free app. This is the Toiminimi trigger.
- **C. Palloliitto costs one email.** Taso write-back is the killer feature (P4) and it is blocked on an interface that does not publicly exist. The next step is one email to Palloliitto and Torneopal asking whether a write interface exists. The pitch is theirs as much as ours: volunteer coaches enter every match twice. A no costs nothing; a partnership conversation changes what MatchOps is.
- **D. Paid transcription later.** The 12 EUR/year cloud tier in the doc was the right shape and the wrong feature: nobody pays for backup until they have lost something. Hosted Kirjuri is a feature people would notice paying for. Waits on the Kirjuri caveat above.

**Decision proposed:** do A this week, C this week, point everything at B. Do not build billing. Do not touch the premium flags. Pay the 25 EUR, send the email, build the report.

### Smaller enhancements (on what exists, in the order to do them)

- [ ] **Make pinning the default outcome, not a skill.** One user pins venues. The two-field design (name + street address) is right, but the address is the second field and most people stop at the first. When a name is typed and the address is empty, move focus there on the way out; let a match created from a competition inherit the competition's location as a pinned venue. Everything from the location week is worth ten times more the day pinning is effortless.
- [ ] **Ask for the starting point once, at the right moment.** Nobody has set a lähtöpaikka, so nobody sees a departure time. The first time a fixture has a pinned venue, the next-match card should offer to set it, right there. A setting nobody finds is a feature nobody has.
- [ ] **Ask for the real drive time after the match, not in a sheet.** The measured drive replaces the estimate everywhere, but it lives behind a tap in the adjust panel. After a match at a pinned venue, one question on the way out: did it take about two hours? Yes, or a number.
- [ ] **Feed the venue book from competitions too.** Seasons and tournaments carry a location; `buildVenueBook` only reads games. A coach who set the tournament's venue once should find it when creating its matches.
- [ ] **Generalise the dead-key test.** Two translation keys did not exist and the Finnish build silently showed English (fixed in #866). The test that catches it covers HomeDashboard only. The same twenty lines over every component would catch the whole class.
- [ ] **Heal the stale season labels.** Seasons and tournaments that stored the old `off-season` label keep it until re-saved. One pass on load, the way assessment metrics already migrate.
- [ ] **Site-only changes should not run the app's test suite.** Every merge cost ~15 minutes on 2026-09-18 and the owner said so. A paths filter on the test workflow and a lighter release-notes guard for `site/` would halve it.

### Design

The identity is strong and specific: dark navy, indigo, amber for the one thing to press, Rajdhani for numbers that are the point. Keep all of it. The work is consistency and density, not direction.

- [ ] **One spacing pass.** (status unverified: the 2026-11 redesign (#1054) restyled every popup and ran a full-size sweep - check whether this is now covered.) The owner flagged cramped text twice in one week and was right both times. The parked modal-chrome modernisation (P4) is the vehicle: a single wave through every modal so they stop forking into visual generations. Do it as a pass, not as it comes up.
- [ ] **Touch targets.** (status unverified after the 2026-11 redesign) Still ~36px in places, below the 44-48 guidance. Used on a touchline in November with a glove. One audit, one fix.
- [ ] **Same thing, same look.** Two team pickers labelled teams differently until #865. A short inventory of every place the same entity is chosen or shown, and one component per entity.
- [ ] **Sunlight.** Dark is right for evening futsal halls; check indigo-on-navy secondary text on a pitch at noon. Marginal on paper, and glare is unforgiving.
- [ ] **The 108px strip cards.** (status unverified: Home was rebuilt in the 2026-11 redesign) Built for a score and a date, now carrying a town. One more line and they must become two rows or a different shape, not a fifth line of 9.5px text.
- [ ] **Document the numerals.** (status unverified: the redesign moved the app to Inter, #1054) Rajdhani for display numbers (#838) was a real decision with a real rule: the number is the display element only where the number is the point. It is unexplained in the guide and the next person will undo it.

### If I were you - the sequence

The app has more features than its user base can absorb, and it grows faster than anyone can adopt it. Every week of features is a week the eight coaches were not asked to bring a ninth. The data has one loud signal, fair playing time, and silence everywhere else. The next thing to grow is the number eight.

1. **Today:** Supabase Pro (P0).
2. **This week:** the email to Palloliitto and Torneopal (Business path C). (The legal docs were done 2026-09-21 and again 2026-11-19, #1064.)
3. **Four weeks: ship nothing new.** Execute the go-to-market plan that exists and has not been run: the 30-second video, two posts in Finnish coaching groups in the builder-coach voice. Futsal season has started; this is the window.
4. **Watch one number:** coaches with three or more matches. It is 8. Everything else is vanity until it is 30. Weekly, nothing else.
5. **Then build toward the planner:** follow-the-plan match mode first (all existing parts), then the parents' view, then the club report, which is the business.
6. **Keep the review loop** (it caught six real bugs on 2026-09-18, two of which would have eaten a coach's edit). Trim the CI it wraps, not the review. **Keep dogfooding**: 57% of the games are the owner's, and that is the engine.

**The shape in one line:** MatchOps on the phone is the collector, and it is nearly done. The fairness report for a club is the product, and it does not exist yet. The distance between those two is the next year.

### New path: the official companion (owner, 2026-09-20)

The owner's reframe of the Taso question, recorded before anything is built: **we do not need the product to sell the idea.** Sell it first, to Palloliitto, and develop it with them. This section is the pitch, the reasons it could work, the reasons it could fail, and the order of steps. It is a direction, not a commitment; nothing in it is scheduled until the first conversation has happened.

**The idea in one sentence.** MatchOps becomes Palloliitto's official match-day companion: the app a volunteer coach opens on the touchline, which feeds Taso without double entry and gives the federation the one dataset it does not have - playing time.

**Seen from Palloliitto's side, not ours** (this is the whole discipline of the path: every slide is written from their chair):
1. **Data quality in Taso.** Lineups four hours before kick-off, reports the same evening, the right format for the age group. Today that rests on volunteer discipline and a support desk. An app that makes compliance the path of least resistance is worth more to them than any feature we like.
2. **Kaikki Pelaa evidence.** A values programme with no data behind it. Playing-time distribution per team per season is the dataset that proves or disproves it, and only a match-day app can produce it. Nobody else has this; it is the centre of the pitch, and it is exactly what follow-the-plan and the fairness report produce.
3. **Volunteer retention.** Coach burnout is their structural problem; entering every match twice is a visible cause. "Enter every match once" is a sentence a district and a valmennuspäällikkö both understand immediately.
4. **The 2027 format change.** New age-to-format rules land on every club at once. An app that already knows the formats (the rule viewer and the recorded 2027 mapping are the seed) is a rollout tool for them, not a feature for us.

**What they will worry about, and the answer we bring:**
- *Children's data.* Where it lives, who sees it, for how long. EU region, RLS and the existing delete-account path are the technical answer; a DPA and a named data-protection contact are the real one. Bring it unasked.
- *Neutrality.* A federation cannot bless one app by preference, only through a pilot or a procurement. So the ask is a **pilot**, one district or one club with a valmennuspäällikkö, with criteria written down.
- *Their vendor.* Torneopal builds Taso; the technical counterpart is Torneopal, the political one is Palloliitto. Two conversations. Do not let the first one become "please give us an API"; that is the last step, not the first.
- *"Replacing us."* The word is companion, never platform. They own the system of record; we own the touchline.

**Volunteering and co-development (owner's offer).** The owner is willing to do this as a volunteer for the reputation, and to develop it together with Palloliitto. Recorded with two conditions so the offer does not turn into unpaid product development for someone else: (1) the volunteering is a **time-boxed pilot** with a written scope, not open-ended labour; (2) **IP and data stay with the owner** (the app, the code, the users' data), and anything built jointly has that written before the first line. A federation taking the idea to its existing vendor is the realistic downside and the reason to lead with what already exists and works rather than with a slide about what could.

**The demo is the app as it is.** No new product for the pitch. The demo is the app on a phone in their hands - the grip and feel of the field, the planner, the next-match card, the Pöytäkirja Tasoon button - followed by slides that explain the value for the whole ecosystem rather than for a coach. Slide outline (to write when the meeting exists, not before):
1. One match, entered twice - what a volunteer's Sunday evening looks like today.
2. The same match in MatchOps: touchline to Taso in one flow (live demo, not screenshots).
3. What only this produces: playing time per player, per team, per season - the Kaikki Pelaa report.
4. The 2027 formats, already in the app.
5. What we ask: a pilot with N teams in one district, one season, with these three success criteria (lineup deadline compliance, report latency, coach retention survey).
6. What we need from Torneopal, eventually: read first (fixtures, rosters into the app), write later (lineup, report out of it). Read alone already removes most of the double entry.

**The dream, and what to do with it.** The owner's ideal is **one system for the whole of a club's football**: myClub (membership, invoicing, attendance, comms), Taso (competition, results, officials), MatchOps (the touchline). Recorded as the direction; the honest reading is: integrate what can be integrated, build only what is genuinely missing on the match-day side, and treat "our own myClub" as the far end of the road - it is billing, memberships and messaging, a different product with a different buyer (the club treasurer), and a solo build of it would stall the thing that is actually differentiated. The order that keeps the dream alive without betting on it: **Taso read → Taso write → myClub read (rosters, attendance) → only then anything of our own.** Every step earns the next conversation.

**The road, in order.**
1. Ship the **Taso lineup pack** (P3, cheap, hits their hard deadline). Be the best Taso helper without any API before asking for one.
2. Get **one valmennuspäällikkö** to say, in writing, that it removed the double entry. That sentence is the first slide.
3. Book the **meeting**, not send the email: Palloliitto (Kaikki Pelaa / youth development side, not IT) first, Torneopal second. Bring the phone and the six slides.
4. Propose the **district pilot** with written criteria and the volunteer time box.
5. Only inside a pilot: the API conversation with Torneopal, read first.

**Video: a Veo substitute? (owner asked 2026-09-20).** Short answer: not the hardware, possibly the software, and one piece of it is nearly free because of what the app already has.
- *Not the camera.* Veo is a hardware company with a subscription attached: a two-lens 4K unit, manufacturing, warranty, returns and a cloud that stores a 10-20 GB file per match. A solo developer cannot compete on that, and the cheap end of that market is already crowded (phone gimbals that auto-follow, and apps that process phone video in the cloud). Do not build a camera.
- *The nearly-free piece: event-cut highlights.* Every goal, card and substitution in MatchOps already has a game-clock timestamp. A phone on a tripod recording the whole pitch wide, with one tap in the app to align the recording to kick-off, gives highlight clips (goal at 12:34 → clip 12:19 to 12:44) with **no ball tracking and no AI at all**. That is the Veo feature parents actually share, at zero processing cost, and nobody else can do it this way because nobody else has the event log on the same device as the clock.
- *The expensive piece: auto-follow.* Cropping a wide 4K recording to a moving window needs player and ball detection, server-side, on a GPU, per match. Feasible, not free, and a second product's worth of work. Later, if the highlights prove people film at all.
- *The two real blockers, before any code:* (1) **filming children** - Finnish clubs have consent policies and some parents refuse; the feature must default to "no faces, no sharing" and honour per-player consent, or it is a liability the free app cannot carry; (2) **storage** - the video never goes to our cloud; it stays on the phone, and the app only cuts clips locally. That decides the architecture (on-device trimming, WebCodecs or a native layer in the TWA), and it is the part to prototype first.
- *Verdict:* park as a P4 idea named "event-cut highlights from a phone recording". It belongs to the same thesis as everything above - the app is the collector - and it is a real differentiator, but it is after the fairness report and after the first Palloliitto conversation, not before.


---

## 🔵 P4 — Big bets (need planning before any code)

- [ ] **Modal chrome modernization** 📋 *parked 2026-07-13* *(status unverified: the 2026-11 redesign (#1054) rebuilt the shared popup building blocks; check what of this is left)* — decide app-wide on the planner's two pilot patterns: bare list items (no dark-card wrapper) and collapse-on-scroll pinned chrome (tabs/add buttons hide on scroll down, return on scroll up — shipped in the planner, `ScrollableContent` already supports it). Applies to every modal with pinned navigation/actions (GameStats tabs, TeamManager/Roster add buttons, SeasonTournament). One pass so modals don't fork into visual generations. Details: `playing-time-fairness-and-planner.md` §10 item 1. Natural companion to the two-level app structure work.
- [ ] **Desktop workspaces** (#360) — 🧊 **PARKED AS AN IDEA ONLY 2026-09-16 (owner), the same day it was planned.** Not scheduled; do not pick it up without reading §0 of the plan. **Why, in the owner's words:** *"I thought I would use the desktop to prepare games during the workdays but it turns out I never do. This is mostly because we have streamlined the app so there isn't obvious gaps in user flows."* The desktop project was a solution to a problem the phone app no longer has - the onboarding, planner and dashboard work closed the gaps that made preparation awkward, so the laptop moment never arrives. The plan is kept for its findings, not its schedule. Reopen only if someone actually works on a laptop, a flow appears that a phone genuinely cannot carry, or match-ops.com needs a desktop face for marketing (that is the Season workspace alone, ~1 week, and needs none of the rest). **The one use the owner named - Taso beside the app - is not a desktop problem; see the next bullet.** The plan below stays in `desktop-workspaces-plan.md`, from a measured read of the codebase. Principle: on desktop MatchOps has NO modals - each becomes a docked panel, the inspector, or stays modal because it *should* interrupt. **Three findings decide the cost.** (1) The seam is TWO SYMBOLS, not 28 files: `MODAL_BACKDROP` and `CollapsibleModalHeader` are used by **23 of 28 modals** (a dividend of the #826 consolidation), so a frame context turns them into panels with no per-modal edits - and the 8 that do not share the chrome are almost exactly the 10 that should stay modal. (2) The real work is **four assumptions of exclusivity**: `useFocusTrap` (14 files), `useEscapeToClose` (17), hardware-back (22) and `aria-modal` all assume one thing on screen; one `Frame` flag makes each no-op in panel mode. (3) The app has **zero** arrow-key handling and **zero** modifier-click anywhere, so keyboard precision and multi-select are desktop-only wins that do not exist yet - and arrow-nudging a disc **fixes the known `relX 0.96` sideline bug**. Also settled: do NOT refactor the 2,644-line orchestration hook first; its prop bags are already live and already feed panels.
  - **Why the first attempt was abandoned, read off the archive tag 2026-09-16:** it took the EXPENSIVE route - a `renderMode` prop on modals, two-column desktop layouts, a side panel - which forks every modal into two designs that then both have to be maintained. The approach written up in the issue itself is the opposite and much smaller: one max-width wrapper carrying a `transform`, which creates a containing block so every `position: fixed` descendant (all 15 modal files) is constrained automatically, with no per-modal edits. **The cheap version was never tried.**
  - **Check this before committing to it:** the app uses `backdrop-blur` in 22 files, and `backdrop-filter` inside a transformed ancestor is a known cross-browser trouble spot - the backdrop can sample the wrong surface or clip. A one-afternoon spike on the wrapper, looking only at whether the blurred modal chrome still renders, decides whether the cheap approach is viable at all.
  - **Who it is for:** not the touchline. It is the coach reviewing stats or planning at a laptop, and it is what anyone evaluating match-ops.com on a desktop sees first - which matters more now that go-to-market is active.
  - **Taso side by side, answered 2026-09-16 (and one earlier answer corrected).** The owner's one genuine "two things at once" need is Taso open beside the app. Previously answered "not possible"; that was right about two things and wrong about the third. **Still true:** embedding Taso inside MatchOps is out (third-party site behind a login, ships framing protection, not ours to change - our own CSP is `frame-ancestors 'none'` and embedding *them* would need `frame-src` plus their cooperation), and the Taso API is out (club-issued key, server-to-server terms, no server in a local-first app). **Wrong:** Android **split-screen** was never blocked by Taso or by any API - it is an OS feature, two apps in two panes, and Taso does not have to cooperate at all. The earlier "no" was answering the embedding question. **What would need to be true:** (1) the TWA activity must be resizeable - the only real gate, and **unverifiable from this repo** since the Bubblewrap wrapper lives elsewhere; default is resizeable for targetSdk ≥ 24 unless explicitly disabled. (2) **NOT the orientation lock** - a first draft of this bullet blamed `"orientation": "portrait-primary"`, and the owner caught it: Android ignores an activity's orientation request while it is in multi-window, so a portrait-locked app still splits. (3) The layout must survive roughly half the height, and this is the actual work: exactly **one** file uses short-viewport queries (`StartScreen`); the match screen has none and would be unusable at ~350px. **Verdict:** possible, and not a desktop feature - a manifest change plus short-viewport work, with the existing "Pöytäkirja Tasoon" helper doing the rest. Owner's own read: *"such a small part of the whole that it doesn't make you bother."* Logged, not scheduled.
- [ ] **International use - make the Finnish defaults configurable** 📋 *logged 2026-11-20 (owner): "international, why not - but Finland first".* Not scheduled; do it when the app is actively marketed outside Finland. Trigger: the first non-Finnish coach signed up 2026-11-20 (South America). The core (planner, match day, timer, subs, goals, stats, reports) is country-neutral and fully translated to English; these are Finnish by design and would become per-user/per-country settings:
  - **Content:** the league list (`src/config/leagues.ts`), game formats/period lengths/field sizes by age group (`gameFormats.json`, `formatsByAgeGroup.ts`, `officialFieldSize.ts` - Palloliitto rules), rule links (`rulesIndex`, `ruleLinks.json`), P/T age-group naming, club-season calendar defaults (`clubSeasonDefaults.ts`), and Finnish-only helpers (Taso, "Pöytäkirja Tasoon"). Likely shape: a federation/country choice in the setup wizard and Settings that selects the preset (Finland = today), with free text everywhere else.
  - **Defaults:** the app starts in Finnish (`lang="fi"`, default language fi); a non-Finnish browser should start in English.
  - **Legal (check before marketing abroad):** privacy policy and terms are written for Finland/EU (Finnish law, EU data residency, the Finnish supervisory authority); users in other jurisdictions may bring their own requirements (e.g. Latin American data-protection laws, US/COPPA-style rules for children's data, age of digital consent varying by country). Needs a lawyer pass per target market, plus app-store listing language and country availability.
  - **Marketing:** YouTube channel and site are bilingual with English as the international front door; English versions of the hero/basic videos come from the same promo pipeline when needed.
- [ ] **AI Assistant (chat with your data)** — long-term flagship. LLM function-calling over the user's games/players/stats. **Prerequisite:** richer data collection first. (Premium-shaped, but billing is parked.)
- [ ] **Timer-hardening refactor** 📋 **PARKED 2026-09-16 (owner).** *(status unverified: extra time shipped 2026-11 (#1049-#1051) and the 2026-11 timer review (#956-#970) added a per-game wall-clock recovery anchor, so the premise below may be out of date.)* Gated on wanting an in-app extra-time clock, and nothing shipped needs one. Reviewed the same day: the clock is a COUNTER (`timeElapsedInSeconds`, incremented by an interval), so a tick lost to a sleeping phone or a backgrounded tab is gone for good - there is no record of what the truth should have been. Segments would make elapsed DERIVED from wall-clock timestamps, which makes backgrounding and reload irrelevant by construction. Against that: it is the core of the live match screen, used on a touchline with no undo, and it introduces a failure mode a counter does not have - the device clock can jump (manual change, DST). Do it when the extra-time clock is actually wanted, with a real match to test against. Was: make the match clock a single source of truth (period "segments" with wall-clock start/stop timestamps; derive elapsed/period/status). Would end the recurring reload/background clock bugs (CR-C1, background-pause) **and** unlock a real **timed-OT clock** (the one piece the overtime feature deliberately deferred). Only worth doing if/when an in-app extra-time clock is wanted; the shipped OT/penalties feature needs none of it.

---

### Ecosystem: the app as data collector, analysis elsewhere (owner, 2026-09-08)

Not a feature; a shape for everything after Kirjuri. To elaborate before any of it is built.

- **Premise.** Kirjuri Phases 0-4 make the app a good collector: minutes, positions,
  goals, assessments, dictated notes, reports. Kirjuri's Phase 5 (season synthesis over a
  child's data) was taken out of Kirjuri because it is a different kind of product:
  analysis and judgement, not collection. That work may not belong in the phone app at all.
- **Option on the table.** MatchOps app = collect and maintain game data, on the phone, at
  the pitch. A separate solution = the robust analysis (season views, development arcs,
  club-level comparisons), fed from the same data, possibly not an app (a report, a web
  view, an export a club analyst opens). Different privacy posture, different legal review,
  different users (club, not only coach).
- **Open questions.** Where the boundary sits (what the app may still show inline);
  what the exchange format is (the backup JSON already exists as a candidate); whether the
  analysis side is ours, a partner's, or the coach's own tools over an export; consent
  model when data leaves the coach's device for analysis; who pays.

### Palloliitto Taso integration - the absolute killer (owner, 2026-09-08)

> **New path recorded 2026-09-20:** sell the idea before building the product - see "New path: the official companion" in the strategy memo section above. The email below becomes a meeting with the phone and six slides; the API conversation moves to the last step.

Taso (Palloliitto's competition system) already does part of what MatchOps does: it holds
the schedule, the lineups and the results. Today the app only links out to it (game menu).

- **The perfect-world flow.** Palloliitto schedules the matches in Taso -> they sync into
  MatchOps -> a club assigns each match to a coach -> the coach runs the match in MatchOps
  -> filling the app updates Taso (lineup before, result and events after). Two-way. The
  coach stops entering the same match twice.
- **What that implies for the app.** Matches would have an external identity (Taso match
  id) and an origin; teams and players would need to reconcile against Taso identities
  (see local-first-philosophy.md, "Future: Palloliitto TASO Integration": Taso as the
  authoritative source for identities); a club-level role appears (assigning matches to
  coaches), which the current one-coach model does not have; conflict rules when both sides
  edit.
- **What to find out first.** Whether Taso exposes an API at all, and to whom. Public
  results widgets on club sites suggest a read API exists behind Torneopal (Taso's
  platform); write access (lineups, results) is almost certainly a partnership with
  Palloliitto, not a developer key. Read-only sync of fixtures and results would already
  remove most of the double entry and needs no write access. Explored 2026-07-01: an
  in-app Taso embed is blocked by Custom-Tab/iframe security.
- **Investigated 2026-09-08: `docs/10-analysis/taso-torneopal-api.md`.** Short version:
  an official club-level REST key exists (read-only, server-to-server only, no write
  methods at all, every precedent (myClub, ASIO) is fixtures-in only); results enter Taso
  through a browser UI by a person with a PalloID or a match code; Torneopal sells API
  support outside standard pricing. So: read sync is real work but doable with a backend;
  write-back needs a partnership; a "Taso helper" copy view needs nothing.
- **Owner decision 2026-09-08: read-only sync is not worth doing.** Fixtures-in does not
  reduce the number of platforms a coach uses, which was the whole point. Only a write
  interface would, and none exists publicly. What remains: (1) the Taso helper view (shipped 2026-09-09,
  top); (2) one email to Palloliitto and Torneopal asking whether a write interface exists
  or is planned, and on what terms; (3) everything else only if that email opens a door.

## 🎯 Growth & business (gated — not engineering priorities)

Business activities, tracked so the strategy is visible alongside the product work. Both are deliberately **gated**: don't market into a weak first-run, don't monetize without traction.

- [ ] **Go-to-market / marketing push** — active user acquisition (app-store optimization, coaching communities, outreach, content), *after* the first-run is strong. **Gate LIFTED 2026-09-04** — Onboarding v2 shipped, the first-run is strong. The marketing *site* is done; this is the promotion/acquisition effort itself. Needs a plan: channels, messaging, target coach segments, launch beats.
- [ ] **Monetization — revisit when there's traction** — currently **parked (free)**. Billing infrastructure is built but disabled (`PREMIUM_ENFORCEMENT_ENABLED=false`); the plan is archived. Replan only once there's a growing, retained user base worth monetizing — not before; it blocks nothing now. When revived: deploy `verify-subscription` and fold in the dormant CR-M8 billing items (purchase-token unique index, `is_active` expiry, Google purchase acknowledgement).

---

## 🧪 Post-launch QA (verification pass, not features)

The manual checklist `user-flow-testing-plan.md` (the root `TESTING-PLAN.md` merged into it 2026-11-18) is unexecuted — run as a verification sweep when convenient. Specific gaps to confirm: session-expiry handling, auth-init timeout recovery, post-login marketing-consent prompt.

---

## 📁 Reference

| Purpose | Location |
|---------|----------|
| This roadmap | `docs/03-active-plans/UNIFIED-ROADMAP.md` |
| Full review 2026-11 checklist (complete except 2.2, 2.3, 2.5) | `docs/03-active-plans/code-review-findings-2026-06-25.md` |
| Onboarding v3 plan + new-user funnel | `docs/03-active-plans/new-user-funnel-fix-plan.md` |
| Post-launch QA checklist | `docs/03-active-plans/user-flow-testing-plan.md` |
| Speculative feature ideas | `docs/04-features/future-vision.md` |
| Supabase implementation reference | `docs/02-technical/supabase-implementation-guide.md` |
| Archived plans (Play Store, billing, reviews, shipped feature plans, etc.) | `docs/08-archived/completed-active-plans/` |
| Preserved code snapshots | tags `archive/pre-cloud-backup`, `archive/planner-integration`, `archive/desktop-responsive-modals` |
| Open issues | #360 (desktop UI, parked). #381 and #369 were absorbed by the shipped Playing-Time Planner. |

---

## ✅ Completed (history)

- **Production launch** (2026-06-09) — Google Play, cloud-only gate enabled, free.
- **Supabase cloud backend** — DataStore abstraction, SupabaseDataStore, both-way migration, local-first sync (SyncQueue/SyncEngine/SyncedDataStore).
- **Billing infrastructure built** (Phases 1-7) — then parked (free); plan archived for an eventual replan.
- **Welcome-screen simplification**, **communication infrastructure** (domains, email routing, Sentry alerts, velomoai.com).
- **Features** — Gender + Game Type labeling/filtering, Personnel Management, Tournament Series & Season Leagues (34 Finnish leagues), First Game Onboarding, External Match Stats, Warm-up Plan, auto-save, backup/restore.
- **Platform** — Next.js 16 + React 19, 0 npm vulns, HomePage refactor (3,725→62 lines), PWA stability, IndexedDB migration.
- **Visual identity pass** (2026-09-14/15, PRs #826 + #827) — pitch-marking hairlines (`border-white/10`) replace grey seams app-wide; team kit colour picker; bigger match-bar score and body text; Escape closes almost every dialog and dialogs announce themselves to screen readers; `modalStyles` consolidated to one file; Home gets a single 2.5 gap on both axes and one shared card surface. **Parked deliberately:** the brand-purple theme (owner kept master's indigo) and the halfway-line divider graphic (`PitchRule`, built then removed).
- **Verified-fixed during triage** — 3 cloud-sync bugs (warmup ID conflict, warmup metadata, games `created_at`) were already fixed (commits `847f0dab`, `b0816143`); CORS extraction, TournamentSeriesManager extraction, jest-axe types all already done.
- **2026-06-11→06-23 — Code review 2026-06-11 fixed**: CR-C1–C4 (#421, #423–#425), CR-H1–H9 (incl. #426), CR-M1, M2, M4–M7, M9 (#463–#466 among others); CR-M5 #1 deliberately skipped; CR-M6 remnants won't-do; consent RLS (migration 031, prod). CR-M3/CR-M8 remainders are open above.
- **2026-06-16→06-20 — Match clock survives backgrounding and reload** (#427, #439, #444, #446, #447; verified on device).
- **2026-06-18 — Store-listing accuracy; internal docs no longer published (#435); `get_user_consent` repo sync (#422); delete-account Edge Function v10; test-suite memory leak (#431).**
- **2026-06-19 — Release-notes guard**: every PR to master carries a new user-facing note.
- **2026-06-23/24 — Sentry storage-retry noise reduced; CI audit gate; site FI parity; cloud-first onboarding (local mode frozen); local device-data wipe on account deletion (core + keep-data affordance); accessibility contrast pass (scope decided); Sentry alerting dropped.**
- **2026-06-24 — Overtime & penalty shootout** (#502–#512).
- **2026-06-26 — Play Store data-deletion declaration** (Data Safety form + `/delete-account` page).
- **2026-06-29→07-01 — Player-development assessment system** (#545–#570); hidden behind a per-user setting, off by default, 2026-09-09 (data kept).
- **2026-07-01 — Positions played per game** (#574, #575), **game recap generator**, **match report + template**, **game lifecycle & completeness** ("Finish this game").
- **2026-07-03 — Undo toast (#626), "Repeat last game" (#628), position diversity, header-counter audit, assessment shipped publicly (site + store).**
- **2026-07 — Two-level app structure** (#681) and **Playing-Time Planner** (migrations 036–038; absorbed #369 and #381).
- **~2026-07-27 — Play 1.0.8** (versionCode 18, targetSdk 35, Play Billing removed).
- **2026-09-04 — Onboarding v2** (#709): setup wizard, first-visit notes, opt-in tour, default formations.
- **2026-09-08 — Kirjuri** voice notes + BYOK AI (#791; experimental, not marketed).
- **2026-09-09 — 4v4 format; futsal formats table (#810); Taso match-report helper ("Pöytäkirja Tasoon"); game captains (#806); Player summary v1; actual-playing-time segments DROPPED (owner).**
- **2026-09-10 — Play Store description refreshed** (FI live, EN written; `docs/04-features/store-listing-{fi,en}.txt`).
- **2026-09-11→09-15 — Opponents belong to the competition** (#830): spelling adoption, rename-anything, self-filling lists, head-to-head, opponent filter + Excel sheet. Tournament per-series lists rejected on prod numbers.
- **2026-09-16 — Age group in the setup wizard (#837); numerals as display type (#838); small findings incl. "Games Played Short" (#834); `tabular-nums` sweep; code fallbacks synced (#843); football format nudge (#842); in-app guide reviewed (#835).**
- **2026-09-17 — myClub links built and removed (owner: not worth a tap); myClub games pull REJECTED (10 EUR/key/month).**
- **2026-09-17 — Match location in Maps + venue pin (#851); next-match panel with directions (#852).**
- **2026-09-18 — Departure time, starting point, distance and the coach-measured drive time (#860).**
- **2026-09-20 — Top card composition (#867); venue book kept in settings (#870, migration 052).**
- **2026-09-21 — Legal text brought level with the app** (all services named, stamps aligned).
- **2026-09-28 — Hero video music licensed** (Envato Elements).
- **2026-09-30 — Form clarity** (#887): `ModalSwitch`, demand slider out of the game forms, "Erät" → "Jaksot".
- **2026-10-02/03 — External games as player data, phases 1-3** (#889 positions + scope, migration 053; #891 entry points; #892 name adoption).
- **2026-09/2026-11 — Marketing site** (match-ops.com): 2026-09 copy refresh, then 2026-11 redesign content with v3 screenshots and the guide rewritten fi/en (#1064). The site's own design stays.
- **2026-11-11→11-17 — Full review 2026-11 fix checklist**: 166 of 169 items shipped (#893–#1051); only owner research tasks 2.2, 2.3, 2.5 remain (open in P0).
- **2026-11-16 — Match timer deep review**: four Fable 5.2 reviewers; findings 4.21–4.36 fixed (#956–#969), 4.33b (#970). Owner question 4.34 decided 2026-11-20: the recorded kicks decide a shootout result; no change.
- **2026-11 — Extra time** (#1049–#1051, migrations 060/061).
- **2026-11 — App redesign "Syke Refined" + Onboarding v3 live** (#1054; follow-ups #1055–#1063, incl. compact Home retired #1056).
- **2026-11-19 — Privacy policy and terms 2026-11** (GDPR fixes, data switch, migration 063 - applied staging + prod, verified 2026-11-20) and **the next game's plan on the next-match card** (#1064).
- **2026-11-20 — Promo videos** hero + basic rebuilt for the redesigned app, fi + en; **full-app line on basic Home, "Sub done" timer button, goals + assists in one recap block** (#1065).
- **2026-11-20 — Play 1.0.9** built with targetSdk 36, live.
- **Ideas sweep 2026-09-17 cross-offs**: Referee Quick Reference = Rules Directory, Formation Templates (presets) = formation presets, Head-to-Head = `utils/headToHead.ts`, Voice Moments = Kirjuri; `future-vision.md` carries a warning header saying so.


---

## 📝 Change Log

| Date | Update |
|------|--------|
| 2026-11-23 | 📖 **Pelitapa renamed Pelikirja (fi) / Playbook (en)** (P3): UI strings, i18n keys (`playbook.*`), code (`src/playbook/`), content and scripts folders and docs; the stored account flag value, local storage keys and migrations 064-067 keep "pelitapa" for compatibility. The roadmap item now records what is built (steps 1-5, 16 reviewed PEPO concepts), the launch checklist, the after-launch list (first universal 5v5/8v8 collections, age tags, half-time shortcut, season paths, alternatives, match-event suggestions), the two-device plan and the vision. |
| 2026-11-21 | 📐 **Pelitapa planned inside MatchOps** (P3): portrait-only presentation view, library, kids mode and game themes; hidden behind a server-controlled per-account flag, with the PEPO content in the database under RLS (not in the public bundle) because the owner doesn't want every coach to see the PEPO style. |
| 2026-11-21 | 💡 **Pelitapa library logged** (P3): animated playing concepts as data on one engine (proved by the PEPO 8v8 board); starter pack + club playbooks + coach's own; game themes in matches. Result letters unified to the Finnish standard V-T-H (discs were V/TA/T). |
| 2026-11-21 | 🧊 **Parked: plans picking up players added to the team** (P3). Proposal and the owner's open question (a new player must not land in games they are not meant for) recorded. |
| 2026-11-20 | 🧹 **Roadmap cleanup**: open sections now hold only unfinished work. Shipped/dropped/decided items moved to one line each in Completed (history): Onboarding v3 + redesign (#1054), full review 2026-11 (complete except 2.2/2.3/2.5), match timer review (4.34 decided: recorded kicks decide), form clarity (#887), marketing site + legal 2026-11 (#1064), promo videos and full-app line (#1065), Play 1.0.9, departure time (#860), map links (#851), next-match panel (#852). Ten finished plans archived to `docs/08-archived/completed-active-plans/`. Items that could not be confirmed are marked (status unverified). |
| 2026-11-20 | 🌍 **International use logged** (P4): Finland first, international later. The Finnish presets (leagues, Palloliitto formats and field sizes, rule links, age-group naming, season calendar, Taso) become a configurable country/federation choice, Finnish default language becomes browser-based, and a legal pass per target market precedes marketing abroad. Trigger: the first non-Finnish sign-up. |
| 2026-09-30 | ✅ **Form clarity shipped** (#887) and **fewer update prompts shipped** (#886): on/off settings are switches, the dead demand slider is gone from the game forms, "Erät" is now "Jaksot"; non-app pushes no longer deploy and internal releases install silently. |
| 2026-09-30 | 🧹 **Form clarity queued** (P2, after the videos): drop the dead demand-level slider from the game forms (only assessments read it, and those are off), swap the on/off buttons for a real switch at nine sites, and retire "Erät" for puoliaika/jakso in the Finnish copy. Found while scripting the "Ottelun asetukset tarkemmin" video. |
| 2026-09-29 | 📋 **External games planned as player data** (P3, three phases): positions + game type/gender/age group on the record with migration 053 and scope-rule support; name adoption reused from the game form; entry points on the player card and beside Uusi ottelu. Playing time explicitly out (the app never records minutes); multi-player entry and guest players deferred. Also logged: in-app help buttons linking to the how-to videos (P3). |
| 2026-09-23 | 🎵 **Hero video gets a music bed; licence still owed.** The promo pipeline (#885) grew a `--music` option; the hero was test-mixed with the Envato preview of "Warm Hip Hop Beat" (CoffeeMusic, 90 bpm). P0 item added: buy one month of Envato Elements, register the download to "MatchOps promo video", keep the certificate, re-render. Same day: update prompts limited (#886) - pushes outside the app no longer deploy, and app changes a coach cannot see install silently via `"internal": true` in the release note. |
| 2026-09-22 | 🎯 **Positioning corrected by the owner: playing time is DATA, not a promise.** The memo framed "fair playing time" as the message; the owner rejects endorsing the app that way. Within one match it is natural and right that running-heavy roles are subbed more (Suggest already does this), so equal minutes per game is not the goal. The planner's minutes are useful as a distribution across many games - a tournament - to catch accidental imbalance before it becomes a pattern. Marketing sentence to build on instead: the match day handled, from the door to Taso, with the minutes as the record you keep. Applies to the parents' view and the club report too: they show what happened, they do not enforce. Video pipeline proven the same day (Playwright + ffmpeg, scripted, repeatable). |
| 2026-09-21 | ⚖️ **Legal text brought level with the app** (terms + privacy, markdown + in-app + site, EN/FI): all seven services named; stamps aligned to 2026-09 with no re-consent (clarification, constant unchanged); Data Safety checklist written for the owner. Same day: CI test job sharded four ways (#879), settings reach the Home card without reload (#878), season record on the Viimeisimmät line (#877). |
| 2026-09-20 | 📍 **Venue book kept in settings** (migration 052, `known_venues jsonb`, applied to staging + prod the same day). The book was rebuilt from saved games, so deleting the only match at a ground forgot it - the owner hit it the day after deleting a test fixture. Now learned from matches in `refreshSetupSignals` and never shrunk by a deletion; both venue fields read it through `useKnownVenues`. Same day: `locationAddress` carried through the session (dropped on load, then wiped by the next autosave), Home re-reads on match exit, Jatka card lost its action row. |
| 2026-09-20 | 🤝 **Official companion path written up** (owner). Sell the idea to Palloliitto before building: demo is the app as it is plus six slides written from the federation's chair (Taso data quality, Kaikki Pelaa evidence, volunteer retention, 2027 formats); pilot not blessing; Torneopal is the technical counterpart; volunteer offer recorded with a time box and IP conditions. The one-system dream (myClub + Taso + MatchOps) recorded as direction with the order read → write → myClub read → own. Veo substitute assessed: not the camera, yes to event-cut highlights from a phone recording (the app already has the timestamps), parked P4 behind consent and on-device storage. Follow-the-plan marked explore-further with the drift model and the plan-less caveat. Top card composition built. |
| 2026-09-19 | 🧭 **Strategy memo recorded** as its own section (numbers from prod, six ideas ranked by the planner signal, a business path A-D, eight small enhancements, seven design items, and a sequence). Two new P0 items: Supabase Pro for prod (no PITR today) and, by reference, the legal docs. One decision proposed and not yet taken: four weeks of marketing before any new feature. Also this week, all merged (#856-#866): two-field venue model + venue book, departure time with starting point and buffer, one-date seurakausi, settings that never persisted in cloud (migration 051), venue address healing, Home top card never empty. Top-card composition mocked for the owner. |
| 2026-09-18 | ⚖️ **Legal docs logged as drifted; Photon disclosed.** The app talks to six third parties and the terms name four - Photon, OpenAI (BYOK, so worded differently) and palloliitto.fi are missing, in the published markdown and the in-app copy alike. Photon has now been added to the privacy policy in both places; the terms are untouched. Three version stamps disagree: `POLICY_VERSION` says 2026-09, the published privacy-policy markdown says 2026-06, the in-app string says September 2026 - and the markdown is the copy users actually read. No stamp was bumped on purpose: the terms promise a re-consent prompt for cloud users on material change, and that call is the owner's. Play Console Data Safety predates venue coordinates and needs the same pass. |
| 2026-09-18 | 🗺️ **Venue map picker reverted before merge** (#857, owner). Built because OSM does not carry sponsor names - "Mitta-Keittiöt Areena" finds nothing. The owner's own testing killed it on better grounds than the bug it exposed: **a venue has a street address, and OSM knows street addresses perfectly**, so the searchable path was there all along and a Leaflet dependency plus an `img-src` CSP widening bought nothing. Also found on the way, and worth remembering before anyone ships a location feature: `Permissions-Policy` has `geolocation=()`, so any "use my position" button fails before the browser ever prompts. Open question the revert leaves behind: picking by address stores the ADDRESS as the label, when the coach calls the place by its name. |
| 2026-09-16 | 🔗 **myClub + Taso hand-offs scoped** (P3, `taso-torneopal-api.md` §7). Level 0 (owner-requested): manual "filed to Taso" / "attendance marked" checkboxes on the game, opt-in via an `assessmentsEnabled`-style toggle so the completeness bar keeps its meaning for everyone else - the first self-reported rows in an otherwise fully derived model. Confirmed on the way: **the app has no pre-game checklist at all**, which is why the pre-game Taso lineup has no home; the answer is a deadline-aware nudge on the games tab (the lineup is due 4h before kickoff), not a retrospective checkbox. Investigated rather than assumed, and the result mirrors Taso exactly: **myClub can be read but not written** - `event-core` has no participation field and there is no `/participations` path, so attendance cannot be pushed back. The app pulls from both systems and pushes to neither; no app format changes that. Level 1 is two links beside Taso (myClub web is a per-club subdomain, so only `id.myclub.fi` can be hardcoded; myClub Coach is a native app needing an `intent://` link). Level 2, a games pull, is gated on one CORS request - a preflight returned 403 with no CORS headers, and the answer decides client-side BYOK versus an Edge Function proxy. |
| 2026-09-16 | 🧊 **Desktop parked as an idea only, the same day it was planned** (owner). The plan was sound and the premise was not: the phone app no longer has the gaps the desktop was meant to fill, so the laptop session never happens. Kept for its findings. Separately, an earlier "Taso side by side is not possible" was **half wrong** - embedding and the API are still out, but Android split-screen was never ours to forbid; it needs the `portrait-primary` manifest lock dropped, a resizeable TWA activity (unverifiable here), and short-viewport work the app has in exactly one file. |
| 2026-09-16 | 🖥️ **Desktop planned from the ground up** (`desktop-workspaces-plan.md`). The archived attempt failed structurally, not technically: `renderMode` forked every modal into two designs. The issue's own phone-column idea is cheap but buys nothing. This is a third route - one component rendering as either a sheet or a panel, arranged into five workspaces - and it maps every one of the 28 modals to what it becomes. Six stay modal, and they are the ones that should interrupt. |
| 2026-09-16 | 📋 **Timer-hardening parked** by the owner, with the review recorded so the next person does not re-derive it. **Desktop UI (#360) re-read:** the abandoned attempt took the expensive per-modal route; the cheap single-wrapper approach in the issue was never tried, and its one real risk (22 files use `backdrop-blur`, which misbehaves inside a transformed ancestor) is a one-afternoon spike to settle. |
| 2026-09-16 | 🔢 **Numerals direction decided and shipped** (#838). The owner picked the middle option from a side-by-side mock of nine places: the number becomes the display element ONLY where the number is the point. Four components changed - stats tiles, match score, season record, planner minutes. Deliberately unchanged: tables (scanned by name), the recent-games strip (the opponent would shrink below the date on a 108px card), shirt numbers (already at the disc's limit), the counts bar (a sentence), and the timer, whose labels turned out to be captions already. |
| 2026-09-16 | 🎂 **Setup wizard asks for the age group** (#837), and the answer reaches a game rather than sitting unread on the team - which the scope had flagged as the whole risk. Also fixed a test-isolation leak found on the way: a `jest.spyOn` over the suite-wide localStorage `jest.fn`, restored with `mockRestore()`, left `getItem` with no implementation for every later test in that file. |
| 2026-09-16 | 📖 **In-app guide reviewed against the current UI** (#835). Two claims were wrong in BOTH languages: "no account needed" (the Play build is cloud-only and requires sign-in) and a Finish-this-game tooltip promising player assessments, which have been off by default since 2026-09-09. Also named the Rules screen and the two gear entries the guide had never listed, and explained the opponent-name behaviour - the one place the app changes what a coach typed. Found while checking: 126 code fallbacks that disagree with the shipped English, logged to P2. |
| 2026-09-16 | 🧹 **Logged findings cleared** (#834). The "Games Played Short" header was five broken columns, not one - the English player stats table had been showing placeholder names for every abbreviated column. Guarded by a test so the shape cannot return. Also removed LoadGameModal's unreachable badge filter and the orphaned pitch tokens, and put the season card on the shared Home surface. |
| 2026-09-15 | 🔎 **Findings logged to P2** from the opponent-names work: an English column header that reads "Games Played Short" (a real user-visible bug, `common.gamesPlayedShort` never given its abbreviation), LoadGameModal's unreachable badge filter, two orphaned style tokens, the one Home card still off `HOME_CARD`, and one unreproduced test flake. |
| 2026-09-15 | 🏷️ **Opponent names made stable** (#830). Entry-time adoption of the spelling already in use, a refusal that rewrites history, self-filling competition lists, the split-name warning moved to the statistics screen where it does the damage, and renaming of any team rather than only inconsistent ones. Decided by a prod scale check (214 games, 19 coaches): 41% of league games repeat an opponent against 6.5% of tournament games, 0 of 9 seasons had a curated list, and 13 opponents already carried more than one spelling. Tournament per-series lists rejected on those numbers. |
| 2026-09-15 | 🎨 **Visual identity pass merged** (#827, which also closed #826). Shipped: pitch-marking hairlines app-wide, the team kit colour picker, larger score/body type, universal Escape-to-close + dialog semantics, one consolidated `modalStyles`, and on Home a single 2.5 gap on both axes plus one shared card surface (`HOME_CARD`). Parked by the owner: the brand-purple theme (master's indigo kept) and the halfway-line divider graphic. Still open from the same review: ~36px touch targets against a 44px minimum, and the numerals-as-display-type direction, which the owner wants explained before deciding. |
| 2026-09-15 | ⚽ **Football 2027 formats found and recorded** (owner asked; previously logged as "no extractable source"). Palloliitto's own slide gives the full age-to-format mapping WITH birth years - 5v5 to U10, 8v8 to U13, 3v3/4v4 new for U7 and younger. Pitch/goal/ball/time columns are still unpublished, so a football row in `gameFormats.json` can carry player counts and age bands only. Also promoted **"Ask for the age group in the setup wizard"** to P2 at the owner's request; it is worth more now that the 2027 table keys off age group. |
| 2026-09-04 | 🎙️ **Kirjuri planned** (`kirjuri-ai-plan.md`): dictation capture + BYOK post-match AI, 6 phases / 12 PRs on `feat/kirjuri-ai`; revised same day after a codebase audit and a privacy review (consent gate, risk assessment, no Google speech). Assessment becomes AI output from collected evidence, not slider input. |
| 2026-09-04 | 🚀 **Onboarding v2 shipped to master** (PR #709, merge `c1b407b5`; ~25 reviewed PRs via `feat/new-user-funnel`): setup wizard, first-visit notes, opt-in tour, real default formations, non-blocking toasts, goalie/field fixes. Marketing gate lifted. |
| 2026-08-31 | ✅ **Play compliance marked done** — 1.0.8 (code 18, targetSdk 35, no billing) was uploaded ~2026-07-27 and is live; roadmap item was stale. |
| 2026-08-31 | 🎛️ **Player assessments — decided to flag-hide (P2 item added, footprint mapped).** Honest reversal of the July "ship it publicly" push: rating-based measurement judged wrong-form for youth (see item for rationale + the gameCompleteness readiness fix); data layer stays intact. Also annotated: new-user fixes superseded by the guided tour on `feat/new-user-funnel` (master PR #709 green, awaiting owner merge). |
| 2026-07-27 | 🧹 **Roadmap refresh + marketing revamp.** Marked two-level app structure (#681) and the Playing-Time Planner as merged/live (roadmap was stale). Shipped a **full marketing-site revamp**: all screens on v2 screenshots with unified chrome (recaptured on current UI or re-chromed), and a copy pass across hero/spotlights/feature-cards for a neutral, feature-describing tone with natural Finnish. Also fixed a real planner bug found while capturing (planned-sub nudge was suppressed for plan-created games) and small timer-overlay polish (removed the corner X + confusing "LP" full-time pill, aligned the score header), all live. **Next priority: ⏰ Play compliance deadline 2026-08-31 (TWA target API + Play Billing).** |
| 2026-07-01 | 📋 **Post-game workflow push (PRs #569–#595).** Shipped: **positions played** (per-player, cloud-synced, sport/size-aware selector 5v5/8v8/11v11 + All, formation-covering palettes), **game recap generator** + polish (full-width generate button, header colons, penalties-only result, near-full-height preview), **game lifecycle & completeness** (model + "Finish this game" checklist + Load Game readiness dot + "Game report" menu entry), **match report + "Use template" scaffold** + unified resizable editors, and UI consistency (blue toggle buttons for not-played/OT/penalties, report line-break display fix). Explored + parked: TASO in-app embed (blocked by Custom-Tab/iframe security; a "TASO helper" copy view remains buildable). |
| 2026-07-01 | 🧭 Player-development assessment feature built & merged (#545–#568). Roadmap: added P3 "ship the assessment publicly" (match-ops.com copy + new screenshots + Play Store update); reframed the assessment plan's backlog item 7 from "external-game assessments" into a **standalone / point-in-time assessment** primitive with report-editing + external-games as the two consumers (+ "considered vs observed" trend caution). |
| 2026-06-11 | 🧨 **Whole-app code review (7-agent) → P0.** 4 critical (mid-game reload clock corruption, IndexedDB read-error wipe path, cloud entity-delete FK failure, stale-snapshot re-migration), 9 high, 8 medium clusters added as CR-C/H/M items. Also: account-deletion hardening shipped (`77ac8034`), Play badge links live (`944509fe`), P2 items added for Play Store data-deletion declaration + local device-data wipe. |
| 2026-06-10 | 🧹 **Full backlog triage + prioritization.** Parked monetization (going free → closed #171/#172, archived billing plan). Scrapped Planner impl (closed PR #404 + #372/#373/#377/#378/#379, reframed #369, tagged code). Verified-and-discarded 3 phantom cloud-sync bugs + several already-done tech-debt items. Kept #371 (consent), #381, #364, #360, #273. Tagged & deleted desktop branch. Reprioritized everything P0-P4. |
| 2026-06-09 | 🚀 Production release — live on Google Play (cloud-only, free). |
| 2026-01-28 | Docs audit; future-vision features + cloud-sync bugs added to backlog. |
| 2025-12 | Supabase backend, Gender/Game Type features, Next.js 16 + React 19 upgrade. |

---

**Current Focus** (2026-11-20): the redesign, Onboarding v3 and the full review 2026-11 are shipped and live.
Open owner items: the three review research tasks (2.2, 2.3, 2.5), the Data Safety form, the store
listing for the redesign, and Supabase Pro once revenue covers it. Then the strategy memo's sequence:
marketing, watching one number (coaches with 3+ matches), and building toward the planner signal -
**follow-the-plan match mode** → parents' minutes view → the club fairness report. Parked:
modal-chrome modernisation, desktop UI, AI assistant, timer-hardening.
