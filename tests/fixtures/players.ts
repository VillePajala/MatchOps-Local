/**
 * Player Test Fixtures
 *
 * Centralized player data for consistent testing across the application.
 * Provides realistic but predictable player data for reliable test scenarios.
 */

import { Player } from '@/types';
import { TestIdGenerator, BaseFixture } from './base';

/**
 * Player fixture factory providing various player types and scenarios
 */
class PlayerFixture extends BaseFixture<Player> {
  protected getDefaults(): Player {
    return {
      id: TestIdGenerator.generate('player'),
      name: 'Test Player',
      jerseyNumber: '10',
      isGoalie: false,
      relX: 0.5,
      relY: 0.5,
    };
  }

  protected getVariation(index: number): Partial<Player> {
    return {
      name: `Player ${index + 1}`,
      jerseyNumber: `${index + 1}`,
      relX: 0.2 + (index % 6) * 0.12, // Distribute across field width
      relY: 0.3 + (index % 4) * 0.15, // Distribute across field height
    };
  }
}

const fixture = new PlayerFixture();

/**
 * Creates a standard field player
 *
 * @param overrides - Optional property overrides
 * @returns Player configured as field player with default position
 *
 * @example
 * ```typescript
 * const midfielder = fieldPlayer({ name: 'John Doe', relX: 0.5 });
 * ```
 */
export function fieldPlayer(overrides: Partial<Player> = {}): Player {
  return fixture.create({
    isGoalie: false,
    relX: 0.6, // Mid-field position
    relY: 0.5,
    ...overrides,
  });
}

/**
 * Creates a goalkeeper
 *
 * @param overrides - Optional property overrides
 * @returns Player configured as goalkeeper in goal area
 *
 * @example
 * ```typescript
 * const keeper = goalkeeper({ name: 'Goal Keeper', jerseyNumber: '1' });
 * ```
 */
export function goalkeeper(overrides: Partial<Player> = {}): Player {
  return fixture.create({
    name: 'Goalkeeper',
    jerseyNumber: '1',
    isGoalie: true,
    relX: 0.1, // Goal area
    relY: 0.5, // Center of goal
    ...overrides,
  });
}

/**
 * Creates a defender
 *
 * @param overrides - Optional property overrides
 * @returns Player positioned in defensive area
 */
export function defender(overrides: Partial<Player> = {}): Player {
  return fixture.create({
    isGoalie: false,
    relX: 0.25, // Defensive third
    relY: 0.5, // Center of back line (tests can override for specific positions)
    ...overrides,
  });
}

/**
 * Creates a midfielder
 *
 * @param overrides - Optional property overrides
 * @returns Player positioned in midfield area
 */
export function midfielder(overrides: Partial<Player> = {}): Player {
  return fixture.create({
    isGoalie: false,
    relX: 0.5, // Middle third
    relY: 0.5, // Center of midfield (tests can override for specific positions)
    ...overrides,
  });
}

/**
 * Creates a forward/striker
 *
 * @param overrides - Optional property overrides
 * @returns Player positioned in attacking area
 */
export function forward(overrides: Partial<Player> = {}): Player {
  return fixture.create({
    isGoalie: false,
    relX: 0.75, // Attacking third
    relY: 0.5, // Center of forward line (tests can override for specific positions)
    ...overrides,
  });
}

/**
 * Creates a complete team roster with realistic positions
 *
 * @param options - Team configuration options
 * @returns Array of players forming a complete team
 *
 * @example
 * ```typescript
 * const team = fullTeam({ count: 11, teamName: 'Test FC' });
 * const squad = fullTeam({ count: 18 }); // Full squad with subs
 * ```
 */
