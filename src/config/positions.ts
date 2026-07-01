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
