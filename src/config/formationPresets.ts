/**
 * Formation Preset Definitions
 *
 * Predefined formations for quick player placement on the field.
 * Organized by field size (3v3, 5v5, 8v8, 11v11).
 *
 * Position coordinates use relative values:
 * - relX: 0.0 = left edge, 1.0 = right edge, 0.5 = center
 * - relY: 0.0 = top (opponent goal), 1.0 = bottom (own goal)
 *
 * Goalkeeper is NOT included in positions - handled separately at (0.5, 0.95).
 *
 * @module formationPresets
 * @category Config
 */

import type { FieldPosition, FormationRole } from '@/utils/formations';

/**
 * Field size categories for formations
 */
export type FieldSize = '3v3' | '5v5' | '8v8' | '11v11';

/**
 * Formation preset definition
 */
export interface FormationPreset {
  /** Unique identifier (e.g., '5v5-2-2') */
  id: string;
  /** Display name (e.g., '2-2') */
  name: string;
  /** i18n key for localized name */
  labelKey: string;
  /** Field size category */
  fieldSize: FieldSize;
  /** Number of field players (excluding goalkeeper) */
  playerCount: number;
  /** Positions for field players (goalkeeper excluded) */
  positions: FieldPosition[];
  /**
   * Named roles with canonical pitch coordinates and stamina tags.
   *
   * Mirrors the standalone matchops-planner registry exactly so plans
   * round-trip through the JSON bridge without coordinate drift. Includes
   * GK at the same canonical coords. Optional only for backwards
   * compatibility with any future dynamic preset; all built-in presets
   * define this.
   */
  roles?: readonly FormationRole[];
}

// Standard margins matching formations.ts
const MARGIN = 0.15;
const TIGHT_MARGIN = 0.10;

/**
 * Stamina presets per field size (mirrors the standalone planner). GK is
 * always 'never'; the listed roles are 'preserved'; everything else is
 * 'preferred'. 5v5 deliberately has no preserved roles per the standalone
 * (all outfield positions are equal at that scale).
 */
const PRESERVED_ROLES_BY_SIZE: Record<FieldSize, ReadonlySet<string>> = {
  '3v3': new Set(['DEF']),
  '5v5': new Set<string>(),
  '8v8': new Set(['LB', 'CB', 'RB', 'CDM', 'CM', 'CAM']),
  '11v11': new Set([
    'LB', 'LCB', 'RCB', 'CB', 'RB',
    'LDM', 'RDM', 'CDM',
    'LCM', 'CM', 'RCM',
    'CAM',
  ]),
};

/** Stamp `sub` tags on a roles array (GK→never, preserved set→preserved, rest→preferred). */
function withStamina(
  fieldSize: FieldSize,
  roles: ReadonlyArray<{ name: string; relX: number; relY: number }>,
): readonly FormationRole[] {
  const preserved = PRESERVED_ROLES_BY_SIZE[fieldSize];
  return roles.map((r) => ({
    ...r,
    sub:
      r.name === 'GK'
        ? 'never'
        : preserved.has(r.name)
          ? 'preserved'
          : 'preferred',
  }));
}

/**
 * Helper to generate evenly spaced positions in a row
 */
function row(count: number, relY: number, margin: number = MARGIN): FieldPosition[] {
  if (count <= 0) return [];
  if (count === 1) return [{ relX: 0.5, relY }];

  const positions: FieldPosition[] = [];
  const usableWidth = 1 - 2 * margin;
  const spacing = usableWidth / (count - 1);

  for (let i = 0; i < count; i++) {
    positions.push({ relX: margin + i * spacing, relY });
  }
  return positions;
}

/**
 * 3v3 Formations (2 field players + GK = 3 total)
 *
 * Small-sided games for young players (U6-U8).
 */
