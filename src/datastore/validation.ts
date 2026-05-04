/**
 * Shared validation utilities for DataStore implementations.
 *
 * This module provides validation functions that are shared between
 * LocalDataStore and SupabaseDataStore to ensure consistent behavior.
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md Section 5.0.10
 */

import type { AppState, ScheduledSub, ScheduledSubStatus } from '@/types/game';
import type { PlanningSession } from '@/types';
import { ValidationError } from '@/interfaces/DataStoreErrors';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { AGE_GROUPS } from '@/config/gameOptions';
import logger from '@/utils/logger';

const PLANNING_SESSION_NAME_MAX = 200;
// Mirrors the cap enforced by LocalDataStore.setActiveSession AND
// migration 036's RPC. Without this the validator silently accepts
// sessions that fail at activation time, leaving the user with no
// signal that the save itself was the problem.
const PLANNING_SESSION_GAME_IDS_MAX = 100;

const SCHEDULED_SUB_STATUSES: readonly ScheduledSubStatus[] = ['pending', 'fired', 'skipped'];

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '';

const validateScheduledSubs = (
  subs: AppState['scheduledSubs'],
  prefix: string,
): void => {
  if (subs === undefined) return;
  if (!Array.isArray(subs)) {
    throw new ValidationError(
      `${prefix}scheduledSubs must be an array when present`,
      'scheduledSubs',
      subs,
    );
  }

  const seenIds = new Set<string>();
  subs.forEach((sub: ScheduledSub, index: number) => {
    const at = `scheduledSubs[${index}]`;

    if (!sub || typeof sub !== 'object') {
      throw new ValidationError(`${prefix}${at} must be an object`, at, sub);
    }
    if (!isNonEmptyString(sub.id)) {
      throw new ValidationError(`${prefix}${at}.id must be a non-empty string`, `${at}.id`, sub.id);
    }
    if (seenIds.has(sub.id)) {
      // Duplicate ids would make the live-banner Apply/Skip dispatcher
      // ambiguous (id is the lookup key for marking 'fired' or 'skipped').
      throw new ValidationError(
        `${prefix}scheduledSubs contains duplicate id "${sub.id}"`,
        `${at}.id`,
        sub.id,
      );
    }
    seenIds.add(sub.id);
    if (
      typeof sub.timeSeconds !== 'number' ||
      !Number.isInteger(sub.timeSeconds) ||
      sub.timeSeconds < 0
    ) {
      // Integer-only: the live-game timer ticks in whole seconds, so a
      // fractional value would never match the firing condition.
      throw new ValidationError(
        `${prefix}${at}.timeSeconds must be a non-negative integer`,
        `${at}.timeSeconds`,
        sub.timeSeconds,
      );
    }
    if (!isNonEmptyString(sub.outPlayer)) {
      throw new ValidationError(
        `${prefix}${at}.outPlayer must be a non-empty player id`,
        `${at}.outPlayer`,
        sub.outPlayer,
      );
    }
    if (!isNonEmptyString(sub.inPlayer)) {
      throw new ValidationError(
        `${prefix}${at}.inPlayer must be a non-empty player id`,
        `${at}.inPlayer`,
        sub.inPlayer,
      );
    }
    if (sub.outPlayer === sub.inPlayer) {
      // A player cannot substitute for themselves; the live-banner Apply
      // would emit a corrupt `substitution` GameEvent.
      throw new ValidationError(
        `${prefix}${at}.inPlayer must differ from outPlayer`,
        `${at}.inPlayer`,
        sub.inPlayer,
      );
    }
    if (!isNonEmptyString(sub.positionRole)) {
      throw new ValidationError(
        `${prefix}${at}.positionRole must be a non-empty string`,
        `${at}.positionRole`,
        sub.positionRole,
      );
    }
    if (!SCHEDULED_SUB_STATUSES.includes(sub.status)) {
      throw new ValidationError(
        `${prefix}${at}.status must be one of ${SCHEDULED_SUB_STATUSES.join(', ')}`,
        `${at}.status`,
        sub.status,
      );
    }
  });
};

/**
 * Validate a game's required and optional fields.
 * Throws ValidationError if validation fails.
 *
 * Used by both LocalDataStore and SupabaseDataStore for consistent validation.
 * This ensures games saved to either backend meet the same requirements.
 *
 * @param game - The game state to validate
 * @param context - Optional context for error messages (e.g., gameId for batch operations)
 * @throws ValidationError if validation fails
 */
