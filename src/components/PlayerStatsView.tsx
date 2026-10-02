'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { useDataStore } from '@/hooks/useDataStore';
import type { TranslationKey } from '@/i18n-types';
import { Player, Season, Tournament, Team } from '@/types';
import { AppState } from '@/types';
import type { GameType, Gender } from '@/types/game';
import { calculatePlayerStats, PlayerStats as PlayerStatsData, isGameInPlayerScope } from '@/utils/playerStats';
import { adjustmentInScope } from '@/utils/adjustmentScope';
import type { PlayerStatAdjustment } from '@/types';
import { calculatePlayerDevelopment, getPlayerAssessmentTrends, getPlayerAssessmentNotes, type TrendDirection, type AssessmentScope } from '@/utils/assessmentStats';
import { getAppSettings, updateAppSettings } from '@/utils/appSettings';
import { useAssessmentRatingStyle } from '@/hooks/useAssessmentRatingStyle';
import { useAssessmentTemplate } from '@/hooks/useAssessmentTemplate';
import { format } from 'date-fns';
import { fi, enUS } from 'date-fns/locale';
import SparklineChart from './SparklineChart';
import RatingBar from './RatingBar';
import { ASSESSMENT_MAX, RATING_STYLE_MAX, ratingBandLevel, ratingDisplayNumber, templateMetricIds } from '@/config/assessmentMetrics';
import MetricTrendChart from './MetricTrendChart';
import PlayerDevelopmentRadar, { type RadarAxis } from './PlayerDevelopmentRadar';
import { exportPlayerDevelopmentCard, isCardExportSupported } from '@/utils/export/exportPlayerDevelopmentCard';
import { buildPlayerEvidence, DEFAULT_EVIDENCE_SECTIONS, type EvidenceSections } from '@/utils/playerEvidence';
import GameRecapModal from '@/components/GameRecapModal';
import MetricAreaChart from './MetricAreaChart';
import { computePositionDiversity } from '@/utils/positionDiversity';
import { POSITION_IDS } from '@/config/positions';
import ExternalGamesSection, { getResultClass } from './ExternalGamesSection';
import logger from '@/utils/logger';
import { getClubSeasonForDate } from '@/utils/clubSeason';
import PlayerNotesSummaryCard from './PlayerNotesSummaryCard';

// Line badge colours mirror the position-category colours used in the positions editor.
interface PlayerStatsViewProps {
  player: Player | null;
  savedGames: { [key: string]: AppState };
  onGameClick: (gameId: string) => void;
  seasons: Season[];
  tournaments: Tournament[];
  teamId?: string; // Optional team filtering
  selectedClubSeason: string;
  /** Club season start date (ISO format YYYY-MM-DD). Year is template (e.g., "2000-10-01" for Oct 1). */
  clubSeasonStartDate: string;
  /** Club season end date (ISO format YYYY-MM-DD). Year is template (e.g., "2000-05-01" for May 1). */
  clubSeasonEndDate: string;
  /** Optional game type filter - 'soccer', 'futsal', or 'all' */
  selectedGameTypeFilter?: GameType | 'all';
  /** Optional gender filter - 'boys', 'girls', or 'all' */
  selectedGenderFilter?: Gender | 'all';
  includeFriendlies?: boolean;
  /** Full roster: only needed so other children named in a note are redacted too. */
  masterRoster?: Player[];
  /**
   * The coach's own teams. An external game can name one of them - the match
   * your team played that you could not sit and track - and that is the only
   * way the app can tell it apart from a game played for somebody else.
   */
  teams?: Team[];
  /** Off hides the development report even where ratings exist (default true for callers that predate the setting). */
  assessmentsEnabled?: boolean;
}

