/**
 * Apply-now: convert an in-memory PlanDraft into the AppState updates that
 * land on a Game record (playersOnField + selectedPlayerIds).
 *
 * Pure: returns the deltas, never mutates input. The caller wires the
 * result into `mutateGameDetails` / SyncedDataStore (PR 5c).
 *
 * @see PR 5b — Phase 1 editor foundation
 */

import type { Player } from '@/types';
import type { FormationPreset } from '@/config/formationPresets';
import type { PlanDraft, PlayerId } from '@/utils/planSwapEngine';

export interface ApplyResult {
  /**
   * Players placed on the pitch with their resolved (relX, relY) coords.
   * Order: roles in the preset's role order (skipping GK first if not assigned),
   * then any roles in startingXI not in the preset's role list (defensive).
   */
  playersOnField: Player[];
  /**
   * Union of starting-XI player ids and bench player ids — every roster
   * member who's part of this game. Equals roster − any unknown ids that
   * snuck in via a malformed draft (filtered out for safety).
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
 * Role → coords resolution uses the preset's `roles` map (PR 5a). Roles
 * not present in the map (or in legacy presets without one) get filtered
 * out with their player ids surfaced via `unknownRoles`.
 *
 * Players in the draft that aren't in the roster are filtered out — caller
 * sees them via `unknownPlayerIds`.
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

  const unknownRoles: string[] = [];
  const unknownPlayerIds: PlayerId[] = [];

  // 1. Build playersOnField in role order from the preset (where possible).
  const playersOnField: Player[] = [];
  const placedPlayerIds = new Set<PlayerId>();

  if (preset?.roles) {
    for (const role of preset.roles) {
      const playerId = draft.startingXI[role.name];
      if (!playerId) continue; // empty slot — skip
      const player = rosterMap.get(playerId);
      if (!player) {
        unknownPlayerIds.push(playerId);
        continue;
      }
      playersOnField.push({
        ...player,
        relX: role.relX,
        relY: role.relY,
      });
      placedPlayerIds.add(playerId);
    }
  }

  // 2. Defensive: any role in draft.startingXI that wasn't covered above
  //    (either no preset roles map, or the role isn't in the preset).
  for (const [roleName, playerId] of Object.entries(draft.startingXI)) {
    if (placedPlayerIds.has(playerId)) continue;
    if (!presetRoleNames.has(roleName)) {
      unknownRoles.push(roleName);
    }
    // We can't place a player without coords; surface as unknown role and
    // do NOT include in playersOnField. The player still appears in
    // selectedPlayerIds below if they're in the roster.
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
    } else if (!unknownPlayerIds.includes(id)) {
      unknownPlayerIds.push(id);
    }
  }

  return {
    playersOnField,
    selectedPlayerIds,
    unknownRoles,
    unknownPlayerIds,
  };
}

/**
 * Resolve a player's role from existing on-field coords (the inverse path
 * used when loading an existing game's lineup into the planner editor).
 *
 * Returns the role name (within tolerance) or `null` for off-formation
 * positions. Off-formation players surface in the editor as drag-targets
 * the coach can manually slot — see PR 5b's documented legacy-coord
 * fallback.
 *
 * Re-exports `coordForRole`'s tolerance for callers that want to apply
 * the same metric to their own snapping.
 */
export { coordForRole, ROLE_COORD_TOLERANCE } from '@/utils/formations';
