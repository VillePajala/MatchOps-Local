'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Combobox } from '@headlessui/react';
import { HiOutlineChevronUpDown } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import logger from '@/utils/logger';
import { Player, PlayerStatRow, Season, Tournament, Team, Personnel, PlayerStatAdjustment } from '@/types';
import { GameEvent, SavedGamesCollection } from '@/types';
import { getSeasons as utilGetSeasons } from '@/utils/seasons';
import { getTournaments as utilGetTournaments } from '@/utils/tournaments';
import { getTeams as utilGetTeams } from '@/utils/teams';
import PlayerStatsView from './PlayerStatsView';
import { calculateTeamAssessmentAverages } from '@/utils/assessmentStats';
import { extractClubSeasonsFromGames, getClubSeasonForDate } from '@/utils/clubSeason';
import { getAppSettings, DEFAULT_CLUB_SEASON_START_DATE, DEFAULT_CLUB_SEASON_END_DATE } from '@/utils/appSettings';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import ConfirmationModal from './ConfirmationModal';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import { queryKeys } from '@/config/queryKeys';

// Import extracted hooks
import { useGameStats } from './GameStatsModal/hooks/useGameStats';
import { useTournamentSeasonStats } from './GameStatsModal/hooks/useTournamentSeasonStats';
import { useGoalEditor } from './GameStatsModal/hooks/useGoalEditor';
import { useStatsFilters } from './GameStatsModal/hooks/useStatsFilters';

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
  PersonnelSummaryCard,
} from './GameStatsModal/components';
import { CollapsibleFilters } from './GameStatsModal/components/CollapsibleFilters';

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
  wentToOvertime?: boolean;
  wentToPenalties?: boolean;
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
  onExportOneExcel?: (gameId: string) => void;
  onDeleteGameEvent?: (goalId: string) => void;
  onExportAggregateExcel?: (gameIds: string[], aggregateStats: PlayerStatRow[]) => void;
  onExportPlayerExcel?: (playerId: string, playerData: PlayerStatRow, gameIds: string[]) => void;
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
  wentToOvertime,
  wentToPenalties,
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
  onExportOneExcel,
  onDeleteGameEvent,
  onExportAggregateExcel,
  onExportPlayerExcel,
  initialSelectedPlayerId = null,
  onGameClick = () => {},
  masterRoster = [],
  onOpenSettings,
}) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { userId, getStore } = useDataStore();

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
  const [localGameEvents, setLocalGameEvents] = useState<GameEvent[]>(gameEvents);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(
    initialSelectedPlayerId ? availablePlayers.find(p => p.id === initialSelectedPlayerId) || null : null
  );
  const [playerQuery, setPlayerQuery] = useState('');
  const [allAdjustments, setAllAdjustments] = useState<PlayerStatAdjustment[]>([]);
  const { filters, handlers } = useStatsFilters();
  const {
    selectedSeasonIdFilter,
    selectedTournamentIdFilter,
    selectedTeamIdFilter,
    selectedSeriesIdFilter,
    selectedGameTypeFilter,
    selectedGenderFilter,
    selectedClubSeason,
  } = filters;
  const {
    onSeasonFilterChange,
    onTournamentFilterChange,
    onTeamFilterChange,
    onSeriesFilterChange,
    onGameTypeFilterChange,
    // onClubSeasonChange - available but not currently used in UI
    resetAllFilters,
  } = handlers;

  // Use React Query for settings management (user-scoped)
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: [...queryKeys.settings.detail(), userId],
    queryFn: () => getAppSettings(userId),
    staleTime: Infinity, // Settings rarely change during session
    refetchOnWindowFocus: true, // Refetch on focus for cross-tab sync
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    enabled: isOpen, // Only fetch when modal is open
  });

  // Derive settings values with defaults
  const clubSeasonStartDate = settings?.clubSeasonStartDate ?? DEFAULT_CLUB_SEASON_START_DATE;
  const clubSeasonEndDate = settings?.clubSeasonEndDate ?? DEFAULT_CLUB_SEASON_END_DATE;
  const hasConfiguredSeasonDates = settings?.hasConfiguredSeasonDates ?? false;

  // Player pool for Player tab search: prefer full master roster; fall back to current game's available players
  const playerPool: Player[] = useMemo(() => {
    // Merge and de-duplicate by id to be safe if both lists are provided
    const map = new Map<string, Player>();
    if (masterRoster && masterRoster.length > 0) {
      masterRoster.forEach(p => map.set(p.id, p));
    }
    (availablePlayers || []).forEach(p => {
      if (!map.has(p.id)) map.set(p.id, p);
    });
    return Array.from(map.values());
  }, [masterRoster, availablePlayers]);

  // Defensive: warn if player pool is empty while modal is open (likely missing data)
  useEffect(() => {
    if (isOpen && playerPool.length === 0) {
      logger.warn('[GameStatsModal] playerPool is empty (no masterRoster or availablePlayers)');
    }
  }, [isOpen, playerPool.length]);

  // Filtered players for Player tab combobox (from the unified pool)
  const filteredPlayers = useMemo(() => {
    const search = playerQuery.toLowerCase();
    return playerPool.filter(p => {
      if (!search) return true;
      return (
        p.name.toLowerCase().includes(search) ||
        (p.nickname && p.nickname.toLowerCase().includes(search))
      );
    });
  }, [playerPool, playerQuery]);

  // Extract available club seasons from games
  const availableClubSeasons = useMemo(() => {
    const gamesArray = Object.values(savedGames || {});
    return extractClubSeasonsFromGames(gamesArray, clubSeasonStartDate, clubSeasonEndDate);
  }, [savedGames, clubSeasonStartDate, clubSeasonEndDate]);

  // --- Effects ---
  // Load seasons/tournaments/teams/adjustments when modal opens
  useEffect(() => {
    const loadData = async () => {
      if (isOpen) {
        try {
          const store = await getStore();
          const [loadedSeasons, loadedTournaments, loadedTeams, adjustmentsMap] = await Promise.all([
            utilGetSeasons(userId),
            utilGetTournaments(userId),
            utilGetTeams(userId),
            store.getAllPlayerAdjustments(),
          ]);
          setSeasons(loadedSeasons);
          setTournaments(loadedTournaments);
          setTeams(loadedTeams);

          // Flatten the Map<playerId, adjustments[]> into a single array
          const flat: PlayerStatAdjustment[] = [];
          for (const adjs of adjustmentsMap.values()) {
            for (const adj of adjs) {
              flat.push(adj);
            }
          }
          setAllAdjustments(flat);
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
  }, [isOpen, showToast, t, userId, getStore]);

  // Reload adjustments when switching to season/tournament tabs
  // (user may have added external games on the Player tab)
  useEffect(() => {
    if (!isOpen || (activeTab !== 'season' && activeTab !== 'tournament')) return;
    const reload = async () => {
      try {
        const store = await getStore();
        const adjustmentsMap = await store.getAllPlayerAdjustments();
        const flat: PlayerStatAdjustment[] = [];
        for (const adjs of adjustmentsMap.values()) {
          for (const adj of adjs) {
            flat.push(adj);
          }
        }
        setAllAdjustments(flat);
      } catch (error) {
        logger.debug('[GameStatsModal] Failed to reload adjustments', { error });
      }
    };
    reload();
  }, [isOpen, activeTab, getStore]);

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
      const player = playerPool.find(p => p.id === initialSelectedPlayerId);
      if (player) {
        setSelectedPlayer(player);
        setActiveTab('player');
      }
    } else if (!isOpen) {
      // Only reset when modal is closed to avoid flashing
      setActiveTab('currentGame');
      setSelectedPlayer(null);
    }
  }, [initialSelectedPlayerId, playerPool, isOpen]);

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
    selectedSeriesIdFilter,
    selectedGameTypeFilter,
    selectedGenderFilter,
    selectedClubSeason,
    clubSeasonStartDate,
    clubSeasonEndDate,
    sortColumn,
    sortDirection,
    filterText,
    adjustments: allAdjustments,
    playerPool,
  });

  // Empty state for season/tournament with specific team and zero matching games
  const noGamesInContext = useMemo(() => {
    const isSpecificSeason = activeTab === 'season' && selectedSeasonIdFilter !== 'all';
    const isSpecificTournament = activeTab === 'tournament' && selectedTournamentIdFilter !== 'all';
    const hasSpecificTeam = selectedTeamIdFilter !== 'all';
    return (isSpecificSeason || isSpecificTournament) && hasSpecificTeam && processedGameIds.length === 0;
  }, [activeTab, selectedSeasonIdFilter, selectedTournamentIdFilter, selectedTeamIdFilter, processedGameIds.length]);

  const tournamentSeasonStats = useTournamentSeasonStats({
    activeTab,
    savedGames,
    seasons,
    tournaments,
    selectedSeasonIdFilter,
    selectedTournamentIdFilter,
    selectedTeamIdFilter,
    selectedGameTypeFilter,
    selectedGenderFilter,
    // Club season filter params
    selectedClubSeason,
    clubSeasonStartDate,
    clubSeasonEndDate,
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

      // Filter by game type if one is selected
      if (selectedGameTypeFilter !== 'all') {
        const gameType = game.gameType || 'soccer'; // Default to soccer for legacy games
        if (gameType !== selectedGameTypeFilter) return;
      }

      // Filter by gender if one is selected
      if (selectedGenderFilter !== 'all') {
        if (game.gender !== selectedGenderFilter) return;
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
  }, [activeTab, savedGames, selectedTeamIdFilter, selectedClubSeason, selectedGameTypeFilter, selectedGenderFilter, clubSeasonStartDate, clubSeasonEndDate]);

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
    if (gameNotes !== editGameNotes) {
      // Notes changed - call onGameNotesChange and let useEffect exit edit mode
      // when gameNotes prop updates, to avoid showing stale value in view mode
      onGameNotesChange(editGameNotes);
    } else {
      // No changes - exit edit mode immediately
      setIsEditingNotes(false);
    }
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

  // Helper to check if any filters are active (for empty state messaging)
  const hasActiveFilters = selectedGameTypeFilter !== 'all' || selectedGenderFilter !== 'all' || selectedClubSeason !== 'all' || selectedTeamIdFilter !== 'all';

  // Generate filter hint for empty state
  const getFilterHint = () => {
    const hints: string[] = [];
    if (selectedGameTypeFilter !== 'all') {
      hints.push(selectedGameTypeFilter === 'soccer'
        ? t('common.gameTypeSoccer', 'Soccer')
        : t('common.gameTypeFutsal', 'Futsal'));
    }
    if (selectedGenderFilter === 'boys') {
      hints.push(t('common.genderBoys', 'Boys'));
    } else if (selectedGenderFilter === 'girls') {
      hints.push(t('common.genderGirls', 'Girls'));
    }
    if (selectedClubSeason !== 'all') {
      hints.push(`${t('playerStats.periodLabel', 'Period')}: ${selectedClubSeason}`);
    }
    if (selectedTeamIdFilter !== 'all' && selectedTeamIdFilter !== 'legacy') {
      const teamName = teams.find(team => team.id === selectedTeamIdFilter)?.name;
      if (teamName) hints.push(teamName);
    }
    return hints.length > 0 ? hints.join(', ') : null;
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't close if a child dialog (delete confirmation) is open or user is editing a goal
      if (e.key === 'Escape' && !goalEditorHook.showDeleteConfirm && goalEditorHook.editingGoalId === null) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, goalEditorHook.showDeleteConfirm, goalEditorHook.editingGoalId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display" role="dialog" aria-modal="true" aria-label={getTabTitle()}>
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
            <button onClick={() => { resetAllFilters(); setActiveTab('currentGame'); }} className={`${getTabStyle('currentGame')} flex-1`} aria-pressed={activeTab === 'currentGame'}>
              {t('gameStatsModal.tabs.currentGame')}
            </button>
            <button onClick={() => { resetAllFilters(); setActiveTab('season'); }} className={`${getTabStyle('season')} flex-1`} aria-pressed={activeTab === 'season'}>
              {t('gameStatsModal.tabs.season')}
            </button>
            <button onClick={() => { resetAllFilters(); setActiveTab('tournament'); }} className={`${getTabStyle('tournament')} flex-1`} aria-pressed={activeTab === 'tournament'}>
              {t('gameStatsModal.tabs.tournament')}
            </button>
            <button onClick={() => { resetAllFilters(); setActiveTab('overall'); }} className={`${getTabStyle('overall')} flex-1`} aria-pressed={activeTab === 'overall'}>
              {t('gameStatsModal.tabs.overall')}
            </button>
            <button onClick={() => { resetAllFilters(); setActiveTab('player'); }} className={getPlayerTabStyle()} aria-pressed={activeTab === 'player'}>
              {t('gameStatsModal.tabs.player', 'Player')}
            </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === 'player' ? (
            <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-4 sm:pb-6">
              {/* Player filter with collapsible Game Type and Season filters */}
              <CollapsibleFilters
                activeTab={activeTab}
                seasons={seasons}
                tournaments={tournaments}
                teams={teams}
                filters={filters}
                handlers={handlers}
                availableClubSeasons={availableClubSeasons}
                hasConfiguredSeasonDates={hasConfiguredSeasonDates}
                isLoadingSettings={isLoadingSettings}
                onOpenSettings={handleOpenSeasonSettings}
              >
                {/* Player Combobox as primary filter */}
                <Combobox
                  value={selectedPlayer}
                  onChange={(player) => {
                    setSelectedPlayer(player);
                    setPlayerQuery('');
                  }}
                  nullable
                >
                  <div className="relative flex-1 min-w-0">
                    <Combobox.Input
                      className="w-full px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                              `p-2 rounded-md border border-slate-700/50 text-slate-100 cursor-pointer ${
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
              </CollapsibleFilters>
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
                selectedGameTypeFilter={selectedGameTypeFilter}
                selectedGenderFilter={selectedGenderFilter}
              />
            </div>
          ) : (
            <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-4 sm:pb-6">
              {/* Filters */}
              {activeTab === 'overall' || activeTab === 'tournament' || activeTab === 'season' ? (
                /* Overall, Tournament and Season tabs - collapsible filters for space efficiency */
                <CollapsibleFilters
                  activeTab={activeTab}
                  seasons={seasons}
                  tournaments={tournaments}
                  teams={teams}
                  filters={filters}
                  handlers={handlers}
                  // Club Season Filter props (for Season tab)
                  availableClubSeasons={availableClubSeasons}
                  hasConfiguredSeasonDates={hasConfiguredSeasonDates}
                  isLoadingSettings={isLoadingSettings}
                  onOpenSettings={handleOpenSeasonSettings}
                />
              ) : (
                /* Current Game tab - normal layout */
                <FilterControls
                  activeTab={activeTab}
                  seasons={seasons}
                  tournaments={tournaments}
                  teams={teams}
                  selectedSeasonIdFilter={selectedSeasonIdFilter}
                  selectedTournamentIdFilter={selectedTournamentIdFilter}
                  selectedTeamIdFilter={selectedTeamIdFilter}
                  selectedSeriesIdFilter={selectedSeriesIdFilter}
                  selectedGameTypeFilter={selectedGameTypeFilter}
                  onSeasonFilterChange={onSeasonFilterChange}
                  onTournamentFilterChange={onTournamentFilterChange}
                  onTeamFilterChange={onTeamFilterChange}
                  onSeriesFilterChange={onSeriesFilterChange}
                  onGameTypeFilterChange={onGameTypeFilterChange}
                />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
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
                            <div>
                              {activeTab === 'season'
                                ? t('gameStatsModal.noSeasonGames', 'No games found for this season.')
                                : t('gameStatsModal.noTournamentGames', 'No games found for this tournament.')
                              }
                            </div>
                            {hasActiveFilters && (
                              <div className="mt-2 text-sm text-slate-500">
                                {t('gameStatsModal.activeFiltersHint', 'Active filters')}: {getFilterHint()}
                              </div>
                            )}
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
                      wentToOvertime={wentToOvertime}
                      wentToPenalties={wentToPenalties}
                    />
                  )}

                  {/* Player Stats Table or Empty State */}
                  <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
                    <h3 className="text-xl font-semibold text-slate-200 mb-4">{t('gameStatsModal.playerStatsTitle', 'Player Statistics')}</h3>
                    {noGamesInContext ? (
                      <div className="text-center text-slate-400 py-8">
                        <div className="text-lg font-semibold mb-2">
                          {t('gameStatsModal.noTeamGamesTitle', 'No games for the selected team in this context')}
                        </div>
                        <div className="text-sm">
                          {t('gameStatsModal.noTeamGamesSubtitle', 'Choose another team or adjust filters to view player statistics.')}
                        </div>
                        {hasActiveFilters && (
                          <div className="mt-2 text-xs text-slate-500">
                            {t('gameStatsModal.activeFiltersHint', 'Active filters')}: {getFilterHint()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
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

                      <PersonnelSummaryCard personnel={resolvedGamePersonnel} />

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
          {(onExportAggregateExcel || onExportOneExcel || onExportPlayerExcel) ? (
            <>
              {activeTab === 'currentGame' && currentGameId && onExportOneExcel && (
                <button
                  onClick={() => onExportOneExcel(currentGameId)}
                  className="px-4 py-2 rounded-md font-medium transition-colors bg-slate-700 hover:bg-slate-600 text-slate-200"
                >
                  {t('common.exportExcel', 'Export Excel')}
                </button>
              )}
              {activeTab === 'player' && selectedPlayer && onExportPlayerExcel && (
                <button
                  onClick={() => {
                    const playerData = playerStats.find(p => p.id === selectedPlayer.id);
                    if (playerData) {
                      const playerGameIds = processedGameIds.filter(
                        gameId => savedGames[gameId].selectedPlayerIds?.includes(selectedPlayer.id)
                      );
                      onExportPlayerExcel(selectedPlayer.id, playerData, playerGameIds);
                    }
                  }}
                  className="px-4 py-2 rounded-md font-medium transition-colors bg-slate-700 hover:bg-slate-600 text-slate-200"
                >
                  {t('common.exportExcel', 'Export Excel')}
                </button>
              )}
              {activeTab !== 'currentGame' && activeTab !== 'player' && onExportAggregateExcel && !noGamesInContext && processedGameIds.length > 0 && (
                <button
                  onClick={() => onExportAggregateExcel(processedGameIds, playerStats)}
                  className="px-4 py-2 rounded-md font-medium transition-colors bg-slate-700 hover:bg-slate-600 text-slate-200"
                >
                  {t('common.exportExcel', 'Export Excel')}
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
