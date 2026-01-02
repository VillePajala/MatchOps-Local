/**
 * Unit tests for formation presets configuration
 *
 * Validates the structure and correctness of predefined formations.
 */

import {
  FORMATION_PRESETS,
  FIELD_SIZES,
  getPresetsForFieldSize,
  getPresetById,
  getRecommendedFieldSize,
  type FormationPreset,
  type FieldSize,
} from './formationPresets';

describe('FORMATION_PRESETS', () => {
  describe('data structure validation', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(FORMATION_PRESETS)).toBe(true);
      expect(FORMATION_PRESETS.length).toBeGreaterThan(0);
    });

    it('all presets have required properties', () => {
      FORMATION_PRESETS.forEach((preset: FormationPreset) => {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('labelKey');
        expect(preset).toHaveProperty('fieldSize');
        expect(preset).toHaveProperty('playerCount');
        expect(preset).toHaveProperty('positions');
      });
    });

    it('all presets have valid field sizes', () => {
      const validFieldSizes: FieldSize[] = ['3v3', '5v5', '8v8', '11v11'];
      FORMATION_PRESETS.forEach(preset => {
        expect(validFieldSizes).toContain(preset.fieldSize);
      });
    });

    it('all presets have unique IDs', () => {
      const ids = FORMATION_PRESETS.map(p => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all presets have matching playerCount and positions length', () => {
      FORMATION_PRESETS.forEach(preset => {
        expect(preset.positions.length).toBe(preset.playerCount);
      });
    });
  });

  describe('position validation', () => {
    it('all positions have relX between 0 and 1', () => {
      FORMATION_PRESETS.forEach(preset => {
        preset.positions.forEach(pos => {
          expect(pos.relX).toBeGreaterThanOrEqual(0);
          expect(pos.relX).toBeLessThanOrEqual(1);
        });
      });
    });

    it('all positions have relY between 0 and 1', () => {
      FORMATION_PRESETS.forEach(preset => {
        preset.positions.forEach(pos => {
          expect(pos.relY).toBeGreaterThanOrEqual(0);
          expect(pos.relY).toBeLessThanOrEqual(1);
        });
      });
    });

    it('positions do not include goalkeeper zone (relY > 0.9)', () => {
      // Goalkeeper is handled separately at ~0.95
      FORMATION_PRESETS.forEach(preset => {
        preset.positions.forEach(pos => {
          expect(pos.relY).toBeLessThanOrEqual(0.9);
        });
      });
    });
  });

  describe('field size coverage', () => {
    it('has presets for 3v3', () => {
      const presets = FORMATION_PRESETS.filter(p => p.fieldSize === '3v3');
      expect(presets.length).toBeGreaterThanOrEqual(1);
    });

    it('has presets for 5v5', () => {
      const presets = FORMATION_PRESETS.filter(p => p.fieldSize === '5v5');
      expect(presets.length).toBeGreaterThanOrEqual(1);
    });

    it('has presets for 8v8', () => {
      const presets = FORMATION_PRESETS.filter(p => p.fieldSize === '8v8');
      expect(presets.length).toBeGreaterThanOrEqual(1);
    });

    it('has presets for 11v11', () => {
      const presets = FORMATION_PRESETS.filter(p => p.fieldSize === '11v11');
      expect(presets.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('player count correctness', () => {
    it('3v3 presets have 2 field players (+ GK = 3)', () => {
      const presets = FORMATION_PRESETS.filter(p => p.fieldSize === '3v3');
      presets.forEach(preset => {
        expect(preset.playerCount).toBe(2);
      });
    });

    it('5v5 presets have 4 field players (+ GK = 5)', () => {
      const presets = FORMATION_PRESETS.filter(p => p.fieldSize === '5v5');
      presets.forEach(preset => {
        expect(preset.playerCount).toBe(4);
      });
    });

    it('8v8 presets have 7 field players (+ GK = 8)', () => {
      const presets = FORMATION_PRESETS.filter(p => p.fieldSize === '8v8');
      presets.forEach(preset => {
        expect(preset.playerCount).toBe(7);
      });
    });

    it('11v11 presets have 10 field players (+ GK = 11)', () => {
      const presets = FORMATION_PRESETS.filter(p => p.fieldSize === '11v11');
      presets.forEach(preset => {
        expect(preset.playerCount).toBe(10);
      });
    });
  });
});

describe('FIELD_SIZES', () => {
  it('contains all expected field sizes in order', () => {
    expect(FIELD_SIZES).toEqual(['3v3', '5v5', '8v8', '11v11']);
  });

  it('is immutable (frozen array would be ideal but check structure)', () => {
    expect(Array.isArray(FIELD_SIZES)).toBe(true);
    expect(FIELD_SIZES.length).toBe(4);
  });
});

describe('getPresetsForFieldSize', () => {
  it('returns only presets for specified field size', () => {
    const presets5v5 = getPresetsForFieldSize('5v5');
    presets5v5.forEach(preset => {
      expect(preset.fieldSize).toBe('5v5');
    });
  });

  it('returns non-empty array for all valid field sizes', () => {
    FIELD_SIZES.forEach(size => {
      const presets = getPresetsForFieldSize(size);
      expect(presets.length).toBeGreaterThan(0);
    });
  });

  it('returns empty array for invalid field size', () => {
    // TypeScript would prevent this, but testing runtime behavior
    const presets = getPresetsForFieldSize('invalid' as FieldSize);
    expect(presets).toEqual([]);
  });
});

describe('getPresetById', () => {
  it('returns correct preset for valid ID', () => {
    const preset = getPresetById('5v5-2-2');
    expect(preset).toBeDefined();
    expect(preset?.id).toBe('5v5-2-2');
    expect(preset?.fieldSize).toBe('5v5');
  });

  it('returns undefined for invalid ID', () => {
    const preset = getPresetById('invalid-preset-id');
    expect(preset).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    const preset = getPresetById('');
    expect(preset).toBeUndefined();
  });

  it('can find all presets by their IDs', () => {
    FORMATION_PRESETS.forEach(preset => {
      const found = getPresetById(preset.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(preset.id);
    });
  });
});

describe('getRecommendedFieldSize', () => {
  describe('small player counts (3v3)', () => {
    it('returns 3v3 for 1 player', () => {
      expect(getRecommendedFieldSize(1)).toBe('3v3');
    });

    it('returns 3v3 for 2 players', () => {
      expect(getRecommendedFieldSize(2)).toBe('3v3');
    });

    it('returns 3v3 for 3 players', () => {
      expect(getRecommendedFieldSize(3)).toBe('3v3');
    });
  });

  describe('medium player counts (5v5)', () => {
    it('returns 3v3 for 4 players (not enough for 5v5)', () => {
      expect(getRecommendedFieldSize(4)).toBe('3v3');
    });

    it('returns 5v5 for 5 players', () => {
      expect(getRecommendedFieldSize(5)).toBe('5v5');
    });

    it('returns 5v5 for 6 players (not enough for 8v8)', () => {
      expect(getRecommendedFieldSize(6)).toBe('5v5');
    });

    it('returns 5v5 for 7 players (not enough for 8v8)', () => {
      expect(getRecommendedFieldSize(7)).toBe('5v5');
    });
  });

  describe('larger player counts (8v8)', () => {
    it('returns 8v8 for 8 players', () => {
      expect(getRecommendedFieldSize(8)).toBe('8v8');
    });

    it('returns 8v8 for 9 players (not enough for 11v11)', () => {
      expect(getRecommendedFieldSize(9)).toBe('8v8');
    });

    it('returns 8v8 for 10 players (not enough for 11v11)', () => {
      expect(getRecommendedFieldSize(10)).toBe('8v8');
    });
  });

  describe('full size (11v11)', () => {
    it('returns 11v11 for 11 players', () => {
      expect(getRecommendedFieldSize(11)).toBe('11v11');
    });

    it('returns 11v11 for large player counts', () => {
      expect(getRecommendedFieldSize(15)).toBe('11v11');
      expect(getRecommendedFieldSize(20)).toBe('11v11');
    });
  });

  describe('edge cases', () => {
    it('returns 3v3 for 0 players', () => {
      expect(getRecommendedFieldSize(0)).toBe('3v3');
    });

    it('returns 3v3 for negative player count', () => {
      expect(getRecommendedFieldSize(-1)).toBe('3v3');
    });
  });
});

describe('specific formation validation', () => {
  describe('8v8-2-1-2-1-1 formation', () => {
    it('exists and has correct structure', () => {
      const preset = getPresetById('8v8-2-1-2-1-1');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('2-1-2-1-1');
      expect(preset?.playerCount).toBe(7);
      expect(preset?.positions.length).toBe(7);
    });

    it('has 5 layers of positions (2+1+2+1+1 = 7)', () => {
      const preset = getPresetById('8v8-2-1-2-1-1');
      expect(preset?.positions.length).toBe(7);
    });
  });

  describe('11v11-4-3-3 formation', () => {
    it('exists and has correct structure', () => {
      const preset = getPresetById('11v11-4-3-3');
      expect(preset).toBeDefined();
      expect(preset?.name).toBe('4-3-3');
      expect(preset?.playerCount).toBe(10);
    });

    it('has 3 rows (4+3+3 = 10)', () => {
      const preset = getPresetById('11v11-4-3-3');
      expect(preset?.positions.length).toBe(10);
    });
  });
});

describe('PRESETS_BY_SIZE', () => {
  it('should be pre-computed and match FIELD_SIZES keys', () => {
    const { PRESETS_BY_SIZE, FIELD_SIZES } = require('./formationPresets');
    expect(Object.keys(PRESETS_BY_SIZE).sort()).toEqual([...FIELD_SIZES].sort());
  });

  it('should contain all presets grouped correctly', () => {
    const { PRESETS_BY_SIZE, FORMATION_PRESETS } = require('./formationPresets');
    const totalInGroups = Object.values(PRESETS_BY_SIZE).flat().length;
    expect(totalInGroups).toBe(FORMATION_PRESETS.length);
  });

  it('should have each preset in the correct field size group', () => {
    const { PRESETS_BY_SIZE } = require('./formationPresets');
    for (const [size, presets] of Object.entries(PRESETS_BY_SIZE)) {
      for (const preset of presets as { fieldSize: string }[]) {
        expect(preset.fieldSize).toBe(size);
      }
    }
  });
});
