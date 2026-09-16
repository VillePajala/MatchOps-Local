/**
 * What format an age group officially plays, per sport.
 *
 * SEPARATE FROM gameFormats.json ON PURPOSE. That file is the futsal formats
 * table - pitch, goal, ball, playing times - transcribed cell by cell from
 * Palloliitto's PDF, and its credibility rests on every value being in that
 * source. Football has no equivalent document: its 2027 formats are published
 * only as a slide giving player counts and birth years, so the columns that
 * file fills simply do not exist for football and must not be invented.
 *
 * What the slide DOES give is the one thing a coach needs when creating a
 * game: which format this age group plays. That is what lives here.
 *
 * ⚠️ FOOTBALL'S TABLE IS NOT IN FORCE YET. The new formats start in season
 * 2027; today a Finnish U10 football team still plays 8v8, and telling a coach
 * otherwise would be wrong rather than helpful. Each table therefore carries
 * the date it takes effect, and a lookup before that date returns null. The
 * football rules switch themselves on when the season arrives, with no release
 * needed - which is the point of storing the date rather than the answer.
 *
 * Futsal's formats are already in force (season 2026-27), so futsal answers
 * today.
 *
 * Source: "Pelimuodot jalkapallossa kaudella 2027 ja futsalissa kaudella
 * 2026-27", Suomen Palloliitto.
 * https://www.palloliitto.fi/ajankohtaista/muutoksia-lapsuus-ja-nuoruusvaiheen-pelimuotoihin
 *
 * @module officialFieldSize
 * @category Config
 */

import { ageGroupToNumber } from '@/config/gameFormats';
import type { GameType } from '@/types';

interface FormatBand {
  /** Inclusive lower bound; null means "and younger". */
  ageMin: number | null;
  /** Inclusive upper bound; null means "and older". */
  ageMax: number | null;
  /** The format, matching the app's FieldSize ids. */
  fieldSize: string;
  /** The band as the source names it, for showing a coach where this came from. */
  sourceLabel: string;
}

interface SportTable {
  /**
   * ISO date this table becomes true. A lookup before it returns null: an
   * answer that is correct next year is a wrong answer today.
   */
  effectiveFrom: string;
  bands: FormatBand[];
}

const TABLES: Record<GameType, SportTable> = {
  // Season 2027. Against today's rules this moves 5v5 up from U9 to U10 and
  // 8v8 from partly-U12 to U13, and adds 3v3/4v4 at the bottom.
  soccer: {
    effectiveFrom: '2027-01-01',
    bands: [
      { ageMin: null, ageMax: 7, fieldSize: '3v3', sourceLabel: 'P/T7 ja sitä nuoremmat' },
      { ageMin: 8, ageMax: 10, fieldSize: '5v5', sourceLabel: 'P/T8-10' },
      { ageMin: 11, ageMax: 13, fieldSize: '8v8', sourceLabel: 'P/T11-13' },
      { ageMin: 14, ageMax: null, fieldSize: '11v11', sourceLabel: 'P/T14 ja sitä vanhemmat' },
    ],
  },
  // Season 2026-27, already in force.
  futsal: {
    effectiveFrom: '2026-08-01',
    bands: [
      { ageMin: null, ageMax: 7, fieldSize: '3v3', sourceLabel: 'P/T7 ja sitä nuoremmat' },
      { ageMin: 8, ageMax: 10, fieldSize: '4v4', sourceLabel: 'P/T8-10' },
      { ageMin: 11, ageMax: null, fieldSize: '5v5', sourceLabel: 'P/T11 ja vanhemmat' },
    ],
  },
};

export interface OfficialFormat {
  fieldSize: string;
  sourceLabel: string;
}

/**
 * The official format for an age group, or null when there is no answer worth
 * giving - unknown age group, or a table that is not in force on `onDate`.
 *
 * @param ageGroup e.g. "U10"; anything that is not a U-number returns null
 * @param sport    the game's own type
 * @param onDate   the game's date (ISO). Defaults to today; passing the game's
 *                 own date means a fixture scheduled into next season gets
 *                 next season's answer.
 */
export function officialFieldSize(
  ageGroup: string | undefined,
  sport: GameType | undefined,
  onDate: string = new Date().toISOString().slice(0, 10),
): OfficialFormat | null {
  const age = ageGroupToNumber(ageGroup);
  if (age === null) return null;

  const table = TABLES[sport ?? 'soccer'];
  if (!table) return null;
  // String comparison is safe and exact for ISO dates, and avoids the
  // timezone drift a Date round-trip would introduce.
  if (onDate < table.effectiveFrom) return null;

  const band = table.bands.find(
    (b) => (b.ageMin === null || age >= b.ageMin) && (b.ageMax === null || age <= b.ageMax),
  );
  return band ? { fieldSize: band.fieldSize, sourceLabel: band.sourceLabel } : null;
}

export default officialFieldSize;
