/**
 * @critical - REGRESSION. user_settings stores each setting as its own COLUMN,
 * and both transforms are field-by-field whitelists. A setting missing from
 * either one is dropped silently: no error, no warning, the value simply does
 * not survive a reload. Local mode keeps the whole object, so the same code
 * looks correct there - which is exactly how this went unnoticed for the
 * starting point, and for the assessment settings long before it.
 */
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/datastore/SupabaseDataStore.ts'),
  'utf8',
);

const bodyOf = (name: string) => {
  const start = source.indexOf(`private ${name}(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n  }', start));
};

const toDb = bodyOf('transformSettingsToDb');
const fromDb = bodyOf('transformSettingsFromDb');

/**
 * Every setting that has to survive a reload, with the column it lives in.
 * Adding a setting to AppSettings without adding it here AND to the table is
 * the bug this file exists to prevent.
 */
const PERSISTED: Array<[setting: string, column: string]> = [
  ['currentGameId', 'current_game_id'],
  ['lastHomeTeamName', 'last_home_team_name'],
  ['language', 'language'],
  ['hasSeenAppGuide', 'has_seen_app_guide'],
  ['useDemandCorrection', 'use_demand_correction'],
  ['hasConfiguredSeasonDates', 'has_configured_season_dates'],
  ['clubSeasonStartDate', 'club_season_start_date'],
  ['isDrawingModeEnabled', 'is_drawing_mode_enabled'],
  ['homeView', 'home_view'],
  ['arrivalBufferMinutes', 'arrival_buffer_minutes'],
  ['assessmentsEnabled', 'assessments_enabled'],
  ['assessmentRatingStyle', 'assessment_rating_style'],
  ['assessmentTemplate', 'assessment_template'],
  ['knownVenues', 'known_venues'],
];

describe('every setting survives the round trip to the cloud', () => {
  it.each(PERSISTED)('%s is written', (_setting, column) => {
    expect(toDb).toContain(`${column}:`);
  });

  it.each(PERSISTED)('%s is read back', (setting) => {
    expect(fromDb).toContain(`${setting}:`);
  });
});

describe('the starting point, which has four parts', () => {
  /** Only the coordinates can be measured from, but all four must persist. */
  it.each([
    'starting_point_name',
    'starting_point_address',
    'starting_point_lat',
    'starting_point_lng',
  ])('%s is written', (column) => {
    expect(toDb).toContain(`${column}:`);
  });

  it('is read back as one object', () => {
    expect(fromDb).toContain('startingPoint:');
    expect(fromDb).toContain('row.starting_point_name');
    expect(fromDb).toContain('row.starting_point_lat');
  });
});

describe('the migration that gave them somewhere to live', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/051_user_settings_missing_columns.sql'),
    'utf8',
  );

  it.each([
    'starting_point_name', 'starting_point_address', 'starting_point_lat',
    'starting_point_lng', 'arrival_buffer_minutes', 'assessments_enabled',
    'assessment_rating_style', 'assessment_template',
  ])('adds %s', (column) => {
    expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
  });

  /** Existing rows must keep behaving exactly as they do now. */
  it('adds nothing NOT NULL and backfills nothing', () => {
    expect(migration).not.toMatch(/NOT NULL/);
    expect(migration).not.toMatch(/UPDATE user_settings/i);
  });
});

describe('the venue book, which lives in one JSONB column', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/052_user_settings_known_venues.sql'),
    'utf8',
  );

  it('has a column', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS known_venues jsonb');
    expect(migration).not.toMatch(/NOT NULL/);
  });

  /** A JSONB column holds whatever was last written; every entry is checked. */
  it('is read back through the sanitizer, never cast', () => {
    expect(fromDb).toContain('knownVenues: sanitizeKnownVenues(row.known_venues)');
  });
});