const FORMATIONS_3V3: FormationPreset[] = [
  {
    id: '3v3-1-1',
    name: '1-1',
    labelKey: 'formations.3v3.1-1',
    fieldSize: '3v3',
    playerCount: 2,
    positions: [
      { relX: 0.5, relY: 0.70 },  // Defender
      { relX: 0.5, relY: 0.35 },  // Forward
    ],
    roles: withStamina('3v3', [
      { name: 'GK',  relX: 0.50, relY: 0.95 },
      { name: 'DEF', relX: 0.50, relY: 0.70 },
      { name: 'ST',  relX: 0.50, relY: 0.35 },
    ]),
  },
  {
    id: '3v3-2-0',
    name: '2-0',
    labelKey: 'formations.3v3.2-0',
    fieldSize: '3v3',
    playerCount: 2,
    positions: row(2, 0.55, 0.25),  // Two midfielders side by side
    roles: withStamina('3v3', [
      { name: 'GK', relX: 0.50, relY: 0.95 },
      { name: 'LM', relX: 0.25, relY: 0.55 },
      { name: 'RM', relX: 0.75, relY: 0.55 },
    ]),
  },
];

/**
 * 5v5 Formations (4 field players + GK = 5 total)
 *
 * Common in futsal and youth soccer (U8-U10).
 */
const FORMATIONS_5V5: FormationPreset[] = [
  {
    id: '5v5-2-2',
    name: '2-2',
    labelKey: 'formations.5v5.2-2',
    fieldSize: '5v5',
    playerCount: 4,
    positions: [
      ...row(2, 0.70, 0.25),  // Two defenders
      ...row(2, 0.40, 0.25),  // Two forwards
    ],
    roles: withStamina('5v5', [
      { name: 'GK', relX: 0.50, relY: 0.95 },
      { name: 'LB', relX: 0.25, relY: 0.70 },
      { name: 'RB', relX: 0.75, relY: 0.70 },
      { name: 'LF', relX: 0.25, relY: 0.40 },
      { name: 'RF', relX: 0.75, relY: 0.40 },
    ]),
  },
  {
    id: '5v5-1-2-1',
    name: '1-2-1',
    labelKey: 'formations.5v5.1-2-1',
    fieldSize: '5v5',
    playerCount: 4,
    positions: [
      { relX: 0.5, relY: 0.75 },  // Defender
      ...row(2, 0.50, 0.25),      // Two midfielders
      { relX: 0.5, relY: 0.25 },  // Forward
    ],
    roles: withStamina('5v5', [
      { name: 'GK',  relX: 0.50, relY: 0.95 },
      { name: 'DEF', relX: 0.50, relY: 0.75 },
      { name: 'LM',  relX: 0.25, relY: 0.50 },
      { name: 'RM',  relX: 0.75, relY: 0.50 },
      { name: 'ST',  relX: 0.50, relY: 0.25 },
    ]),
  },
  {
    id: '5v5-3-1',
    name: '3-1',
    labelKey: 'formations.5v5.3-1',
    fieldSize: '5v5',
    playerCount: 4,
    positions: [
      ...row(3, 0.65, MARGIN),   // Three defenders/midfielders
      { relX: 0.5, relY: 0.30 }, // Forward
    ],
    roles: withStamina('5v5', [
      { name: 'GK', relX: 0.50, relY: 0.95 },
      { name: 'LM', relX: 0.15, relY: 0.65 },
      { name: 'CM', relX: 0.50, relY: 0.65 },
      { name: 'RM', relX: 0.85, relY: 0.65 },
      { name: 'ST', relX: 0.50, relY: 0.30 },
    ]),
  },
  {
    id: '5v5-2-1-1',
    name: '2-1-1',
    labelKey: 'formations.5v5.2-1-1',
    fieldSize: '5v5',
    playerCount: 4,
    positions: [
      ...row(2, 0.70, 0.25),      // Two defenders
      { relX: 0.5, relY: 0.50 },  // One midfielder
      { relX: 0.5, relY: 0.28 },  // One forward
    ],
    roles: withStamina('5v5', [
      { name: 'GK', relX: 0.50, relY: 0.95 },
      { name: 'LB', relX: 0.25, relY: 0.70 },
      { name: 'RB', relX: 0.75, relY: 0.70 },
      { name: 'CM', relX: 0.50, relY: 0.50 },
      { name: 'ST', relX: 0.50, relY: 0.28 },
    ]),
  },
];

