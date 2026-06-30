# Player Development Assessment - Vision & Plan

**Status**: In progress. PR 1 (id-keyed storage, expand step) shipped 2026-06-29 (#545; prod
migrated + 27 rows backfilled). PR 2 = metric content change to **set A** (next). Default metric set
locked to set A 2026-06-29.
**Roadmap**: linked from `UNIFIED-ROADMAP.md`.
**Origin**: design conversation exploring a shareable game card -> player "compass" -> the metrics
themselves -> this system-level rethink.

## North star

**Development, not evaluation. The point of the data is to help a player move forward.**

This is not a slogan; it is enforced at every layer below. Concretely it means:

- **Compare the player to their own past, never to peers.** No leaderboards, no squad-wide rating
  sort. Cross-team / cross-coach comparison is **out of scope by design** (it is the ranking
  behaviour the philosophy rejects).
- **Every metric is a trainable, in-game-observable quality** - not body size, not an outcome, not
  a phase/role. A low value means "this is what we work on next", never "you are bad at this".
- **Qualitative over numeric where possible.** A short observation often helps a player more than a
  number. Numbers exist to show a *shape* and a *trend*, not a grade.
- **Low friction or it dies.** Ten sliders x a full squad every game gets done twice, then
  abandoned. The system must make light, partial, rotating capture the normal path.

## The metric library and templates

### Why change at all

Of the current 10 (`src/utils/assessmentStats.ts` METRICS), only **two actively contradict the
north star** and should go regardless:

- **duels (kaksinkamppailut)** - measures who won the physical battle -> biases toward early-maturing
  kids; not developable fairly.
- **impact (vaikutus)** - outcome-driven -> evaluation, not development.

The rest (courage, decisions, technique, awareness, teamwork, fair_play, intensity, creativity) are
fine. So this is a **surgical change, not a rewrite** - roughly 4 of 10 slots move.

### Timing makes the decision

A development tool's value is the trend over time; changing metrics **breaks a player's history**.
The app launched ~2026-06-09, so there is ~no real assessment data yet. **Now the change is nearly
free; later it discards every player's development curve.** If we change at all, change now.

### Metric library + templates (pick-your-own)

The primary path is **curated templates** - each a coherent, ready-to-use set of ~10 metrics for a
given philosophy/age. A coach picks a template and starts; most never need to go further. Leading
with templates avoids choice overload ("pick one of these four sets" beats "pick 10 from a list of
40"). Behind the templates sits a **library** of well-defined, specific items (templates are
selections from it), and an **advanced** option to assemble or tweak your own set or add custom
metrics. Every item has a **specific** name - no vague catch-alls like "Technique" (prefer First
touch / Dribbling / Finishing) - a one-line description, and a corner.

Drop `duels` + `impact` (they violate the north star). The default set (A) also leaves out
`creativity` - it stays in the library / Creative-attacking template. The rest live on in the
library, renamed for clarity. **Labels are tunable later without data impact** - the stable `id`
(storage key) is what's fixed.

**Starter library** (✓ = in the default template, set A):

Technical
- ✓ Pallonhallinta / Ball control (`ball_control`) - first touch, keeping the ball under pressure
- ✓ Syöttäminen / Passing (`passing`) - weight, timing, choice of pass
- Kuljettaminen (1v1) / Dribbling (`dribbling`) - taking on and beating an opponent
- Viimeistely / Finishing (`finishing`) - shooting & scoring quality
- Pallon suojaaminen / Shielding (`shielding`) - protecting the ball with the body
- Heikomman jalan käyttö / Weaker foot (`weaker_foot`)

Tactical / game intelligence
- ✓ Havainnointi / Scanning (`scanning`) - looks around / gathers info before receiving
- ✓ Pelikäsitys / Game understanding (`game_reading`) - positioning & reading, both phases
- ✓ Päätöksenteko / Decision-making (`decisions`) - the right choice for the moment
- Liike ilman palloa / Off-ball movement (`off_ball_movement`) - runs that create / exploit space
- Luovuus / Creativity (`creativity`) - tries the unexpected, finds a solution

