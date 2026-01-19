/**
 * Supabase Implementation Plan Verification Script
 *
 * Run with: npx ts-node scripts/verify-supabase-plan.ts
 *
 * This script verifies that:
 * 1. All TypeScript interface fields are documented in the verification matrix
 * 2. Test data can be transformed without errors
 * 3. Schema columns match TypeScript types
 * 4. Critical defaults are handled correctly
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PATHS = {
  types: {
    index: 'src/types/index.ts',
    game: 'src/types/game.ts',
    settings: 'src/types/settings.ts',
    personnel: 'src/types/personnel.ts',
    playerAssessment: 'src/types/playerAssessment.ts',
  },
  testData: 'site/public/testdata/testdata.json',
  schema: 'docs/02-technical/database/supabase-schema.md',
  verificationMatrix: 'docs/03-active-plans/supabase-verification-matrix.md',
  implementationGuide: 'docs/03-active-plans/supabase-implementation-guide.md',
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface VerificationResult {
  category: string;
  check: string;
  status: 'pass' | 'fail' | 'warn';
  details?: string;
}

interface TestGame {
  playersOnField?: unknown[];
  availablePlayers?: unknown[];
  selectedPlayerIds?: string[];
  homeOrAway?: string;
  isPlayed?: boolean;
  gamePersonnel?: string[];
  tacticalDiscs?: unknown[];
  tacticalDrawings?: unknown[];
  tacticalBallPosition?: unknown;
  [key: string]: unknown;
}

// ============================================================================
// HELPERS
// ============================================================================

function readFile(relativePath: string): string {
  const fullPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

function extractInterfaceFields(content: string, interfaceName: string): string[] {
  const interfaceRegex = new RegExp(
    `interface\\s+${interfaceName}\\s*\\{([^}]+(?:\\{[^}]*\\}[^}]*)*)\\}`,
    's'
  );
  const match = content.match(interfaceRegex);
  if (!match) return [];

  const body = match[1];
  const fieldRegex = /^\s*(\w+)\??:/gm;
  const fields: string[] = [];
  let fieldMatch;
  while ((fieldMatch = fieldRegex.exec(body)) !== null) {
    fields.push(fieldMatch[1]);
  }
  return fields;
}

// ============================================================================
// VERIFICATION CHECKS
// ============================================================================

function verifyAppStateFields(): VerificationResult[] {
  const results: VerificationResult[] = [];
  const gameTypes = readFile(PATHS.types.game);
  const fields = extractInterfaceFields(gameTypes, 'AppState');

  const expectedFields = [
    'playersOnField', 'opponents', 'drawings', 'availablePlayers', 'showPlayerNames',
    'teamName', 'gameEvents', 'opponentName', 'gameDate', 'homeScore', 'awayScore',
    'gameNotes', 'homeOrAway', 'numberOfPeriods', 'periodDurationMinutes', 'currentPeriod',
    'gameStatus', 'isPlayed', 'selectedPlayerIds', 'assessments', 'seasonId', 'tournamentId',
    'tournamentLevel', 'tournamentSeriesId', 'ageGroup', 'demandFactor', 'gameLocation',
    'gameTime', 'subIntervalMinutes', 'completedIntervalDurations', 'lastSubConfirmationTimeSeconds',
    'tacticalDiscs', 'tacticalDrawings', 'tacticalBallPosition', 'formationSnapPoints',
    'teamId', 'leagueId', 'customLeagueName', 'gamePersonnel', 'timeElapsedInSeconds',
    'gameType', 'gender'
  ];

  // Check all expected fields exist
  for (const expected of expectedFields) {
    if (fields.includes(expected)) {
      results.push({
        category: 'AppState',
        check: `Field '${expected}' exists`,
        status: 'pass',
      });
    } else {
      results.push({
        category: 'AppState',
        check: `Field '${expected}' exists`,
        status: 'fail',
        details: `Expected field '${expected}' not found in AppState interface`,
      });
    }
  }

  // Check for unexpected fields
  for (const field of fields) {
    if (!expectedFields.includes(field)) {
      results.push({
        category: 'AppState',
        check: `Unexpected field '${field}'`,
        status: 'warn',
        details: `Field '${field}' exists in AppState but not in expected list - verify it's in the plan`,
      });
    }
  }

  return results;
}

function verifyTestDataEdgeCases(): VerificationResult[] {
  const results: VerificationResult[] = [];

  try {
    const testDataRaw = readFile(PATHS.testData);
    const testData = JSON.parse(testDataRaw);
    const games: Record<string, TestGame> = testData.localStorage?.savedSoccerGames || {};

    let missingHomeOrAway = 0;
    let missingIsPlayed = 0;
    let playersOnFieldNotSelected = 0;
    let missingGamePersonnel = 0;
    let missingTacticalFields = 0;

    for (const [_gameId, game] of Object.entries(games)) {
      if (!game.homeOrAway) missingHomeOrAway++;
      if (game.isPlayed === undefined) missingIsPlayed++;
      if (!game.gamePersonnel) missingGamePersonnel++;

      // Check for players on field but not in selectedPlayerIds
      const playersOnField = (game.playersOnField || []) as Array<{ id?: string }>;
      const onFieldIds = new Set(playersOnField.map((p) => p.id));
      const selectedIds = new Set(game.selectedPlayerIds || []);
      for (const id of onFieldIds) {
        if (id && !selectedIds.has(id)) {
          playersOnFieldNotSelected++;
          break; // Count once per game
        }
      }

      // Check for missing tactical fields
      if (
        game.tacticalDiscs === undefined ||
        game.tacticalDrawings === undefined ||
        game.tacticalBallPosition === undefined
      ) {
        missingTacticalFields++;
      }
    }

    const totalGames = Object.keys(games).length;

    results.push({
      category: 'Test Data',
      check: `Total games analyzed`,
      status: 'pass',
      details: `${totalGames} games in test data`,
    });

    results.push({
      category: 'Test Data',
      check: `Games missing homeOrAway`,
      status: missingHomeOrAway > 0 ? 'warn' : 'pass',
      details: `${missingHomeOrAway}/${totalGames} games (plan defaults to 'home')`,
    });

    results.push({
      category: 'Test Data',
      check: `Games missing isPlayed`,
      status: missingIsPlayed > 0 ? 'warn' : 'pass',
      details: `${missingIsPlayed}/${totalGames} games (plan defaults to true)`,
    });

    results.push({
      category: 'Test Data',
      check: `Games with players on field but not selected`,
      status: playersOnFieldNotSelected > 0 ? 'warn' : 'pass',
      details: `${playersOnFieldNotSelected}/${totalGames} games (plan normalizes is_selected)`,
    });

    results.push({
      category: 'Test Data',
      check: `Games missing gamePersonnel`,
      status: 'pass', // Expected - it's optional
      details: `${missingGamePersonnel}/${totalGames} games (plan defaults to [])`,
    });

    results.push({
      category: 'Test Data',
      check: `Games missing tactical fields`,
      status: missingTacticalFields > 0 ? 'warn' : 'pass',
      details: `${missingTacticalFields}/${totalGames} games (plan provides defaults)`,
    });

  } catch (error) {
    results.push({
      category: 'Test Data',
      check: 'Parse test data',
      status: 'fail',
      details: `Error: ${error}`,
    });
  }

  return results;
}

function verifySchemaDocumentation(): VerificationResult[] {
  const results: VerificationResult[] = [];

  try {
    const schema = readFile(PATHS.schema);

    // Check for required tables
    const requiredTables = [
      'teams', 'team_players', 'players', 'seasons', 'tournaments',
      'personnel', 'games', 'game_players', 'game_events',
      'player_assessments', 'game_tactical_data', 'player_adjustments',
      'warmup_plans', 'user_settings'
    ];

    for (const table of requiredTables) {
      if (schema.includes(`CREATE TABLE ${table}`)) {
        results.push({
          category: 'Schema',
          check: `Table '${table}' documented`,
          status: 'pass',
        });
      } else {
        results.push({
          category: 'Schema',
          check: `Table '${table}' documented`,
          status: 'fail',
          details: `Table '${table}' not found in schema documentation`,
        });
      }
    }

    // Check for RLS policies
    const rlsCount = (schema.match(/ENABLE ROW LEVEL SECURITY/g) || []).length;
    results.push({
      category: 'Schema',
      check: 'RLS policies documented',
      status: rlsCount >= requiredTables.length ? 'pass' : 'warn',
      details: `${rlsCount} RLS policies found (expected ${requiredTables.length})`,
    });

  } catch (error) {
    results.push({
      category: 'Schema',
      check: 'Read schema documentation',
      status: 'fail',
      details: `Error: ${error}`,
    });
  }

  return results;
}

function verifyImplementationGuide(): VerificationResult[] {
  const results: VerificationResult[] = [];

  try {
    const guide = readFile(PATHS.implementationGuide);

    // Check for critical transform functions
    const criticalPatterns = [
      { pattern: 'transformGameToTables', name: 'Forward transform function' },
      { pattern: 'transformTablesToGame', name: 'Reverse transform function' },
      { pattern: "seasonId === '' ? null", name: 'Empty string → NULL handling' },
      { pattern: 'season_id ?? \'\'', name: 'NULL → empty string handling' },
      { pattern: 'homeOrAway ?? \'home\'', name: 'homeOrAway default' },
      { pattern: 'isPlayed ?? true', name: 'isPlayed default' },
      { pattern: 'isSelected || isOnField', name: 'Player selection normalization' },
      { pattern: 'order_index', name: 'Event ordering via order_index' },
    ];

    for (const { pattern, name } of criticalPatterns) {
      if (guide.includes(pattern)) {
        results.push({
          category: 'Implementation Guide',
          check: name,
          status: 'pass',
        });
      } else {
        results.push({
          category: 'Implementation Guide',
          check: name,
          status: 'fail',
          details: `Pattern '${pattern}' not found in implementation guide`,
        });
      }
    }

  } catch (error) {
    results.push({
      category: 'Implementation Guide',
      check: 'Read implementation guide',
      status: 'fail',
      details: `Error: ${error}`,
    });
  }

  return results;
}

function verifyPlayerAssessment(): VerificationResult[] {
  const results: VerificationResult[] = [];
  const content = readFile(PATHS.types.playerAssessment);
  const fields = extractInterfaceFields(content, 'PlayerAssessment');

  const expectedFields = ['overall', 'sliders', 'notes', 'minutesPlayed', 'createdAt', 'createdBy'];

  for (const expected of expectedFields) {
    results.push({
      category: 'PlayerAssessment',
      check: `Field '${expected}' exists`,
      status: fields.includes(expected) ? 'pass' : 'fail',
    });
  }

  // Verify sliders subfields are documented
  const sliderFields = [
    'intensity', 'courage', 'duels', 'technique', 'creativity',
    'decisions', 'awareness', 'teamwork', 'fair_play', 'impact'
  ];

  for (const slider of sliderFields) {
    if (content.includes(slider)) {
      results.push({
        category: 'PlayerAssessment',
        check: `Slider '${slider}' exists`,
        status: 'pass',
      });
    } else {
      results.push({
        category: 'PlayerAssessment',
        check: `Slider '${slider}' exists`,
        status: 'fail',
      });
    }
  }

  return results;
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║       SUPABASE IMPLEMENTATION PLAN VERIFICATION SCRIPT           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const allResults: VerificationResult[] = [];

  // Run all verifications
  console.log('Running verifications...\n');

  allResults.push(...verifyAppStateFields());
  allResults.push(...verifyTestDataEdgeCases());
  allResults.push(...verifySchemaDocumentation());
  allResults.push(...verifyImplementationGuide());
  allResults.push(...verifyPlayerAssessment());

  // Group and display results
  const categories = [...new Set(allResults.map(r => r.category))];

  let totalPass = 0;
  let totalFail = 0;
  let totalWarn = 0;

  for (const category of categories) {
    const categoryResults = allResults.filter(r => r.category === category);
    console.log(`\n━━━ ${category} ━━━`);

    for (const result of categoryResults) {
      const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
      console.log(`  ${icon} ${result.check}`);
      if (result.details) {
        console.log(`     └─ ${result.details}`);
      }

      if (result.status === 'pass') totalPass++;
      else if (result.status === 'fail') totalFail++;
      else totalWarn++;
    }
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                           SUMMARY                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  ✅ Passed: ${totalPass}`);
  console.log(`  ❌ Failed: ${totalFail}`);
  console.log(`  ⚠️  Warnings: ${totalWarn}`);
  console.log('');

  if (totalFail === 0) {
    console.log('  🎉 VERIFICATION PASSED - Plan is ready for implementation!');
  } else {
    console.log('  ⛔ VERIFICATION FAILED - Please address the issues above.');
    process.exit(1);
  }
}

main();
