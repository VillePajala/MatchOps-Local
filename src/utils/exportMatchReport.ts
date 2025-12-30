/**
 * Match Report Export Utility
 *
 * @remarks
 * Generates match reports as PNG or PDF (A4).
 * Rendering is done on a canvas for consistent styling across formats.
 */

import { jsPDF } from 'jspdf';
import { CUSTOM_LEAGUE_ID, getLeagueById } from '@/config/leagues';
import { AppState, GameEvent, Personnel, Player, Season, Tournament } from '@/types';
import { formatTime, sanitizeFilename, truncateText } from './exportField';
import logger from '@/utils/logger';

// Constants
const REPORT_WIDTH = 900;
const SECTION_PADDING = 34;
const BLOB_CREATION_TIMEOUT_MS = 30000;
const URL_REVOKE_DELAY_MS = 5000;

const DEFAULT_RENDER_SCALE = 2;

export type MatchReportTheme = 'classic' | 'modal';

type ThemeColors = {
  pageBg: string;
  cardBg: string;
  text: string;
  text2: string;
  muted: string;
  faint: string;
  border: string;
  accent: string;
  headerTop: string;
  headerBottom: string;
  success: string;
  danger: string;
  warning: string;
  rowBg: string;
  rowBgAlt: string;
  chipBg: string;
  chipBorder: string;
};

type ReportTheme = {
  name: MatchReportTheme;
  fontFamily: string;
  cardRadius: number;
  colors: ThemeColors;
  shadow: { color: string; blur: number; offsetY: number };
  drawPageBackground: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
};

const CLASSIC_THEME: ReportTheme = {
  name: 'classic',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  cardRadius: 16,
  shadow: { color: 'rgba(15, 23, 42, 0.12)', blur: 20, offsetY: 8 },
  colors: {
    pageBg: '#ffffff',
    cardBg: '#ffffff',
    text: '#0f172a', // slate-900
    text2: '#334155', // slate-700
    muted: '#64748b', // slate-500
    faint: '#94a3b8', // slate-400
    border: '#e2e8f0', // slate-200
    accent: '#0ea5e9', // sky-500
    headerTop: '#0b1220',
    headerBottom: '#0f172a',
    success: '#16a34a', // green-600
    danger: '#dc2626', // red-600
    warning: '#f59e0b', // amber-500
    rowBg: 'rgba(15, 23, 42, 0.03)',
    rowBgAlt: 'rgba(15, 23, 42, 0.00)',
    chipBg: 'rgba(14, 165, 233, 0.10)',
    chipBorder: 'rgba(14, 165, 233, 0.20)',
  },
  drawPageBackground: (ctx, width, height) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  },
};

const MODAL_THEME: ReportTheme = {
  name: 'modal',
  fontFamily: 'Rajdhani, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  cardRadius: 18,
  shadow: { color: 'rgba(0, 0, 0, 0.40)', blur: 26, offsetY: 10 },
  colors: {
    pageBg: '#0b1220',
    cardBg: 'rgba(2, 6, 23, 0.72)', // slate-950/72
    text: '#e2e8f0', // slate-200
    text2: '#cbd5e1', // slate-300
    muted: '#94a3b8', // slate-400
    faint: '#64748b', // slate-500
    border: 'rgba(148, 163, 184, 0.18)', // slate-400/18
    accent: '#38bdf8', // sky-400
    headerTop: '#070b13',
    headerBottom: '#0b1220',
    success: '#22c55e', // green-500
    danger: '#ef4444', // red-500
    warning: '#f59e0b', // amber-500
    rowBg: 'rgba(255, 255, 255, 0.045)',
    rowBgAlt: 'rgba(255, 255, 255, 0.02)',
    chipBg: 'rgba(56, 189, 248, 0.16)',
    chipBorder: 'rgba(56, 189, 248, 0.26)',
  },
  drawPageBackground: (ctx, width, height) => {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#070b13');
    bg.addColorStop(1, '#0b1220');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle modal-like glows
    const glow1 = ctx.createRadialGradient(width * 0.3, height * 0.15, 0, width * 0.3, height * 0.15, width * 0.9);
    glow1.addColorStop(0, 'rgba(56, 189, 248, 0.10)');
    glow1.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, width, height);

    const glow2 = ctx.createRadialGradient(width * 0.75, height * 0.55, 0, width * 0.75, height * 0.55, width * 0.9);
    glow2.addColorStop(0, 'rgba(34, 197, 94, 0.08)');
    glow2.addColorStop(1, 'rgba(34, 197, 94, 0.0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, width, height);
  },
};

const getReportTheme = (theme?: MatchReportTheme): ReportTheme => {
  if (theme === 'classic') return CLASSIC_THEME;
  if (theme === 'modal') return MODAL_THEME;
  return MODAL_THEME; // default: app-modal style
};

