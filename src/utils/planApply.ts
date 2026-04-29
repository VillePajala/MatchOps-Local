/**
 * Apply-now: convert an in-memory PlanDraft into the AppState updates that
 * land on a Game record (playersOnField + selectedPlayerIds). Pure.
 */

import type { Player } from '@/types';
import type { FormationPreset } from '@/config/formationPresets';
import type {
  DraftScheduledSub,
  PlanDraft,
  PlayerId,
  RoleName,
} from '@/utils/planSwapEngine';
import type { ScheduledSub } from '@/types/game';

export interface ApplyResult {
  /**
   * Players placed on the pitch with their resolved (relX, relY) coords.
   * Order: matches the preset's role order; empty role slots are skipped.
   *
   * **Not deduped by player id.** A pathological draft with the same
   * player at two roles produces two entries here; the editor UI prevents
   * that state at the source — see `applyDraftToGame` JSDoc.
   */
  playersOnField: Player[];
  /**
   * `(startingXI ∪ bench) ∩ roster` — i.e. roster members the draft
   * references, deduped. Roster members not referenced by the draft are
   * intentionally excluded; unknown ids surface in `unknownPlayerIds`.
   *
   * **CLAUDE.md Rule 3 (`playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers`)**
   * is preserved without the caller touching `availablePlayers`: the
   * `roster` argument is the game's existing `availablePlayers`, and
   * `applyDraftToGame` filters both returned arrays through it. The
   * caller therefore only needs to persist `playersOnField` +
   * `selectedPlayerIds`; leaving `availablePlayers` untouched on the
   * game is intentional and Rule-3-safe.
   */
  selectedPlayerIds: PlayerId[];
  /**
   * Roles the draft references that don't exist in the formation preset's
   * roles map. Caller surfaces these as a warning ("plan references roles
   * not in this formation"). Players assigned to those roles are dropped
   * from playersOnField (they'd have no coords to place at).
   */
  unknownRoles: string[];
  /**
   * Players the draft references that aren't in the supplied roster. These
   * are filtered out of selectedPlayerIds + playersOnField; caller can show
   * "X players on the plan are not in the team roster" for the import case.
   */
  unknownPlayerIds: PlayerId[];
  /**
   * `Game.scheduledSubs` shape (status: 'pending') derived from the
   * draft's scheduledSubs. Subs whose `inPlayer` or `outPlayer` aren't
   * in the roster are dropped (the player ids are also surfaced via
   * `unknownPlayerIds`). Subs whose `positionRole` isn't in the preset
   * are dropped (and surfaced via `unknownRoles`).
   */
  scheduledSubs: ScheduledSub[];
  /**
   * Subs dropped because their `timeSeconds` is at or past the per-game
   * duration the caller supplied. They'd never fire on the live timer.
   * Empty when the caller didn't supply a duration.
   */
  unreachableSubs: DraftScheduledSub[];
}

/**
 * Build the playersOnField + selectedPlayerIds for a single game.
 *
 * Role → coords resolution uses the preset's `roles` map. Roles not
 * present in the map (or in legacy presets without one) are filtered out
 * and surfaced via `unknownRoles`. Players in the draft that aren't in
 * the roster are filtered out and surfaced via `unknownPlayerIds`.
 *
 * **Does not deduplicate player ids across roles.** A pathological draft
 * with the same player in two roles produces two `playersOnField`
 * entries. The editor UI is responsible for preventing that state; the
 * engine treats it as the caller's contract violation.
 */
