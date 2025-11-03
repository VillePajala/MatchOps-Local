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
  tournaments: Tournament[] = []
): void => {
  try {
    const workbook = XLSX.utils.book_new();

  const seasonName = game.seasonId ? seasons.find((s) => s.id === game.seasonId)?.name : '';
  const tournamentName = game.tournamentId
    ? tournaments.find((t) => t.id === game.tournamentId)?.name
    : '';

  // Sheet 1: Player Stats
  const selectedPlayers = players.filter((p) => game.selectedPlayerIds?.includes(p.id));
  const playerStats = selectedPlayers
    .map((p) => {
      const goals = game.gameEvents.filter((e) => e.type === 'goal' && e.scorerId === p.id).length;
      const assists = game.gameEvents.filter((e) => e.type === 'goal' && e.assisterId === p.id).length;
      const totalScore = goals + assists;
      return {
        Player: p.name,
        'Jersey #': p.jerseyNumber || '',
        Nickname: p.nickname || '',
        Goals: goals,
        Assists: assists,
        Points: totalScore,
        'Fair Play': p.receivedFairPlayCard ? 'Yes' : 'No',
        'Is Goalie': p.isGoalie ? 'Yes' : 'No',
        Notes: p.notes || '',
      };
    })
    .sort((a, b) => b.Points - a.Points || b.Goals - a.Goals);

  const playerStatsSheet = XLSX.utils.json_to_sheet(playerStats);
  XLSX.utils.book_append_sheet(workbook, playerStatsSheet, 'Player Stats');

  // Sheet 2: Events
  const sortedEvents = game.gameEvents
    .filter((e) => e.type === 'goal' || e.type === 'opponentGoal')
    .sort((a, b) => a.time - b.time);
  const eventData = sortedEvents.map((event) => ({
    Time: formatTime(event.time),
    Type: event.type === 'goal' ? 'Goal' : 'Opponent Goal',
    Scorer:
      event.type === 'goal'
        ? selectedPlayers.find((p) => p.id === event.scorerId)?.name || event.scorerId || ''
        : game.opponentName || 'Opponent',
    Assister:
      event.type === 'goal' && event.assisterId
        ? selectedPlayers.find((p) => p.id === event.assisterId)?.name || event.assisterId || ''
        : '',
  }));

  const eventsSheet = eventData.length > 0
    ? XLSX.utils.json_to_sheet(eventData)
    : XLSX.utils.json_to_sheet([{ Message: 'No goals logged' }]);
  XLSX.utils.book_append_sheet(workbook, eventsSheet, 'Events');

  // Sheet 3: Game Info
  const isHome = game.homeOrAway === 'home';
  const ourScore = isHome ? game.homeScore : game.awayScore;
  const theirScore = isHome ? game.awayScore : game.homeScore;
  let result = 'Not Started';
  if (game.isPlayed) {
    if (ourScore > theirScore) result = 'Win';
    else if (ourScore < theirScore) result = 'Loss';
    else result = 'Tie';
  }

  const totalDuration = (game.completedIntervalDurations || []).reduce(
    (sum, log) => sum + log.duration,
    0
  );

  const gameInfo = [
    { Field: 'Game ID', Value: gameId },
    { Field: 'Game Date', Value: game.gameDate },
    { Field: 'Game Time', Value: game.gameTime || '' },
    { Field: 'Location', Value: game.gameLocation || '' },
    { Field: 'Home Team', Value: game.teamName },
    { Field: 'Away Team', Value: game.opponentName },
    { Field: 'Home Score', Value: game.homeScore },
    { Field: 'Away Score', Value: game.awayScore },
    { Field: 'We Played As', Value: game.homeOrAway },
    { Field: 'Result', Value: result },
    { Field: 'Goal Difference', Value: ourScore - theirScore },
    { Field: 'Season', Value: seasonName || game.seasonId || 'None' },
    { Field: 'Tournament', Value: tournamentName || game.tournamentId || 'None' },
    { Field: 'Tournament Level', Value: game.tournamentLevel || '' },
    { Field: 'Age Group', Value: game.ageGroup || '' },
    { Field: 'Demand Factor', Value: game.demandFactor || '' },
    { Field: 'Team ID', Value: game.teamId || '' },
    { Field: 'Game Status', Value: game.gameStatus },
    { Field: 'Is Played', Value: game.isPlayed ? 'Yes' : 'No' },
    { Field: '', Value: '' },
    { Field: 'Game Settings', Value: '' },
    { Field: 'Number of Periods', Value: game.numberOfPeriods },
    { Field: 'Period Duration (min)', Value: game.periodDurationMinutes },
    { Field: 'Substitution Interval (min)', Value: game.subIntervalMinutes ?? '' },
    { Field: 'Current Period', Value: game.currentPeriod },
    { Field: 'Total Game Duration', Value: formatTime(totalDuration) },
    { Field: '', Value: '' },
    { Field: 'Notes', Value: game.gameNotes || '' },
  ];

  const gameInfoSheet = XLSX.utils.json_to_sheet(gameInfo);
  XLSX.utils.book_append_sheet(workbook, gameInfoSheet, 'Game Info');

  // Sheet 4: Assessments (if available)
  if (game.assessments && Object.keys(game.assessments).length > 0) {
    const assessmentData = selectedPlayers
      .filter((p) => game.assessments && game.assessments[p.id])
      .map((p) => {
        const assessment = game.assessments![p.id];
        return {
          Player: p.name,
          'Minutes Played': assessment.minutesPlayed,
          Overall: assessment.overall,
          Intensity: assessment.sliders.intensity,
          Courage: assessment.sliders.courage,
          Duels: assessment.sliders.duels,
          Technique: assessment.sliders.technique,
          Creativity: assessment.sliders.creativity,
          Decisions: assessment.sliders.decisions,
          Awareness: assessment.sliders.awareness,
          Teamwork: assessment.sliders.teamwork,
          'Fair Play': assessment.sliders.fair_play,
          Impact: assessment.sliders.impact,
          Notes: assessment.notes || '',
          'Assessment Date': new Date(assessment.createdAt).toLocaleString(),
          'Assessed By': assessment.createdBy || '',
        };
      });

    if (assessmentData.length > 0) {
      const assessmentSheet = XLSX.utils.json_to_sheet(assessmentData);
      XLSX.utils.book_append_sheet(workbook, assessmentSheet, 'Assessments');
    }
  }

  // Sheet 5: Substitution Intervals
  const intervals = game.completedIntervalDurations || [];
  if (intervals.length > 0) {
    const intervalData = intervals
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((log) => ({
        Period: log.period,
        'Duration (mm:ss)': formatTime(log.duration),
        Timestamp: new Date(log.timestamp).toLocaleString(),
      }));

    const intervalsSheet = XLSX.utils.json_to_sheet(intervalData);
    XLSX.utils.book_append_sheet(workbook, intervalsSheet, 'Substitution Intervals');
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
  contextId?: string
): void => {
  try {
    const workbook = XLSX.utils.book_new();

  // Sheet 1: Player Stats Summary
  const playerSummary = aggregateStats
    .filter((player) => player.gamesPlayed > 0)
    .map((player) => ({
      Player: player.name,
      'Jersey #': player.jerseyNumber || '',
      Nickname: player.nickname || '',
      'Games Played': player.gamesPlayed,
      Goals: player.goals,
      Assists: player.assists,
      Points: player.totalScore,
      'Avg Points/Game': player.avgPoints.toFixed(2),
      'Fair Play Awards': player.fpAwards ?? 0,
      'Is Goalie': player.isGoalie ? 'Yes' : 'No',
      Notes: player.notes || '',
    }));

  const summarySheet = XLSX.utils.json_to_sheet(playerSummary);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Player Stats Summary');

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

  const performanceData = [
    { Metric: 'Games Played', Value: totalGames },
    { Metric: 'Wins', Value: record.wins },
    { Metric: 'Losses', Value: record.losses },
    { Metric: 'Ties', Value: record.ties },
    { Metric: 'Win Percentage', Value: `${winPct}%` },
    { Metric: 'Goals For', Value: goalsFor },
    { Metric: 'Goals Against', Value: goalsAgainst },
    { Metric: 'Goal Difference', Value: goalDiff > 0 ? `+${goalDiff}` : goalDiff },
    { Metric: 'Avg Goals For/Game', Value: avgGoalsFor },
    { Metric: 'Avg Goals Against/Game', Value: avgGoalsAgainst },
  ];

  const performanceSheet = XLSX.utils.json_to_sheet(performanceData);
  XLSX.utils.book_append_sheet(workbook, performanceSheet, 'Team Performance');

  // Sheet 3: Game Details
  const gameDetails = Object.entries(games).map(([id, game]) => {
    const isHome = game.homeOrAway === 'home';
    const ourScore = isHome ? game.homeScore : game.awayScore;
    const theirScore = isHome ? game.awayScore : game.homeScore;
    let result = '';
    if (ourScore > theirScore) result = 'W';
    else if (ourScore < theirScore) result = 'L';
    else result = 'T';

    const seasonName = game.seasonId ? seasons.find((s) => s.id === game.seasonId)?.name : '';
    const tournamentName = game.tournamentId
      ? tournaments.find((t) => t.id === game.tournamentId)?.name
      : '';

    return {
      'Game ID': id,
      Date: game.gameDate,
      Time: game.gameTime || '',
      Location: game.gameLocation || '',
      'Home Team': game.teamName,
      'Away Team': game.opponentName,
      'Home Score': game.homeScore,
      'Away Score': game.awayScore,
      'We Played': game.homeOrAway,
      Result: result,
      'Goal Diff': ourScore - theirScore,
      Season: seasonName || game.seasonId || '',
      Tournament: tournamentName || game.tournamentId || '',
      'Tournament Level': game.tournamentLevel || '',
      'Age Group': game.ageGroup || '',
      'Demand Factor': game.demandFactor || '',
      'Team ID': game.teamId || '',
      Notes: game.gameNotes || '',
    };
  });

  const gamesSheet = XLSX.utils.json_to_sheet(gameDetails);
  XLSX.utils.book_append_sheet(workbook, gamesSheet, 'Game Details');

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
      Season: name,
      'Games Played': stats.games,
      Goals: stats.goals,
      Assists: stats.assists,
      Points: stats.points,
    }));

    const seasonSheet = XLSX.utils.json_to_sheet(seasonBreakdown);
    XLSX.utils.book_append_sheet(workbook, seasonSheet, 'Season Breakdown');
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
      Tournament: name,
      'Games Played': stats.games,
      Goals: stats.goals,
      Assists: stats.assists,
      Points: stats.points,
    }));

    const tournamentSheet = XLSX.utils.json_to_sheet(tournamentBreakdown);
    XLSX.utils.book_append_sheet(workbook, tournamentSheet, 'Tournament Breakdown');
  }

  // Sheet 6: Assessments Summary (average ratings per player across all games)
  const assessmentMap = new Map<string, {
    name: string;
    count: number;
    totalMinutes: number;
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
          totalMinutes: 0,
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
      stats.totalMinutes += assessment.minutesPlayed;
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
      Player: stats.name,
      'Games Assessed': stats.count,
      'Total Minutes': stats.totalMinutes,
      'Avg Minutes/Game': (stats.totalMinutes / stats.count).toFixed(1),
      'Avg Overall': (stats.overall / stats.count).toFixed(1),
      'Avg Intensity': (stats.intensity / stats.count).toFixed(1),
      'Avg Courage': (stats.courage / stats.count).toFixed(1),
      'Avg Duels': (stats.duels / stats.count).toFixed(1),
      'Avg Technique': (stats.technique / stats.count).toFixed(1),
      'Avg Creativity': (stats.creativity / stats.count).toFixed(1),
      'Avg Decisions': (stats.decisions / stats.count).toFixed(1),
      'Avg Awareness': (stats.awareness / stats.count).toFixed(1),
      'Avg Teamwork': (stats.teamwork / stats.count).toFixed(1),
      'Avg Fair Play': (stats.fairPlay / stats.count).toFixed(1),
      'Avg Impact': (stats.impact / stats.count).toFixed(1),
    }));

    const assessmentSheet = XLSX.utils.json_to_sheet(assessmentSummary);
    XLSX.utils.book_append_sheet(workbook, assessmentSheet, 'Assessments Summary');
  }

  // Sheet 7: External Games (if any adjustments exist)
  if (externalAdjustments.length > 0) {
    const externalData = externalAdjustments.map((adj) => {
      const player = aggregateStats.find((p) => p.id === adj.playerId);
      const season = adj.seasonId ? seasons.find((s) => s.id === adj.seasonId)?.name : '';
      const tournament = adj.tournamentId ? tournaments.find((t) => t.id === adj.tournamentId)?.name : '';

      return {
        Player: player?.name || adj.playerId,
        Date: adj.gameDate || '',
        'External Team': adj.externalTeamName || '',
        Opponent: adj.opponentName || '',
        'Score For': adj.scoreFor ?? '',
        'Score Against': adj.scoreAgainst ?? '',
        'Home/Away': adj.homeOrAway || '',
        'Games Played': adj.gamesPlayedDelta,
        Goals: adj.goalsDelta,
        Assists: adj.assistsDelta,
        'Fair Play Cards': adj.fairPlayCardsDelta ?? 0,
        Season: season,
        Tournament: tournament,
        'Include in Stats': adj.includeInSeasonTournament ? 'Yes' : 'No',
        Notes: adj.note || '',
        'Applied At': new Date(adj.appliedAt).toLocaleString(),
      };
    });

    const externalSheet = XLSX.utils.json_to_sheet(externalData);
    XLSX.utils.book_append_sheet(workbook, externalSheet, 'External Games');
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
  externalAdjustments: PlayerStatAdjustment[] = []
): void => {
  try {
    const workbook = XLSX.utils.book_new();

  // Sheet 1: Player Summary
  const summary = [{
    'Player Name': playerData.name,
    'Jersey Number': playerData.jerseyNumber || '',
    Nickname: playerData.nickname || '',
    'Total Games': playerData.gamesPlayed,
    'Total Goals': playerData.goals,
    'Total Assists': playerData.assists,
    'Total Points': playerData.totalScore,
    'Avg Points/Game': playerData.avgPoints.toFixed(2),
    'Fair Play Awards': playerData.fpAwards ?? 0,
    'Is Goalie': playerData.isGoalie ? 'Yes' : 'No',
    Notes: playerData.notes || '',
  }];

  const summarySheet = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Player Summary');

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
      if (ourScore > theirScore) result = 'W';
      else if (ourScore < theirScore) result = 'L';
      else result = 'T';

      const seasonName = game.seasonId ? seasons.find((s) => s.id === game.seasonId)?.name : '';
      const tournamentName = game.tournamentId ? tournaments.find((t) => t.id === game.tournamentId)?.name : '';

      // Get player from this game's roster snapshot for accurate per-game data
      const playerInGame = game.availablePlayers?.find(p => p.id === playerId);

      return {
        'Game ID': id,
        Date: game.gameDate,
        Opponent: game.opponentName,
        'Home/Away': game.homeOrAway,
        Result: result,
        'Our Score': ourScore,
        'Their Score': theirScore,
        Goals: goals,
        Assists: assists,
        Points: goals + assists,
        'Fair Play': playerInGame?.receivedFairPlayCard ? 'Yes' : 'No',
        'Minutes Played': assessment?.minutesPlayed || '',
        'Overall Rating': assessment?.overall || '',
        Season: seasonName,
        Tournament: tournamentName,
      };
    });

  if (playerGames.length > 0) {
    const historySheet = XLSX.utils.json_to_sheet(playerGames);
    XLSX.utils.book_append_sheet(workbook, historySheet, 'Game History');
  }

  // Sheet 3: Assessments
  const assessments = Object.entries(games)
    .filter(([, game]) => game.assessments && game.assessments[playerId])
    .map(([id, game]) => {
      const assessment = game.assessments![playerId];
      return {
        'Game ID': id,
        Date: game.gameDate,
        Opponent: game.opponentName,
        'Minutes Played': assessment.minutesPlayed,
        Overall: assessment.overall,
        Intensity: assessment.sliders.intensity,
        Courage: assessment.sliders.courage,
        Duels: assessment.sliders.duels,
        Technique: assessment.sliders.technique,
        Creativity: assessment.sliders.creativity,
        Decisions: assessment.sliders.decisions,
        Awareness: assessment.sliders.awareness,
        Teamwork: assessment.sliders.teamwork,
        'Fair Play': assessment.sliders.fair_play,
        Impact: assessment.sliders.impact,
        Notes: assessment.notes || '',
        'Assessment Date': new Date(assessment.createdAt).toLocaleString(),
      };
    });

  if (assessments.length > 0) {
    const assessmentSheet = XLSX.utils.json_to_sheet(assessments);
    XLSX.utils.book_append_sheet(workbook, assessmentSheet, 'Assessments');
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
      Season: name,
      'Games Played': stats.games,
      Goals: stats.goals,
      Assists: stats.assists,
      Points: stats.goals + stats.assists,
      'Fair Play Awards': stats.fairPlay,
    }));

    const seasonSheet = XLSX.utils.json_to_sheet(seasonPerformance);
    XLSX.utils.book_append_sheet(workbook, seasonSheet, 'Season Performance');
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
      Tournament: name,
      'Games Played': stats.games,
      Goals: stats.goals,
      Assists: stats.assists,
      Points: stats.goals + stats.assists,
      'Fair Play Awards': stats.fairPlay,
    }));

    const tournamentSheet = XLSX.utils.json_to_sheet(tournamentPerformance);
    XLSX.utils.book_append_sheet(workbook, tournamentSheet, 'Tournament Performance');
  }

  // Sheet 6: External Games for this player
  const playerAdjustments = externalAdjustments.filter((adj) => adj.playerId === playerId);
  if (playerAdjustments.length > 0) {
    const externalData = playerAdjustments.map((adj) => {
      const season = adj.seasonId ? seasons.find((s) => s.id === adj.seasonId)?.name : '';
      const tournament = adj.tournamentId ? tournaments.find((t) => t.id === adj.tournamentId)?.name : '';

      return {
        Date: adj.gameDate || '',
        'External Team': adj.externalTeamName || '',
        Opponent: adj.opponentName || '',
        'Score For': adj.scoreFor ?? '',
        'Score Against': adj.scoreAgainst ?? '',
        'Home/Away': adj.homeOrAway || '',
        'Games Played': adj.gamesPlayedDelta,
        Goals: adj.goalsDelta,
        Assists: adj.assistsDelta,
        'Fair Play Cards': adj.fairPlayCardsDelta ?? 0,
        Season: season,
        Tournament: tournament,
        'Include in Stats': adj.includeInSeasonTournament ? 'Yes' : 'No',
        Notes: adj.note || '',
        'Applied At': new Date(adj.appliedAt).toLocaleString(),
      };
    });

    const externalSheet = XLSX.utils.json_to_sheet(externalData);
    XLSX.utils.book_append_sheet(workbook, externalSheet, 'External Games');
  }

    const filename = `MatchOps_Player_${playerData.name}_${getTimestamp()}.xlsx`;
    triggerDownload(workbook, filename);
  } catch (error) {
    throw new Error('Failed to export player stats to Excel. Please try again.', { cause: error });
  }
};