const getPrimaryFontFamily = (fontFamily: string): string => {
  const primary = fontFamily.split(',')[0]?.trim() ?? fontFamily.trim();
  return primary.replace(/^['"]|['"]$/g, '');
};

const ensureFontsLoaded = async (theme: ReportTheme): Promise<void> => {
  const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  try {
    const primary = getPrimaryFontFamily(theme.fontFamily);
    await fonts.load(`12px "${primary}"`);
    await fonts.ready;
  } catch {
    // Ignore; the browser will fall back to an available font.
  }
};

/**
 * Translation function type
 */
export type TranslationFn = (key: string, defaultValue?: string, options?: Record<string, unknown>) => string;

/**
 * Match report generation options
 */
export interface MatchReportOptions {
  /** Current game state */
  game: AppState;
  /** Game ID for filename */
  gameId: string;
  /** All players (for name lookups) */
  players: Player[];
  /** All seasons (for name lookups) */
  seasons: Season[];
  /** All tournaments (for name lookups) */
  tournaments: Tournament[];
  /** All personnel (for name lookups) */
  personnel?: Personnel[];
  /** Field canvas snapshot (optional) */
  fieldCanvas: HTMLCanvasElement | null;
  /** Export format */
  format: 'png' | 'pdf';
  /** Locale for formatting */
  locale: string;
  /** Translation function */
  translate: TranslationFn;
  /** Report theme (defaults to 'modal') */
  theme?: MatchReportTheme;
}

interface ProcessedGoal {
  time: number;
  timeFormatted: string;
  type: 'goal' | 'opponentGoal';
  scorerName: string;
  assisterName?: string;
  /** Running score in HOME–AWAY order (matches header) */
  runningScore: { home: number; away: number };
  /** True if this goal is scored by our team */
  isOurGoal: boolean;
}

interface PlayerMatchStats {
  id: string;
  name: string;
  jerseyNumber: string;
  goals: number;
  assists: number;
  points: number;
}

interface MatchOverview {
  ourScore: number;
  opponentScore: number;
  halftimeScore?: { home: number; away: number };
  goalDiff: number;
  substitutions: number;
  fairPlayRecipient?: string;
  topScorer?: { name: string; goals: number };
  topAssister?: { name: string; assists: number };
  mvp?: { name: string; points: number };
}

const getOurOpponentScores = (game: AppState): { ourScore: number; opponentScore: number } => {
  const isHome = (game.homeOrAway ?? 'home') === 'home';
  return {
    ourScore: isHome ? game.homeScore : game.awayScore,
    opponentScore: isHome ? game.awayScore : game.homeScore,
  };
};

const getMatchResult = (
  ourScore: number,
  opponentScore: number
): 'win' | 'loss' | 'tie' => {
  if (ourScore > opponentScore) return 'win';
  if (ourScore < opponentScore) return 'loss';
  return 'tie';
};

const getHomeAwayNames = (
  game: AppState,
  translate: TranslationFn
): { homeName: string; awayName: string } => {
  const teamName = game.teamName || translate('common.home', 'Home');
  const opponentName = game.opponentName || translate('common.away', 'Away');
  const isHome = (game.homeOrAway ?? 'home') === 'home';
  return {
    homeName: isHome ? teamName : opponentName,
    awayName: isHome ? opponentName : teamName,
  };
};

/**
 * Extract and process goals from game events (in our team vs opponent order).
 */
const processGoals = (
  gameEvents: GameEvent[],
  players: Player[],
  game: AppState,
  translate: TranslationFn
): ProcessedGoal[] => {
  const playerMap = new Map(players.map(p => [p.id, p]));
  let home = 0;
  let away = 0;
  const isHome = (game.homeOrAway ?? 'home') === 'home';

  return gameEvents
    .filter(e => e.type === 'goal' || e.type === 'opponentGoal')
    .sort((a, b) => a.time - b.time)
    .map(event => {
      const isOurGoal = event.type === 'goal';
      const isHomeGoal = isOurGoal ? isHome : !isHome;
      if (isHomeGoal) home++;
      else away++;

      const scorer = event.scorerId ? playerMap.get(event.scorerId) : null;
      const assister = event.assisterId ? playerMap.get(event.assisterId) : null;

      const scorerName =
        event.type === 'opponentGoal'
          ? translate('export.opponentGoal', 'Opponent Goal')
          : scorer?.name || translate('export.player', 'Player');

      return {
        time: event.time,
        timeFormatted: formatTime(event.time),
        type: event.type as 'goal' | 'opponentGoal',
        scorerName,
        assisterName: assister?.name,
        runningScore: { home, away },
        isOurGoal,
      };
    });
};

/**
 * Calculate player stats for this match
 */
const calculatePlayerMatchStats = (
  gameEvents: GameEvent[],
  selectedPlayerIds: string[],
  players: Player[]
): PlayerMatchStats[] => {
  const playerMap = new Map(players.map(p => [p.id, p]));
  const stats = new Map<string, PlayerMatchStats>();

  for (const playerId of selectedPlayerIds) {
    const player = playerMap.get(playerId);
    if (!player) continue;
    stats.set(playerId, {
      id: playerId,
      name: player.name,
      jerseyNumber: player.jerseyNumber || '',
      goals: 0,
      assists: 0,
      points: 0,
    });
  }

  for (const event of gameEvents) {
    if (event.type !== 'goal') continue;
    if (event.scorerId && stats.has(event.scorerId)) {
      const stat = stats.get(event.scorerId)!;
      stat.goals++;
      stat.points++;
    }
    if (event.assisterId && stats.has(event.assisterId)) {
      const stat = stats.get(event.assisterId)!;
      stat.assists++;
      stat.points++;
    }
  }

  return Array.from(stats.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.name.localeCompare(b.name);
  });
};

const getHalftimeScore = (goals: ProcessedGoal[], game: AppState): { home: number; away: number } | undefined => {
  if (game.numberOfPeriods !== 2 || !game.periodDurationMinutes) return undefined;
  const cutoff = game.periodDurationMinutes * 60;
  let ht = { home: 0, away: 0 };
  for (const goal of goals) {
    if (goal.time > cutoff) break;
    ht = goal.runningScore;
  }
  return ht;
};

const formatDate = (dateStr: string, locale: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const getContextName = (
  seasonId: string | undefined,
  tournamentId: string | undefined,
  seasons: Season[],
  tournaments: Tournament[]
): string | undefined => {
  if (tournamentId) {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (tournament) return tournament.name;
  }
  if (seasonId) {
    const season = seasons.find(s => s.id === seasonId);
    if (season) return season.name;
  }
  return undefined;
};

const getPersonnelNames = (
  personnelIds: string[] | undefined,
  allPersonnel: Personnel[] | undefined
): string[] => {
  if (!personnelIds || !allPersonnel) return [];
  return personnelIds
    .map(id => allPersonnel.find(p => p.id === id)?.name)
    .filter((name): name is string => Boolean(name));
};

const getLeagueName = (game: AppState): string | undefined => {
  if (!game.leagueId) return undefined;
  if (game.leagueId === CUSTOM_LEAGUE_ID) return game.customLeagueName || undefined;
  return getLeagueById(game.leagueId)?.name;
};

const getTournamentLevel = (
  game: AppState,
  tournaments: Tournament[]
): string | undefined => {
  if (game.tournamentId && game.tournamentSeriesId) {
    const tournament = tournaments.find(t => t.id === game.tournamentId);
    const level = tournament?.series?.find(s => s.id === game.tournamentSeriesId)?.level;
    if (level) return level;
  }
  return game.tournamentLevel || undefined;
};

const generateReportFilename = (options: MatchReportOptions, extension: string): string => {
  const { game } = options;
  const parts: string[] = ['MatchReport'];

  if (game.teamName) parts.push(sanitizeFilename(game.teamName));
  if (game.opponentName) {
    parts.push('vs');
    parts.push(sanitizeFilename(game.opponentName));
  }
  if (game.gameDate) parts.push(game.gameDate);
  else parts.push(new Date().toISOString().split('T')[0]);

  return `${parts.join('_')}.${extension}`;
};

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, URL_REVOKE_DELAY_MS);
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const drawCard = (
  ctx: CanvasRenderingContext2D,
  theme: ReportTheme,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: { fill?: string | CanvasGradient; border?: string; shadow?: boolean; radius?: number } = {}
): void => {
  const radius = opts.radius ?? theme.cardRadius;
  const COLORS = theme.colors;

  ctx.save();
  if (opts.shadow) {
    ctx.shadowColor = theme.shadow.color;
    ctx.shadowBlur = theme.shadow.blur;
    ctx.shadowOffsetY = theme.shadow.offsetY;
  }

  ctx.fillStyle = opts.fill ?? COLORS.cardBg;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x, y, width, height, radius);
    ctx.stroke();
  }
  ctx.restore();
};

const measureWrappedLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
      continue;
    }
    line = testLine;
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
};

function drawSectionHeaderWithTheme(
  ctx: CanvasRenderingContext2D,
  theme: ReportTheme,
  title: string,
  y: number,
  width: number
): number {
  const COLORS = theme.colors;
  const FONT_FAMILY = theme.fontFamily;
  const x = SECTION_PADDING;
  const barW = 10;
  const barH = 18;

  ctx.save();
  ctx.fillStyle = COLORS.accent;
  drawRoundedRect(ctx, x, y - barH + 2, barW, barH, 4);
  ctx.fill();

  ctx.fillStyle = COLORS.text;
  ctx.font = `800 14px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const label = theme.name === 'modal' ? title : title.toUpperCase();
  ctx.fillText(label, x + barW + 10, y);

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 10);
  ctx.lineTo(width - SECTION_PADDING, y + 10);
  ctx.stroke();
  ctx.restore();

  return y + 28;
}

const buildOverview = (
  options: MatchReportOptions,
  goals: ProcessedGoal[],
  stats: PlayerMatchStats[]
): MatchOverview => {
  const { game } = options;
  const { ourScore, opponentScore } = getOurOpponentScores(game);

  const substitutions = (game.gameEvents || []).filter(e => e.type === 'substitution').length;
  const fairPlayRecipient = game.availablePlayers?.find(p => p.receivedFairPlayCard)?.name;

  const halftimeScore = getHalftimeScore(goals, game);
  const goalDiff = ourScore - opponentScore;

  const topScorerCandidate = stats
    .filter(s => s.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.points - a.points || a.name.localeCompare(b.name))[0];

  const topAssisterCandidate = stats
    .filter(s => s.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.points - a.points || a.name.localeCompare(b.name))[0];

  const mvpCandidate = stats
    .filter(s => s.points > 0)
    .sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name))[0];

  return {
    ourScore,
    opponentScore,
    halftimeScore,
    goalDiff,
    substitutions,
    fairPlayRecipient,
    topScorer: topScorerCandidate ? { name: topScorerCandidate.name, goals: topScorerCandidate.goals } : undefined,
    topAssister: topAssisterCandidate ? { name: topAssisterCandidate.name, assists: topAssisterCandidate.assists } : undefined,
    mvp: mvpCandidate ? { name: mvpCandidate.name, points: mvpCandidate.points } : undefined,
  };
};

const drawHeader = (
  ctx: CanvasRenderingContext2D,
  theme: ReportTheme,
  options: MatchReportOptions,
  overview: MatchOverview,
  y: number,
  width: number
): number => {
  const { game, seasons, tournaments, personnel, locale, translate: t } = options;
  const COLORS = theme.colors;
  const FONT_FAMILY = theme.fontFamily;

  const cardX = SECTION_PADDING;
  const cardW = width - SECTION_PADDING * 2;
  const innerPad = 26;
  const innerX = cardX + innerPad;
  const innerW = cardW - innerPad * 2;

  ctx.save();
  ctx.font = `600 12px ${FONT_FAMILY}`;

  const { homeName, awayName } = getHomeAwayNames(game, t);
  const homeScore = game.homeScore ?? 0;
  const awayScore = game.awayScore ?? 0;

  const personnelNames = getPersonnelNames(game.gamePersonnel, personnel);
  const staffLine = personnelNames.length > 0 ? `${t('export.personnel', 'Staff')}: ${personnelNames.join(', ')}` : undefined;

  const metaLine1Parts: string[] = [];
  if (game.gameDate) metaLine1Parts.push(formatDate(game.gameDate, locale));
  if (game.gameTime) metaLine1Parts.push(game.gameTime);
  if (game.gameLocation) metaLine1Parts.push(game.gameLocation);
  const metaLine1 = metaLine1Parts.join('   •   ');

  const metaLine2Parts: string[] = [];
  if (game.ageGroup) metaLine2Parts.push(game.ageGroup);
  const contextName = getContextName(game.seasonId, game.tournamentId, seasons, tournaments);
  if (contextName) metaLine2Parts.push(contextName);
  const tournamentLevel = getTournamentLevel(game, tournaments);
  if (tournamentLevel) metaLine2Parts.push(tournamentLevel);
  const leagueName = getLeagueName(game);
  if (leagueName) metaLine2Parts.push(leagueName);
  if (game.numberOfPeriods && game.periodDurationMinutes) metaLine2Parts.push(`${game.numberOfPeriods} × ${game.periodDurationMinutes} min`);
  if (game.gameType) metaLine2Parts.push(game.gameType === 'futsal' ? t('export.futsal', 'Futsal') : t('export.soccer', 'Soccer'));
  if (game.gender) metaLine2Parts.push(game.gender === 'boys' ? t('export.genderBoys', 'Boys') : t('export.genderGirls', 'Girls'));
  metaLine2Parts.push((game.homeOrAway ?? 'home') === 'home' ? t('export.playedAsHome', 'Home') : t('export.playedAsAway', 'Away'));
  const metaLine2 = metaLine2Parts.join('   •   ');

  const cardH = 154 + (overview.halftimeScore ? 18 : 0) + (metaLine1 ? 22 : 0) + (metaLine2 ? 22 : 0) + (staffLine ? 22 : 0);

  // Header card background (gradient)
  const gradient = ctx.createLinearGradient(cardX, y, cardX, y + cardH);
  gradient.addColorStop(0, COLORS.headerTop);
  gradient.addColorStop(1, COLORS.headerBottom);
  drawCard(ctx, theme, cardX, y, cardW, cardH, { fill: gradient, shadow: false, radius: 18 });

  // Title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `700 12px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t('gameSettingsModal.matchReportTitle', 'Match Report').toUpperCase(), innerX, y + 30);

  // Team names + score (HOME first)
  const scoreY = y + 82;
  ctx.font = `700 30px ${FONT_FAMILY}`;
  ctx.fillStyle = '#ffffff';

  const maxTeamNameWidth = (innerW - 170) / 2;
  ctx.textAlign = 'right';
  const leftTeam = truncateText(homeName, maxTeamNameWidth, ctx);
  ctx.fillText(leftTeam, innerX + maxTeamNameWidth, scoreY);

  ctx.textAlign = 'left';
  const rightTeam = truncateText(awayName, maxTeamNameWidth, ctx);
  ctx.fillText(rightTeam, innerX + innerW - maxTeamNameWidth, scoreY);

  // Score pill (HOME–AWAY)
  const scoreX = innerX + innerW / 2;
  const scoreW = 132;
  const scoreH = 44;
  const scoreYTop = scoreY - 34;

  if (theme.name === 'modal') {
    const pill = ctx.createLinearGradient(scoreX - scoreW / 2, scoreYTop, scoreX + scoreW / 2, scoreYTop + scoreH);
    pill.addColorStop(0, 'rgba(56, 189, 248, 0.30)');
    pill.addColorStop(1, 'rgba(56, 189, 248, 0.16)');
    ctx.fillStyle = pill;
    drawRoundedRect(ctx, scoreX - scoreW / 2, scoreYTop, scoreW, scoreH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.30)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, scoreX - scoreW / 2, scoreYTop, scoreW, scoreH, 12);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(14, 165, 233, 0.92)';
    drawRoundedRect(ctx, scoreX - scoreW / 2, scoreYTop, scoreW, scoreH, 12);
    ctx.fill();
  }

  ctx.font = `800 32px ${FONT_FAMILY}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${homeScore}–${awayScore}`, scoreX, scoreYTop + scoreH / 2 + 1);

  // Metadata
  let metaY = y + 110;
  if (overview.halftimeScore) {
    const ht = overview.halftimeScore;
    ctx.font = `700 11px ${FONT_FAMILY}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${t('export.halftimeShort', 'HT')} ${ht.home}–${ht.away}`, scoreX, metaY + 12);
    metaY += 18;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 12px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  if (metaLine1) {
    ctx.fillText(truncateText(metaLine1, innerW, ctx), innerX + innerW / 2, metaY + 12);
    metaY += 22;
  }
  if (metaLine2) {
    ctx.fillText(truncateText(metaLine2, innerW, ctx), innerX + innerW / 2, metaY + 12);
    metaY += 22;
  }
  if (staffLine) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
    ctx.font = `500 11px ${FONT_FAMILY}`;
    ctx.fillText(truncateText(staffLine, innerW, ctx), innerX + innerW / 2, metaY + 12);
    metaY += 22;
  }

  ctx.restore();
  return y + cardH + 22;
};