/**
 * Normalize optional string: trim whitespace, convert empty to undefined.
 * Used by both LocalDataStore and SupabaseDataStore for consistent field normalization.
 */
export const normalizeOptionalString = (value?: string): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Boundary-safe ScheduledSub validation for cloud + local read paths.
 * `validateScheduledSubs` throws on the first invalid entry, which is
 * the right semantics for write-time validation but wrong for read-
 * time: a single malformed entry from a partial cloud-write or
 * tampered IndexedDB blob would otherwise crash every subsequent
 * planner call. This filter+log variant keeps the rest of the array
 * usable while surfacing the bad entry in logs.
 *
 * Used by SupabaseDataStore.transformGameFromDb and
 * LocalDataStore.loadSavedGames so the two stores behave the same
 * way on corrupt data.
 */
export const validateScheduledSubsFromDb = (
  value: unknown,
  source: string,
  contextId: string,
): ScheduledSub[] => {
  if (!Array.isArray(value)) return [];
  const valid: ScheduledSub[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    const candidate = value[i] as Partial<ScheduledSub> | null;
    if (!candidate || typeof candidate !== 'object') continue;
    if (
      typeof candidate.id !== 'string' || candidate.id.length === 0 ||
      seenIds.has(candidate.id) ||
      typeof candidate.timeSeconds !== 'number' ||
      !Number.isInteger(candidate.timeSeconds) ||
      candidate.timeSeconds < 0 ||
      typeof candidate.outPlayer !== 'string' || candidate.outPlayer.length === 0 ||
      typeof candidate.inPlayer !== 'string' || candidate.inPlayer.length === 0 ||
      candidate.outPlayer === candidate.inPlayer ||
      typeof candidate.positionRole !== 'string' || candidate.positionRole.length === 0 ||
      (candidate.status !== 'pending' && candidate.status !== 'fired' && candidate.status !== 'skipped')
    ) {
      logger.warn(
        `[${source}] Dropping invalid scheduled_sub entry on read`,
        { contextId, index: i, subId: candidate.id },
      );
      continue;
    }
    seenIds.add(candidate.id);
    valid.push(candidate as ScheduledSub);
  }
  return valid;
};

export const validateGame = (game: AppState, context?: string): void => {
  const prefix = context ? `Game ${context}: ` : '';

  // Validate required fields
  if (!game.teamName || !game.opponentName || !game.gameDate) {
    throw new ValidationError(
      `${prefix}Missing required game fields`,
      'game',
      { hasTeamName: !!game.teamName, hasOpponentName: !!game.opponentName, hasGameDate: !!game.gameDate }
    );
  }

  // Validate teamName length
  if (game.teamName.length > VALIDATION_LIMITS.TEAM_NAME_MAX) {
    throw new ValidationError(
      `${prefix}Team name cannot exceed ${VALIDATION_LIMITS.TEAM_NAME_MAX} characters (got ${game.teamName.length})`,
      'teamName',
      game.teamName
    );
  }

  // Validate opponentName length
  if (game.opponentName.length > VALIDATION_LIMITS.TEAM_NAME_MAX) {
    throw new ValidationError(
      `${prefix}Opponent name cannot exceed ${VALIDATION_LIMITS.TEAM_NAME_MAX} characters (got ${game.opponentName.length})`,
      'opponentName',
      game.opponentName
    );
  }

  // Validate gameNotes length
  if (game.gameNotes && game.gameNotes.length > VALIDATION_LIMITS.GAME_NOTES_MAX) {
    throw new ValidationError(
      `${prefix}Game notes cannot exceed ${VALIDATION_LIMITS.GAME_NOTES_MAX} characters (got ${game.gameNotes.length})`,
      'gameNotes',
      game.gameNotes
    );
  }

  // Validate ageGroup if present
  if (game.ageGroup && !AGE_GROUPS.includes(game.ageGroup)) {
    throw new ValidationError(`${prefix}Invalid age group`, 'ageGroup', game.ageGroup);
  }

  // Validate periodDurationMinutes (required for Supabase - no schema default)
  // Belt-and-suspenders: createGame provides default of 10, but validate anyway
  if (
    game.periodDurationMinutes === undefined ||
    game.periodDurationMinutes === null ||
    game.periodDurationMinutes <= 0 ||
    !Number.isFinite(game.periodDurationMinutes)
  ) {
    throw new ValidationError(
      `${prefix}periodDurationMinutes must be a positive number`,
      'periodDurationMinutes',
      game.periodDurationMinutes
    );
  }

  validateScheduledSubs(game.scheduledSubs, prefix);
};

