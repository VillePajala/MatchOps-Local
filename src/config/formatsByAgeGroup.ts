/**
 * Suggested match format and period length for an age group - the single
 * table the onboarding wizard and the new-game defaults read.
 *
 * WHAT THIS IS: a SUGGESTION for a coach who has told us only their sport and
 * age group. Every format stays selectable everywhere it is offered; nothing
 * here is enforced, and a coach's own choice (or a previous game) always wins
 * over it.
 *
 * WHY A SEPARATE MODULE FROM officialFieldSize: that module answers "is the
 * game the coach set up the official one?" and is deliberately silent for
 * football until season 2027 starts (a U10 team still plays 8v8 under the old
 * rules, and telling them otherwise in a warning would be wrong). A suggestion
 * for a coach setting up a NEW team has a different job: the team will play
 * the coming season, and the coming football season IS 2027. So this table
 * uses the 2027 football formats without a date gate (owner decision,
 * Onboarding v3).
 *
 * SOURCES
 * - Football formats (season 2027): Suomen Palloliitto, "Pelimuodot
 *   jalkapallossa kaudella 2027 ja futsalissa kaudella 2026-27"
 *   https://www.palloliitto.fi/ajankohtaista/muutoksia-lapsuus-ja-nuoruusvaiheen-pelimuotoihin
 *   P/T7 and younger 3v3 or 4v4 (we suggest 4v4 and keep 3v3 as the
 *   alternative; owner decision), P/T8-10 5v5, P/T11-13 8v8, then 11v11.
 *   The source gives no playing times for football, so football periods use
 *   the default below.
 * - Futsal formats AND playing times (season 2026-27): Palloliitto's official
 *   table, already transcribed cell by cell in `gameFormats.json` (see
 *   `gameFormats.ts` and `gameFormats.source.txt`). This module READS that
 *   table instead of copying it, so futsal has one source of truth.
 * - Default period length when the table does not know (no age group, football,
 *   or a futsal band with no single primary time): 2 x 15 min (decision D7 of
 *   the onboarding plan). Always shown to the coach with "muuta" (change).
 *
 * @module formatsByAgeGroup
 * @category Config
 */

import { ageGroupToNumber, findFormatForAge } from '@/config/gameFormats';
import { FIELD_SIZES, type FieldSize } from '@/config/formationPresets';
import type { GameType } from '@/types';

/** Periods + minutes per period. */
export interface PeriodSuggestion {
  numberOfPeriods: 1 | 2;
  periodMinutes: number;
  /** 'table' = from a published source; 'default' = the 2 x 15 fallback. */
  source: 'table' | 'default';
}

/** The full suggestion for one sport + age group. */
export interface FormatSuggestion extends PeriodSuggestion {
  /** The one format to preselect. */
  fieldSize: FieldSize;
  /** Other formats the source names for the same band (may be empty). */
  alternatives: FieldSize[];
  /** The band as the source names it, for "why this suggestion". */
  sourceLabel: string;
}

/** D7: the period length used whenever the table has no answer. */
export const DEFAULT_PERIODS: PeriodSuggestion = {
  numberOfPeriods: 2,
  periodMinutes: 15,
  source: 'default',
};

interface FootballBand {
  ageMin: number | null;
  ageMax: number | null;
  fieldSize: FieldSize;
  alternatives: FieldSize[];
  sourceLabel: string;
}

/** Football, season 2027 (see SOURCES above). */
const FOOTBALL_2027: readonly FootballBand[] = [
  { ageMin: null, ageMax: 7, fieldSize: '4v4', alternatives: ['3v3'], sourceLabel: 'P/T7 ja nuoremmat' },
  { ageMin: 8, ageMax: 10, fieldSize: '5v5', alternatives: [], sourceLabel: 'P/T8-10' },
  { ageMin: 11, ageMax: 13, fieldSize: '8v8', alternatives: [], sourceLabel: 'P/T11-13' },
  { ageMin: 14, ageMax: null, fieldSize: '11v11', alternatives: [], sourceLabel: 'P/T14 ja vanhemmat' },
];

const inBand = (age: number, b: { ageMin: number | null; ageMax: number | null }): boolean =>
  (b.ageMin === null || age >= b.ageMin) && (b.ageMax === null || age <= b.ageMax);

const asFieldSize = (value: string | undefined): FieldSize | null =>
  value && (FIELD_SIZES as string[]).includes(value) ? (value as FieldSize) : null;

/**
 * The suggested format and period length for an age group, or null when the
 * age group is unknown (empty, or not a "U<n>" value). Callers then keep their
 * own default format and use `DEFAULT_PERIODS`.
 *
 * @param ageGroup e.g. "U10"
 * @param sport    'soccer' (football) or 'futsal'; undefined = football
 */
export function suggestFormatForAgeGroup(
  ageGroup: string | undefined,
  sport: GameType | undefined,
): FormatSuggestion | null {
  const age = ageGroupToNumber(ageGroup);
  if (age === null) return null;

  if (sport === 'futsal') {
    const band = findFormatForAge(age);
    const fieldSize = asFieldSize(band?.fieldSize);
    if (!band || !fieldSize) return null;
    const time = band.playingTime;
    const periods: PeriodSuggestion =
      time && (time.periods === 1 || time.periods === 2) && time.minutes > 0
        ? { numberOfPeriods: time.periods === 1 ? 1 : 2, periodMinutes: time.minutes, source: 'table' }
        : DEFAULT_PERIODS;
    return { fieldSize, alternatives: [], sourceLabel: band.sourceLabel, ...periods };
  }

  const band = FOOTBALL_2027.find((b) => inBand(age, b));
  if (!band) return null;
  return {
    fieldSize: band.fieldSize,
    alternatives: [...band.alternatives],
    sourceLabel: band.sourceLabel,
    ...DEFAULT_PERIODS,
  };
}

/**
 * Period length only: the table's value where it knows the age group, else the
 * 2 x 15 default. Never null, so a caller always has something to show.
 */
export function suggestPeriodsForAgeGroup(
  ageGroup: string | undefined,
  sport: GameType | undefined,
): PeriodSuggestion {
  const s = suggestFormatForAgeGroup(ageGroup, sport);
  return s
    ? { numberOfPeriods: s.numberOfPeriods, periodMinutes: s.periodMinutes, source: s.source }
    : DEFAULT_PERIODS;
}
