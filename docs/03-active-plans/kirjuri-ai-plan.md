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
- Spike first (half a day, throwaway): silent-track Media Session in the TWA - do
  earbud play/pause taps reach the page, and does the mic stream survive a pocketed
  screen-on phone?
- PR 6: Media Session action handlers toggling the recording controller; earcon
  confirmations into the bud.
- PR 7: Bluetooth mic input selection (enumerateDevices) + match-mode touch shield.

**Phase 3 - Post-match drafting**
- PR 8: GamePacket builder (score, events, minutes + positions, demand level, notes,
  pseudonymized roster keyed by `entityId`) + schema v1 + client call + validation.
- PR 9: review screen + apply-on-approve with provenance; match report draft under the
  7 headings; `gameNotes` cap 4000.

**Phase 4 - Spoken debrief**
- PR 10: 60-second post-match voice memo (optional halftime memo) feeding the
  GamePacket.

**Phase 5 - Season synthesis**
- PR 11: per-player season summary over accumulated notes + minutes + positions;
  decide its storage. Closes the AI Assistant "richer data collection" prerequisite.

## Testing

Unit tests with mocked `MediaRecorder` / `mediaSession` / `getUserMedia` / fetch; the
note round-trip and backup-restore tests in PR 1; the backup-excludes-key test and the
gate-blocks-key test in PR 4. A manual device checklist per phase (Android phone,
earbuds, TWA build) because none of the media APIs run in jsdom or Playwright.

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
