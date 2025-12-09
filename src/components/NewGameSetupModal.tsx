'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { Player, Season, Tournament, Team, Personnel } from '@/types';
import logger from '@/utils/logger';
import { getTeamRoster } from '@/utils/teams';
import { getLastHomeTeamName as utilGetLastHomeTeamName, saveLastHomeTeamName as utilSaveLastHomeTeamName } from '@/utils/appSettings';
import AssessmentSlider from './AssessmentSlider';
import PlayerSelectionSection from './PlayerSelectionSection';
import PersonnelSelectionSection from './PersonnelSelectionSection';
import TeamOpponentInputs from './TeamOpponentInputs';
import { AGE_GROUPS, LEVELS } from '@/config/gameOptions';
import { FINNISH_YOUTH_LEAGUES } from '@/config/leagues';
import type { TranslationKey } from '@/i18n-types';
import ConfirmationModal from './ConfirmationModal';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';

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
    customLeagueName: string // Custom league name when leagueId === 'muu'
  ) => void;
  onCancel: () => void;
  // Fresh data from React Query
  masterRoster: Player[];
  seasons: Season[];
  tournaments: Tournament[];
  teams: Team[];
  personnel: Personnel[];
}

const NewGameSetupModal: React.FC<NewGameSetupModalProps> = ({
  isOpen,
  initialPlayerSelection,
  demandFactor,
  onDemandFactorChange,
  onManageTeamRoster,
  onStart,
  onCancel,
  masterRoster,
  seasons,
  tournaments,
  teams,
  personnel,
}) => {
  const { t } = useTranslation();
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

  // Player selection state
  const [availablePlayersForSetup, setAvailablePlayersForSetup] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(initialPlayerSelection || []);

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
    } else if (masterRoster.length > 0) {
      setSelectedPlayerIds(masterRoster.map(p => p.id));
    }
    setSelectedPersonnelIds([]);
    setActiveTab('none');
    setAgeGroup('');
    setTournamentLevel('');
    setLeagueId('');
    setCustomLeagueName('');
  }, [masterRoster, initialPlayerSelection]);

  // Initialize form when modal opens - using layout effect to avoid setState in regular effect
  React.useLayoutEffect(() => {
    if (isOpen && !wasOpenRef.current && !initializingRef.current) {
      initializingRef.current = true;
      resetForm();

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

  // Memoize selected tournament lookup to avoid duplicate find() calls in render
  const selectedTournament = useMemo(() => {
    if (!selectedTournamentId) return null;
    return tournaments.find(t => t.id === selectedTournamentId) || null;
  }, [tournaments, selectedTournamentId]);

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
      setLocalNumPeriods((s.periodCount as 1 | 2) || 2);
      setLocalPeriodDurationString(s.periodDuration ? String(s.periodDuration) : '15');
      setGameDate(s.startDate || new Date().toISOString().split('T')[0]);
      setActiveTab('season');
      // Apply league from season as default
      setLeagueId(s.leagueId || '');
      setCustomLeagueName(s.customLeagueName || '');
    }
  }, [seasons]);

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
      // No team selected - use master roster
      setAvailablePlayersForSetup(masterRoster);
      setSelectedPlayerIds(masterRoster.map((p: Player) => p.id));

      // Clear team name only if it was auto-filled (preserve manual input)
      if (isTeamNameAutoFilled) {
        setHomeTeamName('');
        setIsTeamNameAutoFilled(false);
      }
    }
  };

  const handleTeamNameChange = (newName: string) => {
    setHomeTeamName(newName);
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
      setLocalNumPeriods((tournament.periodCount as 1 | 2) || 2);
      setLocalPeriodDurationString(tournament.periodDuration ? String(tournament.periodDuration) : '15');
      setGameDate(tournament.startDate || new Date().toISOString().split('T')[0]);
      setActiveTab('tournament');
    }
  }, [tournaments]);

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
      showToast(t('newGameSetupModal.homeTeamNameRequired', 'Home Team Name is required.'), 'error');
      homeTeamInputRef.current?.focus();
      return;
    }

    if (!trimmedOpponentName) {
      showToast(t('newGameSetupModal.opponentNameRequired', 'Opponent Name is required.'), 'error');
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
        showToast(t('newGameSetupModal.invalidPeriodDuration', 'Period duration must be a positive number.'), 'error');
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
      leagueId === 'muu' ? customLeagueName.trim() : '' // Custom league name when leagueId === 'muu'
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
          {/* Fixed Header */}
          <div className="flex justify-center items-center pt-10 pb-4 backdrop-blur-sm bg-slate-900/20">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">
              {t('newGameSetupModal.title', 'New Game Setup')}
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
                  <span className="text-yellow-400 font-semibold">{availablePlayersForSetup.length}</span>
                  {" "}{t('newGameSetupModal.playersSelectedCounter', 'Players Selected')}
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
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
                      {team.name}
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
                    {t('newGameSetupModal.masterRosterNote', 'Using master roster - all players available.')}
                  </p>
                )}
              </div>

              {/* Team & Opponent Names */}
              <div className="mb-4">
                <TeamOpponentInputs
                  teamName={homeTeamName}
                  opponentName={opponentName}
                  onTeamNameChange={handleTeamNameChange}
                  onOpponentNameChange={setOpponentName}
                  teamLabel={t('newGameSetupModal.homeTeamName', 'Your Team Name') + ' *'}
                  teamPlaceholder={t('newGameSetupModal.homeTeamPlaceholder', 'e.g., Galaxy U10')}
                  opponentLabel={t('newGameSetupModal.opponentNameLabel', 'Opponent Name') + ' *'}
                  opponentPlaceholder={t('newGameSetupModal.opponentPlaceholder', 'Enter opponent name')}
                  teamInputRef={homeTeamInputRef}
                  opponentInputRef={opponentInputRef}
                  onKeyDown={handleKeyDown}
                />
              </div>

              {/* Player Selection */}
              <PlayerSelectionSection
                availablePlayers={availablePlayersForSetup}
                selectedPlayerIds={selectedPlayerIds}
                onSelectedPlayersChange={setSelectedPlayerIds}
                title={t('newGameSetupModal.selectPlayers', 'Select Players')}
                playersSelectedText={t('newGameSetupModal.playersSelected', 'selected')}
                selectAllText={t('newGameSetupModal.selectAll', 'Select All')}
                noPlayersText={t('newGameSetupModal.noPlayersInRoster', 'No players in roster. Add players in Roster Settings.')}
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
                            {seasons.filter(season => !season.archived).map((season) => (
                              <option key={season.id} value={season.id}>
                                {season.name}
                              </option>
                            ))}
                          </select>

                          {/* League Selection - shows when season is selected */}
                          {selectedSeasonId && (
                            <div className="mt-3">
                              <label htmlFor="leagueSelect" className="block text-sm font-medium text-slate-300 mb-1">
                                {t('seasonDetailsModal.leagueLabel', 'League')}
                              </label>
                              <select
                                id="leagueSelect"
                                value={leagueId}
                                onChange={(e) => {
                                  setLeagueId(e.target.value);
                                  if (e.target.value !== 'muu') setCustomLeagueName('');
                                }}
                                onKeyDown={handleKeyDown}
                                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                              >
                                <option value="">{t('seasonDetailsModal.selectLeague', '-- Select League --')}</option>
                                {FINNISH_YOUTH_LEAGUES.map(league => (
                                  <option key={league.id} value={league.id}>{league.name}</option>
                                ))}
                              </select>
                              {/* Custom League Name - shown when "Muu" selected */}
                              {leagueId === 'muu' && (
                                <div className="mt-2">
                                  <input
                                    type="text"
                                    value={customLeagueName}
                                    onChange={(e) => setCustomLeagueName(e.target.value)}
                                    onKeyDown={handleKeyDown}
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
                            value={selectedTournamentId || ''}
                            onChange={handleTournamentChange}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                          >
                            <option value="">{t('newGameSetupModal.selectTournament', '-- Select Tournament --')}</option>
                            {tournaments.filter(tournament => !tournament.archived).map((tournament) => (
                              <option key={tournament.id} value={tournament.id}>
                                {tournament.name}
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
          </div>

          {/* Footer */}
          <ModalFooter>
            <button onClick={onCancel} className={secondaryButtonStyle}>
              {t('common.cancelButton', 'Cancel')}
            </button>
            <button onClick={handleStartClick} className={primaryButtonStyle}>
              {t('newGameSetupModal.confirmAndStart', 'Confirm & Start Game')}
            </button>
          </ModalFooter>
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
