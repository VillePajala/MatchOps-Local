/**
 * Personnel Test Fixtures
 *
 * Centralized personnel data for consistent testing across the application.
 * Provides realistic but predictable personnel data for reliable test scenarios.
 */

import { Personnel } from '@/types/personnel';
import { TestIdGenerator, BaseFixture } from './base';

/**
 * Personnel fixture factory providing various role types and scenarios
 */
class PersonnelFixture extends BaseFixture<Personnel> {
  protected getDefaults(): Personnel {
    return {
      id: TestIdGenerator.generate('personnel'),
      name: 'Test Personnel',
      role: 'head_coach',
      phone: '',
      email: '',
      certifications: [],
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  protected getVariation(index: number): Partial<Personnel> {
    const roles: Personnel['role'][] = [
      'head_coach',
      'assistant_coach',
      'goalkeeper_coach',
      'fitness_coach',
      'physio',
      'team_manager',
      'support_staff',
      'other',
    ];

    return {
      name: `Personnel ${index + 1}`,
      role: roles[index % roles.length],
    };
  }
}

const fixture = new PersonnelFixture();

/**
 * Creates a head coach
 *
 * @param overrides - Optional property overrides
 * @returns Personnel configured as head coach
 *
 * @example
 * ```typescript
 * const coach = headCoach({ name: 'John Coach' });
 * ```
 */
export function headCoach(overrides: Partial<Personnel> = {}): Personnel {
  return fixture.create({
    name: 'Head Coach',
    role: 'head_coach',
    ...overrides,
  });
}

/**
 * Creates an assistant coach
 *
 * @param overrides - Optional property overrides
 * @returns Personnel configured as assistant coach
 */
export function assistantCoach(overrides: Partial<Personnel> = {}): Personnel {
  return fixture.create({
    name: 'Assistant Coach',
    role: 'assistant_coach',
    ...overrides,
  });
}

/**
 * Creates a goalkeeper coach
 *
 * @param overrides - Optional property overrides
 * @returns Personnel configured as goalkeeper coach
 */
export function goalkeeperCoach(overrides: Partial<Personnel> = {}): Personnel {
  return fixture.create({
    name: 'Goalkeeper Coach',
    role: 'goalkeeper_coach',
    ...overrides,
  });
}

/**
 * Creates a fitness coach
 *
 * @param overrides - Optional property overrides
 * @returns Personnel configured as fitness coach
 */
export function fitnessCoach(overrides: Partial<Personnel> = {}): Personnel {
  return fixture.create({
    name: 'Fitness Coach',
    role: 'fitness_coach',
    ...overrides,
  });
}

/**
 * Creates a physiotherapist
 *
 * @param overrides - Optional property overrides
 * @returns Personnel configured as physio
 */
export function physio(overrides: Partial<Personnel> = {}): Personnel {
  return fixture.create({
    name: 'Physiotherapist',
    role: 'physio',
    ...overrides,
  });
}

/**
 * Creates a team manager
 *
 * @param overrides - Optional property overrides
 * @returns Personnel configured as team manager
 */
export function teamManager(overrides: Partial<Personnel> = {}): Personnel {
  return fixture.create({
    name: 'Team Manager',
    role: 'team_manager',
    ...overrides,
  });
}

/**
 * Creates support staff
 *
 * @param overrides - Optional property overrides
 * @returns Personnel configured as support staff
 */
export function supportStaff(overrides: Partial<Personnel> = {}): Personnel {
  return fixture.create({
    name: 'Support Staff',
    role: 'support_staff',
    ...overrides,
  });
}

/**
 * Creates a complete coaching team with realistic roles
 *
 * @param options - Team configuration options
 * @returns Array of personnel forming a complete coaching staff
 *
 * @example
 * ```typescript
 * const staff = fullTeam({ count: 5 });
 * const completeStaff = fullTeam({ count: 8, teamName: 'FC Test' });
 * ```
 */
export function fullTeam(options: {
  count?: number;
  teamName?: string;
} = {}): Personnel[] {
  const { count = 5, teamName = 'Test Team' } = options;

  const staff: Personnel[] = [];

  // Always include head coach
  if (count >= 1) {
    staff.push(headCoach({ name: `${teamName} Head Coach` }));
  }

  // Add assistant coach if room
  if (count >= 2) {
    staff.push(assistantCoach({ name: `${teamName} Assistant Coach` }));
  }

  // Add goalkeeper coach if room
  if (count >= 3) {
    staff.push(goalkeeperCoach({ name: `${teamName} GK Coach` }));
  }

  // Add fitness coach if room
  if (count >= 4) {
    staff.push(fitnessCoach({ name: `${teamName} Fitness Coach` }));
  }

  // Add physio if room
  if (count >= 5) {
    staff.push(physio({ name: `${teamName} Physio` }));
  }

  // Add team manager if room
  if (count >= 6) {
    staff.push(teamManager({ name: `${teamName} Team Manager` }));
  }

  // Fill remaining with support staff
  while (staff.length < count) {
    staff.push(
      supportStaff({
        name: `${teamName} Support ${staff.length + 1}`,
      })
    );
  }

  return staff;
}

/**
 * Creates a minimal personnel roster for basic testing
 *
 * @param count - Number of personnel to create (default: 3)
 * @returns Small roster suitable for unit tests
 */
export function minimalRoster(count: number = 3): Personnel[] {
  return fixture.createMany(count);
}

/**
 * Creates personnel with specific characteristics for edge case testing
 */
export const edgeCases = {
  /**
   * Personnel with very long name for UI testing
   */
  longName: (): Personnel =>
    headCoach({
      name: 'This Is A Very Long Personnel Name That Tests UI Boundaries And Text Wrapping Behavior',
    }),

  /**
   * Personnel with special characters in name
   */
  specialCharacters: (): Personnel =>
    headCoach({
      name: 'José María Ñoño-Çhàrles',
    }),

  /**
   * Personnel with emoji in name for internationalization testing
   */
  emojiName: (): Personnel =>
    headCoach({
      name: 'Coach ⚽ 🏆',
    }),

  /**
   * Personnel with all optional fields filled
   */
  complete: (): Personnel =>
    headCoach({
      name: 'Complete Coach',
      phone: '+1-555-123-4567',
      email: 'coach@example.com',
      certifications: ['UEFA Pro License', 'Sports Science MSc'],
      notes: 'Extensive experience with youth development and tactical analysis.',
    }),

  /**
   * Personnel with minimal data (no optional fields)
   */
  minimal: (): Personnel =>
    headCoach({
      name: 'Minimal Coach',
      phone: '',
      email: '',
      certifications: [],
      notes: '',
    }),
};

/**
 * Common personnel collections for different test scenarios
 */
export const collections = {
  /**
   * Full coaching staff for a professional team
   */
  professionalStaff: () => fullTeam({ count: 8, teamName: 'Professional' }),

  /**
   * Minimal coaching staff for youth team
   */
  youthStaff: () => fullTeam({ count: 3, teamName: 'Youth' }),

  /**
   * Quick test with minimal personnel
   */
  quickTest: () => [
    headCoach({ name: 'Test Head Coach' }),
    assistantCoach({ name: 'Test Assistant' }),
  ],
};

// Export fixture for advanced usage
export { fixture as personnelFixture };
