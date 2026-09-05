# Kirjuri - dictation capture + BYOK post-match AI

One pipeline, two halves: **capture facts during the game** (voice notes, hands-free),
**synthesize after it** (AI drafts, coach approves). Replaces rating-based assessment with
evidence: the app collects observations, judgment is generated on demand and always
coach-approved.

Supersedes the voice/AI section of `docs/04-features/future-vision.md` (server-side keys
via Edge Functions, Azure, PRO tier) and absorbs the roadmap's "Moment Capture" and
"Hands-free quick capture" ideas.

## Principles (do not re-litigate)

- **Capture now, understand later.** In-game there is exactly one interaction: press,
  speak, done. All intelligence (transcription, name matching, tagging) happens
  post-game in an inbox. The phone is a dictaphone during play, never a UI.
- **Assessment is output, not input.** No sliders, no scales. AI summaries are generated
  from accumulated facts, revisable, and evidence-linked. (The assessment plan's point
  that coach judgment at writing time is a strong signal still holds - the spoken
  post-match debrief is exactly that signal, captured cheaply.)
- **Coach approves everything.** Nothing AI-generated is saved without explicit accept.
  Every note carries `source: 'dictation' | 'ai' | 'manual'`.
- **MatchOps is never in the audio or AI data path.** Audio stays on the device. All
  transcription and synthesis go from the device straight to a provider the user
  connected with their own key (BYOK). MatchOps runs no AI infra and never receives
  recordings or transcripts; it stores only the text notes the coach accepts - the same
  data category as today's player notes and match reports.
- **No always-on listening.** Push-to-talk only. Short deliberate clips of the coach's
  own voice.
- **Safe by default for a user who configures nothing.** Audio deleted on accept and
  after 30 days regardless; names tokenized before synthesis; the AI feature is off
  until the user passes the consent gate.

## Why BYOK and not Google Web Speech or on-device (decided 2026-09-04)

- On-device is not available: Chrome's on-device Web Speech has no Finnish and is
  desktop-only; browser Whisper models small enough for a phone are unusable for
  Finnish (large-class models needed for ~10-15% WER cannot run in a phone browser).
  The engine interface still probes `SpeechRecognition.available({langs:['fi-FI'],
  processLocally:true})` so on-device becomes the default automatically if Chrome ever
  ships it.
- Google Web Speech (cloud) is free and keyless but audio goes to Google under Chrome's
  consumer terms - nobody holds a contract for children's voice data. Rejected.
- BYOK: the user's own provider account under API terms (OpenAI: not used for training,
  30-day abuse-monitoring retention, US processing by default). Widely used pattern
  (OpenAI-sanctioned; Warp, Home Assistant voice/STT, developer tools); the closest
  competitor (Coachlog) takes audio into its own cloud, i.e. asks more trust than we do.
  The Snap "My AI" case shows regulators check for a risk assessment, not for the
  pattern itself - so this plan carries one (below).

## Codebase facts that shape the design (audited 2026-09-04)

- `gameEvents` is a synced table in the cloud (`game_events`, CHECK-constrained type
  list), embedded in the game locally. Adding an event type touches the TS union
  (`types/game.ts`), the zod enum (`appStateSchema.ts`), `VALID_GAME_EVENT_TYPES` +
  both transforms (`SupabaseDataStore.ts`), `types/supabase.ts`, and a migration.
  Missing a JS gate silently drops the event on cloud save; missing zod throws on backup
  restore. A new synced ENTITY instead costs ~15 files (three `never`-guarded switches,
  sync priority, both migration services, backup) plus table + RLS + clear_all_user_data.
- `GameEvent` has `entityId` (generic player reference, already roster-remapped on
  import) - no `playerId`, no `period`, no text.
- `GoalLogModal` and `GameSettingsModal` render ALL events unfiltered ("Unknown Event"
  for unknown types); `GoalEventList` is goal-shaped by construction.
- `next.config.ts` ships `Permissions-Policy: microphone=()` (mic disabled app-wide),
  no `media-src` (blob playback blocked), and `connect-src` without any AI provider.
- Wake lock exists but tracks `isTimerRunning` only - released at pause, half-time and
  full time. `useWakeLock` is instantiated inside `useGameTimer`; a second instance
  would fight it.
- Storage is string-only KV; all games share one 10 MB key. No Blob precedent - the
  separate-DB pattern is `backupSnapshots.ts`. Full backup is an explicit allowlist, so
  new localStorage keys and new DBs are excluded by default.
- `AppSettings` syncs to cloud and is in every backup - never a home for a secret.
  Device-local precedent: `matchops_*` localStorage keys with the eslint-disable comment
  (`timerAnchor.ts`, `GuidedTourProvider.tsx`, `setupWizardActive.ts`).
- Sentry: fetch breadcrumbs carry no headers, but `logger.error(msg, err, extra)` ships
  `extra` verbatim; `scrubUrl` does not cover `api_key`/`sk-` patterns.
- Match report = `gameNotes`, plain text, max 2000 chars; "Use template" appends a
  7-section scaffold (Overview / How the game unfolded / What went well / What we're
  working on / Team spirit and effort / Highlights / Next step), duplicated in
  `GameNotesEditor.tsx` and `GameSettingsModal.tsx`. No structured section model.
- Nicknames: max 20 chars, auto-derived only for multi-word names; no fuzzy matching
  exists anywhere (`normalizeNameForCompare` only).
- No runtime permission prompt exists yet (mic will be the first). No Media Session,
  no global key handling, no touch shield. `useAppResume` force-reloads after >5 min in
  background unless the match timer is running.
- A versioned re-acceptance pattern already exists (`ReConsentModal` for terms/privacy)
  and is the template for the AI consent gate.

## Data model decisions

- **Notes are `gameEvents` of `type: 'note'`** - not a new entity. Fields: `entityId`
  (subject player, optional; game note when absent), `time` (clock seconds), new
  `period`, new `text`, new `source`. Migration `041_game_event_notes.sql`: relax the
  CHECK, add `note_text`, `period`, `source` (nullable, additive; the
  `save_game_with_relations` RPC uses `jsonb_populate_recordset`, so no RPC change).
  Notes ride the game's existing sync, export, backup and import remap. They enter undo
  history like goals (acceptable). Goal-log lists get a `type !== 'note'` filter.
- **Player profile timeline** = note events across games where `entityId === playerId`,
  shown in `PlayerStatsView` independently of assessments.
