/**
 * Season Test Fixtures
 *
 * Centralized season data for testing season management functionality.
 */

import { Season } from '@/types';
import { TestIdGenerator, BaseFixture } from './index';

class SeasonFixture extends BaseFixture<Season> {
  protected getDefaults(): Season {
    const currentYear = new Date().getFullYear();
    return {
      id: TestIdGenerator.generate('season'),
      name: `Test Season ${currentYear}`,
      startDate: `${currentYear}-01-01`,
      endDate: `${currentYear}-12-31`,
      ageGroup: 'u12',
      archived: false,
    };
  }
}

const fixture = new SeasonFixture();

/**
 * Creates a current active season
 */
export function current(overrides: Partial<Season> = {}): Season {
  const currentYear = new Date().getFullYear();
  return fixture.create({
    name: `${currentYear} Season`,
    startDate: `${currentYear}-01-01`,
    endDate: `${currentYear}-12-31`,
    archived: false,
    ...overrides,
  });
}

/**
 * Creates an archived season
 */
export function archived(overrides: Partial<Season> = {}): Season {
  const lastYear = new Date().getFullYear() - 1;
  return fixture.create({
    name: `${lastYear} Season`,
    startDate: `${lastYear}-01-01`,
    endDate: `${lastYear}-12-31`,
    archived: true,
    ...overrides,
  });
}

/**
 * Creates a future season
 */
export function future(overrides: Partial<Season> = {}): Season {
  const nextYear = new Date().getFullYear() + 1;
  return fixture.create({
    name: `${nextYear} Season`,
    startDate: `${nextYear}-01-01`,
    endDate: `${nextYear}-12-31`,
    archived: false,
    ...overrides,
  });
}

/**
 * Common season collections
 */
export const collections = {
  multipleSeasons: () => [
    archived({ name: '2022 Season', ageGroup: 'u10' }),
    archived({ name: '2023 Season', ageGroup: 'u11' }),
    current({ name: '2024 Season', ageGroup: 'u12' }),
    future({ name: '2025 Season', ageGroup: 'u13' }),
  ],
};