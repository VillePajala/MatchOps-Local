/**
 * Playing positions - single source of truth (mirrors assessmentMetrics.ts).
 *
 * A flat, freely-assignable list: any position can be assigned to any player,
 * independent of the match formation (post-game the coach records where each
 * player actually played). Positions are sport-aware (soccer / futsal) and
 * ordered back-to-front so both the editor chips and the recap read GK-first.
 *
 * Labels + short abbreviations live in i18n (`positions.<id>.label` /
 * `positions.<id>.abbrev`) so display stays localisable; storage uses the id.
 */

import type { GameType } from '@/types/game';

export type PositionCategory = 'gk' | 'def' | 'mid' | 'att';

export interface PositionDef {
  id: string;
  category: PositionCategory;
  /** Which sports this position applies to. */
  sports: GameType[];
}

// Ordered back-to-front (GK first). Soccer is the detailed 11-a-side set (works
// for smaller sides too); futsal uses its own compact set.
export const POSITIONS: readonly PositionDef[] = [
  // Goalkeeper (both sports)
  { id: 'gk', category: 'gk', sports: ['soccer', 'futsal'] },
  // Soccer defenders
  { id: 'rb', category: 'def', sports: ['soccer'] },
  { id: 'cb', category: 'def', sports: ['soccer'] },
  { id: 'lb', category: 'def', sports: ['soccer'] },
  { id: 'rwb', category: 'def', sports: ['soccer'] },
  { id: 'lwb', category: 'def', sports: ['soccer'] },
  // Soccer midfielders
  { id: 'cdm', category: 'mid', sports: ['soccer'] },
  { id: 'cm', category: 'mid', sports: ['soccer'] },
  { id: 'cam', category: 'mid', sports: ['soccer'] },
  { id: 'rm', category: 'mid', sports: ['soccer'] },
  { id: 'lm', category: 'mid', sports: ['soccer'] },
  // Soccer attackers
  { id: 'rw', category: 'att', sports: ['soccer'] },
  { id: 'lw', category: 'att', sports: ['soccer'] },
  { id: 'st', category: 'att', sports: ['soccer'] },
  // Futsal outfield
  { id: 'fixo', category: 'def', sports: ['futsal'] },
  { id: 'ala', category: 'mid', sports: ['futsal'] },
  { id: 'pivo', category: 'att', sports: ['futsal'] },
];

/** All position ids (for i18n coverage / validation). */
export const POSITION_IDS: readonly string[] = POSITIONS.map(p => p.id);

/** id -> category, for colour-coding the chips by pitch line. */
export const POSITION_CATEGORY: Record<string, PositionCategory> = Object.fromEntries(
  POSITIONS.map(p => [p.id, p.category]),
);

/**
 * Match format. Soccer sizes scope the position palette so a 5v5 game does not
 * show all 14 eleven-a-side positions; the coach can widen it via the selector.
 * Futsal is its own set. `all` is the manual override - the entire library
 * (every position, both sports), ignoring the size and sport automation.
 */
export type PositionFormat = '5v5' | '7v7' | '9v9' | '11v11' | 'futsal' | 'all';

export const SOCCER_FORMATS: readonly PositionFormat[] = ['5v5', '7v7', '9v9', '11v11'];

// Position palette per format (back-to-front). Bigger formats add width + more
// specialised roles; `all` is every position - the escape hatch from all the
// automatic scoping.
export const POSITION_FORMATS: Record<PositionFormat, readonly string[]> = {
  '5v5': ['gk', 'lb', 'cb', 'rb', 'cm', 'st'],
  '7v7': ['gk', 'lb', 'cb', 'rb', 'lm', 'cm', 'rm', 'st'],
  '9v9': ['gk', 'lb', 'cb', 'rb', 'cdm', 'cm', 'cam', 'lw', 'rw', 'st'],
  '11v11': ['gk', 'rb', 'cb', 'lb', 'rwb', 'lwb', 'cdm', 'cm', 'cam', 'rm', 'lm', 'rw', 'lw', 'st'],
  'futsal': ['gk', 'fixo', 'ala', 'pivo'],
  'all': POSITION_IDS,
};

/**
 * English fallbacks for the i18n abbreviation/label keys, so `t(key, fallback)`
 * still renders sensibly if a translation is missing. The abbreviations are the
 * compact codes shown on chips and in the recap.
 */
export const POSITION_ABBREV_FALLBACK: Record<string, string> = {
  gk: 'GK', rb: 'RB', cb: 'CB', lb: 'LB', rwb: 'RWB', lwb: 'LWB',
  cdm: 'CDM', cm: 'CM', cam: 'CAM', rm: 'RM', lm: 'LM',
  rw: 'RW', lw: 'LW', st: 'ST',
  fixo: 'FIXO', ala: 'ALA', pivo: 'PIVO',
};

export const POSITION_LABEL_FALLBACK: Record<string, string> = {
  gk: 'Goalkeeper', rb: 'Right back', cb: 'Centre back', lb: 'Left back',
  rwb: 'Right wing-back', lwb: 'Left wing-back',
  cdm: 'Defensive mid', cm: 'Central mid', cam: 'Attacking mid',
  rm: 'Right mid', lm: 'Left mid',
  rw: 'Right wing', lw: 'Left wing', st: 'Striker',
  fixo: 'Fixo (defender)', ala: 'Ala (winger)', pivo: 'Pivot',
};

/**
 * Positions for a given sport, in back-to-front order. Legacy games without a
 * gameType are treated as soccer.
 */
export function positionsForSport(gameType: GameType | undefined): PositionDef[] {
  const sport: GameType = gameType ?? 'soccer';
  return POSITIONS.filter(p => p.sports.includes(sport));
}

/** Sort a set of position ids into the canonical back-to-front order. */
export function orderPositionIds(ids: readonly string[]): string[] {
  const rank = new Map(POSITION_IDS.map((id, i) => [id, i]));
  return [...ids].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
}

/** The ordered position defs for a match format. */
export function positionsForFormat(format: PositionFormat): PositionDef[] {
  const byId = new Map(POSITIONS.map(p => [p.id, p]));
  return (POSITION_FORMATS[format] ?? []).map(id => byId.get(id)).filter((p): p is PositionDef => !!p);
}

/**
 * Best-effort default format. Futsal games are futsal; otherwise guess from the
 * squad size (it includes subs, so this is a starting point the coach overrides
 * with the selector, not a hard rule).
 */
export function inferFormat(gameType: GameType | undefined, squadSize: number): PositionFormat {
  if (gameType === 'futsal') return 'futsal';
  if (squadSize > 0 && squadSize <= 8) return '5v5';
  if (squadSize <= 11) return '7v7';
  if (squadSize <= 13) return '9v9';
  return '11v11';
}
