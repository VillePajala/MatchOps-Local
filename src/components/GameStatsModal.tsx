'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Combobox } from '@headlessui/react';
import { HiOutlineChevronUpDown } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import logger from '@/utils/logger';
import { Player, PlayerStatRow, Season, Tournament, Team, Personnel } from '@/types';
import { GameEvent, SavedGamesCollection } from '@/types';
import { getSeasons as utilGetSeasons } from '@/utils/seasons';
import { getTournaments as utilGetTournaments } from '@/utils/tournaments';
import { getTeams as utilGetTeams } from '@/utils/teams';
import PlayerStatsView from './PlayerStatsView';
import { calculateTeamAssessmentAverages } from '@/utils/assessmentStats';
import { extractClubSeasonsFromGames, getClubSeasonForDate } from '@/utils/clubSeason';
import { getAppSettings } from '@/utils/appSettings';
import { useToast } from '@/contexts/ToastProvider';
import ConfirmationModal from './ConfirmationModal';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import { queryKeys } from '@/config/queryKeys';

// Import extracted hooks
import { useGameStats } from './GameStatsModal/hooks/useGameStats';
import { useTournamentSeasonStats } from './GameStatsModal/hooks/useTournamentSeasonStats';
import { useGoalEditor } from './GameStatsModal/hooks/useGoalEditor';

// Import shared utilities
import { getPlayedGamesByTeam } from './GameStatsModal/utils/gameFilters';

// Import extracted components
import {
  PlayerStatsTable,
  GameInfoCard,
  GoalEventList,
  GameNotesEditor,
  FilterControls,
  TeamPerformanceCard,
  ClubSeasonFilter,
  PersonnelSummaryCard,
} from './GameStatsModal/components';

// Import types
import type { SortableColumn, SortDirection, StatsTab } from './GameStatsModal/types';

interface GameStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamName: string;
  opponentName: string;
  gameDate: string;
  homeScore: number;
  awayScore: number;
  homeOrAway: 'home' | 'away';
  gameLocation?: string;
  gameTime?: string;
  numPeriods?: number;
  periodDurationMinutes?: number;
  availablePlayers: Player[];
  gameEvents: GameEvent[];
  gameNotes?: string;
  onGameNotesChange?: (notes: string) => void;
  onUpdateGameEvent?: (updatedEvent: GameEvent) => void;
  selectedPlayerIds: string[];
  savedGames: SavedGamesCollection;
  currentGameId: string | null;
  gamePersonnel?: string[];
  personnelDirectory?: Personnel[];
  onExportOneCsv?: (gameId: string) => void;
  onDeleteGameEvent?: (goalId: string) => void;
  onExportAggregateCsv?: (gameIds: string[], aggregateStats: PlayerStatRow[]) => void;
  initialSelectedPlayerId?: string | null;
  onGameClick?: (gameId: string) => void;
  masterRoster?: Player[];
  onOpenSettings?: () => void;
}

