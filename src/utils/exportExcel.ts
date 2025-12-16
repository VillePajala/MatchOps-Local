import * as XLSX from 'xlsx';
import {
  AppState,
  Player,
  PlayerStatRow,
  Season,
  Tournament,
  SavedGamesCollection,
  PlayerStatAdjustment,
} from '@/types';
import { formatTime } from './time';

/**
 * Translation function type for Excel exports
 * Compatible with i18next's t() function
 */
export type TranslationFn = (key: string, defaultValue?: string) => string;

/**
 * Create a TranslationFn wrapper from i18next's t function
 * Adapts the i18next signature to the simpler TranslationFn signature
 */
export const createTranslateFn = (
  t: (key: string, defaultValue?: string) => string
): TranslationFn => (key: string, defaultValue?: string) => t(key, defaultValue ?? key);

/**
 * Default translation function that returns the default value or key
 */
const defaultTranslate: TranslationFn = (key: string, defaultValue?: string) =>
  defaultValue || key;

/**
 * Sanitize filename to remove invalid characters and prevent issues
 *
 * @param filename - Raw filename string
 * @returns Sanitized filename safe for downloads
 */
const sanitizeFilename = (filename: string): string => {
  return filename
    // Normalize unicode characters (important for Finnish/international names)
    .normalize('NFD')
    // Remove combining diacritical marks
    .replace(/[\u0300-\u036f]/g, '')
    // Replace invalid filesystem characters with underscore
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    // Replace multiple underscores with single
    .replace(/_+/g, '_')
    // Trim underscores and spaces from edges
    .replace(/^[_\s]+|[_\s]+$/g, '')
    // Limit length to prevent filesystem issues (keep extension)
    .substring(0, 200);
};

/**
 * Utility to trigger a download of an Excel file
 */
const triggerDownload = (workbook: XLSX.WorkBook, filename: string): void => {
  try {
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = sanitizeFilename(filename);
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Delay URL revocation to ensure download starts properly
    // Immediate revocation can cause issues in some browsers
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    throw new Error('Failed to generate Excel file. Please try again.', { cause: error });
  }
};

/**
 * Generate timestamp for filenames
 */
