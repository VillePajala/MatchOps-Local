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

export interface League {
  id: string;
  name: string;
  isCustom?: boolean;
}

/**
 * ID for the custom league option ("Muu").
 * Use this constant instead of hardcoding 'muu' for type safety and easier refactoring.
 */
export const CUSTOM_LEAGUE_ID = 'muu';

export const FINNISH_YOUTH_LEAGUES: League[] = [
  // Valtakunnalliset (National) - 5 levels
  { id: 'sm-sarja', name: 'Valtakunnallinen SM-sarja' },
  { id: 'sm-karsinta', name: 'Valtakunnallinen SM-karsintasarja' },
  { id: 'valtakunnallinen-1', name: 'Valtakunnallinen Ykkönen' },
  { id: 'valtakunnallinen-2', name: 'Valtakunnallinen Kakkonen' },
  { id: 'valtakunnallinen-3', name: 'Valtakunnallinen Kolmonen' },

  // Aluesarjat (Regional) - 4 regions × 3 levels = 12
  { id: 'aluesarja-1-etela', name: 'Aluesarja taso 1 – Etelä' },
  { id: 'aluesarja-1-lansi', name: 'Aluesarja taso 1 – Länsi' },
  { id: 'aluesarja-1-ita', name: 'Aluesarja taso 1 – Itä' },
  { id: 'aluesarja-1-pohjoinen', name: 'Aluesarja taso 1 – Pohjoinen' },
  { id: 'aluesarja-2-etela', name: 'Aluesarja taso 2 – Etelä' },
  { id: 'aluesarja-2-lansi', name: 'Aluesarja taso 2 – Länsi' },
  { id: 'aluesarja-2-ita', name: 'Aluesarja taso 2 – Itä' },
  { id: 'aluesarja-2-pohjoinen', name: 'Aluesarja taso 2 – Pohjoinen' },
  { id: 'aluesarja-3-etela', name: 'Aluesarja taso 3 – Etelä' },
  { id: 'aluesarja-3-lansi', name: 'Aluesarja taso 3 – Länsi' },
  { id: 'aluesarja-3-ita', name: 'Aluesarja taso 3 – Itä' },
  { id: 'aluesarja-3-pohjoinen', name: 'Aluesarja taso 3 – Pohjoinen' },

  // Paikallissarjat (Local) - 4 regions × 3 levels = 12
  { id: 'paikallissarja-1-etela', name: 'Paikallissarja taso 1 – Etelä' },
  { id: 'paikallissarja-1-lansi', name: 'Paikallissarja taso 1 – Länsi' },
  { id: 'paikallissarja-1-ita', name: 'Paikallissarja taso 1 – Itä' },
  { id: 'paikallissarja-1-pohjoinen', name: 'Paikallissarja taso 1 – Pohjoinen' },
  { id: 'paikallissarja-2-etela', name: 'Paikallissarja taso 2 – Etelä' },
  { id: 'paikallissarja-2-lansi', name: 'Paikallissarja taso 2 – Länsi' },
  { id: 'paikallissarja-2-ita', name: 'Paikallissarja taso 2 – Itä' },
  { id: 'paikallissarja-2-pohjoinen', name: 'Paikallissarja taso 2 – Pohjoinen' },
  { id: 'paikallissarja-3-etela', name: 'Paikallissarja taso 3 – Etelä' },
  { id: 'paikallissarja-3-lansi', name: 'Paikallissarja taso 3 – Länsi' },
  { id: 'paikallissarja-3-ita', name: 'Paikallissarja taso 3 – Itä' },
  { id: 'paikallissarja-3-pohjoinen', name: 'Paikallissarja taso 3 – Pohjoinen' },

  // Muut (Other) - 4
  { id: 'harrastesarja', name: 'Harrastesarja (Palloliitto)' },
  { id: 'seuran-harrasteliiga', name: 'Seuran oma harrasteliiga' },
  { id: 'koulusarja', name: 'Koulusarja / Koululiiga' },
  { id: 'miniliiga', name: 'Seuran oma pelitapahtuma / Miniliiga' },

  // Custom option - always last
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
