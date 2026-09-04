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
  speak, done. All intelligence (transcript cleanup, name matching, tagging) happens
  post-game in an inbox. The phone is a dictaphone during play, never a UI.
- **Assessment is output, not input.** No sliders, no scales. AI summaries are generated
  from accumulated facts, revisable, and evidence-linked. (The assessment plan's point
  that coach judgment at writing time is a strong signal still holds - the spoken
  post-match debrief is exactly that signal, captured cheaply.)
- **Coach approves everything.** Nothing AI-generated is saved without explicit accept.
  Every note carries `source: 'dictation' | 'ai' | 'manual'`.
- **BYOK, client-direct.** The coach's own API key, calls straight from the device to the
  provider. MatchOps runs no AI infra and never sees the data in transit.
- **No always-on listening.** Push-to-talk only. Short deliberate clips of the coach's
  own voice.

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
  exists anywhere (`normalizeNameForCompare` only). Web Speech on Android Chrome/TWA is
  Google's cloud recognizer, not on-device.
- No runtime permission prompt exists yet (mic will be the first). No Media Session,
  no global key handling, no touch shield. `useAppResume` force-reloads after >5 min in
  background unless the match timer is running.

## Data model decisions

- **Notes are `gameEvents` of `type: 'note'`** - not a new entity. Fields: `entityId`
  (subject player, optional; game note when absent), `time` (clock seconds), new
  `period`, new `text`, new `source`. Migration `041_game_event_notes.sql`: relax the
  CHECK, add `note_text`, `period`, `source` (nullable, additive; the
  `save_game_with_relations` RPC uses `jsonb_populate_recordset`, so no RPC change).
  Notes ride the game's existing sync, export, backup and import remap. They enter undo
  history like goals (acceptable). Goal-log lists get a `type !== 'note'` filter.