/**
 * 8v8 Formations (7 field players + GK = 8 total)
 *
 * Standard for U11-U12 youth soccer.
 */
const FORMATIONS_8V8: FormationPreset[] = [
  {
    id: '8v8-3-3-1',
    name: '3-3-1',
    labelKey: 'formations.8v8.3-3-1',
    fieldSize: '8v8',
    playerCount: 7,
    positions: [
      ...row(3, 0.78, MARGIN),    // Three defenders
      ...row(3, 0.55, MARGIN),    // Three midfielders
      { relX: 0.5, relY: 0.30 },  // One forward
    ],
    roles: withStamina('8v8', [
      { name: 'GK', relX: 0.50, relY: 0.95 },
      { name: 'LB', relX: 0.15, relY: 0.78 },
      { name: 'CB', relX: 0.50, relY: 0.78 },
      { name: 'RB', relX: 0.85, relY: 0.78 },
      { name: 'LM', relX: 0.15, relY: 0.55 },
      { name: 'CM', relX: 0.50, relY: 0.55 },
      { name: 'RM', relX: 0.85, relY: 0.55 },
      { name: 'ST', relX: 0.50, relY: 0.30 },
    ]),
  },
  {
    id: '8v8-2-3-2',
    name: '2-3-2',
    labelKey: 'formations.8v8.2-3-2',
    fieldSize: '8v8',
    playerCount: 7,
    positions: [
      ...row(2, 0.78, 0.25),     // Two defenders
      ...row(3, 0.55, MARGIN),   // Three midfielders
      ...row(2, 0.30, 0.25),     // Two forwards
    ],
    roles: withStamina('8v8', [
      { name: 'GK', relX: 0.50, relY: 0.95 },
      { name: 'LB', relX: 0.25, relY: 0.78 },
      { name: 'RB', relX: 0.75, relY: 0.78 },
      { name: 'LM', relX: 0.15, relY: 0.55 },
      { name: 'CM', relX: 0.50, relY: 0.55 },
      { name: 'RM', relX: 0.85, relY: 0.55 },
      { name: 'LF', relX: 0.25, relY: 0.30 },
      { name: 'RF', relX: 0.75, relY: 0.30 },
    ]),
  },
  {
    id: '8v8-3-2-2',
    name: '3-2-2',
    labelKey: 'formations.8v8.3-2-2',
    fieldSize: '8v8',
    playerCount: 7,
    positions: [
      ...row(3, 0.78, MARGIN),   // Three defenders
      ...row(2, 0.55, 0.25),     // Two midfielders
      ...row(2, 0.30, 0.25),     // Two forwards
    ],
    roles: withStamina('8v8', [
      { name: 'GK', relX: 0.50, relY: 0.95 },
      { name: 'LB', relX: 0.15, relY: 0.78 },
      { name: 'CB', relX: 0.50, relY: 0.78 },
      { name: 'RB', relX: 0.85, relY: 0.78 },
      { name: 'LM', relX: 0.25, relY: 0.55 },
      { name: 'RM', relX: 0.75, relY: 0.55 },
      { name: 'LF', relX: 0.25, relY: 0.30 },
      { name: 'RF', relX: 0.75, relY: 0.30 },
    ]),
  },
  {
    id: '8v8-2-1-2-1-1',
    name: '2-1-2-1-1',
    labelKey: 'formations.8v8.2-1-2-1-1',
    fieldSize: '8v8',
    playerCount: 7,
    positions: [
      ...row(2, 0.82, 0.25),      // Two defenders
      { relX: 0.5, relY: 0.68 },  // One defensive midfielder
      ...row(2, 0.52, 0.25),      // Two midfielders
      { relX: 0.5, relY: 0.38 },  // One attacking midfielder
      { relX: 0.5, relY: 0.24 },  // One forward
    ],
    roles: withStamina('8v8', [
      { name: 'GK',  relX: 0.50, relY: 0.95 },
      { name: 'LB',  relX: 0.25, relY: 0.82 },
      { name: 'RB',  relX: 0.75, relY: 0.82 },
      { name: 'CDM', relX: 0.50, relY: 0.68 },
      { name: 'LM',  relX: 0.25, relY: 0.52 },
      { name: 'RM',  relX: 0.75, relY: 0.52 },
      { name: 'CAM', relX: 0.50, relY: 0.38 },
      { name: 'ST',  relX: 0.50, relY: 0.24 },
    ]),
  },
];

