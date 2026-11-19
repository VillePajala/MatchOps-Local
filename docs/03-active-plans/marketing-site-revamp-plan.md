# Marketing Site Revamp Plan

Status: proposed (awaiting build, plan agreed 2026-07-22)
Scope: full revamp - restructure the information architecture, add missing features, reshoot all screenshots.
Site: `/site` (the `match-ops-hub` Vercel project), Next.js Pages Router, EN/FI.

## 2026-11 UPDATE - release blocker for the redesign + onboarding v3 (read first)

The app was redesigned (navy "Syke Refined", stacked match view, laurel badge) and got
onboarding v3 (`new-user-funnel-fix-plan.md` § Onboarding v3). Owner rule 2026-11-19: the site,
the online guide, the promo videos, the Play Store listing and a new AAB are all updated
BEFORE the redesign branch merges to master. Owner decision: **content only** - new
screenshots and text; the site's own design stays. **Copy rule:** no fairness / equal-play
claims ("reilu", "tasapuolinen", "kaikki pelaavat", "fair playing time") - this overrides the
"fair playing time" framing in *Why* below. Audit 2026-11-19 (read-only, file:line evidence in
the session record):

**Site pages**
- `index.tsx`: remove "kooste"/"Ottelukooste" and "Pöytäkirja Tasoon" (common.json:238,
  :564-571, :580); rewrite `guidedSetupDesc` (:583) for the new wizard; planner spotlight
  (:446) "epätasaisen jakauman" -> neutral "näet jakauman"; consider "Suunnittele, peluuta,
  kirjaa." for the section header (index.tsx:410); add Maali meille, Ketkä ovat paikalla?,
  one-game Peluutus + Jaa, Perusnäkymä/Koko näkymä; all 30 `getScreenshots` entries
  (index.tsx:15-115) replaced; new OG.png.
- `Layout.tsx`: old logo (:62) -> `public/logos/matchops-badge.svg`; site favicons replaced.
- `marketing-assets.tsx`: no-account / data-stays-local / "UUTTA: Pilvisynkronointi" /
  "Kirjaa maali" texts; test-count cards (4 700+ -> current); uses the pre-v2 screenshots.
- `technical.tsx`: test count; "Network only required for updates" is wrong (sign-in required).
- `privacy.tsx`: version 2026-06 vs app 2026-09; the "Voice notes and AI" section the text
  points to is missing; ADD the onboarding-milestone + `app_layout` sentence (purpose, basis,
  deleted with the account, never shared); `POLICY_VERSION` bump = legal call, site and app
  together.
- `terms.tsx`: "Päivitetty: kesäkuu 2026" vs version 2026-09.
- `gallery.tsx`: archive renders - proposed drop. `pages/docs/QUICK_START.md` +
  `USER_MANUAL.md`: obsolete, English only, unlinked - proposed delete + redirect to /guide.

**Online guide** (`site/content/guide/{fi,en}`, 13 articles each; no images today; app links
to /guide and /guide/full-setup-path resolve)
- Rewrite: getting-started (new-coach path), after-the-game ("Viimeistele ottelu":
  Pöytäkirja -> Otteluraportti + "Jaa otteluraportti"), game-day-workflow / during-the-game
  (stacked view, five-button bar, Maali meille, next-sub block, "Nollaa vaihtoajastin",
  attendance; select-and-place only).
- Sweep the old "(☰) menu" paths to Home tabs / gear: full-setup-path (mark as Koko näkymä),
  teams-organization, roster-management (current metric set), statistics, tactics-board
  (no drag wording), data-management (+ "Näkymä" setting).
- Light edits: faq (+ basic-layout and attendance Q&As), tips (copy rule), troubleshooting.
- Add: "Ennen peliä: Peluutus ja Ketkä ovat paikalla?" and a Perusnäkymä/Koko näkymä section.
  Consider merging game-day-workflow into during/after.

**Videos** (`scripts/promo-video`)
- start: REWRITE (sign-up -> wizard with sport/age group/paste -> "Milloin seuraava peli?" ->
  Peluutus -> basic Home). basic: REWRITE as the real Perusnäkymä day (seed
  `appLayout:'basic'`). hero: ADJUST (dead "Selvä", "Vaihto tehty", kooste; add attendance).
  create: ADJUST or fold into a short Koko näkymä clip. advanced: adjust or drop.
  `lib/seeds.mjs`: add a basic-layout seed + milestones; reword `reportBasic` (copy rule).
  `lib/recorder.mjs`: remove dead first-visit flags. Re-render intro/end cards (tagline).
  `site/remotion/PromoVideo.tsx`: proposed drop (superseded).

