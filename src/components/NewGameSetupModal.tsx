'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { Player, Season, Tournament, Team, Personnel, GameType, Gender, Point } from '@/types';
import type { SavedGamesCollection } from '@/types/game';
import logger from '@/utils/logger';
import { getTeamRoster, getTeamDisplayName, getTeamBoundSeries } from '@/utils/teams';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import { getLastHomeTeamName as utilGetLastHomeTeamName, saveLastHomeTeamName as utilSaveLastHomeTeamName } from '@/utils/appSettings';
import { getPlans } from '@/utils/playtimePlanner/storage';
import { buildPrefillFromPlan } from '@/utils/playtimePlanner/prefill';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import type { PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import AssessmentSlider from './AssessmentSlider';
import PlayerSelectionSection from './PlayerSelectionSection';
import PersonnelSelectionSection from './PersonnelSelectionSection';
import TeamOpponentInputs from './TeamOpponentInputs';
import { AGE_GROUPS, LEVELS } from '@/config/gameOptions';
import { FINNISH_YOUTH_LEAGUES, CUSTOM_LEAGUE_ID } from '@/config/leagues';
import type { TranslationKey } from '@/i18n-types';
import ConfirmationModal from './ConfirmationModal';
import { CollapsibleModalHeader, useCollapsingHeader } from '@/styles/modalStyles';

interface NewGameSetupModalProps {
  isOpen: boolean;
  initialPlayerSelection: string[] | null;
  demandFactor: number;
  onDemandFactorChange: (factor: number) => void;
  onManageTeamRoster?: (teamId: string) => void; // Optional callback to open team roster management
  onStart: (
    initialSelectedPlayerIds: string[],
    homeTeamName: string,
    opponentName: string,
    gameDate: string,
    gameLocation: string,
    gameTime: string,
    seasonId: string | null,
    tournamentId: string | null,
    numPeriods: 1 | 2,
    periodDuration: number,
    homeOrAway: 'home' | 'away',
    demandFactor: number,
    ageGroup: string,
    tournamentLevel: string,
    tournamentSeriesId: string | null,
    isPlayed: boolean,
    teamId: string | null, // Add team selection parameter
    availablePlayersForGame: Player[], // Add the actual roster to use for the game
    selectedPersonnelIds: string[], // Add personnel selection parameter
    leagueId: string, // League ID for the game
    customLeagueName: string, // Custom league name when leagueId === CUSTOM_LEAGUE_ID
    gameType: GameType, // Sport type: 'soccer' or 'futsal'
    gender: Gender | undefined, // Gender: 'boys' or 'girls' (optional)
    // Optional Playing-Time Planner prefill (Phase 2): planned XI placed on the
    // field at creation + the planned sub schedule stored by game id, plus the
    // formation snap points so the game rebuilds sub-slot circles + position labels.
    // Phase 3: sourcePlanId/sourcePlanGameId link the game back to its plan so an
    // edited plan can be re-applied to games already created from it.
    prefill?: {
      playersOnField: Player[];
      plannedSubs: PlannedGameSub[];
      formationSnapPoints: Point[];
      sourcePlanId: string;
      sourcePlanGameId: string;
    }
  ) => void;
  onCancel: () => void;
  /** W1 roster bridge in game creation too: club write returning the saved
   *  player; the modal dup-checks and selects them into this setup. */
  onAddPlayerToRoster?: (name: string, nickname?: string) => Promise<import('@/types').Player | null>;
  // Fresh data from React Query
  masterRoster: Player[];
  seasons: Season[];
  tournaments: Tournament[];
  teams: Team[];
  personnel: Personnel[];
  /** All saved games, used to offer a "Repeat last game" quick-fill. */
  savedGames?: SavedGamesCollection;
}

const NewGameSetupModal: React.FC<NewGameSetupModalProps> = ({
  isOpen,
  initialPlayerSelection,
  demandFactor,
  onDemandFactorChange,
  onManageTeamRoster,
  onStart,
  onCancel,
  onAddPlayerToRoster,
  masterRoster,
  seasons,
  tournaments,
  teams,
  personnel,
  savedGames,
}) => {
  const { t } = useTranslation();
  const headerCollapse = useCollapsingHeader();
  const { showToast } = useToast();
  const [homeTeamName, setHomeTeamName] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [gameDate, setGameDate] = useState(new Date().toISOString().split('T')[0]);
  const [gameLocation, setGameLocation] = useState('');
  const [gameHour, setGameHour] = useState<string>('');
  const [gameMinute, setGameMinute] = useState<string>('');
  const [ageGroup, setAgeGroup] = useState('');
  const [tournamentLevel, setTournamentLevel] = useState('');
  const [leagueId, setLeagueId] = useState('');
  const [customLeagueName, setCustomLeagueName] = useState('');
  const [selectedTournamentSeriesId, setSelectedTournamentSeriesId] = useState<string | null>(null);
  const homeTeamInputRef = useRef<HTMLInputElement>(null);
  const opponentInputRef = useRef<HTMLInputElement>(null);
  const [homeTeamError, setHomeTeamError] = useState<string | null>(null);
  const [opponentError, setOpponentError] = useState<string | null>(null);
  const [periodDurationError, setPeriodDurationError] = useState<string | null>(null);
  const [customLeagueError, setCustomLeagueError] = useState<string | null>(null);
  const teamSelectionRequestRef = useRef<number>(0); // Track current team selection request

  // State for season/tournament selection
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

  // State for active tab
  const [activeTab, setActiveTab] = useState<'none' | 'season' | 'tournament'>('none');

  // state for periods and duration
  const [localNumPeriods, setLocalNumPeriods] = useState<1 | 2>(2);
  const [localPeriodDurationString, setLocalPeriodDurationString] = useState<string>('15');

  // <<< Step 4a: State for Home/Away >>>
  const [localHomeOrAway, setLocalHomeOrAway] = useState<'home' | 'away'>('home');
  const [isPlayed, setIsPlayed] = useState<boolean>(true);

  // Game type state - defaults to 'soccer', can be prefilled from season/tournament
  const [gameType, setGameType] = useState<GameType>('soccer');

  // Gender state - optional, can be prefilled from season/tournament
  const [gender, setGender] = useState<Gender | undefined>(undefined);

  // Player selection state - start with empty selection (no players pre-selected)
  const [availablePlayersForSetup, setAvailablePlayersForSetup] = useState<Player[]>(masterRoster);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  // Playing-Time Planner prefill (Phase 2): pick a saved plan + one of its games to
  // pre-load the planned lineup. Payload rides onStart; missing-count drives a hint.
  const [playtimePlans, setPlaytimePlans] = useState<PlaytimePlan[]>([]);
  const [prefillPlanId, setPrefillPlanId] = useState('');
  const [prefillGameId, setPrefillGameId] = useState('');
  const [prefillPayload, setPrefillPayload] = useState<
    | {
        playersOnField: Player[];
        plannedSubs: PlannedGameSub[];
        formationSnapPoints: Point[];
        sourcePlanId: string;
        sourcePlanGameId: string;
      }
    | undefined
  >(undefined);
  const [prefillMissingCount, setPrefillMissingCount] = useState(0);

  // Personnel selection state
  const [selectedPersonnelIds, setSelectedPersonnelIds] = useState<string[]>([]);

  // Team selection state
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isTeamNameAutoFilled, setIsTeamNameAutoFilled] = useState<boolean>(false);

  // Confirmation modal state
  const [showManageRosterConfirm, setShowManageRosterConfirm] = useState(false);
  const [emptyRosterTeamId, setEmptyRosterTeamId] = useState<string | null>(null);

  // Track if modal just opened - use layout effect to sync before paint
  const wasOpenRef = useRef(false);
  const initializingRef = useRef(false);

  // "Repeat last game": the most recent saved game (by createdAt, fall back to
  // updatedAt), used to quick-fill the non-cascading fields below.
  const lastGame = useMemo(() => {
    const games = savedGames ? Object.values(savedGames) : [];
    if (games.length === 0) return null;
    return [...games].sort((a, b) =>
      (b.createdAt ?? b.updatedAt ?? '').localeCompare(a.createdAt ?? a.updatedAt ?? '')
    )[0] ?? null;
  }, [savedGames]);

  const handleRepeatLastGame = useCallback(() => {
    if (!lastGame) return;
    // "Repeat last game" states an intent: build THIS game from the previous
    // one. An active plan prefill would otherwise silently ride along (old
    // plan's lineup, snap points, sub schedule AND a plan link) - clear it,
    // same rule as switching teams.
    setPrefillPlanId('');
    setPrefillGameId('');
    setPrefillPayload(undefined);
    setPrefillMissingCount(0);
    setOpponentName(lastGame.opponentName ?? '');
    setGameLocation(lastGame.gameLocation ?? '');
    setLocalPeriodDurationString(lastGame.periodDurationMinutes ? String(lastGame.periodDurationMinutes) : '15');
    setLocalNumPeriods(lastGame.numberOfPeriods === 1 ? 1 : 2);
    setLocalHomeOrAway(lastGame.homeOrAway === 'away' ? 'away' : 'home');
    setGameType(lastGame.gameType ?? 'soccer');
    if (typeof lastGame.demandFactor === 'number') onDemandFactorChange(lastGame.demandFactor);
    // Only carry over players who are still in the master roster.
    setSelectedPlayerIds((lastGame.selectedPlayerIds ?? []).filter(id => masterRoster.some(p => p.id === id)));
    showToast(t('newGameSetupModal.repeatedLastGame', 'Filled from your last game'), 'success');
  }, [lastGame, masterRoster, onDemandFactorChange, showToast, t]);

  // Memoize reset function
  const resetForm = useCallback(() => {
    setOpponentName('');
    setGameDate(new Date().toISOString().split('T')[0]);
    setGameLocation('');
    setGameHour('');
    setGameMinute('');
    setSelectedSeasonId(null);
    setSelectedTournamentId(null);
    setSelectedTournamentSeriesId(null);
    setSelectedTeamId(null);
    setLocalNumPeriods(2);
    setLocalPeriodDurationString('15');
    setLocalHomeOrAway('home');
    setAvailablePlayersForSetup(masterRoster);
    if (initialPlayerSelection && initialPlayerSelection.length > 0) {
      setSelectedPlayerIds(initialPlayerSelection);
    } else {
      // No team selected - start with no players pre-selected
      setSelectedPlayerIds([]);
    }
    setSelectedPersonnelIds([]);
    setActiveTab('none');
    setAgeGroup('');
    setTournamentLevel('');
    setLeagueId('');
    setCustomLeagueName('');
    setGameType('soccer'); // Reset to default
    setGender(undefined); // Reset to not set
  }, [masterRoster, initialPlayerSelection]);

  // Initialize form when modal opens - using layout effect to avoid setState in regular effect
  React.useLayoutEffect(() => {
    if (isOpen && !wasOpenRef.current && !initializingRef.current) {
      initializingRef.current = true;
      resetForm();

      // Reset + load Playing-Time Planner plans for the optional "Prefill from plan".
      setPrefillPlanId('');
      setPrefillGameId('');
      setPrefillPayload(undefined);
      setPrefillMissingCount(0);
      const loadPlans = async () => {
        try {
          const plans = await getPlans();
          setPlaytimePlans(
            Object.values(plans).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          );
        } catch (err) {
          logger.error('[NewGameSetupModal] Failed to load playtime plans (non-fatal):', err);
          setPlaytimePlans([]);
        }
      };
      loadPlans();

      // Load last home team name
      const loadLastTeamName = async () => {
        try {
          const lastHomeTeam = await utilGetLastHomeTeamName();
          setHomeTeamName(lastHomeTeam || t('newGameSetupModal.defaultTeamName', 'My Team'));
        } catch (err) {
          logger.error("[NewGameSetupModal] Error loading last home team name:", err);
          setHomeTeamName(t('newGameSetupModal.defaultTeamName', 'My Team'));
        }
      };
      loadLastTeamName();

      // Focus on home team input
      setTimeout(() => {
        homeTeamInputRef.current?.focus();
        initializingRef.current = false;
      }, 100);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, resetForm, t]);

  // Prefill-from-plan: choosing a plan clears the game pick; choosing a game builds
  // the lineup + sub schedule and pre-selects the plan squad.
  const handlePrefillPlanChange = useCallback((planId: string) => {
    setPrefillPlanId(planId);
    setPrefillGameId('');
    setPrefillPayload(undefined);
    setPrefillMissingCount(0);
  }, []);

  const handlePrefillGameChange = useCallback(
    (gameId: string) => {
      setPrefillGameId(gameId);
      const plan = playtimePlans.find((p) => p.id === prefillPlanId);
      const game = plan?.games.find((g) => g.id === gameId);
      if (!plan || !game) {
        setPrefillPayload(undefined);
        setPrefillMissingCount(0);
        return;
      }
      const result = buildPrefillFromPlan(plan, game, availablePlayersForSetup);
      setSelectedPlayerIds(result.selectedPlayerIds);
      // Seed the game's period config from the PLANNED game (still editable):
      // without this a 2x12 plan lands in a 2x10 default game and the planned
      // half-time sub prompt fires two minutes into the second half.
      setLocalNumPeriods(game.numberOfPeriods === 1 ? 1 : 2);
      setLocalPeriodDurationString(String(game.periodMinutes));
      setPrefillPayload({
        // Starters on the field + planned subs parked on the sideline in one array;
        // the sideline players render as waiting subs (desaturated, position-labelled).
        playersOnField: [...result.playersOnField, ...result.sidelinePlayers],
        plannedSubs: result.plannedSubs,
        // Snap points let the created game rebuild the dotted sub slots + labels.
        formationSnapPoints: result.formationSnapPoints,
        // Link back to the plan so an edited plan can be re-applied later.
        sourcePlanId: prefillPlanId,
        sourcePlanGameId: gameId,
      });
      setPrefillMissingCount(result.missingPlayerIds.length);
    },
    [playtimePlans, prefillPlanId, availablePlayersForSetup],
  );

  // Memoize selected tournament lookup to avoid duplicate find() calls in render
  const selectedTournament = useMemo(() => {
    if (!selectedTournamentId) return null;
    return tournaments.find(t => t.id === selectedTournamentId) || null;
  }, [tournaments, selectedTournamentId]);

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
          return -1; // a has date, b doesn't -> a first
        } else if (b.startDate) {
          return 1; // b has date, a doesn't -> b first
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

  // Filter to only valid series (with levels in LEVELS constant)
  const validSeries = useMemo(() => {
    if (!selectedTournament?.series) return [];
    return selectedTournament.series.filter(s => LEVELS.includes(s.level));
  }, [selectedTournament]);

  const hasSeries = validSeries.length > 0;

  // Compute effective series ID - returns null if the selected series no longer exists
  // or is not in the validSeries list (invalid level).
  // Note: We intentionally don't sync selectedTournamentSeriesId state when validation fails.
  // This useMemo pattern avoids an extra render cycle that a useEffect sync would cause.
  // The dropdown uses effectiveSeriesId for display (shows placeholder when null),
  // and onStart passes effectiveSeriesId to handlers (null when invalid).
  const effectiveSeriesId = useMemo(() => {
    if (!selectedTournamentSeriesId) {
      return null;
    }
    const seriesExists = validSeries.some(s => s.id === selectedTournamentSeriesId);
    return seriesExists ? selectedTournamentSeriesId : null;
  }, [validSeries, selectedTournamentSeriesId]);

  // Helper to apply season settings to form
  const applySeasonSettings = useCallback((seasonId: string) => {
    const s = seasons.find(se => se.id === seasonId);
    if (s) {
      setGameLocation(s.location || '');
      setAgeGroup(s.ageGroup || '');
      // With a plan prefill active, the match format belongs to the PLAN: the
      // planned subs carry absolute times (e.g. half-time of 2x12), so letting
      // the season's default format overwrite it would silently fire those
      // subs at the wrong minute. Plans are made FOR seasons/tournaments, so
      // keep the binding and skip only the format overwrite.
      if (!prefillPayload) {
        setLocalNumPeriods((s.periodCount as 1 | 2) || 2);
        setLocalPeriodDurationString(s.periodDuration ? String(s.periodDuration) : '15');
      }
      setGameDate(s.startDate || new Date().toISOString().split('T')[0]);
      setActiveTab('season');
      // Apply league from season as default (clear custom name if not "muu")
      //
      // League-Season Dependency: League selection is tied to season selection.
      // When creating a new game, league defaults from season but can be overridden.
      // The override is passed to onStart and stored in the game, not the season.
      // See also: GameSettingsModal.tsx for similar prefill logic during game editing.
      const seasonLeagueId = s.leagueId || '';
      setLeagueId(seasonLeagueId);
      setCustomLeagueName(seasonLeagueId === CUSTOM_LEAGUE_ID ? s.customLeagueName || '' : '');
      // Prefill game type from season (defaults to 'soccer' if not set)
      setGameType(s.gameType || 'soccer');
      // Prefill gender from season (undefined if not set)
      setGender(s.gender);
    }
  }, [seasons, prefillPayload]);

  const handleSeasonChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value) {
      setSelectedSeasonId(value);
      setSelectedTournamentId(null);
      applySeasonSettings(value);
    } else {
      setSelectedSeasonId(null);
      setActiveTab('none');
    }
  };

  // Team selection handler with roster auto-load and name auto-fill
  const handleTeamSelection = async (teamId: string | null) => {
    // Increment request counter to track this request
    const requestId = ++teamSelectionRequestRef.current;

    // Switching teams invalidates a plan prefill: the planned lineup/subs
    // belong to the previous team's squad and would otherwise ride silently
    // into the new team's game (the master-roster reconciliation can't catch
    // it - the old team's players are still valid master-roster members).
    // Mirrors handlePrefillPlanChange's clearing.
    if (teamId !== selectedTeamId) {
      setPrefillPlanId('');
      setPrefillGameId('');
      setPrefillPayload(undefined);
      setPrefillMissingCount(0);
    }

    setSelectedTeamId(teamId);
    
    if (teamId) {
      try {
        // Load team roster
        const teamRoster = await getTeamRoster(teamId);

        // Check if this is still the current request
        if (requestId !== teamSelectionRequestRef.current) {
          return; // A newer request has been made, abandon this one
        }

        // Always show master roster from props, but pre-select only team players
        setAvailablePlayersForSetup(masterRoster);

        if (teamRoster && teamRoster.length > 0) {
          // Create a set of team player names for comparison (since IDs differ)
          const teamPlayerNames = new Set(
            teamRoster.map((p: Player) => p.name.toLowerCase().trim())
          );

          // Select master roster players that match team roster names
          const selectedIds = masterRoster
            .filter((p: Player) => teamPlayerNames.has(p.name.toLowerCase().trim()))
            .map((p: Player) => p.id);

          setSelectedPlayerIds(selectedIds);
        } else {
          // Team roster is empty - no players pre-selected
          setSelectedPlayerIds([]);

          // Optionally prompt user to manage roster
          setEmptyRosterTeamId(teamId);
          setShowManageRosterConfirm(true);
        }

        // Check if this is still the current request before updating team name
        if (requestId !== teamSelectionRequestRef.current) {
          return;
        }

        // Auto-fill team name (but keep it editable)
        const team = teams.find(t => t.id === teamId);
        if (team) {
          setHomeTeamName(team.name);
          setIsTeamNameAutoFilled(true);

          // Auto-apply team's bound season/tournament settings
          if (team.boundSeasonId) {
            setSelectedSeasonId(team.boundSeasonId);
            setSelectedTournamentId(null);
            applySeasonSettings(team.boundSeasonId);
          } else if (team.boundTournamentId) {
            setSelectedTournamentId(team.boundTournamentId);
            setSelectedSeasonId(null);
            applyTournamentSettings(team.boundTournamentId);

            // Also apply team's specific series if bound to one
            const series = getTeamBoundSeries(team, tournaments);
            if (series) {
              setSelectedTournamentSeriesId(series.id);
              setTournamentLevel(series.level);
            }
          }
        }
      } catch (error) {
        logger.error('[NewGameSetupModal] Error loading team roster:', error);

        // Check if this is still the current request
        if (requestId !== teamSelectionRequestRef.current) {
          return;
        }

        // Fallback to master roster on error
        setAvailablePlayersForSetup(masterRoster);
        setSelectedPlayerIds([]); // No players selected on error
      }
    } else {
      // No team selected - use master roster with no players pre-selected
      setAvailablePlayersForSetup(masterRoster);
      setSelectedPlayerIds([]);

      // Clear team name only if it was auto-filled (preserve manual input)
      if (isTeamNameAutoFilled) {
        setHomeTeamName('');
        setIsTeamNameAutoFilled(false);
      }
    }
  };

  const handleTeamNameChange = (newName: string) => {
    setHomeTeamName(newName);
    if (homeTeamError) setHomeTeamError(null);
    // If user manually changes the name, it's no longer auto-filled
    if (isTeamNameAutoFilled) {
      setIsTeamNameAutoFilled(false);
    }
  };

  // Helper to apply tournament settings to form
  const applyTournamentSettings = useCallback((tournamentId: string) => {
    const tournament = tournaments.find(tt => tt.id === tournamentId);
    if (tournament) {
      // Clear previous series selection before applying new tournament settings
      setSelectedTournamentSeriesId(null);
      setGameLocation(tournament.location || '');
      setAgeGroup(tournament.ageGroup || '');
      // UX decision: Pre-select first valid series when tournament is selected.
      // Rationale: Most tournaments have a single series (e.g., "Kilpa"), so auto-selecting
      // reduces clicks. Users can still change via dropdown. Empty placeholder would require
      // an extra click in the common case.
      // Only consider series with valid levels (from LEVELS constant).
      const tournamentValidSeries = tournament.series?.filter(s => LEVELS.includes(s.level)) || [];
      if (tournamentValidSeries.length > 0) {
        const firstSeries = tournamentValidSeries[0];
        setTournamentLevel(firstSeries.level);
        setSelectedTournamentSeriesId(firstSeries.id);
      } else {
        setTournamentLevel(tournament.level || '');
        setSelectedTournamentSeriesId(null);
      }
      // Same prefill guard as applySeasonSettings: the plan's format drives
      // the planned sub times; the tournament's default must not overwrite it.
      if (!prefillPayload) {
        setLocalNumPeriods((tournament.periodCount as 1 | 2) || 2);
        setLocalPeriodDurationString(tournament.periodDuration ? String(tournament.periodDuration) : '15');
      }
      setGameDate(tournament.startDate || new Date().toISOString().split('T')[0]);
      setActiveTab('tournament');
      // Prefill game type from tournament (defaults to 'soccer' if not set)
      setGameType(tournament.gameType || 'soccer');
      // Prefill gender from tournament (undefined if not set)
      setGender(tournament.gender);
    }
  }, [tournaments, prefillPayload]);

  const handleTournamentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value) {
      setSelectedTournamentId(value);
      setSelectedSeasonId(null);
      applyTournamentSettings(value); // handles series/level internally
    } else {
      setSelectedTournamentId(null);
      setSelectedTournamentSeriesId(null);
      setTournamentLevel('');
      setActiveTab('none');
    }
  };

  // Handle tab changes
  const handleTabChange = (tab: 'none' | 'season' | 'tournament') => {
    setActiveTab(tab);
    if (tab === 'none') {
      setSelectedSeasonId(null);
      setSelectedTournamentId(null);
    } else if (tab === 'season') {
      setSelectedTournamentId(null);
    } else if (tab === 'tournament') {
      setSelectedSeasonId(null);
    }
  };

  const handleStartClick = async () => {
    const trimmedHomeTeamName = homeTeamName.trim();
    const trimmedOpponentName = opponentName.trim();

    if (!trimmedHomeTeamName) {
      setHomeTeamError(t('newGameSetupModal.homeTeamNameRequired', 'Home Team Name is required.'));
      homeTeamInputRef.current?.focus();
      return;
    }

    if (!trimmedOpponentName) {
      setOpponentError(t('newGameSetupModal.opponentNameRequired', 'Opponent Name is required.'));
      opponentInputRef.current?.focus();
      return;
    }

    if (selectedPlayerIds.length === 0) {
        showToast(t('newGameSetupModal.noPlayersSelected', 'Please select at least one player.'), 'error');
        return;
    }

    // Format game time properly
    const formattedHour = gameHour.padStart(2, '0');
    const formattedMinute = gameMinute.padStart(2, '0');
    const gameTime = (gameHour && gameMinute) ? `${formattedHour}:${formattedMinute}` : '';

    // Validate period duration
    const duration = parseInt(localPeriodDurationString, 10);
    if (isNaN(duration) || duration <= 0) {
        setPeriodDurationError(t('newGameSetupModal.invalidPeriodDuration', 'Period duration must be a positive number.'));
        return;
    }

    // Validate custom league name when "Muu" is selected
    if (leagueId === CUSTOM_LEAGUE_ID && !customLeagueName.trim()) {
        setCustomLeagueError(t('newGameSetupModal.customLeagueNameRequired', 'Please enter a custom league name.'));
        return;
    }

    // --- Save last used home team name using utility function ---
    try {
      await utilSaveLastHomeTeamName(trimmedHomeTeamName);
    } catch (error) {
      logger.error("Failed to save last home team name:", error);
      // Continue without blocking, as this is not critical for starting the game
    }
    // --- End Save ---

    // Call the onStart callback from props using the modal's internal selectedPlayerIds state
    onStart(
      selectedPlayerIds, // MODIFIED: Use the modal's current selection state
      trimmedHomeTeamName,
      trimmedOpponentName,
      gameDate,
      gameLocation.trim(),
      gameTime,
      selectedSeasonId,
      selectedTournamentId,
      localNumPeriods,
      duration, // use validated duration
      localHomeOrAway, // <<< Step 4a: Pass Home/Away >>>
      demandFactor,
      ageGroup,
      tournamentLevel,
      effectiveSeriesId,
      isPlayed,
      selectedTeamId, // Add team selection parameter
      availablePlayersForSetup, // Pass the actual roster being used in the modal
      selectedPersonnelIds, // Pass the personnel selection
      leagueId, // League ID for the game
      leagueId === CUSTOM_LEAGUE_ID ? customLeagueName.trim() : '', // Custom league name when leagueId === CUSTOM_LEAGUE_ID
      gameType, // Sport type: 'soccer' or 'futsal'
      gender, // Gender: 'boys' or 'girls' (optional)
      prefillPayload // Planner prefill (Phase 2): planned XI + subs, or undefined
    );

    // Modal will be closed by parent component after onStart
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Allow Enter to submit from main text inputs
    if (event.key === 'Enter') {
        const target = event.target as HTMLElement;
        // Avoid submitting if focus is on dropdowns or buttons that might have their own Enter behavior
        if (target.tagName !== 'SELECT' && target.tagName !== 'BUTTON') {
            handleStartClick();
        }
    } else if (event.key === 'Escape') {
      onCancel();
    }
  };


  // ... handleHourChange and handleMinuteChange functions ...
  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numeric input and limit to 2 characters
    const numericValue = value.replace(/[^0-9]/g, '');
    if (numericValue.length <= 2) {
      const hourNum = parseInt(numericValue, 10);
      // Validate hour range (0-23) if number is complete
      if (numericValue === '' || (hourNum >= 0 && hourNum <= 23)) {
        setGameHour(numericValue);
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
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 rounded-none shadow-xl flex flex-col border-0 overflow-hidden h-full w-full bg-noise-texture relative">
        {/* Background effects */}
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col min-h-0">
          {/* Modal-chrome slimming: X-header + pinned primary (Create) replace
              the header and the Cancel/Create footer. "Repeat last game"
              (utility) sits in the collapsing region below the title. */}
          <CollapsibleModalHeader
            title={t('newGameSetupModal.title', 'New Game Setup')}
            onClose={onCancel}
            closeLabel={t('common.cancelButton', 'Cancel')}
            collapse={headerCollapse}
          >
            {lastGame && (
              <div className="px-4 pb-3 pt-1 backdrop-blur-sm bg-slate-900/20">
                <button
                  type="button"
                  onClick={handleRepeatLastGame}
                  className="w-full px-4 py-2 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 text-sm font-medium border border-indigo-500/40 transition-colors"
                >
                  {t('newGameSetupModal.repeatLastGame', 'Repeat last game')}
                </button>
              </div>
            )}
          </CollapsibleModalHeader>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4" onScroll={headerCollapse.onScroll}>
            {/* CARD 1: Teams & Roster */}
            <div className="space-y-4 bg-gradient-to-br from-slate-900/60 to-slate-800/40 p-4 rounded-lg border border-slate-700 shadow-inner transition-all -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-3">
                {t('newGameSetupModal.teamsAndRosterLabel', 'Teams & Roster')}
              </h3>

              {/* Team Selection */}
              <div className="mb-4">
                <label htmlFor="teamSelectTop" className="block text-sm font-medium text-slate-300 mb-1">
                  {t('newGameSetupModal.selectTeamLabel', 'Select Team')}
                </label>
                <select
                  id="teamSelectTop"
                  value={selectedTeamId || ''}
                  onChange={(e) => handleTeamSelection(e.target.value || null)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                >
                  <option value="">
                    {t('newGameSetupModal.noTeamMasterRoster', 'No Team (Use Master Roster)')}
                  </option>
                  {teams.filter(team => !team.archived).map((team) => (
                    <option key={team.id} value={team.id}>
                      {getTeamDisplayName(team, seasons, tournaments, { futsalLabel: t('common.futsal', 'Futsal') })}
                    </option>
                  ))}
                </select>
                {selectedTeamId && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t('newGameSetupModal.teamSelectedNote', 'Player roster will be loaded from selected team.')}
                  </p>
                )}
                {!selectedTeamId && (
                  <p className="mt-1 text-xs text-slate-400">
                    {teams.some((team) => !team.archived)
                      ? t('newGameSetupModal.selectTeamTip', 'Tip: pick a team to auto-fill its roster and linked competition.')
                      : t('newGameSetupModal.masterRosterNote', 'Using master roster - all players available.')}
                  </p>
                )}
              </div>

              {/* Team & Opponent Names */}
              <div className="mb-4">
                <TeamOpponentInputs
                  teamName={homeTeamName}
                  opponentName={opponentName}
                  onTeamNameChange={handleTeamNameChange}
                  onOpponentNameChange={(v) => { setOpponentName(v); if (opponentError) setOpponentError(null); }}
                  teamLabel={t('newGameSetupModal.homeTeamName', 'Your Team Name') + ' *'}
                  teamPlaceholder={t('newGameSetupModal.homeTeamPlaceholder', 'e.g., Galaxy U10')}
                  opponentLabel={t('newGameSetupModal.opponentNameLabel', 'Opponent Name') + ' *'}
                  opponentPlaceholder={t('newGameSetupModal.opponentPlaceholder', 'Enter opponent name')}
                  teamInputRef={homeTeamInputRef}
                  opponentInputRef={opponentInputRef}
                  onKeyDown={handleKeyDown}
                  teamError={homeTeamError}
                  opponentError={opponentError}
                />
              </div>

              {/* Prefill from a Playing-Time Planner plan (optional) */}
              {playtimePlans.length > 0 && (
                <div className="mb-4">
                  <label htmlFor="prefillPlanSelect" className="block text-sm font-medium text-slate-300 mb-1">
                    {t('newGameSetupModal.prefillFromPlanLabel', 'Prefill from plan (optional)')}
                  </label>
                  <select
                    id="prefillPlanSelect"
                    value={prefillPlanId}
                    onChange={(e) => handlePrefillPlanChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                  >
                    <option value="">{t('newGameSetupModal.prefillNoPlan', 'No plan')}</option>
                    {playtimePlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                  {prefillPlanId && (
                    <select
                      aria-label={t('newGameSetupModal.prefillGameLabel', 'Plan game')}
                      value={prefillGameId}
                      onChange={(e) => handlePrefillGameChange(e.target.value)}
                      className="mt-2 w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                    >
                      <option value="">{t('newGameSetupModal.prefillChooseGame', 'Choose a game…')}</option>
                      {(playtimePlans.find((p) => p.id === prefillPlanId)?.games ?? []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {prefillMissingCount > 0 && (
                    <p className="mt-1 text-xs text-amber-400">
                      {t('newGameSetupModal.prefillMissingPlayers', '{{count}} planned players are not in this roster and were skipped.', {
                        count: prefillMissingCount,
                      })}
                    </p>
                  )}
                </div>
              )}

              {/* Player Selection */}
              <PlayerSelectionSection
                availablePlayers={availablePlayersForSetup}
                selectedPlayerIds={selectedPlayerIds}
                onSelectedPlayersChange={setSelectedPlayerIds}
                title={t('newGameSetupModal.selectPlayers', 'Select Players')}
                playersSelectedText={t('newGameSetupModal.playersSelected', 'selected')}
                selectAllText={t('newGameSetupModal.selectAll', 'Select All')}
                noPlayersText={t('newGameSetupModal.noPlayersInRoster', 'No players in roster. Add players in Roster Settings.')}
                onAddPlayer={
                  onAddPlayerToRoster
                    ? async (name: string, nickname?: string) => {
                        /* Same contract as the in-match picker (W1). */
                        const isDuplicate = masterRoster.some(
                          (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
                        );
                        if (isDuplicate) {
                          return t('playerDetailsModal.duplicateNameError', 'A player with this name already exists');
                        }
                        const saved = await onAddPlayerToRoster(name, nickname);
                        if (!saved) {
                          return t('gameSettingsModal.addToClubRosterFailed', 'Adding the player failed. Please try again.');
                        }
                        // R1: the picker lists a SNAPSHOT of the roster -
                        // append the new player so they render immediately
                        // (the club write already updated the query cache).
                        setAvailablePlayersForSetup((prev) =>
                          prev.some((p) => p.id === saved.id) ? prev : [...prev, saved],
                        );
                        setSelectedPlayerIds((prev) => [...prev, saved.id]);
                        return true as const;
                      }
                    : undefined
                }
                addPlayerLabel={t('gameSettingsModal.addToClubRoster', 'Add new player')}
                addPlayerConfirmLabel={t('common.add', 'Add')}
                addPlayerPlaceholder={t('gameSettingsModal.addToClubRosterPlaceholder', 'New player name')}
                addPlayerNicknamePlaceholder={t('gameSettingsModal.addToClubRosterNickname', 'Nickname (shown on the disc)')}
              />

              {/* Personnel Selection */}
              <PersonnelSelectionSection
                availablePersonnel={personnel}
                selectedPersonnelIds={selectedPersonnelIds}
                onSelectedPersonnelChange={setSelectedPersonnelIds}
                title={t('newGameSetupModal.selectPersonnel', 'Select Personnel')}
              />
            </div>

            {/* CARD 2: Game Details */}
            <div className="space-y-4 bg-gradient-to-br from-slate-900/60 to-slate-800/40 p-4 rounded-lg border border-slate-700 shadow-inner transition-all -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-3">
                {t('newGameSetupModal.gameDetailsLabel', 'Game Details')}
              </h3>

              {/* Game Type Tabs */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('newGameSetupModal.gameTypeLabel', 'Game Type')}
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
                            value={selectedSeasonId || ''}
                            onChange={handleSeasonChange}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                          >
                            <option value="">{t('newGameSetupModal.selectSeason', '-- Select Season --')}</option>
                            {sortedSeasons.map((season) => (
                              <option key={season.id} value={season.id}>
                                {getSeasonDisplayName(season)}
                              </option>
                            ))}
                          </select>

                          {/* League Selection - shows when season is selected */}
                          {selectedSeasonId && (
                            <div className="mt-3">
                              <label htmlFor="leagueSelect" className="block text-sm font-medium text-slate-300 mb-1">
                                {t('newGameSetupModal.leagueLabel', 'League')}
                              </label>
                              <select
                                id="leagueSelect"
                                value={leagueId}
                                onChange={(e) => {
                                  setLeagueId(e.target.value);
                                  // Clear custom name when switching away from "Muu" (intentional)
                                  if (e.target.value !== CUSTOM_LEAGUE_ID) setCustomLeagueName('');
                                }}
                                onKeyDown={handleKeyDown}
                                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                              >
                                <option value="">{t('newGameSetupModal.selectLeague', '-- Select League --')}</option>
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
                                    onChange={(e) => { setCustomLeagueName(e.target.value); if (customLeagueError) setCustomLeagueError(null); }}
                                    onKeyDown={handleKeyDown}
                                    placeholder={t('newGameSetupModal.customLeaguePlaceholder', 'Enter league name')}
                                    className={`w-full px-3 py-2 bg-slate-700 border rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm ${customLeagueError ? 'border-red-500' : 'border-slate-600'}`}
                                  />
                                  {customLeagueError && <p className="mt-1 text-sm text-red-400">{customLeagueError}</p>}
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
                            value={selectedTournamentId || ''}
                            onChange={handleTournamentChange}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                          >
                            <option value="">{t('newGameSetupModal.selectTournament', '-- Select Tournament --')}</option>
                            {sortedTournaments.map((tournament) => (
                              <option key={tournament.id} value={tournament.id}>
                                {getTournamentDisplayName(tournament)}
                              </option>
                            ))}
                          </select>
                          {selectedTournament && (
                            <div className="mt-2">
                              <label htmlFor="tournamentLevelInput" className="block text-sm font-medium text-slate-300 mb-1">
                                {hasSeries
                                  ? t('newGameSetupModal.seriesLabel', 'Series')
                                  : t('newGameSetupModal.levelLabel', 'Level')}
                              </label>
                              {hasSeries ? (
                                // Show series dropdown when tournament has defined series
                                <select
                                  id="tournamentLevelInput"
                                  value={effectiveSeriesId || ''}
                                  onChange={(e) => {
                                    const seriesId = e.target.value || null;
                                    setSelectedTournamentSeriesId(seriesId);
                                    // Also set level for backwards compatibility
                                    const series = selectedTournament.series?.find(s => s.id === seriesId);
                                    setTournamentLevel(series?.level || '');
                                  }}
                                  onKeyDown={handleKeyDown}
                                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                                >
                                  <option value="">{t('common.selectSeries', '-- Select Series --')}</option>
                                  {validSeries.map((series) => (
                                    <option key={series.id} value={series.id}>
                                      {t(`common.level${series.level}` as TranslationKey, series.level)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                // Fallback to all LEVELS when no series defined
                                <select
                                  id="tournamentLevelInput"
                                  value={tournamentLevel}
                                  onChange={(e) => setTournamentLevel(e.target.value)}
                                  onKeyDown={handleKeyDown}
                                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                                >
                                  <option value="">{t('common.none', 'None')}</option>
                                  {LEVELS.map((lvl) => (
                                    <option key={lvl} value={lvl}>
                                      {t(`common.level${lvl}` as TranslationKey, lvl)}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      )}

              {/* Age Group */}
                      <div className="mb-4">
                        <label htmlFor="ageGroupSelect" className="block text-sm font-medium text-slate-300 mb-1">
                          {t('newGameSetupModal.ageGroupLabel', 'Age Group (Optional)')}
                        </label>
                        <select
                          id="ageGroupSelect"
                          value={ageGroup}
                          onChange={(e) => setAgeGroup(e.target.value)}
                          onKeyDown={handleKeyDown}
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
                    onClick={() => setGameType('soccer')}
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
                    onClick={() => setGameType('futsal')}
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
                    onClick={() => setGender(undefined)}
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
                    onClick={() => setGender('boys')}
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
                    onClick={() => setGender('girls')}
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

                      {/* Game Date */}
                      <div className="mb-6">
                        <label htmlFor="gameDateInput" className="block text-sm font-medium text-slate-300 mb-2">
                          {t('newGameSetupModal.gameDateLabel', 'Game Date')}
                        </label>
                        <input
                          type="date"
                          id="gameDateInput"
                          name="gameDate"
                          value={gameDate}
                          onChange={(e) => setGameDate(e.target.value)}
                          onKeyDown={handleKeyDown}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                          autoComplete="off"

                        />
                      </div>

                      {/* Game Location */}
                      <div className="mb-4">
                        <label htmlFor="gameLocationInput" className="block text-sm font-medium text-slate-300 mb-1">
                          {t('newGameSetupModal.gameLocationLabel', 'Location (Optional)')}
                        </label>
                        <input
                          type="text"
                          id="gameLocationInput"
                          value={gameLocation}
                          onChange={(e) => setGameLocation(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={t('newGameSetupModal.locationPlaceholder', 'e.g., Central Park Field 2')}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"

                        />
                      </div>

                      {/* Game Time */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          {t('newGameSetupModal.gameTimeLabel', 'Time (Optional)')}
                        </label>
                        <div className="flex items-center space-x-3 max-w-xs">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            value={gameHour}
                            onChange={handleHourChange}
                            onKeyDown={handleKeyDown}
                            placeholder={t('newGameSetupModal.hourPlaceholder', 'HH')}
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
                            onKeyDown={handleKeyDown}
                            placeholder={t('newGameSetupModal.minutePlaceholder', 'MM')}
                            className="w-1/2 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm text-center"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck="false"

                            onFocus={(e) => e.target.select()}
                          />
                        </div>
                      </div>

              {/* Home/Away Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('newGameSetupModal.homeOrAwayLabel', 'Your Team is')}
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLocalHomeOrAway('home')}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      localHomeOrAway === 'home'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.home', 'Home')}
                  </button>
                  <button
                    onClick={() => setLocalHomeOrAway('away')}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      localHomeOrAway === 'away'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.away', 'Away')}
                  </button>
                </div>
              </div>
            </div>

            {/* CARD 3: Pelin asetukset (Game Configuration) */}
            <div className="space-y-4 bg-gradient-to-br from-slate-900/60 to-slate-800/40 p-4 rounded-lg border border-slate-700 shadow-inner transition-all -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-3">
                {t('newGameSetupModal.gameConfigLabel', 'Pelin asetukset')}
              </h3>

              {/* Number of Periods */}
              <div className="mb-4">
                <label htmlFor="numPeriodsSelect" className="block text-sm font-medium text-slate-300 mb-1">
                  {t('newGameSetupModal.numPeriodsLabel', 'Number of Periods')}
                </label>
                <select
                  id="numPeriodsSelect"
                  value={localNumPeriods}
                  onChange={(e) => setLocalNumPeriods(parseInt(e.target.value) as 1 | 2)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>

              {/* Period Duration */}
              <div className="mb-4">
                <label htmlFor="periodDurationInput" className="block text-sm font-medium text-slate-300 mb-1">
                  {t('newGameSetupModal.periodDurationLabel', 'Period Duration (minutes)')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  id="periodDurationInput"
                  value={localPeriodDurationString}
                  onChange={(e) => {
                    const value = e.target.value;
                    const numericValue = value.replace(/[^0-9]/g, '');
                    // Allow reasonable period durations (1-999 minutes)
                    if (numericValue === '' || (parseInt(numericValue, 10) >= 1 && parseInt(numericValue, 10) <= 999)) {
                      setLocalPeriodDurationString(numericValue);
                    }
                    if (periodDurationError) setPeriodDurationError(null);
                  }}
                  className={`w-full max-w-xs px-3 py-2 bg-slate-700 border rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm ${periodDurationError ? 'border-red-500' : 'border-slate-600'}`}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  placeholder="15"
                />
                {periodDurationError && <p className="mt-1 text-sm text-red-400">{periodDurationError}</p>}
              </div>

              {/* Demand Factor Slider */}
              <div className="mb-4">
                <AssessmentSlider
                  label={t('newGameSetupModal.demandFactorLabel', 'Game Demand Level')}
                  value={demandFactor}
                  onChange={onDemandFactorChange}
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
                    onChange={(e) => setIsPlayed(!e.target.checked)}
                    className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-700 border-slate-500 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
                  />
                  <span className="ml-2">{t('newGameSetupModal.unplayedToggle', 'Not played yet')}</span>
                </label>
              </div>
            </div>

            {/* Primary action at the END of the form (chrome slimming: no
                footer; the commit is the natural terminus of the flow). */}
            <button
              type="button"
              onClick={handleStartClick}
              className="w-full py-3 rounded-md text-base font-semibold bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-400/30 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {t('newGameSetupModal.createGame', 'Create Game')}
            </button>
          </div>

        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showManageRosterConfirm}
        title={t('newGameSetupModal.emptyTeamRosterTitle', 'Empty Team Roster')}
        message={t('newGameSetupModal.emptyTeamRosterPrompt', 'The selected team has no players. Would you like to manage the team roster now?')}
        onConfirm={() => {
          if (emptyRosterTeamId && onManageTeamRoster) {
            onManageTeamRoster(emptyRosterTeamId);
          }
          setShowManageRosterConfirm(false);
          setEmptyRosterTeamId(null);
        }}
        onCancel={() => {
          setShowManageRosterConfirm(false);
          setEmptyRosterTeamId(null);
        }}
        confirmLabel={t('newGameSetupModal.manageRoster', 'Manage Roster')}
        cancelLabel={t('newGameSetupModal.continueWithoutPlayers', 'Continue Without Players')}
        variant="primary"
      />
    </div>
  );
}

export default NewGameSetupModal;