const PlayerStatsView: React.FC<PlayerStatsViewProps> = ({ player, savedGames, onGameClick, seasons, tournaments, teamId, selectedClubSeason, clubSeasonStartDate, clubSeasonEndDate, selectedGameTypeFilter = 'all', selectedGenderFilter = 'all', includeFriendlies = false, masterRoster, teams = [] , assessmentsEnabled = true }) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { userId } = useDataStore();

  const [showRatings, setShowRatings] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState('goalsAssists');
  const [useDemandCorrection, setUseDemandCorrection] = useState(false);
  const [recencyWeighted, setRecencyWeighted] = useState(true);
  const [scope, setScope] = useState<AssessmentScope>('all');
  const [showEvidence, setShowEvidence] = useState(false);
  // What goes into the summary. The game list is off to begin with: a season of
  // matches makes it longer than anyone reads, and it is the block a coach
  // wants least often.
  const [sections, setSections] = useState<EvidenceSections>(DEFAULT_EVIDENCE_SECTIONS);
  const [assessmentSeason, setAssessmentSeason] = useState<'all' | 'season'>('all');
  // Read live from the shared settings query (same source SettingsModal invalidates)
  // so a change to the rating style / metric template shows without an app reload.
  const ratingStyle = useAssessmentRatingStyle();
  const assessmentTemplate = useAssessmentTemplate();
  const [adjustments, setAdjustments] = useState<PlayerStatAdjustment[]>([]);

  useEffect(() => {
    // Pass userId to avoid DataStore initialization conflicts (MATCHOPS-LOCAL-2N)
    getAppSettings(userId).then(s => {
      setUseDemandCorrection(s.useDemandCorrection ?? false);
    });
  }, [userId]);

  // The active template's metric ids - the report mirrors the coach's current
  // compass, so a metric no longer in the template is not drawn even if older
  // games still hold its data (e.g. a legacy 'creativity' value under 'balanced').
  const reportMetricIds = useMemo(() => templateMetricIds(assessmentTemplate), [assessmentTemplate]);

  // Long-term/development view: summarise a (possibly fractional) canonical
  // rating as a word band, with the number appended for numeric styles.
  const formatRatingBand = useCallback((canonical: number): string => {
    const word = t(`assessmentScale.level${ratingBandLevel(canonical)}` as TranslationKey);
    if (ratingStyle === 'words') return word;
    const num = ratingDisplayNumber(canonical, RATING_STYLE_MAX[ratingStyle]).toFixed(1);
    return `${word} · ${num}`;
  }, [ratingStyle, t]);

  // Trend direction → arrow glyph, colour, and accessible label.
  const trendMeta = useCallback((direction: TrendDirection) => {
    switch (direction) {
      case 'rising': return { arrow: '↑', className: 'text-green-400', title: t('assessmentTrend.rising', 'Rising') };
      case 'slipping': return { arrow: '↓', className: 'text-red-400', title: t('assessmentTrend.slipping', 'Slipping') };
      case 'steady': return { arrow: '→', className: 'text-slate-400', title: t('assessmentTrend.steady', 'Steady') };
      default: return { arrow: '·', className: 'text-slate-600', title: t('assessmentTrend.insufficient', 'Too early to tell') };
    }
  }, [t]);

  // Helper function to format dates consistently
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), i18n.language === 'fi' ? 'd.M.yyyy' : 'PP', {
        locale: i18n.language === 'fi' ? fi : enUS
      });
    } catch (error) {
      logger.warn('Failed to format date in PlayerStatsView', { dateStr, error });
      return dateStr;
    }
  };

  // Separate season scope for the assessment section only (does not affect the
  // goals/assists/games stats). "Current season" = the club season of the most
  // recent game. Shown only when the data spans more than one club season.
  const currentClubSeason = useMemo(() => {
    const dated = Object.values(savedGames).filter(g => g.gameDate);
    if (dated.length === 0) return null;
    const latest = dated.reduce((a, b) => ((a.gameDate as string) > (b.gameDate as string) ? a : b));
    return getClubSeasonForDate(latest.gameDate as string, clubSeasonStartDate, clubSeasonEndDate);
  }, [savedGames, clubSeasonStartDate, clubSeasonEndDate]);

  const hasMultipleSeasons = useMemo(() => {
    const seen = new Set<string>();
    for (const g of Object.values(savedGames)) {
      if (g.gameDate) seen.add(getClubSeasonForDate(g.gameDate, clubSeasonStartDate, clubSeasonEndDate));
      if (seen.size > 1) return true;
    }
    return false;
  }, [savedGames, clubSeasonStartDate, clubSeasonEndDate]);

  const assessmentGames = useMemo(() => {
    if (assessmentSeason !== 'season' || !currentClubSeason) return savedGames;
    return Object.fromEntries(
      Object.entries(savedGames).filter(([, g]) =>
        g.gameDate && getClubSeasonForDate(g.gameDate, clubSeasonStartDate, clubSeasonEndDate) === currentClubSeason,
      ),
    );
  }, [savedGames, assessmentSeason, currentClubSeason, clubSeasonStartDate, clubSeasonEndDate]);

  const playerDevelopment = useMemo(() => {
    if (!player) return null;
    return calculatePlayerDevelopment(player.id, assessmentGames, { recencyWeighted, useDemandCorrection, scope, metricIds: reportMetricIds });
  }, [player, assessmentGames, recencyWeighted, useDemandCorrection, scope, reportMetricIds]);

  // Radar axes (qualities with data). Shown only once there are enough games
  // for a meaningful "now vs then" comparison.
  const radarAxes = useMemo<RadarAxis[]>(() => {
    if (!playerDevelopment) return [];
    return Object.entries(playerDevelopment.metrics)
      .filter(([, d]) => d.level > 0)
      .map(([key, d]) => ({
        key,
        label: t(`assessmentMetrics.${key}` as TranslationKey, key),
        current: d.level,
        baseline: d.baseline,
      }));
  }, [playerDevelopment, t]);
  const showRadar = !!playerDevelopment && playerDevelopment.count >= 3 && radarAxes.length >= 3;

  // Whether the player has any assessment at all (any season) - keeps the whole
  // ratings section (and its season/scope controls) visible even when the
  // current filter has no data, so the user isn't trapped on an empty filter.
  const hasAnyAssessment = useMemo(
    () => !!player && Object.values(savedGames).some(g => g.assessments?.[player.id]),
    [player, savedGames],
  );

  const handleExportReport = useCallback(async () => {
    if (!player || !playerDevelopment) return;
    const hexFor: Record<TrendDirection, string> = {
      rising: '#34d399', slipping: '#f87171', steady: '#94a3b8', insufficient: '#64748b',
    };
    const toItem = (m: string) => {
      const dir = playerDevelopment.metrics[m].direction;
      return { label: t(`assessmentMetrics.${m}` as TranslationKey, m), arrow: trendMeta(dir).arrow, color: hexFor[dir] };
    };
    try {
      await exportPlayerDevelopmentCard({
        playerName: player.name,
        countLabel: `${playerDevelopment.count} ${t('playerStats.ratedGames', 'rated games')}`,
        max: ASSESSMENT_MAX,
        axes: radarAxes.map(a => ({ label: a.label, current: a.current, baseline: a.baseline })),
        strengths: playerDevelopment.strengths.map(toItem),
        focus: playerDevelopment.focusAreas.map(toItem),
        labels: {
          title: t('playerStats.developmentReport', 'Development report'),
          now: t('playerStats.radarNow', 'Now'),
          baseline: t('playerStats.radarBaseline', 'Season start'),
          strengths: t('playerStats.strengths', 'Strengths'),
          focus: t('playerStats.focusAreas', 'Focus areas'),
        },
      });
    } catch (error) {
      logger.error('[PlayerStatsView] Failed to export development report', error);
      showToast(t('playerStats.exportReportFailed', 'Failed to export report'), 'error');
    }
  }, [player, playerDevelopment, radarAxes, t, trendMeta, showToast]);

  const assessmentTrends = useMemo(() => {
    if (!player) return null;
    return getPlayerAssessmentTrends(player.id, assessmentGames, reportMetricIds);
  }, [player, assessmentGames, reportMetricIds]);

  const assessmentNotes = useMemo(() => {
    if (!player) return [];
    return getPlayerAssessmentNotes(player.id, assessmentGames);
  }, [player, assessmentGames]);

  // Kirjuri notes about this player across ALL games, newest game first -
  // independent of assessments (which may be hidden or absent).
  const playerNotes = useMemo(() => {
    if (!player) return [];
    return Object.entries(savedGames)
      .flatMap(([gameId, g]) =>
        (g.gameEvents ?? [])
          .filter((e) => e.type === 'note' && e.entityId === player.id)
          .map((e) => ({
            id: `${gameId}-${e.id}`,
            gameId,
            gameDate: g.gameDate ?? '',
            opponentName: g.opponentName ?? '',
            time: e.time,
            period: e.period,
            text: e.text ?? '',
          })),
      )
      .sort((a, b) => b.gameDate.localeCompare(a.gameDate) || a.time - b.time);
  }, [player, savedGames]);

  // Filter games by selected club season and game type
  const filteredGamesByClubSeason = useMemo(() => {
    // Inline filtering to avoid redundant object transformations
    return Object.fromEntries(
       
      Object.entries(savedGames).filter(([_id, game]) => {
        // Filter by club season
        if (selectedClubSeason !== 'all') {
          if (!game.gameDate) return false;
          const gameSeason = getClubSeasonForDate(
            game.gameDate,
            clubSeasonStartDate,
            clubSeasonEndDate
          );
          if (gameSeason !== selectedClubSeason) return false;
        }

        // Filter by game type
        if (selectedGameTypeFilter !== 'all') {
          const gameType = game.gameType || 'soccer'; // Default to soccer for legacy games
          if (gameType !== selectedGameTypeFilter) return false;
        }

        // Filter by gender
        if (selectedGenderFilter !== 'all') {
          if (game.gender !== selectedGenderFilter) return false;
        }

        return true;
      })
    );
  }, [savedGames, selectedClubSeason, selectedGameTypeFilter, selectedGenderFilter, clubSeasonStartDate, clubSeasonEndDate]);

  /**
   * External games narrowed to the same scope the games above were narrowed
   * to, by the same rule the stats table uses. Without this the table could
   * show a coach one total and this view another for the same filter, which is
   * the contradiction that started all of this.
   */
  const adjustmentsInScope = useMemo(
    () =>
      adjustments.filter(a =>
        adjustmentInScope(a, {
          teamFilter: teamId ?? 'all',
          clubSeason: selectedClubSeason,
          clubSeasonStartDate,
          clubSeasonEndDate,
          gameTypeFilter: selectedGameTypeFilter,
          genderFilter: selectedGenderFilter,
        }),
      ),
    [adjustments, teamId, selectedClubSeason, clubSeasonStartDate, clubSeasonEndDate, selectedGameTypeFilter, selectedGenderFilter],
  );

  /** Ids that actually reach the totals, so the list can say which do. */
  const countedAdjustmentIds = useMemo(
    () => new Set(adjustmentsInScope.map(a => a.id)),
    [adjustmentsInScope],
  );

  const playerStats: PlayerStatsData | null = useMemo(() => {
    if (!player) return null;
    return calculatePlayerStats(player, filteredGamesByClubSeason, seasons, tournaments, adjustmentsInScope, teamId, includeFriendlies);
  }, [player, filteredGamesByClubSeason, seasons, tournaments, adjustmentsInScope, teamId, includeFriendlies]);

  // This player's position spread over the current scope, for the compact
  // "Positions played" card (games where they were recorded at a position).
  // External games with recorded positions (053) count here too, as one game
  // each, so a season played partly for another team still shows the whole
  // position trail. Rows without positions add nothing, like an own match
  // whose positions were never filled in.
  const externalPositionGames = useMemo(
    () => (player ? adjustmentsInScope.filter(a => a.playerId === player.id && (a.positions?.length ?? 0) > 0) : []),
    [player, adjustmentsInScope],
  );
  const positionSummary = useMemo(() => {
    if (!player) return null;
    const external = externalPositionGames.map(a => ({ playerPositions: { [player.id]: a.positions ?? [] } }));
    return (
      computePositionDiversity([...Object.values(filteredGamesByClubSeason), ...external]).players.find(
        p => p.playerId === player.id,
      ) ?? null
    );
  }, [player, filteredGamesByClubSeason, externalPositionGames]);

  /**
   * The match evidence text: this player, this scope, all fact. Built from the
   * same stats and the same filtered games the view shows, so the page a coach
   * hands over cannot disagree with the screen it came from.
   */
  const evidenceText = useMemo(() => {
    if (!player || !playerStats) return '';
    // The same rule calculatePlayerStats applies, imported rather than copied,
    // so the "of the team's games" denominator is the stats table's own scope.
    const scopedIds = new Set(
      Object.entries(filteredGamesByClubSeason)
        .filter(([, g]) => isGameInPlayerScope(g, teamId, includeFriendlies))
        .map(([id]) => id),
    );
    const games = playerStats.gameByGameStats
      .filter((s) => !s.isExternal && filteredGamesByClubSeason[s.gameId])
      .map((s) => {
        const g = filteredGamesByClubSeason[s.gameId];
        return {
          gameId: s.gameId,
          gameDate: g.gameDate ?? '',
          opponentName: g.opponentName ?? '',
          homeOrAway: g.homeOrAway ?? 'home',
          homeScore: g.homeScore ?? 0,
          awayScore: g.awayScore ?? 0,
          positions: g.playerPositions?.[player.id] ?? [],
        };
      });
    const teamName = teamId && teamId !== 'legacy' ? teams.find((x) => x.id === teamId)?.name : undefined;
    const periodLabel = [
      teamName,
      selectedClubSeason !== 'all'
        ? `${t('playerStats.periodLabel', 'Period')} ${selectedClubSeason}`
        : t('playerStats.allPeriods', 'All Periods'),
    ].filter(Boolean).join(' · ');
    // Which leagues and tournaments this was, and what he did in each: the
    // question a head coach asks straight after "how many games".
    const competitions = [
      ...Object.values(playerStats.performanceBySeason),
      ...Object.values(playerStats.performanceByTournament),
    ]
      .filter((c) => c.gamesPlayed > 0)
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name))
      .map((c) => ({ name: c.name, games: c.gamesPlayed, goals: c.goals, assists: c.assists }));
    return buildPlayerEvidence(
      {
        playerName: player.name,
        periodLabel,
        games,
        // The same number the card above shows: one external entry can stand
        // for several games, so the row count is not the game count.
        gamesPlayed: playerStats.totalGames,
        captaincies: playerStats.totalCaptaincies,
        stats: playerStats.gameByGameStats,
        competitions,
        notes: playerNotes.filter((n) => scopedIds.has(n.gameId)),
        sections,
      },
      (key, fallback, options) => t(key as TranslationKey, fallback, options) as string,
    );
  }, [player, playerStats, filteredGamesByClubSeason, includeFriendlies, teamId, teams, selectedClubSeason, playerNotes, sections, t]);

  // Calculate unfiltered stats to detect if empty state is due to filtering
  const unfilteredPlayerStats: PlayerStatsData | null = useMemo(() => {
    if (!player) return null;
    return calculatePlayerStats(player, savedGames, seasons, tournaments, adjustments, teamId, includeFriendlies);
  }, [player, savedGames, seasons, tournaments, adjustments, teamId, includeFriendlies]);

  if (!player || !playerStats) {
    return (
        <div className="flex items-center justify-center h-full">
            <p className="text-slate-400">{t('playerStats.selectPlayer', 'Select a player to view their stats.')}</p>
        </div>
    );
  }

  const metricOptions = [
    { key: 'goalsAssists', label: t('playerStats.goalsAssists', 'Goals & Assists') },
    { key: 'goals', label: t('playerStats.goals', 'Goals') },
    { key: 'assists', label: t('playerStats.assists', 'Assists') },
    { key: 'points', label: t('playerStats.points', 'Points') },
    ...(assessmentTrends ? Object.keys(assessmentTrends).map(m => ({ key: m, label: t(`assessmentMetrics.${m}` as TranslationKey, m) })) : [])
  ];

  return (
    <div className="p-4 sm:p-6 bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-amber-400">{player.name}</h2>
          </div>
        </div>

        {/* Filter Status Indicator */}
        {selectedClubSeason !== 'all' && unfilteredPlayerStats && unfilteredPlayerStats.totalGames > playerStats.totalGames && (
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-blue-300">
                {t('playerStats.viewingFilteredStats', 'Viewing stats for selected club season only ({filtered} of {total} games)', { filtered: playerStats.totalGames, total: unfilteredPlayerStats.totalGames })}
              </p>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 rounded-lg p-4 mb-3 shadow-inner transition-all">
          {/* Primary Stats Row with Averages */}
          <div className="grid grid-cols-4 gap-3 sm:gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-amber-400">{playerStats.totalGames}</p>
              <p className="text-sm text-slate-300 font-medium">{t('playerStats.gamesPlayed', 'Games Played')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-amber-400">{playerStats.totalGoals}</p>
              <p className="text-sm text-slate-300 font-medium">{t('playerStats.goals', 'Goals')}</p>
              <p className="text-sm text-slate-400 mt-1">({playerStats.avgGoalsPerGame.toFixed(1)}/{t('playerStats.perGameShort', 'game')})</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-amber-400">{playerStats.totalAssists}</p>
              <p className="text-sm text-slate-300 font-medium">{t('playerStats.assists', 'Assists')}</p>
              <p className="text-sm text-slate-400 mt-1">({playerStats.avgAssistsPerGame.toFixed(1)}/{t('playerStats.perGameShort', 'game')})</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-amber-400">{playerStats.totalGoals + playerStats.totalAssists}</p>
              <p className="text-sm text-slate-300 font-medium">{t('playerStats.points', 'Points')}</p>
              <p className="text-sm text-slate-400 mt-1">({(playerStats.avgGoalsPerGame + playerStats.avgAssistsPerGame).toFixed(1)}/{t('playerStats.perGameShort', 'game')})</p>
            </div>
          </div>
          {/* Wearing the armband, only when it happened. A zero here would
              read as a mark against the player rather than as a fact. */}
          {playerStats.totalCaptaincies > 0 && (
            <p className="mt-3 text-sm text-slate-300 text-center" data-testid="player-captaincies">
              {t('playerStats.captainGames', 'Captain in {{count}} games', {
                count: playerStats.totalCaptaincies,
              })}
            </p>
          )}
          {/* The case file: what this player did, dated, for a coach who was
              not there. Fact only, so it lives next to the numbers, not the
              ratings. */}
          <button
            type="button"
            onClick={() => setShowEvidence(true)}
            data-testid="player-evidence"
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-slate-100"
          >
            {t('evidence.button', 'Share player summary')}
          </button>
        </div>
        <GameRecapModal
          isOpen={showEvidence}
          onClose={() => setShowEvidence(false)}
          recap={evidenceText}
          title={t('evidence.title', 'Player summary')}
          // The text says what it is; a paragraph above it only repeats itself.
          subtitle={null}
          sections={[
            { key: 'totals', label: t('evidence.sectionTotals', 'Totals'), checked: sections.totals },
            { key: 'competitions', label: t('evidence.competitions', 'Leagues and tournaments'), checked: sections.competitions },
            { key: 'notes', label: t('evidence.sectionNotes', 'Notes'), checked: sections.notes },
            { key: 'games', label: t('evidence.sectionGames', 'Every game'), checked: sections.games },
          ]}
          onToggleSection={(key) =>
            setSections((prev) => ({ ...prev, [key]: !prev[key as keyof EvidenceSections] }))
          }
        />

        {/* Positions played - this player's spread over the current scope */}
        {positionSummary && (
          <div className={`bg-gradient-to-br from-slate-600/50 to-slate-800/30 rounded-lg shadow-inner p-4 mb-3 ${positionSummary.totalGames / (playerStats.totalGames || 1) < 0.5 ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="text-sm font-semibold text-slate-200">
                {t('playerStats.positionsPlayed.title', 'Positions played')}
              </h3>
              {positionSummary.narrow && (
                <span className="shrink-0 text-xs font-medium text-amber-400">
                  {t('gameStatsModal.positionBalance.narrow', 'Narrow')}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400 mb-3">
              {t('gameStatsModal.positionBalance.gamesCovered', 'Positions recorded in {{recorded}}/{{scanned}} games', {
                recorded: positionSummary.totalGames,
                scanned: playerStats.totalGames,
              })}
            </p>
            {/* Positions played, back-to-front, in the app's muted-label + amber-count stat style. */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {POSITION_IDS.filter(id => (positionSummary.byPosition[id] ?? 0) > 0).map(id => (
                <span key={id} className="text-slate-300">
                  {t(`playingPositions.${id}.abbrev` as TranslationKey, id.toUpperCase())}{' '}
                  <span className="text-amber-400 font-semibold">{positionSummary.byPosition[id]}</span>
                </span>
              ))}
            </div>
            {positionSummary.narrow && (
              <p className="text-sm text-amber-300/80 mt-3">
                {t('playerStats.positionsPlayed.narrowHint', 'Played only one line this season - a chance to broaden.')}
              </p>
            )}
            {externalPositionGames.length > 0 && (
              <p className="text-xs text-slate-400 mt-2">
                <span className="inline-block bg-purple-600/50 text-purple-200 text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5">{t('playerStats.external', 'EXT')}</span>
                {t('playerStats.positionsPlayed.includesExternal', { count: externalPositionGames.length, defaultValue: 'Includes {{count}} external games with recorded positions.' })}
              </p>
            )}
          </div>
        )}

        <ExternalGamesSection
          player={player}
          seasons={seasons}
          tournaments={tournaments}
          teams={teams}
          selectedGameTypeFilter={selectedGameTypeFilter}
          countedIds={countedAdjustmentIds}
          onAdjustmentsChange={setAdjustments}
        />

        {/* Game by Game Stats - Title and Chart */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-2">{t('playerStats.gameLog', 'Game Log')}</h3>
          <div className="mb-2">
            <label htmlFor="metric-select" className="block text-sm font-medium text-slate-300 mb-1">{t('playerStats.metricSelect', 'Select Metric')}</label>
            <select
              id="metric-select"
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {metricOptions.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        <div className="mb-4">
          {selectedMetric === 'goalsAssists' ? (
            <SparklineChart
              data={playerStats.gameByGameStats}
              goalsLabel={t('playerStats.goals', 'Goals')}
              assistsLabel={t('playerStats.assists', 'Assists')}
            />
          ) : (
            <MetricAreaChart
              data={
                selectedMetric === 'goals' || selectedMetric === 'assists' || selectedMetric === 'points'
                  ? playerStats.gameByGameStats.map(g => ({ date: g.date, value: g[selectedMetric] }))
                  : (assessmentTrends?.[selectedMetric] || [])
              }
              label={metricOptions.find(o => o.key === selectedMetric)?.label || selectedMetric}
            />
          )}
        </div>
      </div>

      {assessmentsEnabled && hasAnyAssessment && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowRatings(v => !v)}
            className="text-left w-full bg-slate-800/60 p-3 rounded-lg flex justify-between items-center hover:bg-slate-800/80 transition-colors"
            aria-expanded={showRatings}
          >
            <span className="font-semibold text-slate-100">{t('playerStats.performanceRatings', 'Performance Ratings')}</span>
            <span className="text-sm text-slate-400">{showRatings ? '-' : '+'}</span>
          </button>
          {showRatings && (
            <div className="mt-2 space-y-4 text-sm">
              <div className="space-y-2 px-2">
                {/* Season scope (assessments only) - shown when data spans >1 club season */}
                {hasMultipleSeasons && (
                  <div className="flex gap-2">
                    {([
                      ['all', t('playerStats.seasonAll', 'All seasons')],
                      ['season', t('playerStats.seasonCurrent', 'Current season')],
                    ] as ['all' | 'season', string][]).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAssessmentSeason(value)}
                        aria-pressed={assessmentSeason === value}
                        className={`flex-1 whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                          assessmentSeason === value ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {/* Scope: which recent assessments to consider (full-width segmented) */}
                <div className="flex gap-2">
                  {([
                    ['all', t('playerStats.scopeAll', 'All games')],
                    ['last10', t('playerStats.scopeLast10', 'Last 10')],
                    ['last5', t('playerStats.scopeLast5', 'Last 5')],
                  ] as [AssessmentScope, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setScope(value)}
                      aria-pressed={scope === value}
                      className={`flex-1 whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                        scope === value ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Weighting toggles */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRecencyWeighted(v => !v)}
                    aria-pressed={recencyWeighted}
                    title={t('playerStats.recencyWeightedTooltip', 'Weight recent games more, to show current form rather than the lifetime average')}
                    className={`flex-1 whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      recencyWeighted ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('playerStats.recencyWeighted', 'Current form')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const val = !useDemandCorrection;
                      setUseDemandCorrection(val);
                      // Pass userId to avoid DataStore initialization conflicts (MATCHOPS-LOCAL-2N)
                      updateAppSettings({ useDemandCorrection: val }, userId).catch((error) => {
                        logger.warn('[PlayerStatsView] Failed to save demand correction preference (non-critical)', { val, error });
                      });
                    }}
                    aria-pressed={useDemandCorrection}
                    title={t('playerStats.useDemandCorrectionTooltip', 'When enabled, ratings from harder games count more')}
                    className={`flex-1 whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      useDemandCorrection ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('playerStats.useDemandCorrection', 'By difficulty')}
                  </button>
                </div>
              </div>
              {playerDevelopment ? (
              <>
              {showRadar && (
                <div className="px-2">
                  <PlayerDevelopmentRadar
                    axes={radarAxes}
                    max={ASSESSMENT_MAX}
                    currentLabel={t('playerStats.radarNow', 'Now')}
                    baselineLabel={t('playerStats.radarBaseline', 'Season start')}
                  />
                </div>
              )}
              {(playerDevelopment.focusAreas.length > 0 || playerDevelopment.strengths.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-2">
                  {playerDevelopment.strengths.length > 0 && (
                    <div className="bg-slate-900/70 border border-slate-700 rounded-lg shadow-inner p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-1.5 h-3.5 rounded-full bg-emerald-400" />
                        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">{t('playerStats.strengths', 'Strengths')}</p>
                      </div>
                      <ul className="space-y-1">
                        {playerDevelopment.strengths.map(m => (
                          <li key={m} className="flex items-center justify-between gap-2 text-sm text-slate-200">
                            <span>{t(`assessmentMetrics.${m}` as TranslationKey, m)}</span>
                            <span className={trendMeta(playerDevelopment.metrics[m].direction).className} title={trendMeta(playerDevelopment.metrics[m].direction).title}>{trendMeta(playerDevelopment.metrics[m].direction).arrow}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {playerDevelopment.focusAreas.length > 0 && (
                    <div className="bg-slate-900/70 border border-slate-700 rounded-lg shadow-inner p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-1.5 h-3.5 rounded-full bg-amber-400" />
                        <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">{t('playerStats.focusAreas', 'Focus areas')}</p>
                      </div>
                      <ul className="space-y-1">
                        {playerDevelopment.focusAreas.map(m => (
                          <li key={m} className="flex items-center justify-between gap-2 text-sm text-slate-200">
                            <span>{t(`assessmentMetrics.${m}` as TranslationKey, m)}</span>
                            <span className={trendMeta(playerDevelopment.metrics[m].direction).className} title={trendMeta(playerDevelopment.metrics[m].direction).title}>{trendMeta(playerDevelopment.metrics[m].direction).arrow}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {showRadar && isCardExportSupported() && (
                <div className="px-2">
                  <button
                    type="button"
                    onClick={handleExportReport}
                    className="w-full px-3 py-2 rounded-md text-sm font-medium transition-colors bg-slate-700 text-slate-100 hover:bg-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-400"
                  >
                    {t('playerStats.exportReport', 'Export development report')}
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {Object.entries(playerDevelopment.metrics)
                  .filter(([, d]) => d.level > 0)
                  .map(([metric, d]) => {
                    const trend = trendMeta(d.direction);
                    return (
                      <div key={metric} className="flex items-center space-x-2 px-2">
                        <span className="w-28 shrink-0 text-slate-100">{t(`assessmentMetrics.${metric}` as TranslationKey, metric)}</span>
                        <RatingBar value={d.level} max={ASSESSMENT_MAX} valueLabel={formatRatingBand(d.level)} />
                        <span className={`w-4 text-center ${trend.className}`} title={trend.title} aria-label={trend.title}>{trend.arrow}</span>
                      </div>
                    );
                  })}
                <div className="flex items-center space-x-2 px-2 mt-2">
                  <span className="w-28 shrink-0 text-slate-100">{t('playerAssessmentModal.overallLabel', 'Overall')}</span>
                  <RatingBar value={playerDevelopment.overall.level} valueLabel={formatRatingBand(playerDevelopment.overall.level)} />
                  <span className={`w-4 text-center ${trendMeta(playerDevelopment.overall.direction).className}`} title={trendMeta(playerDevelopment.overall.direction).title} aria-label={trendMeta(playerDevelopment.overall.direction).title}>{trendMeta(playerDevelopment.overall.direction).arrow}</span>
                </div>
                <div className="flex items-center space-x-2 px-2">
                  <span className="w-28 shrink-0 text-slate-100">{t('playerStats.avgRating', 'Avg Rating')}</span>
                  <RatingBar value={playerDevelopment.finalScore} max={ASSESSMENT_MAX} valueLabel={formatRatingBand(playerDevelopment.finalScore)} />
                  <span className="w-4" />
                </div>
                <div className="text-xs text-slate-400 text-right">
                  {playerDevelopment.count} {t('playerStats.ratedGames', 'rated games')}
                </div>
              </div>
              {assessmentTrends && (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(assessmentTrends).map(([metric, data]) => (
                    <div key={metric} className="bg-slate-800/40 p-2 rounded">
                      <p className="text-sm text-slate-300 mb-1">{t(`assessmentMetrics.${metric}` as TranslationKey, metric)}</p>
                      <MetricTrendChart data={data} />
                    </div>
                  ))}
                </div>
              )}
              {assessmentNotes.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">{t('playerStats.notes', 'Assessment Notes')}</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {assessmentNotes.map(n => (
                      <li key={n.date} className="text-xs text-slate-300">
                        {formatDisplayDate(n.date)} - {n.notes}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              </>
              ) : (
                <p className="px-2 text-sm text-slate-400">{t('playerStats.noAssessmentsForPeriod', 'No assessments for this period.')}</p>
              )}
            </div>
          )}
        </div>
      )}

        {playerNotes.length > 0 && (
          <div data-testid="player-notes" className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner mt-2">
            <h3 className="text-lg font-semibold text-slate-200 mb-2">{t('playerStats.notesTitle', 'Notes')}</h3>
            <ul className="space-y-2">
              {playerNotes.map((n) => (
                <li key={n.id} className="text-sm text-slate-200">
                  <span className="text-xs text-slate-400">
                    {n.gameDate ? formatDisplayDate(n.gameDate) : ''}{n.opponentName ? ` - ${n.opponentName}` : ''}
                    {' - '}
                    {n.period ? `P${n.period} ` : ''}
                    {`${String(Math.floor(n.time / 60)).padStart(2, '0')}:${String(Math.floor(n.time % 60)).padStart(2, '0')}`}
                  </span>
                  <p className="whitespace-pre-wrap break-words">{n.text}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {player && playerNotes.length > 0 && (
          <div className="mt-2">
            {/* Read-only, like the translation panel: it reads the record back
                and cannot become part of it. */}
            <PlayerNotesSummaryCard
              player={player}
              notes={playerNotes}
              roster={masterRoster ?? []}
              language={i18n.language}
            />
          </div>
        )}

        {/* Performance by Season/Tournament */}
        <div className="space-y-4 mt-2">
          {Object.keys(playerStats.performanceBySeason).length > 0 && (
            <div className="bg-slate-800/60 p-3 rounded-lg">
              <h4 className="text-md font-semibold text-slate-200 mb-2">{t('playerStats.seasonPerformance', 'League Performance')}</h4>
              <div className="space-y-2">
                {Object.entries(playerStats.performanceBySeason).map(([id, stats]) => (
                  <div key={id} className="p-2 bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 rounded-md transition-all">
                    <p className="font-semibold text-slate-100 mb-1">{stats.name}</p>
                    <div className="grid grid-cols-5 gap-2 text-center text-sm">
                      <div><p className="font-bold text-amber-400">{stats.gamesPlayed}</p><p className="text-sm text-slate-400">{t('playerStats.gamesPlayed_short', 'GP')}</p></div>
                      <div><p className="font-bold text-amber-400">{stats.goals}</p><p className="text-sm text-slate-400">{t('playerStats.goals', 'Goals')}</p></div>
                      <div><p className="font-bold text-amber-400">{stats.assists}</p><p className="text-sm text-slate-400">{t('playerStats.assists', 'Assists')}</p></div>
                      <div><p className="font-bold text-amber-400">{stats.points}</p><p className="text-sm text-slate-400">{t('playerStats.points', 'Points')}</p></div>
                      <div><p className="font-bold text-green-400">{stats.fairPlayCards || 0}</p><p className="text-sm text-slate-400"><span className="inline-block bg-green-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-sm">FP</span></p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.keys(playerStats.performanceByTournament).length > 0 && (
            <div className="bg-slate-800/60 p-3 rounded-lg">
              <h4 className="text-md font-semibold text-slate-200 mb-2">{t('playerStats.tournamentPerformance', 'Tournament Performance')}</h4>
              <div className="space-y-2">
                {Object.entries(playerStats.performanceByTournament).map(([id, stats]) => (
                  <div key={id} className="p-2 bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 rounded-md transition-all">
                    <p className="font-semibold text-slate-100 mb-1 flex items-center gap-2">
                      {stats.name}
                      {stats.isTournamentWinner && (
                        <span className="text-amber-400 flex items-center gap-1 text-sm">
                          🏆 {t('playerStats.fairPlayTrophy', 'Fair Play Trophy')}
                        </span>
                      )}
                    </p>
                    <div className="grid grid-cols-5 gap-2 text-center text-sm">
                      <div><p className="font-bold text-amber-400">{stats.gamesPlayed}</p><p className="text-sm text-slate-400">{t('playerStats.gamesPlayed_short', 'GP')}</p></div>
                      <div><p className="font-bold text-amber-400">{stats.goals}</p><p className="text-sm text-slate-400">{t('playerStats.goals', 'Goals')}</p></div>
                      <div><p className="font-bold text-amber-400">{stats.assists}</p><p className="text-sm text-slate-400">{t('playerStats.assists', 'Assists')}</p></div>
                      <div><p className="font-bold text-amber-400">{stats.points}</p><p className="text-sm text-slate-400">{t('playerStats.points', 'Points')}</p></div>
                      <div><p className="font-bold text-green-400">{stats.fairPlayCards || 0}</p><p className="text-sm text-slate-400"><span className="inline-block bg-green-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-sm">FP</span></p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Individual Game Log List */}
        <div className="flex-grow mt-4">
          <div className="space-y-2">
            {playerStats.gameByGameStats.length > 0 ? (
              playerStats.gameByGameStats.map(game => {
                // External games use a div instead of button (not clickable)
                const GameWrapper = game.isExternal ? 'div' : 'button';
                return (
                  <GameWrapper
                    key={game.gameId}
                    className={`relative w-full bg-gradient-to-br from-slate-600/50 to-slate-800/30 ${!game.isExternal ? 'hover:from-slate-600/60 hover:to-slate-800/40 cursor-pointer' : ''} border border-slate-700/50 p-4 rounded-md flex justify-between items-center text-left transition-all shadow-inner`}
                    onClick={game.isExternal ? undefined : () => onGameClick(game.gameId)}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 rounded-l-md ${getResultClass(game.result)}`}></span>
                    <div className="flex items-center pl-2">
                      <div>
                        <p className="font-semibold text-slate-100 drop-shadow-lg">
                          {game.isExternal && game.externalTeamName && (
                            <span className="text-slate-400">{game.externalTeamName} </span>
                          )}
                          {t('playerStats.vs', 'vs')} {game.opponentName}
                          {game.isExternal && (
                            <span className="ml-2 inline-block bg-purple-600/50 text-purple-200 text-[10px] font-bold px-1.5 py-0.5 rounded-sm" title={t('playerStats.externalGame', 'External Game')}>{t('playerStats.external', 'EXT')}</span>
                          )}
                          {game.receivedFairPlayCard && (
                            <span className="ml-2 inline-block bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm" title={t('playerStats.fairPlayCard', 'Fair Play Card')}>FP</span>
                          )}
                          {game.gameType === 'futsal' && (
                            <span className="ml-2 inline-block bg-orange-500/50 text-orange-200 text-[10px] font-bold px-1.5 py-0.5 rounded-sm" title={t('common.gameTypeFutsal', 'Futsal')}>{t('common.gameTypeFutsal', 'Futsal')}</span>
                          )}
                          {!game.isExternal && Boolean(savedGames[game.gameId]?.assessments?.[player.id]) && (
                            <span className="ml-2 inline-block bg-indigo-600/60 text-indigo-100 text-[10px] font-bold px-1.5 py-0.5 rounded-sm" title={t('playerStats.assessed', 'Assessed')}>{t('playerStats.assessed', 'Assessed')}</span>
                          )}
                        </p>
                        <p className="text-sm text-slate-400">{formatDisplayDate(game.date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <div className="text-center mx-2">
                        <p className={`font-bold text-xl ${game.goals > 0 ? 'text-green-400' : 'text-slate-300'}`}>{game.goals}</p>
                        <p className="text-sm text-slate-400">{t('playerStats.goals', 'Goals')}</p>
                      </div>
                      <div className="text-center mx-2">
                        <p className={`font-bold text-xl ${game.assists > 0 ? 'text-blue-400' : 'text-slate-300'}`}>{game.assists}</p>
                        <p className="text-sm text-slate-400">{t('playerStats.assists', 'Assists')}</p>
                      </div>
                    </div>
                  </GameWrapper>
                );
              })
            ) : (
              <div className="text-center py-6">
                {unfilteredPlayerStats && unfilteredPlayerStats.totalGames > 0 ? (
                  // Player has games, but they're filtered out by club season
                  <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
                    <p className="text-slate-300 mb-2">
                      {t('playerStats.noGamesForSeason', 'No games found for the selected club season.')}
                    </p>
                    <p className="text-sm text-slate-400">
                      {t('playerStats.changeSeasonFilter', 'This player has {count} game(s) in other seasons. Change the club season filter above to "All seasons" to view all games.', { count: unfilteredPlayerStats.totalGames })}
                    </p>
                  </div>
                ) : (
                  // Player genuinely has no games
                  <p className="text-slate-400">{t('playerStats.noGames', 'No game data available.')}</p>
                )}
              </div>
            )}
          </div>
        </div>
    </div>
  );
};

export default PlayerStatsView; 