- **Game timeline** = a notes card beside `GoalEventList` in the stats modal's right
  column.
- **Audio clips**: dedicated IndexedDB DB `matchops_audio_{userId}` storing real Blobs
  keyed by note id. Quota check before write, delete on accept (configurable), hard
  delete of anything older than 30 days. Never in `savedSoccerGames`, never base64 in a
  game, never synced.
- **API key**: `matchops_ai_key` in its own localStorage module (device-local precedent).
  Excluded from backup/sync by construction; regression test asserts it never appears in
  `generateFullBackupJson`. Sentry `beforeSend`/`beforeBreadcrumb` scrub `sk-` patterns
  and provider hosts; the key module never passes its value to `logger.*`.
- **Transcription engine interface**: `transcribe(clip, { language, vocabulary })` with
  engines `byok-openai` (v1) and `on-device` (probed, used automatically when available).
  No Google cloud engine.
- **AI-generated per-player notes** save as note events with `source: 'ai'` on that
  game, referencing the packet hash so a re-run excludes already-applied proposals.
- **Season summary output** (phase 5) is displayed/copied; persistent storage is a
  phase-5 decision (Player.notes is 1000 chars - too small).

## Consent gate (before the AI feature can be enabled at all)

A full-screen, versioned acknowledgement (reuse the `ReConsentModal` pattern; bump the
version whenever the text changes and re-gate). The key field is disabled until every
box is ticked. Plain language, EN + FI:

**What happens with your data**
- Recordings stay on this phone. MatchOps never receives your recordings, transcripts,
  or AI results.
- When you press Transcribe or Draft, the recording/notes are sent from this phone to
  the AI provider YOU connected, under YOUR account and YOUR key. The provider may keep
  the data for a limited time under its own terms (for example OpenAI: not used for
  training, abuse-monitoring logs up to 30 days, processed in the US). Read your
  provider's terms - MatchOps is not a party to them.
- Costs are billed to your provider account. Create a dedicated key with a monthly
  spend cap.
- Player names are replaced with codes before any drafting request (you can turn this
  off). Transcription necessarily contains what you said.
- You can disconnect the provider and delete all recordings at any time from Settings.

**Dictation rules (shown at the gate and always one tap away in the inbox)**
- Talk about football actions, not people's lives.
- Use first names or nicknames, never full names.
- Never dictate health, injuries, family matters, or anything about parents, referees
  or opponents by name.
- Keep clips short; delete anything you would not want a parent to read.
- You are responsible for what you dictate and for informing families where your
  situation requires it - the app ships a ready-made parent-information text.

**Acknowledgement boxes**
1. I understand recordings and notes go to my own AI provider, under my account, and
   MatchOps never receives them.
2. I have read my provider's data terms and accept that they may retain data for a
   limited time.
3. I will follow the dictation rules and not dictate health or other sensitive data.

## Risk assessment (DPIA-lite, kept current with the feature)

- **Data**: coach's voice clips (may name minors by first name), text notes about
  minors' football performance, coach-written match reports. No special-category data by
  design (rules + hint); if dictated anyway, it is the user's content, deletable.
- **Roles**: the user is the controller of their notes (as today for player notes).
  MatchOps processes accepted text notes for sync/backup (existing footprint, no change).
  The AI provider processes clips/notes under the user's own account; MatchOps is not a
  party to that processing.
- **Risks and mitigations**: audio leaving device unintentionally -> impossible without
  key + gate + explicit action; over-retention -> delete on accept, 30-day hard cap,
  transcripts only; excessive identification -> nickname guidance + tokenized names
  for drafting; sensitive content -> rules + acknowledgement; key theft -> device-local,
  masked, spend cap advice, Sentry scrub, backup-exclusion test; unclear disclosure ->
  versioned gate, privacy policy + terms sections, in-app rules; user cannot exercise
  rights -> disconnect + delete all recordings + delete notes; children's rights -> notes
  are coach observations the child/guardian can request via the coach (as today).
- **Residual risk**: provider-side retention under provider terms; user disregarding the
  rules. Accepted; both are disclosed and under the user's control.
- **Precedent**: BYOK is an established pattern; the closest competitor stores audio in
  its own cloud; the one relevant enforcement case (Snap My AI) required a risk
  assessment, not a ban. Recommended before phase 3 ships: a one-hour review of this
  section with a Finnish data-protection lawyer or a written question to the
  Tietosuojavaltuutettu.

## Data honesty rules (sparse data must not become signal)

Coaches will note some players and not others, fill positions sometimes, and
almost never touch the demand slider. Absence is not evidence and a default is
not a measurement:

- **Only deliberately entered values reach the AI.** A field that cannot be
  told apart from its default is omitted, not sent as the default (demand level
  only when the coach changed it; positions only for players who have them;
  minutes only where the planner recorded them). The packet carries a
  `coverage` block: notes per player, games with positions, games with minutes.
- **The AI states what it does not know and may not fill gaps.** Every returned
  claim carries `evidence` (note/event ids). A player with no observations in
  the packet gets no note suggestion and no summary - none, not a bland one.
  Report sections without material come back empty. Malformed or
  evidence-less items are dropped before review.
- **The UI shows coverage, never a smooth surface.** Denominators everywhere:
  "3 observations over 8 games", "positions recorded in 2/8 games", "no notes
  this season". No averages over sparse fields (no mean demand, no
  minutes-fairness percentages below a coverage threshold).
- **Trust tiers: plan is not record.** Every packet field is labelled for the
  AI as recorded (as it happened: score, goals/assists, cards, penalties, note
  clock stamps), attested (coach entered afterwards: positions played, note
  text, debrief - "the coach noted", never "it happened"), or planned (intent
  before kick-off: planner minutes, starting formation, sub schedule - context
  only, never a claim about a player). Per-player minutes stay out of summaries
  until the actual-playing-time record (roadmap P4) exists; planner minutes
  are never used for fairness statements.
- **The equalizer is the coach; the app nudges the coach.** A coverage view
  ("notes on 6 of 14 players this month - nothing on Aino, Veeti, Leo") on the
  team page and in the post-game wrap-up turns gaps into next game's watching
  plan. Ratings forced a number for every player every game; notes exist only
  where the coach looked, and coverage shows where they did not.

## Future-proofing decisions (decided 2026-09-05, land in PR 8)