/**
 * 11v11 Formations (10 field players + GK = 11 total)
 *
 * Full-size soccer for U13+ and adults.
 */
const FORMATIONS_11V11: FormationPreset[] = [
  {
    id: '11v11-4-3-3',
    name: '4-3-3',
    labelKey: 'formations.11v11.4-3-3',
    fieldSize: '11v11',
    playerCount: 10,
    // Midfielders/forwards aligned to the role coords below so `roleForCoord`
    // resolves players at the formation slots without exceeding tolerance.
    positions: [
      ...row(4, 0.80, TIGHT_MARGIN),  // Four defenders (matches LB/LCB/RCB/RB)
      { relX: 0.20, relY: 0.55 },     // LCM
      { relX: 0.50, relY: 0.55 },     // CM
      { relX: 0.80, relY: 0.55 },     // RCM
      { relX: 0.15, relY: 0.30 },     // LW
      { relX: 0.50, relY: 0.30 },     // ST
      { relX: 0.85, relY: 0.30 },     // RW
    ],
    roles: withStamina('11v11', [
      { name: 'GK',  relX: 0.50, relY: 0.95 },
      { name: 'LB',  relX: 0.10, relY: 0.80 },
      { name: 'LCB', relX: 0.37, relY: 0.80 },
      { name: 'RCB', relX: 0.63, relY: 0.80 },
      { name: 'RB',  relX: 0.90, relY: 0.80 },
      { name: 'LCM', relX: 0.20, relY: 0.55 },
      { name: 'CM',  relX: 0.50, relY: 0.55 },
      { name: 'RCM', relX: 0.80, relY: 0.55 },
      { name: 'LW',  relX: 0.15, relY: 0.30 },
      { name: 'ST',  relX: 0.50, relY: 0.30 },
      { name: 'RW',  relX: 0.85, relY: 0.30 },
    ]),
  },
  {
    id: '11v11-4-4-2',
    name: '4-4-2',
    labelKey: 'formations.11v11.4-4-2',
    fieldSize: '11v11',
    playerCount: 10,
    positions: [
      ...row(4, 0.80, TIGHT_MARGIN),  // Four defenders
      ...row(4, 0.55, TIGHT_MARGIN),  // Four midfielders
      ...row(2, 0.30, 0.30),          // Two forwards
    ],
    roles: withStamina('11v11', [
      { name: 'GK',  relX: 0.50, relY: 0.95 },
      { name: 'LB',  relX: 0.10, relY: 0.80 },
      { name: 'LCB', relX: 0.37, relY: 0.80 },
      { name: 'RCB', relX: 0.63, relY: 0.80 },
      { name: 'RB',  relX: 0.90, relY: 0.80 },
      { name: 'LM',  relX: 0.10, relY: 0.55 },
      { name: 'LCM', relX: 0.37, relY: 0.55 },
      { name: 'RCM', relX: 0.63, relY: 0.55 },
      { name: 'RM',  relX: 0.90, relY: 0.55 },
      { name: 'LF',  relX: 0.30, relY: 0.30 },
      { name: 'RF',  relX: 0.70, relY: 0.30 },
    ]),
  },
  {
    id: '11v11-3-5-2',
    name: '3-5-2',
    labelKey: 'formations.11v11.3-5-2',
    fieldSize: '11v11',
    playerCount: 10,
    positions: [
      ...row(3, 0.80, MARGIN),        // Three defenders
      ...row(5, 0.55, TIGHT_MARGIN),  // Five midfielders
      ...row(2, 0.30, 0.30),          // Two forwards
    ],
    roles: withStamina('11v11', [
      { name: 'GK',  relX: 0.50, relY: 0.95 },
      { name: 'LB',  relX: 0.15, relY: 0.80 },
      { name: 'CB',  relX: 0.50, relY: 0.80 },
      { name: 'RB',  relX: 0.85, relY: 0.80 },
      { name: 'LWB', relX: 0.10, relY: 0.55 },
      { name: 'LCM', relX: 0.30, relY: 0.55 },
      { name: 'CM',  relX: 0.50, relY: 0.55 },
      { name: 'RCM', relX: 0.70, relY: 0.55 },
      { name: 'RWB', relX: 0.90, relY: 0.55 },
      { name: 'LF',  relX: 0.30, relY: 0.30 },
      { name: 'RF',  relX: 0.70, relY: 0.30 },
    ]),
  },
  {
    id: '11v11-4-2-3-1',
    name: '4-2-3-1',
    labelKey: 'formations.11v11.4-2-3-1',
    fieldSize: '11v11',
    playerCount: 10,
    // DMs and attacking mids aligned to the role coords below.
    positions: [
      ...row(4, 0.82, TIGHT_MARGIN),  // Four defenders (LB/LCB/RCB/RB)
      { relX: 0.35, relY: 0.65 },     // LDM
      { relX: 0.65, relY: 0.65 },     // RDM
      { relX: 0.20, relY: 0.45 },     // LAM
      { relX: 0.50, relY: 0.45 },     // CAM
      { relX: 0.80, relY: 0.45 },     // RAM
      { relX: 0.50, relY: 0.25 },     // ST
    ],
    roles: withStamina('11v11', [
      { name: 'GK',  relX: 0.50, relY: 0.95 },
      { name: 'LB',  relX: 0.10, relY: 0.82 },
      { name: 'LCB', relX: 0.37, relY: 0.82 },
      { name: 'RCB', relX: 0.63, relY: 0.82 },
      { name: 'RB',  relX: 0.90, relY: 0.82 },
      { name: 'LDM', relX: 0.35, relY: 0.65 },
      { name: 'RDM', relX: 0.65, relY: 0.65 },
      { name: 'LAM', relX: 0.20, relY: 0.45 },
      { name: 'CAM', relX: 0.50, relY: 0.45 },
      { name: 'RAM', relX: 0.80, relY: 0.45 },
      { name: 'ST',  relX: 0.50, relY: 0.25 },
    ]),
  },
];

