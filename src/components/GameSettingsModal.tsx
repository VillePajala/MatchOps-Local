'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import logger from '@/utils/logger';
import { HiOutlineEllipsisVertical, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi2';
import { Season, Tournament, Player, Team, Personnel, GameType, Gender, AppState, UpdateGameDetailsMutationMeta, UpdateGameDetailsMutationVariables } from '@/types';
import type { GameEvent, ShootoutKick } from '@/types/game';
import ShootoutModal from './ShootoutModal';
import { getShootoutTally } from '@/utils/shootout';
import { getTeamRoster, getTeamDisplayName, getTeamBoundSeries } from '@/utils/teams';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import { updateGameDetails, updateGameEvent } from '@/utils/savedGames';
import PlayerPositionsEditor from './PlayerPositionsEditor';
import { UseMutationResult } from '@tanstack/react-query';
import { TFunction } from 'i18next';
import AssessmentSlider from './AssessmentSlider';
import PlayerSelectionSection from './PlayerSelectionSection';
import PersonnelSelectionSection from './PersonnelSelectionSection';
import TeamOpponentInputs from './TeamOpponentInputs';
import { AGE_GROUPS, LEVELS } from '@/config/gameOptions';
import {
  FINNISH_YOUTH_LEAGUES,
  CUSTOM_LEAGUE_ID,
  LEAGUE_AREA_FILTERS,
  LEAGUE_LEVEL_FILTERS,
  getLeagueById,
  type LeagueAreaFilter,
  type LeagueLevelFilter,
} from '@/config/leagues';
import type { TranslationKey } from '@/i18n-types';
import ConfirmationModal from './ConfirmationModal';
import { CollapsibleModalHeader, secondaryButtonStyle } from '@/styles/modalStyles';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * Defer prefill mutations to prevent race conditions on mobile devices.
 * Uses double requestAnimationFrame to ensure:
 * - React state updates have flushed
 * - Game creation has completed before mutation
 * - No arbitrary timeout delays
 */
const deferToNextFrame = (callback: () => void): number => {
  return requestAnimationFrame(() => {
    // Double RAF to ensure React state updates have flushed
    requestAnimationFrame(callback);
  });
};

// Use shared types from @/types
export type { GameEvent, GameEventType } from '@/types/game';
type MutationMetaBase = Omit<UpdateGameDetailsMutationMeta, 'sequence'>;

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
  playerPositions?: Record<string, string[]>;
  ageGroup?: string;
  tournamentLevel?: string;
  tournamentSeriesId?: string;
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
  /**
   * Roster bridge (3.2): write a new player to the CLUB roster from the
   * game's picker. On success the modal selects them into the game too -
   * the added player lands in the club roster AND the game selection.
   */
  onAddPlayerToRoster?: (name: string, nickname?: string) => Promise<Player | null>;
  /** R3: open scrolled to a wrap-up section (set by the stats wrap-up card). */
  initialScrollSection?: 'roster' | 'report' | 'positions' | 'competition';
  /** Whether this game was created from a plan and can still be re-applied (unplayed). */
  canReapplyPlan?: boolean;
  /** Re-apply the source plan to this game (overwrites the lineup + planned subs). */
  onReapplyPlan?: () => void | Promise<void>;
  onSelectedPersonnelChange: (personnelIds: string[]) => void;
  // --- Handlers for updating game data ---
  onTeamNameChange: (name: string) => void;
  onOpponentNameChange: (name: string) => void;
  onGameDateChange: (date: string) => void;
  onGameLocationChange: (location: string) => void;
  onGameTimeChange: (time: string) => void;
  onGameNotesChange: (notes: string) => void;
  onPlayerPositionsChange?: (positions: Record<string, string[]>) => void;
  onAgeGroupChange: (age: string) => void;
  onTournamentLevelChange: (level: string) => void;
  onTournamentSeriesIdChange: (seriesId: string | undefined) => void;
  onUpdateGameEvent: (updatedEvent: GameEvent) => void;
  onDeleteGameEvent?: (goalId: string) => Promise<boolean>;
  onAwardFairPlayCard: (playerId: string | null) => void;
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
  wentToOvertime?: boolean;
  wentToPenalties?: boolean;
  onWentToOvertimeChange: (value: boolean) => void;
  onWentToPenaltiesChange: (value: boolean) => void;
  shootoutKicks?: ShootoutKick[];
  onShootoutKicksChange: (kicks: ShootoutKick[]) => void;
  gameType?: GameType;
  onGameTypeChange: (gameType: GameType) => void;
  gender?: Gender;
  onGenderChange: (gender: Gender | undefined) => void;
  // Removed: addSeasonMutation - unused prop (season creation moved to dedicated modal)
  // Removed: addTournamentMutation - unused prop (tournament creation moved to dedicated modal)
  // Removed: isAddingSeason - unused prop, mutations handle loading state internally
  // Removed: isAddingTournament - unused prop, mutations handle loading state internally
  // Add current time for fair play card
  timeElapsedInSeconds?: number;
  updateGameDetailsMutation: UseMutationResult<AppState | null, Error, UpdateGameDetailsMutationVariables, unknown>;
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
  const seconds = Math.floor(timeInSeconds % 60);
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
  playerPositions = {},
  ageGroup = '',
  tournamentLevel = '',
  tournamentSeriesId,
  onTeamNameChange,
  onOpponentNameChange,
  onGameDateChange,
  onGameLocationChange,
  onGameTimeChange,
  onGameNotesChange,
  onPlayerPositionsChange,
  onAgeGroupChange,
  onTournamentLevelChange,
  onTournamentSeriesIdChange,
  onUpdateGameEvent,
  onDeleteGameEvent,
  onAwardFairPlayCard,
  gameEvents,
  availablePlayers,
  availablePersonnel,
  selectedPlayerIds,
  selectedPersonnelIds,
  onSelectedPlayersChange,
  onAddPlayerToRoster,
  initialScrollSection,
  canReapplyPlan = false,
  onReapplyPlan,
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
  wentToOvertime = false,
  wentToPenalties = false,
  onWentToOvertimeChange,
  onWentToPenaltiesChange,
  shootoutKicks,
  onShootoutKicksChange,
  gameType = 'soccer',
  onGameTypeChange,
  gender,
  onGenderChange,
  // Removed: addSeasonMutation - unused prop (season creation moved to dedicated modal)
  // Removed: addTournamentMutation - unused prop (tournament creation moved to dedicated modal)
  // Removed: isAddingSeason - unused prop, mutations handle loading state internally
  // Removed: isAddingTournament - unused prop, mutations handle loading state internally
  timeElapsedInSeconds: _timeElapsedInSeconds,
  updateGameDetailsMutation,
  seasons,
  tournaments,
  // masterRoster removed - was only used in sync useEffect which is now removed
  teams,
  onTeamIdChange,
}) => {
  // logger.log('[GameSettingsModal Render] Props received:', { seasonId, tournamentId, currentGameId });
  const { t } = useTranslation();

  // R3: land scrolled to the wrap-up section the coach tapped.
  useEffect(() => {
    if (!isOpen || !initialScrollSection) return;
    // Query INSIDE the frame callback: the section anchors may not exist on
    // the first commit (async-gated sections lay out a frame later).
    const frame = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-wrapup-section="${initialScrollSection}"]`);
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, initialScrollSection]);



  // Memoize valid series from selected tournament (filter by valid levels)
  const validSeries = useMemo(() => {
    if (!tournamentId) return [];
    const selectedTournament = tournaments.find(tour => tour.id === tournamentId);
    return selectedTournament?.series?.filter(s => LEVELS.includes(s.level)) || [];
  }, [tournamentId, tournaments]);

  const hasSeries = validSeries.length > 0;

  // Validate current series selection exists in tournament
  // Never auto-default to a series - old games must manually set series
  const effectiveSeriesId = useMemo(() => {
    if (!tournamentSeriesId) return null;
    // Only return the seriesId if it exists in the tournament's series
    return validSeries.some(s => s.id === tournamentSeriesId)
      ? tournamentSeriesId
      : null;
  }, [tournamentSeriesId, validSeries]);

  // Fallback to LEVELS for tournaments without series
  const availableLevels = useMemo(() => {
    if (hasSeries) return validSeries.map(s => s.level);
    return LEVELS;
  }, [hasSeries, validSeries]);

  // Sort seasons by startDate (newest first), then by name for consistent dropdown order
  const sortedSeasons = useMemo(() => {
    return [...seasons]
      .filter(s => !s.archived)
      .sort((a, b) => {
        // Sort by startDate descending (newest first), nulls last
        if (a.startDate && b.startDate) {
          const dateCompare = b.startDate.localeCompare(a.startDate);
          if (dateCompare !== 0) return dateCompare;
        } else if (a.startDate) {
          return -1;
        } else if (b.startDate) {
          return 1;
        }
        // Secondary sort by name
        return a.name.localeCompare(b.name);
      });
  }, [seasons]);

  // Sort tournaments by startDate (newest first), then by name for consistent dropdown order
  const sortedTournaments = useMemo(() => {
    return [...tournaments]
      .filter(t => !t.archived)
      .sort((a, b) => {
        // Sort by startDate descending (newest first), nulls last
        if (a.startDate && b.startDate) {
          const dateCompare = b.startDate.localeCompare(a.startDate);
          if (dateCompare !== 0) return dateCompare;
        } else if (a.startDate) {
          return -1;
        } else if (b.startDate) {
          return 1;
        }
        // Secondary sort by name
        return a.name.localeCompare(b.name);
      });
  }, [tournaments]);

  // Track if we've already applied season/tournament updates to prevent infinite loops.
  // Initialize with current prop values so prefill doesn't re-run for already-assigned
  // seasons/tournaments when opening game settings for existing games.
  const appliedSeasonRef = useRef<string | null>(seasonId || null);
  const appliedTournamentRef = useRef<string | null>(tournamentId || null);
  const pendingSeasonPrefillRef = useRef<string | null>(null);
  const pendingTournamentPrefillRef = useRef<string | null>(null);
  // Track if component is mounted to prevent setState on unmounted component
  const isMountedRef = useRef<boolean>(true);
  const mutationSequenceRef = useRef<number>(0);

  // Sync applied refs when the game changes (component stays mounted across game switches).
  // Without this, refs keep stale values from the previous game, causing prefill to
  // re-run and overwrite manually-set dates/settings when opening settings for a different game.
  const prevGameIdRef = useRef<string | null>(currentGameId);
  useEffect(() => {
    if (currentGameId !== prevGameIdRef.current) {
      prevGameIdRef.current = currentGameId;
      appliedSeasonRef.current = seasonId || null;
      appliedTournamentRef.current = tournamentId || null;
      pendingSeasonPrefillRef.current = null;
      pendingTournamentPrefillRef.current = null;
    }
  }, [currentGameId, seasonId, tournamentId]);

  // Track mount state to prevent race conditions with deferred mutations
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

  // Clear error state when modal opens
  // Set league filters when modal opens based on current leagueId
  useEffect(() => {
    if (isOpen) {
      setError(null);
      // Set filters based on the leagueId prop (if present) to ensure the league is visible
      if (leagueId) {
        const league = getLeagueById(leagueId);
        if (league) {
          // Auto-set filters to match the league being displayed.
          // Falls back to 'all' for custom/other leagues without area/level metadata.
          setLeagueLevelFilter(league.level || 'all');
          setLeagueAreaFilter(league.area || 'all');
        }
      } else if (!seasonId) {
        // No league and no season - reset to 'all'
        setLeagueAreaFilter('all');
        setLeagueLevelFilter('all');
      }
      // If there's a seasonId but no leagueId, let the season prefill effect handle filters
    }
  }, [isOpen, seasonId, leagueId]);

  // State for event editing within the modal
  const [localGameEvents, setLocalGameEvents] = useState<GameEvent[]>(gameEvents || []);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [isShootoutModalOpen, setIsShootoutModalOpen] = useState(false);
  const [editGoalTime, setEditGoalTime] = useState<string>('');
  const [editGoalScorerId, setEditGoalScorerId] = useState<string>('');
  const [editGoalAssisterId, setEditGoalAssisterId] = useState<string | undefined>(undefined);
  const [goalTimeError, setGoalTimeError] = useState<string | null>(null);
  const goalTimeInputRef = useRef<HTMLInputElement>(null);

  // Local string buffer for the period-duration input. Editing is kept local
  // while typing so intermediate values (e.g. "1" then "12" then "125" when
  // changing 15→25) are never persisted/synced — we commit a clamped value on
  // blur only. Synced from the prop so external changes still reflect here.
  const [periodDurationInput, setPeriodDurationInput] = useState<string>(String(periodDurationMinutes));
  useEffect(() => {
    setPeriodDurationInput(String(periodDurationMinutes));
  }, [periodDurationMinutes]);

  // State for inline editing UI control
  const [inlineEditingField, setInlineEditingField] = useState<
    'team' | 'opponent' | 'date' | 'location' | 'time' | 'duration' | 'notes' | null
  >(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');
  const [inlineEditError, setInlineEditError] = useState<string | null>(null);
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
  // Re-apply-plan confirmation (overwrites the current lineup from the source plan)
  const [showReapplyConfirm, setShowReapplyConfirm] = useState(false);
  const [isReapplying, setIsReapplying] = useState(false);
  const [eventActionsMenuId, setEventActionsMenuId] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [menuPositions, setMenuPositions] = useState<Record<string, boolean>>({});
  const { calculatePosition } = useDropdownPosition();

  // Ensure we're on the client side to avoid hydration issues
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Modal ref for focus trapping (WCAG 2.1 AA requirement)
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen && isClient);

  // Modal-level Escape key handler (guarded against child state)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inlineEditingField === null && !showDeleteEventConfirm && editingGoalId === null && !isShootoutModalOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, inlineEditingField, showDeleteEventConfirm, editingGoalId, isShootoutModalOpen]);

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

  const handleActionsMenuToggle = (e: React.MouseEvent<HTMLButtonElement>, eventId: string) => {
    const shouldOpenUpward = calculatePosition(e.currentTarget);
    setMenuPositions(prev => ({ ...prev, [eventId]: shouldOpenUpward }));
    setEventActionsMenuId(eventActionsMenuId === eventId ? null : eventId);
  };

  // State for game time
  const [gameHour, setGameHour] = useState<string>('');
  const [gameMinute, setGameMinute] = useState<string>('');

  // State for team selection
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(teamId || null);
  const teamSelectionRequestRef = useRef<number>(0); // Track current team selection request for race condition protection

  // League filter state (UI helpers only - not saved)
  const [leagueAreaFilter, setLeagueAreaFilter] = useState<LeagueAreaFilter>('all');
  const [leagueLevelFilter, setLeagueLevelFilter] = useState<LeagueLevelFilter>('all');

  // Filtered leagues based on area and level selection
  const filteredLeagues = useMemo(() => {
    return FINNISH_YOUTH_LEAGUES.filter(league => {
      // Always include custom option
      if (league.isCustom) return true;
      // Filter by level
      if (leagueLevelFilter !== 'all' && league.level !== leagueLevelFilter) return false;
      // Filter by area - only applies to leagues that HAVE an area (regional/local)
      // National/Other leagues have no area and should pass area filter
      if (leagueAreaFilter !== 'all' && league.area) {
        return league.area === leagueAreaFilter;
      }
      return true;
    });
  }, [leagueAreaFilter, leagueLevelFilter]);

  // Sync selectedTeamId with teamId prop when modal opens or teamId changes
  useEffect(() => {
    if (isOpen) {
      setSelectedTeamId(teamId || null);
    }
  }, [isOpen, teamId]);


  // Tracks the most recent value we ourselves committed up to the parent.
  // Used by the resync effect below to ignore the prop change that comes
  // back through onGameTimeChange / mutateGameDetails — without this guard
  // the parent's padded "HH:MM" was being written back into local state
  // mid-edit, which clobbered the user's raw digits and silently dropped
  // the second character of two-digit values (e.g. typing 30 → 03).
  const lastCommittedTimeRef = useRef<string | null>(null);

  // Initialize / resync game time state from prop. Only takes effect for
  // EXTERNAL changes (load a different game, undo/redo). Our own commits
  // are skipped via lastCommittedTimeRef so they don't round-trip back
  // and overwrite local state mid-edit.
  useEffect(() => {
    if (lastCommittedTimeRef.current !== null && lastCommittedTimeRef.current === gameTime) {
      lastCommittedTimeRef.current = null;
      return;
    }
    if (gameTime && typeof gameTime === 'string') {
      const [hour, minute] = gameTime.split(':');
      setGameHour(hour || '');
      setGameMinute(minute || '');
    } else {
      setGameHour('');
      setGameMinute('');
    }
  }, [gameTime]);

  // Push hour + minute up to the parent. Called on blur of either field
  // (not on every keystroke), so the user's raw digits remain in the local
  // state until they're done editing — no padding round-trip mid-typing,
  // and clearing one field never wipes the other.
  const commitGameTime = () => {
    const hasHour = gameHour !== '';
    const hasMinute = gameMinute !== '';

    let timeValue: string;
    if (!hasHour && !hasMinute) {
      timeValue = '';
    } else if (hasHour && hasMinute) {
      const formattedHour = gameHour.padStart(2, '0');
      const formattedMinute = gameMinute.padStart(2, '0');
      timeValue = `${formattedHour}:${formattedMinute}`;
    } else {
      // Partial state (only one of hour/minute filled). Don't push to the
      // parent — wait for the user to complete or fully clear both fields.
      // Local state preserves whichever side has a value so the user can
      // come back and finish.
      return;
    }

    if (timeValue === gameTime) return; // no-op write
    lastCommittedTimeRef.current = timeValue;
    onGameTimeChange(timeValue);
    mutateGameDetails(
      { gameTime: timeValue },
      { source: 'stateSync', expectedState: { gameTime: timeValue } }
    );
  };

  // Handle time changes — local state only; commit happens on blur.
  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numericValue = value.replace(/[^0-9]/g, '');
    if (numericValue.length <= 2) {
      const hourNum = parseInt(numericValue, 10);
      if (numericValue === '' || (hourNum >= 0 && hourNum <= 23)) {
        setGameHour(numericValue);
      }
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numericValue = value.replace(/[^0-9]/g, '');
    if (numericValue.length <= 2) {
      const minuteNum = parseInt(numericValue, 10);
      if (numericValue === '' || (minuteNum >= 0 && minuteNum <= 59)) {
        setGameMinute(numericValue);
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
      // Reset the ref only when season is cleared (not when modal closes)
      // This prevents re-applying season defaults when reopening the modal,
      // which would overwrite user's manual league selection.
      //
      // Note: If user clears season then re-selects the same season, defaults
      // WILL be re-applied. This is intentional - clearing the season breaks
      // the association, and re-selecting creates a new association that should
      // use the season's defaults. Only modal close/reopen preserves overrides.
      if (!seasonId) {
        appliedSeasonRef.current = null;
        pendingSeasonPrefillRef.current = null;
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

    if (pendingSeasonPrefillRef.current !== seasonId) {
      logger.log('[GameSettingsModal] Skipping season prefill - association was not selected in this modal session', seasonId);
      appliedSeasonRef.current = seasonId;
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
      //
      // League-Season Dependency Chain:
      // 1. Season data includes optional leagueId and customLeagueName
      // 2. When season changes, league is prefilled from season defaults
      // 3. User can override league per-game (stored in game state, not season)
      // 4. Data flow: Season → Modal handlers → useGameSessionCoordination → Reducer → IndexedDB
      // 5. Game's leagueId takes precedence over season's when loading (see LoadGameModal)
      //
      // UX Design Decision: Switching seasons overwrites any manual league override.
      // This is intentional - changing which season a game belongs to should adopt
      // that season's league default. User can re-override after switching if needed.
      //
      // Use undefined for empty values (consistent with reducer state type)
      const effectiveLeagueId = season.leagueId || undefined;
      const effectiveCustomLeagueName = effectiveLeagueId === CUSTOM_LEAGUE_ID
        ? (season.customLeagueName || undefined)
        : undefined;
      onLeagueIdChange(effectiveLeagueId);
      onCustomLeagueNameChange(effectiveCustomLeagueName);
      batchedUpdates.leagueId = effectiveLeagueId;
      batchedUpdates.customLeagueName = effectiveCustomLeagueName;
      hasUpdates = true;

      // Auto-set league filters to match the league being displayed
      // Priority: current leagueId prop (game's league) > season's league > 'all'
      // This ensures the selected league is visible in the filtered dropdown
      const displayedLeagueId = leagueId || effectiveLeagueId;
      if (displayedLeagueId) {
        const league = getLeagueById(displayedLeagueId);
        if (league) {
          // Auto-set filters to match the league being displayed.
          // Falls back to 'all' for custom/other leagues without area/level metadata.
          setLeagueLevelFilter(league.level || 'all');
          setLeagueAreaFilter(league.area || 'all');
        }
      } else {
        // No league - reset filters to 'all'
        setLeagueLevelFilter('all');
        setLeagueAreaFilter('all');
      }

      // Mark this season as applied AFTER handlers succeed to allow retry on failure
      appliedSeasonRef.current = seasonId;
      pendingSeasonPrefillRef.current = null;
    } catch (error) {
      logger.error('[GameSettingsModal] Error calling season prefill handlers:', error);
      // Don't set ref on error, allowing retry
      return;
    }

    // Apply all updates in a single mutation call to prevent mobile localStorage conflicts
    if (currentGameId && hasUpdates) {

      // Defer mutation to next frame to ensure game creation has flushed
      const rafId = deferToNextFrame(async () => {
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
          pendingSeasonPrefillRef.current = targetSeasonId;
        }
      });

      // Cleanup: Cancel RAF if effect re-runs (e.g., user changes season rapidly)
      return () => cancelAnimationFrame(rafId);
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
      // Reset the ref only when tournament is cleared (not when modal closes).
      // This prevents re-applying tournament defaults when reopening the modal,
      // which would overwrite user's manual date/settings changes.
      if (!tournamentId) {
        appliedTournamentRef.current = null;
        pendingTournamentPrefillRef.current = null;
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

    if (pendingTournamentPrefillRef.current !== tournamentId) {
      logger.log('[GameSettingsModal] Skipping tournament prefill - association was not selected in this modal session', tournamentId);
      appliedTournamentRef.current = tournamentId;
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
      pendingTournamentPrefillRef.current = null;
    } catch (error) {
      logger.error('[GameSettingsModal] Error calling tournament prefill handlers:', error);
      // Don't set ref on error, allowing retry
      return;
    }

    // Apply all updates in a single mutation call to prevent mobile localStorage conflicts
    if (currentGameId && hasUpdates) {

      // Defer mutation to next frame to ensure game creation has flushed
      const rafId = deferToNextFrame(async () => {
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
          pendingTournamentPrefillRef.current = targetTournamentId;
        }
      });

      // Cleanup: Cancel RAF if effect re-runs (e.g., user changes tournament rapidly)
      return () => cancelAnimationFrame(rafId);
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
    pendingSeasonPrefillRef.current = newSeasonId || null;
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
    pendingTournamentPrefillRef.current = newTournamentId || null;
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

  // Team selection handler with roster auto-load and bound season/tournament application
  const handleTeamSelection = async (teamId: string | null) => {
    // Increment request counter to track this request
    const requestId = ++teamSelectionRequestRef.current;

    setSelectedTeamId(teamId);
    onTeamIdChange(teamId);

    // Build updates object - start with teamId
    const updates: Partial<AppState> = { teamId: teamId || undefined };

    // Apply team's bound season/tournament if present
    if (teamId) {
      const team = teams.find(t => t.id === teamId);
      if (team?.boundSeasonId) {
        // Team is bound to a season - apply it
        updates.seasonId = team.boundSeasonId;
        updates.tournamentId = ''; // Clear tournament (mutual exclusivity)
        onSeasonIdChange(team.boundSeasonId);
        onTournamentIdChange('');
        appliedSeasonRef.current = team.boundSeasonId;
        appliedTournamentRef.current = null;
        setActiveTab('season');
      } else if (team?.boundTournamentId) {
        // Team is bound to a tournament - apply it
        updates.tournamentId = team.boundTournamentId;
        updates.seasonId = ''; // Clear season (mutual exclusivity)
        onTournamentIdChange(team.boundTournamentId);
        onSeasonIdChange('');
        appliedTournamentRef.current = team.boundTournamentId;
        appliedSeasonRef.current = null;
        setActiveTab('tournament');

        // Apply team's specific series if bound to one, otherwise clear stale series
        const series = getTeamBoundSeries(team, tournaments);
        if (series) {
          updates.tournamentSeriesId = series.id;
          updates.tournamentLevel = series.level;
          onTournamentLevelChange(series.level);
        } else {
          // Clear any stale series from previous team selection
          // This prevents orphaned series data when switching to a team without series binding
          updates.tournamentSeriesId = '';
          updates.tournamentLevel = '';
          onTournamentLevelChange('');
        }
      }
    }

    mutateGameDetails(
      updates,
      { source: 'stateSync' }
    );

    if (teamId) {
      // Only auto-select players if game has NO current selection
      // This preserves existing player selection for old games being assigned to teams
      const hasExistingSelection = selectedPlayerIds && selectedPlayerIds.length > 0;

      if (hasExistingSelection) {
        // Keep existing player selection - don't override
        logger.log('[GameSettingsModal] Team assigned but keeping existing player selection');
      } else {
        try {
          // Load team roster for new games without player selection
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
    setGoalTimeError(null);
  };

  const handleCancelEditGoal = () => {
    setEditingGoalId(null);
    setEditGoalTime('');
    setEditGoalScorerId('');
    setEditGoalAssisterId(undefined);
    setGoalTimeError(null);
  };

  // Handle saving edited goal
  const handleSaveGoal = async (goalId: string) => {
    if (!goalId || !currentGameId) {
      logger.error("[GameSettingsModal] Missing goalId or currentGameId for save.");
      setError(t('gameSettingsModal.errors.missingGoalId', 'Goal ID or Game ID is missing. Cannot save.'));
      return;
    }

    setError(null);
    setGoalTimeError(null);
    setIsProcessing(true);

    let timeInSeconds = 0;
    const timeParts = editGoalTime.split(':');
    if (timeParts.length === 2) {
      const minutes = parseInt(timeParts[0], 10);
      const seconds = parseInt(timeParts[1], 10);
      // Cap at 200 min to comfortably allow extra time + long stoppage, while still rejecting garbage.
      if (!isNaN(minutes) && !isNaN(seconds) && minutes >= 0 && minutes <= 200 && seconds >= 0 && seconds < 60) {
        timeInSeconds = minutes * 60 + seconds;
      } else {
        setGoalTimeError(t('gameSettingsModal.invalidTimeFormat', "Invalid time format. Use MM:SS"));
        setIsProcessing(false);
        return;
      }
    } else if (editGoalTime) {
        setGoalTimeError(t('gameSettingsModal.invalidTimeFormat', "Invalid time format. Use MM:SS"));
        setIsProcessing(false);
      return;
    }

    const originalEvent = localGameEvents.find(e => e.id === goalId);
    if (!originalEvent) {
        logger.error(`[GameSettingsModal] Original event not found for ID: ${goalId}`);
        setIsProcessing(false);
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
          // Revert optimistic update on failure
          setLocalGameEvents(prevEvents =>
            prevEvents.map(event => (event.id === goalId ? originalEvent : event))
          );
          onUpdateGameEvent(originalEvent);
        }
      } else {
        logger.error(`[GameSettingsModal] Event ${goalId} not found in original gameEvents prop for saving.`);
        setError(t('gameSettingsModal.errors.eventNotFound', 'Original event not found for saving.'));
        // Revert optimistic update — event not found in props for persistence
        setLocalGameEvents(prevEvents =>
          prevEvents.map(event => (event.id === goalId ? originalEvent : event))
        );
        onUpdateGameEvent(originalEvent);
      }
    } catch (err) {
      logger.error(`[GameSettingsModal] Error updating event ${goalId} in game ${currentGameId}:`, err);
      setError(t('gameSettingsModal.errors.genericSaveError', 'An unexpected error occurred while saving the event.'));
      // Revert optimistic update on error
      setLocalGameEvents(prevEvents =>
        prevEvents.map(event => (event.id === goalId ? originalEvent : event))
      );
      onUpdateGameEvent(originalEvent);
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
    setInlineEditError(null);
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
            setInlineEditError(t('gameSettingsModal.teamNameRequired', "Team name cannot be empty."));
          }
          break;
        case 'opponent':
          if (trimmedValue) {
            onOpponentNameChange(trimmedValue);
            await updateGameDetails(currentGameId, { opponentName: trimmedValue });
            success = true;
          } else {
            setInlineEditError(t('gameSettingsModal.opponentNameRequired', "Opponent name cannot be empty."));
          }
          break;
        case 'date':
          if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
            onGameDateChange(trimmedValue);
            await updateGameDetails(currentGameId, { gameDate: trimmedValue });
            success = true;
          } else {
            setInlineEditError(t('gameSettingsModal.invalidDateFormat', "Invalid date format. Use YYYY-MM-DD."));
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
            setInlineEditError(t('gameSettingsModal.invalidTimeFormatInline', "Invalid time format. Use HH:MM (24-hour)."));
          }
          break;
        case 'duration':
          const duration = parseInt(trimmedValue, 10);
          if (!isNaN(duration) && duration > 0) {
            onPeriodDurationChange(duration);
            await updateGameDetails(currentGameId, { periodDurationMinutes: duration });
            success = true;
          } else {
            setInlineEditError(t('gameSettingsModal.invalidDurationFormat', "Period duration must be a positive number."));
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
        setInlineEditError(null);
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
    setInlineEditError(null);
  };

  // Insert the report scaffold (headings) into the notes editor - appends below
  // any existing text so it's non-destructive.
  const handleInsertReportTemplate = () => {
    const template = t('gameSettingsModal.reportTemplate', '');
    setInlineEditValue(prev => (prev.trim() ? `${prev.trimEnd()}\n\n${template}` : template));
    if (inlineEditError) setInlineEditError(null);
    requestAnimationFrame(() => notesTextareaRef.current?.focus());
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
      pendingSeasonPrefillRef.current = null;
      pendingTournamentPrefillRef.current = null;
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
      onAwardFairPlayCard(playerHasCard ? null : playerId);
    } else {
      // If playerId is null, clear the fair play card
      onAwardFairPlayCard(null);
    }
  };

  // Conditional return MUST come AFTER all hook calls
  if (!isOpen || !isClient) {
    return null;
  }

  return (
    <div ref={modalRef} className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display" role="dialog" aria-modal="true" aria-label={t('gameSettingsModal.title', 'Match details')}>
      <div className="bg-slate-800 rounded-none shadow-xl flex flex-col border-0 overflow-hidden h-full w-full bg-noise-texture relative">
        {/* Background effects */}
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Chrome slimming: X-header (Done->X). The X stays locked while a
              re-apply is in flight (was the footer Done's `disabled`) so the
              async chain can't overwrite a newly-loaded game's lineup. */}
          <CollapsibleModalHeader
            title={t('gameSettingsModal.title', 'Match details')}
            onClose={onClose}
            closeLabel={t('common.doneButton', 'Done')}
            closeDisabled={isReapplying}
          />

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
                      {getTeamDisplayName(team, seasons, tournaments, { futsalLabel: t('common.futsal', 'Futsal') })}
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
              <div data-wrapup-section="roster" />
              <PlayerSelectionSection
                availablePlayers={availablePlayers}
                selectedPlayerIds={selectedPlayerIds}
                onSelectedPlayersChange={(playerIds: string[]) => {
                  onSelectedPlayersChange(playerIds);
                  mutateGameDetails(
                    { selectedPlayerIds: playerIds, gameDate },
                    { source: 'stateSync', expectedState: { selectedPlayerIds: playerIds, gameDate } }
                  );
                }}
                title={t('gameSettingsModal.selectPlayers', 'Select Players')}
                playersSelectedText={t('gameSettingsModal.playersSelected', 'selected')}
                selectAllText={t('gameSettingsModal.selectAll', 'Select All')}
                noPlayersText={t('gameSettingsModal.noPlayersInRoster', 'No players in roster. Add players in Roster Settings.')}
                disabled={isProcessing}
                onAddPlayer={
                  onAddPlayerToRoster
                    ? async (name: string, nickname?: string) => {
                        /* Roster bridge (3.2): duplicate gate first (same
                           case-insensitive rule as PlayerDetailsModal - the
                           two add-player paths must not diverge), then the
                           club write; on success select the new player into
                           THIS game through the same persist path the
                           checkboxes use. */
                        const isDuplicate = availablePlayers.some(
                          (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
                        );
                        if (isDuplicate) {
                          return t('playerDetailsModal.duplicateNameError', 'A player with this name already exists');
                        }
                        const saved = await onAddPlayerToRoster(name, nickname);
                        if (!saved) {
                          return t('gameSettingsModal.addToClubRosterFailed', 'Adding the player failed. Please try again.');
                        }
                        const nextIds = [...selectedPlayerIds, saved.id];
                        onSelectedPlayersChange(nextIds);
                        mutateGameDetails(
                          { selectedPlayerIds: nextIds, gameDate },
                          { source: 'stateSync', expectedState: { selectedPlayerIds: nextIds, gameDate } }
                        );
                        return true as const;
                      }
                    : undefined
                }
                addPlayerLabel={t('gameSettingsModal.addToClubRoster', 'Add new player')}
                addPlayerConfirmLabel={t('common.add', 'Add')}
                addPlayerPlaceholder={t('gameSettingsModal.addToClubRosterPlaceholder', 'New player name')}
                addPlayerNicknamePlaceholder={t('gameSettingsModal.addToClubRosterNickname', 'Nickname (shown on the disc)')}
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
                <span data-wrapup-section="competition" />
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
                    {sortedSeasons.map((season) => (
                      <option key={season.id} value={season.id}>
                        {getSeasonDisplayName(season)}
                      </option>
                    ))}
                  </select>

                  {/* League Selection - shows when season is selected */}
                  {seasonId && (
                    <div className="mt-3">
                      <label htmlFor="leagueSelectGameSettings" className="block text-sm font-medium text-slate-300 mb-1">
                        {t('gameSettingsModal.leagueLabel', 'League')}
                      </label>

                      {/* League Filters */}
                      <div className="flex gap-2 mb-2">
                        <div className="flex-1">
                          <label htmlFor="league-level-filter-game" className="sr-only">
                            {t('leagues.filterByLevel', 'Filter by level')}
                          </label>
                          <select
                            id="league-level-filter-game"
                            value={leagueLevelFilter}
                            onChange={(e) => {
                              // CR-M4: filters are a BROWSE control — they only narrow the
                              // visible list. Do NOT clear/persist the saved league here, or
                              // just looking around would silently wipe it. The current
                              // selection stays shown via the option rendered below.
                              setLeagueLevelFilter(e.target.value as LeagueLevelFilter);
                            }}
                            className="w-full px-2 py-1.5 bg-slate-600 border border-slate-500 rounded text-sm text-white focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            {LEAGUE_LEVEL_FILTERS.map(level => (
                              <option key={level.id} value={level.id}>
                                {t(level.labelKey as TranslationKey, level.id === 'all' ? 'All Levels' : level.id)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label htmlFor="league-area-filter-game" className="sr-only">
                            {t('leagues.filterByArea', 'Filter by area')}
                          </label>
                          <select
                            id="league-area-filter-game"
                            value={leagueAreaFilter}
                            onChange={(e) => {
                              // CR-M4: see the level filter above — browsing filters must
                              // not clear/persist the saved league.
                              setLeagueAreaFilter(e.target.value as LeagueAreaFilter);
                            }}
                            className="w-full px-2 py-1.5 bg-slate-600 border border-slate-500 rounded text-sm text-white focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            {LEAGUE_AREA_FILTERS.map(area => (
                              <option key={area.id} value={area.id}>
                                {t(area.labelKey as TranslationKey, area.id === 'all' ? 'All Areas' : area.id)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* League Dropdown */}
                      <select
                        id="leagueSelectGameSettings"
                        value={leagueId}
                        onChange={(e) => {
                          const value = e.target.value;
                          onLeagueIdChange(value || undefined);
                          // Clear custom name when switching away from "Muu" (intentional)
                          // This provides clean state and prevents stale data. If user switches
                          // back to "Muu", they'll need to re-enter the custom name.
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
                        <option value="">{t('gameSettingsModal.selectLeague', '-- Select League --')}</option>
                        {/* CR-M4: keep the saved league visible even when the current
                            filters would exclude it, so changing a filter never makes the
                            selection "disappear" (and never tempts a clear-on-filter). */}
                        {(() => {
                          const selected = leagueId && leagueId !== CUSTOM_LEAGUE_ID ? getLeagueById(leagueId) : undefined;
                          if (selected && !filteredLeagues.some(l => l.id === selected.id)) {
                            return <option key={selected.id} value={selected.id}>{selected.name}</option>;
                          }
                          return null;
                        })()}
                        {filteredLeagues.map(league => (
                          <option key={league.id} value={league.id}>{league.name}</option>
                        ))}
                      </select>

                      {/* Show count when filters active */}
                      {(leagueAreaFilter !== 'all' || leagueLevelFilter !== 'all') && (
                        <p className="mt-1 text-xs text-slate-400">
                          {t('leagues.showingCount', '{{count}} leagues', { count: filteredLeagues.filter(l => !l.isCustom).length })}
                        </p>
                      )}
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
                            placeholder={t('gameSettingsModal.customLeaguePlaceholder', 'Enter league name')}
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
                    {sortedTournaments.map((tournament) => (
                      <option key={tournament.id} value={tournament.id}>
                        {getTournamentDisplayName(tournament)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Series / Level Selection - only shown when tournament is selected */}
              {tournamentId && (
                <div className="mb-4">
                  <label htmlFor="seriesLevelInput" className="block text-sm font-medium text-slate-300 mb-1">
                    {hasSeries
                      ? t('gameSettingsModal.seriesLabel', 'Series')
                      : t('gameSettingsModal.levelLabel', 'Level')}
                  </label>
                  {hasSeries ? (
                    <select
                      id="seriesLevelInput"
                      value={effectiveSeriesId || ''}
                      onChange={(e) => {
                        const seriesId = e.target.value || undefined;
                        const series = validSeries.find(s => s.id === seriesId);
                        onTournamentSeriesIdChange(seriesId);
                        onTournamentLevelChange(series?.level || '');
                        mutateGameDetails(
                          {
                            tournamentSeriesId: seriesId || '',
                            tournamentLevel: series?.level || '',
                          },
                          { source: 'stateSync' }
                        );
                      }}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                    >
                      <option value="">{t('common.none', 'None')}</option>
                      {validSeries.map((series) => (
                        <option key={series.id} value={series.id}>
                          {t(`common.level${series.level}` as TranslationKey, series.level)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      id="seriesLevelInput"
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
                  )}
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

              {/* Sport Type (Soccer/Futsal) */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('common.gameTypeLabel', 'Sport Type')}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onGameTypeChange('soccer');
                      mutateGameDetails(
                        { gameType: 'soccer' },
                        { source: 'stateSync' }
                      );
                    }}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      gameType === 'soccer'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.gameTypeSoccer', 'Soccer')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onGameTypeChange('futsal');
                      mutateGameDetails(
                        { gameType: 'futsal' },
                        { source: 'stateSync' }
                      );
                    }}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      gameType === 'futsal'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.gameTypeFutsal', 'Futsal')}
                  </button>
                </div>
              </div>

              {/* Gender (Boys/Girls) */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('common.genderLabel', 'Gender')}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onGenderChange(undefined);
                      mutateGameDetails(
                        { gender: undefined },
                        { source: 'stateSync' }
                      );
                    }}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      gender === undefined
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.genderNotSet', 'Not Set')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onGenderChange('boys');
                      mutateGameDetails(
                        { gender: 'boys' },
                        { source: 'stateSync' }
                      );
                    }}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      gender === 'boys'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.genderBoys', 'Boys')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onGenderChange('girls');
                      mutateGameDetails(
                        { gender: 'girls' },
                        { source: 'stateSync' }
                      );
                    }}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      gender === 'girls'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.genderGirls', 'Girls')}
                  </button>
                </div>
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
                      onBlur={commitGameTime}
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
                      onBlur={commitGameTime}
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
                  value={periodDurationInput}
                  onChange={(e) => {
                    // Local-only while typing: keep digits, never persist
                    // intermediate values. Commit happens on blur.
                    setPeriodDurationInput(e.target.value.replace(/[^0-9]/g, ''));
                  }}
                  onBlur={() => {
                    const parsed = parseInt(periodDurationInput, 10);
                    // Empty/invalid reverts to the current value; otherwise clamp 1-999.
                    const finalDuration = isNaN(parsed)
                      ? periodDurationMinutes
                      : Math.min(999, Math.max(1, parsed));
                    setPeriodDurationInput(String(finalDuration));
                    if (finalDuration !== periodDurationMinutes) {
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

              {/* Played status + overtime/penalties as toggle buttons */}
              <div className="mb-4 space-y-2">
                <button
                  type="button"
                  aria-pressed={!isPlayed}
                  onClick={() => {
                    const newValue = !isPlayed;
                    onIsPlayedChange(newValue);
                    mutateGameDetails(
                      { isPlayed: newValue },
                      { source: 'stateSync', expectedIsPlayed: newValue }
                    );
                  }}
                  className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                    !isPlayed
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {t('gameSettingsModal.unplayedToggle', 'Not played yet')}
                </button>
                {/* Overtime / penalties as toggle buttons (matching the timer's chip). */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={!!wentToOvertime}
                    onClick={() => {
                      const newValue = !wentToOvertime;
                      onWentToOvertimeChange(newValue);
                      mutateGameDetails({ wentToOvertime: newValue }, { source: 'stateSync' });
                    }}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      wentToOvertime
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('gameSettingsModal.wentToOvertime', 'Overtime')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={!!wentToPenalties}
                    onClick={() => {
                      const newValue = !wentToPenalties;
                      onWentToPenaltiesChange(newValue);
                      mutateGameDetails({ wentToPenalties: newValue }, { source: 'stateSync' });
                    }}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      wentToPenalties
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('gameSettingsModal.wentToPenalties', 'Penalties')}
                  </button>
                </div>
                {/* Penalty shootout — log kicks; the result is derived and breaks a level score */}
                <button
                  type="button"
                  onClick={() => setIsShootoutModalOpen(true)}
                  className="inline-flex items-center text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {(() => {
                    const kicks = shootoutKicks ?? [];
                    if (kicks.length === 0) {
                      return t('gameSettingsModal.recordShootout', 'Record penalty shootout →');
                    }
                    const tally = getShootoutTally(kicks);
                    const yourSide = homeOrAway === 'away' ? 'away' : 'home';
                    const oppSide = yourSide === 'home' ? 'away' : 'home';
                    return `${t('gameSettingsModal.shootoutLabel', 'Shootout')}: ${tally[yourSide]}-${tally[oppSide]} ${t('gameSettingsModal.editShootout', '(edit)')}`;
                  })()}
                </button>
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
                              if (goalTimeError) setGoalTimeError(null);
                            }
                          }}
                          placeholder={t('gameSettingsModal.timeFormatPlaceholder', 'MM:SS')}
                          className={`w-full px-3 py-2 bg-slate-700 border rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm ${goalTimeError ? 'border-red-500' : 'border-slate-600'}`}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                          maxLength={5}
                          onFocus={(e) => e.target.select()}
                        />
                        {goalTimeError && <p className="mt-1 text-sm text-red-400">{goalTimeError}</p>}
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
                              value={editGoalAssisterId ?? ''}
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
                            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-sm text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 border border-slate-400/30"
                            disabled={isProcessing}
                          >
                            {t('common.cancel', 'Cancel')}
                          </button>
                          <button
                            onClick={() => handleSaveGoal(event.id)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-sm text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 border border-indigo-400/30"
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
                            onClick={(e) => handleActionsMenuToggle(e, event.id)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-600 transition-colors"
                            aria-label={t('gameSettingsModal.eventActions', 'Event actions')}
                            disabled={isProcessing}
                          >
                            <HiOutlineEllipsisVertical className="w-5 h-5" />
                          </button>

                          {eventActionsMenuId === event.id && (
                            <div className={`absolute right-0 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50 ${menuPositions[event.id] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
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
                <span data-wrapup-section="report" />
                {t('gameSettingsModal.notesTitle', 'Game Notes')}
              </h3>
              {inlineEditingField === 'notes' ? (
                <div className="space-y-3">
                  <textarea
                    ref={notesTextareaRef}
                    value={inlineEditValue}
                    onChange={(e) => { setInlineEditValue(e.target.value); if (inlineEditError) setInlineEditError(null); }}
                    onKeyDown={handleInlineEditKeyDown}
                    className={`w-full px-3 py-2 bg-slate-700 border rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm h-64 min-h-[10rem] resize-y ${inlineEditError ? 'border-red-500' : 'border-slate-600'}`}
                    placeholder={t('gameSettingsModal.notesPlaceholder', 'Write notes...')}
                    disabled={isProcessing}
                  />
                  {inlineEditError && <p className="mt-1 text-sm text-red-400">{inlineEditError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleInsertReportTemplate}
                      className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50"
                      disabled={isProcessing}
                    >
                      {t('gameSettingsModal.useTemplate', 'Template')}
                    </button>
                    <button
                      onClick={handleCancelInlineEdit}
                      className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50"
                      disabled={isProcessing}
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                      onClick={handleConfirmInlineEdit}
                      className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                      disabled={isProcessing}
                    >
                      {t('common.save', 'Save')}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="cursor-pointer whitespace-pre-wrap text-slate-300 hover:text-yellow-400 transition-colors min-h-[8rem] p-3 rounded-md border border-slate-700/50 bg-slate-700/50"
                  onClick={() => handleStartInlineEdit('notes')}
                >
                  {gameNotes || t('gameSettingsModal.noNotes', 'No notes yet. Click to add.')}
                </div>
              )}
            </div>

            {/* Line-up / Positions Section */}
            <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 mt-4">
              <h3 className="text-lg font-semibold text-slate-200 mb-1">
                <span data-wrapup-section="positions" />
                {t('gameSettingsModal.lineupTitle', 'Positions played')}
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                {t('gameSettingsModal.lineupSubtitle', 'Record where each player actually played this game.')}
              </p>
              <PlayerPositionsEditor
                players={availablePlayers.filter(p => selectedPlayerIds.includes(p.id))}
                value={playerPositions}
                gameType={gameType}
                onChange={(next) => {
                  onPlayerPositionsChange?.(next);
                  if (currentGameId) {
                    updateGameDetails(currentGameId, { playerPositions: next }).catch(err =>
                      logger.error('[GameSettingsModal] failed to persist positions', err));
                  }
                }}
              />
            </div>
            {/* Chrome slimming: Re-apply plan is a utility action, moved
                inline at the bottom of the content (Done is now the header
                X). R3 scroll anchors are id-based and unaffected. */}
            {(error || (canReapplyPlan && onReapplyPlan)) && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {error && (
                  <div className="text-red-400 text-sm mr-auto">{error}</div>
                )}
                {canReapplyPlan && onReapplyPlan && (
                  <button
                    onClick={() => setShowReapplyConfirm(true)}
                    className={secondaryButtonStyle}
                    disabled={isReapplying}
                  >
                    {t('gameSettingsModal.reapplyPlan.button', 'Re-apply plan')}
                  </button>
                )}
              </div>
            )}
          </div>
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
        isConfirming={isProcessing}
      />
      <ConfirmationModal
        isOpen={showReapplyConfirm}
        title={t('gameSettingsModal.reapplyPlan.confirmTitle', 'Re-apply plan?')}
        message={t(
          'gameSettingsModal.reapplyPlan.confirmMessage',
          "This replaces the game's lineup, player selection and planned substitutions with the current plan. The score, events and other details are kept.",
        )}
        warningMessage={t(
          'gameSettingsModal.reapplyPlan.confirmWarning',
          'Any manual changes to this lineup will be overwritten.',
        )}
        onConfirm={async () => {
          setShowReapplyConfirm(false);
          setIsReapplying(true);
          try {
            await onReapplyPlan?.();
          } finally {
            setIsReapplying(false);
          }
        }}
        onCancel={() => setShowReapplyConfirm(false)}
        confirmLabel={t('gameSettingsModal.reapplyPlan.confirmLabel', 'Re-apply')}
        variant="primary"
        isConfirming={isReapplying}
      />
      <ShootoutModal
        isOpen={isShootoutModalOpen}
        onClose={() => setIsShootoutModalOpen(false)}
        availablePlayers={availablePlayers}
        initialKicks={shootoutKicks ?? []}
        homeOrAway={homeOrAway}
        teamName={teamName}
        opponentName={opponentName}
        onSave={(kicks) => {
          onShootoutKicksChange(kicks);
          const updates: Partial<AppState> = { shootoutKicks: kicks };
          // Recording a shootout marks the game as decided by penalties, but we
          // only auto-CHECK it — we never silently uncheck the coach's flag, and
          // the result gates on this flag (see resolveGameResult), so they stay
          // in control of whether the shootout counts.
          if (kicks.length > 0 && !wentToPenalties) {
            onWentToPenaltiesChange(true);
            updates.wentToPenalties = true;
          }
          mutateGameDetails(updates, { source: 'stateSync' });
        }}
      />
    </div>
  );
};

export default GameSettingsModal;
