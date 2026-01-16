/**
 * Unit tests for formations utility
 *
 * Tests the pure formation calculation function to ensure correct
 * player positioning for different team sizes.
 */

import {
  calculateFormationPositions,
  applyFormationPreset,
  generateSidelinePositions,
  generateSubSlots,
  type FieldPosition,
  type FormationResult,
} from './formations';

describe('calculateFormationPositions', () => {
  describe('edge cases', () => {
    it('returns empty array for 0 players', () => {
      const positions = calculateFormationPositions(0);
      expect(positions).toEqual([]);
    });

    it('returns empty array for negative player count', () => {
      const positions = calculateFormationPositions(-1);
      expect(positions).toEqual([]);
    });

    it('returns empty array for NaN', () => {
      const positions = calculateFormationPositions(NaN);
      expect(positions).toEqual([]);
    });

    it('returns empty array for Infinity', () => {
      const positions = calculateFormationPositions(Infinity);
      expect(positions).toEqual([]);
    });

    it('returns empty array for -Infinity', () => {
      const positions = calculateFormationPositions(-Infinity);
      expect(positions).toEqual([]);
    });
  });

  describe('formation patterns', () => {
    it('returns 1 position for 1 player (midfield position)', () => {
      const positions = calculateFormationPositions(1);
      expect(positions).toHaveLength(1);
      expect(positions[0]).toEqual({ relX: 0.5, relY: 0.45 });
    });

    it('returns 2 positions for 2 players (side by side)', () => {
      const positions = calculateFormationPositions(2);
      expect(positions).toHaveLength(2);
      expect(positions[0].relX).toBeLessThan(positions[1].relX); // Left, then right
    });

    it('returns 3 positions for 3 players (triangle)', () => {
      const positions = calculateFormationPositions(3);
      expect(positions).toHaveLength(3);
    });

    it('returns 4 positions for 4 players (diamond)', () => {
      const positions = calculateFormationPositions(4);
      expect(positions).toHaveLength(4);
    });

    it('returns 5 positions for 5 players (2-2-1)', () => {
      const positions = calculateFormationPositions(5);
      expect(positions).toHaveLength(5);
    });

    it('returns 6 positions for 6 players (2-2-2)', () => {
      const positions = calculateFormationPositions(6);
      expect(positions).toHaveLength(6);
    });

    it('returns 7 positions for 7 players (3-2-2)', () => {
      const positions = calculateFormationPositions(7);
      expect(positions).toHaveLength(7);
    });

    it('returns 8 positions for 8 players (2-2-2-2)', () => {
      const positions = calculateFormationPositions(8);
      expect(positions).toHaveLength(8);
    });

    it('returns 9 positions for 9 players (3-2-3-1)', () => {
      const positions = calculateFormationPositions(9);
      expect(positions).toHaveLength(9);
    });

    it('returns 10 positions for 10 players (4-3-3)', () => {
      const positions10 = calculateFormationPositions(10);
      expect(positions10).toHaveLength(10);
    });

    it('returns positions for all players even with 11+ field players', () => {
      // Dynamic formation now handles any number of players
      const positions11 = calculateFormationPositions(11);
      expect(positions11).toHaveLength(11);

      const positions15 = calculateFormationPositions(15);
      expect(positions15).toHaveLength(15);

      const positions20 = calculateFormationPositions(20);
      expect(positions20).toHaveLength(20);
    });
  });

  describe('position coordinate validation', () => {
    it('all positions have relX between 0 and 1', () => {
      for (let playerCount = 1; playerCount <= 15; playerCount++) {
        const positions = calculateFormationPositions(playerCount);
        positions.forEach(pos => {
          expect(pos.relX).toBeGreaterThanOrEqual(0);
          expect(pos.relX).toBeLessThanOrEqual(1);
        });
      }
    });

    it('all positions have relY between 0 and 1', () => {
      for (let playerCount = 1; playerCount <= 15; playerCount++) {
        const positions = calculateFormationPositions(playerCount);
        positions.forEach(pos => {
          expect(pos.relY).toBeGreaterThanOrEqual(0);
          expect(pos.relY).toBeLessThanOrEqual(1);
        });
      }
    });

    it('all positions have required properties', () => {
      const positions = calculateFormationPositions(5);
      positions.forEach(pos => {
        expect(pos).toHaveProperty('relX');
        expect(pos).toHaveProperty('relY');
        expect(typeof pos.relX).toBe('number');
        expect(typeof pos.relY).toBe('number');
      });
    });
  });

  describe('formation characteristics', () => {
    it('positions defenders closer to own goal (higher relY)', () => {
      // For 5 players (2-2-1), the 2 defenders should be at higher relY
      const positions = calculateFormationPositions(5);
      const defenders = positions.slice(0, 2); // First 2 are defenders
      const forward = positions[4]; // Last is forward

      defenders.forEach(defender => {
        expect(defender.relY).toBeGreaterThan(forward.relY);
      });
    });

    it('positions forwards closer to opponent goal (lower relY)', () => {
      // For 9 players (3-2-3-1), the striker should be at lowest relY
      const positions = calculateFormationPositions(9);
      const striker = positions[8]; // Last position is striker
      const defenders = positions.slice(0, 3); // First 3 are defenders

      defenders.forEach(defender => {
        expect(striker.relY).toBeLessThan(defender.relY);
      });
    });

    it('creates symmetric formations for even player counts', () => {
      // For 2 players, positions should be symmetric around center (0.5)
      const positions = calculateFormationPositions(2);
      const centerX = 0.5;
      const leftDist = Math.abs(positions[0].relX - centerX);
      const rightDist = Math.abs(positions[1].relX - centerX);
      expect(leftDist).toBeCloseTo(rightDist, 5);
    });
  });

  describe('pure function properties', () => {
    it('returns same result for same input (deterministic)', () => {
      const result1 = calculateFormationPositions(5);
      const result2 = calculateFormationPositions(5);
      expect(result1).toEqual(result2);
    });

    it('returns new array each time (no shared references)', () => {
      const result1 = calculateFormationPositions(5);
      const result2 = calculateFormationPositions(5);
      expect(result1).not.toBe(result2); // Different array instances
      expect(result1[0]).not.toBe(result2[0]); // Different object instances
    });

    it('does not mutate input (no side effects)', () => {
      // Function takes primitive number, so no mutation possible
      // This test documents the pure function property
      const playerCount = 5;
      calculateFormationPositions(playerCount);
      expect(playerCount).toBe(5); // Unchanged
    });
  });

  describe('FieldPosition type validation', () => {
    it('returns objects matching FieldPosition interface', () => {
      const positions = calculateFormationPositions(5);
      positions.forEach((pos: FieldPosition) => {
        // TypeScript compilation validates the interface
        expect(pos.relX).toBeDefined();
        expect(pos.relY).toBeDefined();
      });
    });
  });
});

