/**
 * Finnish youth football league hierarchy.
 * Based on Palloliitto competition structure.
 *
 * @remarks
 * - 5 National (Valtakunnallinen) leagues
 * - 12 Regional (Aluesarja) leagues (4 regions × 3 levels)
 * - 12 Local (Paikallissarja) leagues (4 regions × 3 levels)
 * - 4 Other league types
 * - 1 Custom option ("Muu")
 * Total: 34 leagues
 */

/** Geographic area for regional/local leagues */
export type LeagueArea = 'etela' | 'lansi' | 'ita' | 'pohjoinen';

/** Competition level category */
export type LeagueLevel = 'national' | 'regional' | 'local' | 'other';

export interface League {
  id: string;
  name: string;
  area?: LeagueArea;
  level?: LeagueLevel;
  isCustom?: boolean;
}

/** Filter options for area dropdown (includes 'all') */
export const LEAGUE_AREA_FILTERS = [
  { id: 'all' as const, labelKey: 'leagues.areas.all' },
  { id: 'etela' as const, labelKey: 'leagues.areas.etela' },
  { id: 'lansi' as const, labelKey: 'leagues.areas.lansi' },
  { id: 'ita' as const, labelKey: 'leagues.areas.ita' },
  { id: 'pohjoinen' as const, labelKey: 'leagues.areas.pohjoinen' },
];

/** Filter options for level dropdown (includes 'all') */
export const LEAGUE_LEVEL_FILTERS = [
  { id: 'all' as const, labelKey: 'leagues.levels.all' },
  { id: 'national' as const, labelKey: 'leagues.levels.national' },
  { id: 'regional' as const, labelKey: 'leagues.levels.regional' },
  { id: 'local' as const, labelKey: 'leagues.levels.local' },
  { id: 'other' as const, labelKey: 'leagues.levels.other' },
];

export type LeagueAreaFilter = (typeof LEAGUE_AREA_FILTERS)[number]['id'];
export type LeagueLevelFilter = (typeof LEAGUE_LEVEL_FILTERS)[number]['id'];

/**
 * ID for the custom league option ("Muu").
 * Use this constant instead of hardcoding 'muu' for type safety and easier refactoring.
 */
export const CUSTOM_LEAGUE_ID = 'muu';