const getTimestamp = (): string => {
  const now = new Date();
  return `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now
    .getDate()
    .toString()
    .padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
};

/**
 * Force text formatting on a column to prevent Excel auto-formatting
 * (e.g., converting "2017" to a number/date)
 *
 * @param sheet - The worksheet to modify
 * @param columnName - The header name of the column to format as text
 */
const setColumnAsText = (sheet: XLSX.WorkSheet, columnName: string): void => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  // Find the column index for the given header name
  let colIndex = -1;
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    const cell = sheet[cellAddress];
    if (cell && cell.v === columnName) {
      colIndex = col;
      break;
    }
  }

  if (colIndex === -1) return; // Column not found

  // Set all cells in that column (except header) to text format
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: colIndex });
    const cell = sheet[cellAddress];
    if (cell) {
      cell.t = 's'; // Force string type
      cell.z = '@'; // Text format
    }
  }
};

/**
 * Calculate Win/Loss/Tie record from games
 */
const calculateRecord = (
  games: SavedGamesCollection
): { wins: number; losses: number; ties: number } => {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  Object.values(games).forEach((game) => {
    // Skip games explicitly marked as "not yet played" in game settings
    if (game.isPlayed === false) return;

    const isHome = game.homeOrAway === 'home';
    const ourScore = isHome ? game.homeScore : game.awayScore;
    const theirScore = isHome ? game.awayScore : game.homeScore;

    if (ourScore > theirScore) wins++;
    else if (ourScore < theirScore) losses++;
    else ties++;
  });

  return { wins, losses, ties };
};

/**
 * Export a single game to Excel with multiple sheets
 *
 * Generates an Excel workbook with the following sheets:
 * - Player Stats: Goals, assists, points for all players in the game
 * - Events: Timeline of goals and opponent goals
 * - Game Info: Metadata (date, location, scores, settings)
 * - Assessments: Player performance ratings (if available)
 * - Substitution Intervals: Period timing data (if available)
 *
 * @param gameId - Unique identifier for the game
 * @param game - Complete game state containing all game data
 * @param players - All players in the roster for name lookups
 * @param seasons - All seasons for season name resolution (optional)
 * @param tournaments - All tournaments for tournament name resolution (optional)
 * @throws {Error} If Excel generation or download fails
 */
export const exportCurrentGameExcel = (
  gameId: string,
  game: AppState,
  players: Player[],
  seasons: Season[] = [],
  tournaments: Tournament[] = [],
  translate: TranslationFn = defaultTranslate
): void => {
  try {
    const workbook = XLSX.utils.book_new();

  // Translation keys for common values
  const yes = translate('export.yes', 'Yes');
  const no = translate('export.no', 'No');

  const seasonName = game.seasonId ? seasons.find((s) => s.id === game.seasonId)?.name : '';
  const tournamentName = game.tournamentId
    ? tournaments.find((t) => t.id === game.tournamentId)?.name
    : '';

  // Sheet 1: Player Stats
  const selectedPlayers = players.filter((p) => game.selectedPlayerIds?.includes(p.id));

  // Store translated keys as constants for type-safe sorting
  const pointsKey = translate('export.points', 'Points');
  const goalsKey = translate('export.goals', 'Goals');

  const playerStats = selectedPlayers
    .map((p) => {
      const goals = game.gameEvents.filter((e) => e.type === 'goal' && e.scorerId === p.id).length;
      const assists = game.gameEvents.filter((e) => e.type === 'goal' && e.assisterId === p.id).length;
      const totalScore = goals + assists;
      return {
        [translate('export.player', 'Player')]: p.name,
        [translate('export.jerseyNumber', 'Jersey #')]: p.jerseyNumber || '',
        [translate('export.nickname', 'Nickname')]: p.nickname || '',
        [goalsKey]: goals,
        [translate('export.assists', 'Assists')]: assists,
        [pointsKey]: totalScore,
        [translate('export.fairPlay', 'Fair Play')]: p.receivedFairPlayCard ? yes : no,
        [translate('export.goalie', 'Goalie')]: p.isGoalie ? yes : no,
        [translate('export.notes', 'Notes')]: p.notes || '',
      };
    })
    .sort((a, b) => {
      const pointDiff = (b[pointsKey] as number) - (a[pointsKey] as number);
      const goalDiff = (b[goalsKey] as number) - (a[goalsKey] as number);
      return pointDiff || goalDiff;
    });

  const notesHeader = translate('export.notes', 'Notes');
  const playerStatsSheet = XLSX.utils.json_to_sheet(playerStats);
  setColumnAsText(playerStatsSheet, notesHeader);
  XLSX.utils.book_append_sheet(workbook, playerStatsSheet, translate('export.sheetPlayerStats', 'Player Stats'));

  // Sheet 2: Events
  const sortedEvents = game.gameEvents
    .filter((e) => e.type === 'goal' || e.type === 'opponentGoal')
    .sort((a, b) => a.time - b.time);
  const eventData = sortedEvents.map((event) => ({
    [translate('export.time', 'Time')]: formatTime(event.time),
    [translate('export.type', 'Type')]: event.type === 'goal' ? translate('export.goal', 'Goal') : translate('export.opponentGoal', 'Opponent Goal'),
    [translate('export.scorer', 'Scorer')]:
      event.type === 'goal'
        ? selectedPlayers.find((p) => p.id === event.scorerId)?.name || event.scorerId || ''
        : game.opponentName || translate('export.opponent', 'Opponent'),
    [translate('export.assister', 'Assister')]:
      event.type === 'goal' && event.assisterId
        ? selectedPlayers.find((p) => p.id === event.assisterId)?.name || event.assisterId || ''
        : '',
  }));

  const eventsSheet = eventData.length > 0
    ? XLSX.utils.json_to_sheet(eventData)
    : XLSX.utils.json_to_sheet([{ [translate('export.message', 'Message')]: translate('export.noGoalsLogged', 'No goals logged') }]);
  XLSX.utils.book_append_sheet(workbook, eventsSheet, translate('export.sheetEvents', 'Events'));

  // Sheet 3: Game Info
  const isHome = game.homeOrAway === 'home';
  const ourScore = isHome ? game.homeScore : game.awayScore;
  const theirScore = isHome ? game.awayScore : game.homeScore;
  let result = translate('export.notStarted', 'Not Started');
  if (game.isPlayed) {
    if (ourScore > theirScore) result = translate('export.win', 'Win');
    else if (ourScore < theirScore) result = translate('export.loss', 'Loss');
    else result = translate('export.tie', 'Tie');
  }

  const totalDuration = (game.completedIntervalDurations || []).reduce(
    (sum, log) => sum + log.duration,
    0
  );

  const fieldLabel = translate('export.field', 'Field');
  const valueLabel = translate('export.value', 'Value');
  const gameInfo = [
    { [fieldLabel]: translate('export.gameId', 'Game ID'), [valueLabel]: gameId },
    { [fieldLabel]: translate('export.gameDate', 'Game Date'), [valueLabel]: game.gameDate },
    { [fieldLabel]: translate('export.gameTime', 'Game Time'), [valueLabel]: game.gameTime || '' },
    { [fieldLabel]: translate('export.location', 'Location'), [valueLabel]: game.gameLocation || '' },
    { [fieldLabel]: translate('export.homeTeam', 'Home Team'), [valueLabel]: game.teamName },
    { [fieldLabel]: translate('export.awayTeam', 'Away Team'), [valueLabel]: game.opponentName },
    { [fieldLabel]: translate('export.homeScore', 'Home Score'), [valueLabel]: game.homeScore },
    { [fieldLabel]: translate('export.awayScore', 'Away Score'), [valueLabel]: game.awayScore },
    { [fieldLabel]: translate('export.wePlayedAs', 'We Played As'), [valueLabel]: game.homeOrAway },
    { [fieldLabel]: translate('export.result', 'Result'), [valueLabel]: result },
    { [fieldLabel]: translate('export.goalDifference', 'Goal Difference'), [valueLabel]: ourScore - theirScore },
    { [fieldLabel]: translate('export.season', 'Season'), [valueLabel]: seasonName || game.seasonId || translate('export.none', 'None') },
    { [fieldLabel]: translate('export.tournament', 'Tournament'), [valueLabel]: tournamentName || game.tournamentId || translate('export.none', 'None') },
    { [fieldLabel]: translate('export.tournamentLevel', 'Tournament Level'), [valueLabel]: game.tournamentLevel || '' },
    { [fieldLabel]: translate('export.ageGroup', 'Age Group'), [valueLabel]: game.ageGroup || '' },
    { [fieldLabel]: translate('export.demandFactor', 'Demand Factor'), [valueLabel]: game.demandFactor || '' },
    { [fieldLabel]: translate('export.teamId', 'Team ID'), [valueLabel]: game.teamId || '' },
    { [fieldLabel]: translate('export.gameStatus', 'Game Status'), [valueLabel]: game.gameStatus },
    { [fieldLabel]: translate('export.isPlayed', 'Is Played'), [valueLabel]: game.isPlayed ? yes : no },
    { [fieldLabel]: '', [valueLabel]: '' },
    { [fieldLabel]: translate('export.gameSettings', 'Game Settings'), [valueLabel]: '' },
    { [fieldLabel]: translate('export.numberOfPeriods', 'Number of Periods'), [valueLabel]: game.numberOfPeriods },
    { [fieldLabel]: translate('export.periodDuration', 'Period Duration (min)'), [valueLabel]: game.periodDurationMinutes },
    { [fieldLabel]: translate('export.substitutionInterval', 'Substitution Interval (min)'), [valueLabel]: game.subIntervalMinutes ?? '' },
    { [fieldLabel]: translate('export.currentPeriod', 'Current Period'), [valueLabel]: game.currentPeriod },
    { [fieldLabel]: translate('export.totalGameDuration', 'Total Game Duration'), [valueLabel]: formatTime(totalDuration) },
    { [fieldLabel]: '', [valueLabel]: '' },
    { [fieldLabel]: translate('export.notes', 'Notes'), [valueLabel]: game.gameNotes || '' },
  ];

  const gameInfoSheet = XLSX.utils.json_to_sheet(gameInfo);
  XLSX.utils.book_append_sheet(workbook, gameInfoSheet, translate('export.sheetGameInfo', 'Game Info'));

  // Sheet 4: Assessments (if available)
  if (game.assessments && Object.keys(game.assessments).length > 0) {
    const assessmentData = selectedPlayers
      .filter((p) => game.assessments && game.assessments[p.id])
      .map((p) => {
        const assessment = game.assessments![p.id];
        return {
          [translate('export.player', 'Player')]: p.name,
          [translate('export.overall', 'Overall')]: assessment.overall,
          [translate('export.intensity', 'Intensity')]: assessment.sliders.intensity,
          [translate('export.courage', 'Courage')]: assessment.sliders.courage,
          [translate('export.duels', 'Duels')]: assessment.sliders.duels,
          [translate('export.technique', 'Technique')]: assessment.sliders.technique,
          [translate('export.creativity', 'Creativity')]: assessment.sliders.creativity,
          [translate('export.decisions', 'Decisions')]: assessment.sliders.decisions,
          [translate('export.awareness', 'Awareness')]: assessment.sliders.awareness,
          [translate('export.teamwork', 'Teamwork')]: assessment.sliders.teamwork,
          [translate('export.fairPlay', 'Fair Play')]: assessment.sliders.fair_play,
          [translate('export.impact', 'Impact')]: assessment.sliders.impact,
          [translate('export.notes', 'Notes')]: assessment.notes || '',
          [translate('export.assessmentDate', 'Assessment Date')]: new Date(assessment.createdAt).toLocaleString(),
          [translate('export.assessedBy', 'Assessed By')]: assessment.createdBy || '',
        };
      });

    if (assessmentData.length > 0) {
      const assessmentSheet = XLSX.utils.json_to_sheet(assessmentData);
      setColumnAsText(assessmentSheet, notesHeader);
      XLSX.utils.book_append_sheet(workbook, assessmentSheet, translate('export.sheetAssessments', 'Assessments'));
    }
  }

  // Sheet 5: Substitution Intervals
  const intervals = game.completedIntervalDurations || [];
  if (intervals.length > 0) {
    const intervalData = intervals
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((log) => ({
        [translate('export.period', 'Period')]: log.period,
        [translate('export.duration', 'Duration (mm:ss)')]: formatTime(log.duration),
        [translate('export.timestamp', 'Timestamp')]: new Date(log.timestamp).toLocaleString(),
      }));

    const intervalsSheet = XLSX.utils.json_to_sheet(intervalData);
    XLSX.utils.book_append_sheet(workbook, intervalsSheet, translate('export.sheetSubstitutionIntervals', 'Substitution Intervals'));
  }

    const filename = `MatchOps_Game_${gameId}_${getTimestamp()}.xlsx`;
    triggerDownload(workbook, filename);
  } catch (error) {
    throw new Error('Failed to export game to Excel. Please try again.', { cause: error });
  }
};

/**
 * Export aggregate stats to Excel with multiple sheets
 *
 * Generates an Excel workbook with the following sheets:
 * - Player Stats Summary: Aggregated goals, assists, points per player
 * - Team Performance: Win/loss record, goals for/against
 * - Game Details: List of all games with scores and metadata
 * - Season Breakdown: Stats grouped by season (if multiple seasons)
 * - Tournament Breakdown: Stats grouped by tournament (if multiple tournaments)
 * - Assessments Summary: Average player ratings across all games (if available)
 * - External Games: Non-MatchOps games added manually (if any)
 *
 * @param games - Collection of all games to aggregate
 * @param aggregateStats - Pre-calculated player statistics
 * @param seasons - All seasons for season name resolution (optional)
 * @param tournaments - All tournaments for tournament name resolution (optional)
 * @param externalAdjustments - External game adjustments to include (optional)
 * @param contextType - Type of export context: 'season', 'tournament', or 'overall' (optional)
 * @param contextId - ID of season/tournament if contextType is specified (optional)
 * @throws {Error} If Excel generation or download fails
 */
export const exportAggregateExcel = (
  games: SavedGamesCollection,
  aggregateStats: PlayerStatRow[],
  seasons: Season[] = [],
  tournaments: Tournament[] = [],
  externalAdjustments: PlayerStatAdjustment[] = [],
  contextType?: 'season' | 'tournament' | 'overall',
  contextId?: string,
  translate: TranslationFn = defaultTranslate
): void => {
  try {
    const workbook = XLSX.utils.book_new();
  const yes = translate('export.yes', 'Yes');
  const no = translate('export.no', 'No');
  const notesHeader = translate('export.notes', 'Notes');

  // Sheet 1: Player Stats Summary
  // Include zero rows when there are no games in the dataset (e.g., team filter with no games)
  const includeZeroRows = Object.keys(games || {}).length === 0 || (aggregateStats.length > 0 && aggregateStats.every(p => (p.gamesPlayed || 0) === 0));
  const playerSummary = aggregateStats
    .filter((player) => includeZeroRows ? true : player.gamesPlayed > 0)
    .map((player) => ({
      [translate('export.player', 'Player')]: player.name,
      [translate('export.jerseyNumber', 'Jersey #')]: player.jerseyNumber || '',
      [translate('export.nickname', 'Nickname')]: player.nickname || '',
      [translate('export.gamesPlayed', 'Games Played')]: player.gamesPlayed,
      [translate('export.goals', 'Goals')]: player.goals,
      [translate('export.assists', 'Assists')]: player.assists,
      [translate('export.points', 'Points')]: player.totalScore,
      [translate('export.avgPointsPerGame', 'Avg Points/Game')]: player.avgPoints.toFixed(2),
      [translate('export.fairPlayAwards', 'Fair Play Awards')]: player.fpAwards ?? 0,
      [translate('export.goalie', 'Goalie')]: player.isGoalie ? yes : no,
      [notesHeader]: player.notes || '',
    }));

  const summarySheet = XLSX.utils.json_to_sheet(playerSummary);
  setColumnAsText(summarySheet, notesHeader);
  XLSX.utils.book_append_sheet(workbook, summarySheet, translate('export.sheetPlayerStatsSummary', 'Player Stats Summary'));

  // Sheet 2: Team Performance
  const gameArray = Object.values(games);
  const record = calculateRecord(games);
  const totalGames = record.wins + record.losses + record.ties;
  const winPct = totalGames > 0 ? ((record.wins / totalGames) * 100).toFixed(1) : '0.0';

  let goalsFor = 0;
  let goalsAgainst = 0;

  gameArray.forEach((game) => {
    const isHome = game.homeOrAway === 'home';
    goalsFor += isHome ? game.homeScore : game.awayScore;
    goalsAgainst += isHome ? game.awayScore : game.homeScore;
  });

  const goalDiff = goalsFor - goalsAgainst;
  const avgGoalsFor = totalGames > 0 ? (goalsFor / totalGames).toFixed(2) : '0.00';
  const avgGoalsAgainst = totalGames > 0 ? (goalsAgainst / totalGames).toFixed(2) : '0.00';

  const metricLabel = translate('export.metric', 'Metric');
  const valueLabel = translate('export.value', 'Value');
  const performanceData = [
    { [metricLabel]: translate('export.gamesPlayed', 'Games Played'), [valueLabel]: totalGames },
    { [metricLabel]: translate('export.wins', 'Wins'), [valueLabel]: record.wins },
    { [metricLabel]: translate('export.losses', 'Losses'), [valueLabel]: record.losses },
    { [metricLabel]: translate('export.ties', 'Ties'), [valueLabel]: record.ties },
    { [metricLabel]: translate('export.winPercentage', 'Win Percentage'), [valueLabel]: `${winPct}%` },
    { [metricLabel]: translate('export.goalsFor', 'Goals For'), [valueLabel]: goalsFor },
    { [metricLabel]: translate('export.goalsAgainst', 'Goals Against'), [valueLabel]: goalsAgainst },
    { [metricLabel]: translate('export.goalDifference', 'Goal Difference'), [valueLabel]: goalDiff > 0 ? `+${goalDiff}` : goalDiff },
    { [metricLabel]: translate('export.avgGoalsForPerGame', 'Avg Goals For/Game'), [valueLabel]: avgGoalsFor },
    { [metricLabel]: translate('export.avgGoalsAgainstPerGame', 'Avg Goals Against/Game'), [valueLabel]: avgGoalsAgainst },
  ];

  const performanceSheet = XLSX.utils.json_to_sheet(performanceData);
  XLSX.utils.book_append_sheet(workbook, performanceSheet, translate('export.sheetTeamPerformance', 'Team Performance'));

  // Sheet 3: Game Details
  const gameDetails = Object.entries(games).map(([id, game]) => {
    const isHome = game.homeOrAway === 'home';
    const ourScore = isHome ? game.homeScore : game.awayScore;
    const theirScore = isHome ? game.awayScore : game.homeScore;
    let result = '';
    if (ourScore > theirScore) result = translate('export.winShort', 'W');
    else if (ourScore < theirScore) result = translate('export.lossShort', 'L');
    else result = translate('export.tieShort', 'T');

    const seasonName = game.seasonId ? seasons.find((s) => s.id === game.seasonId)?.name : '';
    const tournamentName = game.tournamentId
      ? tournaments.find((tr) => tr.id === game.tournamentId)?.name
      : '';

    return {
      [translate('export.gameId', 'Game ID')]: id,
      [translate('export.date', 'Date')]: game.gameDate,
      [translate('export.time', 'Time')]: game.gameTime || '',
      [translate('export.location', 'Location')]: game.gameLocation || '',
      [translate('export.homeTeam', 'Home Team')]: game.teamName,
      [translate('export.awayTeam', 'Away Team')]: game.opponentName,
      [translate('export.homeScore', 'Home Score')]: game.homeScore,
      [translate('export.awayScore', 'Away Score')]: game.awayScore,
      [translate('export.wePlayed', 'We Played')]: game.homeOrAway,
      [translate('export.result', 'Result')]: result,
      [translate('export.goalDiff', 'Goal Diff')]: ourScore - theirScore,
      [translate('export.season', 'Season')]: seasonName || game.seasonId || '',
      [translate('export.tournament', 'Tournament')]: tournamentName || game.tournamentId || '',
      [translate('export.tournamentLevel', 'Tournament Level')]: game.tournamentLevel || '',
      [translate('export.ageGroup', 'Age Group')]: game.ageGroup || '',
      [translate('export.demandFactor', 'Demand Factor')]: game.demandFactor || '',
      [translate('export.teamId', 'Team ID')]: game.teamId || '',
      [notesHeader]: game.gameNotes || '',
    };
  });

  const gamesSheet = XLSX.utils.json_to_sheet(gameDetails);
  setColumnAsText(gamesSheet, notesHeader);
  XLSX.utils.book_append_sheet(workbook, gamesSheet, translate('export.sheetGameDetails', 'Game Details'));

  // Sheet 4: Season Breakdown (if we have multiple seasons in dataset)
  const seasonMap = new Map<string, { games: number; goals: number; assists: number; points: number }>();

  gameArray.forEach((game) => {
    if (!game.seasonId) return;
    const season = seasons.find((s) => s.id === game.seasonId);
    if (!season) return;

    const key = season.name;
    if (!seasonMap.has(key)) {
      seasonMap.set(key, { games: 0, goals: 0, assists: 0, points: 0 });
    }

    const stats = seasonMap.get(key)!;
    stats.games++;

    game.gameEvents
      .filter((e) => e.type === 'goal')
      .forEach((e) => {
        if (e.scorerId) stats.goals++;
        if (e.assisterId) stats.assists++;
      });
    stats.points = stats.goals + stats.assists;
  });

  if (seasonMap.size > 0) {
    const seasonBreakdown = Array.from(seasonMap.entries()).map(([name, stats]) => ({
      [translate('export.season', 'Season')]: name,
      [translate('export.gamesPlayed', 'Games Played')]: stats.games,
      [translate('export.goals', 'Goals')]: stats.goals,
      [translate('export.assists', 'Assists')]: stats.assists,
      [translate('export.points', 'Points')]: stats.points,
    }));

    const seasonSheet = XLSX.utils.json_to_sheet(seasonBreakdown);
    XLSX.utils.book_append_sheet(workbook, seasonSheet, translate('export.sheetSeasonBreakdown', 'Season Breakdown'));
  }

  // Sheet 5: Tournament Breakdown (if we have multiple tournaments in dataset)
  const tournamentMap = new Map<string, { games: number; goals: number; assists: number; points: number }>();

  gameArray.forEach((game) => {
    if (!game.tournamentId) return;
    const tournament = tournaments.find((t) => t.id === game.tournamentId);
    if (!tournament) return;

    const key = tournament.name;
    if (!tournamentMap.has(key)) {
      tournamentMap.set(key, { games: 0, goals: 0, assists: 0, points: 0 });
    }

    const stats = tournamentMap.get(key)!;
    stats.games++;

    game.gameEvents
      .filter((e) => e.type === 'goal')
      .forEach((e) => {
        if (e.scorerId) stats.goals++;
        if (e.assisterId) stats.assists++;
      });
    stats.points = stats.goals + stats.assists;
  });

  if (tournamentMap.size > 0) {
    const tournamentBreakdown = Array.from(tournamentMap.entries()).map(([name, stats]) => ({
      [translate('export.tournament', 'Tournament')]: name,
      [translate('export.gamesPlayed', 'Games Played')]: stats.games,
      [translate('export.goals', 'Goals')]: stats.goals,
      [translate('export.assists', 'Assists')]: stats.assists,
      [translate('export.points', 'Points')]: stats.points,
    }));

    const tournamentSheet = XLSX.utils.json_to_sheet(tournamentBreakdown);
    XLSX.utils.book_append_sheet(workbook, tournamentSheet, translate('export.sheetTournamentBreakdown', 'Tournament Breakdown'));
  }

  // Sheet 6: Assessments Summary (average ratings per player across all games)
  const assessmentMap = new Map<string, {
    name: string;
    count: number;
    overall: number;
    intensity: number;
    courage: number;
    duels: number;
    technique: number;
    creativity: number;
    decisions: number;
    awareness: number;
    teamwork: number;
    fairPlay: number;
    impact: number;
  }>();

  gameArray.forEach((game) => {
    if (!game.assessments) return;
    Object.entries(game.assessments).forEach(([playerId, assessment]) => {
      const player = aggregateStats.find((p) => p.id === playerId);
      if (!player) return;

      if (!assessmentMap.has(playerId)) {
        assessmentMap.set(playerId, {
          name: player.name,
          count: 0,
          overall: 0,
          intensity: 0,
          courage: 0,
          duels: 0,
          technique: 0,
          creativity: 0,
          decisions: 0,
          awareness: 0,
          teamwork: 0,
          fairPlay: 0,
          impact: 0,
        });
      }

      const stats = assessmentMap.get(playerId)!;
      stats.count++;
      stats.overall += assessment.overall;
      stats.intensity += assessment.sliders.intensity;
      stats.courage += assessment.sliders.courage;
      stats.duels += assessment.sliders.duels;
      stats.technique += assessment.sliders.technique;
      stats.creativity += assessment.sliders.creativity;
      stats.decisions += assessment.sliders.decisions;
      stats.awareness += assessment.sliders.awareness;
      stats.teamwork += assessment.sliders.teamwork;
      stats.fairPlay += assessment.sliders.fair_play;
      stats.impact += assessment.sliders.impact;
    });
  });

  if (assessmentMap.size > 0) {
    const assessmentSummary = Array.from(assessmentMap.values()).map((stats) => ({
      [translate('export.player', 'Player')]: stats.name,
      [translate('export.gamesAssessed', 'Games Assessed')]: stats.count,
      [translate('export.avgOverall', 'Avg Overall')]: (stats.overall / stats.count).toFixed(1),
      [translate('export.avgIntensity', 'Avg Intensity')]: (stats.intensity / stats.count).toFixed(1),
      [translate('export.avgCourage', 'Avg Courage')]: (stats.courage / stats.count).toFixed(1),
      [translate('export.avgDuels', 'Avg Duels')]: (stats.duels / stats.count).toFixed(1),
      [translate('export.avgTechnique', 'Avg Technique')]: (stats.technique / stats.count).toFixed(1),
      [translate('export.avgCreativity', 'Avg Creativity')]: (stats.creativity / stats.count).toFixed(1),
      [translate('export.avgDecisions', 'Avg Decisions')]: (stats.decisions / stats.count).toFixed(1),
      [translate('export.avgAwareness', 'Avg Awareness')]: (stats.awareness / stats.count).toFixed(1),
      [translate('export.avgTeamwork', 'Avg Teamwork')]: (stats.teamwork / stats.count).toFixed(1),
      [translate('export.avgFairPlay', 'Avg Fair Play')]: (stats.fairPlay / stats.count).toFixed(1),
      [translate('export.avgImpact', 'Avg Impact')]: (stats.impact / stats.count).toFixed(1),
    }));

    const assessmentSheet = XLSX.utils.json_to_sheet(assessmentSummary);
    XLSX.utils.book_append_sheet(workbook, assessmentSheet, translate('export.sheetAssessmentsSummary', 'Assessments Summary'));
  }

  // Sheet 7: External Games (if any adjustments exist)
  if (externalAdjustments.length > 0) {
    const externalData = externalAdjustments.map((adj) => {
      const player = aggregateStats.find((p) => p.id === adj.playerId);
      const season = adj.seasonId ? seasons.find((s) => s.id === adj.seasonId)?.name : '';
      const tournament = adj.tournamentId ? tournaments.find((tr) => tr.id === adj.tournamentId)?.name : '';

      return {
        [translate('export.player', 'Player')]: player?.name || adj.playerId,
        [translate('export.date', 'Date')]: adj.gameDate || '',
        [translate('export.externalTeam', 'External Team')]: adj.externalTeamName || '',
        [translate('export.opponent', 'Opponent')]: adj.opponentName || '',
        [translate('export.scoreFor', 'Score For')]: adj.scoreFor ?? '',
        [translate('export.scoreAgainst', 'Score Against')]: adj.scoreAgainst ?? '',
        [translate('export.homeAway', 'Home/Away')]: adj.homeOrAway || '',
        [translate('export.gamesPlayed', 'Games Played')]: adj.gamesPlayedDelta,
        [translate('export.goals', 'Goals')]: adj.goalsDelta,
        [translate('export.assists', 'Assists')]: adj.assistsDelta,
        [translate('export.fairPlayCards', 'Fair Play Cards')]: adj.fairPlayCardsDelta ?? 0,
        [translate('export.season', 'Season')]: season,
        [translate('export.tournament', 'Tournament')]: tournament,
        [translate('export.includeInStats', 'Include in Stats')]: adj.includeInSeasonTournament ? yes : no,
        [notesHeader]: adj.note || '',
        [translate('export.appliedAt', 'Applied At')]: new Date(adj.appliedAt).toLocaleString(),
      };
    });

    const externalSheet = XLSX.utils.json_to_sheet(externalData);
    setColumnAsText(externalSheet, notesHeader);
    XLSX.utils.book_append_sheet(workbook, externalSheet, translate('export.sheetExternalGames', 'External Games'));
  }

  // Generate filename based on context
  let filename = 'MatchOps_';
  if (contextType === 'season' && contextId) {
    const season = seasons.find((s) => s.id === contextId);
    filename += `Season_${season?.name || contextId}_`;
  } else if (contextType === 'tournament' && contextId) {
    const tournament = tournaments.find((t) => t.id === contextId);
    filename += `Tournament_${tournament?.name || contextId}_`;
  } else {
    filename += 'AllStats_';
  }
    filename += `${getTimestamp()}.xlsx`;

    triggerDownload(workbook, filename);
  } catch (error) {
    throw new Error('Failed to export stats to Excel. Please try again.', { cause: error });
  }
};

/**
 * Export individual player stats to Excel with multiple sheets
 *
 * Generates an Excel workbook focused on a single player with the following sheets:
 * - Player Summary: Overall stats (games, goals, assists, points, averages)
 * - Game History: Per-game breakdown with scores and individual performance
 * - Assessments: Performance ratings for each game (if available)
 * - Season Performance: Stats aggregated by season (if available)
 * - Tournament Performance: Stats aggregated by tournament (if available)
 * - External Games: Non-MatchOps games for this player (if any)
 *
 * @param playerId - Unique identifier for the player
 * @param playerData - Aggregated player statistics
 * @param games - Collection of games the player participated in
 * @param seasons - All seasons for season name resolution (optional)
 * @param tournaments - All tournaments for tournament name resolution (optional)
 * @param externalAdjustments - External game adjustments for this player (optional)
 * @throws {Error} If Excel generation or download fails
 */
export const exportPlayerExcel = (
  playerId: string,
  playerData: PlayerStatRow,
  games: SavedGamesCollection,
  seasons: Season[] = [],
  tournaments: Tournament[] = [],
  externalAdjustments: PlayerStatAdjustment[] = [],
  translate: TranslationFn = defaultTranslate
): void => {
  try {
    const workbook = XLSX.utils.book_new();
  const yes = translate('export.yes', 'Yes');
  const no = translate('export.no', 'No');
  const notesHeader = translate('export.notes', 'Notes');

  // Sheet 1: Player Summary
  // Incorporate external adjustments (external games) to align with on-screen totals
  const adjForPlayer = externalAdjustments.filter(a => a.playerId === playerId);
  const adjTotals = adjForPlayer.reduce(
    (acc, a) => {
      acc.games += a.gamesPlayedDelta || 0;
      acc.goals += a.goalsDelta || 0;
      acc.assists += a.assistsDelta || 0;
      return acc;
    },
    { games: 0, goals: 0, assists: 0 }
  );
  const totalGames = (playerData.gamesPlayed || 0) + adjTotals.games;
  const totalGoals = (playerData.goals || 0) + adjTotals.goals;
  const totalAssists = (playerData.assists || 0) + adjTotals.assists;
  const totalPoints = totalGoals + totalAssists;
  const avgPoints = totalGames > 0 ? (totalPoints / totalGames) : 0;

  const summary = [{
    [translate('export.playerName', 'Player Name')]: playerData.name,
    [translate('export.jerseyNumber', 'Jersey #')]: playerData.jerseyNumber || '',
    [translate('export.nickname', 'Nickname')]: playerData.nickname || '',
    [translate('export.totalGames', 'Total Games')]: totalGames,
    [translate('export.totalGoals', 'Total Goals')]: totalGoals,
    [translate('export.totalAssists', 'Total Assists')]: totalAssists,
    [translate('export.totalPoints', 'Total Points')]: totalPoints,
    [translate('export.avgPointsPerGame', 'Avg Points/Game')]: avgPoints.toFixed(2),
    [translate('export.fairPlayAwards', 'Fair Play Awards')]: playerData.fpAwards ?? 0,
    [translate('export.goalie', 'Goalie')]: playerData.isGoalie ? yes : no,
    [notesHeader]: playerData.notes || '',
  }];

  const summarySheet = XLSX.utils.json_to_sheet(summary);
  setColumnAsText(summarySheet, notesHeader);
  XLSX.utils.book_append_sheet(workbook, summarySheet, translate('export.sheetPlayerSummary', 'Player Summary'));

  // Sheet 2: Game History
  const playerGames = Object.entries(games)
    .filter(([, game]) => game.selectedPlayerIds?.includes(playerId))
    .map(([id, game]) => {
      const goals = game.gameEvents.filter((e) => e.type === 'goal' && e.scorerId === playerId).length;
      const assists = game.gameEvents.filter((e) => e.type === 'goal' && e.assisterId === playerId).length;
      const assessment = game.assessments?.[playerId];

      const isHome = game.homeOrAway === 'home';
      const ourScore = isHome ? game.homeScore : game.awayScore;
      const theirScore = isHome ? game.awayScore : game.homeScore;
      let result = '';
      if (ourScore > theirScore) result = translate('export.winShort', 'W');
      else if (ourScore < theirScore) result = translate('export.lossShort', 'L');
      else result = translate('export.tieShort', 'T');

      const seasonName = game.seasonId ? seasons.find((s) => s.id === game.seasonId)?.name : '';
      const tournamentName = game.tournamentId ? tournaments.find((tr) => tr.id === game.tournamentId)?.name : '';

      // Get player from this game's roster snapshot for accurate per-game data
      const playerInGame = game.availablePlayers?.find(p => p.id === playerId);

      return {
        [translate('export.gameId', 'Game ID')]: id,
        [translate('export.date', 'Date')]: game.gameDate,
        [translate('export.opponent', 'Opponent')]: game.opponentName,
        [translate('export.homeAway', 'Home/Away')]: game.homeOrAway,
        [translate('export.result', 'Result')]: result,
        [translate('export.ourScore', 'Our Score')]: ourScore,
        [translate('export.theirScore', 'Their Score')]: theirScore,
        [translate('export.goals', 'Goals')]: goals,
        [translate('export.assists', 'Assists')]: assists,
        [translate('export.points', 'Points')]: goals + assists,
        [translate('export.fairPlay', 'Fair Play')]: playerInGame?.receivedFairPlayCard ? yes : no,
        [translate('export.overallRating', 'Overall Rating')]: assessment?.overall || '',
        [translate('export.season', 'Season')]: seasonName,
        [translate('export.tournament', 'Tournament')]: tournamentName,
      };
    });

  if (playerGames.length > 0) {
    const historySheet = XLSX.utils.json_to_sheet(playerGames);
    XLSX.utils.book_append_sheet(workbook, historySheet, translate('export.sheetGameHistory', 'Game History'));
  }

  // Sheet 3: Assessments
  const assessments = Object.entries(games)
    .filter(([, game]) => game.assessments && game.assessments[playerId])
    .map(([id, game]) => {
      const assessment = game.assessments![playerId];
      return {
        [translate('export.gameId', 'Game ID')]: id,
        [translate('export.date', 'Date')]: game.gameDate,
        [translate('export.opponent', 'Opponent')]: game.opponentName,
        [translate('export.overall', 'Overall')]: assessment.overall,
        [translate('export.intensity', 'Intensity')]: assessment.sliders.intensity,
        [translate('export.courage', 'Courage')]: assessment.sliders.courage,
        [translate('export.duels', 'Duels')]: assessment.sliders.duels,
        [translate('export.technique', 'Technique')]: assessment.sliders.technique,
        [translate('export.creativity', 'Creativity')]: assessment.sliders.creativity,
        [translate('export.decisions', 'Decisions')]: assessment.sliders.decisions,
        [translate('export.awareness', 'Awareness')]: assessment.sliders.awareness,
        [translate('export.teamwork', 'Teamwork')]: assessment.sliders.teamwork,
        [translate('export.fairPlay', 'Fair Play')]: assessment.sliders.fair_play,
        [translate('export.impact', 'Impact')]: assessment.sliders.impact,
        [notesHeader]: assessment.notes || '',
        [translate('export.assessmentDate', 'Assessment Date')]: new Date(assessment.createdAt).toLocaleString(),
      };
    });

  if (assessments.length > 0) {
    const assessmentSheet = XLSX.utils.json_to_sheet(assessments);
    setColumnAsText(assessmentSheet, notesHeader);
    XLSX.utils.book_append_sheet(workbook, assessmentSheet, translate('export.sheetAssessments', 'Assessments'));
  }

  // Sheet 4: Season Performance
  const seasonStats = new Map<string, { games: number; goals: number; assists: number; fairPlay: number }>();

  Object.values(games)
    .filter((game) => game.selectedPlayerIds?.includes(playerId) && game.seasonId)
    .forEach((game) => {
      const season = seasons.find((s) => s.id === game.seasonId);
      if (!season) return;

      if (!seasonStats.has(season.name)) {
        seasonStats.set(season.name, { games: 0, goals: 0, assists: 0, fairPlay: 0 });
      }

      const stats = seasonStats.get(season.name)!;
      stats.games++;
      stats.goals += game.gameEvents.filter((e) => e.type === 'goal' && e.scorerId === playerId).length;
      stats.assists += game.gameEvents.filter((e) => e.type === 'goal' && e.assisterId === playerId).length;
      if (playerData.receivedFairPlayCard) stats.fairPlay++;
    });

  if (seasonStats.size > 0) {
    const seasonPerformance = Array.from(seasonStats.entries()).map(([name, stats]) => ({
      [translate('export.season', 'Season')]: name,
      [translate('export.gamesPlayed', 'Games Played')]: stats.games,
      [translate('export.goals', 'Goals')]: stats.goals,
      [translate('export.assists', 'Assists')]: stats.assists,
      [translate('export.points', 'Points')]: stats.goals + stats.assists,
      [translate('export.fairPlayAwards', 'Fair Play Awards')]: stats.fairPlay,
    }));

    const seasonSheet = XLSX.utils.json_to_sheet(seasonPerformance);
    XLSX.utils.book_append_sheet(workbook, seasonSheet, translate('export.sheetSeasonPerformance', 'Season Performance'));
  }

  // Sheet 5: Tournament Performance
  const tournamentStats = new Map<string, { games: number; goals: number; assists: number; fairPlay: number }>();

  Object.values(games)
    .filter((game) => game.selectedPlayerIds?.includes(playerId) && game.tournamentId)
    .forEach((game) => {
      const tournament = tournaments.find((t) => t.id === game.tournamentId);
      if (!tournament) return;

      if (!tournamentStats.has(tournament.name)) {
        tournamentStats.set(tournament.name, { games: 0, goals: 0, assists: 0, fairPlay: 0 });
      }

      const stats = tournamentStats.get(tournament.name)!;
      stats.games++;
      stats.goals += game.gameEvents.filter((e) => e.type === 'goal' && e.scorerId === playerId).length;
      stats.assists += game.gameEvents.filter((e) => e.type === 'goal' && e.assisterId === playerId).length;
      if (playerData.receivedFairPlayCard) stats.fairPlay++;
    });

  if (tournamentStats.size > 0) {
    const tournamentPerformance = Array.from(tournamentStats.entries()).map(([name, stats]) => ({
      [translate('export.tournament', 'Tournament')]: name,
      [translate('export.gamesPlayed', 'Games Played')]: stats.games,
      [translate('export.goals', 'Goals')]: stats.goals,
      [translate('export.assists', 'Assists')]: stats.assists,
      [translate('export.points', 'Points')]: stats.goals + stats.assists,
      [translate('export.fairPlayAwards', 'Fair Play Awards')]: stats.fairPlay,
    }));

    const tournamentSheet = XLSX.utils.json_to_sheet(tournamentPerformance);
    XLSX.utils.book_append_sheet(workbook, tournamentSheet, translate('export.sheetTournamentPerformance', 'Tournament Performance'));
  }

  // Sheet 6: External Games for this player
  const playerAdjustments = externalAdjustments.filter((adj) => adj.playerId === playerId);
  if (playerAdjustments.length > 0) {
    const externalData = playerAdjustments.map((adj) => {
      const season = adj.seasonId ? seasons.find((s) => s.id === adj.seasonId)?.name : '';
      const tournament = adj.tournamentId ? tournaments.find((tr) => tr.id === adj.tournamentId)?.name : '';

      return {
        [translate('export.date', 'Date')]: adj.gameDate || '',
        [translate('export.externalTeam', 'External Team')]: adj.externalTeamName || '',
        [translate('export.opponent', 'Opponent')]: adj.opponentName || '',
        [translate('export.scoreFor', 'Score For')]: adj.scoreFor ?? '',
        [translate('export.scoreAgainst', 'Score Against')]: adj.scoreAgainst ?? '',
        [translate('export.homeAway', 'Home/Away')]: adj.homeOrAway || '',
        [translate('export.gamesPlayed', 'Games Played')]: adj.gamesPlayedDelta,
        [translate('export.goals', 'Goals')]: adj.goalsDelta,
        [translate('export.assists', 'Assists')]: adj.assistsDelta,
        [translate('export.fairPlayCards', 'Fair Play Cards')]: adj.fairPlayCardsDelta ?? 0,
        [translate('export.season', 'Season')]: season,
        [translate('export.tournament', 'Tournament')]: tournament,
        [translate('export.includeInStats', 'Include in Stats')]: adj.includeInSeasonTournament ? yes : no,
        [notesHeader]: adj.note || '',
        [translate('export.appliedAt', 'Applied At')]: new Date(adj.appliedAt).toLocaleString(),
      };
    });

    const externalSheet = XLSX.utils.json_to_sheet(externalData);
    setColumnAsText(externalSheet, notesHeader);
    XLSX.utils.book_append_sheet(workbook, externalSheet, translate('export.sheetExternalGames', 'External Games'));
  }

    const filename = `MatchOps_Player_${playerData.name}_${getTimestamp()}.xlsx`;
    triggerDownload(workbook, filename);
  } catch (error) {
    throw new Error('Failed to export player stats to Excel. Please try again.', { cause: error });
  }
};