**Screenshots:** recapture everything as `MatchOps_v3_<name>_<fi|en>.jpg` - new: signup,
wizard, nextgame, peluutus, homebasic, attendance, matchview, timer, quickgoal, finish,
poytakirja, matchreport, sharereport; recaptured in the new style: planner, positionbalance,
nextmatch, dashboard, playerstats, teamstats, tacticalboard, formations, roster, positions,
overtime, seasons, tournaments, teams, archive, goallog, excelexport, personnel, futsal,
rules, cloudsync, newgame, voicenotes; plus OG.png and logos/favicons.

**App-side blocker found by the audit:** the planner still says "Ehdota reilut kokoonpanot" /
"Reilut kokoonpanot ehdotettu" (`public/locales/fi/common.json` ~3680) - copy rule; fix before
filming or capturing the planner.

**Order:** app copy fix -> privacy page -> logo/favicon/OG + deletions -> demo seeds ->
screenshots -> index/marketing/technical copy -> guide (fi first, then en) -> videos.

## Why

The landing site has drifted from the product. It advertises 20 features as a flat, equal-weight list and is missing the Playing-Time Planner entirely (the site only mentions a substitution-interval timer; the app now plans and balances minutes). Flagship differentiators (planner, player development) sit at the same weight as "Official Rules," so nothing leads. Screenshots predate the two-level Home, the dashboard, and the modal-chrome sweeps.

Goal: a structured site that leads with what makes MatchOps different (fair playing time, player development, season overview), with an accurate, current feature set and fresh screenshots.

## Current state (reference)

- Homepage is one file: `site/pages/index.tsx`. Sections top-to-bottom: hero (5-phone showcase) -> compact CTA -> "Plan / Track / Discover" band -> flat list of 20 feature cards -> hidden tech-stats -> final CTA.
- Feature copy: `site/public/locales/{en,fi}/common.json`, key `marketing.featureCards.*`.
- Feature order + screenshot mapping: hardcoded in `index.tsx` (`getScreenshots()` map ~lines 15-87, card array ~lines 438-459).
- Screenshots: `site/public/screenshots/*.jpg`, language-paired (`_en` / `_fi`), framed by `components/marketing/PhoneMockup.tsx`.
- Dead code (do not waste effort on): `components/FeaturesSections.tsx` and the `features.*` locale keys are not rendered anywhere. Many orphaned screenshots and an `archive/` gallery set exist.

## Part A - Features

### Add (currently missing)

1. Playing-Time Planner (FLAGSHIP). Plan substitutions and rotations before kickoff and keep each player's minutes fair across games. This is the biggest gap and a core differentiator.
2. Season-overview Home / dashboard. The new default Home: resume the game you were tracking, season (Vuosi) record, recent results, top scorer - all at a glance.
3. Friendly matches (harjoitusottelut). Track practice games without skewing competitive stats; fold them back in with one toggle.

### Draft copy (EN - refine before build, FI to follow)

- Playing-Time Planner (leads with PLANNING AHEAD, per decision). Headline: "Plan your games ahead." Body: "Set your substitutions and rotations for upcoming games in advance - decide who plays where and when before you ever reach the pitch, so game day runs itself. Playing time stays balanced across the season as a result."
- Your season at a glance (dashboard): "Open the app to a clear picture of your season - pick up the game you were tracking, your record, recent results and top scorer, right on the home screen."
- Friendly matches: "Track practice games and friendlies without skewing your competitive stats. Fold them back in anytime with a single toggle."

### Keep / refresh copy

Existing 20 cards stay (regrouped, see Part B). Minor copy review on "Leagues" and any card whose wording changed with the two-level UI.

## Part B - New information architecture

Replace the flat 20-card list with hierarchy: flagships lead, the rest are grouped into scannable themed bands.

1. Hero - keep the phone showcase; swap one phone to the new dashboard Home. Tagline unchanged ("Plan / Track / Discover").
2. Compact CTA - keep (Play badge + email).
3. Plan / Track / Discover band - keep, refresh screenshots.
4. Flagship spotlights (NEW - large, own sections, one screenshot each):
   - Playing-Time Planner
   - Player Development compass
   - Season-overview Dashboard (the new Home)