describe('applyFormationPreset', () => {
  // Sample preset positions for testing (4-position formation)
  const samplePreset: FieldPosition[] = [
    { relX: 0.25, relY: 0.70 },
    { relX: 0.75, relY: 0.70 },
    { relX: 0.25, relY: 0.40 },
    { relX: 0.75, relY: 0.40 },
  ];

  describe('exact player count match', () => {
    it('returns all preset positions when player count matches exactly', () => {
      const result = applyFormationPreset(samplePreset, 4);
      expect(result.positions).toHaveLength(4);
      expect(result.overflow).toBe(0);
      expect(result.positions).toEqual(samplePreset);
    });
  });

  describe('fewer players than positions', () => {
    it('returns subset of positions when fewer players', () => {
      const result = applyFormationPreset(samplePreset, 2);
      expect(result.positions).toHaveLength(2);
      expect(result.overflow).toBe(0);
      expect(result.positions).toEqual(samplePreset.slice(0, 2));
    });

    it('returns single position for 1 player', () => {
      const result = applyFormationPreset(samplePreset, 1);
      expect(result.positions).toHaveLength(1);
      expect(result.overflow).toBe(0);
      expect(result.positions[0]).toEqual(samplePreset[0]);
    });

    it('returns empty positions for 0 players', () => {
      const result = applyFormationPreset(samplePreset, 0);
      expect(result.positions).toHaveLength(0);
      expect(result.overflow).toBe(0);
    });
  });

  describe('more players than positions (overflow)', () => {
    it('returns all positions with overflow count for extra players', () => {
      const result = applyFormationPreset(samplePreset, 6);
      expect(result.positions).toHaveLength(4);
      expect(result.overflow).toBe(2);
      expect(result.positions).toEqual(samplePreset);
    });

    it('calculates correct overflow for many extra players', () => {
      const result = applyFormationPreset(samplePreset, 10);
      expect(result.positions).toHaveLength(4);
      expect(result.overflow).toBe(6);
    });

    it('handles large overflow correctly', () => {
      const result = applyFormationPreset(samplePreset, 20);
      expect(result.positions).toHaveLength(4);
      expect(result.overflow).toBe(16);
    });
  });

  describe('return type validation', () => {
    it('returns FormationResult with correct structure', () => {
      const result: FormationResult = applyFormationPreset(samplePreset, 3);
      expect(result).toHaveProperty('positions');
      expect(result).toHaveProperty('overflow');
      expect(Array.isArray(result.positions)).toBe(true);
      expect(typeof result.overflow).toBe('number');
    });

    it('positions contain valid FieldPosition objects', () => {
      const result = applyFormationPreset(samplePreset, 4);
      result.positions.forEach(pos => {
        expect(pos).toHaveProperty('relX');
        expect(pos).toHaveProperty('relY');
        expect(typeof pos.relX).toBe('number');
        expect(typeof pos.relY).toBe('number');
      });
    });
  });

  describe('empty preset handling', () => {
    it('returns empty positions and full overflow for empty preset', () => {
      const result = applyFormationPreset([], 5);
      expect(result.positions).toHaveLength(0);
      expect(result.overflow).toBe(5);
    });

    it('returns empty positions and zero overflow for empty preset with 0 players', () => {
      const result = applyFormationPreset([], 0);
      expect(result.positions).toHaveLength(0);
      expect(result.overflow).toBe(0);
    });
  });

  describe('pure function properties', () => {
    it('returns same result for same input (deterministic)', () => {
      const result1 = applyFormationPreset(samplePreset, 3);
      const result2 = applyFormationPreset(samplePreset, 3);
      expect(result1).toEqual(result2);
    });

    it('does not mutate input preset array', () => {
      const originalPreset = [...samplePreset];
      applyFormationPreset(samplePreset, 2);
      expect(samplePreset).toEqual(originalPreset);
    });
  });
});