const GameStatsModal: React.FC<GameStatsModalProps> = ({
  isOpen,
  onClose,
  teamName,
  opponentName,
  gameDate,
  homeScore,
  awayScore,
  homeOrAway,
  gameLocation,
  gameTime,
  numPeriods,
  periodDurationMinutes,
  availablePlayers,
  gameEvents,
  gameNotes = '',
  onGameNotesChange = () => {},
  onUpdateGameEvent = () => {},
  selectedPlayerIds,
  savedGames,
  currentGameId,
  gamePersonnel = [],
  personnelDirectory = [],
  onExportOneCsv,
  onDeleteGameEvent,
  onExportAggregateCsv,
  initialSelectedPlayerId = null,
  onGameClick = () => {},
  masterRoster = [],
  onOpenSettings,
}) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  // Date formatting helper
  const formatDisplayDate = useCallback((isoDate: string): string => {
    if (!isoDate) return t('common.notSet', 'Ei asetettu');
    try {
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) {
        logger.warn('Invalid date value in formatDisplayDate', { isoDate });
        return isoDate;
      }

      const currentLanguage = i18n.language;

      // Use consistent Intl.DateTimeFormat for both locales
      const formatter = new Intl.DateTimeFormat(
        currentLanguage.startsWith('fi') ? 'fi-FI' : 'en-US',
        {
          day: 'numeric',
          month: currentLanguage.startsWith('fi') ? 'numeric' : 'short',
          year: 'numeric'
        }
      );

      return formatter.format(date);
    } catch (error) {
      logger.warn('Error formatting date in GameStatsModal', { error, isoDate });
      return 'Date Error';
    }
  }, [i18n.language, t]);

  // Resolve personnel IDs to full Personnel objects
  // DEFENSIVE: Filters out undefined (deleted personnel) to prevent crashes
  //
  // Multi-tab limitation: Per-tab lock manager cannot prevent cross-tab race conditions
  // where one tab deletes personnel while another tab assigns them to a game.
  // This filtering prevents UI crashes from orphaned references but doesn't fix
  // the underlying data integrity issue.
  //
  // Future improvement: Use IndexedDB transactions with read-modify-write isolation
  const resolvedGamePersonnel = useMemo(() => {
    if (!gamePersonnel || gamePersonnel.length === 0) {
      return [] as Personnel[];
    }
    const directoryMap = new Map(personnelDirectory.map(member => [member.id, member] as const));
    return gamePersonnel
      .map(id => directoryMap.get(id))
      .filter((person): person is Personnel => Boolean(person));
  }, [gamePersonnel, personnelDirectory]);

  // Handler for when disabled season filter is clicked or settings button is clicked
  const handleOpenSeasonSettings = useCallback(() => {
    if (onOpenSettings) {
      // If parent provides a callback, use it to open Settings modal
      onOpenSettings();
    } else {
      // Otherwise, show a toast message
      const message = t('playerStats.periodNotConfiguredMessage', 'To filter statistics by period, first configure your season period (e.g., October to May) in Settings.');
      showToast(message, 'info');
    }
  }, [onOpenSettings, showToast, t]);

  // --- State ---
  const [editGameNotes, setEditGameNotes] = useState(gameNotes);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [sortColumn, setSortColumn] = useState<SortableColumn>('totalScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterText, setFilterText] = useState<string>('');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTab, setActiveTab] = useState<StatsTab>(initialSelectedPlayerId ? 'player' : 'currentGame');
  const [selectedSeasonIdFilter, setSelectedSeasonIdFilter] = useState<string | 'all'>('all');
  const [selectedTournamentIdFilter, setSelectedTournamentIdFilter] = useState<string | 'all'>('all');
  const [selectedTeamIdFilter, setSelectedTeamIdFilter] = useState<string | 'all' | 'legacy'>('all');
  const [localGameEvents, setLocalGameEvents] = useState<GameEvent[]>(gameEvents);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(
    initialSelectedPlayerId ? availablePlayers.find(p => p.id === initialSelectedPlayerId) || null : null
  );
  const [playerQuery, setPlayerQuery] = useState('');
  const [selectedClubSeason, setSelectedClubSeason] = useState<string>('all');

  // Use React Query for settings management
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: queryKeys.settings.detail(),
    queryFn: getAppSettings,
    staleTime: Infinity, // Settings rarely change during session
    refetchOnWindowFocus: true, // Refetch on focus for cross-tab sync
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    enabled: isOpen, // Only fetch when modal is open
  });

  // Derive settings values with defaults
  const clubSeasonStartDate = settings?.clubSeasonStartDate ?? '2000-10-01';
  const clubSeasonEndDate = settings?.clubSeasonEndDate ?? '2000-05-01';
  const hasConfiguredSeasonDates = settings?.hasConfiguredSeasonDates ?? false;

  // Filtered players for Player tab combobox
  const filteredPlayers = useMemo(() => {
    const search = playerQuery.toLowerCase();
    return availablePlayers.filter(p => {
      if (!search) return true;
      return (
        p.name.toLowerCase().includes(search) ||
        (p.nickname && p.nickname.toLowerCase().includes(search))
      );
    });
  }, [availablePlayers, playerQuery]);

  // Extract available club seasons from games
  const availableClubSeasons = useMemo(() => {
    const gamesArray = Object.values(savedGames || {});
    return extractClubSeasonsFromGames(gamesArray, clubSeasonStartDate, clubSeasonEndDate);
  }, [savedGames, clubSeasonStartDate, clubSeasonEndDate]);

  // --- Effects ---
  // Load seasons/tournaments/teams when modal opens
  useEffect(() => {
    const loadData = async () => {
      if (isOpen) {
        try {
          const [loadedSeasons, loadedTournaments, loadedTeams] = await Promise.all([
            utilGetSeasons(),
            utilGetTournaments(),
            utilGetTeams(),
          ]);
          setSeasons(loadedSeasons);
          setTournaments(loadedTournaments);
          setTeams(loadedTeams);
        } catch (error) {
          logger.error('[GameStatsModal] Failed to load data:', error);
          showToast(
            t('errors.failedToLoadData', 'Failed to load data. Some features may not be available.'),
            'error'
          );
        }
      }
    };
    loadData();
  }, [isOpen, showToast, t]);

  // Sync local game events with props
  useEffect(() => {
    setLocalGameEvents(gameEvents);
  }, [gameEvents]);

  // Sync notes with props
  useEffect(() => {
    if (isOpen) {
      setEditGameNotes(gameNotes);
      setIsEditingNotes(false);
    }
  }, [isOpen, gameNotes]);

  // Focus notes textarea when editing
  useEffect(() => {
    if (isEditingNotes) notesTextareaRef.current?.focus();
  }, [isEditingNotes]);

  // Update selected player and active tab when initialSelectedPlayerId changes
  useEffect(() => {
    if (initialSelectedPlayerId) {
      const player = availablePlayers.find(p => p.id === initialSelectedPlayerId);
      if (player) {
        setSelectedPlayer(player);
        setActiveTab('player');
      }
    } else if (!isOpen) {
      // Only reset when modal is closed to avoid flashing
      setActiveTab('currentGame');
      setSelectedPlayer(null);
    }
  }, [initialSelectedPlayerId, availablePlayers, isOpen]);

  // Reset filters when tab changes
  useEffect(() => {
    if (activeTab !== 'season') setSelectedSeasonIdFilter('all');
    if (activeTab !== 'tournament') setSelectedTournamentIdFilter('all');
    if (activeTab === 'currentGame' || activeTab === 'player') setSelectedTeamIdFilter('all');
  }, [activeTab]);

  // --- Use extracted hooks ---
  const { stats: playerStats, gameIds: processedGameIds, totals } = useGameStats({
    activeTab,
    savedGames,
    availablePlayers,
    selectedPlayerIds,
    localGameEvents,
    currentGameId,
    selectedSeasonIdFilter,
    selectedTournamentIdFilter,
    selectedTeamIdFilter,
    sortColumn,
    sortDirection,
    filterText,
  });

  const tournamentSeasonStats = useTournamentSeasonStats({
    activeTab,
    savedGames,
    seasons,
    tournaments,
    selectedSeasonIdFilter,
    selectedTournamentIdFilter,
  });

  const goalEditorHook = useGoalEditor({
    gameEvents,
    onUpdateGameEvent,
    onDeleteGameEvent,
    setLocalGameEvents,
    setIsEditingNotes,
    showToast,
    t,
  });

  // Calculate overall team stats (for overall tab)
  const overallTeamStats = useMemo(() => {
    if (activeTab !== 'overall') return null;

    const playedGameIds = getPlayedGamesByTeam(savedGames, selectedTeamIdFilter);

    let gamesPlayed = 0, wins = 0, losses = 0, ties = 0, goalsFor = 0, goalsAgainst = 0;

    playedGameIds.forEach(gameId => {
      const game = savedGames?.[gameId];
      if (!game) return;

      // Filter by club season if one is selected
      if (selectedClubSeason !== 'all' && game.gameDate) {
        const gameSeason = getClubSeasonForDate(game.gameDate, clubSeasonStartDate, clubSeasonEndDate);
        if (gameSeason !== selectedClubSeason) return; // Skip games not in selected club season
      }

      gamesPlayed++;
      const ourScore = game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
      const theirScore = game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

      goalsFor += ourScore;
      goalsAgainst += theirScore;

      if (ourScore > theirScore) wins++;
      else if (ourScore < theirScore) losses++;
      else ties++;
    });

    return {
      gamesPlayed,
      wins,
      losses,
      ties,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      winPercentage: gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0,
      averageGoalsFor: gamesPlayed > 0 ? goalsFor / gamesPlayed : 0,
      averageGoalsAgainst: gamesPlayed > 0 ? goalsAgainst / gamesPlayed : 0,
    };
  }, [activeTab, savedGames, selectedTeamIdFilter, selectedClubSeason, clubSeasonStartDate, clubSeasonEndDate]);

  // Tab counter memoized for performance
  const tabCounterContent = useMemo(() => {
    if (activeTab === 'currentGame') {
      return (
        <span>
          <span className="text-yellow-400 font-semibold">{availablePlayers.length}</span>
          {" "}{availablePlayers.length === 1
            ? t('teamRosterModal.playerSingular', 'Player')
            : t('teamRosterModal.playerPlural', 'Players')}
        </span>
      );
    }

    if (activeTab === 'season') {
      return (
        <span>
          <span className="text-yellow-400 font-semibold">{seasons.length}</span>
          {" "}{seasons.length === 1
            ? t('seasonTournamentModal.seasonSingular', 'Season')
            : t('seasonTournamentModal.seasons', 'Seasons')}
        </span>
      );
    }

    if (activeTab === 'tournament') {
      return (
        <span>
          <span className="text-yellow-400 font-semibold">{tournaments.length}</span>
          {" "}{tournaments.length === 1
            ? t('seasonTournamentModal.tournamentSingular', 'Tournament')
            : t('seasonTournamentModal.tournaments', 'Tournaments')}
        </span>
      );
    }

    if (activeTab === 'overall') {
      const playedGamesCount = getPlayedGamesByTeam(savedGames, selectedTeamIdFilter).length;
      return (
        <span>
          <span className="text-yellow-400 font-semibold">{playedGamesCount}</span>
          {" "}{playedGamesCount === 1
            ? t('gameStatsModal.game', 'Game')
            : t('gameStatsModal.games', 'Games')}
        </span>
      );
    }

    if (activeTab === 'player') {
      if (selectedPlayer) {
        const playerGames = Object.values(savedGames || {}).filter(
          game => game.selectedPlayerIds?.includes(selectedPlayer.id)
        );
        const matchesCount = playerGames.length;
        return (
          <span>
            <span className="text-yellow-400 font-semibold">{matchesCount}</span>
            {" "}{matchesCount === 1
              ? t('common.gameSingular', 'Match')
              : t('common.gamePlural', 'Matches')}
          </span>
        );
      } else {
        return (
          <span>
            <span className="text-yellow-400 font-semibold">{masterRoster.length}</span>
            {" "}{masterRoster.length === 1
              ? t('teamRosterModal.playerSingular', 'Player')
              : t('teamRosterModal.playerPlural', 'Players')}
          </span>
        );
      }
    }

    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` intentionally excluded: translation function changes don't require counter recalculation
  }, [activeTab, availablePlayers, seasons, tournaments, savedGames, selectedTeamIdFilter, selectedPlayer, masterRoster]);

  // Calculate team assessment averages
  const teamAssessmentAverages = useMemo(() => {
    if (activeTab !== 'overall') return null;
    return calculateTeamAssessmentAverages(savedGames);
  }, [activeTab, savedGames]);

  // Sorted goals for current game
  const sortedGoals = useMemo(() => {
    if (activeTab === 'currentGame') {
      return localGameEvents
        .filter(e => e.type === 'goal' || e.type === 'opponentGoal')
        .sort((a, b) => a.time - b.time);
    }
    return [];
  }, [activeTab, localGameEvents]);

  // Determine display names based on home/away
  const displayHomeTeamName = homeOrAway === 'home' ? teamName : opponentName;
  const displayAwayTeamName = homeOrAway === 'home' ? opponentName : teamName;

  // --- Handlers ---
  const handleSaveNotes = () => {
    if (gameNotes !== editGameNotes) onGameNotesChange(editGameNotes);
    setIsEditingNotes(false);
  };

  const handleCancelEditNotes = () => {
    setEditGameNotes(gameNotes);
    setIsEditingNotes(false);
  };

  const handleSort = (column: SortableColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection(column === 'name' ? 'asc' : 'desc');
    }
  };

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(event.target.value);
  };

  const handlePlayerRowClick = (player: Player) => {
    setSelectedPlayer(player);
    setActiveTab('player');
  };

  // Tab styling helpers
  const getTabStyle = (tab: StatsTab) => {
    const baseStyle = 'px-2 py-1.5 text-sm font-medium rounded-md transition-colors';
    if (activeTab === tab) {
      return `${baseStyle} bg-indigo-600 text-white`;
    }
    return `${baseStyle} bg-slate-700 text-slate-300 hover:bg-slate-600`;
  };

  const getPlayerTabStyle = () => {
    const baseStyle = 'px-2 py-1.5 text-sm font-medium rounded-md transition-colors flex-1';
    return `${baseStyle} ${activeTab === 'player' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`;
  };

  // Tab title helper
  const getTabTitle = () => {
    switch (activeTab) {
      case 'season': return t('gameStatsModal.titleSeason', 'Kausitilastot');
      case 'tournament': return t('gameStatsModal.titleTournament', 'Turnaustilastot');
      case 'overall': return t('gameStatsModal.titleOverall', 'Kokonaisstilastot');
      case 'player': {
        const selectedTeamName = selectedTeamIdFilter !== 'all' && selectedTeamIdFilter !== 'legacy'
          ? teams.find(team => team.id === selectedTeamIdFilter)?.name
          : null;
        return `${selectedPlayer?.name || t('playerStats.selectPlayerLabel', 'Select Player')}${selectedTeamName ? ` - ${selectedTeamName}` : ''}`;
      }
      default: return t('gameStatsModal.titleCurrentGame', 'Ottelutilastot');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
        <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-sky-400/10 blur-3xl opacity-50 rounded-full pointer-events-none" />
        <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-indigo-600/10 blur-3xl opacity-50 rounded-full pointer-events-none" />
        {/* Header */}
        <div className="flex flex-col items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
            {getTabTitle()}
          </h2>
          {/* Counter */}
          <div className="mt-3 text-center text-sm">
            <div className="flex justify-center items-center text-slate-300">
              {tabCounterContent}
            </div>
          </div>
        </div>

        {/* Controls Section */}
        <div className="px-4 sm:px-6 py-4 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <div className="flex w-full gap-2">
            <button onClick={() => setActiveTab('currentGame')} className={`${getTabStyle('currentGame')} flex-1`} aria-pressed={activeTab === 'currentGame'}>
              {t('gameStatsModal.tabs.currentGame')}
            </button>
            <button onClick={() => setActiveTab('season')} className={`${getTabStyle('season')} flex-1`} aria-pressed={activeTab === 'season'}>
              {t('gameStatsModal.tabs.season')}
            </button>
            <button onClick={() => setActiveTab('tournament')} className={`${getTabStyle('tournament')} flex-1`} aria-pressed={activeTab === 'tournament'}>
              {t('gameStatsModal.tabs.tournament')}
            </button>
            <button onClick={() => setActiveTab('overall')} className={`${getTabStyle('overall')} flex-1`} aria-pressed={activeTab === 'overall'}>
              {t('gameStatsModal.tabs.overall')}
            </button>
            <button onClick={() => setActiveTab('player')} className={getPlayerTabStyle()} aria-pressed={activeTab === 'player'}>
              {t('gameStatsModal.tabs.player', 'Player')}
            </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === 'player' ? (
            <div className="p-4 sm:p-6">
              {/* Player and Season Filters */}
              <div className="mb-4 grid grid-cols-2 gap-2 overflow-visible">
                <Combobox
                  value={selectedPlayer}
                  onChange={(player) => {
                    setSelectedPlayer(player);
                    setPlayerQuery('');
                  }}
                  nullable
                >
                  <div className="relative">
                    <Combobox.Input
                      className="w-full rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 placeholder-slate-400 transition focus:border-indigo-400/70 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                      onChange={(e) => setPlayerQuery(e.target.value)}
                      displayValue={(p: Player) => (p ? p.name : '')}
                      placeholder={t('playerStats.selectPlayerLabel', 'Select Player')}
                    />
                    <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                      <HiOutlineChevronUpDown className="w-5 h-5 text-slate-300" />
                    </Combobox.Button>
                    {filteredPlayers.length > 0 && (
                      <Combobox.Options className="absolute z-20 mt-1 w-full max-h-80 overflow-auto rounded-md border border-slate-700/50 bg-slate-800/90 backdrop-blur-sm py-1 text-sm shadow-xl focus:outline-none">
                        {filteredPlayers.map((p) => (
                          <Combobox.Option
                            key={p.id}
                            value={p}
                            className={({ active }) =>
                              `p-2 rounded-md border border-slate-700/50 ${
                                active ? 'bg-slate-800/60' : 'bg-slate-800/40 hover:bg-slate-800/60'
                              }`
                            }
                          >
                            {p.name}
                          </Combobox.Option>
                        ))}
                      </Combobox.Options>
                    )}
                  </div>
                </Combobox>
                <ClubSeasonFilter
                  selectedSeason={selectedClubSeason}
                  onChange={setSelectedClubSeason}
                  seasons={availableClubSeasons}
                  hasConfigured={hasConfiguredSeasonDates}
                  isLoading={isLoadingSettings}
                  onOpenSettings={handleOpenSeasonSettings}
                />
              </div>
              {/* Player Stats View */}
              <PlayerStatsView
                player={selectedPlayer}
                savedGames={savedGames}
                onGameClick={onGameClick}
                seasons={seasons}
                tournaments={tournaments}
                teamId={selectedTeamIdFilter !== 'all' && selectedTeamIdFilter !== 'legacy' ? selectedTeamIdFilter : undefined}
                selectedClubSeason={selectedClubSeason}
                clubSeasonStartDate={clubSeasonStartDate}
                clubSeasonEndDate={clubSeasonEndDate}
              />
            </div>
          ) : (
            <div className="p-4 sm:p-6">
              {/* Filters */}
              {activeTab === 'overall' ? (
                /* Overall tab with club season filter - side by side layout */
                <div className={`mb-4 mx-1 grid ${teams.length > 0 ? 'grid-cols-2' : 'grid-cols-1'} gap-2 items-center`}>
                  {/* Team Filter */}
                  {teams.length > 0 && (
                    <select
                      value={selectedTeamIdFilter}
                      onChange={(e) =>
                        setSelectedTeamIdFilter(e.target.value as 'all' | 'legacy' | string)
                      }
                      className="h-[34px] px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="all">{t('loadGameModal.allTeamsFilter', 'All Teams')}</option>
                      <option value="legacy">{t('loadGameModal.legacyGamesFilter', 'Legacy Games')}</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {/* Club Season Filter with gear icon */}
                  <ClubSeasonFilter
                    selectedSeason={selectedClubSeason}
                    onChange={setSelectedClubSeason}
                    seasons={availableClubSeasons}
                    hasConfigured={hasConfiguredSeasonDates}
                    isLoading={isLoadingSettings}
                    onOpenSettings={handleOpenSeasonSettings}
                  />
                </div>
              ) : (
                /* Other tabs - normal layout */
                <FilterControls
                  activeTab={activeTab}
                  seasons={seasons}
                  tournaments={tournaments}
                  teams={teams}
                  selectedSeasonIdFilter={selectedSeasonIdFilter}
                  selectedTournamentIdFilter={selectedTournamentIdFilter}
                  selectedTeamIdFilter={selectedTeamIdFilter}
                  onSeasonFilterChange={setSelectedSeasonIdFilter}
                  onTournamentFilterChange={setSelectedTournamentIdFilter}
                  onTeamFilterChange={setSelectedTeamIdFilter}
                />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
            <PersonnelSummaryCard personnel={resolvedGamePersonnel} />
                  {/* Overall Statistics Section */}
                  {activeTab === 'overall' && overallTeamStats && (
                    <TeamPerformanceCard
                      title={
                        selectedTeamIdFilter === 'all'
                          ? t('loadGameModal.allTeamsFilter', 'All Teams')
                          : selectedTeamIdFilter === 'legacy'
                          ? t('loadGameModal.legacyGamesFilter', 'Legacy Games')
                          : teams.find(team => team.id === selectedTeamIdFilter)?.name || t('gameStatsModal.overallSummary', 'Overall Summary')
                      }
                      gamesPlayed={overallTeamStats.gamesPlayed}
                      wins={overallTeamStats.wins}
                      losses={overallTeamStats.losses}
                      ties={overallTeamStats.ties}
                      winPercentage={overallTeamStats.winPercentage}
                      goalDifference={overallTeamStats.goalDifference}
                      goalsFor={overallTeamStats.goalsFor}
                      goalsAgainst={overallTeamStats.goalsAgainst}
                      averageGoalsFor={overallTeamStats.averageGoalsFor}
                      averageGoalsAgainst={overallTeamStats.averageGoalsAgainst}
                      teamAssessmentAverages={teamAssessmentAverages}
                    />
                  )}

                  {/* Tournament/Season Statistics Section */}
                  {(activeTab === 'season' || activeTab === 'tournament') && tournamentSeasonStats && (
                    <>
                      {Array.isArray(tournamentSeasonStats) ? (
                        // Specific season/tournament selected - show TeamPerformanceCard directly (no outer wrapper)
                        tournamentSeasonStats.length > 0 ? (
                          tournamentSeasonStats.map(stats => (
                            <div key={stats.id} className="mb-6 last:mb-0">
                              <TeamPerformanceCard
                                title={stats.name}
                                gamesPlayed={stats.gamesPlayed}
                                wins={stats.wins}
                                losses={stats.losses}
                                ties={stats.ties}
                                winPercentage={stats.winPercentage}
                                goalDifference={stats.goalDifference}
                                goalsFor={stats.goalsFor}
                                goalsAgainst={stats.goalsAgainst}
                                averageGoalsFor={stats.averageGoalsFor}
                                averageGoalsAgainst={stats.averageGoalsAgainst}
                                lastGameDate={stats.lastGameDate ? formatDisplayDate(stats.lastGameDate) : undefined}
                                useGradient={false}
                              />
                            </div>
                          ))
                        ) : (
                          <div className="bg-slate-900/70 p-8 rounded-lg border border-slate-700 shadow-inner text-center text-slate-400">
                            {activeTab === 'season'
                              ? t('gameStatsModal.noSeasonGames', 'No games found for this season.')
                              : t('gameStatsModal.noTournamentGames', 'No games found for this tournament.')
                            }
                          </div>
                        )
                      ) : (
                        // "All Seasons/Tournaments" selected - show aggregate stats in a card
                        <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
                          <h3 className="text-xl font-semibold text-slate-200 mb-4">
                            {activeTab === 'season'
                              ? t('gameStatsModal.filterAllSeasons', 'All Seasons')
                              : t('gameStatsModal.filterAllTournaments', 'All Tournaments')
                            }
                          </h3>
                          <div className="space-y-0 text-sm">
                            <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
                              <span className="text-slate-300">{t('common.gamesPlayed', 'Games Played')}</span>
                              <span className="text-yellow-400 font-bold">{tournamentSeasonStats.totalGames}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
                              <span className="text-slate-300">{t('common.record', 'Record')}</span>
                              <span className="text-yellow-400 font-bold">
                                {tournamentSeasonStats.totalWins}-{tournamentSeasonStats.totalLosses}-{tournamentSeasonStats.totalTies}
                              </span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
                              <span className="text-slate-300">{t('common.winPercentage', 'Win %')}</span>
                              <span className="text-yellow-400 font-bold">{tournamentSeasonStats.overallWinPercentage.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
                              <span className="text-slate-300">{t('common.goalDifference', 'Goal Diff')}</span>
                              <span
                                className={`font-bold ${tournamentSeasonStats.totalGoalDifference >= 0 ? 'text-green-400' : 'text-red-400'}`}
                              >
                                {tournamentSeasonStats.totalGoalDifference >= 0 ? '+' : ''}
                                {tournamentSeasonStats.totalGoalDifference}
                              </span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
                              <span className="text-slate-300">{t('common.goalsFor', 'Goals For')}</span>
                              <span className="text-yellow-400 font-bold">{tournamentSeasonStats.totalGoalsFor}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
                              <span className="text-slate-300">{t('common.goalsAgainst', 'Goals Against')}</span>
                              <span className="text-yellow-400 font-bold">{tournamentSeasonStats.totalGoalsAgainst}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
                              <span className="text-slate-300">{t('common.avgGoalsFor', 'Avg Goals For')}</span>
                              <span className="text-yellow-400 font-bold">{tournamentSeasonStats.averageGoalsFor.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5 px-2">
                              <span className="text-slate-300">{t('common.avgGoalsAgainst', 'Avg Goals Against')}</span>
                              <span className="text-yellow-400 font-bold">{tournamentSeasonStats.averageGoalsAgainst.toFixed(1)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Game Info Card (Current Game only) */}
                  {activeTab === 'currentGame' && (
                    <GameInfoCard
                      homeTeamName={displayHomeTeamName}
                      awayTeamName={displayAwayTeamName}
                      homeScore={homeScore}
                      awayScore={awayScore}
                      formattedDate={formatDisplayDate(gameDate)}
                      gameTime={gameTime}
                      gameLocation={gameLocation}
                      numPeriods={numPeriods}
                      periodDurationMinutes={periodDurationMinutes}
                    />
                  )}

                  {/* Player Stats Table */}
                  <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
                    <h3 className="text-xl font-semibold text-slate-200 mb-4">{t('gameStatsModal.playerStatsTitle', 'Player Statistics')}</h3>
                    {/* Search Input */}
                    <div className="relative mb-4">
                      <input
                        type="text"
                        value={filterText}
                        onChange={handleFilterChange}
                        placeholder={t('common.filterByName', 'Filter by name...')}
                        className="bg-slate-800 border border-slate-700 rounded-md text-white pl-8 pr-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 [&:-webkit-autofill]:bg-slate-800 [&:-webkit-autofill]:text-white [&:-webkit-autofill]:[-webkit-text-fill-color:white] [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_#1e293b_inset]"
                      />
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div>
                      <PlayerStatsTable
                        playerStats={playerStats}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        totals={totals}
                        onSort={handleSort}
                        onPlayerRowClick={handlePlayerRowClick}
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {activeTab === 'currentGame' && (
                    <>
                      <GoalEventList
                        goals={sortedGoals}
                        availablePlayers={availablePlayers}
                        opponentName={opponentName}
                        editingGoalId={goalEditorHook.editingGoalId}
                        editGoalTime={goalEditorHook.editGoalTime}
                        editGoalScorerId={goalEditorHook.editGoalScorerId}
                        editGoalAssisterId={goalEditorHook.editGoalAssisterId}
                        goalTimeInputRef={goalEditorHook.goalTimeInputRef}
                        onStartEditGoal={goalEditorHook.handleStartEditGoal}
                        onCancelEditGoal={goalEditorHook.handleCancelEditGoal}
                        onSaveEditGoal={goalEditorHook.handleSaveEditGoal}
                        onGoalEditKeyDown={goalEditorHook.handleGoalEditKeyDown}
                        onDeleteGoal={goalEditorHook.triggerDeleteEvent}
                        onEditGoalTimeChange={goalEditorHook.setEditGoalTime}
                        onEditGoalScorerChange={goalEditorHook.setEditGoalScorerId}
                        onEditGoalAssisterChange={goalEditorHook.setEditGoalAssisterId}
                      />

                      <GameNotesEditor
                        gameNotes={gameNotes}
                        isEditingNotes={isEditingNotes}
                        editGameNotes={editGameNotes}
                        notesTextareaRef={notesTextareaRef}
                        onStartEdit={() => setIsEditingNotes(true)}
                        onSaveNotes={handleSaveNotes}
                        onCancelEdit={handleCancelEditNotes}
                        onEditNotesChange={setEditGameNotes}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <ModalFooter>
          {(onExportAggregateCsv || onExportOneCsv) ? (
            <>
              {activeTab === 'currentGame' && currentGameId && onExportOneCsv && (
                <button
                  onClick={() => onExportOneCsv(currentGameId)}
                  className="px-4 py-2 rounded-md font-medium transition-colors bg-slate-700 hover:bg-slate-600 text-slate-200"
                >
                  {t('common.exportCsv', 'Vie CSV')}
                </button>
              )}
              {activeTab !== 'currentGame' && onExportAggregateCsv && (
                <button
                  onClick={() => onExportAggregateCsv(processedGameIds, playerStats)}
                  className="px-4 py-2 rounded-md font-medium transition-colors bg-slate-700 hover:bg-slate-600 text-slate-200"
                >
                  {t('common.exportCsv', 'Vie CSV')}
                </button>
              )}
              <div className="flex-1" />
            </>
          ) : null}
          <button onClick={onClose} className={primaryButtonStyle}>
            {t('common.doneButton', 'Done')}
          </button>
        </ModalFooter>

        {/* Confirmation Modal for Delete Event */}
        <ConfirmationModal
          isOpen={goalEditorHook.showDeleteConfirm}
          title={t('gameStatsModal.confirmDeleteEventTitle', 'Delete Event')}
          message={t('gameStatsModal.confirmDeleteEvent', 'Are you sure you want to delete this event? This cannot be undone.')}
          warningMessage={t('gameStatsModal.deleteWarning', 'This action is permanent and cannot be reversed.')}
          onConfirm={goalEditorHook.confirmDeleteEvent}
          onCancel={() => goalEditorHook.setShowDeleteConfirm(false)}
          confirmLabel={t('common.delete', 'Delete')}
          variant="danger"
        />
      </div>
    </div>
  );
};

export default GameStatsModal;