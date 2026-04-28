/**
 * Role / coord bridge tests for the planner integration.
 *
 * @critical Closes the open question raised in
 * `tournament-planner-integration.md` and tracked as #372.
 *
 * Verifies:
 *   - Every built-in preset defines a `roles` array with GK + outfield.
 *   - `coordForRole` and `roleForCoord` round-trip every role within
 *     ROLE_COORD_TOLERANCE for every preset.
 *   - Stamina tags follow the standalone planner's convention exactly.
 */

import { FORMATION_PRESETS, type FormationPreset, type FieldSize } from '@/config/formationPresets';
import {
  coordForRole,
  roleForCoord,
  rolesForPreset,
  ROLE_COORD_TOLERANCE,
} from '@/utils/formations';

describe('FormationPreset.roles — registry coverage', () => {
  it('every built-in preset has a roles array', () => {
    for (const preset of FORMATION_PRESETS) {
      expect(rolesForPreset(preset)).not.toBeNull();
    }
  });

  it('every preset includes a GK role at canonical coords (0.5, 0.95)', () => {
    for (const preset of FORMATION_PRESETS) {
      const gk = preset.roles?.find((r) => r.name === 'GK');
      expect(gk).toBeDefined();
      expect(gk?.relX).toBe(0.5);
      expect(gk?.relY).toBe(0.95);
      expect(gk?.sub).toBe('never');
    }
  });

  it('roles count matches playerCount + 1 (GK)', () => {
    for (const preset of FORMATION_PRESETS) {
      expect(preset.roles?.length).toBe(preset.playerCount + 1);
    }
  });

  it('role names are unique within each preset', () => {
    for (const preset of FORMATION_PRESETS) {
      const names = preset.roles!.map((r) => r.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    }
  });

  it('all role coordinates lie within the unit square', () => {
    for (const preset of FORMATION_PRESETS) {
      for (const role of preset.roles!) {
        expect(role.relX).toBeGreaterThanOrEqual(0);
        expect(role.relX).toBeLessThanOrEqual(1);
        expect(role.relY).toBeGreaterThanOrEqual(0);
        expect(role.relY).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('coordForRole / roleForCoord round-trip', () => {
  it('round-trips every role of every preset', () => {
    for (const preset of FORMATION_PRESETS) {
      for (const role of preset.roles!) {
        const coord = coordForRole(preset, role.name);
        expect(coord).toEqual({ relX: role.relX, relY: role.relY });

        const recovered = roleForCoord(preset, role.relX, role.relY);
        expect(recovered?.name).toBe(role.name);
      }
    }
  });

  it('returns null for unknown role names', () => {
    const preset = FORMATION_PRESETS.find((p) => p.id === '8v8-2-1-2-1-1')!;
    expect(coordForRole(preset, 'NotARealRole')).toBeNull();
  });

  it('returns null for coords far from any role (off-formation)', () => {
    const preset = FORMATION_PRESETS.find((p) => p.id === '5v5-2-2')!;
    // Roles in 5v5-2-2 are clustered at relY=0.40, 0.70, 0.95;
    // (0.5, 0.05) is the top of the pitch — no role there.
    expect(roleForCoord(preset, 0.5, 0.05)).toBeNull();
  });

  it('returns null when preset has no roles array', () => {
    const noRoles = { roles: undefined };
    expect(coordForRole(noRoles, 'GK')).toBeNull();
    expect(roleForCoord(noRoles, 0.5, 0.95)).toBeNull();
  });

  it('snaps within tolerance — small jitter still resolves the role', () => {
    const preset = FORMATION_PRESETS.find((p) => p.id === '5v5-2-2')!;
    const lb = preset.roles!.find((r) => r.name === 'LB')!;
    // Jitter half the tolerance — should still match.
    const jitter = ROLE_COORD_TOLERANCE / 2;
    const recovered = roleForCoord(preset, lb.relX + jitter, lb.relY - jitter);
    expect(recovered?.name).toBe('LB');
  });

  it('does not match when distance exceeds tolerance', () => {
    const preset = FORMATION_PRESETS.find((p) => p.id === '5v5-2-2')!;
    const lb = preset.roles!.find((r) => r.name === 'LB')!;
    const jitter = ROLE_COORD_TOLERANCE * 2; // beyond tolerance
    expect(roleForCoord(preset, lb.relX + jitter, lb.relY + jitter)).toBeNull();
  });

  it('picks the closest role on near-tie', () => {
    const preset = FORMATION_PRESETS.find((p) => p.id === '5v5-2-2')!;
    const lb = preset.roles!.find((r) => r.name === 'LB')!;
    const lf = preset.roles!.find((r) => r.name === 'LF')!;
    // Midway between LB and LF on the y axis — closer to whichever has the
    // smaller absolute distance. Pick a point clearly closer to LB.
    const closerToLb = { relX: lb.relX, relY: lb.relY + 0.01 };
    const recovered = roleForCoord(preset, closerToLb.relX, closerToLb.relY);
    expect(recovered?.name).toBe('LB');
    expect(recovered?.name).not.toBe(lf.name);
  });
});

describe('positions[] alignment with roles[]', () => {
  // Catches drift between the legacy `positions` array (used by
  // applyFormationPreset to place players at preset coords) and the
  // standalone-aligned `roles` map. Without this guard, a player placed
  // by "Place all" at positions[i] would resolve to `null` via
  // roleForCoord — breaking any future feature that derives role
  // assignments from existing coords. Codex P1 on PR #383.
  it('every position in every preset resolves to some role within tolerance', () => {
    const offenders: string[] = [];
    for (const preset of FORMATION_PRESETS) {
      for (let i = 0; i < preset.positions.length; i++) {
        const pos = preset.positions[i];
        const role = roleForCoord(preset, pos.relX, pos.relY);
        if (!role) {
          offenders.push(
            `${preset.id} positions[${i}] (${pos.relX}, ${pos.relY}) does not resolve to any role within tolerance`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('preset.positions covers every non-GK role exactly once (no missing/duplicate slots)', () => {
    for (const preset of FORMATION_PRESETS) {
      const outfieldRoles = preset.roles!.filter((r) => r.name !== 'GK');
      expect(preset.positions.length).toBe(outfieldRoles.length);

      const matchedRoleNames = new Set<string>();
      for (const pos of preset.positions) {
        const role = roleForCoord(preset, pos.relX, pos.relY);
        expect(role).not.toBeNull();
        expect(role!.name).not.toBe('GK');
        matchedRoleNames.add(role!.name);
      }
      // Every outfield role got covered by at least one position.
      expect(matchedRoleNames.size).toBe(outfieldRoles.length);
    }
  });
});

describe('Stamina tags follow standalone planner convention', () => {
  // The standalone planner ships these stamina sets per field size.
  // Mirror them here so any drift fails the test.
  const expectedPreserved: Record<FieldSize, ReadonlySet<string>> = {
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

  const stampExpected = (preset: FormationPreset, roleName: string) => {
    if (roleName === 'GK') return 'never' as const;
    return expectedPreserved[preset.fieldSize].has(roleName)
      ? ('preserved' as const)
      : ('preferred' as const);
  };

  it('every role has the expected sub tag', () => {
    for (const preset of FORMATION_PRESETS) {
      for (const role of preset.roles!) {
        expect(role.sub).toBe(stampExpected(preset, role.name));
      }
    }
  });

  it('5v5 has no preserved outfield roles (per standalone convention)', () => {
    for (const preset of FORMATION_PRESETS.filter((p) => p.fieldSize === '5v5')) {
      const preserved = preset.roles!.filter((r) => r.sub === 'preserved');
      expect(preserved).toEqual([]);
    }
  });
});