const drawOverviewSection = (
  ctx: CanvasRenderingContext2D,
  theme: ReportTheme,
  options: MatchReportOptions,
  overview: MatchOverview,
  y: number,
  width: number
): number => {
  const { translate: t } = options;
  const COLORS = theme.colors;
  const FONT_FAMILY = theme.fontFamily;
  let currentY = y;

  currentY = drawSectionHeaderWithTheme(ctx, theme, t('export.overview', 'Overview'), currentY, width);

  const cardX = SECTION_PADDING;
  const cardW = width - SECTION_PADDING * 2;
  const cardH = 126;
  drawCard(ctx, theme, cardX, currentY, cardW, cardH, { border: COLORS.border, shadow: theme.name === 'modal' });

  const pad = 22;
  const colGap = 18;
  const colW = (cardW - pad * 2 - colGap) / 2;
  const leftX = cardX + pad;
  const rightX = leftX + colW + colGap;
  let rowY = currentY + 34;

  const labelStyle = (): void => {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `700 10px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };
  const valueStyle = (emphasis: 'normal' | 'good' | 'bad' | 'accent' = 'normal'): void => {
    ctx.font = `600 14px ${FONT_FAMILY}`;
    ctx.fillStyle =
      emphasis === 'good'
        ? COLORS.success
        : emphasis === 'bad'
          ? COLORS.danger
          : emphasis === 'accent'
            ? COLORS.accent
            : COLORS.text;
  };

  const drawKV = (
    x: number,
    label: string,
    value: string,
    maxValueWidth: number,
    emphasis: 'normal' | 'good' | 'bad' | 'accent' = 'normal'
  ): void => {
    labelStyle();
    ctx.fillText(label.toUpperCase(), x, rowY - 10);
    valueStyle(emphasis);
    ctx.fillText(truncateText(value, maxValueWidth, ctx), x, rowY + 10);
  };

  const result = getMatchResult(overview.ourScore, overview.opponentScore);
  const resultText = result === 'win' ? t('export.win', 'Win') : result === 'loss' ? t('export.loss', 'Loss') : t('export.tie', 'Tie');

  drawKV(leftX, t('export.result', 'Result'), resultText, colW * 0.5, result === 'win' ? 'good' : result === 'loss' ? 'bad' : 'accent');
  drawKV(
    leftX + colW * 0.55,
    t('export.goalDifference', 'Goal Difference'),
    `${overview.goalDiff > 0 ? '+' : ''}${overview.goalDiff}`,
    colW * 0.45,
    overview.goalDiff > 0 ? 'good' : overview.goalDiff < 0 ? 'bad' : 'accent'
  );

  const pointsLeaderLine = overview.mvp
    ? `${overview.mvp.name} (${overview.mvp.points}p)`
    : '-';
  drawKV(rightX, t('export.pointsLeader', 'Points leader'), pointsLeaderLine, colW, overview.mvp ? 'accent' : 'normal');

  const subsText = overview.substitutions > 0 ? String(overview.substitutions) : '-';
  drawKV(
    rightX + colW * 0.55,
    t('export.substitutions', 'Substitutions'),
    subsText,
    colW * 0.45,
    overview.substitutions > 0 ? 'normal' : 'normal'
  );

  rowY += 54;

  const scorerLine = overview.topScorer ? `${overview.topScorer.name} (${overview.topScorer.goals})` : '-';
  drawKV(leftX, t('export.mostGoals', 'Most goals'), scorerLine, colW * 0.5, overview.topScorer ? 'good' : 'normal');

  const assisterLine = overview.topAssister ? `${overview.topAssister.name} (${overview.topAssister.assists})` : '-';
  drawKV(leftX + colW * 0.55, t('export.mostAssists', 'Most assists'), assisterLine, colW * 0.45, overview.topAssister ? 'accent' : 'normal');

  const fpLine = overview.fairPlayRecipient ? overview.fairPlayRecipient : '-';
  drawKV(rightX, t('export.fairPlay', 'Fair Play'), fpLine, colW, overview.fairPlayRecipient ? 'good' : 'normal');

  if (overview.halftimeScore) {
    const ht = overview.halftimeScore;
    drawKV(
      rightX + colW * 0.55,
      t('export.halftime', 'Halftime'),
      `${ht.home}–${ht.away}`,
      colW * 0.45,
      'normal'
    );
  } else {
    drawKV(rightX + colW * 0.55, t('export.halftime', 'Halftime'), '-', colW * 0.45, 'normal');
  }

  return currentY + cardH + 26;
};

const drawGoalsSection = (
  ctx: CanvasRenderingContext2D,
  goals: ProcessedGoal[],
  theme: ReportTheme,
  options: MatchReportOptions,
  y: number,
  width: number
): number => {
  const { game, translate: t } = options;
  const COLORS = theme.colors;
  const FONT_FAMILY = theme.fontFamily;
  let currentY = y;

  currentY = drawSectionHeaderWithTheme(ctx, theme, t('export.goals', 'Goals'), currentY, width);

  const cardX = SECTION_PADDING;
  const cardW = width - SECTION_PADDING * 2;
  const rowH = 28;
  const pad = 18;
  const listPadY = 16;

  const totalRows = Math.max(goals.length, 1);
  const cardH = listPadY * 2 + totalRows * rowH + (game.numberOfPeriods === 2 ? 16 : 0);
  drawCard(ctx, theme, cardX, currentY, cardW, cardH, { border: COLORS.border, shadow: theme.name === 'modal' });

  if (goals.length === 0) {
    ctx.fillStyle = COLORS.faint;
    ctx.font = `500 13px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t('gameSettingsModal.noGoalsLogged', 'No goals logged'), cardX + pad, currentY + listPadY + 20);
    return currentY + cardH + 26;
  }

  const hasTwoPeriods = game.numberOfPeriods === 2 && Boolean(game.periodDurationMinutes);
  const halftimeCutoff = hasTwoPeriods ? (game.periodDurationMinutes ?? 0) * 60 : Infinity;
  let halftimeMarkerInserted = false;

  const dotX = cardX + pad;
  const timeX = dotX + 10;
  const textX = timeX + 52;
  const scoreX = cardX + cardW - pad;

  let cy = currentY + listPadY + 22;

  for (let index = 0; index < goals.length; index++) {
    const goal = goals[index];
    if (hasTwoPeriods && !halftimeMarkerInserted && goal.time > halftimeCutoff) {
      halftimeMarkerInserted = true;
      const label = t('export.halftime', 'Halftime').toUpperCase();
      ctx.font = `800 10px ${FONT_FAMILY}`;
      const labelW = ctx.measureText(label).width;
      const centerX = cardX + cardW / 2;
      const lineY = cy - 8;
      const gap = 10;
      const leftStart = cardX + pad;
      const leftEnd = Math.max(leftStart, centerX - labelW / 2 - gap);
      const rightStart = Math.min(scoreX, centerX + labelW / 2 + gap);
      const rightEnd = scoreX;

      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftStart, lineY);
      ctx.lineTo(leftEnd, lineY);
      ctx.moveTo(rightStart, lineY);
      ctx.lineTo(rightEnd, lineY);
      ctx.stroke();

      ctx.fillStyle = COLORS.faint;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(label, centerX, lineY - 2);

      cy += 12;
    }

    const accent = goal.isOurGoal ? COLORS.success : COLORS.danger;
    const rowTop = cy - 18;
    if (theme.name === 'modal') {
      ctx.fillStyle = index % 2 === 0 ? COLORS.rowBg : COLORS.rowBgAlt;
      drawRoundedRect(ctx, cardX + pad - 6, rowTop + 2, cardW - (pad - 6) * 2, rowH - 4, 10);
      ctx.fill();
      ctx.fillStyle = accent;
      drawRoundedRect(ctx, cardX + pad - 6, rowTop + 6, 4, rowH - 12, 2);
      ctx.fill();
    } else if (index % 2 === 1) {
      ctx.fillStyle = COLORS.rowBg;
      ctx.fillRect(cardX + 1, rowTop, cardW - 2, rowH);
    }

    // Dot (kept for classic; subtle for modal)
    if (theme.name !== 'modal') {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(dotX, cy - 8, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Time
    if (theme.name === 'modal') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      drawRoundedRect(ctx, timeX - 6, cy - 20, 50, 18, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, timeX - 6, cy - 20, 50, 18, 7);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.font = `700 11.5px ${FONT_FAMILY}`;
    } else {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `700 12px ${FONT_FAMILY}`;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(goal.timeFormatted, timeX, cy - 6);

    // Event text (scorer bold + assist muted)
    const maxEventWidth = scoreX - textX - (theme.name === 'modal' ? 98 : 70);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 13px ${FONT_FAMILY}`;
    const scorerText = truncateText(goal.scorerName, maxEventWidth, ctx);
    ctx.fillText(scorerText, textX, cy - 6);

    if (goal.assisterName) {
      const scorerW = ctx.measureText(scorerText).width;
      const assistLabel = `  ·  ${t('export.assists', 'Assists')}: ${goal.assisterName}`;
      ctx.fillStyle = COLORS.muted;
      ctx.font = `600 12px ${FONT_FAMILY}`;
      const remaining = Math.max(0, maxEventWidth - scorerW);
      if (remaining > 20) {
        ctx.fillText(truncateText(assistLabel, remaining, ctx), textX + scorerW, cy - 6);
      }
    }

    // Score
    ctx.fillStyle = accent;
    ctx.textAlign = 'right';
    if (theme.name === 'modal') {
      const scoreText = `${goal.runningScore.home}–${goal.runningScore.away}`;
      ctx.font = `800 12.5px ${FONT_FAMILY}`;
      const w = ctx.measureText(scoreText).width;
      const chipW = Math.max(56, w + 18);
      const chipH = 18;
      const chipX = scoreX - chipW;
      const chipY = cy - 20;
      ctx.fillStyle = COLORS.chipBg;
      drawRoundedRect(ctx, chipX, chipY, chipW, chipH, 8);
      ctx.fill();
      ctx.strokeStyle = COLORS.chipBorder;
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, chipX, chipY, chipW, chipH, 8);
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.fillText(scoreText, scoreX - 9, cy - 6);
    } else {
      ctx.font = `800 12.5px ${FONT_FAMILY}`;
      ctx.fillText(`${goal.runningScore.home}–${goal.runningScore.away}`, scoreX, cy - 4);
    }

    cy += rowH;
  }

  return currentY + cardH + 26;
};

const drawPlayerStatsSection = (
  ctx: CanvasRenderingContext2D,
  stats: PlayerMatchStats[],
  theme: ReportTheme,
  options: MatchReportOptions,
  y: number,
  width: number
): number => {
  const { translate: t } = options;
  const COLORS = theme.colors;
  const FONT_FAMILY = theme.fontFamily;
  let currentY = y;

  currentY = drawSectionHeaderWithTheme(ctx, theme, t('export.playerStats', 'Player Statistics'), currentY, width);

  const cardX = SECTION_PADDING;
  const cardW = width - SECTION_PADDING * 2;
  const pad = 18;
  const headerH = 32;
  const rowH = 28;
  const minRows = 3;
  const rows = Math.max(stats.length, minRows);
  const cardH = pad + headerH + rows * rowH + pad;

  drawCard(ctx, theme, cardX, currentY, cardW, cardH, { border: COLORS.border, shadow: theme.name === 'modal' });

  const headerY = currentY + pad + 18;
  ctx.fillStyle = COLORS.muted;
  ctx.font = `800 10px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('#', cardX + pad, headerY);
  ctx.fillText(t('playerBar.name', 'Name').toUpperCase(), cardX + pad + 46, headerY);
  ctx.textAlign = 'right';
  ctx.fillText('G', cardX + cardW - pad - 88, headerY);
  ctx.fillText('A', cardX + cardW - pad - 52, headerY);
  ctx.fillText('P', cardX + cardW - pad - 16, headerY);

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + pad, headerY + 10);
  ctx.lineTo(cardX + cardW - pad, headerY + 10);
  ctx.stroke();

  let cy = headerY + 28;

  if (stats.length === 0) {
    ctx.fillStyle = COLORS.faint;
    ctx.font = `500 13px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.fillText(t('export.none', 'None'), cardX + pad, cy);
    return currentY + cardH + 26;
  }

  for (let i = 0; i < stats.length; i++) {
    const player = stats[i];
    if (theme.name === 'modal') {
      ctx.fillStyle = i % 2 === 0 ? COLORS.rowBg : COLORS.rowBgAlt;
      drawRoundedRect(ctx, cardX + pad - 6, cy - 18 + 2, cardW - (pad - 6) * 2, rowH - 4, 10);
      ctx.fill();
    } else if (i % 2 === 1) {
      ctx.fillStyle = COLORS.rowBg;
      ctx.fillRect(cardX + 1, cy - 18, cardW - 2, rowH);
    }

    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 12px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(player.jerseyNumber || '-', cardX + pad, cy);

    ctx.fillStyle = COLORS.text;
    ctx.font = `600 13px ${FONT_FAMILY}`;
    const nameX = cardX + pad + 46;
    const maxNameWidth = cardX + cardW - pad - 120 - nameX;
    ctx.fillText(truncateText(player.name, maxNameWidth, ctx), nameX, cy);

    ctx.textAlign = 'right';
    ctx.font = `700 13px ${FONT_FAMILY}`;
    ctx.fillStyle = player.goals > 0 ? COLORS.success : COLORS.text;
    ctx.fillText(String(player.goals), cardX + cardW - pad - 88, cy);
    ctx.fillStyle = player.assists > 0 ? COLORS.accent : COLORS.text;
    ctx.fillText(String(player.assists), cardX + cardW - pad - 52, cy);
    ctx.fillStyle = player.points > 0 ? COLORS.text : COLORS.text;
    ctx.fillText(String(player.points), cardX + cardW - pad - 16, cy);

    cy += rowH;
  }

  return currentY + cardH + 26;
};

const drawCoachReportSection = (
  ctx: CanvasRenderingContext2D,
  reportText: string,
  theme: ReportTheme,
  options: MatchReportOptions,
  y: number,
  width: number
): number => {
  const { translate: t } = options;
  const COLORS = theme.colors;
  const FONT_FAMILY = theme.fontFamily;
  let currentY = y;

  currentY = drawSectionHeaderWithTheme(ctx, theme, t('export.coachsReport', "Coach's Report"), currentY, width);

  const cardX = SECTION_PADDING;
  const cardW = width - SECTION_PADDING * 2;
  const pad = 18;

  ctx.font = `600 13px ${FONT_FAMILY}`;
  const maxWidth = cardW - pad * 2;
  const lines = reportText.trim() ? measureWrappedLines(ctx, reportText.trim(), maxWidth) : [];
  const lineH = 20;
  const minH = 74;
  const bodyH = reportText.trim() ? lines.length * lineH + pad * 2 : minH;
  const cardH = Math.max(minH, bodyH);

  drawCard(ctx, theme, cardX, currentY, cardW, cardH, { border: COLORS.border, shadow: theme.name === 'modal' });

  if (!reportText.trim()) {
    ctx.fillStyle = COLORS.faint;
    ctx.font = `500 13px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t('gameSettingsModal.noMatchReport', 'No match report'), cardX + pad, currentY + pad + 26);
    return currentY + cardH + 26;
  }

  ctx.fillStyle = COLORS.text2;
  ctx.font = `600 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  let cy = currentY + pad + 26;
  for (const line of lines) {
    ctx.fillText(line, cardX + pad, cy);
    cy += lineH;
  }

  return currentY + cardH + 26;
};

const drawFieldSection = (
  ctx: CanvasRenderingContext2D,
  fieldCanvas: HTMLCanvasElement | null,
  theme: ReportTheme,
  options: MatchReportOptions,
  y: number,
  width: number
): number => {
  const { translate: t } = options;
  const COLORS = theme.colors;
  let currentY = y;

  if (!fieldCanvas) return currentY;

  currentY = drawSectionHeaderWithTheme(ctx, theme, t('export.fieldFormation', 'Field Formation'), currentY, width);

  const cardX = SECTION_PADDING;
  const cardW = width - SECTION_PADDING * 2;
  const pad = 18;

  const maxFieldW = cardW - pad * 2;
  const aspect = fieldCanvas.height / fieldCanvas.width;
  const fieldW = Math.min(maxFieldW, 720);
  const fieldH = fieldW * aspect;
  const cardH = pad + fieldH + pad;

  drawCard(ctx, theme, cardX, currentY, cardW, cardH, { border: COLORS.border, shadow: theme.name === 'modal' });

  const x = cardX + (cardW - fieldW) / 2;
  const imgY = currentY + pad;

  // Image border
  ctx.drawImage(fieldCanvas, x, imgY, fieldW, fieldH);
  ctx.strokeStyle = theme.name === 'modal' ? COLORS.border : 'rgba(15, 23, 42, 0.10)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, imgY, fieldW, fieldH);

  return currentY + cardH + 26;
};

const drawFooter = (ctx: CanvasRenderingContext2D, theme: ReportTheme, y: number, width: number): number => {
  const x = SECTION_PADDING;
  const COLORS = theme.colors;
  const FONT_FAMILY = theme.fontFamily;

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(width - SECTION_PADDING, y);
  ctx.stroke();

  ctx.fillStyle = theme.name === 'modal' ? COLORS.muted : COLORS.faint;
  ctx.font = `700 11px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Generated with MatchOps  •  matchops.app', width / 2, y + 22);

  return y + 44;
};