export const FINNISH_YOUTH_LEAGUES: League[] = [
  // Valtakunnalliset (National) - 5 levels
  { id: 'sm-sarja', name: 'Valtakunnallinen SM-sarja', level: 'national' },
  { id: 'sm-karsinta', name: 'Valtakunnallinen SM-karsintasarja', level: 'national' },
  { id: 'valtakunnallinen-1', name: 'Valtakunnallinen Ykkönen', level: 'national' },
  { id: 'valtakunnallinen-2', name: 'Valtakunnallinen Kakkonen', level: 'national' },
  { id: 'valtakunnallinen-3', name: 'Valtakunnallinen Kolmonen', level: 'national' },

  // Aluesarjat (Regional) - 4 regions × 3 levels = 12
  { id: 'aluesarja-1-etela', name: 'Aluesarja taso 1 – Etelä', level: 'regional', area: 'etela' },
  { id: 'aluesarja-1-lansi', name: 'Aluesarja taso 1 – Länsi', level: 'regional', area: 'lansi' },
  { id: 'aluesarja-1-ita', name: 'Aluesarja taso 1 – Itä', level: 'regional', area: 'ita' },
  { id: 'aluesarja-1-pohjoinen', name: 'Aluesarja taso 1 – Pohjoinen', level: 'regional', area: 'pohjoinen' },
  { id: 'aluesarja-2-etela', name: 'Aluesarja taso 2 – Etelä', level: 'regional', area: 'etela' },
  { id: 'aluesarja-2-lansi', name: 'Aluesarja taso 2 – Länsi', level: 'regional', area: 'lansi' },
  { id: 'aluesarja-2-ita', name: 'Aluesarja taso 2 – Itä', level: 'regional', area: 'ita' },
  { id: 'aluesarja-2-pohjoinen', name: 'Aluesarja taso 2 – Pohjoinen', level: 'regional', area: 'pohjoinen' },
  { id: 'aluesarja-3-etela', name: 'Aluesarja taso 3 – Etelä', level: 'regional', area: 'etela' },
  { id: 'aluesarja-3-lansi', name: 'Aluesarja taso 3 – Länsi', level: 'regional', area: 'lansi' },
  { id: 'aluesarja-3-ita', name: 'Aluesarja taso 3 – Itä', level: 'regional', area: 'ita' },
  { id: 'aluesarja-3-pohjoinen', name: 'Aluesarja taso 3 – Pohjoinen', level: 'regional', area: 'pohjoinen' },

  // Paikallissarjat (Local) - 4 regions × 3 levels = 12
  { id: 'paikallissarja-1-etela', name: 'Paikallissarja taso 1 – Etelä', level: 'local', area: 'etela' },
  { id: 'paikallissarja-1-lansi', name: 'Paikallissarja taso 1 – Länsi', level: 'local', area: 'lansi' },
  { id: 'paikallissarja-1-ita', name: 'Paikallissarja taso 1 – Itä', level: 'local', area: 'ita' },
  { id: 'paikallissarja-1-pohjoinen', name: 'Paikallissarja taso 1 – Pohjoinen', level: 'local', area: 'pohjoinen' },
  { id: 'paikallissarja-2-etela', name: 'Paikallissarja taso 2 – Etelä', level: 'local', area: 'etela' },
  { id: 'paikallissarja-2-lansi', name: 'Paikallissarja taso 2 – Länsi', level: 'local', area: 'lansi' },
  { id: 'paikallissarja-2-ita', name: 'Paikallissarja taso 2 – Itä', level: 'local', area: 'ita' },
  { id: 'paikallissarja-2-pohjoinen', name: 'Paikallissarja taso 2 – Pohjoinen', level: 'local', area: 'pohjoinen' },
  { id: 'paikallissarja-3-etela', name: 'Paikallissarja taso 3 – Etelä', level: 'local', area: 'etela' },
  { id: 'paikallissarja-3-lansi', name: 'Paikallissarja taso 3 – Länsi', level: 'local', area: 'lansi' },
  { id: 'paikallissarja-3-ita', name: 'Paikallissarja taso 3 – Itä', level: 'local', area: 'ita' },
  { id: 'paikallissarja-3-pohjoinen', name: 'Paikallissarja taso 3 – Pohjoinen', level: 'local', area: 'pohjoinen' },

  // Muut (Other) - 4
  { id: 'harrastesarja', name: 'Harrastesarja (Palloliitto)', level: 'other' },
  { id: 'seuran-harrasteliiga', name: 'Seuran oma harrasteliiga', level: 'other' },
  { id: 'koulusarja', name: 'Koulusarja / Koululiiga', level: 'other' },
  { id: 'miniliiga', name: 'Seuran oma pelitapahtuma / Miniliiga', level: 'other' },

  // Custom option - always last (no level/area - always shown)
  { id: CUSTOM_LEAGUE_ID, name: 'Muu (vapaa kuvaus)', isCustom: true },
];

/**
 * Get a league by its ID.
 * @param id - The league ID to look up
 * @returns The league object or undefined if not found
 */
export function getLeagueById(id: string): League | undefined {
  return FINNISH_YOUTH_LEAGUES.find(l => l.id === id);
}

/**
 * Check if a league ID is valid (exists in FINNISH_YOUTH_LEAGUES).
 * @param id - The league ID to validate
 * @returns True if the ID is valid, false otherwise
 */
export function isValidLeagueId(id: string | undefined): boolean {
  if (!id) return false;
  return FINNISH_YOUTH_LEAGUES.some(l => l.id === id);
}

/**
 * Get the display name for a league ID.
 * @param id - The league ID to look up
 * @returns The league name, the ID as fallback for unknown IDs, or empty string for undefined/empty
 * @remarks Returns the raw ID as fallback for unknown IDs (e.g., corrupted data) to aid debugging
 */
export function getLeagueName(id: string | undefined): string {
  if (!id) return '';
  const league = getLeagueById(id);
  return league?.name ?? id;
}
