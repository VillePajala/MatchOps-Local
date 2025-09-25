/**
 * Tournament Test Fixtures
 *
 * Centralized tournament data for testing tournament functionality.
 */

import { Tournament } from '@/types';
import { TestIdGenerator, BaseFixture } from './index';

class TournamentFixture extends BaseFixture<Tournament> {
  protected getDefaults(): Tournament {
    return {
      id: TestIdGenerator.generate('tournament'),
      name: 'Test Tournament',
      startDate: '2025-06-01',
      endDate: '2025-06-03',
      location: 'Test Stadium',
      ageGroup: 'u12',
      level: 'competitive',
      archived: false,
    };
  }
}

const fixture = new TournamentFixture();

/**
 * Creates a competitive tournament
 */
export function competitive(overrides: Partial<Tournament> = {}): Tournament {
  return fixture.create({
    name: 'Regional Championship',
    level: 'competitive',
    location: 'Sports Complex',
    ...overrides,
  });
}

/**
 * Creates a friendly tournament
 */
export function friendly(overrides: Partial<Tournament> = {}): Tournament {
  return fixture.create({
    name: 'Summer Friendly Cup',
    level: 'friendly',
    location: 'Local Park',
    ...overrides,
  });
}

/**
 * Creates an archived tournament
 */
export function archived(overrides: Partial<Tournament> = {}): Tournament {
  return fixture.create({
    name: 'Past Tournament',
    startDate: '2024-05-01',
    endDate: '2024-05-03',
    archived: true,
    ...overrides,
  });
}