- **`tag` on note events** (additive column): `debrief`, `halftime`, or an
  AI-assigned category (technique / attitude / game-sense) added later from the
  text. The spoken debrief is saved as a tagged game note, not just consumed.
- **AI provenance**: AI-accepted notes and report drafts record which model and
  which packet hash produced them (`aiMeta`), so later, better models can be
  told apart from today's.
- **Season summaries** get their own small per-player, per-season record;
  decided before PR 11, never squeezed into the 1000-char player notes field.
- Audio is deliberately never kept: text is the durable asset; no future
  re-transcription or voice-tone features. Privacy over optionality.

## Data rules

**Voice clips and notes**
- Every clip is stamped with clock + period at press time.
  Example: `{ type: 'note', time: 1834, period: 2, entityId: 'p-emma', text: "hieno
  syöttö paineen alla", source: 'dictation' }`.
- Raw audio is device-local only, deleted when its note is accepted (configurable) and
  hard-deleted after 30 days. Audio never syncs; accepted note text syncs with the game.
- No live transcription. Clips are transcribed post-game in the inbox through the
  connected provider (batch, one tap, shows the estimated cost), with the game roster's
  nicknames passed as vocabulary hints. Without a connected provider the inbox offers
  replay + typing.

**Name matching (Finnish inflection is real: "Emman syöttö")**
- Match transcript tokens against the game roster first, then the master roster, using
  nickname or first word of name (`gameRecap.ts` convention), by normalized stem prefix
  + small edit distance. Show the guess as a chip; coach confirms with one tap.
- Pseudonymization replaces all matched tokens (inflected forms included) with `P<n>`
  keyed by `entityId` before any drafting request. Residual leakage of unmatched spoken
  names is possible and is disclosed.

**API key**
- Device-local only. Never synced, never in backups/exports, never logged, never sent to
  Sentry. Masked input, test button, delete button, "delete all recordings" button.

**AI transfer**
- Only after the consent gate, only on an explicit coach action, only to the coach's
  chosen provider with the coach's key. Pseudonymized by default for drafting.

**AI output**
- Responses must match a versioned JSON schema (`aiSchema v1`, provider structured
  output), validated locally; malformed responses are rejected whole. Review screen
  shows each proposed item with accept / edit / reject; only accepted items are saved.
- Match report drafts are plain text under the 7 localized template headings;
  `gameNotes` limit rises from 2000 to 4000 chars in the same PR (validation only, the
  column is `text`).

## Status

- 2026-09-05: **Phase 0 and Phase 1 merged into `feat/kirjuri-ai`** (PR 0 #744, PR 1
  #745, PR 2 #746, PR 3 #748, PR 4 #749, PR 5 #750). Testable end to end on the branch
  preview with the coach's own OpenAI key. Migration 041 is on staging only.
  Next: owner device test round, then the Phase 2 Media Session spike.
- 2026-09-05 later: PR 6 #751 (hardening), **Phase 1b PR 7a #752** (editors out of Ottelun
  tiedot) and **PR 7b-1 #753** (Viimeistele ottelu spine on the current-game tab) merged.
  Finding while scoping 7b-2: the aggregate split already exists - the match-level host
  renders the stats modal `currentGameOnly` and the Team stats menu opens the club-level
  aggregate view - so 7b-2 is labels, guide copy and review follow-ups (boolean accept
  contract, explicit goal-log open, audio-DB existence guard, dead `applyFormation`
  handler, coverage gaps). Unused locale keys are NOT pruned: several are addressed
  dynamically (template keys), so a static "unused" list is unsafe.
- 7b-2 #754 and 7c: 'Peli ohi' now offers one CTA, Viimeistele ottelu, which closes the
  overlay and opens the spine (assessments are step 5 there); the assess-players button
  stays only as a fallback for hosts that do not wire the hand-off. The Home completeness
  dot already existed (saved-games list: green = record complete, amber = Kaipaa
  viimeistelyä) - no new work. Phase 1b is complete; next is the Phase 2 spike.
- 2026-09-05 evening: #756 (7d) merged - the GitHub review job ran on #751-#755 after the
  limit reset and approved all five; 7d folded in the items the local reviews missed
  (live gameType for the positions editor, a test fixture that aliased two setters).
  Phase 3 started: PR 8a merged/open as the pure GamePacket builder. #756's own review
  job hit the limit again - that PR has CI but no independent review yet.