Psychological / attitude
- ✓ Rohkeus / Courage - demands the ball, plays forward, dares to risk
- ✓ Yritteliäisyys / Effort - work rate, tracks back, tries again
- ✓ Ilo / Enjoyment - visible joy / engagement (strongest stay-in-sport signal)
- Keskittyminen / Concentration - stays switched on
- Reagointi vastoinkäymisiin / Response to setbacks - bounces back after a mistake

Social
- ✓ Joukkuepeli / Teamwork - shares, supports
- Kommunikointi / Communication - talks on the pitch
- ✓ Fair play / Respect - referee, opponent, own mistakes, defeat
- Johtajuus / Leadership - sets an example, organizes

**Default template = exactly 10 (set A)**, balanced across corners (2 technical / 3 tactical /
3 attitude / 2 social) - the ✓ items. Stable ids:
`ball_control, passing, scanning, game_reading, decisions, courage, effort, enjoyment, teamwork,
fair_play`. It is scanning/TOVO-flavoured (perceive-decide-execute runs through it). Templates to
ship:
- **Balanced (default, 10)** - the ✓ set (set A).
- **Light 6 (U7-U9)** - Enjoyment, Courage, Effort, Ball control, Teamwork, Fair play.
- **Creative-attacking (10)** - adds Creativity, Dribbling, Finishing, Off-ball movement.

### Fair play - the slider and the card are different things

Correction (the earlier draft conflated these): the per-game **fair-play CARD**
(`receivedFairPlayCard`) is a recognition handed to **one** player per game. It is **not** a
substitute for assessing fair-play conduct as a quality. So:
- **Fair play / Respect** stays a normal **library metric (slider)** - a per-player observation, on
  every assessed player.
- The **fair-play card** remains its own separate per-game award (one player), unrelated to the
  slider. They coexist.

### Age bands

Metrics are age-banded, not one-size-fits-all:

- **U7-U9 (light 6)**: Ilo, Rohkeus, Yritteliäisyys, Pallonhallinta, Luovuus, Joukkuepeli. No
  tactics; attitude + basic skill + social.
- **U10-U12**: add Havainnointi, Pelikäsitys, Päätöksenteko.
- **U13+**: full set, more tactical depth.

### What was explicitly rejected and why

- **Valmennettavuus (coachability)** - a longitudinal/training-ground trait, not a single-game
  observation; also rewards compliance over autonomy, against the TOVO grain.
- **Puolustaminen (defending) as its own axis** - it is a phase/role, not a quality; including it
  without "attacking" is asymmetric. Defending is captured via Game understanding + Decision-making
  + Effort, in both phases.
- **A single average number in the compass centre** - averaging 10 dimensions into one figure is
  precisely what enables ranking players. The *shape* (strengths + growth areas) is the development
  information; the single score is an evaluation artefact. Prefer no centre number, or replace it
  with 1-2 highlighted "focus next" areas.

## The four layers

### 1. Define - what we measure
- **Templates first.** A coach picks one of a few curated, ready-to-use sets (Balanced default,
  TOVO-spine, Light 6, Creative-attacking) and starts. This is the main path and avoids choice
  overload.
- Behind them sits a curated **library** of specific, well-defined items (grouped by corner, no
  vague catch-alls) - templates are selections from it.
- **Advanced**: assemble or tweak your own set from the library, or add custom metrics; rename,
  reorder, age-band.
