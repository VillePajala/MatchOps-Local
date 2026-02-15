'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import type { TranslationKey } from '@/i18n-types';
import { Player, Season, Tournament } from '@/types';
import { AppState } from '@/types';
import type { GameType, Gender } from '@/types/game';
import { calculatePlayerStats, PlayerStats as PlayerStatsData } from '@/utils/playerStats';
import { getAdjustmentsForPlayer, addPlayerAdjustment, updatePlayerAdjustment, deletePlayerAdjustment } from '@/utils/playerAdjustments';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import type { PlayerStatAdjustment } from '@/types';
import { calculatePlayerAssessmentAverages, getPlayerAssessmentTrends, getPlayerAssessmentNotes } from '@/utils/assessmentStats';
import { getAppSettings, updateAppSettings } from '@/utils/appSettings';
import { format } from 'date-fns';
import { fi, enUS } from 'date-fns/locale';
import SparklineChart from './SparklineChart';
import RatingBar from './RatingBar';
import MetricTrendChart from './MetricTrendChart';
import MetricAreaChart from './MetricAreaChart';
import logger from '@/utils/logger';
import { getClubSeasonForDate } from '@/utils/clubSeason';

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
}

const PlayerStatsView: React.FC<PlayerStatsViewProps> = ({ player, savedGames, onGameClick, seasons, tournaments, teamId, selectedClubSeason, clubSeasonStartDate, clubSeasonEndDate, selectedGameTypeFilter = 'all', selectedGenderFilter = 'all' }) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [showRatings, setShowRatings] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('goalsAssists');
  const [useDemandCorrection, setUseDemandCorrection] = useState(false);
  const [adjustments, setAdjustments] = useState<PlayerStatAdjustment[]>([]);
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [adjSeasonId, setAdjSeasonId] = useState('');
  const [adjTournamentId, setAdjTournamentId] = useState('');
  const [adjExternalTeam, setAdjExternalTeam] = useState('');
  const [adjOpponentName, setAdjOpponentName] = useState('');
  const [adjScoreFor, setAdjScoreFor] = useState<number | ''>('');
  const [adjScoreAgainst, setAdjScoreAgainst] = useState<number | ''>('');
  const [adjGameDate, setAdjGameDate] = useState('');
  const [adjHomeAway, setAdjHomeAway] = useState<'home' | 'away' | 'neutral'>('neutral');
  const [adjGames, setAdjGames] = useState(1);
  const [adjGoals, setAdjGoals] = useState(0);
  const [adjAssists, setAdjAssists] = useState(0);
  const [adjFairPlayCards, setAdjFairPlayCards] = useState(0);
  const [adjNote, setAdjNote] = useState('');
  const [adjIncludeInSeasonTournament, setAdjIncludeInSeasonTournament] = useState(false);
  const [editingAdjId, setEditingAdjId] = useState<string | null>(null);
  const [editGames, setEditGames] = useState<number>(0);
  const [editGoals, setEditGoals] = useState<number>(0);
  const [editAssists, setEditAssists] = useState<number>(0);
  const [editFairPlayCards, setEditFairPlayCards] = useState<number>(0);
  const [editNote, setEditNote] = useState('');
  const [editHomeAway, setEditHomeAway] = useState<'home' | 'away' | 'neutral'>('neutral');
  const [editExternalTeam, setEditExternalTeam] = useState('');
  const [editOpponentName, setEditOpponentName] = useState('');
  const [editSeasonId, setEditSeasonId] = useState('');
  const [editTournamentId, setEditTournamentId] = useState('');
  const [editGameDate, setEditGameDate] = useState('');
  const [editScoreFor, setEditScoreFor] = useState<number | ''>('');
  const [editScoreAgainst, setEditScoreAgainst] = useState<number | ''>('');
  const [editIncludeInSeasonTournament, setEditIncludeInSeasonTournament] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [showExternalGames, setShowExternalGames] = useState(false);

  React.useLayoutEffect(() => {
    // Pass userId to avoid DataStore initialization conflicts (MATCHOPS-LOCAL-2N)
    getAppSettings(user?.id).then(s => {
      setUseDemandCorrection(s.useDemandCorrection ?? false);
    });
    // Set default date to today
    if (!adjGameDate) {
      setAdjGameDate(new Date().toISOString().split('T')[0]);
    }
  }, [adjGameDate, user?.id]);

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

  useEffect(() => {
    if (!player) return;
    getAdjustmentsForPlayer(player.id).then(setAdjustments).catch(() => setAdjustments([]));
  }, [player]);

  // Close actions menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showActionsMenu && !(event.target as Element).closest('.actions-menu-container')) {
        setShowActionsMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showActionsMenu) {
        setShowActionsMenu(null);
      }
    };
    
    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showActionsMenu]);

  const assessmentAverages = useMemo(() => {
    if (!player) return null;
    return calculatePlayerAssessmentAverages(player.id, savedGames, useDemandCorrection);
  }, [player, savedGames, useDemandCorrection]);

  const assessmentTrends = useMemo(() => {
    if (!player) return null;
    return getPlayerAssessmentTrends(player.id, savedGames);
  }, [player, savedGames]);

  const assessmentNotes = useMemo(() => {
    if (!player) return [];
    return getPlayerAssessmentNotes(player.id, savedGames);
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

  const playerStats: PlayerStatsData | null = useMemo(() => {
    if (!player) return null;
    return calculatePlayerStats(player, filteredGamesByClubSeason, seasons, tournaments, adjustments, teamId);
  }, [player, filteredGamesByClubSeason, seasons, tournaments, adjustments, teamId]);

  // Calculate unfiltered stats to detect if empty state is due to filtering
  const unfilteredPlayerStats: PlayerStatsData | null = useMemo(() => {
    if (!player) return null;
    return calculatePlayerStats(player, savedGames, seasons, tournaments, adjustments, teamId);
  }, [player, savedGames, seasons, tournaments, adjustments, teamId]);

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

  const getResultClass = (result: 'W' | 'L' | 'D' | 'N/A') => {
    switch (result) {
      case 'W': return 'bg-green-500';
      case 'L': return 'bg-red-500';
      case 'D': return 'bg-gray-500';
      default: return 'bg-gray-700';
    }
  };

  const hasAdjustments = adjustments.length > 0;
  // Dynamic labels for score inputs so user knows whose score goes where
  const teamNameForScore = (adjExternalTeam || t('playerStats.team', 'Team')) as string;
  const opponentNameForScore = (adjOpponentName || t('playerStats.opponent', 'Opponent')) as string;
  // Left = Home score; Right = Away score
  const leftScoreLabel = adjHomeAway === 'away' ? opponentNameForScore : teamNameForScore;
  const rightScoreLabel = adjHomeAway === 'away' ? teamNameForScore : opponentNameForScore;
  const getLeftScore = () => (adjHomeAway === 'away' ? adjScoreAgainst : adjScoreFor);
  const setLeftScore = (val: number | '') => (adjHomeAway === 'away' ? setAdjScoreAgainst(val) : setAdjScoreFor(val));
  const getRightScore = () => (adjHomeAway === 'away' ? adjScoreFor : adjScoreAgainst);
  const setRightScore = (val: number | '') => (adjHomeAway === 'away' ? setAdjScoreFor(val) : setAdjScoreAgainst(val));

  return (
    <div className="p-4 sm:p-6 bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-yellow-400">{player.name}</h2>
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
              <p className="text-3xl font-bold text-yellow-400">{playerStats.totalGames}</p>
              <p className="text-sm text-slate-300 font-medium">{t('playerStats.gamesPlayed', 'Games Played')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-yellow-400">{playerStats.totalGoals}</p>
              <p className="text-sm text-slate-300 font-medium">{t('playerStats.goals', 'Goals')}</p>
              <p className="text-xs text-slate-400 mt-1">({playerStats.avgGoalsPerGame.toFixed(1)}/{t('playerStats.perGameShort', 'game')})</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-yellow-400">{playerStats.totalAssists}</p>
              <p className="text-sm text-slate-300 font-medium">{t('playerStats.assists', 'Assists')}</p>
              <p className="text-xs text-slate-400 mt-1">({playerStats.avgAssistsPerGame.toFixed(1)}/{t('playerStats.perGameShort', 'game')})</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-yellow-400">{playerStats.totalGoals + playerStats.totalAssists}</p>
              <p className="text-sm text-slate-300 font-medium">{t('playerStats.points', 'Points')}</p>
              <p className="text-xs text-slate-400 mt-1">({(playerStats.avgGoalsPerGame + playerStats.avgAssistsPerGame).toFixed(1)}/{t('playerStats.perGameShort', 'game')})</p>
            </div>
          </div>
        </div>

        {/* External Games Section - Collapsible */}
        <div className="mt-6 mb-4">
          <button
            type="button"
            onClick={() => setShowExternalGames(v => !v)}
            className="text-left w-full bg-slate-800/60 p-3 rounded-lg flex justify-between items-center hover:bg-slate-800/80 transition-colors"
            aria-expanded={showExternalGames}
          >
            <span className="font-semibold text-slate-100">{t('playerStats.externalGames', 'External Games')}</span>
            <span className="text-sm text-slate-400">{showExternalGames ? '-' : '+'}</span>
          </button>
          {showExternalGames && (
            <div className="mt-2">
              <button
                type="button"
                className="text-sm px-3 py-1.5 bg-slate-700 text-slate-200 rounded border border-slate-600 hover:bg-slate-600"
                onClick={() => { setShowAdjForm(v => !v); setEditingAdjId(null); }}
              >
                {t('playerStats.addExternalStats', 'Add external stats')}
              </button>
          {showAdjForm && (
            <form
              className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-800/60 p-4 rounded-lg border border-slate-600"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!player) return;
                
                // Comprehensive Validation
                if (!adjSeasonId && seasons.length === 0) {
                  showToast(t('playerStats.seasonRequired', 'Please create a season first.'), 'error');
                  return;
                }
                if (!adjExternalTeam.trim()) {
                  showToast(t('playerStats.teamRequired', 'Team name is required.'), 'error');
                  return;
                }
                if (!adjOpponentName.trim()) {
                  showToast(t('playerStats.opponentRequired', 'Opponent name is required.'), 'error');
                  return;
                }
                if (adjGames < 0 || adjGoals < 0 || adjAssists < 0) {
                  showToast(t('playerStats.negativeStatsError', 'Stats cannot be negative.'), 'error');
                  return;
                }
                if (adjGames === 0 && adjGoals === 0 && adjAssists === 0) {
                  showToast(t('playerStats.emptyStatsError', 'Please enter at least one statistic (games, goals, or assists).'), 'error');
                  return;
                }
                if (adjGames > 0 && adjGoals > adjGames * 20) {
                  showToast(t('playerStats.unrealisticGoalsError', 'Goals per game seems unrealistic. Please check your input.'), 'error');
                  return;
                }
                if (adjGames > 0 && adjAssists > adjGames * 20) {
                  showToast(t('playerStats.unrealisticAssistsError', 'Assists per game seems unrealistic. Please check your input.'), 'error');
                  return;
                }
                
                const created = await addPlayerAdjustment({
                  playerId: player.id,
                  seasonId: adjSeasonId || undefined,
                  tournamentId: adjTournamentId || undefined,
                  externalTeamName: adjExternalTeam.trim(),
                  opponentName: adjOpponentName.trim(),
                  scoreFor: typeof adjScoreFor === 'number' ? adjScoreFor : undefined,
                  scoreAgainst: typeof adjScoreAgainst === 'number' ? adjScoreAgainst : undefined,
                  gameDate: adjGameDate || undefined,
                  homeOrAway: adjHomeAway,
                  gamesPlayedDelta: Math.max(0, Number(adjGames) || 0),
                  goalsDelta: Math.max(0, Number(adjGoals) || 0),
                  assistsDelta: Math.max(0, Number(adjAssists) || 0),
                  fairPlayCardsDelta: Math.max(0, Number(adjFairPlayCards) || 0),
                  note: adjNote.trim() || undefined,
                  includeInSeasonTournament: adjIncludeInSeasonTournament,
                });
                setAdjustments(prev => [...prev, created]);
                setShowAdjForm(false);
                // Reset form
                setAdjGames(1); setAdjGoals(0); setAdjAssists(0); setAdjFairPlayCards(0); setAdjNote('');
                setAdjTournamentId(''); setAdjExternalTeam(''); setAdjOpponentName(''); setAdjScoreFor(''); setAdjScoreAgainst('');
                setAdjGameDate(new Date().toISOString().split('T')[0]);
                setAdjHomeAway('neutral');
                setAdjIncludeInSeasonTournament(false);
              }}
            >
              {/* Season / Tournament tabs — mutually exclusive, matching GameSettingsModal */}
              <div className="lg:col-span-3">
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('gameSettingsModal.seasonOrTournament', 'Season / Tournament')}</label>
                <div className="flex gap-1 mb-2">
                  <button type="button" onClick={() => { setAdjSeasonId(''); setAdjTournamentId(''); }} className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${!adjSeasonId && !adjTournamentId ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    {t('gameSettingsModal.eiMitaan', 'None')}
                  </button>
                  <button type="button" onClick={() => { setAdjTournamentId(''); if (!adjSeasonId && seasons.length > 0) setAdjSeasonId(seasons[0].id); setAdjIncludeInSeasonTournament(true); }} className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${adjSeasonId ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    {t('gameSettingsModal.kausi', 'Season')}
                  </button>
                  <button type="button" onClick={() => { setAdjSeasonId(''); if (!adjTournamentId && tournaments.length > 0) setAdjTournamentId(tournaments[0].id); setAdjIncludeInSeasonTournament(true); }} className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${adjTournamentId ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    {t('gameSettingsModal.turnaus', 'Tournament')}
                  </button>
                </div>
                {adjSeasonId !== '' && (
                  <select
                    value={adjSeasonId}
                    onChange={(e) => { setAdjSeasonId(e.target.value); }}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    {seasons.map(s => (
                      <option key={s.id} value={s.id}>{getSeasonDisplayName(s)}</option>
                    ))}
                  </select>
                )}
                {adjTournamentId !== '' && (
                  <select
                    value={adjTournamentId}
                    onChange={(e) => {
                      const tournamentId = e.target.value;
                      setAdjTournamentId(tournamentId);
                      // Prefill tournament data when selected
                      if (tournamentId) {
                        const tournament = tournaments.find(t => t.id === tournamentId);
                        if (tournament) {
                          const tournamentDate = tournament.startDate || (tournament.gameDates && tournament.gameDates[0]);
                          if (tournamentDate) {
                            setAdjGameDate(tournamentDate);
                          }
                        }
                      }
                    }}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    {tournaments.map(t => (
                      <option key={t.id} value={t.id}>{getTournamentDisplayName(t)}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.homeAway', 'Home/Away')}</label>
                <select value={adjHomeAway} onChange={e => setAdjHomeAway(e.target.value as 'home' | 'away' | 'neutral')} className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                  <option value="home">{t('playerStats.home', 'Home')}</option>
                  <option value="away">{t('playerStats.away', 'Away')}</option>
                  <option value="neutral">{t('playerStats.neutral', 'Neutral')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.team', 'Team')} <span className="text-red-400">*</span></label>
                <input type="text" value={adjExternalTeam} onChange={e => setAdjExternalTeam(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder={t('playerStats.externalTeam', 'External team') as string} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.opponent', 'Opponent')} <span className="text-red-400">*</span></label>
                <input type="text" value={adjOpponentName} onChange={e => setAdjOpponentName(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder={t('playerStats.opponentName', 'Opponent name') as string} required />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t('playerStats.score', 'Score')}</label>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>{leftScoreLabel}</span>
                  <span>{rightScoreLabel}</span>
                </div>
                <div className="flex items-center gap-2" aria-label={`${leftScoreLabel} - ${rightScoreLabel}`}>
                  <input aria-label={`${leftScoreLabel} ${t('playerStats.goals', 'Goals')}`} type="number" inputMode="numeric" pattern="[0-9]*" value={getLeftScore()} onChange={e => setLeftScore(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-16 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-1 text-sm" placeholder="0" min="0" />
                  <span className="mx-1 text-lg font-bold">-</span>
                  <input aria-label={`${rightScoreLabel} ${t('playerStats.goals', 'Goals')}`} type="number" inputMode="numeric" pattern="[0-9]*" value={getRightScore()} onChange={e => setRightScore(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-16 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-1 text-sm" placeholder="0" min="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.gameDate', 'Game date')}</label>
                <input type="date" value={adjGameDate} onChange={e => setAdjGameDate(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.gamesPlayed', 'Games')}</label>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={t('playerStats.decreaseGames', 'Decrease games')} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setAdjGames(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                  <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(adjGames)} onChange={e => setAdjGames(Math.max(0, parseInt(e.target.value || '0', 10)))} className="flex-1 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" min="0" />
                  <button type="button" aria-label={t('playerStats.increaseGames', 'Increase games')} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setAdjGames(v => (Number(v) || 0) + 1)}>+</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.goals', 'Goals')}</label>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={t('playerStats.decreaseGoals', 'Decrease goals')} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setAdjGoals(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                  <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(adjGoals)} onChange={e => setAdjGoals(Math.max(0, parseInt(e.target.value || '0', 10)))} className="flex-1 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" min="0" />
                  <button type="button" aria-label={t('playerStats.increaseGoals', 'Increase goals')} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setAdjGoals(v => (Number(v) || 0) + 1)}>+</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.assists', 'Assists')}</label>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={t('playerStats.decreaseAssists', 'Decrease assists')} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setAdjAssists(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                  <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(adjAssists)} onChange={e => setAdjAssists(Math.max(0, parseInt(e.target.value || '0', 10)))} className="flex-1 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" min="0" />
                  <button type="button" aria-label={t('playerStats.increaseAssists', 'Increase assists')} className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setAdjAssists(v => (Number(v) || 0) + 1)}>+</button>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adjFairPlayCards > 0}
                    onChange={(e) => setAdjFairPlayCards(e.target.checked ? 1 : 0)}
                    className="form-checkbox h-4 w-4 text-green-600 bg-slate-600 border-slate-500 rounded"
                  />
                  <span className="text-xs font-medium text-slate-400">{t('playerStats.receivedFairPlayCard', 'Received Fair Play Card')}</span>
                  <span className="inline-block bg-green-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-sm">FP</span>
                </label>
              </div>
              <div className="lg:col-span-3">
                <label className="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    checked={adjIncludeInSeasonTournament}
                    onChange={(e) => setAdjIncludeInSeasonTournament(e.target.checked)}
                    className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-600 border-slate-500 rounded"
                  />
                  <span className="text-xs text-slate-400">
                    {t('playerStats.includeInSeasonTournament', 'Include in season/tournament statistics')}
                  </span>
                </label>
                <p className="text-xs text-slate-500 mt-1 ml-6">
                  {t('playerStats.includeInSeasonTournamentHelp', 'Check this if the external game was played for the same team')}
                </p>
              </div>
              <div className="lg:col-span-3">
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.note', 'Note')}</label>
                <input type="text" value={adjNote} onChange={e => setAdjNote(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder={t('playerStats.noteOptional', 'Optional note about this game') as string} />
              </div>
              <div className="lg:col-span-3 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAdjForm(false)} className="px-4 py-2 bg-slate-700 rounded border border-slate-600 hover:bg-slate-600 text-sm font-medium text-white">{t('common.cancel', 'Cancel')}</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-500 text-sm font-medium text-white">{t('common.save', 'Save')}</button>
              </div>
            </form>
          )}

        {/* External stats list - inside collapsible section */}
        {hasAdjustments && (
          <div className="mb-4 text-xs text-slate-400">
            {t('playerStats.adjustmentsInfo', 'External stats are transparently added to totals.')}
            <div className="mt-1 space-y-3">
              {adjustments
                .sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime())
                .map(a => {
                  const seasonObj = seasons.find(s => s.id === a.seasonId);
                  const seasonName = seasonObj ? getSeasonDisplayName(seasonObj) : undefined;
                  const tournamentObj = tournaments.find(t => t.id === a.tournamentId);
                  const tournamentName = tournamentObj ? getTournamentDisplayName(tournamentObj) : undefined;
                  // Team names should always exist due to validation, but fallback just in case
                  const extName = a.externalTeamName || 'Unknown Team';
                  const oppName = a.opponentName || 'Unknown Opponent';
                  const dateText = a.gameDate ? formatDisplayDate(a.gameDate) : formatDisplayDate(a.appliedAt);

                  // Determine match result display based on home/away
                  const getScoreDisplay = () => {
                    if (typeof a.scoreFor !== 'number' || typeof a.scoreAgainst !== 'number') {
                      return null;
                    }

                    if (a.homeOrAway === 'home') {
                      return `${extName} ${a.scoreFor} - ${a.scoreAgainst} ${oppName}`;
                    } else if (a.homeOrAway === 'away') {
                      return `${oppName} ${a.scoreAgainst} - ${a.scoreFor} ${extName}`;
                    } else {
                      return `${extName} ${a.scoreFor} - ${a.scoreAgainst} ${oppName}`;
                    }
                  };

                  const scoreDisplay = getScoreDisplay();

                  // If editing this adjustment, show the edit form inline
                  if (editingAdjId === a.id) {
                    return (
                      <form
                        key={a.id}
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-800/60 p-4 rounded-lg border border-indigo-500"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!player) return;

                          // Comprehensive Validation
                          if (!editExternalTeam.trim() || !editOpponentName.trim()) {
                            showToast(t('playerStats.requiredFields', 'Team and opponent names are required.'), 'error');
                            return;
                          }
                          if (editGames < 0 || editGoals < 0 || editAssists < 0) {
                            showToast(t('playerStats.negativeStatsError', 'Stats cannot be negative.'), 'error');
                            return;
                          }
                          if (editGames === 0 && editGoals === 0 && editAssists === 0) {
                            showToast(t('playerStats.emptyStatsError', 'Please enter at least one statistic (games, goals, or assists).'), 'error');
                            return;
                          }
                          if (editGames > 0 && editGoals > editGames * 20) {
                            showToast(t('playerStats.unrealisticGoalsError', 'Goals per game seems unrealistic. Please check your input.'), 'error');
                            return;
                          }
                          if (editGames > 0 && editAssists > editGames * 20) {
                            showToast(t('playerStats.unrealisticAssistsError', 'Assists per game seems unrealistic. Please check your input.'), 'error');
                            return;
                          }

                          const updated = await updatePlayerAdjustment(player.id, editingAdjId, {
                            gamesPlayedDelta: Math.max(0, Number(editGames) || 0),
                            goalsDelta: Math.max(0, Number(editGoals) || 0),
                            assistsDelta: Math.max(0, Number(editAssists) || 0),
                            fairPlayCardsDelta: Math.max(0, Number(editFairPlayCards) || 0),
                            note: editNote.trim() || undefined,
                            homeOrAway: editHomeAway,
                            externalTeamName: editExternalTeam.trim(),
                            opponentName: editOpponentName.trim(),
                            seasonId: editSeasonId || undefined,
                            tournamentId: editTournamentId || undefined,
                            gameDate: editGameDate || undefined,
                            scoreFor: typeof editScoreFor === 'number' ? editScoreFor : undefined,
                            scoreAgainst: typeof editScoreAgainst === 'number' ? editScoreAgainst : undefined,
                            includeInSeasonTournament: editIncludeInSeasonTournament,
                          });
                          if (updated) {
                            setAdjustments(prev => prev.map(x => x.id === updated.id ? updated : x));
                            setEditingAdjId(null);
                          }
                        }}
                      >
                        {/* Season / Tournament tabs — mutually exclusive, matching GameSettingsModal */}
                        <div className="lg:col-span-3">
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t('gameSettingsModal.seasonOrTournament', 'Season / Tournament')}</label>
                          <div className="flex gap-1 mb-2">
                            <button type="button" onClick={() => { setEditSeasonId(''); setEditTournamentId(''); }} className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${!editSeasonId && !editTournamentId ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                              {t('gameSettingsModal.eiMitaan', 'None')}
                            </button>
                            <button type="button" onClick={() => { setEditTournamentId(''); if (!editSeasonId && seasons.length > 0) setEditSeasonId(seasons[0].id); setEditIncludeInSeasonTournament(true); }} className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${editSeasonId ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                              {t('gameSettingsModal.kausi', 'Season')}
                            </button>
                            <button type="button" onClick={() => { setEditSeasonId(''); if (!editTournamentId && tournaments.length > 0) setEditTournamentId(tournaments[0].id); setEditIncludeInSeasonTournament(true); }} className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${editTournamentId ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                              {t('gameSettingsModal.turnaus', 'Tournament')}
                            </button>
                          </div>
                          {editSeasonId !== '' && (
                            <select
                              value={editSeasonId}
                              onChange={(e) => { setEditSeasonId(e.target.value); }}
                              className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                              {seasons.map(s => (
                                <option key={s.id} value={s.id}>{getSeasonDisplayName(s)}</option>
                              ))}
                            </select>
                          )}
                          {editTournamentId !== '' && (
                            <select
                              value={editTournamentId}
                              onChange={(e) => { setEditTournamentId(e.target.value); }}
                              className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                              {tournaments.map(t => (
                                <option key={t.id} value={t.id}>{getTournamentDisplayName(t)}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.homeAway', 'Home/Away')}</label>
                          <select value={editHomeAway} onChange={e => setEditHomeAway(e.target.value as 'home' | 'away' | 'neutral')} className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                            <option value="home">{t('playerStats.home', 'Home')}</option>
                            <option value="away">{t('playerStats.away', 'Away')}</option>
                            <option value="neutral">{t('playerStats.neutral', 'Neutral')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.team', 'Team')} <span className="text-red-400">*</span></label>
                          <input type="text" value={editExternalTeam} onChange={e => setEditExternalTeam(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" required />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.opponent', 'Opponent')} <span className="text-red-400">*</span></label>
                          <input type="text" value={editOpponentName} onChange={e => setEditOpponentName(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" required />
                        </div>
                        <div className="lg:col-span-2">
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.score', 'Score')}</label>
                          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                            <span>{editHomeAway === 'away' ? (editOpponentName || t('playerStats.opponent', 'Opponent')) : (editExternalTeam || t('playerStats.team', 'Team'))}</span>
                            <span>{editHomeAway === 'away' ? (editExternalTeam || t('playerStats.team', 'Team')) : (editOpponentName || t('playerStats.opponent', 'Opponent'))}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input type="number" inputMode="numeric" pattern="[0-9]*" value={editHomeAway === 'away' ? editScoreAgainst : editScoreFor} onChange={e => {
                              const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0);
                              void (editHomeAway === 'away' ? setEditScoreAgainst(val) : setEditScoreFor(val));
                            }} className="w-16 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-1 text-sm" placeholder="0" min="0" />
                            <span className="mx-1 text-lg font-bold">-</span>
                            <input type="number" inputMode="numeric" pattern="[0-9]*" value={editHomeAway === 'away' ? editScoreFor : editScoreAgainst} onChange={e => {
                              const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0);
                              void (editHomeAway === 'away' ? setEditScoreFor(val) : setEditScoreAgainst(val));
                            }} className="w-16 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-1 text-sm" placeholder="0" min="0" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.gameDate', 'Game date')}</label>
                          <input type="date" value={editGameDate} onChange={e => setEditGameDate(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.gamesPlayed', 'Games')}</label>
                          <div className="flex items-center gap-2">
                            <button type="button" className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setEditGames(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                            <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(editGames)} onChange={e => setEditGames(Math.max(0, parseInt(e.target.value || '0', 10)))} className="flex-1 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" min="0" />
                            <button type="button" className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setEditGames(v => (Number(v) || 0) + 1)}>+</button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.goals', 'Goals')}</label>
                          <div className="flex items-center gap-2">
                            <button type="button" className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setEditGoals(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                            <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(editGoals)} onChange={e => setEditGoals(Math.max(0, parseInt(e.target.value || '0', 10)))} className="flex-1 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" min="0" />
                            <button type="button" className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setEditGoals(v => (Number(v) || 0) + 1)}>+</button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.assists', 'Assists')}</label>
                          <div className="flex items-center gap-2">
                            <button type="button" className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setEditAssists(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                            <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(editAssists)} onChange={e => setEditAssists(Math.max(0, parseInt(e.target.value || '0', 10)))} className="flex-1 text-center bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" min="0" />
                            <button type="button" className="px-3 py-2 bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 text-white" onClick={() => setEditAssists(v => (Number(v) || 0) + 1)}>+</button>
                          </div>
                        </div>
                        <div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editFairPlayCards > 0}
                              onChange={(e) => setEditFairPlayCards(e.target.checked ? 1 : 0)}
                              className="form-checkbox h-4 w-4 text-green-600 bg-slate-600 border-slate-500 rounded"
                            />
                            <span className="text-xs font-medium text-slate-400">{t('playerStats.receivedFairPlayCard', 'Received Fair Play Card')}</span>
                            <span className="inline-block bg-green-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-sm">FP</span>
                          </label>
                        </div>
                        <div className="lg:col-span-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editIncludeInSeasonTournament}
                              onChange={(e) => setEditIncludeInSeasonTournament(e.target.checked)}
                              className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-600 border-slate-500 rounded"
                            />
                            <span className="text-xs text-slate-400">
                              {t('playerStats.includeInSeasonTournament', 'Include in season/tournament statistics')}
                            </span>
                          </label>
                          <p className="text-xs text-slate-500 mt-1 ml-6">
                            {t('playerStats.includeInSeasonTournamentHelp', 'Check this if the external game was played for the same team')}
                          </p>
                        </div>
                        <div className="lg:col-span-3">
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t('playerStats.note', 'Note')}</label>
                          <input type="text" value={editNote} onChange={e => setEditNote(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder={t('playerStats.noteOptional', 'Optional note about this game') as string} />
                        </div>
                        <div className="lg:col-span-3 flex justify-end gap-3 pt-2">
                          <button type="button" onClick={() => setEditingAdjId(null)} className="px-4 py-2 bg-slate-700 rounded border border-slate-600 hover:bg-slate-600 text-sm font-medium text-white">{t('common.cancel', 'Cancel')}</button>
                          <button type="submit" className="px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-500 text-sm font-medium text-white">{t('common.save', 'Save')}</button>
                        </div>
                      </form>
                    );
                  }

                  // Determine result for the colored strip
                  const getAdjustmentResult = (): 'W' | 'L' | 'D' | 'N/A' => {
                    if (typeof a.scoreFor !== 'number' || typeof a.scoreAgainst !== 'number') return 'N/A';
                    if (a.scoreFor > a.scoreAgainst) return 'W';
                    if (a.scoreFor < a.scoreAgainst) return 'L';
                    return 'D';
                  };
                  const adjResult = getAdjustmentResult();

                  return (
                    <div key={a.id} className="relative bg-gradient-to-br from-slate-600/50 to-slate-800/30 border border-slate-700/50 p-4 rounded-md transition-all shadow-inner">
                      {/* Result color strip */}
                      <span className={`absolute inset-y-0 left-0 w-1 rounded-l-md ${getResultClass(adjResult)}`}></span>

                      {/* Card layout with two rows */}
                      <div className="flex flex-col gap-2">
                        {/* Top row: Match info and stats */}
                        <div className="flex justify-between items-start">
                          {/* Left side: Match info */}
                          <div className="flex-1 pl-2">
                            <p className="font-semibold text-slate-100 drop-shadow-lg">
                              {scoreDisplay ? scoreDisplay : <>{extName} {t('playerStats.vs', 'vs')} {oppName}</>}
                            </p>
                            {/* Note if present */}
                            {a.note && (
                              <p className="text-xs text-slate-300 italic mt-1">&ldquo;{a.note}&rdquo;</p>
                            )}
                          </div>

                          {/* Right side: Stats and actions */}
                          <div className="flex items-center gap-2">
                            {/* Stats */}
                            <div className="flex items-center">
                              <div className="text-center mx-2">
                                <p className={`font-bold text-xl ${a.goalsDelta > 0 ? 'text-green-400' : 'text-slate-300'}`}>{a.goalsDelta}</p>
                                <p className="text-xs text-slate-400">{t('playerStats.goals', 'Goals')}</p>
                              </div>
                              <div className="text-center mx-2">
                                <p className={`font-bold text-xl ${a.assistsDelta > 0 ? 'text-blue-400' : 'text-slate-300'}`}>{a.assistsDelta}</p>
                                <p className="text-xs text-slate-400">{t('playerStats.assists', 'Assists')}</p>
                              </div>
                            </div>

                            {/* Actions menu */}
                            <div className="shrink-0 relative actions-menu-container">
                              <button
                                type="button"
                                className="p-1 hover:bg-slate-600 rounded transition-colors"
                                onClick={() => setShowActionsMenu(showActionsMenu === a.id ? null : a.id)}
                                aria-label={t('common.actions', 'Actions')}
                              >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-slate-400 hover:text-slate-200">
                                  <circle cx="8" cy="2.5" r="1.5"/>
                                  <circle cx="8" cy="8" r="1.5"/>
                                  <circle cx="8" cy="13.5" r="1.5"/>
                                </svg>
                              </button>
                              {showActionsMenu === a.id && (
                                <div className="absolute right-0 top-8 bg-slate-700 border border-slate-600 rounded-lg shadow-xl z-50 min-w-[120px]">
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition-colors text-slate-200 first:rounded-t-lg"
                                    onClick={() => {
                                      setShowAdjForm(false); // Close add form when editing
                                      setEditingAdjId(a.id);
                                      setEditGames(a.gamesPlayedDelta);
                                      setEditGoals(a.goalsDelta);
                                      setEditAssists(a.assistsDelta);
                                      setEditFairPlayCards(a.fairPlayCardsDelta || 0);
                                      setEditNote(a.note || '');
                                      setEditHomeAway(a.homeOrAway || 'neutral');
                                      setEditExternalTeam(a.externalTeamName || '');
                                      setEditOpponentName(a.opponentName || '');
                                      setEditSeasonId(a.seasonId || '');
                                      setEditTournamentId(a.tournamentId || '');
                                      setEditGameDate(a.gameDate || '');
                                      setEditScoreFor(typeof a.scoreFor === 'number' ? a.scoreFor : '');
                                      setEditScoreAgainst(typeof a.scoreAgainst === 'number' ? a.scoreAgainst : '');
                                      setEditIncludeInSeasonTournament(a.includeInSeasonTournament || false);
                                      setShowActionsMenu(null);
                                    }}
                                  >
                                    {t('common.edit', 'Edit')}
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition-colors text-red-400 hover:text-red-300 last:rounded-b-lg"
                                    onClick={() => {
                                      setShowDeleteConfirm(a.id);
                                      setShowActionsMenu(null);
                                    }}
                                  >
                                    {t('common.delete', 'Delete')}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Bottom row: Date left, category labels right */}
                        <div className="flex items-end justify-between gap-4 pl-2 text-xs">
                          {/* Left: Date */}
                          <p className="text-slate-400">{dateText}</p>

                          {/* Right: Category labels */}
                          <div className="flex flex-wrap-reverse justify-end content-end gap-1.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-600/40 text-purple-200" title={t('playerStats.externalGame', 'External Game')}>
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                              {t('playerStats.external', 'EXT')}
                            </span>
                            {seasonName && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200" title={seasonName}>
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                {seasonName}
                              </span>
                            )}
                            {tournamentName && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200" title={tournamentName}>
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                {tournamentName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 p-6 rounded-lg shadow-xl border border-slate-600 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">{t('common.confirmDelete', 'Confirm Delete')}</h3>
              <p className="text-slate-300 mb-6">
                {t('playerStats.deleteConfirmMessage', 'Are you sure you want to delete this external game entry? This action cannot be undone.')}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 bg-slate-700 rounded border border-slate-600 hover:bg-slate-600 text-sm font-medium transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!player || !showDeleteConfirm) return;
                    const success = await deletePlayerAdjustment(player.id, showDeleteConfirm);
                    if (success) {
                      setAdjustments(prev => prev.filter(a => a.id !== showDeleteConfirm));
                      setShowDeleteConfirm(null);
                    } else {
                      showToast(t('playerStats.deleteError', 'Failed to delete the external game entry.'), 'error');
                    }
                  }}
                  className="px-4 py-2 bg-red-600 rounded hover:bg-red-500 text-sm font-medium transition-colors text-white"
                >
                  {t('common.delete', 'Delete')}
                </button>
              </div>
            </div>
          </div>
        )}

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

      {assessmentAverages && (
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
              <label className="flex items-center space-x-2 px-2">
                <input
                  type="checkbox"
                  checked={useDemandCorrection}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setUseDemandCorrection(val);
                    // Pass userId to avoid DataStore initialization conflicts (MATCHOPS-LOCAL-2N)
                    updateAppSettings({ useDemandCorrection: val }, user?.id).catch((error) => {
                      logger.warn('[PlayerStatsView] Failed to save demand correction preference (non-critical)', { val, error });
                    });
                  }}
                  title={t('playerStats.useDemandCorrectionTooltip', 'When enabled, ratings from harder games count more')}
                  className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-600 border-slate-500 rounded focus:ring-indigo-500"
                />
                <span className="text-slate-100">{t('playerStats.useDemandCorrection', 'Weight by Difficulty')}</span>
              </label>
              <div className="space-y-2">
                {Object.entries(assessmentAverages.averages).map(([metric, avg]) => (
                  <div key={metric} className="flex items-center space-x-2 px-2">
                    <span className="w-28 shrink-0 text-slate-100">{t(`assessmentMetrics.${metric}` as TranslationKey, metric)}</span>
                    <RatingBar value={avg} />
                  </div>
                ))}
                <div className="flex items-center space-x-2 px-2 mt-2">
                  <span className="w-28 shrink-0 text-slate-100">{t('playerAssessmentModal.overallLabel', 'Overall')}</span>
                  <RatingBar value={assessmentAverages.overall} />
                </div>
                <div className="flex items-center space-x-2 px-2">
                  <span className="w-28 shrink-0 text-slate-100">{t('playerStats.avgRating', 'Avg Rating')}</span>
                  <RatingBar value={assessmentAverages.finalScore} />
                </div>
                <div className="text-xs text-slate-400 text-right">
                  {assessmentAverages.count} {t('playerStats.ratedGames', 'rated')}
                </div>
              </div>
              {assessmentTrends && (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(assessmentTrends).map(([metric, data]) => (
                    <div key={metric} className="bg-slate-800/40 p-2 rounded">
                      <p className="text-xs text-slate-300 mb-1">{t(`assessmentMetrics.${metric}` as TranslationKey, metric)}</p>
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
                        {new Date(n.date).toLocaleDateString()} - {n.notes}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

        {/* Performance by Season/Tournament */}
        <div className="space-y-4 mt-2">
          {Object.keys(playerStats.performanceBySeason).length > 0 && (
            <div className="bg-slate-800/60 p-3 rounded-lg">
              <h4 className="text-md font-semibold text-slate-200 mb-2">{t('playerStats.seasonPerformance', 'Season Performance')}</h4>
              <div className="space-y-2">
                {Object.entries(playerStats.performanceBySeason).map(([id, stats]) => (
                  <div key={id} className="p-2 bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 rounded-md transition-all">
                    <p className="font-semibold text-slate-100 mb-1">{stats.name}</p>
                    <div className="grid grid-cols-5 gap-2 text-center text-sm">
                      <div><p className="font-bold text-yellow-400">{stats.gamesPlayed}</p><p className="text-xs text-slate-400">{t('playerStats.gamesPlayed_short', 'GP')}</p></div>
                      <div><p className="font-bold text-yellow-400">{stats.goals}</p><p className="text-xs text-slate-400">{t('playerStats.goals', 'Goals')}</p></div>
                      <div><p className="font-bold text-yellow-400">{stats.assists}</p><p className="text-xs text-slate-400">{t('playerStats.assists', 'Assists')}</p></div>
                      <div><p className="font-bold text-yellow-400">{stats.points}</p><p className="text-xs text-slate-400">{t('playerStats.points', 'Points')}</p></div>
                      <div><p className="font-bold text-green-400">{stats.fairPlayCards || 0}</p><p className="text-xs text-slate-400"><span className="inline-block bg-green-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-sm">FP</span></p></div>
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
                      <div><p className="font-bold text-yellow-400">{stats.gamesPlayed}</p><p className="text-xs text-slate-400">{t('playerStats.gamesPlayed_short', 'GP')}</p></div>
                      <div><p className="font-bold text-yellow-400">{stats.goals}</p><p className="text-xs text-slate-400">{t('playerStats.goals', 'Goals')}</p></div>
                      <div><p className="font-bold text-yellow-400">{stats.assists}</p><p className="text-xs text-slate-400">{t('playerStats.assists', 'Assists')}</p></div>
                      <div><p className="font-bold text-yellow-400">{stats.points}</p><p className="text-xs text-slate-400">{t('playerStats.points', 'Points')}</p></div>
                      <div><p className="font-bold text-green-400">{stats.fairPlayCards || 0}</p><p className="text-xs text-slate-400"><span className="inline-block bg-green-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-sm">FP</span></p></div>
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
                        </p>
                        <p className="text-xs text-slate-400">{format(new Date(game.date), i18n.language === 'fi' ? 'd.M.yyyy' : 'PP', { locale: i18n.language === 'fi' ? fi : enUS })}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <div className="text-center mx-2">
                        <p className={`font-bold text-xl ${game.goals > 0 ? 'text-green-400' : 'text-slate-300'}`}>{game.goals}</p>
                        <p className="text-xs text-slate-400">{t('playerStats.goals', 'Goals')}</p>
                      </div>
                      <div className="text-center mx-2">
                        <p className={`font-bold text-xl ${game.assists > 0 ? 'text-blue-400' : 'text-slate-300'}`}>{game.assists}</p>
                        <p className="text-xs text-slate-400">{t('playerStats.assists', 'Assists')}</p>
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
