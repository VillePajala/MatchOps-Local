'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';
import { HiOutlineEllipsisVertical, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi2';
import { Season, Tournament, Player, Team, Personnel } from '@/types';
import { AppState } from '@/types';
import { getTeamRoster } from '@/utils/teams';
import { updateGameDetails, updateGameEvent } from '@/utils/savedGames';
import { UseMutationResult } from '@tanstack/react-query';
import { TFunction } from 'i18next';
import AssessmentSlider from './AssessmentSlider';
import PlayerSelectionSection from './PlayerSelectionSection';
import PersonnelSelectionSection from './PersonnelSelectionSection';
import TeamOpponentInputs from './TeamOpponentInputs';
import { AGE_GROUPS, LEVELS } from '@/config/gameOptions';
import { FINNISH_YOUTH_LEAGUES, CUSTOM_LEAGUE_ID } from '@/config/leagues';
import type { TranslationKey } from '@/i18n-types';
import ConfirmationModal from './ConfirmationModal';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';

/**
 * Delay before applying prefill mutations to prevent race conditions on mobile devices.
 * 100ms is chosen to:
 * - Allow React state updates to complete
 * - Prevent localStorage conflicts on slow devices
 * - Still feel instant to users (< 200ms threshold)
 *
 * Note: This is an educated guess based on React lifecycle timing and mobile device
 * performance characteristics. Consider adding telemetry to measure:
 * - Actual race condition frequency at different delay values
 * - User-perceived latency (time from selection to visible update)
 * - Failed mutation rate vs delay correlation
 *
 * Hypothesis: 100ms is sufficient for 99%+ of devices. If telemetry shows issues,
 * consider adaptive delay based on device performance detection.
 */
const PREFILL_MUTATION_DELAY_MS = 100;

export type GameEventType = 'goal' | 'opponentGoal' | 'substitution' | 'periodEnd' | 'gameEnd' | 'fairPlayCard';

export interface GameEvent {
  id: string;
  type: GameEventType;
  time: number; // Gametime in seconds
  period?: number;
  scorerId?: string;
  assisterId?: string;
  entityId?: string;
}

type MutationMetaBase = {
  source: 'seasonPrefill' | 'tournamentPrefill' | 'seasonSelection' | 'tournamentSelection' | 'stateSync';
  targetId?: string;
  expectedState?: {
    seasonId?: string;
    tournamentId?: string;
    gameLocation?: string;
    ageGroup?: string;
    tournamentLevel?: string;
    selectedPlayerIds?: string[];
    gamePersonnel?: string[];
    gameTime?: string;
    gameDate?: string;
    teamName?: string;
    opponentName?: string;
    demandFactor?: number;
    numberOfPeriods?: number;
    periodDurationMinutes?: number;
    homeOrAway?: 'home' | 'away';
  };
  expectedIsPlayed?: boolean;
};

type MutationMeta = MutationMetaBase & { sequence: number };

export interface GameSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // --- Data for the current game ---
  currentGameId: string | null;
  teamId?: string;
  teamName: string;
  opponentName: string;
  gameDate: string;
  gameLocation?: string;
  gameTime?: string;
  gameNotes?: string;
  ageGroup?: string;
  tournamentLevel?: string;
  seasonId?: string;
  tournamentId?: string;
  leagueId?: string;
  customLeagueName?: string;
  gameEvents: GameEvent[];
  availablePlayers: Player[];
  availablePersonnel: Personnel[];
  numPeriods: number;
  periodDurationMinutes: number;
  demandFactor?: number;
  selectedPlayerIds: string[];
  selectedPersonnelIds: string[];
  onSelectedPlayersChange: (playerIds: string[]) => void;
  onSelectedPersonnelChange: (personnelIds: string[]) => void;
  // --- Handlers for updating game data ---
  onTeamNameChange: (name: string) => void;
  onOpponentNameChange: (name: string) => void;
  onGameDateChange: (date: string) => void;
  onGameLocationChange: (location: string) => void;
  onGameTimeChange: (time: string) => void;
  onGameNotesChange: (notes: string) => void;
  onAgeGroupChange: (age: string) => void;
  onTournamentLevelChange: (level: string) => void;
  onUpdateGameEvent: (updatedEvent: GameEvent) => void;
  onDeleteGameEvent?: (goalId: string) => Promise<boolean>;
  onAwardFairPlayCard: (playerId: string | null, time: number) => void;
  onNumPeriodsChange: (num: number) => void;
  onPeriodDurationChange: (minutes: number) => void;
  onDemandFactorChange: (factor: number) => void;
  onSeasonIdChange: (seasonId: string | undefined) => void;
  onTournamentIdChange: (tournamentId: string | undefined) => void;
  /**
   * Updates the league ID for the current game.
   * @param leagueId - League ID from FINNISH_YOUTH_LEAGUES, or undefined to clear.
   *                   Use CUSTOM_LEAGUE_ID ('muu') for custom leagues.
   * @example
   * // Set to SM-sarja
   * onLeagueIdChange('sm-sarja');
   *
   * // Set to custom league (requires customLeagueName)
   * onLeagueIdChange(CUSTOM_LEAGUE_ID);
   *
   * // Clear league selection
   * onLeagueIdChange(undefined);
   */
  onLeagueIdChange: (leagueId: string | undefined) => void;
  /**
   * Updates the custom league name when leagueId === CUSTOM_LEAGUE_ID.
   * @param customLeagueName - Custom league name, or undefined to clear.
   *                           Only used when leagueId is CUSTOM_LEAGUE_ID ('muu').
   * @example
   * // Set custom league name
   * onCustomLeagueNameChange('My Local Tournament');
   *
   * // Clear custom league name (e.g., when switching to predefined league)
   * onCustomLeagueNameChange(undefined);
   */
  onCustomLeagueNameChange: (customLeagueName: string | undefined) => void;
  homeOrAway: 'home' | 'away';
  onSetHomeOrAway: (status: 'home' | 'away') => void;
  isPlayed: boolean;
  onIsPlayedChange: (played: boolean) => void;
  // Removed: addSeasonMutation - unused prop (season creation moved to dedicated modal)
  // Removed: addTournamentMutation - unused prop (tournament creation moved to dedicated modal)
  // Removed: isAddingSeason - unused prop, mutations handle loading state internally
  // Removed: isAddingTournament - unused prop, mutations handle loading state internally
  // Add current time for fair play card
  timeElapsedInSeconds?: number;
  updateGameDetailsMutation: UseMutationResult<AppState | null, Error, { gameId: string; updates: Partial<AppState>; meta?: MutationMeta }, unknown>;
  // Fresh data from React Query
  seasons: Season[];
  tournaments: Tournament[];
  masterRoster?: Player[]; // Full roster for tournament player award display
  teams: Team[]; // Available teams for selection
  onTeamIdChange: (teamId: string | null) => void; // Handler to update game's teamId
}