5. Themed feature bands (replaces the flat list):
   - Game day: lineup builder, live timer, tactical board, planner, match log, overtime & penalties, quick formations, game recap
   - Player development: development compass, development trends, positions played, position balance, match report
   - Your club: player roster, team builder, coaching staff, seasons/leagues, tournaments, friendly matches, futsal
   - Stats, sharing & anywhere: automatic statistics, Excel reports, game archive, cloud sync, offline PWA, official rules
6. Final CTA - keep.

Notes:
- The three flagship spotlights double as the "hero" of their respective bands, so the bands can list the remaining items more compactly (smaller cards, not full alternating rows) to avoid a wall of 20+ big cards.
- Consider anchoring nav or a sticky section index for the bands (optional, decide during build).

## Part C - Screenshots

Each shot is an EN + FI pair. Naming convention: `MatchOps_main_<feature>_<lang>.jpg`.

Capture method (decided): controlled browser / emulator at a fixed viewport, so every shot shares the same framing and pixel dimensions. Set a consistent device width, load a realistic data state, capture EN, toggle to FI, capture the pair. (Not ad-hoc device screenshots - uniformity across the gallery matters.)

### Preserve the old screenshots (non-negotiable)

The current 72 feature screenshots (~66MB) must never be lost. Three guarantees, no wasteful duplication:

1. The `marketing-pre-revamp` git tag freezes `site/public/screenshots/` exactly as it is today. Retrievable anytime: `git checkout marketing-pre-revamp -- site/public/screenshots/`.
2. HARD RULE during the reshoot: never overwrite or delete an existing screenshot file. New and refreshed shots use NEW filenames. The old files stay physically in the repo through the whole revamp - nothing is replaced in place.
3. At Phase 3 (cleanup), the now-orphaned old feature shots are `git mv`'d (moved, never `rm`'d) into `site/public/screenshots/archive/pre-revamp/` - a clearly labeled, browsable archive that stays in the repo. If we later want them out of the deploy, move that folder outside `public/`; either way they remain versioned and accessible.

New (must shoot):
- Playing-Time Planner
- Dashboard Home (season overview)
- Home hub with tabs (Club/Seura layout)
- Friendly match (the flag / stats exclusion)

Refresh (chrome changed - full-width headers, footers removed):
- Roster modal, team creation, season/league, tournament, personnel, quick formations, game settings

Probably still accurate (field/data unchanged) - reshoot in one pass for visual consistency:
- Lineup/soccer field, game timer, tactical board, goal logs, overtime, player statistics, team stats, Excel export, player development, recap, positions, position balance, development trends, match report, futsal, official rules

## Implementation notes

Files to edit:
- `site/pages/index.tsx` - new section structure, flagship spotlights, themed bands, `getScreenshots()` map, card arrays.
- `site/public/locales/en/common.json` + `fi/common.json` - add `marketing.featureCards.playtimePlanner` / `dashboard` / `friendlies` (+ `...Desc`), keep parity.
- `site/public/screenshots/` - add new images (EN+FI), replace refreshed ones.
- `site/components/marketing/PhoneMockup.tsx` - reuse for new spotlights.

Hygiene (optional, same PR or a follow-up):
- Delete dead `components/FeaturesSections.tsx` and its `features.*` locale keys.
- Prune orphaned screenshots (audit `pages/marketing-assets.tsx` first - it is the other consumer).

## Decisions (2026-07-22)

- Planner copy leads with PLANNING AHEAD ("Plan your games ahead"), not the fair-minutes or rotation angle. Fair playing time is a supporting benefit, not the headline.
- Dashboard gets its OWN flagship spotlight (large dedicated section), alongside Planner and Player Development.
- Keep the separate `/gallery` page as-is (refresh its shots, no structural change).
- Screenshots: capture via a controlled browser/emulator at a fixed viewport for consistent framing/dimensions, EN + FI pair per shot.

## Phasing

1. Copy + IA: write the new sections and feature copy (EN+FI), restructure `index.tsx`. Deployable behind the same screenshots temporarily.
2. Screenshots: capture new + refreshed shots (EN+FI), wire into the map.
3. Hygiene: remove dead code and orphaned assets.
4. Review on preview (`match-ops-hub` preview build), then merge.