/**
 * All formation presets
 */
export const FORMATION_PRESETS: FormationPreset[] = [
  ...FORMATIONS_3V3,
  ...FORMATIONS_5V5,
  ...FORMATIONS_8V8,
  ...FORMATIONS_11V11,
];

/**
 * Get presets for a specific field size
 */
export function getPresetsForFieldSize(fieldSize: FieldSize): FormationPreset[] {
  return FORMATION_PRESETS.filter(preset => preset.fieldSize === fieldSize);
}

/**
 * Get a preset by its ID
 */
export function getPresetById(id: string): FormationPreset | undefined {
  return FORMATION_PRESETS.find(preset => preset.id === id);
}

/**
 * Get the recommended field size based on player count.
 * Returns the largest formation that can be filled with the available players.
 */
export function getRecommendedFieldSize(playerCount: number): FieldSize {
  if (playerCount >= 11) return '11v11';
  if (playerCount >= 8) return '8v8';
  if (playerCount >= 5) return '5v5';
  return '3v3';
}

/**
 * Get all field sizes in order
 */
export const FIELD_SIZES: FieldSize[] = ['3v3', '5v5', '8v8', '11v11'];

/**
 * Presets grouped by field size (pre-computed for performance)
 */
export const PRESETS_BY_SIZE: Record<FieldSize, FormationPreset[]> = FIELD_SIZES.reduce(
  (acc, size) => {
    acc[size] = FORMATION_PRESETS.filter(p => p.fieldSize === size);
    return acc;
  },
  {} as Record<FieldSize, FormationPreset[]>
);
