/**
 * Unit tests for positionLabels utility
 *
 * Tests the position label computation functions used for
 * field player labels and sideline sub slot labels.
 */

import {
  isSidelinePosition,
  getPositionLabel,
  getPositionLabelForFormationPosition,
  POSITION_THRESHOLDS,
} from './positionLabels';

describe('positionLabels', () => {
  describe('isSidelinePosition', () => {
    describe('left sideline', () => {
      it('returns true for position at left edge (relX = 0)', () => {
        expect(isSidelinePosition(0)).toBe(true);
      });

      it('returns true for position just inside left boundary', () => {
        expect(isSidelinePosition(0.03)).toBe(true);
      });

      it('returns false for position at left boundary threshold', () => {
        expect(isSidelinePosition(0.04)).toBe(false);
      });

      it('returns false for position just past left boundary', () => {
        expect(isSidelinePosition(0.05)).toBe(false);
      });
    });

    describe('right sideline', () => {
      it('returns true for position at right edge (relX = 1)', () => {
        expect(isSidelinePosition(1)).toBe(true);
      });

      it('returns true for position just past right boundary', () => {
        expect(isSidelinePosition(0.96)).toBe(true);
      });

      it('returns false for position at right boundary threshold', () => {
        expect(isSidelinePosition(0.955)).toBe(false);
      });

      it('returns false for position just before right boundary', () => {
        expect(isSidelinePosition(0.95)).toBe(false);
      });
    });

    describe('field positions', () => {
      it('returns false for center of field', () => {
        expect(isSidelinePosition(0.5)).toBe(false);
      });

      it('returns false for left-center position', () => {
        expect(isSidelinePosition(0.25)).toBe(false);
      });

      it('returns false for right-center position', () => {
        expect(isSidelinePosition(0.75)).toBe(false);
      });
    });
  });

  describe('getPositionLabel', () => {
    describe('sideline positions (SUB)', () => {
      it('returns SUB for left sideline position', () => {
        const result = getPositionLabel(0.03, 0.5);
        expect(result).toEqual({ label: 'SUB', zone: 'sub' });
      });

      it('returns SUB for right sideline position', () => {
        const result = getPositionLabel(0.96, 0.5);
        expect(result).toEqual({ label: 'SUB', zone: 'sub' });
      });

      it('returns SUB regardless of relY for sideline', () => {
        expect(getPositionLabel(0.96, 0.1).label).toBe('SUB');
        expect(getPositionLabel(0.96, 0.5).label).toBe('SUB');
        expect(getPositionLabel(0.96, 0.95).label).toBe('SUB');
      });
    });

    describe('goalkeeper zone (GK)', () => {
      it('returns GK for goalkeeper position in center', () => {
        const result = getPositionLabel(0.5, 0.95);
        expect(result).toEqual({ label: 'GK', zone: 'gk' });
      });

      it('returns GK for goalkeeper position at left', () => {
        const result = getPositionLabel(0.2, 0.92);
        expect(result).toEqual({ label: 'GK', zone: 'gk' });
      });

      it('returns GK at the zone boundary (relY = 0.90)', () => {
        const result = getPositionLabel(0.5, 0.90);
        expect(result).toEqual({ label: 'GK', zone: 'gk' });
      });
    });

    describe('defensive zone (DEF)', () => {
      it('returns CB for center-back position', () => {
        const result = getPositionLabel(0.5, 0.75);
        expect(result).toEqual({ label: 'CB', zone: 'def' });
      });

      it('returns LB for left-back position', () => {
        const result = getPositionLabel(0.15, 0.75);
        expect(result).toEqual({ label: 'LB', zone: 'def' });
      });

      it('returns RB for right-back position', () => {
        const result = getPositionLabel(0.85, 0.75);
        expect(result).toEqual({ label: 'RB', zone: 'def' });
      });

      it('returns DEF zone at lower boundary (relY = 0.73)', () => {
        const result = getPositionLabel(0.5, 0.73);
        expect(result.zone).toBe('def');
      });

      it('returns DEF zone just below GK boundary (relY = 0.89)', () => {
        const result = getPositionLabel(0.5, 0.89);
        expect(result.zone).toBe('def');
      });
    });

    describe('defensive midfield zone (DEF_MID)', () => {
      it('returns CDM for central defensive midfielder position', () => {
        const result = getPositionLabel(0.5, 0.60);
        expect(result).toEqual({ label: 'CDM', zone: 'mid' });
      });

      it('returns LDM for left defensive midfielder position', () => {
        const result = getPositionLabel(0.15, 0.62);
        expect(result).toEqual({ label: 'LDM', zone: 'mid' });
      });

      it('returns RDM for right defensive midfielder position', () => {
        const result = getPositionLabel(0.85, 0.62);
        expect(result).toEqual({ label: 'RDM', zone: 'mid' });
      });

      it('returns DEF_MID zone at lower boundary (relY = 0.55)', () => {
        const result = getPositionLabel(0.5, 0.55);
        expect(result.zone).toBe('mid');
        expect(result.label).toBe('CDM');
      });

      it('returns DEF_MID zone just below DEF boundary (relY = 0.72)', () => {
        const result = getPositionLabel(0.5, 0.72);
        expect(result.zone).toBe('mid');
        expect(result.label).toBe('CDM');
      });
    });

    describe('midfield zone (MID)', () => {
      it('returns CM for central midfielder position', () => {
        const result = getPositionLabel(0.5, 0.50);
        expect(result).toEqual({ label: 'CM', zone: 'mid' });
      });

      it('returns LM for left midfielder position', () => {
        const result = getPositionLabel(0.2, 0.50);
        expect(result).toEqual({ label: 'LM', zone: 'mid' });
      });

      it('returns RM for right midfielder position', () => {
        const result = getPositionLabel(0.8, 0.50);
        expect(result).toEqual({ label: 'RM', zone: 'mid' });
      });

      it('returns MID zone at lower boundary (relY = 0.48)', () => {
        const result = getPositionLabel(0.5, 0.48);
        expect(result.zone).toBe('mid');
      });

      it('returns MID zone just below DEF_MID boundary (relY = 0.54)', () => {
        const result = getPositionLabel(0.5, 0.54);
        expect(result.zone).toBe('mid');
        expect(result.label).toBe('CM');
      });
    });

    describe('attacking midfield zone (ATT_MID)', () => {
      it('returns CAM for central attacking midfielder position', () => {
        const result = getPositionLabel(0.5, 0.40);
        expect(result).toEqual({ label: 'CAM', zone: 'mid' });
      });

      it('returns LAM for left attacking midfielder position', () => {
        const result = getPositionLabel(0.15, 0.38);
        expect(result).toEqual({ label: 'LAM', zone: 'mid' });
      });

      it('returns RAM for right attacking midfielder position', () => {
        const result = getPositionLabel(0.85, 0.38);
        expect(result).toEqual({ label: 'RAM', zone: 'mid' });
      });

      it('returns ATT_MID zone at lower boundary (relY = 0.32)', () => {
        const result = getPositionLabel(0.5, 0.32);
        expect(result.zone).toBe('mid');
        expect(result.label).toBe('CAM');
      });

      it('returns ATT_MID zone just below MID boundary (relY = 0.47)', () => {
        const result = getPositionLabel(0.5, 0.47);
        expect(result.zone).toBe('mid');
        expect(result.label).toBe('CAM');
      });
    });

    describe('attack zone (ATT)', () => {
      it('returns ST for striker position', () => {
        const result = getPositionLabel(0.5, 0.25);
        expect(result).toEqual({ label: 'ST', zone: 'att' });
      });

      it('returns LW for left winger position', () => {
        const result = getPositionLabel(0.15, 0.20);
        expect(result).toEqual({ label: 'LW', zone: 'att' });
      });

      it('returns RW for right winger position', () => {
        const result = getPositionLabel(0.85, 0.20);
        expect(result).toEqual({ label: 'RW', zone: 'att' });
      });

      it('returns ATT zone just below ATT_MID boundary (relY = 0.31)', () => {
        const result = getPositionLabel(0.5, 0.31);
        expect(result.zone).toBe('att');
      });

      it('returns ATT zone at top of field (relY = 0)', () => {
        const result = getPositionLabel(0.5, 0);
        expect(result.zone).toBe('att');
      });
    });

    describe('horizontal zone boundaries', () => {
      const midY = 0.50; // Central midfield zone for clear testing

      it('returns left position for relX < 0.33', () => {
        expect(getPositionLabel(0.32, midY).label).toBe('LM');
      });

      it('returns center position for relX = 0.33', () => {
        // At boundary, falls into center (not strictly < 0.33)
        expect(getPositionLabel(0.33, midY).label).toBe('CM');
      });

      it('returns center position for relX between 0.33 and 0.67', () => {
        expect(getPositionLabel(0.5, midY).label).toBe('CM');
      });

      it('returns center position for relX = 0.67', () => {
        // At boundary, still center (not strictly > 0.67)
        expect(getPositionLabel(0.67, midY).label).toBe('CM');
      });

      it('returns right position for relX > 0.67', () => {
        expect(getPositionLabel(0.68, midY).label).toBe('RM');
      });
    });
  });

  describe('getPositionLabelForFormationPosition', () => {
    it('returns same result as getPositionLabel for on-field positions', () => {
      const onFieldResult = getPositionLabel(0.5, 0.75);
      const formationResult = getPositionLabelForFormationPosition(0.5, 0.75);
      expect(formationResult).toEqual(onFieldResult);
    });

    it('clamps left sideline position to field area', () => {
      // relX = 0.03 would normally return SUB, but formation positions should never be SUB
      const result = getPositionLabelForFormationPosition(0.03, 0.75);
      expect(result.label).not.toBe('SUB');
      expect(result.zone).toBe('def');
    });

    it('clamps right sideline position to field area', () => {
      // relX = 0.96 would normally return SUB, but formation positions should never be SUB
      const result = getPositionLabelForFormationPosition(0.96, 0.75);
      expect(result.label).not.toBe('SUB');
      expect(result.zone).toBe('def');
    });

    it('returns correct zone based on relY even when relX is clamped', () => {
      // Test that relY is still respected even when relX is clamped
      expect(getPositionLabelForFormationPosition(0.03, 0.30).zone).toBe('att');
      expect(getPositionLabelForFormationPosition(0.03, 0.55).zone).toBe('mid');
      expect(getPositionLabelForFormationPosition(0.03, 0.75).zone).toBe('def');
    });
  });

  describe('POSITION_THRESHOLDS', () => {
    it('exports all threshold constants', () => {
      expect(POSITION_THRESHOLDS).toHaveProperty('SIDELINE_LEFT');
      expect(POSITION_THRESHOLDS).toHaveProperty('SIDELINE_RIGHT');
      expect(POSITION_THRESHOLDS).toHaveProperty('LEFT_ZONE');
      expect(POSITION_THRESHOLDS).toHaveProperty('RIGHT_ZONE');
      expect(POSITION_THRESHOLDS).toHaveProperty('GK_ZONE');
      expect(POSITION_THRESHOLDS).toHaveProperty('DEF_ZONE');
      expect(POSITION_THRESHOLDS).toHaveProperty('DEF_MID_ZONE');
      expect(POSITION_THRESHOLDS).toHaveProperty('MID_ZONE');
      expect(POSITION_THRESHOLDS).toHaveProperty('ATT_MID_ZONE');
    });

    it('has correct sideline thresholds', () => {
      expect(POSITION_THRESHOLDS.SIDELINE_LEFT).toBe(0.04);
      expect(POSITION_THRESHOLDS.SIDELINE_RIGHT).toBe(0.955);
    });

    it('has correct horizontal zone thresholds', () => {
      expect(POSITION_THRESHOLDS.LEFT_ZONE).toBe(0.33);
      expect(POSITION_THRESHOLDS.RIGHT_ZONE).toBe(0.67);
    });

    it('has correct vertical zone thresholds', () => {
      expect(POSITION_THRESHOLDS.GK_ZONE).toBe(0.90);
      expect(POSITION_THRESHOLDS.DEF_ZONE).toBe(0.73);
      expect(POSITION_THRESHOLDS.DEF_MID_ZONE).toBe(0.55);
      expect(POSITION_THRESHOLDS.MID_ZONE).toBe(0.48);
      expect(POSITION_THRESHOLDS.ATT_MID_ZONE).toBe(0.32);
    });
  });

  describe('return type validation', () => {
    it('returns PositionLabelInfo with correct structure', () => {
      const result = getPositionLabel(0.5, 0.5);
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('zone');
      expect(typeof result.label).toBe('string');
      expect(['gk', 'def', 'mid', 'att', 'sub']).toContain(result.zone);
    });

    it('returns non-empty label strings', () => {
      const testCases = [
        { relX: 0.5, relY: 0.95 }, // GK
        { relX: 0.5, relY: 0.75 }, // CB
        { relX: 0.5, relY: 0.50 }, // CM
        { relX: 0.5, relY: 0.25 }, // ST
        { relX: 0.96, relY: 0.50 }, // SUB
      ];

      testCases.forEach(({ relX, relY }) => {
        const result = getPositionLabel(relX, relY);
        expect(result.label.length).toBeGreaterThan(0);
      });
    });
  });

  describe('pure function properties', () => {
    it('returns same result for same input (deterministic)', () => {
      const result1 = getPositionLabel(0.5, 0.75);
      const result2 = getPositionLabel(0.5, 0.75);
      expect(result1).toEqual(result2);
    });

    it('returns new object each time (no shared references)', () => {
      const result1 = getPositionLabel(0.5, 0.75);
      const result2 = getPositionLabel(0.5, 0.75);
      expect(result1).not.toBe(result2);
    });
  });
});
