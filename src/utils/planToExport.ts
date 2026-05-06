// Convert a PlanningSession + SavedGames into the wire-shaped
// ImportedPlan envelope. Inverse of planFromImport.ts; pairs with
// serializePlanExport / serializePlanBundle to drive the export
// UI.

import type { AppState, ScheduledSub } from '@/types/game';
import type { PlanningSession } from '@/types/planningSession';
import type { ImportedPlan, ImportedPlanGame } from './planExport';
import { PLAN_EXPORT_KIND, PLAN_FORMAT_VERSION } from './planExport';
import { gameDurationSec } from './planFormatters';
import type { PlanDraft } from './planSwapEngine';

interface ToExportOptions {
  /** Override the team name. Defaults to the first saved-game's teamName. */
  teamName?: string;
  /** Override the formation id. Defaults to the session draft's presetId, then ''. */
  formationId?: string;
  /** Override the roster size. Defaults to selectedPlayerIds.length on game 1. */
  rosterSize?: number;
  /** Top-level `currentVersionName` on the envelope. */
  currentVersionName?: string | null;
  /** ISO timestamp; falls back to the session's updatedAt. */
  savedAt?: string;
}

// Shape per scheduledSub matches the standalone — id, timeSeconds,
// positionRole, inPlayer, plus an outPlayer the editor recomputes lazily
// at Apply (drafts don't carry it). For export we synthesise outPlayer
// from the role's pre-sub occupant so the standalone reader gets a
// fully-formed sub.
function buildScheduledSubsForExport(
  draft: PlanDraft,
): ScheduledSub[] {
  // Group by role to walk in time order; outPlayer at sub n is the
  // player who held the role just before n (startingXI on the first,
  // earlier sub's inPlayer thereafter).
  const byRole = new Map<string, typeof draft.scheduledSubs>();
  for (const sub of draft.scheduledSubs) {
    const list = byRole.get(sub.positionRole) ?? [];
    list.push(sub);
    byRole.set(sub.positionRole, list);
  }
  const out: ScheduledSub[] = [];
  for (const [role, subs] of byRole) {
    const sorted = [...subs].sort((a, b) => a.timeSeconds - b.timeSeconds);
    let curPlayer = draft.startingXI[role] ?? '';
    for (const s of sorted) {
      out.push({
        id: s.id,
        timeSeconds: s.timeSeconds,
        positionRole: s.positionRole,
        outPlayer: curPlayer,
        inPlayer: s.inPlayer,
        // Drafts don't carry status; fired-on-Apply is the runtime
        // mark, but the export envelope expects 'pending' for not-yet-
        // fired subs (matches the standalone).
        status: 'pending',
      });
      curPlayer = s.inPlayer;
    }
  }
  // Re-sort globally by time so the wire shape matches the standalone's
  // chronological order across roles.
  return out.sort((a, b) => a.timeSeconds - b.timeSeconds);
}

function gameToImportedGame(
  gameId: string,
  game: AppState | undefined,
  draft: PlanDraft | undefined,
): ImportedPlanGame {
  // Fall back to a placeholder when the game record is missing — keeps
  // export resilient to cloud-sync races. Numeric defaults match the
  // most permissive standalone shape (1 period, 12.5 min, 25 min total).
  const periods = (game?.numberOfPeriods ?? 2) as 1 | 2;
  const periodMin = game?.periodDurationMinutes ?? 12.5;
  const dur = game ? gameDurationSec(game) : periods * periodMin * 60;
  const durationMin = dur / 60;
  // Opponent / label fall back to a synthesised placeholder when the
  // saved game is unavailable (cloud-sync race) — parsePlanExport
  // rejects empty opponent strings.
  const opponent = game?.opponentName?.trim() || `Game ${gameId}`;
  return {
    id: gameId,
    label: opponent,
    time: game?.gameTime ?? '',
    field: game?.gameLocation ?? '',
    opponent,
    numberOfPeriods: periods,
    periodDurationMinutes: periodMin,
    durationMin,
    // halfTimeMin must be strictly < durationMin in the standalone's
    // wire format (parsePlanExport rejects equality). Half of the
    // total works for both 1- and 2-period games — the standalone
    // doesn't render a half-time banner for 1-period games anyway.
    halfTimeMin: durationMin / 2,
    startingXI: { ...(draft?.startingXI ?? {}) },
    scheduledSubs: draft ? buildScheduledSubsForExport(draft) : [],
  };
}

/**
 * Convert a single PlanningSession + the matching SavedGames into the
 * standalone planner's ImportedPlan envelope. Output passes
 * parsePlanExport's structural validation by construction (no empty
 * games array — caller is responsible for ensuring session.gameIds
 * is non-empty, which validatePlanningSession enforces).
 */
export function planningSessionToImportedPlan(
  session: PlanningSession,
  savedGames: Record<string, AppState | undefined>,
  options: ToExportOptions = {},
): ImportedPlan {
  const games = session.gameIds.map((gid) =>
    gameToImportedGame(gid, savedGames[gid], session.draft[gid]),
  );
  // Pull defaults from the first available saved game when the
  // caller didn't override.
  const firstGame = session.gameIds
    .map((gid) => savedGames[gid])
    .find((g): g is AppState => Boolean(g));
  const teamName = options.teamName ?? firstGame?.teamName ?? '';
  // The presetId lives on the draft (not the session), so peek at the
  // first non-empty draft entry to recover it.
  const firstDraft = Object.values(session.draft).find(
    (d): d is PlanDraft => Boolean(d),
  );
  const formationId = options.formationId ?? firstDraft?.presetId ?? '';
  const rosterSize =
    options.rosterSize ?? firstGame?.selectedPlayerIds?.length ?? 0;
  // Per-game `included` flag: NULL/undefined includedGameIds means
  // "all included" (legacy semantic from migration 037), so emit a
  // run of `true`s; otherwise project onto session.gameIds order.
  const included = session.includedGameIds
    ? session.gameIds.map((gid) =>
        session.includedGameIds!.includes(gid),
      )
    : session.gameIds.map(() => true);

  return {
    formatVersion: PLAN_FORMAT_VERSION,
    kind: PLAN_EXPORT_KIND,
    savedAt: options.savedAt ?? session.updatedAt,
    teamName,
    formationId,
    rosterSize,
    games,
    included,
    currentVersionName:
      options.currentVersionName !== undefined
        ? options.currentVersionName
        : session.name,
  };
}
