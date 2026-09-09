/**
 * Official Palloliitto game formats.
 *
 * The data lives in gameFormats.json, transcribed from Palloliitto's one-page
 * "viralliset pelimuodot" table. It answers the question the rule links never
 * could: what applies to THIS age group - players, pitch, goal, ball, periods.
 *
 * The critical caveat, repeated here because it decides how this may be shown:
 * these are NATIONAL DEFAULTS for an age group. A series is allowed to deviate,
 * and a series' own rules live in Palloliitto's results service behind an API
 * key this app does not have. So every surface must present this as the
 * national default, never as "your rules" - otherwise the app states a period
 * length with confidence and is wrong for anyone whose league differs.
 *
 * @module gameFormats
 * @category Config
 */

import raw from '@/config/gameFormats.json';

export interface GameFormatPlayingTime {
  periods: number;
  minutes: number;
  /** 'running' = suora (clock runs on), 'stopped' = tehokas (clock stops). */
  clock: 'running' | 'stopped';
}

export interface GameFormat {
  /** Inclusive lower bound of the age band; null means "and younger". */
  ageMin: number | null;
  /** Inclusive upper bound; null means "and older". */
  ageMax: number | null;
  /** The band exactly as the source names it, e.g. "P/T 8-9". */
  sourceLabel: string;
  fieldSize: string;
  playersNote: string | null;
  field: string;
  goal: string;
  goalNote: string | null;
  ball: string;
  ballNote: string | null;
  /** The playing time verbatim, including the alternatives in brackets. */
  playingTimeText: string;
  /** Structured only where the source states one primary time; null otherwise. */
  playingTime: GameFormatPlayingTime | null;
  notes: string[];
}

export interface GameFormatsSource {
  sport: string;
  season: string;
  title: string;
  url: string;
  sha256: string;
  extractedOn: string;
}

export const GAME_FORMATS_SOURCE: GameFormatsSource = raw.source;
export const GAME_FORMATS_GENERAL_NOTES: string[] = raw.generalNotes;
export const GAME_FORMATS: GameFormat[] = raw.formats as GameFormat[];

/**
 * Parse an app age group ("U10") into its number. Returns null for anything
 * that is not a U-number, so an unknown value falls through to "no match"
 * rather than silently landing on the youngest band.
 */
export function ageGroupToNumber(ageGroup: string | undefined): number | null {
  if (!ageGroup) return null;
  const m = /^U(\d{1,2})$/i.exec(ageGroup.trim());
  return m ? Number(m[1]) : null;
}

/**
 * The format band for an age, or null when the age is unknown.
 *
 * Bands are half-open at the ends by design ("7 and younger", "17 and older"),
 * which is how the source writes them.
 */
export function findFormatForAge(age: number | null): GameFormat | null {
  if (age === null || Number.isNaN(age)) return null;
  return (
    GAME_FORMATS.find(
      (f) => (f.ageMin === null || age >= f.ageMin) && (f.ageMax === null || age <= f.ageMax),
    ) ?? null
  );
}

/** Convenience: the band for an app age group string such as "U10". */
export function findFormatForAgeGroup(ageGroup: string | undefined): GameFormat | null {
  return findFormatForAge(ageGroupToNumber(ageGroup));
}