const estimateReportHeight = (
  ctx: CanvasRenderingContext2D,
  theme: ReportTheme,
  options: MatchReportOptions,
  goals: ProcessedGoal[],
  stats: PlayerMatchStats[]
): number => {
  const { game } = options;
  const FONT_FAMILY = theme.fontFamily;
  let total = 0;
  total += SECTION_PADDING; // top

  // Header: reproduce height logic
  ctx.font = `600 12px ${FONT_FAMILY}`;
  const hasHalftime = Boolean(getHalftimeScore(goals, game));
  const hasMetaLine1 = Boolean(game.gameDate || game.gameTime || game.gameLocation);
  // Meta line 2 is always present because it always includes "played as home/away".
  const hasMetaLine2 = true;
  const hasStaff = getPersonnelNames(game.gamePersonnel, options.personnel).length > 0;
  const headerH = 154 + (hasHalftime ? 18 : 0) + (hasMetaLine1 ? 22 : 0) + (hasMetaLine2 ? 22 : 0) + (hasStaff ? 22 : 0);
  total += headerH + 22;

  // Overview fixed card
  total += 28 + 126 + 26;

  // Goals: header + card
  const goalsRows = Math.max(goals.length, 1);
  total += 28 + (16 * 2 + goalsRows * 28 + (game.numberOfPeriods === 2 ? 16 : 0)) + 26;

  // Player stats: header + card
  total += 28 + (18 + 32 + Math.max(stats.length, 3) * 28 + 18) + 26;

  // Coach report
  ctx.font = `500 13px ${FONT_FAMILY}`;
  const pad = 18;
  const maxW = (REPORT_WIDTH - SECTION_PADDING * 2) - pad * 2;
  const lineH = 20;
  const reportText = options.game.gameNotes || '';
  const lines = reportText.trim() ? measureWrappedLines(ctx, reportText.trim(), maxW) : [];
  const cardH = Math.max(74, reportText.trim() ? lines.length * lineH + pad * 2 : 74);
  total += 28 + cardH + 26;

  // Field
  if (options.fieldCanvas) {
    const aspect = options.fieldCanvas.height / options.fieldCanvas.width;
    const cardW = REPORT_WIDTH - SECTION_PADDING * 2;
    const maxFieldW = cardW - pad * 2;
    const fieldW = Math.min(maxFieldW, 720);
    const fieldH = fieldW * aspect;
    const fieldCardH = pad + fieldH + pad;
    total += 28 + fieldCardH + 26;
  }

  // Footer
  total += 44;
  total += SECTION_PADDING; // bottom

  // Use a minimum height for nicer single-page output
  return Math.max(total, 1100);
};