export function applyDraftToGame(
  draft: PlanDraft,
  preset: FormationPreset | null | undefined,
  roster: readonly Player[],
  /**
   * Per-game total duration in seconds. When supplied, subs whose
   * timeSeconds is at or past this value are dropped from the result —
   * they'd never fire on the live timer of a shorter game. Caller
   * passes `numberOfPeriods × periodDurationMinutes × 60`. When
   * omitted (legacy callers), all subs pass through regardless of
   * time.
   */
  gameDurationSec?: number,
): ApplyResult {
  const rosterMap = new Map<PlayerId, Player>();
  for (const p of roster) rosterMap.set(p.id, p);

  const presetRoleNames = new Set(
    (preset?.roles ?? []).map((r) => r.name),
  );

  const unknownRolesSet = new Set<string>();
  const unknownPlayerIdsSet = new Set<PlayerId>();

  // 1. Build playersOnField in role order from the preset (where possible).
  // `preset?.roles ?? []` falls through gracefully — no need to re-guard.
  const playersOnField: Player[] = [];
  for (const role of preset?.roles ?? []) {
    const playerId = draft.startingXI[role.name];
    if (!playerId) continue; // empty slot — skip
    const player = rosterMap.get(playerId);
    if (!player) {
      unknownPlayerIdsSet.add(playerId);
      continue;
    }
    playersOnField.push({
      ...player,
      relX: role.relX,
      relY: role.relY,
    });
  }

  // 2. Detect roles in the draft that aren't in the preset. Iterate over
  //    role NAMES (not player ids), so a reused player id at an unknown
  //    role still surfaces — matters for legacy / corrupt drafts.
  for (const roleName of Object.keys(draft.startingXI)) {
    if (!presetRoleNames.has(roleName)) {
      unknownRolesSet.add(roleName);
    }
  }

  // 3. selectedPlayerIds = startingXI ∪ bench, filtered to roster members.
  const idsInDraft = new Set<PlayerId>([
    ...Object.values(draft.startingXI),
    ...draft.bench,
  ]);
  const selectedPlayerIds: PlayerId[] = [];
  for (const id of idsInDraft) {
    if (rosterMap.has(id)) {
      selectedPlayerIds.push(id);
    } else {
      unknownPlayerIdsSet.add(id);
    }
  }

  // 4. scheduledSubs: validate roles + inPlayer against the formation
  //    + roster; siphon time-out-of-range subs into `unreachableSubs`;
  //    compute outPlayer lazily from the draft's pre-sub segments
  //    (canonical source of truth — the field state from startingXI +
  //    earlier subs). The sort order matters: we sort the input by
  //    timeSeconds first so each sub sees a fresh view of who is at
  //    its role at its time, then walk in chronological order.
  const sortedSrc = [...draft.scheduledSubs].sort(
    (a, b) => a.timeSeconds - b.timeSeconds,
  );
  const validForOutPlayer: DraftScheduledSub[] = [];
  const scheduledSubs: ScheduledSub[] = [];
  const unreachableSubs: DraftScheduledSub[] = [];
  for (const s of sortedSrc) {
    if (!presetRoleNames.has(s.positionRole)) {
      unknownRolesSet.add(s.positionRole);
      continue;
    }
    if (!rosterMap.has(s.inPlayer)) {
      unknownPlayerIdsSet.add(s.inPlayer);
      continue;
    }
    if (
      // Production callers always pass Math.max(1, …) so 0 never
      // reaches here; the `> 0` guard lets legacy / defensive
      // callers signal "no duration check" by passing 0 or a
      // negative value the same way `undefined` does.
      typeof gameDurationSec === 'number' &&
      gameDurationSec > 0 &&
      s.timeSeconds >= gameDurationSec
    ) {
      unreachableSubs.push(s);
      continue;
    }
    validForOutPlayer.push(s);
  }
  // outPlayer = the role's occupant just before this sub fires.
  // Walk each role's subs in chronological order: the first sub's
  // outPlayer is startingXI[role]; each subsequent sub's outPlayer
  // is the previous sub's inPlayer. This handles same-time ties
  // deterministically (insertion order via stable sort) — a segment
  // lookup at the exact tie time would alias to the next sub's
  // inPlayer instead.
  const subsByRoleMap = new Map<RoleName, DraftScheduledSub[]>();
  for (const s of validForOutPlayer) {
    const list = subsByRoleMap.get(s.positionRole) ?? [];
    list.push(s);
    subsByRoleMap.set(s.positionRole, list);
  }
  const outPlayers = new Map<string, PlayerId>();
  for (const [role, list] of subsByRoleMap) {
    list.sort((a, b) => a.timeSeconds - b.timeSeconds);
    let curPlayer: PlayerId = draft.startingXI[role] ?? '';
    for (const s of list) {
      if (curPlayer) outPlayers.set(s.id, curPlayer);
      curPlayer = s.inPlayer;
    }
  }
  for (const s of validForOutPlayer) {
    const outPlayer = outPlayers.get(s.id);
    if (!outPlayer) {
      // Role empty at sub time — sub can't fire. Editor doesn't allow
      // creating one this way, but imported drafts can; surface via
      // unreachableSubs so the warning banner names it.
      unreachableSubs.push(s);
      continue;
    }
    if (!rosterMap.has(outPlayer)) {
      // Computed outPlayer (the role's pre-sub occupant per the draft
      // chain) isn't in the roster. Route to unreachableSubs rather
      // than unknownPlayerIds — the cause is sub-related, not a stale
      // starting-XI assignment, so surfacing it under the
      // "players outside roster" banner would confuse the coach.
      unreachableSubs.push(s);
      continue;
    }
    if (outPlayer === s.inPlayer) {
      // Self-sub (no-op) — the editor's UI guard prevents this, but
      // an imported draft could carry one. Persisting it would fire
      // a no-op banner during the live game.
      unreachableSubs.push(s);
      continue;
    }
    scheduledSubs.push({
      id: s.id,
      timeSeconds: s.timeSeconds,
      outPlayer,
      inPlayer: s.inPlayer,
      positionRole: s.positionRole,
      status: 'pending',
    });
  }
  // scheduledSubs is already in chronological order: appended in
  // validForOutPlayer's order, which is sorted ascending by
  // timeSeconds. The per-role walk only populates an outPlayers Map;
  // it doesn't reorder validForOutPlayer.

  return {
    playersOnField,
    selectedPlayerIds,
    unknownRoles: [...unknownRolesSet],
    unknownPlayerIds: [...unknownPlayerIdsSet],
    scheduledSubs,
    unreachableSubs,
  };
}

/**
 * Re-exports the role/coord helpers callers need alongside the editor's
 * Apply path:
 * - `coordForRole(preset, name)` → forward (role → {relX, relY})
 * - `roleForCoord(preset, x, y, tol?)` → inverse (coords → role) used to
 *   reconstruct a draft from an existing game's `playersOnField` when
 *   loading into the editor.
 * - `ROLE_COORD_TOLERANCE` for callers that want to apply the same snap
 *   metric to their own pointer/touch handling.
 */
export {
  coordForRole,
  roleForCoord,
  ROLE_COORD_TOLERANCE,
} from '@/utils/formations';