/**
 * Validate a PlanningSession's required fields and draft shape.
 *
 * Used by both LocalDataStore and SupabaseDataStore at the save boundary
 * (CLAUDE.md Rule 14 — saveGame validation parity, applied here to plans).
 *
 * Validation scope:
 * - `name` non-empty after trim, ≤ {@link PLANNING_SESSION_NAME_MAX} chars
 * - `teamId` non-empty (every plan is team-scoped)
 * - `gameIds` non-empty array of unique non-empty strings
 * - `draft` is an object keyed only by gameIds in the gameIds array
 * - Each draft value has `startingXI` (object), `bench` (string[]), and
 *   `scheduledSubs` (validated as drafts — no `status` or `outPlayer` per
 *   `DraftScheduledSub`)
 *
 * Roster membership of player ids is NOT validated here: a saved plan
 * can outlive the roster that created it (a player removed from the team
 * would otherwise block reload), and the editor surfaces unknown ids on
 * Apply via `applyDraftToGame.unknownPlayerIds`. That's the right place
 * for the soft check.
 */
export const validatePlanningSession = (
  session: Partial<PlanningSession>,
  context?: string,
): void => {
  const prefix = context ? `PlanningSession ${context}: ` : '';

  if (!isNonEmptyString(session.name)) {
    throw new ValidationError(
      `${prefix}name must be a non-empty string`,
      'name',
      session.name,
    );
  }
  if (session.name.trim().length > PLANNING_SESSION_NAME_MAX) {
    throw new ValidationError(
      `${prefix}name cannot exceed ${PLANNING_SESSION_NAME_MAX} characters (got ${session.name.trim().length})`,
      'name',
      session.name,
    );
  }

  if (!isNonEmptyString(session.teamId)) {
    throw new ValidationError(
      `${prefix}teamId must be a non-empty string`,
      'teamId',
      session.teamId,
    );
  }

  if (typeof session.isActive !== 'boolean') {
    throw new ValidationError(
      `${prefix}isActive must be a boolean`,
      'isActive',
      session.isActive,
    );
  }

  if (!Array.isArray(session.gameIds) || session.gameIds.length === 0) {
    throw new ValidationError(
      `${prefix}gameIds must be a non-empty array`,
      'gameIds',
      session.gameIds,
    );
  }
  if (session.gameIds.length > PLANNING_SESSION_GAME_IDS_MAX) {
    throw new ValidationError(
      `${prefix}gameIds cannot exceed ${PLANNING_SESSION_GAME_IDS_MAX} entries (got ${session.gameIds.length})`,
      'gameIds',
      session.gameIds.length,
    );
  }
  const seenGameIds = new Set<string>();
  session.gameIds.forEach((gid, idx) => {
    if (!isNonEmptyString(gid)) {
      throw new ValidationError(
        `${prefix}gameIds[${idx}] must be a non-empty string`,
        `gameIds[${idx}]`,
        gid,
      );
    }
    if (seenGameIds.has(gid)) {
      throw new ValidationError(
        `${prefix}gameIds contains duplicate id "${gid}"`,
        `gameIds[${idx}]`,
        gid,
      );
    }
    seenGameIds.add(gid);
  });

  // includedGameIds: optional. When present, must be an array whose
  // entries are a subset of gameIds. Empty array is allowed and means
  // "no games included" — coach explicitly wants the dashboard to zero
  // out. NULL/undefined means "all included" (resolveIncludedGameIds).
  if (session.includedGameIds !== undefined) {
    if (!Array.isArray(session.includedGameIds)) {
      throw new ValidationError(
        `${prefix}includedGameIds must be an array when present`,
        'includedGameIds',
        session.includedGameIds,
      );
    }
    const seenIncluded = new Set<string>();
    session.includedGameIds.forEach((gid, idx) => {
      if (!isNonEmptyString(gid)) {
        throw new ValidationError(
          `${prefix}includedGameIds[${idx}] must be a non-empty string`,
          `includedGameIds[${idx}]`,
          gid,
        );
      }
      if (!seenGameIds.has(gid)) {
        throw new ValidationError(
          `${prefix}includedGameIds[${idx}] "${gid}" is not in gameIds`,
          `includedGameIds[${idx}]`,
          gid,
        );
      }
      if (seenIncluded.has(gid)) {
        throw new ValidationError(
          `${prefix}includedGameIds contains duplicate id "${gid}"`,
          `includedGameIds[${idx}]`,
          gid,
        );
      }
      seenIncluded.add(gid);
    });
    // Pass-17 Minor 3: a session with includedGameIds = ['g2'] but
    // draft = { g1: {…} } would silently produce empty minutes
    // aggregations because aggregatePlanMinutes skips gameIds with no
    // draft entry. The editor always saves drafts for every tab, so
    // this state should be unreachable through the UI; flag at the
    // save boundary so a programmatic caller (sync replay, future
    // bulk-import) can't land an inconsistent session that looks
    // valid but produces no totals.
    if (
      session.draft &&
      typeof session.draft === 'object' &&
      !Array.isArray(session.draft)
    ) {
      const draftGameIds = new Set(Object.keys(session.draft));
      for (let i = 0; i < session.includedGameIds.length; i++) {
        const gid = session.includedGameIds[i];
        if (!draftGameIds.has(gid)) {
          throw new ValidationError(
            `${prefix}includedGameIds[${i}] "${gid}" has no entry in draft — including a game with no lineup would produce empty minutes`,
            `includedGameIds[${i}]`,
            gid,
          );
        }
      }
    }
  }

  if (
    !session.draft ||
    typeof session.draft !== 'object' ||
    Array.isArray(session.draft)
  ) {
    throw new ValidationError(
      `${prefix}draft must be an object keyed by gameId`,
      'draft',
      session.draft,
    );
  }

  for (const gameId of Object.keys(session.draft)) {
    if (!seenGameIds.has(gameId)) {
      // A draft entry for a game outside gameIds is dead weight that would
      // mislead anyone inspecting the session — surface the inconsistency
      // rather than silently dropping it.
      throw new ValidationError(
        `${prefix}draft contains entry for gameId "${gameId}" not present in gameIds`,
        `draft.${gameId}`,
        gameId,
      );
    }
    const planDraft = (session.draft as Record<string, unknown>)[gameId];
    const draftPath = `draft.${gameId}`;
    if (!planDraft || typeof planDraft !== 'object' || Array.isArray(planDraft)) {
      throw new ValidationError(
        `${prefix}${draftPath} must be an object`,
        draftPath,
        planDraft,
      );
    }
    const pd = planDraft as {
      startingXI?: unknown;
      bench?: unknown;
      scheduledSubs?: unknown;
    };

    if (
      !pd.startingXI ||
      typeof pd.startingXI !== 'object' ||
      Array.isArray(pd.startingXI)
    ) {
      throw new ValidationError(
        `${prefix}${draftPath}.startingXI must be a Record<roleName, playerId>`,
        `${draftPath}.startingXI`,
        pd.startingXI,
      );
    }
    for (const [role, pid] of Object.entries(
      pd.startingXI as Record<string, unknown>,
    )) {
      // Mirrors the guard in parsePlanExport: a session arriving via
      // sync, upsert, or direct DB read bypasses planExport entirely,
      // so the same prototype-pollution defense has to live here too.
      if (role === '__proto__' || role === 'constructor' || role === 'prototype') {
        throw new ValidationError(
          `${prefix}${draftPath}.startingXI uses reserved role key "${role}"`,
          `${draftPath}.startingXI`,
          role,
        );
      }
      if (!isNonEmptyString(pid)) {
        throw new ValidationError(
          `${prefix}${draftPath}.startingXI[${role}] must be a non-empty playerId`,
          `${draftPath}.startingXI.${role}`,
          pid,
        );
      }
    }

    if (!Array.isArray(pd.bench)) {
      throw new ValidationError(
        `${prefix}${draftPath}.bench must be an array`,
        `${draftPath}.bench`,
        pd.bench,
      );
    }
    pd.bench.forEach((pid, idx) => {
      if (!isNonEmptyString(pid)) {
        throw new ValidationError(
          `${prefix}${draftPath}.bench[${idx}] must be a non-empty playerId`,
          `${draftPath}.bench[${idx}]`,
          pid,
        );
      }
    });

    // Per-draft uniqueness: a player must appear at most once across
    // startingXI ∪ bench. applyDraftToGame intentionally does not
    // dedupe playersOnField (planApply.ts contract), relying on the
    // editor preventing this at write time. Backup / sync / direct
    // upsert paths bypass the editor — without this check, a duplicate
    // would silently produce two Player entries with the same id in
    // playersOnField (Rule 3 violation downstream).
    const xiIds = Object.values(pd.startingXI as Record<string, unknown>) as string[];
    const benchIds = pd.bench as string[];
    const seenPlayerIds = new Set<string>();
    for (const id of xiIds) {
      if (seenPlayerIds.has(id)) {
        throw new ValidationError(
          `${prefix}${draftPath}.startingXI duplicates playerId "${id}"`,
          `${draftPath}.startingXI`,
          id,
        );
      }
      seenPlayerIds.add(id);
    }
    for (const id of benchIds) {
      if (seenPlayerIds.has(id)) {
        throw new ValidationError(
          `${prefix}${draftPath} player "${id}" appears in both startingXI and bench`,
          `${draftPath}.bench`,
          id,
        );
      }
      seenPlayerIds.add(id);
    }

    if (!Array.isArray(pd.scheduledSubs)) {
      throw new ValidationError(
        `${prefix}${draftPath}.scheduledSubs must be an array`,
        `${draftPath}.scheduledSubs`,
        pd.scheduledSubs,
      );
    }
    const seenSubIds = new Set<string>();
    pd.scheduledSubs.forEach((sub: unknown, idx: number) => {
      const at = `${draftPath}.scheduledSubs[${idx}]`;
      if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
        throw new ValidationError(`${prefix}${at} must be an object`, at, sub);
      }
      const s = sub as {
        id?: unknown;
        timeSeconds?: unknown;
        inPlayer?: unknown;
        positionRole?: unknown;
      };
      if (!isNonEmptyString(s.id)) {
        throw new ValidationError(
          `${prefix}${at}.id must be a non-empty string`,
          `${at}.id`,
          s.id,
        );
      }
      if (seenSubIds.has(s.id)) {
        throw new ValidationError(
          `${prefix}${at}.id "${s.id}" duplicates an earlier entry`,
          `${at}.id`,
          s.id,
        );
      }
      seenSubIds.add(s.id);
      if (
        typeof s.timeSeconds !== 'number' ||
        !Number.isInteger(s.timeSeconds) ||
        s.timeSeconds < 0
      ) {
        throw new ValidationError(
          `${prefix}${at}.timeSeconds must be a non-negative integer`,
          `${at}.timeSeconds`,
          s.timeSeconds,
        );
      }
      if (!isNonEmptyString(s.inPlayer)) {
        throw new ValidationError(
          `${prefix}${at}.inPlayer must be a non-empty playerId`,
          `${at}.inPlayer`,
          s.inPlayer,
        );
      }
      if (!isNonEmptyString(s.positionRole)) {
        throw new ValidationError(
          `${prefix}${at}.positionRole must be a non-empty role name`,
          `${at}.positionRole`,
          s.positionRole,
        );
      }
    });
  }

  // Parity check (last so per-entry shape errors take priority): every
  // gameId must have a draft entry. Without this, a partial cloud-write
  // could produce a session that loads silently empty for the missing
  // gameIds instead of surfacing the inconsistency.
  const draftKeys = new Set(Object.keys(session.draft));
  for (const gid of seenGameIds) {
    if (!draftKeys.has(gid)) {
      throw new ValidationError(
        `${prefix}draft is missing entry for gameId "${gid}" listed in gameIds`,
        `draft.${gid}`,
        gid,
      );
    }
  }
};