const renderMatchReportCanvas = (options: MatchReportOptions, scale: number): HTMLCanvasElement => {
  const { game, players } = options;
  const theme = getReportTheme(options.theme);

  const goals = processGoals(game.gameEvents || [], players, game, options.translate);
  const stats = calculatePlayerMatchStats(game.gameEvents || [], game.selectedPlayerIds || [], players);
  const overview = buildOverview(options, goals, stats);

  // Measure pass
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = REPORT_WIDTH;
  measureCanvas.height = 10;
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) throw new Error('Failed to get canvas context (measure)');

  const height = estimateReportHeight(measureCtx, theme, options, goals, stats);

  // Render pass
  const canvas = document.createElement('canvas');
  canvas.width = REPORT_WIDTH * scale;
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context (render)');

  ctx.scale(scale, scale);
  theme.drawPageBackground(ctx, REPORT_WIDTH, height);

  let y = SECTION_PADDING;
  y = drawHeader(ctx, theme, options, overview, y, REPORT_WIDTH);
  y = drawOverviewSection(ctx, theme, options, overview, y, REPORT_WIDTH);
  y = drawGoalsSection(ctx, goals, theme, options, y, REPORT_WIDTH);
  y = drawPlayerStatsSection(ctx, stats, theme, options, y, REPORT_WIDTH);
  y = drawCoachReportSection(ctx, game.gameNotes || '', theme, options, y, REPORT_WIDTH);
  if (options.fieldCanvas) {
    y = drawFieldSection(ctx, options.fieldCanvas, theme, options, y, REPORT_WIDTH);
  }
  y += 8;
  drawFooter(ctx, theme, y, REPORT_WIDTH);

  return canvas;
};

