# Kirjuri - dictation capture + BYOK post-match AI

One pipeline, two halves: **capture facts during the game** (voice notes, hands-free),
**synthesize after it** (AI drafts, coach approves). Replaces rating-based assessment with
evidence: the app collects observations, judgment is generated on demand and always
coach-approved.

## Principles (do not re-litigate)

- **Capture now, understand later.** In-game there is exactly one interaction: press,
  speak, done. All intelligence (transcription cleanup, name matching, tagging) happens
  post-game in an inbox. The phone is a dictaphone during play, never a UI.
- **Assessment is output, not input.** No sliders, no scales. AI summaries are generated
  from accumulated facts, revisable, and evidence-linked.
- **Coach approves everything.** Nothing AI-generated is saved without explicit accept.
  Accepted items carry `source: 'ai'` (or `'dictation'`) provenance.
- **BYOK, client-direct.** The coach's own API key, calls straight from the device to the
  provider. MatchOps runs no AI infra and never sees the data in transit.
- **No always-on listening.** Push-to-talk only. Short deliberate clips of the coach's
  own voice.

## Data rules

**Voice clips and notes**
- Every clip is stamped with game clock + period at press time.
  Example: `{ gameId, clock: 1834, period: 2, text: "Emma hieno syöttö paineen alla" }`.
- Raw audio is device-local only and deleted when its note is accepted (configurable).
  Audio never syncs; accepted note text syncs like any other entity.
- A note is either a player note (`playerId` set, matched via roster names/nicknames -
  the wizard's first-word nicknames double as speech handles) or a game note.

**API key**
- Device-local only. Never synced, never in backups/exports, never logged, never sent to
  Sentry. Masked input, test button, delete button.
- Onboarding text tells the coach to create a dedicated key with a monthly spend cap.

**AI transfer**
- Pseudonymized by default: player names replaced with tokens before sending, remapped
  locally on return. Example: packet says `P3 scored at 12:40`, the AI writes about
  "P3", the app renders "Emma". Coach can disable; default stays on.
- Data is sent only on an explicit coach action (never automatically), only to the
  coach's chosen provider with the coach's key.
- One match costs roughly 1-5 cents on a mini-class model; the capped key bounds worst
  case.

**AI output**
- Responses must match a versioned JSON schema (`aiSchema v1`), validated locally;
  anything malformed is rejected whole. Review screen shows each proposed item
  (match report sections, per-player notes, focus suggestions) with accept / edit /
  reject. Only accepted items are saved.

## Phases and PR plan

Integration branch: **`feat/kirjuri-ai`** (off master). Every step is a sub-branch PR'd
into it (CI + review loop, merge on Approve). PR to master ONLY when the whole feature is
complete and owner-tested.

**Phase 1 - Capture core** (useful alone, no AI, no Bluetooth)
- PR 1: note entity + local storage + cloud sync + tests (data layer only).
- PR 2: press-hold mic button on the timer overlay; MediaRecorder clip + live Web Speech
  transcript (fi-FI); clock/period stamping; local persistence.
- PR 3: dictation inbox in the wrap-up card: transcript, replay, fuzzy player chip,
  accept/edit/reject; accepted notes land on player profile + game timeline.

**Phase 2 - Hands-free**
- PR 4: silent-track Media Session so earbud taps (play/pause) toggle recording; earcon
  confirmations into the bud.
- PR 5: Bluetooth mic input selection + match-mode touch shield (pocketed phone, screen
  on under the existing wake lock).

**Phase 3 - BYOK post-match AI**
- PR 6: AI settings section: provider (OpenAI first, field designed for more), local key
  handling per the data rules, pseudonymize toggle, test call.
- PR 7: GamePacket builder (score, events, minutes + positions, demand level, notes,
  pseudonymized roster) + schema v1 + client call with structured output + local
  validation.
- PR 8: review screen + apply-on-approve with provenance; drafts the match report into
  the existing template sections (overview / what went well / working on / next step).

**Phase 4 - Spoken debrief**
- PR 9: 60-second post-match voice memo (and optional halftime memo) feeding the
  GamePacket, so the report draft is built largely from the coach's own words.

**Phase 5 - Season synthesis**
- PR 10: per-player season summary over accumulated notes + minutes + positions via the
  same pipeline. This closes the AI Assistant "richer data collection" prerequisite.

## Later (not in this build)

BLE keyfob push-to-talk button (Web Bluetooth), voice commands that create real events,
a hosted AI tier on MatchOps' own key (BYOK design does not preclude it), parent share
cards fed by AI summaries.

## Decisions log

- 2026-09-04: BYOK approved (safe given the four conditions above); pseudonymization
  default ON; OpenAI-only first; audio never syncs in v1; earbud taps chosen over BLE
  fob / wake word (wake word rejected on privacy); attendance tracking rejected;
  clock-pinned manual event tapping rejected (forces eyes on phone - dictation instead).
