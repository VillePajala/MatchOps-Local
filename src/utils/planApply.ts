/**
 * Apply-now: convert an in-memory PlanDraft into the AppState updates that
 * land on a Game record (playersOnField + selectedPlayerIds). Pure.
 */

import type { Player } from '@/types';
import type { FormationPreset } from '@/config/formationPresets';
import type { PlanDraft, PlayerId } from '@/utils/planSwapEngine';

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

  return {
    playersOnField,
    selectedPlayerIds,
    unknownRoles: [...unknownRolesSet],
    unknownPlayerIds: [...unknownPlayerIdsSet],
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