describe('generateSidelinePositions', () => {
  describe('basic functionality', () => {
    it('returns empty array for 0 overflow players', () => {
      const positions = generateSidelinePositions(0);
      expect(positions).toEqual([]);
    });

    it('returns empty array for negative count', () => {
      const positions = generateSidelinePositions(-1);
      expect(positions).toEqual([]);
    });

    it('returns 1 position for 1 overflow player', () => {
      const positions = generateSidelinePositions(1);
      expect(positions).toHaveLength(1);
    });

    it('returns correct number of positions for multiple players', () => {
      expect(generateSidelinePositions(3)).toHaveLength(3);
      expect(generateSidelinePositions(5)).toHaveLength(5);
      expect(generateSidelinePositions(10)).toHaveLength(10);
    });
  });

  describe('position placement (right sideline, bottom corner)', () => {
    it('places players on right side of field (relX near 1.0)', () => {
      const positions = generateSidelinePositions(3);
      positions.forEach(pos => {
        expect(pos.relX).toBeGreaterThan(0.9);
        expect(pos.relX).toBeLessThanOrEqual(1.0);
      });
    });

    it('starts from bottom corner (high relY)', () => {
      const positions = generateSidelinePositions(3);
      // First player should be near bottom (high relY)
      expect(positions[0].relY).toBeGreaterThan(0.8);
    });

    it('stacks players upward (decreasing relY)', () => {
      const positions = generateSidelinePositions(5);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i].relY).toBeLessThan(positions[i - 1].relY);
      }
    });

    it('maintains consistent horizontal position (same relX)', () => {
      const positions = generateSidelinePositions(4);
      const firstX = positions[0].relX;
      positions.forEach(pos => {
        expect(pos.relX).toBe(firstX);
      });
    });
  });

  describe('spacing', () => {
    it('uses consistent spacing between players', () => {
      const positions = generateSidelinePositions(4);
      const spacings: number[] = [];
      for (let i = 1; i < positions.length; i++) {
        spacings.push(positions[i - 1].relY - positions[i].relY);
      }
      // All spacings should be equal
      const firstSpacing = spacings[0];
      spacings.forEach(spacing => {
        expect(spacing).toBeCloseTo(firstSpacing, 5);
      });
    });

    it('uses tight spacing (around 0.06) for compact sideline placement', () => {
      const positions = generateSidelinePositions(2);
      const spacing = positions[0].relY - positions[1].relY;
      expect(spacing).toBeCloseTo(0.06, 2);
    });
  });

  describe('coordinate validation', () => {
    it('all positions have relX between 0 and 1', () => {
      const positions = generateSidelinePositions(10);
      positions.forEach(pos => {
        expect(pos.relX).toBeGreaterThanOrEqual(0);
        expect(pos.relX).toBeLessThanOrEqual(1);
      });
    });

    it('all positions have relY between 0 and 1', () => {
      const positions = generateSidelinePositions(10);
      positions.forEach(pos => {
        expect(pos.relY).toBeGreaterThanOrEqual(0);
        expect(pos.relY).toBeLessThanOrEqual(1);
      });
    });

    it('positions remain valid even with many overflow players', () => {
      // With 15 players at 0.06 spacing starting from 0.92,
      // the 15th player would be at 0.92 - 14*0.06 = 0.08
      const positions = generateSidelinePositions(15);
      positions.forEach(pos => {
        expect(pos.relX).toBeGreaterThanOrEqual(0);
        expect(pos.relX).toBeLessThanOrEqual(1);
        expect(pos.relY).toBeGreaterThanOrEqual(0);
        expect(pos.relY).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('pure function properties', () => {
    it('returns same result for same input (deterministic)', () => {
      const result1 = generateSidelinePositions(5);
      const result2 = generateSidelinePositions(5);
      expect(result1).toEqual(result2);
    });

    it('returns new array each time (no shared references)', () => {
      const result1 = generateSidelinePositions(3);
      const result2 = generateSidelinePositions(3);
      expect(result1).not.toBe(result2);
      expect(result1[0]).not.toBe(result2[0]);
    });
  });
});

describe('generateSubSlots', () => {
  describe('edge cases and guards', () => {
    it('returns empty array for empty formation positions', () => {
      const result = generateSubSlots([]);
      expect(result).toEqual([]);
    });

    it('returns empty array for null input', () => {
      // TypeScript would catch this, but testing runtime guard
      const result = generateSubSlots(null as unknown as FieldPosition[]);
      expect(result).toEqual([]);
    });

    it('returns empty array for undefined input', () => {
      // TypeScript would catch this, but testing runtime guard
      const result = generateSubSlots(undefined as unknown as FieldPosition[]);
      expect(result).toEqual([]);
    });
  });

  describe('basic functionality', () => {
    it('returns one sub slot for one formation position', () => {
      const positions: FieldPosition[] = [{ relX: 0.5, relY: 0.75 }];
      const result = generateSubSlots(positions);
      expect(result).toHaveLength(1);
    });

    it('returns correct number of sub slots for multiple positions', () => {
      const positions: FieldPosition[] = [
        { relX: 0.5, relY: 0.75 },
        { relX: 0.25, relY: 0.55 },
        { relX: 0.75, relY: 0.55 },
      ];
      const result = generateSubSlots(positions);
      expect(result).toHaveLength(3);
    });

    it('places all sub slots on right sideline (relX = 0.96)', () => {
      const positions: FieldPosition[] = [
        { relX: 0.5, relY: 0.75 },
        { relX: 0.25, relY: 0.55 },
      ];
      const result = generateSubSlots(positions);
      result.forEach(slot => {
        expect(slot.relX).toBe(0.96);
      });
    });
  });

  describe('position labels', () => {
    it('assigns correct position label for defender position', () => {
      const positions: FieldPosition[] = [{ relX: 0.5, relY: 0.75 }];
      const result = generateSubSlots(positions);
      expect(result[0].positionLabel).toBe('CB');
    });

    it('assigns correct position label for midfielder positions', () => {
      const positions: FieldPosition[] = [
        { relX: 0.15, relY: 0.50 },
        { relX: 0.5, relY: 0.50 },
        { relX: 0.85, relY: 0.50 },
      ];
      const result = generateSubSlots(positions);
      const labels = result.map(s => s.positionLabel).sort();
      expect(labels).toContain('LM');
      expect(labels).toContain('CM');
      expect(labels).toContain('RM');
    });

    it('assigns correct position label for attacker positions', () => {
      const positions: FieldPosition[] = [
        { relX: 0.15, relY: 0.30 },
        { relX: 0.5, relY: 0.30 },
        { relX: 0.85, relY: 0.30 },
      ];
      const result = generateSubSlots(positions);
      const labels = result.map(s => s.positionLabel).sort();
      expect(labels).toContain('LW');
      expect(labels).toContain('ST');
      expect(labels).toContain('RW');
    });
  });

  describe('row grouping and stacking', () => {
    it('groups positions in the same row (similar relY)', () => {
      // Two defenders at same Y level should be grouped
      const positions: FieldPosition[] = [
        { relX: 0.15, relY: 0.75 },
        { relX: 0.85, relY: 0.75 },
      ];
      const result = generateSubSlots(positions);

      // Both should have different relY due to stacking
      expect(result[0].relY).not.toBe(result[1].relY);
    });

    it('stacks slots vertically within same row', () => {
      const positions: FieldPosition[] = [
        { relX: 0.15, relY: 0.75 },
        { relX: 0.50, relY: 0.75 },
        { relX: 0.85, relY: 0.75 },
      ];
      const result = generateSubSlots(positions);

      // All should have same relX (sideline)
      expect(result.every(s => s.relX === 0.96)).toBe(true);

      // Should have 3 distinct relY values (stacked)
      const uniqueYs = new Set(result.map(s => s.relY));
      expect(uniqueYs.size).toBe(3);
    });

    it('does not group positions in different rows', () => {
      // Defender and midfielder should NOT be grouped
      const positions: FieldPosition[] = [
        { relX: 0.5, relY: 0.75 }, // Defender
        { relX: 0.5, relY: 0.50 }, // Midfielder
      ];
      const result = generateSubSlots(positions);

      // Should have different relY values (not stacked together)
      expect(Math.abs(result[0].relY - result[1].relY)).toBeGreaterThan(0.08);
    });

    it('uses ROW_TOLERANCE of 0.08 for grouping', () => {
      // Positions within 0.08 relY should be grouped
      const closePositions: FieldPosition[] = [
        { relX: 0.5, relY: 0.75 },
        { relX: 0.3, relY: 0.78 }, // Within 0.08 of 0.75
      ];
      const closeResult = generateSubSlots(closePositions);
      // Grouped positions should have stacked relY (different values)
      expect(closeResult[0].relY).not.toBe(closeResult[1].relY);

      // Positions outside 0.08 relY should NOT be grouped
      const farPositions: FieldPosition[] = [
        { relX: 0.5, relY: 0.75 },
        { relX: 0.3, relY: 0.66 }, // Just outside 0.08 of 0.75
      ];
      const farResult = generateSubSlots(farPositions);
      // Separate rows maintain their original relY (approximately)
      const diff = Math.abs(farResult[0].relY - farResult[1].relY);
      expect(diff).toBeGreaterThan(0.05);
    });
  });

  describe('typical formation patterns', () => {
    it('handles 4-3-3 formation correctly', () => {
      const positions: FieldPosition[] = [
        // 4 defenders
        { relX: 0.10, relY: 0.78 },
        { relX: 0.37, relY: 0.78 },
        { relX: 0.63, relY: 0.78 },
        { relX: 0.90, relY: 0.78 },
        // 3 midfielders
        { relX: 0.15, relY: 0.55 },
        { relX: 0.50, relY: 0.55 },
        { relX: 0.85, relY: 0.55 },
        // 3 forwards
        { relX: 0.15, relY: 0.30 },
        { relX: 0.50, relY: 0.30 },
        { relX: 0.85, relY: 0.30 },
      ];
      const result = generateSubSlots(positions);

      expect(result).toHaveLength(10);
      expect(result.every(s => s.relX === 0.96)).toBe(true);
      expect(result.every(s => typeof s.positionLabel === 'string')).toBe(true);
      expect(result.every(s => s.positionLabel.length > 0)).toBe(true);
    });
  });

  describe('SubSlot type validation', () => {
    it('returns objects matching SubSlot interface', () => {
      const positions: FieldPosition[] = [{ relX: 0.5, relY: 0.75 }];
      const result = generateSubSlots(positions);

      expect(result[0]).toHaveProperty('relX');
      expect(result[0]).toHaveProperty('relY');
      expect(result[0]).toHaveProperty('positionLabel');
      expect(typeof result[0].relX).toBe('number');
      expect(typeof result[0].relY).toBe('number');
      expect(typeof result[0].positionLabel).toBe('string');
    });

    it('returns valid coordinate values', () => {
      const positions = calculateFormationPositions(10);
      const result = generateSubSlots(positions);

      result.forEach(slot => {
        expect(slot.relX).toBeGreaterThanOrEqual(0);
        expect(slot.relX).toBeLessThanOrEqual(1);
        expect(slot.relY).toBeGreaterThanOrEqual(0);
        expect(slot.relY).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('pure function properties', () => {
    it('returns same result for same input (deterministic)', () => {
      const positions: FieldPosition[] = [
        { relX: 0.5, relY: 0.75 },
        { relX: 0.25, relY: 0.55 },
      ];
      const result1 = generateSubSlots(positions);
      const result2 = generateSubSlots(positions);
      expect(result1).toEqual(result2);
    });

    it('returns new array each time (no shared references)', () => {
      const positions: FieldPosition[] = [{ relX: 0.5, relY: 0.75 }];
      const result1 = generateSubSlots(positions);
      const result2 = generateSubSlots(positions);
      expect(result1).not.toBe(result2);
      expect(result1[0]).not.toBe(result2[0]);
    });

    it('does not mutate input array', () => {
      const positions: FieldPosition[] = [
        { relX: 0.5, relY: 0.75 },
        { relX: 0.25, relY: 0.55 },
      ];
      const originalPositions = JSON.parse(JSON.stringify(positions));
      generateSubSlots(positions);
      expect(positions).toEqual(originalPositions);
    });
  });
});