export { PLANNING_SESSION_NAME_MAX, PLANNING_SESSION_GAME_IDS_MAX };

/**
 * Separator for sortedGameIdsKey. NUL byte was chosen over space so
 * the key is collision-proof regardless of the gameId format —
 * sortedGameIdsKey(['a b']) and sortedGameIdsKey(['a', 'b']) would
 * collide under a space separator. The current `game_{ts}_{rand}`
 * format cannot contain NUL, and JS strings are NUL-safe (the byte
 * is just a code point, not a terminator).
 */
export const GAME_IDS_KEY_SEPARATOR = '\x00';

/**
 * Stable string key for a gameIds-set, used by `setActiveSession` to find
 * other sessions covering the *same* games regardless of array order.
 * Sorting before joining means [a, b] and [b, a] hash identically.
 *
 * Empty/whitespace strings are filtered to match the SQL canonicalization
 * in migration 036 (`WHERE g IS NOT NULL AND g <> ''`). validatePlanningSession
 * rejects empties before they ever reach this function under the normal
 * save path, so this is purely defensive against an unvalidated caller —
 * keeps LocalDataStore and SupabaseDataStore canonical-key parity even
 * if a future bug routes around validation.
 *
 * Exported here (not in a dedicated utility) because it pairs with the
 * planning-session validator and lives at the same conceptual layer.
 */
export const sortedGameIdsKey = (gameIds: readonly string[]): string =>
  [...gameIds]
    .filter((id) => typeof id === 'string' && id !== '')
    .sort()
    .join(GAME_IDS_KEY_SEPARATOR);