- **Player profile timeline** = note events across games where `entityId === playerId`,
  shown in `PlayerStatsView` independently of assessments (the existing "Assessment
  Notes" list stays gated with assessments).
- **Game timeline** = a notes card beside `GoalEventList` in the stats modal's right
  column (not a generalisation of the goal list).
- **Audio clips**: dedicated IndexedDB DB `matchops_audio_{userId}` storing real Blobs
  keyed by note id. Quota check before write, delete on accept (configurable), rotate
  clips older than 30 days. Never in `savedSoccerGames`, never base64 in a game.
- **API key**: `matchops_ai_key` in its own localStorage module (device-local precedent).
  Excluded from backup/sync by construction; regression test asserts it never appears in
  `generateFullBackupJson`. Sentry `beforeSend`/`beforeBreadcrumb` scrub `sk-` patterns
  and provider hosts; the key module never passes its value to `logger.*`.
- **AI-generated per-player notes** save as note events with `source: 'ai'` on that
  game, referencing the packet hash so a re-run excludes already-applied proposals.
- **Season summary output** (phase 5) is displayed/copied; persistent storage is a
  phase-5 decision (Player.notes is 1000 chars - too small).

## Data rules

**Voice clips and notes**
- Every clip is stamped with clock + period at press time.
  Example: `{ type: 'note', time: 1834, period: 2, entityId: 'p-emma', text: "hieno
  syöttö paineen alla", source: 'dictation' }`.
- Raw audio is device-local only and deleted when its note is accepted (configurable).
  Audio never syncs; accepted note text syncs with the game.
- Live transcription in phase 1 uses the platform Web Speech service (on Android:
  Google's recognizer - the same service behind the keyboard mic button). This is
  disclosed in-app next to the feature toggle. Coaches who decline get audio-only capture
  and type from replay in the inbox. Phase 3 adds transcription through the coach's own
  BYOK provider as the privacy-preferred path.

**Name matching (Finnish inflection is real: "Emman syöttö")**
- Match transcript tokens against the game roster first, then the master roster, using
  nickname or first word of name (`gameRecap.ts` convention), by normalized stem prefix
  + small edit distance. Show the guess as a chip; coach confirms with one tap.
- Pseudonymization replaces all matched tokens (inflected forms included) with `P<n>`
  keyed by `entityId`. Residual leakage of unmatched spoken names is possible and is
  disclosed; a spoken nickname matches best.

**API key**
- Device-local only. Never synced, never in backups/exports, never logged, never sent to
  Sentry. Masked input, test button, delete button.
- Onboarding text tells the coach to create a dedicated key with a monthly spend cap.

**AI transfer**
- Pseudonymized by default; coach can disable; default stays on.
- Sent only on an explicit coach action, only to the coach's chosen provider with the
  coach's key. One match costs cents on a mini-class model.

**AI output**
- Responses must match a versioned JSON schema (`aiSchema v1`, provider structured
  output), validated locally; malformed responses are rejected whole. Review screen
  shows each proposed item with accept / edit / reject; only accepted items are saved.
- Match report drafts are plain text under the 7 localized template headings;
  `gameNotes` limit rises from 2000 to 4000 chars in the same PR (validation only, the
  column is `text`).

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

**Phase 1 - Capture core** (useful alone, no AI, no Bluetooth)
- PR 1: note event type end to end: TS union, zod, `VALID_GAME_EVENT_TYPES`, both
  transforms, `types/supabase.ts`, migration 041, goal-log filters, tests including a
  cloud round-trip and a backup-restore parse.
- PR 2: recording controller hook at orchestration level (reads `elapsedRef`, period,
  status; suppresses `useAppResume` reload while a session is active); press-hold mic
  button in the timer overlay's goal-button row; MediaRecorder clip into the audio DB +
  Web Speech live transcript (fi-FI, feature-detected) + disclosure; first-run
  permission UX incl. denied/blocked states; "note captured" undo toast.
- PR 3: dictation inbox row on the wrap-up card (count from `gameCompleteness`):
  transcript, replay, fuzzy player chip, accept/edit/reject; accepted notes get
  `source: 'dictation'`; notes card in the stats modal; player profile notes list.

**Phase 2 - Hands-free**
- Spike first (half a day, throwaway): silent-track Media Session in the TWA - do
  earbud play/pause taps reach the page, and does the mic stream survive a pocketed
  screen-on phone?
- PR 4: Media Session action handlers toggling the recording controller; earcon
  confirmations into the bud.
- PR 5: Bluetooth mic input selection (enumerateDevices) + match-mode touch shield.

**Phase 3 - BYOK post-match AI**
- PR 6: AI card in Settings > General (below Preferences; a fifth tab crowds mobile):
  provider (OpenAI first, field designed for more), key handling per the data rules,
  pseudonymize toggle, test call; `connect-src` gains the provider host; privacy policy
  page updated (mic + optional BYOK AI); Play Data Safety re-checked.
- PR 7: GamePacket builder (score, events, minutes + positions, demand level, notes,
  pseudonymized roster keyed by `entityId`) + schema v1 + client call + validation.
- PR 8: review screen + apply-on-approve with provenance; match report draft under the
  7 headings; `gameNotes` cap 4000; BYOK transcription for clips whose live transcript
  was declined or empty.

**Phase 4 - Spoken debrief**
- PR 9: 60-second post-match voice memo (optional halftime memo) feeding the
  GamePacket.

**Phase 5 - Season synthesis**
- PR 10: per-player season summary over accumulated notes + minutes + positions;
  decide its storage. Closes the AI Assistant "richer data collection" prerequisite.

## Testing

Unit tests with mocked `MediaRecorder` / `SpeechRecognition` / `mediaSession` /
`getUserMedia`; the note round-trip and backup-restore tests in PR 1; the backup-excludes-
key test in PR 6. A manual device checklist per phase (Android phone, earbuds, TWA build)
because none of the media APIs run in jsdom or Playwright.

## Later (not in this build)

BLE keyfob push-to-talk (Web Bluetooth), on-device transcription (Whisper WASM spike),
voice commands that create real events, a hosted AI tier on MatchOps' own key, parent
share cards fed by AI summaries.

## Decisions log

- 2026-09-04: BYOK approved (safe given the data rules); pseudonymization default ON;
  OpenAI-only first; audio never syncs in v1; earbud taps chosen over BLE fob / wake
  word (wake word rejected on privacy); attendance tracking rejected; clock-pinned
  manual event tapping rejected (forces eyes on phone - dictation instead).
- 2026-09-04 (audit): notes = `gameEvents` `type: 'note'` with `entityId`, not a new
  entity; audio in a dedicated Blob DB; key in a device-local module; PR 0 added for the
  three header blockers + wake lock + Sentry scrub; Media Session spike before PR 4;
  match report stays plain text under the 7 real headings (cap 2000 -> 4000); live
  transcription = platform speech service with disclosure, BYOK transcription as the
  privacy-preferred path from phase 3.