/**
 * Generate match report as PNG image
 */
export async function generateMatchReportPNG(options: MatchReportOptions): Promise<void> {
  await ensureFontsLoaded(getReportTheme(options.theme));
  const canvas = renderMatchReportCanvas(options, DEFAULT_RENDER_SCALE);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('PNG generation timed out'));
    }, BLOB_CREATION_TIMEOUT_MS);

    canvas.toBlob(
      (blob) => {
        clearTimeout(timeout);
        if (!blob) {
          reject(new Error('Failed to create PNG blob'));
          return;
        }
        triggerDownload(blob, generateReportFilename(options, 'png'));
        resolve();
      },
      'image/png'
    );
  });
}

/**
 * Generate match report as PDF document (A4)
 */
export async function generateMatchReportPDF(options: MatchReportOptions): Promise<void> {
  await ensureFontsLoaded(getReportTheme(options.theme));
  const canvas = renderMatchReportCanvas(options, DEFAULT_RENDER_SCALE);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const marginMm = 12;
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const contentWidthMm = pageWidthMm - marginMm * 2;
  const contentHeightMm = pageHeightMm - marginMm * 2;

  const pxPerMm = canvas.width / contentWidthMm;
  const sliceHeightPx = Math.max(1, Math.floor(contentHeightMm * pxPerMm));

  let offsetY = 0;
  let pageIndex = 0;

  while (offsetY < canvas.height) {
    if (pageIndex > 0) pdf.addPage();

    const slicePx = Math.min(sliceHeightPx, canvas.height - offsetY);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = slicePx;
    const sliceCtx = sliceCanvas.getContext('2d');
    if (!sliceCtx) throw new Error('Failed to get canvas context (pdf slice)');

    sliceCtx.drawImage(canvas, 0, offsetY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);

    // Use PNG to avoid compression artifacts (banding/patterns) in gradients and fine lines.
    const imgData = sliceCanvas.toDataURL('image/png');
    const sliceHeightMm = slicePx / pxPerMm;

    pdf.addImage(imgData, 'PNG', marginMm, marginMm, contentWidthMm, sliceHeightMm);

    offsetY += slicePx;
    pageIndex++;
  }

  pdf.save(generateReportFilename(options, 'pdf'));
}

/**
 * Generate match report (main entry point)
 */
export async function generateMatchReport(options: MatchReportOptions): Promise<void> {
  logger.log('Generating match report', { format: options.format, gameId: options.gameId });

  try {
    if (options.format === 'pdf') {
      await generateMatchReportPDF(options);
    } else {
      await generateMatchReportPNG(options);
    }
    logger.log('Match report generated successfully', { format: options.format });
  } catch (error) {
    logger.error('Failed to generate match report', error);
    throw error;
  }
}