- We **set a strong example, we do not mandate.** ("Who are we to define them for everyone" -> we
  don't; we provide good templates + a library and allow dissent.)

### 2. Capture - how we record (friction is the killer)
- **Spotlight rotation - a default, not a restriction.** The app *suggests* 2-3 players to focus on
  per game and rotates through the squad so attention spreads without burnout - but the coach can
  always assess **all** players in any game. Rotation is a helper, never a gate. Default state for
  un-assessed players is "not observed", never a forced middle value.
- **5-level developmental word scale** (not 1-10) - a growth ladder, not a grade. Draft wording:

  | FI | EN |
  |----|----|
  | Harjoitteluvaiheessa | Working on it |
  | Orastava | Emerging |
  | Kehittyvä | Developing |
  | Vakiintunut | Consistent |
  | Vahvuus | A strength |

  Keeps it about progress, avoids "is this a 6 or a 7". (Compass shows 5 rings, not 10 gradations -
  accepted.)
- **Micro-observations**: one-tap "noticed X" tied to a metric + moment, accumulating over time.
- **Qualitative note** per player is first-class - words often help a player more than a level.
- **Reminders - optional, off by default** (e.g. "you haven't assessed Eero in 5 games"): opt-in so
  it nudges without nagging.
- **Live in-game capture - desirable but needs careful design.** Catching the moment as it happens
  is valuable, but it must not pull the coach's attention off coaching. Treat as its own design
  question (timer-overlay tap? voice? quick player-tap -> metric?). Ship **post-game capture first**
  as the safe default.

### 3. Track - the real value, all over time
- Per-player **development timeline**: the compass evolving across games/season; per-metric trend.
  Reuses existing charts (`MetricTrendChart`, `MetricAreaChart`, `SparklineChart`,
  `getPlayerAssessmentTrends`).
- **Focus areas - manual, metric-anchored, with gentle suggestions.** The coach picks the metric to
  focus on (anchoring to a metric is what makes progress trackable) + an optional free-text note.
  The app may *suggest* candidates ("Decision-making has sat at Working-on-it for a few games") but
  never auto-assigns - a kid's development priority is a coaching judgment, and the lowest score is
  not always the right next focus. Carry 1-2 forward between games and revisit.
- **Trend threshold - count observations of that metric, not games.** With spotlight rotation data
  accrues slowly. 1-2 observations = show dots only (no line, no improving/declining verdict); 3+ =
  a cautious trend, labelled small-sample until solid. Never imply a trajectory from two points.
- Show **growth** ("decision-making: Emerging -> Developing over 8 games"), not standings.
- **Lives in the existing player view.** Extend the player tab in `GameStatsModal` with a clear
  **"Development" section** alongside match stats - not a new modal/route to discover. Match stats
  (goals/assists) and development stay visually distinct within one player view.

### 4. Report - to player / family
- **Private, per-player.** Never the squad shown together and rankable - this single choice is what
  keeps it development, not evaluation.
- A report = strengths + 1-2 focus areas + a coach note, in growth language. Shareable to **that**
  player's family only.
- **Format = a per-player image card**, reusing the existing Canvas export + file-share plumbing
  (same tech as the game card / field export): the player's compass (now, or now-vs-earlier) +
  strengths + focus areas + coach note. On-device, shareable into any chat, nothing leaves unless
  sent. A coach-side in-app view too, but the shareable artifact is the image. (PDF/in-app-only
  rejected: parents won't have the app; PDF is heavy and un-mobile.)
- **Cadence = coach-triggered, with a gentle periodic nudge.** Generate/share whenever the coach
  wants; optionally *suggest* it at natural points (season/block end). Periodic, not every game - but
  not a forced schedule.
- **Player self-assessment - later phase.** Letting the player rate their own compass (the gap
  between player and coach view is a powerful conversation, and gives ownership) is a multiplier, not
  a foundation. It adds a second input source + player-facing UI + access/identity questions. Ship
  coach-side first; add once that is solid and used.

#### Editable report values at export (planned)

**The data should inform the report, not dictate it.** The logged history is an objective record, but
the coach's judgment *at the moment of writing the report* is a different and often better signal:

- the last logged assessment might be weeks old (sparse data - recency-weighting can't invent a fresh
  point, so the computed "now" is stale for *this* moment);
- the coach has off-app evidence (a training breakthrough, a conversation, video, another coach);
- a report is a **communication act** to a parent/player - it should be the coach's considered
  statement, not a mechanical average they don't fully stand behind.

So the report should be **editable at export, prefilled from history, then correctable.** That is the
right default.

**The one real decision - ephemeral vs saved:**

- *Ephemeral* (the edit affects only the image): history stays a clean objective record; the report is
  a curated artifact. Simple. **Risk:** the report and the in-app radar/trend now *disagree* - the
  parent sees "A strength" on the card while the app shows "Consistent." That divergence is quietly
  corrosive (which one is true?).
- *Save the override as a dated assessment*: the coach's considered judgment becomes a real data point
  - report and app stay consistent, and the outside knowledge lives somewhere honest instead of
  evaporating. The trend updates too.

**Recommendation: offer both at export** - "Use for this report only" vs "Also save as today's
assessment." Default = prefill from history, quick-adjust, then choose.

**Why this lives in the standalone-assessment backlog (item 7):** saving an override *is* a
standalone, dated assessment with no game attached - the same primitive the external-game case needs.
Build the one capability, serve both. And keep the **"considered" vs "per-game observed"** flag so a
report-time judgment call isn't silently absorbed into the trend as if it were a logged game
observation.

## Editable metrics vs comparability - resolved

Most of the comparability we'd "lose" was never the goal (cross-team comparison = the rejected
ranking behaviour). The comparability that matters is narrow and solvable:

- **Stable metric IDs.** A metric is `{id, label, description, category, scale, ...}`. Renaming a
  label keeps the same `id`, so history stays intact. Labels are cosmetic; IDs are the spine.
- **Versioned, dated metric sets.** Changing a set is deliberate: "from this date your compass uses
  these metrics; earlier games keep theirs." A warning, not a silent reset, so a coach evolves their
  metrics without destroying their own trend lines.
- **Fixed category anchor** (the four corners) on every metric, even custom ones, so optional
  corner-level roll-ups work without forcing label uniformity.
- **Cross-team comparison: out of scope, by design.** Stated as a feature, not a gap.

### The correctness rule when metrics/templates change

The whole thing stays correct under one invariant: **a metric id must mean the same thing forever.**
Storage is already id-keyed (`slider_values`), so the *mechanical* safety is in place - switching
templates never migrates or loses data, old games keep the ids they were rated with, renames are
free. What that can't protect is *semantic* stability. Three rules enforce it:

1. **Stable ids, cosmetic labels.** Renaming "Luovuus" -> "Creativity" keeps the id and the history.
   (Already true.)
2. **Redefine = new metric (the load-bearing rule).** A wording/clarity tweak keeps the id; changing
   *what a metric measures* must mint a **new id** (old one retired, fresh history starts). Never let
   a coach keep an id while changing its meaning - that is the single move that silently corrupts a
   trend and is invisible afterwards. In the editor: "edit label/description" is safe; "this now
   measures something else" creates a new metric.
3. **A set change is a dated event, not a silent swap.** Changing the metric set records a boundary
   ("from this date your compass uses these metrics; earlier games keep theirs"); past games keep
   their own ids, nothing is rewritten. The dated boundary is implicit in the data (a metric simply
   has no points before it was added) and made explicit only in the change-set UX. `effective_from`
   on each definition + the id-keyed storage is enough; no heavy version table needed.

**The report reflects the active set.** The development view / report scopes to the active template's
metric ids (shipped: `metricIds` passed into `calculatePlayerDevelopment` /
`getPlayerAssessmentTrends` from `PlayerStatsView`), so a metric the coach no longer assesses is not
drawn even if older games still hold its data - "what I see in the report" always equals "what I can
assess." History is preserved in storage; switching the template back resurfaces it.

**Honest limit:** you cannot trend a metric across the point where its meaning changed - same family
as the relative-scale drift noted under *Known tensions*. Mitigation is the same: make set changes
rare, deliberate, and dated, and trust within-season trends most.

## Data model shift

Today the 10 metrics are **hardcoded named columns** in Supabase + a fixed `sliders` object. Editable
metrics require a **flexible model**:

- `metric_definitions` (per team/coach, seeded from templates): `id, label, description, category,
  scale, age_bands, active, version, effective_from`.
- Assessment values stored **keyed by metric ID** (JSON map or a values table), not fixed columns.

This is the foundational change. It touches the assessment UI, storage, Excel export, types, and is
a production schema migration - a project, not an afternoon. Doing the **ID-keyed storage move now**
(while data is ~empty) is what makes every later step safe and cheap.

## Phasing

1. **PR 1 - DONE (#545, 2026-06-29)**: id-keyed `slider_values` JSONB storage, behaviour-preserving
   (legacy ids/scale kept). Expand step: dual-write columns, kept as a safety net. Prod migrated +
   27 rows backfilled.
2. **PR 2 - next**: metric content change to **set A** (`ball_control, passing, scanning,
   game_reading, decisions, courage, effort, enjoyment, teamwork, fair_play`). Config + i18n + Excel
   export refactor (loop over metrics) + drop the column dual-write + assessmentStats guards for
   metrics absent on older rows. Migration 034 rewrites existing `slider_values` per the rename map
   (technique->ball_control, awareness->game_reading, intensity->effort; drop duels/impact/creativity;
   passing/scanning/enjoyment empty until assessed). Staging-first, prod on explicit OK. (5-level word
   scale is PR 3, not bundled here.)
3. **PR 3**: 5-level developmental word scale (UI + validation + compass rendering).
4. **Then**: per-player development timeline + focus areas ("Development" section in the player view).
5. **Then**: editable metric definitions + templates (Light 6, Creative-attacking) + age bands, with
   stable-ID + dated-versioning safeguards.
6. **Later**: lighter capture (spotlight rotation, micro-observations); per-player report image card;
   live in-game capture; player self-assessment.
7. **Backlog - standalone / point-in-time assessments** (added 2026-06-30; generalised 2026-07-01,
   nice-to-have / niche): today an assessment is *game-locked* - you can only rate a player from
   inside a saved game. But a coach's judgment also lives in training, in plain observation, and in
   the moment a report is written. The primitive is a **dated, standalone assessment** that is not
   tied to a saved game. Two consumers ride on the one primitive:
   - **Report editing**: at export, prefill the report values from history, let the coach adjust
     them (they may have outside-app knowledge, or the history snapshot may be stale for *this*
     moment), then either "use for this report only" (ephemeral, nothing logged) or "save as today's
     assessment" (logs a standalone entry so the report and the in-app view stay consistent).
   - **External-game assessments**: a standalone assessment with an opponent/date attached (the
     `PlayerStatAdjustment` model), for the single-player-tracking case. ~2-3 PRs: assessment JSONB
     blob on `player_adjustments` (+ forward/reverse transforms + migration); capture UI in the
     existing external-game add/edit form (reuse `AssessmentLevelSelector`); merge into
     `calculatePlayerDevelopment` / trends / notes (radar, report card, dev view follow); "Assessed"
     badge on external rows.
   - **Caution - "considered" vs "observed"**: flag manual/standalone entries distinctly from
     per-game observed ones, so a judgment-call jump (or a one-off report tweak saved as today's
     value) isn't silently absorbed into the trend as if it were a logged game observation. No demand
     factor for non-game entries (default 1). Assessments become a two-source concept (saved games +
     standalone), so consumers must merge both - manageable as they funnel through those few
     functions.

> Note: items 1-6 are largely shipped (PRs #545-#561: storage, set A, word scale, style toggle,
> development view, radar, templates, in-game access, report card, polish). This phasing predates
> that work and is kept for context; item 7 is the open backlog entry.

## Relationship to the game card

The shareable **game card** (see `game-recap-generator-plan.md`) and this development assessment are
**different surfaces with different audiences**:

- **Game card (shareable / team chat)**: match facts only - score, scorers, assisters. NOT the whole
  squad's assessment compasses (that invites parents to compare kids - against the north star).
- **Development compass (private)**: a player's own compass and its growth over time, shareable only
  to that player's family.

A single player's own compass *may* be shared with that player's family; the squad grid may not.

## Known tensions & reliability (design notes)

The feature is now broad enough that its real tensions are visible. These are not bugs to fix one by
one; some are the deliberate *cost* of the against-self philosophy and are best handled by naming them
honestly rather than engineering them away. Captured 2026-06-30 from a design discussion.

### The word scale already solves the hardest problem

The 5-level word scale is **self-referential** - "A strength" means strong *for this player, at this
stage*, against the coach's own expectation, not an absolute 10. That one choice fixes the two things
that wreck numeric systems:

- **No ceiling.** "A strength" is reusable forever - a U9 and a U15 can both earn it because the bar
  in the coach's head rises with the player while the label does not cap. Numbers can't: 9/10 leaves
  nowhere to go, and you often realise too late you "should have started lower."
- **No external comparison, by design.** The comparison is the player vs *their own past* (radar
  now-vs-season-start, trend arrows), never "good compared to other kids." This is the
  development-not-evaluation north star, and why the system feels supportive rather than judgmental.

**The subtle cost of the same self-reference:** if the coach's internal bar drifts (expecting more as
the kid ages), a genuinely improving player can show *flat or falling* word-levels - he's better, but
the yardstick moved. Trends assume a stable scale, and a relative scale isn't perfectly stable over
long spans. Practical consequence: **trends/arrows are most trustworthy within a season** (the
yardstick barely moves in a few months) and softest across years; the **radar "now vs season start"
is the safest view** (short window, stable bar). The per-season filter exists partly for this.

### Metric definitions are a reliability requirement, not a nicety

A trend is only meaningful if "Consistent" means the same thing each time it's rated. Without a
definition anchoring each metric (and ideally each level), ratings suffer **rater drift** - the same
kid rated by the same coach six months apart isn't comparable, so the trend is partly noise. The
in-app one-line definitions (shipped #568) are the first stabiliser; the richer version - a
behavioural anchor *per level* (e.g. "A strength in scanning = checks shoulders before most
receptions") - is more content but is what truly stabilises ratings. Highest-leverage future content.

### Other real issues

- **Forced defaults pollute the data.** A new assessment starts every metric at the middle. Saving
  without touching one records a real "Developing" that was never observed - phantom data that
  flattens trends. Honest fix: "not observed" default (parked). Until then, untouched != neutral
  truth.
- **Small samples lie.** With 4-5 games the baseline (first 3) and "now" overlap, so the trend is
  barely signal; it firms up around 8-10 assessments. Arrows say "too early" under 4, but 4-7 is soft.
- **Recency can overreact.** "Current form" weights recent games, so one bad game can swing a metric;
  the 5-level coarseness dampens but doesn't remove this.
- **Per-game burden -> rushed data.** Rating 10-14 qualities every game tempts skipping or
  speed-rating (everyone a "3"). This is why lighter capture / spotlight rotation exists: assessing
  fewer players per game *well* beats all of them badly.
- **One subjective rater, no calibration.** The trend is the coach's evolving *perception*, not ground
  truth - fine for personal coaching, but don't oversell its precision (frame recommendations as a
  signpost, not a verdict). A player self-assessment would add a second lens.

### How to rank them

- **Quick, high-value:** in-app metric definitions (done #568); "not observed" default (data quality).
- **Inherent trade-offs to accept, not fix:** single-rater subjectivity, no external benchmark,
  relative-scale drift - these are the price of the against-self philosophy. The fix is naming them
  honestly, not engineering them away.

## Open questions (deferred)

- Scale: **5-level word scale locked** (Working on it / Emerging / Developing / Consistent / A
  strength); exact EN/FI wording still to finalise.
- Live in-game capture: how to make it one-tap and non-distracting (timer overlay? voice? player
  tap -> metric?). Design carefully before building; post-game first.
- Centre number: drop entirely, or replace with "focus next" highlights?
- Final wording of the other templates (TOVO-spine, Creative-attacking) - default 10 is locked.
- Library: how big is too big? Where's the line between a helpful catalog and choice overload?
  (Mitigated by leading with templates, not the raw library.)
- Spotlight rotation vs full-squad: default behaviour and reminders.