- Correction from PR 5: Web Speech (also Chrome's on-device mode) only transcribes live
  mic input, never a stored clip - the "on-device probe" cannot apply to post-game
  clips. An on-device engine over clips needs a WASM model; the slot stays open.

## Phases and PR plan

Integration branch: **`feat/kirjuri-ai`** (off master). Every step is a sub-branch PR'd
into it (CI + review loop, merge on Approve). PR to master ONLY when the whole feature is
complete and owner-tested. Each PR that adds a surface adds its `InstructionsModal`
bullet (its test asserts the section set).

**Phase 0 - Platform unblock**
- PR 0: `next.config.ts`: `microphone=(self)`, `media-src 'self' blob:`; rewrite the
  CSP rationale comment. Wake lock: hold while `gameStatus` is inProgress/periodEnd or a
  recording session is active (lift `useWakeLock` so the timer and the recorder share
  one instance). Sentry scrub rules for `sk-` and provider hosts.

**Phase 1 - Capture + transcription core** (no Bluetooth, no drafting)
- PR 1: note event type end to end: TS union, zod, `VALID_GAME_EVENT_TYPES`, both
  transforms, `types/supabase.ts`, migration 041, goal-log filters, tests including a
  cloud round-trip and a backup-restore parse.
- PR 2: recording controller hook at orchestration level (reads `elapsedRef`, period,
  status; suppresses `useAppResume` reload while a session is active); press-hold mic
  button in the timer overlay's goal-button row; MediaRecorder clip into the audio DB;
  first-run permission UX incl. denied/blocked states; "note captured" undo toast;
  30-day audio rotation.
- PR 3: dictation inbox row on the wrap-up card (count from `gameCompleteness`):
  replay, typed text, fuzzy player chip, accept/edit/reject; accepted notes get
  `source: 'dictation'`; notes card in the stats modal; player profile notes list.
- PR 4: consent gate (versioned) + AI settings card in Settings > General: provider
  (OpenAI first, field designed for more), key handling per the data rules, test call,
  disconnect + delete-all-recordings; `connect-src` gains the provider host; privacy
  policy + terms sections; parent-information text; Play Data Safety re-checked.
- PR 5: transcription engine interface + `byok-openai` engine (multipart upload,
  `language: fi`, roster vocabulary prompt) + on-device probe; inbox "Transcribe N
  clips" batch with cost estimate; dictation rules reachable from the inbox.

**Phase 1b - Viimeistele ottelu restructure (decided 2026-09-05, before Phase 2/3)**
The match surfaces grew by accretion: goals editable in three places, the report in
two, setup and post-game record mixed in Ottelun tiedot, "Ottelun raportti" opening a
stats modal. Kirjuri's Phase 3 lands exactly in these surfaces, so they are fixed
first. One intent per surface, organised by WHEN:
- *Ottelun asetukset* (before): team/opponent, roster, personnel, competition, date/
  time/place, periods, demand, flags. Loses event log, report, positions, formation,
  OT/PK, fair play.
- *Ottelu käynnissä* (during, TimerOverlay): clock, subs, goals, dictation, OT/PK.
  Loses the assessments button; "Peli ohi" offers one CTA: Viimeistele ottelu.
- *Viimeistele ottelu* (after; today's current-game stats tab, rebuilt): an ordered
  checklist spine with each editor inline - 1 Maalit (single event log, with add),
  2 Äänimuistiinpanot -> Muistiinpanot, 3 Toteutuneet pelipaikat, 4 Otteluraportti
  (one editor; Phase 3's draft lands here), 5 Pelaaja-arviot (if enabled), 6 Jaa
  ottelukooste. Read-only header: score + player stats.
- *Joukkueen tilastot* (across matches): the aggregate tabs, filters, position
  balance, Excel - removed from the match-level modal.
- Vocabulary fixed once: Otteluraportti (the text), Muistiinpanot (timestamped
  notes), Maalit, Pelaaja-arviot, Viimeistele ottelu / Valmis / Kaipaa viimeistelyä
  (one completeness vocabulary incl. a dot on Home cards). "Ottelu", never "Peli".
- PR 7a: move the three post-game editors out of Ottelun asetukset, delete duplicate
  editors and the second Pohja button. PR 7b: rebuild the current-game tab as the
  spine, split aggregates to the club view, menu + label renames, guide/first-visit
  text updates. PR 7c: completeness dot on Home + the Peli ohi hand-off.

**Phase 2 - Hands-free**
- SPIKE HARNESS BUILT (PR 20, `/kirjuri-spike`): a throwaway diagnostic route, no
  navigation to it and `robots: noindex` - the only way in is typing the address.
  **DELETE IT BEFORE THE MASTER MERGE** (checklist item below). It answers the two
  questions that cannot be answered from a desk:
  1. Does an earbud button reach the page? Holds a looping WAV built in the browser
     (silent, with a barely-audible tone as the fallback, because some systems ignore a
     silent player and never grant a media session), registers EVERY MediaSession action
     including `hangup` / `togglemicrophone`, AND listens for media KEY events, since some
     devices deliver keys rather than session actions. Every arrival is timestamped.
     Why this matters for the owner's two pairs: a single-button media bud normally sends
     play/pause over AVRCP, which can surface as a session action; a headset built for
     calls (Jabra Evolve 2) tends to send CALL CONTROL over the hands-free profile, which
     may never surface as a media action at all. The log tells them apart.
  2. Does the mic survive a pocketed phone? Opens the stream, holds the screen wake lock
     like the app does, and logs one line a second with the input level, track readyState,
     mute flag, page visibility and AudioContext state - readable after the phone comes
     back out of the pocket. Plus `enumerateDevices`, because media buds and call headsets
     appear differently there, which is the likeliest reason one pair works and another
     does not.
  Original spike question (kept for the record): silent-track Media Session in the TWA -
  do earbud play/pause taps reach the page, and does the mic stream survive a pocketed
  screen-on phone?
- **DESIGN DECISION from the owner's point that "users might have a variety of bud styles
  too" (2026-09-05).** The spike answers whether hands-free works on HIS two pairs. It
  cannot answer it for the next coach, and we will never enumerate the market: media buds,
  call headsets, single-button, multi-button, phone-brand buds with their own gesture
  layer. So Phase 2 must NOT be "hands-free works" - it must be:
  1. The on-screen press-hold stays the guaranteed path, always. Hands-free is an
     enhancement on top, never a replacement.
  2. Ship a SELF-TEST the coach runs with their own buds, in settings, before they ever
     rely on it in a match. It reports plainly: "your earbuds reach the app - hands-free
     will work" or "your earbuds do not reach the app - use the button on screen". A coach
     who believes hands-free works and discovers otherwise mid-match has been failed by us,
     not by their hardware.
  3. That self-test is the button half of this spike harness, trimmed. So the harness is
     only half throwaway: the media-session detection graduates into the feature, and the
     mic-in-pocket logging is what gets deleted.
  This also means a NEGATIVE spike result does not kill Phase 2 for everyone - it tells us
  how loudly the self-test has to speak.
- **HOW TO RUN THE SPIKE (owner: "I cannot see logs in installed app").** Two problems,
  both handled:
  1. No console in an installed app, so the harness prints its log ON SCREEN and now has
     a Copy button (clipboard, then the share sheet, then a text file as the last resort).
     The exported log carries the user agent and whether the page was running standalone
     or in a browser tab, because that changes what the result means.
  2. **The Play Store app CANNOT run branch code.** The installed TWA loads PRODUCTION and
     has no address bar, so `/kirjuri-spike` on a Vercel preview is unreachable from it.
     The closest available proxy: open the preview in Chrome, "Add to home screen", and
     run the spike from that icon - a standalone window on the preview origin, no address
     bar. The page detects this and says which mode it is in, because a browser tab is
     more permissive than an installed app and a pass in a tab can still fail in the TWA.
     A true TWA answer only arrives when this reaches production; if the standalone result
     is positive we accept that residual risk, and the per-coach self-test above is what
     catches it in the field anyway.
- PR 21 (owner: "I recorded the match report and chose the first option to keep omanani.
  nothing happened and there was no text in otteluraportti field"). The note WAS saved
  correctly and was sitting under Muistiinpanot. The bug was the design: the PRIMARY button
  of a panel that lives in the Otteluraportti step did not touch the report at all, and the
  only feedback was a missable toast. A coach who records "the match report" and taps the
  first button expects report text - that expectation was right and the layout was wrong.
  Fixed: "Put this in the match report" is now the primary action; "Keep as a note for the
  AI draft instead" is secondary; and saving a note shows a persistent line saying it is
  NOT report text, that it is under Notes further up the page, and offering a button that
  scrolls there. The notes step's `id` had to come back for that - it was deleted in 7d as
  dead, which it was until this needed it.
- PR 22 (owner tested a real draft and sent screenshots). FIVE fixes, all from what the
  drafts actually said:
  1. **The review list showed codes.** Refs were resolved when a draft was APPLIED but not
     in the review list, so the screen where the coach DECIDES read "tekijana P5 ja
     syottajana P3" while the saved report had names.
  2. **"maali merkittiin 0. minuutilla".** A goal logged at clock zero has no time on it -
     the coach never started the timer - and `minute: 0` stated that as a fact. `toMinute`
     returns undefined below a minute, the field is omitted, and the prompt says a missing
     minute means the clock was not running: write without a time, never guess one.
  3. **"maalivahdin torjuntoja kirjattiin tarkeiksi".** The model narrated the BOOKKEEPING
     instead of the football, probably encouraged by trust-tier wording about what the app
     captured versus what the coach entered. New prompt block: never write about the record
     itself; kirjattiin / merkittiin / tallennettiin / havainnoitiin banned by name.
  4. **"Keijo:lle", "Esko:n".** Finnish inflects a CODE with a colon; a name takes the
     ending directly. The resolver swallows the colon: "P2:lle" -> "Keijolle".
  5. **The lone "Nykyinen" tab.** At match level the aggregate tabs are hidden, leaving a
     single full-width tab that looked like a button and did nothing. The tab bar now
     renders only when there is more than one tab.
- PR 24: **full-branch review findings.** Half this branch merged with no independent
  review while the GitHub job was rate-limited (12 PRs with no written review at all, 6
  with only a local one), so a whole-branch review was run once the limits reset. It found
  ten things; these are the real ones, all fixed here:
  1. **DATA LOSS.** The notes-sync effect reset `editGameNotes` whenever `gameNotes`
     changed. The spoken report and the AI draft both change `gameNotes` from INSIDE the
     same step, under an open editor - so inserting discarded whatever the coach had typed
     and not saved. The effect now skips while editing, and inserting appends to what is
     ON SCREEN rather than to the last saved value.
  2. **The report was always drafted in Finnish.** `language` was never passed to
     `buildGamePacket`, which defaults to 'fi', and that is what the prompt tells the model
     to write in. An English coach paid for a Finnish report. Same for TRANSCRIPTION, which
     hardcoded `language: 'fi'` in both the inbox and the spoken panel.
  3. **A cancelled draft clobbered the next one.** `finally` cleared `abortRef` and
     `drafting` unconditionally, so request #1 finishing wiped request #2's controller and
     the UI - leaving the coach unable to cancel a request they were paying for. Both
     panels now only clear what they own, like `transcribeAll` already did.
  4. **`tag` and `aiMeta` were stripped on import.** Zod strips unknown keys and the parsed
     object is what gets saved, so a backup round-trip lost every debrief tag and all AI
     provenance. Schema updated; `handleUpdateGameEvent`'s whitelist too.
  5. **`toMinute` threw away real times.** My own earlier fix dropped everything under 60s,
     so a genuine 0:45 goal became "no time on it". Now only exactly zero is treated as
     "the clock never ran", and the prompt teaches minute 0 as the opening minute.
  6. **The name matcher attributed ordinary words to players.** `playerNameMatch` had the
     unbounded stem I had already fixed in the packet's matcher, so "leopardin"
     pre-selected the player Leo as a note's subject.
  7. **A billed transcription went uncounted** when the coach closed the screen between the
     provider answering and the abort check.
  8. **The model picker showed the default** until the list loaded, claiming a model the
     coach was not using.
  LESSON: the local gate only ever sees the working copy. It cannot catch a file that was
  never staged, and it cannot see across PRs. Both need a review that reads the branch.
- PR 23 (owner: "avaa asetukset Button does nothing"). App settings renders at the SAME
  z-layer as the stats modal (`z-[60]` both), so opening it from inside that modal put it
  underneath - the state changed, nothing appeared to happen. Every other hand-off out of
  this modal already left it first (`wrapUpToGameSettings`, `wrapUpToAssessments`,
  `wrapUpToGoalLog`); the settings one did not, because it reused the control bar's plain
  `openSettingsModal`, which is correct THERE because nothing is on top of it.
  `wrapUpToAppSettings` now closes the stats modal first, and the stats modal is wired to
  it. This also fixes the older season-filter settings link, which had the same bug.
  RULE: a hand-off out of a modal must leave the modal. Same-layer modals do not stack.
- PR 6: Media Session action handlers toggling the recording controller; earcon
  confirmations into the bud.
- PR 7: Bluetooth mic input selection (enumerateDevices) + match-mode touch shield.

**Phase 3 - Post-match drafting**
- PR 8a (done): `src/utils/gamePacket.ts` - pure builder, schema v1. Trust tiers are
  STRUCTURAL (`recorded` / `attested` / `planned` top-level sections plus a `trust`
  explanation for the model), `coverage` carries denominators, and pseudonymization
  redacts names inside note text AND the coach's own report via `redactPlayerNames`
  (nickname + every name part, across the WHOLE roster because coaches name
  unselected players too; Finnish declension + kk/pp/tt gradation; ambiguous
  words become `P?` rather than a guess). Redaction runs BEFORE the request, so
  nobody reviews its mistakes - hence every rule is length-bounded and tested
  against ordinary Finnish words. Assessment VALUES
  are deliberately excluded - only coverage counts; revisit in PR 9 if the draft needs
  them. `gamePacketFingerprint` gives PR 9's `aiMeta` something to record.
  Note `tag` shipped here: type + migration 042 (APPLIED TO STAGING ONLY) + both
  Supabase transform directions; nothing writes a tag yet.
- PR 8b (done): `src/utils/aiDrafting.ts` - chat completion on the coach's key,
  structured outputs (strict json_schema), `max_completion_tokens` 2000, 60 s timeout,
  caller AbortSignal honoured. Refusals BEFORE spending: no key = no request, and a
  packet over 60k chars is refused rather than billed. `validateDraft` drops any
  player note whose ref was not in the packet (an invented "P9" must never be mapped
  onto a real child), keeps only the seven known sections, de-duplicates them, restores
  template order and clamps lengths. A provider refusal and a cut-off answer are
  distinct failures. Returns model + packet fingerprint + token usage for `aiMeta` and
  the "used this season" counter. MODEL ID `gpt-5-mini` needs owner confirmation
  against the provider's current list before release.
- PR 9a (done): the apply-on-approve half, still no UI. `src/utils/reportSections.ts`
  makes the seven headings ONE source of truth - the blank template button and an AI
  draft now compose from the same keys (`gameStatsModal.reportSections.*`), and the old
  `reportTemplate` blob is gone. `src/utils/applyReportDraft.ts` turns ticked items into
  the new report text plus note events; it writes nothing itself, so the existing
  autosave and validation stay the only route to storage. THE RULE: the coach's own
  report is never destroyed - `append` keeps it byte for byte, `replace` is explicit AND
  hands the old text back for undo, and an approved note whose ref has no player is
  dropped (reported in `droppedRefs`) rather than guessed onto someone. Provenance
  shipped: `AiMeta {model, packet}` on note events and on the report, migration 043
  (APPLIED TO STAGING ONLY) plus both transform directions. `gameNotes` cap 2000 -> 4000.
- PR 9b (done): `ReportDraftPanel` in the spine's Otteluraportti step. Cost shown
  BEFORE the request next to one Draft button; every section and player note has its
  own checkbox, all ticked to start; append is the default and never touches the
  coach's text, replace warns first and offers Undo after; truncation, unmatched
  notes and the model's own caveat all appear BEFORE Apply, not after; discard clears
  without storing. Provenance persists: `gameNotesAiMeta` on the session reducer (new
  `APPLY_REPORT_DRAFT` action; a hand edit via `SET_GAME_NOTES` clears it) and in both
  save paths. `handleApplyReportDraft` refuses the scratch game and an over-cap
  report, returning false so the panel keeps the draft on screen.
- PR 9c (done): `src/utils/aiUsage.ts` - a device-local counter on the AI settings card.
  DEVIATION FROM THE PROMISE, deliberately: it counts "since <date>", not "this season".
  A device-local counter cannot know which season it belongs to, and a wrong season label
  is worse than an honest date; the coach can reset it. Every figure is labelled an
  ESTIMATE with the line "your provider's bill is the real number", because list prices
  change and audio billing rounds in ways we do not model. Drafting records the response's
  REAL token usage; transcription records a per-clip duration estimate at the moment the
  provider was called (billed whether or not words came back). Same storage discipline as
  the key: one localStorage key, never synced, never exported.
  Also here: the review list shows player NAMES instead of packet codes (the mapping never
  left the device, so resolving it for display costs nothing).
- PR 12 (billing audit, after the owner asked "are you sure no billing surprises"):
  the audit found only three provider endpoints ever called (the key test hits
  `/v1/models?limit=1`, which is free), no retries anywhere, nothing on mount, input
  bounded by `MAX_PACKET_CHARS` and output by `MAX_COMPLETION_TOKENS` - worst case ~$0.012
  a draft, $0.003 a 60 s clip. It also found TWO REAL GAPS, both fixed here:
  1. **A failed draft can still be billed.** A model that thinks itself out of budget
     returns HTTP 200 having spent input + reasoning tokens. `DraftingError` now carries
     `billedUsd` and the panel records it, so the counter stops under-reporting. (An
     earlier statement to the owner that a failed draft "costs nothing" was wrong: true
     for a 400, false for this case.)
  2. **The spoken report transcribed on stop with no price shown**, while the inbox
     shows a cost and waits for a tap. The panel now states the per-minute price and
     that writing out starts when recording stops, before the coach records.
- PR 13 (owner found it while testing: "if I have transcribed the clips and then record
  new ones, I cannot transcribe the new ones"). TWO bugs, both real:
  1. **The inbox listed clips once, on mount, and never again.** A clip recorded without
     leaving the screen was invisible, so it could not be transcribed. That is a normal
     path now, because the spoken-report panel sits on the same page. The inbox re-reads
     its list whenever the recorder reports a new clip (`latestClipId`).
  2. **Transcripts lived in component state, so closing the screen binned words the coach
     had PAID for** - reopening meant paying again. The transcript now lives on the clip
     record (`AudioClipMeta.transcript`, written by `setClipTranscript`) and seeds the
     drafts on open; only clips with no words are offered for transcription.
  Found while fixing: the transcript write could abort the whole paid batch if it threw
  (an undefined mock proved it). It is now wrapped so it cannot - every remaining clip in
  that loop is money the coach already decided to spend.
- PR 14 (owner: "recording otteluraportti succeeded but was never transcribed or shown
  anywhere. also I could not find the ai button any more"). ONE root cause, TWO fixes.
  Root cause: no provider connected on that origin - a per-deploy Vercel preview URL is a
  different browser origin, so the device-local key is absent there. Both panels then
  degrade, but one did it silently:
  1. `SpokenReportPanel` had `if (!engine) return;` - a coach who just spoke for a minute
     was told NOTHING. It now says the recording is saved and waiting under Voice notes on
     the same page, on both the no-engine and the transcription-failed paths.
  2. The draft card correctly hides its button with no key, but only named the problem.
     It now offers "Open settings" (`onOpenSettings`, already a prop of the modal).
  Rule this reinforces: a degraded path must be as loud as a working one.
- PR 15 (owner: "if I record the match report it transcribes it, but if I record it again
  the old text still remains"). A DOUBLE-BILLING bug, and the worst one in the phase.
  `stop()` clears `isRecording` synchronously, but the clip is written later inside the
  recorder's own `onstop`. In that gap the panel's effect saw "not recording" with
  `lastClip` still pointing at the PREVIOUS clip, so it re-transcribed the old audio -
  old text back on screen, the coach billed a second time for it - and then ignored the
  new clip when it finally arrived, because its claim flag had already been consumed.
  Fixed by remembering the claimed clip id and baselining it at record-start, so only a
  clip written after the tap can be claimed. The regression test drives the exact
  sequence and fails against the old code with "2 calls, expected 1".
  This is the fifth instance of the session's blind spot: acting on state that was true
  a moment ago. Here the stale value was the recorder's own last clip.
- PR 16 (owner, after testing the whole feature: "I would like to hear the report in
  passive format, not 'Valmentajan mukaan oli prassia' but 'oli prassia'"). The honesty
  rule was aimed at the wrong AUDIENCE. "Attribute it to the coach" exists so attested
  data is not passed off as something the app measured - but the report is the coach's own
  document about their own team, and attributing their observations back to them reads
  like a diary saying "according to the author". In Finnish it produced bureaucratic prose
  no coach would write.
  Reworked: the prompt opens with a VOICE block asking for the impersonal register a match
  report uses (Finnish passive, with the owner's own example of the right and wrong form),
  the `attested` tier says the datum belongs in the report's own voice while still
  forbidding invented detail and numbers that are not in the data, and rule 4 now spells
  out that the report's voice "changes who is speaking, not what is known". Substance
  rules untouched: never invent, never turn planner intent into a claim about a player, no
  player note without a note behind it.
  LESSON: a data-honesty rule has to be written for the document's actual reader. Hedging
  aimed at a stranger reads as evasion when the author is the audience.
  Same PR, owner's second point ("the system prompt could provide more context so the
  call understands we are talking about soccer"): the prompt described the DATA but never
  the DOMAIN, so the model was guessing - position codes read as initials, two periods
  were not recognised as halves, and a U11 match invited professional analysis. A
  `matchContext()` block now states the sport (futsal described as its own game, not
  soccer-with-fewer-players), the age group with an explicit "not professional analysis,
  a parent may read it", the period structure (two periods = halves) and clock basis,
  which side "us" and "them" mean, and that position codes are pitch roles with their
  line - GK / back line / holding, central, attacking midfield / front line.
- DECIDED 2026-09-05 (owner): assessment slider VALUES stay out of the packet - "the
  ratings do not need to be on the report, but from the recordings yes". Coverage counts
  only, as 8a built it. Dictated notes ARE the material the report is built from.
- PR 18 (found while answering "if I record someone's good performance, it should not be
  prevented from appearing on the match report"). It was not prevented - it arrived as a
  CODE. Player notes were mapped back through `entityId`; drafted SECTION TEXT was not, so
  the coach's own report read "P1 teki paljon tyota". Pseudonymization protects the child
  from the PROVIDER, not from the coach who wrote the note. `resolveRefsInText` now puts
  names back into section text AND note text, longest ref first so "P1" cannot eat the
  front of "P10", word boundaries both sides. Owner's follow-up: the name is the NICKNAME
  or FIRST name, never the surname.
- MODEL ID VERIFIED 2026-09-05 (owner pasted their account's list): `gpt-5-mini` exists,
  so `DRAFTING_MODEL` is valid and the price constants match it. Newer mini-class models
  are available to them too (gpt-5.4-mini; flagships to 5.6).
- PR 17 (owner picked option B). The draft is written KNOWING the coach's existing report
  (it goes into the packet as `attested.coachReport`), so with append it can cover the same
  ground twice. A note now says so where the choice is made - not after the coach is
  reading it twice - and points at Replace, which has undo. Shown only when there IS
  existing text, and it gives way to the replace warning when Replace is picked.
  Two options DECLINED for now, recorded so they are not re-invented:
  (A) a prompt line telling the model to extend rather than restate - models are
      unreliable about "do not repeat", so it would help without fixing;
  (C) split the two jobs the one button conflates - "write a report from my notes"
      (coachReport should not be source material at all) vs "finish what I wrote"
      (coachReport is the primary source, Replace the natural ending). The proper fix,
      held until the owner knows from real use which job they actually do.
  NOT DONE and not to be done: defaulting to Replace when text exists. Existing text is
  precisely where destroying something matters most.
- OPEN DECISION for 9b: whether assessment slider values join the packet (8a
  deliberately sends only coverage counts).
- PR 19 (owner: "should we have a fallback model? or are you building a model chooser?"
  then "we cant know what model a specific user has - also I would restrict the usage of
  high cost models altogether so no accidents happen"). Both answered:
  NO automatic fallback, deliberately. Silently swapping the model would change the prose,
  the price and the result without telling anyone - the exact class of hidden behaviour
  this phase kept removing. A wrong model id is rejected before generation, so it is not
  billed either; there is no cost argument for an auto-retry.
  A CHOOSER instead, on the AI settings card, with two guards:
  1. The list is read from the coach's OWN account (`listAiModels`, the free `/v1/models`
     endpoint the key test already uses), because we cannot know what any account has.
  2. Only the cheap tiers are offered - ids ending `-mini` or `-nano`, with codex/search/
     audio/embedding variants and date-stamped duplicates filtered out. A match report does
     not need a flagship, a mis-tap must not be able to run up a bill, AND it keeps the
     cost figures meaningful: they are the DEFAULT model's prices, so allowing a pro model
     would make every estimate in the app a lie. The card says so when a non-default model
     is chosen. On the owner's account this offers exactly gpt-5-mini, gpt-5-nano,
     gpt-5.4-mini, gpt-5.4-nano.
  The choice is device-local like the key (`matchops_ai_model`), and `ReportDraft.model`
  records which model actually wrote a draft, so provenance stays truthful.
  PROCESS NOTE: two plan-doc notes failed to apply today because their anchor text lived
  on a sibling branch still open. Branch from the merged state, or expect the conflict.

**Phase 4 - Spoken debrief**
- PR 10 (done, RESHAPED from the plan on the owner's steer): not a separate memo
  surface. `SpokenReportPanel` sits in the spine's Otteluraportti step, uses the SAME
  recorder as the in-match mic (so two recordings can never overlap), tap-to-start /
  tap-to-stop rather than press-and-hold, transcribes its own clip on the spot instead
  of sending it to the inbox, and offers three endings: keep as a `debrief`-tagged note
  (the drafting prompt now treats such a note as the coach's own account and the primary
  source), add straight into the report text (append only, never replacing), or throw
  away. Audio is deleted once the words are kept; a refused save keeps both.
  WHY RESHAPED: a second recording surface would duplicate capture, which is exactly
  what the Phase 1b restructure removed. The value was the debrief TAG, not a new screen.
  `useDictationCapture` gained `lastClip` so a caller can claim the clip it started;
  `GameNoteInput` gained an optional `tag`.

**Phase 5 - Season synthesis**
- PR 11: per-player season summary over accumulated notes + minutes + positions;
  decide its storage. Closes the AI Assistant "richer data collection" prerequisite.

## Testing

Unit tests with mocked `MediaRecorder` / `mediaSession` / `getUserMedia` / fetch; the
note round-trip and backup-restore tests in PR 1; the gate-blocks-key test in PR 4. The
promised **backup-excludes-key test was missed in PR 4 and landed in 9d** (found while
answering why a preview URL loses the key): `fullBackup.test.ts` now asserts an export
carries neither the key, the consent flag nor the usage counter. The export builds from
an allowlist so they were already excluded; the test is there so a future "back up
everything" change fails instead of shipping credentials in a file coaches share. A manual device checklist per phase (Android phone,
earbuds, TWA build) because none of the media APIs run in jsdom or Playwright.

## AI expansions (2026-09-05, owner asked for the low-hanging ones)

The expensive parts are built - consent, key handling, redaction, a capped and validated
call, the approve-item-by-item screen, provenance, cost tracking - so anything reusing that
spine is cheap. Ordered by value for effort:

- **Tidy my report (done, PR 27).** A `DraftingMode` on the existing call: `full` writes
  from everything recorded, `tidy` organises what the coach ALREADY wrote under the seven
  headings without adding observations they did not make. Same packet, same schema, same
  review screen, one extra prompt block and one extra button - offered only when there is
  something to tidy. It defaults to REPLACE, unlike drafting: keeping the untidy original
  above a tidied version of itself defeats the point, and the warning and undo still stand.
  This is the one that removes the main reason a report never gets written at all.
- **Translate the report (done).** Read-only output with copy, and NO apply path, so it has
  no data-loss surface at all - the panel is handed the report text and no way to write one
  back, and a test asserts no apply/save control and no editable field exists in it. Names
  leave as codes like every other request and are resolved back on the device. The shared
  `postChatCompletion` was extracted at the same time, so drafting and translation cannot
  drift on what counts as unauthorized, what is billed, or what may be logged.
- **Group the notes about one player** (after that).
- **Season summaries: NOT low-hanging.** They widen what leaves the device from one match
  to a season of observations about a child. That is a real privacy escalation and the
  point where the legal review this doc recommends stops being optional.
- **Parent-facing share text: technically trivial, riskiest on the list.** Model-written
  text about a named child leaving the phone into a group chat. Not without deciding first
  who may appear in it and what happens when the model is wrong about a child.
## Completeness, visible where the coach already looks (2026-09-05, owner's idea)

The checklist lived only inside Viimeistele ottelu, so the only way to learn there was
nothing left to do was to open the screen and look. `completenessProgress()` now derives a
`done/total` from the SAME model the checklist rows use - so a bar, a menu badge and the
list can never disagree - and it appears in three places:

- **Top of the checklist card**, a bar plus the count, so the coach sees the whole job
  while working through the six steps (the steps already said "Vaihe 3/6" but nothing said
  how done the MATCH was).
- **On the game-end button**, because at the whistle the only question is whether this
  takes one minute or ten.
- **On the menu row**, with the amber/green dot the saved-games list already uses. This is
  the owner's earlier "how do I signal Viimeistele ottelu is the final step" question
  answered by STATE rather than a badge: it appears because the match is unfinished and
  turns green when it is done. Only that row gets an indicator - a menu where every row
  has status is a menu where none of them mean anything.

DELIBERATELY NOT during play. A completeness bar while the match is running is noise at
best and nags a coach about paperwork while they are coaching at worst.

Counting rule: the bar counts exactly the rows the checklist does not show in amber, because
both read `countRowStatus`. Per-player rows have three states, not two - nothing, some, all -
because "three of fourteen assessed" is neither finished nor untouched, and squeezing it into
one of those is what made the bar and the list contradict each other twice in review. Some
counts toward the bar: a coach who wrote about the players they watched has done that job for
this match, and a bar that only filled at 14/14 would call every real match unfinished. The
row shows an outline tick rather than a solid one, so it never claims all-done at 1/14.

## Before the master merge (checklist)

- [ ] DELETE the `/kirjuri-spike` route (`src/app/kirjuri-spike/`). It is a diagnostic.
- [ ] Apply migrations 041, 042, 043 to PROD - diff the live definitions first; they are
      on staging only.
- [ ] Owner decision: POLICY_VERSION bump (deliberately not bumped so far).
- [ ] Recheck Play Data Safety declarations against what the feature now does.
- [ ] Lawyer / Tietosuojavaltuutettu review of the drafting phase, as this doc recommends.

## Later (not in this build)

BLE keyfob push-to-talk (Web Bluetooth), voice commands that create real events, a
hosted AI tier on MatchOps' own key (deliberately avoided: it would make MatchOps the
processor for every recording), EU-hosted provider option once one supports Finnish,
parent share cards fed by AI summaries.

## Decisions log

- 2026-09-04: BYOK approved; pseudonymization default ON; OpenAI-only first; audio
  never syncs; earbud taps chosen over BLE fob / wake word (wake word rejected on
  privacy); attendance tracking rejected; clock-pinned manual event tapping rejected
  (forces eyes on phone); jersey-number speech handles rejected (cannot control speech,
  duplicate numbers at U10).
- 2026-09-04 (audit): notes = `gameEvents` `type: 'note'` with `entityId`, not a new
  entity; audio in a dedicated Blob DB; key in a device-local module; PR 0 added for the
  three header blockers + wake lock + Sentry scrub; Media Session spike before the
  hands-free PRs; match report stays plain text under the 7 real headings (cap 2000 ->
  4000).
- 2026-09-05: match-surface restructure (Phase 1b, PR 7a-c) decided from a surface
  inventory: one intent per surface by when (before / during / after / across); each
  datum has one editor; done before Phase 2/3 so the AI draft lands in a clean spine.
- 2026-09-05: data honesty rules (absence is not evidence, defaults are not
  measurements, trust tiers recorded / attested / planned, coverage shown with
  denominators, coach-nudging coverage view);
  note `tag`, AI provenance `aiMeta`, own record for season summaries; audio
  never kept.
- 2026-09-04 (privacy): Google Web Speech dropped; on-device not viable for Finnish
  today (probe kept); BYOK transcription moved into Phase 1 behind a versioned consent
  gate with dictation rules; 30-day hard audio cap; risk assessment kept in this doc;
  lawyer/Ombudsman review recommended before the drafting phase ships.
