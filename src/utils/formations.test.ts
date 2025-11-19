/**
 * Unit tests for formations utility
 *
 * Tests the pure formation calculation function to ensure correct
 * player positioning for different team sizes.
 */

import { calculateFormationPositions, type FieldPosition } from './formations';

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
  });

  describe('formation patterns', () => {
    it('returns 1 position for 1 player (central)', () => {
      const positions = calculateFormationPositions(1);
      expect(positions).toHaveLength(1);
      expect(positions[0]).toEqual({ relX: 0.5, relY: 0.5 });
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

    it('returns 10 positions for 10+ players (4-3-3, max 10)', () => {
      const positions10 = calculateFormationPositions(10);
      expect(positions10).toHaveLength(10);

      // Formation maxes out at 10 positions (4-3-3)
      const positions11 = calculateFormationPositions(11);
      expect(positions11).toHaveLength(10);

      const positions15 = calculateFormationPositions(15);
      expect(positions15).toHaveLength(10);
    });
  });

  describe('position coordinate validation', () => {
    it('all positions have relX between 0 and 1', () => {
      for (let playerCount = 1; playerCount <= 15; playerCount++) {
        const positions = calculateFormationPositions(playerCount);
        positions.forEach((pos, idx) => {
          expect(pos.relX).toBeGreaterThanOrEqual(0);
          expect(pos.relX).toBeLessThanOrEqual(1);
        });
      }
    });

    it('all positions have relY between 0 and 1', () => {
      for (let playerCount = 1; playerCount <= 15; playerCount++) {
        const positions = calculateFormationPositions(playerCount);
        positions.forEach((pos, idx) => {
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
