/**
 * Playing-Time Planner — plan data model (Phase 1, PR 1.2).
 *
 * A plan is a self-contained local blob: a roster snapshot plus a set of games,
 * each with a formation, length, and (filled in later PRs) a starting lineup and
 * substitution schedule. It is deliberately independent of the app's live game
 * state - no cloud, no game binding - so a coach can build it at home and it
 * simply lives in local storage.
 *
 * The roster is snapshotted by `{ id, name }` rather than referenced by id alone
 * so a plan stays readable and exportable even if the master roster later
 * changes. The minutes engine (`minutes.ts`) consumes ids; display names come
 * from the plan's own `players` list.
 */

/** Current on-disk schema version for a stored plan. */
export const PLAYTIME_PLAN_SCHEMA_VERSION = 1;

/** A roster member captured into a plan (self-contained, survives roster edits). */
export interface PlanPlayer {
  id: string;
  name: string;
}

/** A player assigned to one on-field slot at kickoff (`null` = empty slot). */
export interface PlanSlotAssignment {
  slotId: string;
  playerId: string | null;
}

/** A planned substitution within a game (added to the UI in PR 1.4). */
export interface PlanSub {
  id: string;
  slotId: string;
  timeSeconds: number;
  inPlayerId: string | null;
}

/** One game in a plan. */
export interface PlanGame {
  id: string;
  /** Short label shown to the coach (e.g. "Game 1" or an opponent name). */
  label: string;
  /** Formation preset id supplying the on-field slots. */
  formationId: string;
  /** 1 or 2. */
  numberOfPeriods: number;
  /** Minutes per period. */
  periodMinutes: number;
  /** Whether this game counts toward the fair-share read. */
  included: boolean;
  /** Players marked absent for THIS game (not coming): excluded from the
   *  bench, from Suggest, and from this game's fair-share math. */
  absentIds?: string[];
  /** Starting assignment per slot (populated in PR 1.3; empty on creation). */
  startingSlots: PlanSlotAssignment[];
  /** Substitution schedule (populated in PR 1.4; empty on creation). */
  subs: PlanSub[];
}

/** A whole playing-time plan. */
export interface PlaytimePlan {
  id: string;
  name: string;
  version: number;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  /** Roster snapshot. */
  players: PlanPlayer[];
  games: PlanGame[];
  /**
   * Optional source team (Phase 2). When set, the plan's roster + durations were
   * seeded from this team and its linked competition; used later to prefill real
   * games from the same source. Absent for freehand (no-team) plans.
   */
  teamId?: string;
  /** Archived plans are hidden from the manager list behind a toggle. */
  archived?: boolean;
}

/** Stored shape: a map of plan id -> plan (mirrors how saved games are kept). */
export type PlaytimePlanCollection = Record<string, PlaytimePlan>;

/** Total playing seconds of a game (all periods). */
export const gameTotalSeconds = (game: Pick<PlanGame, 'numberOfPeriods' | 'periodMinutes'>): number =>
  Math.max(0, game.numberOfPeriods) * Math.max(0, game.periodMinutes) * 60;

// ── Runtime validation (for getStorageJSON; corrupt/legacy data is recoverable) ──

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isPlanPlayer = (v: unknown): v is PlanPlayer =>
  isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string';

const isSlotAssignment = (v: unknown): v is PlanSlotAssignment =>
  isRecord(v) &&
  typeof v.slotId === 'string' &&
  (v.playerId === null || typeof v.playerId === 'string');

// Numbers must be real, usable values, not just `typeof number`: a hand-edited
// or crafted import with NaN/negative durations would otherwise poison every
// downstream calculation (NaN game length -> NaN fair share -> blank balance
// view with no hint why).
const isFiniteNonNegative = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

const isSub = (v: unknown): v is PlanSub =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  typeof v.slotId === 'string' &&
  isFiniteNonNegative(v.timeSeconds) &&
  (v.inPlayerId === null || typeof v.inPlayerId === 'string');

/** No player may start in two slots - it would double-count their minutes. */
const hasUniqueAssignedPlayers = (slots: PlanSlotAssignment[]): boolean => {
  const seen = new Set<string>();
  for (const s of slots) {
    if (s.playerId === null) continue;
    if (seen.has(s.playerId)) return false;
    seen.add(s.playerId);
  }
  return true;
};

const isPlanGame = (v: unknown): v is PlanGame =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  typeof v.label === 'string' &&
  typeof v.formationId === 'string' &&
  isFiniteNonNegative(v.numberOfPeriods) &&
  isFiniteNonNegative(v.periodMinutes) &&
  typeof v.included === 'boolean' &&
  Array.isArray(v.startingSlots) &&
  v.startingSlots.every(isSlotAssignment) &&
  hasUniqueAssignedPlayers(v.startingSlots as PlanSlotAssignment[]) &&
  Array.isArray(v.subs) &&
  v.subs.every(isSub) &&
  // Optional, but when present it must be a string array - every consumer
  // does `new Set(g.absentIds ?? [])`, which throws on a non-iterable.
  // null is tolerated (the ?? fallback handles it) so a lenient writer
  // can't get a whole stored plan dropped on read.
  (v.absentIds == null ||
    (Array.isArray(v.absentIds) && v.absentIds.every((id) => typeof id === 'string')));

/** Type guard for a single stored plan. */
export const isPlaytimePlan = (v: unknown): v is PlaytimePlan =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  typeof v.name === 'string' &&
  typeof v.version === 'number' &&
  typeof v.createdAt === 'string' &&
  typeof v.updatedAt === 'string' &&
  (v.teamId === undefined || typeof v.teamId === 'string') &&
  Array.isArray(v.players) &&
  v.players.every(isPlanPlayer) &&
  new Set((v.players as PlanPlayer[]).map((p) => p.id)).size === (v.players as PlanPlayer[]).length &&
  Array.isArray(v.games) &&
  v.games.every(isPlanGame);

/** Type guard for the stored collection (map of id -> plan). */
export const isPlaytimePlanCollection = (v: unknown): v is PlaytimePlanCollection =>
  isRecord(v) && Object.values(v).every(isPlaytimePlan);