export function fullTeam(options: {
  count?: number;
  teamName?: string;
  formation?: '4-4-2' | '4-3-3' | '3-5-2';
} = {}): Player[] {
  const { count = 11, teamName = 'Test Team', formation = '4-4-2' } = options;

  // Always start with goalkeeper
  const players: Player[] = [
    goalkeeper({ name: `${teamName} Goalkeeper`, jerseyNumber: '1' }),
  ];

  // Formation-based positioning
  const formations = {
    '4-4-2': {
      defenders: 4,
      midfielders: 4,
      forwards: 2,
    },
    '4-3-3': {
      defenders: 4,
      midfielders: 3,
      forwards: 3,
    },
    '3-5-2': {
      defenders: 3,
      midfielders: 5,
      forwards: 2,
    },
  };

  const { defenders: defCount, midfielders: midCount, forwards: forCount } = formations[formation];
  let jerseyNumber = 2;

  // Add defenders
  for (let i = 0; i < defCount && players.length < count; i++) {
    players.push(
      defender({
        name: `${teamName} Defender ${i + 1}`,
        jerseyNumber: `${jerseyNumber++}`,
        relY: 0.2 + (i / (defCount - 1)) * 0.6, // Spread across back line
      })
    );
  }

  // Add midfielders
  for (let i = 0; i < midCount && players.length < count; i++) {
    players.push(
      midfielder({
        name: `${teamName} Midfielder ${i + 1}`,
        jerseyNumber: `${jerseyNumber++}`,
        relY: 0.15 + (i / Math.max(midCount - 1, 1)) * 0.7, // Spread across midfield
      })
    );
  }

  // Add forwards
  for (let i = 0; i < forCount && players.length < count; i++) {
    players.push(
      forward({
        name: `${teamName} Forward ${i + 1}`,
        jerseyNumber: `${jerseyNumber++}`,
        relY: 0.3 + (i / Math.max(forCount - 1, 1)) * 0.4, // Spread across attack
      })
    );
  }

  // Fill remaining spots with field players if needed
  while (players.length < count) {
    players.push(
      fieldPlayer({
        name: `${teamName} Player ${players.length + 1}`,
        jerseyNumber: `${jerseyNumber++}`,
      })
    );
  }

  return players;
}

/**
 * Creates a minimal roster for basic testing
 *
 * @param count - Number of players to create (default: 6)
 * @returns Small roster suitable for unit tests
 */
export function minimalRoster(count: number = 6): Player[] {
  return fixture.createMany(count, { name: 'Test Player' });
}

/**
 * Creates players with specific characteristics for edge case testing
 */
export const edgeCases = {
  /**
   * Player with very long name for UI testing
   */
  longName: (): Player =>
    fieldPlayer({
      name: 'This Is A Very Long Player Name That Tests UI Boundaries And Text Wrapping Behavior',
      jerseyNumber: '99',
    }),

  /**
   * Player with special characters in name
   */
  specialCharacters: (): Player =>
    fieldPlayer({
      name: 'José María Ñoño-Çhàrles',
      jerseyNumber: '10',
    }),

  /**
   * Player with emoji in name for internationalization testing
   */
  emojiName: (): Player =>
    fieldPlayer({
      name: 'Player ⚽ 🏆',
      jerseyNumber: '7',
    }),

  /**
   * Player positioned at field boundaries
   */
  fieldBoundary: (): Player =>
    fieldPlayer({
      name: 'Boundary Player',
      relX: 0.0,
      relY: 0.0,
    }),

  /**
   * Player with maximum jersey number
   */
  maxJerseyNumber: (): Player =>
    fieldPlayer({
      name: 'Max Jersey',
      jerseyNumber: '999',
    }),

  /**
   * Player with empty jersey number for error testing
   */
  emptyJerseyNumber: (): Player =>
    fieldPlayer({
      name: 'Empty Jersey',
      jerseyNumber: '',
    }),
};

/**
 * Common player collections for different test scenarios
 */
export const collections = {
  /**
   * Starting XI for a professional match
   */
  startingEleven: () => fullTeam({ count: 11, formation: '4-3-3' }),

  /**
   * Full squad with substitutes
   */
  fullSquad: () => fullTeam({ count: 18 }),

  /**
   * Youth team with younger player names
   */
  youthTeam: () =>
    fullTeam({ count: 11, teamName: 'Youth' }).map((player, i) => ({
      ...player,
      name: `Youth Player ${i + 1}`,
    })),

  /**
   * Minimal team for quick tests
   */
  quickTest: () => [
    goalkeeper({ name: 'Test Keeper' }),
    fieldPlayer({ name: 'Test Player 1' }),
    fieldPlayer({ name: 'Test Player 2' }),
  ],
};

// Export individual factories for backward compatibility
export { fixture as playerFixture };