// Helper to format time from seconds to MM:SS
const formatTime = (timeInSeconds: number): string => {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = timeInSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// Helper to get event description
const getEventDescription = (event: GameEvent, players: Player[], t: TFunction): string => {
  switch (event.type) {
    case 'goal': {
      const scorer = players.find(p => p.id === event.scorerId)?.name || t('gameSettingsModal.unknownPlayer', 'Unknown Player');
      let description = scorer;
      if (event.assisterId) {
        const assister = players.find(p => p.id === event.assisterId)?.name;
        if (assister) {
          description += ` (${t('common.assist', 'Assist')}: ${assister})`;
        }
      }
      return description;
    }
    case 'opponentGoal':
      return t('gameSettingsModal.logTypeOpponentGoal', 'Opponent Goal');
    case 'periodEnd':
      return t('gameSettingsModal.logTypePeriodEnd', 'End of Period');
    case 'gameEnd':
      return t('gameSettingsModal.logTypeGameEnd', 'End of Game');
    default:
      return t('gameSettingsModal.logTypeUnknown', 'Unknown Event');
  }
};

const GameSettingsModal: React.FC<GameSettingsModalProps> = ({
  isOpen,
  onClose,
  currentGameId,
  teamId,
  teamName,
  opponentName,
  gameDate,
  gameLocation = '',
  gameTime = '',
  gameNotes = '',
  ageGroup = '',
  tournamentLevel = '',
  onTeamNameChange,
  onOpponentNameChange,
  onGameDateChange,
  onGameLocationChange,
  onGameTimeChange,
  onGameNotesChange,
  onAgeGroupChange,
  onTournamentLevelChange,
  onUpdateGameEvent,
  onDeleteGameEvent,
  onAwardFairPlayCard,
  gameEvents,
  availablePlayers,
  availablePersonnel,
  selectedPlayerIds,
  selectedPersonnelIds,
  onSelectedPlayersChange,
  onSelectedPersonnelChange,
  seasonId = '',
  tournamentId = '',
  leagueId = '',
  customLeagueName = '',
  numPeriods,
  periodDurationMinutes,
  demandFactor = 1,
  onNumPeriodsChange,
  onPeriodDurationChange,
  onDemandFactorChange,
  onSeasonIdChange,
  onTournamentIdChange,
  onLeagueIdChange,
  onCustomLeagueNameChange,
  homeOrAway,
  onSetHomeOrAway,
  isPlayed,
  onIsPlayedChange,
  // Removed: addSeasonMutation - unused prop (season creation moved to dedicated modal)
  // Removed: addTournamentMutation - unused prop (tournament creation moved to dedicated modal)
  // Removed: isAddingSeason - unused prop, mutations handle loading state internally
  // Removed: isAddingTournament - unused prop, mutations handle loading state internally
  timeElapsedInSeconds,
  updateGameDetailsMutation,
  seasons,
  tournaments,
  // masterRoster removed - was only used in sync useEffect which is now removed
  teams,
  onTeamIdChange,
}) => {
  // logger.log('[GameSettingsModal Render] Props received:', { seasonId, tournamentId, currentGameId });
  const { t } = useTranslation();
  const { showToast } = useToast();

  // Memoize available levels to avoid O(n) lookup on every render
  const availableLevels = useMemo(() => {
    if (!tournamentId) return LEVELS;
    const selectedTournament = tournaments.find(tour => tour.id === tournamentId);
    return selectedTournament?.series && selectedTournament.series.length > 0
      ? selectedTournament.series.map(s => s.level)
      : LEVELS;
  }, [tournamentId, tournaments]);

  // Track if we've already applied season/tournament updates to prevent infinite loops
  const appliedSeasonRef = useRef<string | null>(null);
  const appliedTournamentRef = useRef<string | null>(null);
  // Track if component is mounted to prevent setState on unmounted component
  const isMountedRef = useRef<boolean>(true);
  const mutationSequenceRef = useRef<number>(0);

  // Track mount state to prevent race conditions with setTimeout
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Debug logging for period settings
  useEffect(() => {
    if (isOpen) {
      logger.log('[GameSettingsModal] Modal opened with period settings:', {
        numPeriods,
        periodDurationMinutes,
      });
    }
  }, [isOpen, numPeriods, periodDurationMinutes]);

  /**
   * Get next mutation sequence number for race condition prevention.
   *
   * Note: No wraparound needed. Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991.
   * Even at 1 mutation/second, would take 285 million years to overflow.
   * Wraparound would break stale detection by repeating sequence numbers.
   */
  const getNextMutationSequence = useCallback(() => {
    mutationSequenceRef.current += 1;
    return mutationSequenceRef.current;
  }, []);

  const mutateGameDetails = useCallback(
    (updates: Partial<AppState>, meta: MutationMetaBase, onError?: (error: unknown) => void) => {
      if (!currentGameId) return;
      const sequence = getNextMutationSequence();
      updateGameDetailsMutation.mutate(
        {
          gameId: currentGameId,
          updates,
          meta: { ...meta, sequence },
        },
        {
          onError: (error) => {
            // Call custom error handler if provided
            if (onError) {
              onError(error);
            } else {
              // Default error handler for mutations without explicit error handling
              logger.error('[GameSettingsModal] Game details mutation failed:', error);
              if (isMountedRef.current) {
                setError(t('gameSettingsModal.errors.updateFailed', 'Failed to save changes'));
              }
            }
          },
        }
      );
    },
    [currentGameId, updateGameDetailsMutation, getNextMutationSequence, t]
  );

  const mutateGameDetailsAsync = useCallback(
    (updates: Partial<AppState>, meta: MutationMetaBase) => {
      if (!currentGameId) return Promise.resolve();
      const sequence = getNextMutationSequence();
      return updateGameDetailsMutation.mutateAsync({
        gameId: currentGameId,
        updates,
        meta: { ...meta, sequence },
      });
    },
    [currentGameId, updateGameDetailsMutation, getNextMutationSequence]
  );

  // Add defensive logging for debugging Vercel preview issues
  useEffect(() => {
    if (isOpen) {
      logger.log('[GameSettingsModal] Modal opened with:', {
        currentGameId,
        tournamentId,
        seasonId,
        hasUpdateMutation: !!updateGameDetailsMutation,
        gameEventsLength: gameEvents?.length || 0,
        availablePlayersLength: availablePlayers?.length || 0,
      });
    }
  }, [isOpen, currentGameId, tournamentId, seasonId, updateGameDetailsMutation, gameEvents, availablePlayers]);

  // Clear error state when modal opens to prevent stale error messages
  useEffect(() => {
    setError(null);
  }, [isOpen]);

  // State for event editing within the modal
  const [localGameEvents, setLocalGameEvents] = useState<GameEvent[]>(gameEvents || []);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editGoalTime, setEditGoalTime] = useState<string>('');
  const [editGoalScorerId, setEditGoalScorerId] = useState<string>('');
  const [editGoalAssisterId, setEditGoalAssisterId] = useState<string | undefined>(undefined);
  const goalTimeInputRef = useRef<HTMLInputElement>(null);

  // State for inline editing UI control
  const [inlineEditingField, setInlineEditingField] = useState<
    'team' | 'opponent' | 'date' | 'location' | 'time' | 'duration' | 'notes' | null
  >(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');
  const teamInputRef = useRef<HTMLInputElement>(null);
  const opponentInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const durationInputRef = useRef<HTMLInputElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // (moved) Close actions menu when clicking outside — see below after menu state

  // Removed: showNewSeasonInput, setShowNewSeasonInput - unused state (season creation moved to dedicated modal)
  // Removed: newSeasonName, setNewSeasonName - unused state (season creation moved to dedicated modal)
  // Removed: showNewTournamentInput, setShowNewTournamentInput - unused state (tournament creation moved to dedicated modal)
  // Removed: newTournamentName, setNewTournamentName - unused state (tournament creation moved to dedicated modal)
  // Removed: newSeasonInputRef - unused ref (season creation moved to dedicated modal)
  // Removed: newTournamentInputRef - unused ref (tournament creation moved to dedicated modal)

  // State for active tab
  const [activeTab, setActiveTab] = useState<'none' | 'season' | 'tournament'>('none');

  // NEW: Loading and Error states for modal operations
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirmation modal state
  const [showDeleteEventConfirm, setShowDeleteEventConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  const [eventActionsMenuId, setEventActionsMenuId] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Close actions menu when clicking outside
  useEffect(() => {
    if (!eventActionsMenuId) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setEventActionsMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [eventActionsMenuId]);

  // State for game time
  const [gameHour, setGameHour] = useState<string>('');
  const [gameMinute, setGameMinute] = useState<string>('');

  // State for team roster integration
  const [, setTeamRoster] = useState<Player[]>([]);

  // State for team selection
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(teamId || null);
  const teamSelectionRequestRef = useRef<number>(0); // Track current team selection request for race condition protection

  // Sync selectedTeamId with teamId prop when modal opens or teamId changes
  useEffect(() => {
    if (isOpen) {
      setSelectedTeamId(teamId || null);
    }
  }, [isOpen, teamId]);

  // Load team roster when modal opens with teamId
  useEffect(() => {
    const loadTeamRoster = async () => {
      if (isOpen && teamId) {
        try {
          const roster = await getTeamRoster(teamId);
          setTeamRoster(roster || []);
        } catch (error) {
          logger.error('[GameSettingsModal] Error loading team roster:', error);
          setTeamRoster([]);
        }
      }
    };

    loadTeamRoster();
  }, [isOpen, teamId]);

  // Initialize game time state from prop
  useEffect(() => {
    if (gameTime && typeof gameTime === 'string') {
      const [hour, minute] = gameTime.split(':');
      setGameHour(hour || '');
      setGameMinute(minute || '');
    } else {
      setGameHour('');
      setGameMinute('');
    }
  }, [gameTime]);

  // Helper to keep parent time string consistent (either full HH:MM or cleared)
  const syncGameTime = (hourValue: string, minuteValue: string) => {
    const hasHour = hourValue !== '';
    const hasMinute = minuteValue !== '';

    let timeValue = '';
    if (!hasHour && !hasMinute) {
      timeValue = '';
    } else if (hasHour && hasMinute) {
      const formattedHour = hourValue.padStart(2, '0');
      const formattedMinute = minuteValue.padStart(2, '0');
      timeValue = `${formattedHour}:${formattedMinute}`;
    } else {
      // If only one side has been provided, avoid sending a partial value like "12:" or ":30"
      timeValue = '';
    }

    onGameTimeChange(timeValue);
    mutateGameDetails(
      { gameTime: timeValue },
      { source: 'stateSync', expectedState: { gameTime: timeValue } }
    );
  };

  // Handle time changes
  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numeric input and limit to 2 characters
    const numericValue = value.replace(/[^0-9]/g, '');
    if (numericValue.length <= 2) {
      const hourNum = parseInt(numericValue, 10);
      // Validate hour range (0-23) if number is complete
      if (numericValue === '' || (hourNum >= 0 && hourNum <= 23)) {
        setGameHour(numericValue);
        syncGameTime(numericValue, gameMinute);
      }
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numeric input and limit to 2 characters
    const numericValue = value.replace(/[^0-9]/g, '');
    if (numericValue.length <= 2) {
      const minuteNum = parseInt(numericValue, 10);
      // Validate minute range (0-59) if number is complete
      if (numericValue === '' || (minuteNum >= 0 && minuteNum <= 59)) {
        setGameMinute(numericValue);
        syncGameTime(gameHour, numericValue);
      }
    }
  };

  // --- Effects ---

  // Sync activeTab with incoming props
  useEffect(() => {
    if (isOpen) { // Only adjust when modal is open
      if (seasonId && seasonId !== '') {
        setActiveTab('season');
      } else if (tournamentId && tournamentId !== '') {
        setActiveTab('tournament');
      } else {
        setActiveTab('none');
      }
    }
  }, [isOpen, seasonId, tournamentId]);

  // Effect to update localGameEvents if the prop changes from parent (e.g., undo/redo)
  useEffect(() => {
    setLocalGameEvents(gameEvents || []); 
  }, [gameEvents]);

  // Focus goal time input (Keep this)
  useEffect(() => {
    if (editingGoalId) { goalTimeInputRef.current?.focus(); goalTimeInputRef.current?.select(); }
  }, [editingGoalId]);

  // Focus inline edit input (Keep this)
  useEffect(() => {
    if (inlineEditingField === 'team') teamInputRef.current?.focus();
    else if (inlineEditingField === 'opponent') opponentInputRef.current?.focus();
    else if (inlineEditingField === 'date') dateInputRef.current?.focus();
    else if (inlineEditingField === 'location') locationInputRef.current?.focus();
    else if (inlineEditingField === 'time') timeInputRef.current?.focus();
    else if (inlineEditingField === 'duration') durationInputRef.current?.focus();
    else if (inlineEditingField === 'notes') notesTextareaRef.current?.focus();

    if(inlineEditingField) {
        // Select text content on focus for easier editing
        const inputElement = teamInputRef.current || opponentInputRef.current || dateInputRef.current || locationInputRef.current || timeInputRef.current || durationInputRef.current;
        inputElement?.select();
        notesTextareaRef.current?.select();
    }
  }, [inlineEditingField]);

  // Prefill game settings when selecting a season
  useEffect(() => {
    if (!isOpen || !seasonId) {
      // Reset the ref when modal closes or season is cleared
      if (!isOpen || !seasonId) {
        appliedSeasonRef.current = null;
      }
      return;
    }

    // Guard against missing currentGameId which might happen on Vercel preview
    if (!currentGameId) {
      logger.warn('[GameSettingsModal] Skipping season prefill - no currentGameId');
      return;
    }

    // Skip if we've already applied updates for this season to prevent infinite loop
    if (appliedSeasonRef.current === seasonId) {
      logger.log('[GameSettingsModal] Skipping season prefill - already applied for', seasonId);
      return;
    }

    const season = seasons.find(se => se.id === seasonId);
    if (!season) return;

    // Batch all season updates into a single mutation to avoid localStorage conflicts on mobile
    const batchedUpdates: Partial<AppState> = {};
    let hasUpdates = false;

    // Update local state (form inputs) AND prepare for persistence
    // Call handlers BEFORE setting ref so failures can retry
    try {
      if (season.location !== undefined) {
        const location = season.location || '';
        onGameLocationChange(location);
        batchedUpdates.gameLocation = location;
        hasUpdates = true;
      }
      // Always set ageGroup (empty string if season doesn't have one)
      const seasonAgeGroup = season.ageGroup || '';
      onAgeGroupChange(seasonAgeGroup);
      batchedUpdates.ageGroup = seasonAgeGroup;
      hasUpdates = true;

      // Always set gameDate (keep current if season doesn't have one)
      const seasonDate = season.startDate || gameDate;
      onGameDateChange(seasonDate);
      batchedUpdates.gameDate = seasonDate;
      hasUpdates = true;
      const parsedCount = Number(season.periodCount);
      if (parsedCount === 1 || parsedCount === 2) {
        const count = parsedCount as 1 | 2;
        onNumPeriodsChange(count);
        batchedUpdates.numberOfPeriods = count;
        hasUpdates = true;
      }
      const parsedDuration = Number(season.periodDuration);
      if (Number.isFinite(parsedDuration) && parsedDuration > 0) {
        onPeriodDurationChange(parsedDuration);
        batchedUpdates.periodDurationMinutes = parsedDuration;
        hasUpdates = true;
      }

      // Apply league from season as default
      const seasonLeagueId = season.leagueId || '';
      const seasonCustomLeagueName = season.customLeagueName || '';
      onLeagueIdChange(seasonLeagueId || undefined);
      onCustomLeagueNameChange(seasonLeagueId === CUSTOM_LEAGUE_ID ? seasonCustomLeagueName || undefined : undefined);
      batchedUpdates.leagueId = seasonLeagueId || undefined;
      batchedUpdates.customLeagueName = seasonLeagueId === CUSTOM_LEAGUE_ID ? seasonCustomLeagueName || undefined : undefined;
      hasUpdates = true;

      // Mark this season as applied AFTER handlers succeed to allow retry on failure
      appliedSeasonRef.current = seasonId;
    } catch (error) {
      logger.error('[GameSettingsModal] Error calling season prefill handlers:', error);
      // Don't set ref on error, allowing retry
      return;
    }

    // Apply all updates in a single mutation call to prevent mobile localStorage conflicts
    if (currentGameId && hasUpdates) {

      // Add a small delay to ensure game is fully created on Vercel preview
      const timeoutId = setTimeout(async () => {
        const targetSeasonId = seasonId;
        // Check if component is still mounted before calling mutation
        if (!isMountedRef.current) {
          logger.log('[GameSettingsModal] Component unmounted, skipping season prefill mutation');
          return;
        }
        // Check if this season is still the active selection (user may have cleared/changed)
        if (appliedSeasonRef.current !== targetSeasonId) {
          logger.log('[GameSettingsModal] Season selection changed before mutation, skipping stale prefill mutation');
          return;
        }
        try {
          await mutateGameDetailsAsync(batchedUpdates, {
            source: 'seasonPrefill',
            targetId: targetSeasonId ?? undefined,
            expectedState: { seasonId: targetSeasonId ?? '' },
          });
        } catch (error) {
          logger.error('[GameSettingsModal] Error updating game with season data:', error);
          // Only update state if component is still mounted
          if (!isMountedRef.current) {
            logger.log('[GameSettingsModal] Component unmounted during mutation, skipping error state update');
            return;
          }
          setError(t('gameSettingsModal.errors.seasonUpdateFailed', 'Failed to apply season settings'));
          // Reset ref on error so it can be retried
          appliedSeasonRef.current = null;
        }
      }, PREFILL_MUTATION_DELAY_MS);

      // Cleanup: Clear timeout if effect re-runs (e.g., user changes season rapidly)
      return () => clearTimeout(timeoutId);
    }

    // Don't update roster selection here to avoid dependency loop
    // The mutation will handle updating the game state
    // Handlers (onGameLocationChange, etc.) intentionally omitted from deps to prevent loops
    // appliedSeasonRef guard ensures handlers only run once per season selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, seasons, isOpen, currentGameId, mutateGameDetailsAsync, t]);

  // Prefill game settings when selecting a tournament
  useEffect(() => {
    if (!isOpen || !tournamentId) {
      // Reset the ref when modal closes or tournament is cleared
      if (!isOpen || !tournamentId) {
        appliedTournamentRef.current = null;
      }
      return;
    }

    // Guard against missing currentGameId which might happen on Vercel preview
    if (!currentGameId) {
      logger.warn('[GameSettingsModal] Skipping tournament prefill - no currentGameId');
      return;
    }

    // Skip if we've already applied updates for this tournament to prevent infinite loop
    if (appliedTournamentRef.current === tournamentId) {
      logger.log('[GameSettingsModal] Skipping tournament prefill - already applied for', tournamentId);
      return;
    }

    const tournament = tournaments.find(tt => tt.id === tournamentId);
    if (!tournament) return;

    // Batch all tournament updates into a single mutation to avoid localStorage conflicts on mobile
    const batchedUpdates: Partial<AppState> = {};
    let hasUpdates = false;

    // Update local state (form inputs) AND prepare for persistence
    // Call handlers BEFORE setting ref so failures can retry
    try {
      if (tournament.location !== undefined) {
        const location = tournament.location || '';
        onGameLocationChange(location);
        batchedUpdates.gameLocation = location;
        hasUpdates = true;
      }
      // Always set ageGroup (empty string if tournament doesn't have one)
      const tournamentAgeGroup = tournament.ageGroup || '';
      onAgeGroupChange(tournamentAgeGroup);
      batchedUpdates.ageGroup = tournamentAgeGroup;
      hasUpdates = true;

      // Always set tournamentLevel (empty string if tournament doesn't have one)
      const tournamentLvl = tournament.level || '';
      onTournamentLevelChange(tournamentLvl);
      batchedUpdates.tournamentLevel = tournamentLvl;
      hasUpdates = true;

      // Always set gameDate (keep current if tournament doesn't have one)
      const tournamentDate = tournament.startDate || gameDate;
      onGameDateChange(tournamentDate);
      batchedUpdates.gameDate = tournamentDate;
      hasUpdates = true;
      const parsedCount = Number(tournament.periodCount);
      if (parsedCount === 1 || parsedCount === 2) {
        const count = parsedCount as 1 | 2;
        onNumPeriodsChange(count);
        batchedUpdates.numberOfPeriods = count;
        hasUpdates = true;
      }
      const parsedDuration = Number(tournament.periodDuration);
      if (Number.isFinite(parsedDuration) && parsedDuration > 0) {
        onPeriodDurationChange(parsedDuration);
        batchedUpdates.periodDurationMinutes = parsedDuration;
        hasUpdates = true;
      }

      // Mark this tournament as applied AFTER handlers succeed to allow retry on failure
      appliedTournamentRef.current = tournamentId;
    } catch (error) {
      logger.error('[GameSettingsModal] Error calling tournament prefill handlers:', error);
      // Don't set ref on error, allowing retry
      return;
    }

    // Apply all updates in a single mutation call to prevent mobile localStorage conflicts
    if (currentGameId && hasUpdates) {

      // Add a small delay to ensure game is fully created on Vercel preview
      const timeoutId = setTimeout(async () => {
        const targetTournamentId = tournamentId;
        // Check if component is still mounted before calling mutation
        if (!isMountedRef.current) {
          logger.log('[GameSettingsModal] Component unmounted, skipping tournament prefill mutation');
          return;
        }
        // Check if this tournament is still the active selection (user may have cleared/changed)
        if (appliedTournamentRef.current !== targetTournamentId) {
          logger.log('[GameSettingsModal] Tournament selection changed before mutation, skipping stale prefill mutation');
          return;
        }
        try {
          await mutateGameDetailsAsync(batchedUpdates, {
            source: 'tournamentPrefill',
            targetId: targetTournamentId ?? undefined,
            expectedState: { tournamentId: targetTournamentId ?? '' },
          });
        } catch (error) {
          logger.error('[GameSettingsModal] Error updating game with tournament data:', error);
          if (!isMountedRef.current) {
            logger.log('[GameSettingsModal] Component unmounted during mutation, skipping error state update');
            return;
          }
          setError(t('gameSettingsModal.errors.tournamentUpdateFailed', 'Failed to apply tournament settings'));
          // Reset ref on error so it can be retried
          appliedTournamentRef.current = null;
        }
      }, PREFILL_MUTATION_DELAY_MS);

      // Cleanup: Clear timeout if effect re-runs (e.g., user changes tournament rapidly)
      return () => clearTimeout(timeoutId);
    }

    // Don't update roster selection here to avoid dependency loop
    // The mutation will handle updating the game state
    // Handlers (onGameLocationChange, etc.) intentionally omitted from deps to prevent loops
    // appliedTournamentRef guard ensures handlers only run once per tournament selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, tournaments, isOpen, currentGameId, mutateGameDetailsAsync, t]);

  // --- Event Handlers ---

  const handleSeasonChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const newSeasonId = value || ''; // Use empty string instead of undefined for JSON consistency
    onSeasonIdChange(newSeasonId);

    // Only clear tournament if setting a non-empty season (mutual exclusivity)
    // If clearing season, leave tournament unchanged
    if (newSeasonId) {
      appliedTournamentRef.current = null;
      onTournamentIdChange(''); // Use empty string for cleared state
    }

    const updates = newSeasonId
      ? { seasonId: newSeasonId, tournamentId: '' }
      : { seasonId: newSeasonId };
    const expectedState: Partial<AppState> = newSeasonId
      ? { seasonId: newSeasonId, tournamentId: '' }
      : { seasonId: newSeasonId };
    mutateGameDetails(
      updates,
      {
        source: newSeasonId ? 'seasonSelection' : 'stateSync',
        targetId: newSeasonId,
        expectedState,
      },
      (error) => {
        logger.error('[GameSettingsModal] Season selection mutation failed:', error);
        if (isMountedRef.current) {
          setError(t('gameSettingsModal.errors.seasonUpdateFailed', 'Failed to apply season settings'));
        }
      }
    );
    // Removed: setShowNewSeasonInput(false) - state no longer exists (season creation moved to dedicated modal)
    // Removed: setNewSeasonName('') - state no longer exists (season creation moved to dedicated modal)
  };

  const handleTournamentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const newTournamentId = value || ''; // Use empty string instead of undefined for JSON consistency
    onTournamentIdChange(newTournamentId);

    // Only clear season if setting a non-empty tournament (mutual exclusivity)
    // If clearing tournament, leave season unchanged
    if (newTournamentId) {
      appliedSeasonRef.current = null;
      onSeasonIdChange(''); // Use empty string for cleared state
    }

    const updates = newTournamentId
      ? { tournamentId: newTournamentId, seasonId: '' }
      : { tournamentId: newTournamentId };
    const expectedState: Partial<AppState> = newTournamentId
      ? { tournamentId: newTournamentId, seasonId: '' }
      : { tournamentId: newTournamentId };
    mutateGameDetails(
      updates,
      {
        source: newTournamentId ? 'tournamentSelection' : 'stateSync',
        targetId: newTournamentId,
        expectedState,
      },
      (error) => {
        logger.error('[GameSettingsModal] Tournament selection mutation failed:', error);
        if (isMountedRef.current) {
          setError(t('gameSettingsModal.errors.tournamentUpdateFailed', 'Failed to apply tournament settings'));
        }
      }
    );
    // Removed: setShowNewTournamentInput(false) - state no longer exists (tournament creation moved to dedicated modal)
    // Removed: setNewTournamentName('') - state no longer exists (tournament creation moved to dedicated modal)
  };

  // Team selection handler with roster auto-load
  const handleTeamSelection = async (teamId: string | null) => {
    // Increment request counter to track this request
    const requestId = ++teamSelectionRequestRef.current;

    setSelectedTeamId(teamId);
    onTeamIdChange(teamId);

    mutateGameDetails(
      { teamId: teamId || undefined },
      { source: 'stateSync' }
    );

    if (teamId) {
      try {
        // Load team roster
        const teamRoster = await getTeamRoster(teamId);

        // Check if this is still the current request
        if (requestId !== teamSelectionRequestRef.current) {
          return; // A newer request has been made, abandon this one
        }

        if (teamRoster && teamRoster.length > 0) {
          // Create a set of team player names for comparison (since IDs differ)
          const teamPlayerNames = new Set(
            teamRoster.map((p: Player) => p.name.toLowerCase().trim())
          );

          // Select master roster players that match team roster names
          const selectedIds = availablePlayers
            .filter((p: Player) => teamPlayerNames.has(p.name.toLowerCase().trim()))
            .map((p: Player) => p.id);

          onSelectedPlayersChange(selectedIds);
        } else {
          // Team roster is empty - no players pre-selected
          onSelectedPlayersChange([]);
        }
      } catch (error) {
        logger.error('[GameSettingsModal] Error loading team roster:', error);

        // Check if this is still the current request
        if (requestId !== teamSelectionRequestRef.current) {
          return;
        }

        // Don't change player selection on error
      }
    } else {
      // No team selected - keep current selection (don't auto-select all)
      // User can manually select players if needed
    }
  };

  // Handle Goal Event Editing
  const handleEditGoal = (goal: GameEvent) => {
    setEditingGoalId(goal.id);
    setEditGoalTime(formatTime(goal.time)); // Use MM:SS format for editing time
    setEditGoalScorerId(goal.scorerId || '');
    setEditGoalAssisterId(goal.assisterId || undefined);
  };

  const handleCancelEditGoal = () => {
    setEditingGoalId(null);
    setEditGoalTime('');
    setEditGoalScorerId('');
    setEditGoalAssisterId(undefined);
  };

  // Handle saving edited goal
  const handleSaveGoal = async (goalId: string) => {
    if (!goalId || !currentGameId) {
      logger.error("[GameSettingsModal] Missing goalId or currentGameId for save.");
      setError(t('gameSettingsModal.errors.missingGoalId', 'Goal ID or Game ID is missing. Cannot save.'));
      return;
    }

    setError(null);
    setIsProcessing(true);

    let timeInSeconds = 0;
    const timeParts = editGoalTime.split(':');
    if (timeParts.length === 2) {
      const minutes = parseInt(timeParts[0], 10);
      const seconds = parseInt(timeParts[1], 10);
      if (!isNaN(minutes) && !isNaN(seconds)) {
        timeInSeconds = minutes * 60 + seconds;
      } else {
        showToast(t('gameSettingsModal.invalidTimeFormat', "Invalid time format. Use MM:SS"), 'error');
        return;
      }
    } else if (editGoalTime) {
        showToast(t('gameSettingsModal.invalidTimeFormat', "Invalid time format. Use MM:SS"), 'error');
      return;
    }

    const originalEvent = localGameEvents.find(e => e.id === goalId);
    if (!originalEvent) {
        logger.error(`[GameSettingsModal] Original event not found for ID: ${goalId}`);
      return;
    }

    const updatedEvent: GameEvent = {
      ...originalEvent, // Preserve other properties like type
      id: goalId,
      time: timeInSeconds,
      scorerId: editGoalScorerId,
      assisterId: editGoalAssisterId || undefined,
    };

    setLocalGameEvents(prevEvents =>
      prevEvents.map(event => (event.id === goalId ? updatedEvent : event))
    );
    onUpdateGameEvent(updatedEvent); // Propagate to parent for its state update

    try {
      const eventIndex = gameEvents.findIndex(e => e.id === goalId); // Use gameEvents from props for original index
      if (eventIndex !== -1) {
        const success = await updateGameEvent(currentGameId, eventIndex, updatedEvent);
        if (success) {
          logger.log(`[GameSettingsModal] Event ${goalId} updated in game ${currentGameId}.`);
          handleCancelEditGoal(); // Close edit mode on success
        } else {
          logger.error(`[GameSettingsModal] Failed to update event ${goalId} in game ${currentGameId} via utility.`);
          setError(t('gameSettingsModal.errors.updateFailed', 'Failed to update event. Please try again.'));
          // Optionally revert UI:
          // setLocalGameEvents(gameEvents); // Revert local state if save failed
        }
      } else {
        logger.error(`[GameSettingsModal] Event ${goalId} not found in original gameEvents prop for saving.`);
        setError(t('gameSettingsModal.errors.eventNotFound', 'Original event not found for saving.'));
      }
    } catch (err) {
      logger.error(`[GameSettingsModal] Error updating event ${goalId} in game ${currentGameId}:`, err);
      setError(t('gameSettingsModal.errors.genericSaveError', 'An unexpected error occurred while saving the event.'));
      // Optionally revert UI:
      // setLocalGameEvents(gameEvents); // Revert local state if save failed
    } finally {
      setIsProcessing(false);
      // Do not call handleCancelEditGoal() here if there was an error,
      // so the user can see their input and try again or cancel.
    }
  };

  // Handle deleting a goal
  const handleDeleteGoal = (goalId: string) => {
    if (!onDeleteGameEvent || !currentGameId) {
      logger.error("[GameSettingsModal] Missing onDeleteGameEvent handler or currentGameId for delete.");
      setError(t('gameSettingsModal.errors.missingDeleteHandler', 'Cannot delete event: Critical configuration missing.'));
      return;
    }

    setEventToDelete(goalId);
    setShowDeleteEventConfirm(true);
  };

  const handleDeleteEventConfirmed = async () => {
    const goalId = eventToDelete;
    if (!goalId || !onDeleteGameEvent || !currentGameId) {
      setShowDeleteEventConfirm(false);
      setEventToDelete(null);
      return;
    }

    setError(null);
    setIsProcessing(true);
    // Save original state for rollback if parent handler fails
    const originalLocalEvents = localGameEvents;

    try {
      // Optimistic update for UI responsiveness
      setLocalGameEvents(prevEvents => prevEvents.filter(event => event.id !== goalId));

      // Call parent handler (now handles storage internally and returns success status)
      const success = await onDeleteGameEvent(goalId);

      if (!success) {
        logger.error(`[GameSettingsModal] Failed to delete event ${goalId} (parent handler returned false).`);
        setError(t('gameSettingsModal.errors.deleteFailed', 'Failed to delete event. Please try again.'));
        setLocalGameEvents(originalLocalEvents); // Rollback on failure
      } else {
        logger.log(`[GameSettingsModal] Event ${goalId} deleted successfully.`);
      }
    } catch (err) {
      logger.error(`[GameSettingsModal] Error deleting event ${goalId}:`, err);
      setError(t('gameSettingsModal.errors.genericDeleteError', 'An unexpected error occurred while deleting the event.'));
      setLocalGameEvents(originalLocalEvents); // Rollback on error
    } finally {
      setIsProcessing(false);
      setShowDeleteEventConfirm(false);
      setEventToDelete(null);
    }
  };

  // Inline Editing Handlers (Refactored)
  const handleStartInlineEdit = (field: 'team' | 'opponent' | 'date' | 'location' | 'time' | 'duration' | 'notes') => {
    setInlineEditingField(field);
    // Initialize edit value based on current prop value
    switch (field) {
      case 'team': setInlineEditValue(teamName); break;
      case 'opponent': setInlineEditValue(opponentName); break;
      case 'date': setInlineEditValue(gameDate); break; // Use YYYY-MM-DD
      case 'location': setInlineEditValue(gameLocation); break;
      case 'time': setInlineEditValue(gameTime); break; // Use HH:MM
      case 'duration': setInlineEditValue(String(periodDurationMinutes)); break;
      case 'notes': setInlineEditValue(gameNotes); break;
      default: setInlineEditValue('');
    }
  };

  const handleConfirmInlineEdit = async () => {
    if (inlineEditingField === null) return;

    setError(null); // Clear previous errors
    setIsProcessing(true);

    const trimmedValue = inlineEditValue.trim();
    let success = false;
    const fieldProcessed: typeof inlineEditingField = inlineEditingField; // To use in finally

    try {
      if (!currentGameId) {
        logger.error("[GameSettingsModal] currentGameId is null, cannot save inline edit.");
        setError(t('gameSettingsModal.errors.missingGameIdInline', "Cannot save: Game ID missing."));
        return;
      }

      switch (inlineEditingField) {
        case 'team':
          if (trimmedValue) {
            onTeamNameChange(trimmedValue);
            await updateGameDetails(currentGameId, { teamName: trimmedValue });
            success = true;
          } else {
            showToast(t('gameSettingsModal.teamNameRequired', "Team name cannot be empty."), 'error');
          }
          break;
        case 'opponent':
          if (trimmedValue) {
            onOpponentNameChange(trimmedValue);
            await updateGameDetails(currentGameId, { opponentName: trimmedValue });
            success = true;
          } else {
            showToast(t('gameSettingsModal.opponentNameRequired', "Opponent name cannot be empty."), 'error');
          }
          break;
        case 'date':
          if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
            onGameDateChange(trimmedValue);
            await updateGameDetails(currentGameId, { gameDate: trimmedValue });
            success = true;
          } else {
            showToast(t('gameSettingsModal.invalidDateFormat', "Invalid date format. Use YYYY-MM-DD."), 'error');
          }
          break;
        case 'location':
          onGameLocationChange(trimmedValue);
          await updateGameDetails(currentGameId, { gameLocation: trimmedValue });
          success = true;
          break;
        case 'time':
          if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmedValue) || trimmedValue === '') {
            onGameTimeChange(trimmedValue);
            await updateGameDetails(currentGameId, { gameTime: trimmedValue });
            success = true;
          } else {
            showToast(t('gameSettingsModal.invalidTimeFormatInline', "Invalid time format. Use HH:MM (24-hour)."), 'error');
          }
          break;
        case 'duration':
          const duration = parseInt(trimmedValue, 10);
          if (!isNaN(duration) && duration > 0) {
            onPeriodDurationChange(duration);
            await updateGameDetails(currentGameId, { periodDurationMinutes: duration });
            success = true;
          } else {
            showToast(t('gameSettingsModal.invalidDurationFormat', "Period duration must be a positive number."), 'error');
          }
          break;
        case 'notes':
          onGameNotesChange(inlineEditValue); // Keep original spacing/newlines
          await updateGameDetails(currentGameId, { gameNotes: inlineEditValue });
          success = true;
          break;
      }
      if (success) {
        logger.log(`[GameSettingsModal] Inline edit for ${fieldProcessed} saved for game ${currentGameId}.`);
        setInlineEditingField(null); // Exit inline edit mode on success
        setInlineEditValue('');
      }
    } catch (err) {
      logger.error(`[GameSettingsModal] Error saving inline edit for ${fieldProcessed} (Game ID: ${currentGameId}):`, err);
      setError(t('gameSettingsModal.errors.genericInlineSaveError', "Error saving changes. Please try again."));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelInlineEdit = () => {
    setInlineEditingField(null);
    setInlineEditValue('');
  };

  // Handle KeyDown for inline edits (Enter/Escape)
  const handleInlineEditKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      // Allow Shift+Enter for newlines in textarea
      if (inlineEditingField === 'notes' && event.shiftKey) {
        return;
      } 
      event.preventDefault(); // Prevent default form submission/newline
      handleConfirmInlineEdit();
    } else if (event.key === 'Escape') {
      handleCancelInlineEdit();
    }
  };

  // --- ADDED Memoized Values (Moved Here) ---
  // Calculate these AFTER handlers are defined, potentially altering hook order slightly

  // Moved the sortedEvents calculation up to ensure hooks are called unconditionally
  const sortedEvents = useMemo(() => {
    // Use localGameEvents for display within the modal
    return [...localGameEvents].sort((a, b) => a.time - b.time);
  }, [localGameEvents]);

  // Removed: handleShowCreateSeason - unused handler (season creation moved to dedicated modal)
  // Removed: handleShowCreateTournament - unused handler (tournament creation moved to dedicated modal)
  // Removed: handleAddNewSeason - unused handler (season creation moved to dedicated modal)
  // Removed: handleAddNewTournament - unused handler (tournament creation moved to dedicated modal)

  // Handle tab changes
  const handleTabChange = (tab: 'none' | 'season' | 'tournament') => {
    setActiveTab(tab);
    if (tab === 'none') {
      appliedSeasonRef.current = null;
      appliedTournamentRef.current = null;
      onSeasonIdChange('');
      onTournamentIdChange('');
      mutateGameDetails(
        { seasonId: '', tournamentId: '' },
        { source: 'stateSync', expectedState: { seasonId: '', tournamentId: '' } }
      );
    }
    // Removed: setShowNewSeasonInput(false) - state no longer exists (season creation moved to dedicated modal)
    // Removed: setShowNewTournamentInput(false) - state no longer exists (tournament creation moved to dedicated modal)
  };

  // Removed: handleNewSeasonKeyDown - unused handler (season creation moved to dedicated modal)
  // Removed: handleNewTournamentKeyDown - unused handler (tournament creation moved to dedicated modal)

  // Add this section to handle fair play cards
  const handleFairPlayCardClick = (playerId: string | null) => {
    // If the player already has a fair play card, this will toggle it off
    // If not, it will award the card to this player (removing it from any other player)
    if (playerId) {
      const playerHasCard = availablePlayers.find(p => p.id === playerId)?.receivedFairPlayCard;
      onAwardFairPlayCard(playerHasCard ? null : playerId, timeElapsedInSeconds || 0);
    } else {
      // If playerId is null, clear the fair play card
      onAwardFairPlayCard(null, timeElapsedInSeconds || 0);
    }
  };

  // Ensure we're on the client side to avoid hydration issues
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Conditional return MUST come AFTER all hook calls
  if (!isOpen || !isClient) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 rounded-none shadow-xl flex flex-col border-0 overflow-hidden h-full w-full bg-noise-texture relative">
        {/* Background effects */}
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Fixed Header */}
          <div className="flex justify-center items-center pt-10 pb-4 backdrop-blur-sm bg-slate-900/20">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">
              {t('gameSettingsModal.title', 'Game Settings')}
            </h2>
          </div>

          {/* Fixed Section (Player Counter) */}
          <div className="px-6 pt-1 pb-4 backdrop-blur-sm bg-slate-900/20">
            {/* Player Counter */}
            <div className="mb-5 text-center text-sm">
              <div className="flex justify-center items-center text-slate-300">
                <span>
                  <span className="text-yellow-400 font-semibold">{selectedPlayerIds.length}</span>
                  {" / "}
                  <span className="text-yellow-400 font-semibold">{availablePlayers.length}</span>
                  {" "}{t('gameSettingsModal.playersSelected', 'selected')}
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">

            {/* CARD 1: Teams & Roster */}
            <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner transition-all -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-3">
                {t('gameSettingsModal.teamsAndRosterLabel', 'Teams & Roster')}
              </h3>

              {/* Team Selection */}
              <div className="mb-4">
                <label htmlFor="teamSelectGameSettings" className="block text-sm font-medium text-slate-300 mb-1">
                  {t('gameSettingsModal.selectTeamLabel', 'Select Team')}
                </label>
                <select
                  id="teamSelectGameSettings"
                  value={selectedTeamId || ''}
                  onChange={(e) => handleTeamSelection(e.target.value || null)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                >
                  <option value="">
                    {t('gameSettingsModal.noTeamMasterRoster', 'No Team (Use Master Roster)')}
                  </option>
                  {teams.filter(team => !team.archived).map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                {selectedTeamId && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t('gameSettingsModal.teamSelectedNote', 'Player roster loaded from selected team.')}
                  </p>
                )}
                {!selectedTeamId && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t('gameSettingsModal.masterRosterNote', 'Using master roster - all players available.')}
                  </p>
                )}
              </div>

              {/* Team and Opponent Names */}
              <div className="mb-4">
                <TeamOpponentInputs
                  teamName={teamName}
                  opponentName={opponentName}
                  onTeamNameChange={(value) => {
                    onTeamNameChange(value);
                    const trimmed = value.trim();
                    if (trimmed) {
                      mutateGameDetails(
                        { teamName: trimmed },
                        { source: 'stateSync', expectedState: { teamName: trimmed } }
                      );
                    }
                  }}
                  onOpponentNameChange={(value) => {
                    onOpponentNameChange(value);
                    const trimmed = value.trim();
                    if (trimmed) {
                      mutateGameDetails(
                        { opponentName: trimmed },
                        { source: 'stateSync', expectedState: { opponentName: trimmed } }
                      );
                    }
                  }}
                  teamLabel={t('gameSettingsModal.teamName', 'Your Team Name') + ' *'}
                  teamPlaceholder={t('gameSettingsModal.teamNamePlaceholder', 'Enter team name')}
                  opponentLabel={t('gameSettingsModal.opponentName', 'Opponent Name') + ' *'}
                  opponentPlaceholder={t('gameSettingsModal.opponentNamePlaceholder', 'Enter opponent name')}
                />
              </div>

              {/* Player Selection Section */}
              <PlayerSelectionSection
                availablePlayers={availablePlayers}
                selectedPlayerIds={selectedPlayerIds}
                onSelectedPlayersChange={(playerIds: string[]) => {
                  onSelectedPlayersChange(playerIds);
                  mutateGameDetails(
                    { selectedPlayerIds: playerIds },
                    { source: 'stateSync', expectedState: { selectedPlayerIds: playerIds } }
                  );
                }}
                title={t('gameSettingsModal.selectPlayers', 'Select Players')}
                playersSelectedText={t('gameSettingsModal.playersSelected', 'selected')}
                selectAllText={t('gameSettingsModal.selectAll', 'Select All')}
                noPlayersText={t('gameSettingsModal.noPlayersInRoster', 'No players in roster. Add players in Roster Settings.')}
                disabled={isProcessing}
              />

              {/* Personnel Selection Section */}
              <PersonnelSelectionSection
                availablePersonnel={availablePersonnel}
                selectedPersonnelIds={selectedPersonnelIds}
                onSelectedPersonnelChange={(personnelIds: string[]) => {
                  onSelectedPersonnelChange(personnelIds);
                  mutateGameDetails(
                    { gamePersonnel: personnelIds },
                    { source: 'stateSync', expectedState: { gamePersonnel: personnelIds } }
                  );
                }}
                title={t('gameSettingsModal.selectPersonnel', 'Select Personnel')}
              />

              {/* Fair Play Card Section */}
              <div className="space-y-4 bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-4 rounded-lg shadow-inner transition-all">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">
                  {t('gameSettingsModal.fairPlayCardTitle', 'Fair Play Card')}
                </h3>
                <div className="space-y-3">
                  <p className="text-slate-300 text-sm">
                    {t('gameSettingsModal.fairPlayCardDescription', 'Select a player to award the Fair Play Card, or clear the current selection.')}
                  </p>

                  <div className="flex items-center gap-3">
                    <select
                      value={availablePlayers.find(p => p.receivedFairPlayCard)?.id || ''}
                      onChange={(e) => handleFairPlayCardClick(e.target.value || null)}
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                    >
                      <option value="">{t('gameSettingsModal.selectPlayerForFairPlay', '-- Select Player --')}</option>
                      {availablePlayers.filter(p => selectedPlayerIds.includes(p.id)).map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                          {player.receivedFairPlayCard ? ` (${t('gameSettingsModal.currentFairPlayHolder', 'Current')})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 2: Game Details */}
            <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner transition-all -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">
                {t('gameSettingsModal.gameDetailsLabel', 'Game Details')}
              </h3>

              {/* Game Type Tabs */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('gameSettingsModal.gameTypeLabel', 'Game Type')}
                </label>
                <div className="flex gap-2">
                <button
                  onClick={() => handleTabChange('none')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'none'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {t('gameSettingsModal.eiMitaan', 'None')}
                </button>
                <button
                  onClick={() => handleTabChange('season')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'season'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {t('gameSettingsModal.kausi', 'Season')}
                </button>
                <button
                  onClick={() => handleTabChange('tournament')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'tournament'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {t('gameSettingsModal.turnaus', 'Tournament')}
                </button>
                </div>
              </div>

              {/* Season Selection */}
              {activeTab === 'season' && (
                <div className="mb-4">
                  <select
                    id="seasonSelect"
                    value={seasonId || ''}
                    onChange={handleSeasonChange}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                  >
                    <option value="">{t('gameSettingsModal.selectSeason', '-- Select Season --')}</option>
                    {seasons.filter(season => !season.archived).map((season) => (
                      <option key={season.id} value={season.id}>
                        {season.name}
                      </option>
                    ))}
                  </select>

                  {/* League Selection - shows when season is selected */}
                  {seasonId && (
                    <div className="mt-3">
                      <label htmlFor="leagueSelectGameSettings" className="block text-sm font-medium text-slate-300 mb-1">
                        {t('seasonDetailsModal.leagueLabel', 'League')}
                      </label>
                      <select
                        id="leagueSelectGameSettings"
                        value={leagueId}
                        onChange={(e) => {
                          const value = e.target.value;
                          onLeagueIdChange(value || undefined);
                          if (value !== CUSTOM_LEAGUE_ID) {
                            onCustomLeagueNameChange(undefined);
                          }
                          mutateGameDetails(
                            { leagueId: value || undefined, customLeagueName: value === CUSTOM_LEAGUE_ID ? customLeagueName || undefined : undefined },
                            { source: 'stateSync' }
                          );
                        }}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                      >
                        <option value="">{t('seasonDetailsModal.selectLeague', '-- Select League --')}</option>
                        {FINNISH_YOUTH_LEAGUES.map(league => (
                          <option key={league.id} value={league.id}>{league.name}</option>
                        ))}
                      </select>
                      {/* Custom League Name - shown when "Muu" selected */}
                      {leagueId === CUSTOM_LEAGUE_ID && (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={customLeagueName}
                            onChange={(e) => {
                              const value = e.target.value;
                              onCustomLeagueNameChange(value || undefined);
                              mutateGameDetails(
                                { customLeagueName: value || undefined },
                                { source: 'stateSync' }
                              );
                            }}
                            placeholder={t('seasonDetailsModal.customLeaguePlaceholder', 'Enter league name')}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tournament Selection */}
              {activeTab === 'tournament' && (
                <div className="mb-4">
                  <select
                    id="tournamentSelect"
                    value={tournamentId || ''}
                    onChange={handleTournamentChange}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                  >
                    <option value="">{t('gameSettingsModal.selectTournament', '-- Select Tournament --')}</option>
                    {tournaments.filter(tournament => !tournament.archived).map((tournament) => (
                      <option key={tournament.id} value={tournament.id}>
                        {tournament.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Age Group */}
              <div className="mb-4">
                <label htmlFor="ageGroupSelect" className="block text-sm font-medium text-slate-300 mb-1">
                  {t('gameSettingsModal.ageGroupLabel', 'Age Group (Optional)')}
                </label>
                <select
                  id="ageGroupSelect"
                  value={ageGroup}
                  onChange={(e) => {
                    const value = e.target.value;
                    onAgeGroupChange(value);
                    mutateGameDetails(
                      { ageGroup: value },
                      { source: 'stateSync', expectedState: { ageGroup: value } }
                    );
                  }}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                >
                  <option value="">{t('common.none', 'None')}</option>
                  {AGE_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                {/* Game Date */}
                <div className="mb-6">
                  <label htmlFor="gameDateInput" className="block text-sm font-medium text-slate-300 mb-2">
                    {t('gameSettingsModal.gameDateLabel', 'Game Date')}
                  </label>
                  <input
                    type="date"
                    id="gameDateInput"
                    name="gameDate"
                    value={gameDate}
                    onChange={(e) => {
                      const value = e.target.value;
                      onGameDateChange(value);
                      mutateGameDetails(
                        { gameDate: value },
                        { source: 'stateSync', expectedState: { gameDate: value } }
                      );
                    }}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                    autoComplete="off"
                  />
                </div>

                {/* Game Time */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    {t('gameSettingsModal.gameTimeLabel', 'Time (Optional)')}
                  </label>
                  <div className="flex items-center space-x-3 max-w-xs">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      value={gameHour}
                      onChange={handleHourChange}
                      placeholder={t('gameSettingsModal.hourPlaceholder', 'HH')}
                      className="w-1/2 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm text-center"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      onFocus={(e) => e.target.select()}
                    />
                    <span className="text-slate-400 font-mono">:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      value={gameMinute}
                      onChange={handleMinuteChange}
                      placeholder={t('gameSettingsModal.minutePlaceholder', 'MM')}
                      className="w-1/2 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm text-center"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                </div>

                {/* Game Location */}
                <div className="mb-4">
                  <label htmlFor="gameLocationInput" className="block text-sm font-medium text-slate-300 mb-1">
                    {t('gameSettingsModal.locationLabel', 'Location (Optional)')}
                  </label>
                  <input
                    type="text"
                    id="gameLocationInput"
                    name="gameLocation"
                    value={gameLocation}
                    onChange={(e) => {
                        const value = e.target.value;
                        onGameLocationChange(value);
                        mutateGameDetails(
                          { gameLocation: value },
                          { source: 'stateSync', expectedState: { gameLocation: value } }
                        );
                    }}
                    placeholder={t('gameSettingsModal.locationPlaceholder', 'e.g., Central Park Field 2')}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="words"
                    spellCheck="true"
                  />
                </div>

                {tournamentId && (
                  <div className="mb-4">
                    <label htmlFor="levelInput" className="block text-sm font-medium text-slate-300 mb-1">
                      {t('gameSettingsModal.levelLabel', 'Level')}
                    </label>
                    <select
                      id="levelInput"
                      value={tournamentLevel}
                      onChange={(e) => {
                          const value = e.target.value;
                          onTournamentLevelChange(value);
                          mutateGameDetails(
                            { tournamentLevel: value },
                            { source: 'stateSync', expectedState: { tournamentLevel: value } }
                          );
                      }}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                    >
                      <option value="">{t('common.none', 'None')}</option>
                      {availableLevels.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {t(`common.level${lvl}` as TranslationKey, lvl)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Home/Away Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {t('gameSettingsModal.homeOrAwayLabel', 'Home / Away')}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                          onSetHomeOrAway('home');
                          mutateGameDetails(
                            { homeOrAway: 'home' },
                            { source: 'stateSync', expectedState: { homeOrAway: 'home' } }
                          );
                      }}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors w-full ${
                        homeOrAway === 'home'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {t('gameSettingsModal.home', 'Home')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                          onSetHomeOrAway('away');
                          mutateGameDetails(
                            { homeOrAway: 'away' },
                            { source: 'stateSync', expectedState: { homeOrAway: 'away' } }
                          );
                      }}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors w-full ${
                        homeOrAway === 'away'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {t('gameSettingsModal.away', 'Away')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 3: Pelin asetukset (Game Configuration) */}
            <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner transition-all -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-3">
                {t('gameSettingsModal.gameConfigLabel', 'Pelin asetukset')}
              </h3>

              {/* Number of Periods */}
              <div className="mb-4">
                <label htmlFor="numPeriodsSelect" className="block text-sm font-medium text-slate-300 mb-1">
                  {t('gameSettingsModal.numPeriodsLabel', 'Number of Periods')}
                </label>
                <select
                  id="numPeriodsSelect"
                  value={numPeriods}
                  onChange={(e) => {
                    const periods = parseInt(e.target.value) as 1 | 2;
                      logger.log('[GameSettingsModal] Changing numberOfPeriods to:', periods);
                      onNumPeriodsChange(periods);
                      mutateGameDetails(
                        { numberOfPeriods: periods },
                        { source: 'stateSync', expectedState: { numberOfPeriods: periods } }
                      );
                  }}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>

              {/* Period Duration */}
              <div className="mb-4">
                <label htmlFor="periodDurationInput" className="block text-sm font-medium text-slate-300 mb-1">
                  {t('gameSettingsModal.periodDurationLabel', 'Period Duration (minutes)')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  id="periodDurationInput"
                  value={periodDurationMinutes}
                  onChange={(e) => {
                    const value = e.target.value;
                    const numericValue = value.replace(/[^0-9]/g, '');
                    // Allow reasonable period durations (1-999 minutes)
                    const duration = parseInt(numericValue, 10);
                    if (numericValue === '' || (duration >= 1 && duration <= 999)) {
                      const finalDuration = numericValue === '' ? 1 : duration;
                      onPeriodDurationChange(finalDuration);
                      mutateGameDetails(
                        { periodDurationMinutes: finalDuration },
                        { source: 'stateSync', expectedState: { periodDurationMinutes: finalDuration } }
                      );
                    }
                  }}
                  className="w-full max-w-xs px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  placeholder="15"
                />
              </div>

              {/* Demand Factor Slider */}
              <div className="mb-4">
                <AssessmentSlider
                  label={t('gameSettingsModal.demandFactorLabel', 'Game Demand Level')}
                  value={demandFactor}
                  onChange={(v) => {
                    onDemandFactorChange(v);
                    mutateGameDetails(
                      { demandFactor: v },
                      { source: 'stateSync', expectedState: { demandFactor: v } }
                    );
                  }}
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  reverseColor
                />
              </div>

              {/* Not Played Yet Checkbox */}
              <div className="mb-4">
                <label className="inline-flex items-center text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={!isPlayed}
                    onChange={(e) => {
                      const newValue = !e.target.checked;
                      onIsPlayedChange(newValue);
                      mutateGameDetails(
                        { isPlayed: newValue },
                        { source: 'stateSync', expectedIsPlayed: newValue }
                      );
                    }}
                    className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-700 border-slate-500 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
                  />
                  <span className="ml-2">{t('gameSettingsModal.unplayedToggle', 'Not played yet')}</span>
                </label>
              </div>
            </div>

            {/* Game Events Section */}
            <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">
                {t('gameSettingsModal.eventLogTitle', 'Event Log')}
              </h3>
              <div className="space-y-2">
                {sortedEvents.map(event => (
                  <div
                    key={event.id}
                    className={`p-3 rounded-md transition-all ${
                      editingGoalId === event.id
                        ? 'bg-slate-700/75 border border-indigo-500'
                        : 'bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40'
                    }`}
                  >
                    {editingGoalId === event.id ? (
                      <div className="space-y-3">
                        <input
                          ref={goalTimeInputRef}
                          type="text"
                          inputMode="numeric"
                          value={editGoalTime}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Allow digits, colon, and reasonable time format
                            const filteredValue = value.replace(/[^0-9:]/g, '');
                            // Limit to reasonable length for MM:SS format
                            if (filteredValue.length <= 5) {
                              setEditGoalTime(filteredValue);
                            }
                          }}
                          placeholder={t('gameSettingsModal.timeFormatPlaceholder', 'MM:SS')}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                          maxLength={5}
                          onFocus={(e) => e.target.select()}
                        />
                        {event.type === 'goal' && (
                          <>
                            <select
                              value={editGoalScorerId}
                              onChange={(e) => setEditGoalScorerId(e.target.value)}
                              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm appearance-none"
                            >
                              <option value="">{t('gameSettingsModal.selectScorer', 'Select Scorer...')}</option>
                              {availablePlayers.map(player => (
                                <option key={player.id} value={player.id}>{player.name}</option>
                              ))}
                            </select>
                            <select
                              value={editGoalAssisterId}
                              onChange={(e) => setEditGoalAssisterId(e.target.value || undefined)}
                              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm appearance-none"
                            >
                              <option value="">{t('gameSettingsModal.selectAssister', 'Select Assister (Optional)...')}</option>
                              {availablePlayers.map(player => (
                                <option key={player.id} value={player.id}>{player.name}</option>
                              ))}
                            </select>
                          </>
                        )}
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={handleCancelEditGoal}
                            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800"
                            disabled={isProcessing}
                          >
                            {t('common.cancel', 'Cancel')}
                          </button>
                          <button
                            onClick={() => handleSaveGoal(event.id)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800"
                            disabled={isProcessing}
                          >
                            {t('common.save', 'Save')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="text-slate-300">{formatTime(event.time)}</span>
                          <span className="text-slate-100">
                            {getEventDescription(event, availablePlayers, t)}
                          </span>
                        </div>
                        <div className="relative" ref={eventActionsMenuId === event.id ? actionsMenuRef : null}>
                          <button
                            onClick={() => setEventActionsMenuId(eventActionsMenuId === event.id ? null : event.id)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-600 transition-colors"
                            aria-label={t('gameSettingsModal.eventActions', 'Event actions')}
                            disabled={isProcessing}
                          >
                            <HiOutlineEllipsisVertical className="w-5 h-5" />
                          </button>

                          {eventActionsMenuId === event.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50">
                              <button
                                onClick={() => { setEventActionsMenuId(null); handleEditGoal(event); }}
                                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 first:rounded-t-md transition-colors"
                                disabled={isProcessing}
                              >
                                <HiOutlinePencil className="w-4 h-4" />
                                {t('common.edit', 'Edit')}
                              </button>
                              <button
                                onClick={() => { setEventActionsMenuId(null); handleDeleteGoal(event.id); }}
                                className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600/20 flex items-center gap-2 last:rounded-b-md transition-colors"
                                disabled={isProcessing}
                              >
                                <HiOutlineTrash className="w-4 h-4" />
                                {t('common.delete', 'Delete')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {sortedEvents.length === 0 && (
                  <div className="text-slate-400 text-center py-4">
                    {t('gameSettingsModal.noGoalsLogged', 'No goals logged yet.')}
                  </div>
                )}
              </div>
            </div>

            {/* Game Notes Section */}
            <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">
                {t('gameSettingsModal.notesTitle', 'Game Notes')}
              </h3>
              {inlineEditingField === 'notes' ? (
                <div className="space-y-3">
                  <textarea
                    ref={notesTextareaRef}
                    value={inlineEditValue}
                    onChange={(e) => setInlineEditValue(e.target.value)}
                    onKeyDown={handleInlineEditKeyDown}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm h-32 resize-none"
                    placeholder={t('gameSettingsModal.notesPlaceholder', 'Write notes...')}
                    disabled={isProcessing}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleCancelInlineEdit}
                      className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800"
                      disabled={isProcessing}
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                      onClick={handleConfirmInlineEdit}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800"
                      disabled={isProcessing}
                    >
                      {t('common.save', 'Save')}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="cursor-pointer text-slate-300 hover:text-yellow-400 transition-colors min-h-[8rem] p-3 rounded-md border border-slate-700/50 bg-slate-700/50"
                  onClick={() => handleStartInlineEdit('notes')}
                >
                  {gameNotes || t('gameSettingsModal.noNotes', 'No notes yet. Click to add.')}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <ModalFooter>
            {error && (
              <div className="text-red-400 text-sm mr-auto">{error}</div>
            )}
            <button onClick={onClose} className={primaryButtonStyle}>
              {t('common.doneButton', 'Done')}
            </button>
          </ModalFooter>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteEventConfirm}
        title={t('gameSettingsModal.confirmDeleteEventTitle', 'Delete Event')}
        message={t('gameSettingsModal.confirmDeleteEvent', 'Are you sure you want to delete this event? This cannot be undone.')}
        warningMessage={t('gameSettingsModal.deleteWarning', 'This action is permanent.')}
        onConfirm={handleDeleteEventConfirmed}
        onCancel={() => {
          setShowDeleteEventConfirm(false);
          setEventToDelete(null);
        }}
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
      />
    </div>
  );
};

export default GameSettingsModal;
