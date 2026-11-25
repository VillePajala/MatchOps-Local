'use client';

import LeagueSelectWithFilters from './LeagueSelectWithFilters';
import { useHoldUnsavedInput } from '@/utils/unsavedInputSignal';
import React, { useState, useRef, useCallback, useMemo, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { Player, Season, Tournament, Team, Personnel, GameType, Gender, Point } from '@/types';
import type { SavedGamesCollection } from '@/types/game';
import logger from '@/utils/logger';
import { getTeamRoster, getTeamDisplayName, getTeamBoundSeries, sortTeamsByName } from '@/utils/teams';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import { getLastHomeTeamName as utilGetLastHomeTeamName, saveLastHomeTeamName as utilSaveLastHomeTeamName } from '@/utils/appSettings';
import { getPlans } from '@/utils/playtimePlanner/storage';
import { buildVenueBook, type KnownVenue } from '@/utils/venueBook';
import { todayIso } from '@/utils/todayIso';
import { newGameIsPlayedDefault } from '@/utils/matchPlayedDefault';
import {
  buildNewGameDefaults,
  gamesNewestFirst,
  previousGameOfTeam,
  resolveFormation,
  venueFor,
} from '@/utils/newGameDefaults';
import { buildPrefillFromPlan } from '@/utils/playtimePlanner/prefill';
import type { PlaytimePlan, PlanGame } from '@/utils/playtimePlanner/types';
import { opponentFromLabel } from '@/utils/playtimePlanner/createFromPlan';
import type { PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import PlayerSelectionSection from './PlayerSelectionSection';
import PersonnelSelectionSection from './PersonnelSelectionSection';
import TeamOpponentInputs from './TeamOpponentInputs';
import { AGE_GROUPS, LEVELS } from '@/config/gameOptions';
import { CUSTOM_LEAGUE_ID } from '@/config/leagues';
import type { TranslationKey } from '@/i18n-types';
import ConfirmationModal from './ConfirmationModal';
import {
  CollapsibleModalHeader,
  ModalStickyPrimary,
  ModalSwitch,
  modalContainerStyle,
  cardStyle,
  sectionLabelStyle,
  labelStyle,
  inputBaseStyle,
  inputErrorStyle,
  selectStyle,
  fieldHintStyle,
  fieldErrorStyle,
  chipStyle,
  secondaryButtonStyle,
  segmentTrackStyle,
  segmentStyle,
  segmentSelectedStyle,
} from '@/styles/modalStyles';
import { FIELD_SIZES, PRESETS_BY_SIZE, getDefaultPresetIdForSize, getPresetById, getRecommendedFieldSize, type FieldSize } from '@/config/formationPresets';
import { officialFieldSize } from '@/config/officialFieldSize';
import { getStoredSetupAgeGroup, getStoredSetupFormat, useOnboardingUserId } from '@/components/setupWizardActive';
import { addOpponentToList, findExistingSpelling } from '@/utils/opponentNames';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { HiOutlineMapPin, HiOutlineArrowPath } from 'react-icons/hi2';
import { mapsSearchUrl } from '@/config/externalLinks';
import VenueInput from '@/components/VenueInput';
import TimeInput from '@/components/TimeInput';
import { teamMemberIds, activePlayers } from '@/utils/gamePlayerList';

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
    fieldNumber: string,
    locationLat: number | undefined,
    locationLng: number | undefined,
    locationAddress: string | undefined,
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
    },
    // Friendly / practice match: excluded from competitive stat totals by default.
    isFriendly?: boolean,
    formationPresetId?: string | null,
  ) => void;
  onCancel: () => void;
  /**
   * Opened from the planner's "Luo ottelu" on one planned game: the form opens
   * prefilled from that plan + planned game exactly as if the coach had picked
   * it under "Prefill from plan" (line-up, planned subs, period format, squad
   * limited to players still in the roster, and the plan link), with the
   * plan's team selected and the opponent taken from the game's label when it
   * names one. Read once per opening.
   */
  planSource?: { plan: PlaytimePlan; planGameId: string } | null;
  /** W1 roster bridge in game creation too: club write returning the saved
   *  player; the modal dup-checks and selects them into this setup. */
  onAddPlayerToRoster?: (name: string, nickname?: string) => Promise<import('@/types').Player | null>;
  // Fresh data from React Query
  masterRoster: Player[];
  seasons: Season[];
  /**
   * Persist a newly typed opponent onto the competition, so the next game can
   * pick it from the list. Optional: without it the "add to this league"
   * affordance simply does not appear. A CALLBACK rather than a mutation in
   * here on purpose - this modal receives its data as props and should not
   * acquire a QueryClient dependency to write one field.
   */
  onAddOpponentToSeason?: (seasonId: string, opponentName: string) => Promise<void>;
  /**
   * Every opponent name this coach has used anywhere - other competitions and
   * past games. Supplied by the host rather than queried here, so this modal
   * keeps taking its data as props.
   *
   * WHY NOT JUST THE SELECTED COMPETITION'S LIST: the opponent field is the
   * second thing on this form and the competition is picked a whole card
   * later, so a coach has always typed the name before a competition-scoped
   * suggestion could appear. Suggestions have to work from the first
   * keystroke to be worth anything.
   */
  knownOpponents?: string[];
  /**
   * Opponent names each competition has already met, keyed by season or
   * tournament id. Supplied by the host from saved games, so a competition's
   * list is useful without anyone curating one first.
   */
  playedOpponentsByCompetition?: Record<string, string[]>;
  /**
   * Replace every occurrence of one opponent spelling with another, across
   * games and competition lists. Supplied by the host, which owns the writes.
   * Without it the "use mine instead" offer simply does not appear.
   */
  onRenameOpponent?: (from: string, to: string) => Promise<unknown>;
  tournaments: Tournament[];
  teams: Team[];
  personnel: Personnel[];
  /** All saved games, used to offer a "Repeat last game" quick-fill. */
  savedGames?: SavedGamesCollection;
  /**
   * The venue book from settings (every venue ever used, kept when matches
   * are deleted). Optional so the modal still completes from its own games
   * when rendered without it.
   */
  knownVenues?: KnownVenue[];
}

/**
 * A sensible match date from a competition's start date.
 *
 * Returns the start date only when it is still ahead of us; otherwise today.
 * A competition that began in August says nothing about when the match a coach
 * is creating now will be played, and dating it to August is worse than a
 * neutral guess: it lands the match in the past, where the app reasonably
 * concludes it has been played.
 */
function laterOfTodayAnd(startDate: string | undefined): string {
  const today = todayIso();
  return startDate && startDate > today ? startDate : today;
}

const NewGameSetupModal: React.FC<NewGameSetupModalProps> = ({
  isOpen,
  initialPlayerSelection,
  demandFactor,
  onDemandFactorChange,
  onManageTeamRoster,
  onStart,
  onCancel,
  planSource,
  onAddPlayerToRoster,
  masterRoster,
  seasons,
  onAddOpponentToSeason,
  knownOpponents,
  playedOpponentsByCompetition,
  onRenameOpponent,
  tournaments,
  teams,
  personnel,
  savedGames,
  knownVenues: storedVenues,
}) => {
  const { t } = useTranslation();
  // A half-filled New Game form must survive a long switch to another app (review 7.1).
  useHoldUnsavedInput(isOpen);
  const { showToast } = useToast();
  const [homeTeamName, setHomeTeamName] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [gameDate, setGameDate] = useState(todayIso());
  const [gameLocation, setGameLocation] = useState('');
  const [fieldNumber, setFieldNumber] = useState('');
  const [locationLat, setLocationLat] = useState<number | undefined>(undefined);
  const [locationLng, setLocationLng] = useState<number | undefined>(undefined);
  const [locationAddress, setLocationAddress] = useState<string | undefined>(undefined);
  const locationMapUrl = mapsSearchUrl(gameLocation, locationLat, locationLng);

  /**
   * Typing clears the coordinates; picking sets them.
   *
   * A pin that no longer matches the words beside it is worse than no pin,
   * because nothing on screen reveals the disagreement.
   */
  const handleVenueChange = useCallback(
    (venue: { name: string; latitude?: number; longitude?: number; address?: string }) => {
      setGameLocation(venue.name);
      setLocationLat(venue.latitude);
      setLocationLng(venue.longitude);
      setLocationAddress(venue.address);
    },
    [],
  );
  /** "HH:MM" from the native time picker, or '' (no kick-off time yet). */
  const [gameTime, setGameTime] = useState<string>('');
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
  /** The team name was set by the defaults or typed: the late "last team name" read keeps off it. */
  const homeNameLockedRef = useRef(false);
  /** The venue came from the previous game and is untouched, so a home/away flip may swap it. */
  const venueFromDefaultsRef = useRef(false);
  /** Assigned every render below (it closes over the handlers); run once per opening. */
  const applyNewGameDefaultsRef = useRef<() => void>(() => {});
  /** The planner's "Luo ottelu" source, read once per opening (after the defaults). */
  const planSourceRef = useRef(planSource);
  planSourceRef.current = planSource;
  const applyPlanSourceRef = useRef<() => void>(() => {});
  /** The team the defaults picked this opening (a plan for another team re-picks the competition). */
  const defaultsTeamIdRef = useRef<string | null>(null);

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
  /**
   * "Not played yet", derived from the DATE unless the coach says otherwise.
   *
   * IT USED TO DEFAULT TO PLAYED, AND THAT CORRUPTED THE SEASON RECORD. A coach
   * who creates Saturday's fixture on Wednesday got a match marked played with
   * a 0-0 scoreline - and resolveGameResult reads 0-0 as a DRAW, so every
   * fixture booked in advance counted as a draw until it was played. A record
   * reading "14 peliä · 4-10-0" was mostly matches that had not happened.
   *
   * A match that has not happened yet cannot have been played, so the date
   * already knows the answer - see `matchPlayedDefault`, which is the single
   * definition of that rule and explains why TODAY counts as not-yet-played.
   * Derived rather than stored so that an explicit toggle still wins and
   * changing the date afterwards still updates the default - and so there is
   * no setState in an effect to cascade renders.
   *
   * Onboarding v3 (owner): the switch starts OFF - today and past dates default
   * to played, because this form opens the match. A FUTURE date still defaults
   * to not played; see `newGameIsPlayedDefault`.
   */
  const [isPlayedOverride, setIsPlayedOverride] = useState<boolean | null>(null);
  const today = todayIso();
  const isPlayed = isPlayedOverride ?? newGameIsPlayedDefault(gameDate, today);
  const setIsPlayed = (next: boolean | ((v: boolean) => boolean)) =>
    setIsPlayedOverride((prev) => {
      const current = prev ?? newGameIsPlayedDefault(gameDate, today);
      return typeof next === 'function' ? next(current) : next;
    });
  const [isFriendly, setIsFriendly] = useState<boolean>(false);

  // Game type state - defaults to 'soccer', can be prefilled from season/tournament
  const [gameType, setGameType] = useState<GameType>('soccer');
  // Owner round 2: the coach chooses the starting formation at creation
  // (null = auto). Validated against the CURRENT squad size's presets at use,
  // so a stale pick from another size silently falls back to auto.
  const [formationPresetId, setFormationPresetId] = useState<string | null>(null);

  // Gender state - optional, can be prefilled from season/tournament
  const [gender, setGender] = useState<Gender | undefined>(undefined);

  // Players offered for a new game: the club roster without archived players. Used
  // everywhere this form lists or pre-selects players; the duplicate-name check below
  // still uses the full roster (an archived player's name is taken).
  const pickableRoster = useMemo(() => activePlayers(masterRoster), [masterRoster]);

  // Player selection state - start with empty selection (no players pre-selected)
  const [availablePlayersForSetup, setAvailablePlayersForSetup] = useState<Player[]>(pickableRoster);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  // The wizard's Pelimuoto answer (store-fed userId - context-free,
  // test-safe) beats the player-count guess for the DEFAULT formation
  // size (audit 1.16). DELIBERATELY permanent, not first-game-only: the
  // answer describes the TEAM's format, which rarely changes mid-season -
  // and it is only a default, one tap away from any other shape
  // (review #742 issue 3; owner can veto).
  const onboardingUserId = useOnboardingUserId();
  // Read through a ref inside the reset effect rather than adding it to that
  // effect's deps: the id settles once when auth resolves, and if the modal
  // happened to be open at that moment a dependency would reset the form
  // under the coach mid-edit.
  const onboardingUserIdRef = useRef(onboardingUserId);
  onboardingUserIdRef.current = onboardingUserId;
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

  /**
   * The player selection was changed by hand. Two jobs: a roster that arrives
   * late from the defaults must not overwrite the coach's edit, and the player
   * COUNT only starts to suggest a format once the coach has chosen the squad
   * (a defaulted selection is the whole team - see resolveFormation).
   */
  const [playersTouched, setPlayersTouched] = useState(false);
  const playersTouchedRef = useRef(false);
  const handleSelectedPlayersChange = useCallback((ids: string[]) => {
    playersTouchedRef.current = true;
    setPlayersTouched(true);
    setSelectedPlayerIds(ids);
  }, []);

  /**
   * The format shown and created with, from ONE precedence (utils/newGameDefaults):
   * explicit pick -> plan prefill -> the team's previous game -> the wizard's
   * Pelimuoto -> the official format for the age group -> the player count
   * (only once the coach has edited the selection). The wizard's answer is
   * DELIBERATELY permanent, not first-game-only: it describes the TEAM's format
   * (review #742 issue 3). Null = "Automatic".
   */
  const teamPreviousGame = useMemo(
    () => previousGameOfTeam(savedGames, selectedTeamId),
    [savedGames, selectedTeamId],
  );
  const resolvedFormation = useMemo(
    () =>
      resolveFormation({
        planSnapPoints: prefillPayload?.formationSnapPoints,
        previousGame: teamPreviousGame,
        storedFormat: getStoredSetupFormat(onboardingUserId),
        ageGroup,
        sport: gameType,
        gameDate,
        playerCount: selectedPlayerIds.length,
        playersTouched,
      }),
    [prefillPayload, teamPreviousGame, onboardingUserId, ageGroup, gameType, gameDate, selectedPlayerIds.length, playersTouched],
  );
  const explicitPreset = formationPresetId ? getPresetById(formationPresetId) : undefined;
  /** The size tagged "Recommended" and used when the coach leaves "Automatic". */
  const preferredFormationSize: FieldSize =
    resolvedFormation?.fieldSize ?? getRecommendedFieldSize(selectedPlayerIds.length);

  /**
   * The official format for this age group, when there is one worth naming.
   *
   * Only appears once the coach has given an age group AND the chosen
   * formation disagrees with it - a hint that restates what you already picked
   * is noise. It never blocks or changes the choice: a series may deviate from
   * the national default, and the coach is the one who knows.
   *
   * Dated by the GAME, not by today, so a fixture scheduled into next season
   * gets next season's answer. Football's new formats do not start until
   * season 2027, and until then this says nothing for football rather than
   * claiming a U10 team should be playing 5v5 when their league still says
   * 8v8 (see config/officialFieldSize).
   *
   * null = nothing to say: no age group, no table in force yet, or they match.
   */
  const formatMismatch = useMemo(() => {
    const official = officialFieldSize(ageGroup, gameType, gameDate);
    if (!official) return null;
    const effective = explicitPreset?.fieldSize ?? preferredFormationSize;
    return effective === official.fieldSize ? null : official;
  }, [ageGroup, gameType, gameDate, explicitPreset, preferredFormationSize]);

  // Confirmation modal state
  const [showManageRosterConfirm, setShowManageRosterConfirm] = useState(false);
  const [emptyRosterTeamId, setEmptyRosterTeamId] = useState<string | null>(null);

  // Track if modal just opened - use layout effect to sync before paint
  const wasOpenRef = useRef(false);
  const initializingRef = useRef(false);

  // "Repeat last game": the most recent saved game (by createdAt, fall back to
  // updatedAt), used to quick-fill the non-cascading fields below. Team-aware:
  // with a team selected it is THAT team's last game, so repeating never pulls
  // another team's opponent and squad into this one.
  const lastGame = useMemo(
    () =>
      selectedTeamId
        ? previousGameOfTeam(savedGames, selectedTeamId)
        : gamesNewestFirst(savedGames)[0] ?? null,
    [savedGames, selectedTeamId],
  );

  /**
   * The venues this coach has actually played at, offered ahead of any map
   * result. Derived from the same saved games already in hand, so it costs one
   * pass over a list the modal has anyway.
   */
  const knownVenues = useMemo(
    () => storedVenues ?? buildVenueBook(savedGames ? Object.values(savedGames) : []),
    [storedVenues, savedGames],
  );

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
    // The pin belongs to the venue, so it travels with it.
    setLocationLat(lastGame.locationLat);
    setLocationLng(lastGame.locationLng);
    setLocationAddress(lastGame.locationAddress);
    // The pitch is deliberately NOT carried over. Repeating a game is about
    // not retyping the opponent and the venue; the pitch is the one part that
    // commonly differs between two matches at the same place, so an empty box
    // beats a stale number.
    setFieldNumber('');
    setLocalPeriodDurationString(lastGame.periodDurationMinutes ? String(lastGame.periodDurationMinutes) : '15');
    setLocalNumPeriods(lastGame.numberOfPeriods === 1 ? 1 : 2);
    setLocalHomeOrAway(lastGame.homeOrAway === 'away' ? 'away' : 'home');
    setGameType(lastGame.gameType ?? 'soccer');
    if (typeof lastGame.demandFactor === 'number') onDemandFactorChange(lastGame.demandFactor);
    // Only carry over players who are still in the master roster.
    setSelectedPlayerIds((lastGame.selectedPlayerIds ?? []).filter(id => pickableRoster.some(p => p.id === id)));
    showToast(t('newGameSetupModal.repeatedLastGame', 'Filled from your last game'), 'success');
  }, [lastGame, pickableRoster, onDemandFactorChange, showToast, t]);

  // Memoize reset function
  const resetForm = useCallback(() => {
    setOpponentName('');
    setGameDate(todayIso());
    setGameLocation('');
    setGameTime('');
    setSelectedSeasonId(null);
    setSelectedTournamentId(null);
    setSelectedTournamentSeriesId(null);
    setSelectedTeamId(null);
    setLocalNumPeriods(2);
    setLocalPeriodDurationString('15');
    setLocalHomeOrAway('home');
    setAvailablePlayersForSetup(pickableRoster);
    if (initialPlayerSelection && initialPlayerSelection.length > 0) {
      // Only players the form offers: an archived player from the previous game's
      // line-up would be counted but not shown (like handleRepeatLastGame).
      setSelectedPlayerIds(initialPlayerSelection.filter(id => pickableRoster.some(p => p.id === id)));
    } else {
      // No team selected - start with no players pre-selected
      setSelectedPlayerIds([]);
    }
    playersTouchedRef.current = false;
    setPlayersTouched(false);
    setFormationPresetId(null);
    setSelectedPersonnelIds([]);
    setActiveTab('none');
    // The coach's own Ikäluokka answer from the setup wizard, if they gave
    // one. A DEFAULT only: picking a season or tournament overwrites it below
    // (applySeasonSettings / the tournament branch), because an explicit
    // competition setting is a statement about this fixture while this is a
    // guess about the coach. Without this the wizard's answer would sit in
    // localStorage unread and change nothing a coach can see.
    setAgeGroup(getStoredSetupAgeGroup(onboardingUserIdRef.current) ?? '');
    setTournamentLevel('');
    setLeagueId('');
    setCustomLeagueName('');
    setGameType('soccer'); // Reset to default
    setGender(undefined); // Reset to not set
  }, [pickableRoster, initialPlayerSelection]);

  // Initialize form when modal opens - using layout effect to avoid setState in regular effect
  React.useLayoutEffect(() => {
    if (isOpen && !wasOpenRef.current && !initializingRef.current) {
      initializingRef.current = true;
      resetForm();
      homeNameLockedRef.current = false;
      venueFromDefaultsRef.current = false;
      // The coach's team, its players and its previous game's settings (D6).
      // Once per opening: the host renders this form only after the teams,
      // games and competitions have loaded, and nothing re-applies it later
      // over the coach's edits.
      applyNewGameDefaultsRef.current();

      // Reset + load Playing-Time Planner plans for the optional "Prefill from plan".
      setPrefillPlanId('');
      setPrefillGameId('');
      setPrefillPayload(undefined);
      setPrefillMissingCount(0);
      // Opened from the planner's "Luo ottelu": prefill from that planned game.
      // AFTER the defaults, so the plan's line-up, format and team win over the
      // previous game's.
      applyPlanSourceRef.current();
      const loadPlans = async () => {
        try {
          const plans = await getPlans();
          const sourcePlanId = planSourceRef.current?.plan.id;
          setPlaytimePlans(
            Object.values(plans)
              // Archived plans are hidden in the planner by default; offering them
              // here as prefill sources made them reappear (review 7.L3). The plan
              // this form was opened FROM stays listed, so the picker shows it.
              .filter((plan) => !plan.archived || plan.id === sourcePlanId)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
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
          // A slow read must not overwrite the preselected team's name or
          // anything the coach typed meanwhile.
          if (homeNameLockedRef.current) return;
          setHomeTeamName(lastHomeTeam || t('newGameSetupModal.defaultTeamName', 'My Team'));
        } catch (err) {
          logger.error("[NewGameSetupModal] Error loading last home team name:", err);
          if (homeNameLockedRef.current) return;
          setHomeTeamName(t('newGameSetupModal.defaultTeamName', 'My Team'));
        }
      };
      loadLastTeamName();

      // No auto-focus on open (owner round 4): the self-raising keyboard hid
      // the first-visit card at the top - the keyboard now rises only when a
      // field is tapped. The init flag keeps its deferred clear.
      setTimeout(() => {
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

  /** Build + apply the prefill for one planned game (shared by the picker and planSource). */
  const applyPlanPrefill = useCallback(
    (plan: PlaytimePlan, game: PlanGame, roster: Player[]) => {
      const result = buildPrefillFromPlan(plan, game, roster);
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
        sourcePlanId: plan.id,
        sourcePlanGameId: game.id,
      });
      setPrefillMissingCount(result.missingPlayerIds.length);
    },
    [],
  );

  applyPlanSourceRef.current = () => {
    const source = planSourceRef.current;
    if (!source) return;
    const game = source.plan.games.find((g) => g.id === source.planGameId);
    if (!game) return;
    // The plan's own team, when it still exists and the defaults picked another
    // one. fromDefaults: no empty-roster prompt interrupts.
    const planTeam = source.plan.teamId ? teams.find((tm) => tm.id === source.plan.teamId) : undefined;
    if (planTeam && planTeam.id !== defaultsTeamIdRef.current) {
      void handleTeamSelection(planTeam.id, { fromDefaults: true });
      // The defaults' competition belonged to another team: use this team's
      // own (bound) competition instead, or none.
      setSelectedSeasonId(null);
      setSelectedTournamentId(null);
      setSelectedTournamentSeriesId(null);
      setTournamentLevel('');
      setActiveTab('none');
      applyTeamBoundCompetition(planTeam);
    }
    setPrefillPlanId(source.plan.id);
    setPrefillGameId(game.id);
    applyPlanPrefill(source.plan, game, pickableRoster);
    // The plan's squad is the selection: a team roster that loads after this
    // must not replace it (handleTeamSelection keeps a touched selection).
    playersTouchedRef.current = true;
    // A label naming the opponent starts the field; a "(koti)"/"(vieras)" on it
    // sets the side instead of ending up in the name. Never the coach's own team.
    const fromLabel = opponentFromLabel(game.label, teams.map((tm) => tm.name));
    setOpponentName(fromLabel.opponent);
    if (fromLabel.homeOrAway) {
      setLocalHomeOrAway(fromLabel.homeOrAway);
      // A venue from the previous game belongs to that game's side (D26): use
      // the team's last venue on the side the plan names, or none.
      if (venueFromDefaultsRef.current) {
        const teamId = planTeam?.id ?? defaultsTeamIdRef.current;
        handleVenueChange(venueFor(savedGames, teamId, fromLabel.homeOrAway) ?? { name: '' });
        setFieldNumber('');
      }
    }
  };

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
      applyPlanPrefill(plan, game, availablePlayersForSetup);
    },
    [playtimePlans, prefillPlanId, availablePlayersForSetup, applyPlanPrefill],
  );

  // Memoize selected tournament lookup to avoid duplicate find() calls in render
  const selectedTournament = useMemo(() => {
    if (!selectedTournamentId) return null;
    return tournaments.find(t => t.id === selectedTournamentId) || null;
  }, [tournaments, selectedTournamentId]);

  // The teams listed on the competition this game belongs to. Offered as a
  // dropdown; the field stays free text, so nothing here can block a game.
  //
  // Curated names first, then the ones this competition has actually played.
  // A coach who took the trouble to list their league should see their own
  // order; everyone else - which prod says is everyone, 0 of 9 seasons have a
  // list - still gets a useful list built from their own fixtures.
  const competitionId = selectedSeasonId ?? selectedTournamentId;
  const seasonOpponents = useMemo<string[]>(() => {
    const curated = selectedSeasonId
      ? seasons.find((s) => s.id === selectedSeasonId)?.opponents ?? []
      : [];
    const played = competitionId ? playedOpponentsByCompetition?.[competitionId] ?? [] : [];
    return [...curated, ...played].reduce<string[]>(
      (kept, name) => addOpponentToList(kept, name),
      [],
    );
  }, [selectedSeasonId, seasons, competitionId, playedOpponentsByCompetition]);

  // The competition's own teams lead, because those were curated for exactly
  // this fixture; everything else the coach has ever typed follows, so the
  // field is useful before a competition has been chosen at all.
  const opponentOptions = useMemo<string[]>(
    () => [...seasonOpponents, ...(knownOpponents ?? [])].reduce<string[]>(
      (kept, name) => addOpponentToList(kept, name),
      [],
    ),
    [seasonOpponents, knownOpponents],
  );

  /** A spelling the coach chose over the adopted one. Exempt from adoption. */
  const [insistedSpelling, setInsistedSpelling] = useState<string | null>(null);

  /**
   * The spelling already in use for what the coach typed, or what they typed.
   *
   * `findExistingSpelling` was written for exactly this and was never wired to
   * anything - it only decided whether to offer "add to this league", so the
   * raw keystrokes still became the game's opponent. Prod shows what that
   * costs: 13 opponents carry more than one spelling, one of them seven
   * ("LAUTP / Sininen", "Lautp sininen", "LAUTP/Sininen", ...), and every
   * variant differs only in case, spacing or slash - exactly what the
   * normaliser already collapses.
   *
   * Matching is exact-after-normalising, never fuzzy, so a genuinely new name
   * is returned untouched and "IPS/Punainen" is never adopted onto
   * "IPS/Sininen". See utils/opponentNames.ts for why that matters here.
   */
  const canonicalOpponent = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      // A spelling the coach explicitly kept is never overridden again. The
      // rename that backs their choice refreshes the pool asynchronously, so
      // without this the submit-time pass could still see the old spelling and
      // quietly undo the very correction they just made.
      if (insistedSpelling && trimmed === insistedSpelling) return trimmed;
      return findExistingSpelling(trimmed, opponentOptions) ?? trimmed;
    },
    [opponentOptions, insistedSpelling],
  );

  /**
   * The spelling the coach typed, when adoption overrode it. Drives the offer
   * to push their spelling back over the history instead.
   *
   * WITHOUT THIS, ADOPTION IS A TRAP. Once every entry is rewritten onto the
   * first spelling, a second spelling can never appear, so "most used" can
   * never shift and the sweep tool - which only lists names written two or
   * more ways - never shows the name again. A name captured wrongly on its
   * first use would have no route back. Refusal is what makes adoption safe.
   */
  const [adoptedOver, setAdoptedOver] = useState<{ typed: string; adopted: string } | null>(null);

  // Applied on blur so the coach SEES the field settle on the existing
  // spelling before starting the game. Silently rewriting it at submit alone
  // would be a change they never witnessed - and a change they cannot see is
  // one they cannot refuse.
  const handleOpponentBlur = useCallback(() => {
    setOpponentName((current) => {
      const typed = current.trim();
      const adopted = canonicalOpponent(typed);
      setAdoptedOver(adopted && typed && adopted !== typed ? { typed, adopted } : null);
      return adopted;
    });
  }, [canonicalOpponent]);

  // Typing again is its own answer: the offer belongs to the text that is gone.
  const handleOpponentNameChange = useCallback((value: string) => {
    setAdoptedOver(null);
    setInsistedSpelling((current) => (current === value.trim() ? current : null));
    setOpponentName(value);
  }, []);

  /**
   * "No, use mine" - keep the typed spelling AND rewrite every game and
   * competition list that used the other one, so the correction is not undone
   * by the next adoption.
   */
  const [keepingTyped, setKeepingTyped] = useState(false);
  const handleKeepTypedSpelling = useCallback(async () => {
    if (!adoptedOver || !onRenameOpponent) return;
    const { typed, adopted } = adoptedOver;
    setKeepingTyped(true);
    try {
      await onRenameOpponent(adopted, typed);
      setInsistedSpelling(typed);
      setOpponentName(typed);
      setAdoptedOver(null);
    } catch {
      showToast(t('newGameSetupModal.keepSpellingFailed', 'Could not change the spelling. Please try again.'), 'error');
    } finally {
      setKeepingTyped(false);
    }
  }, [adoptedOver, onRenameOpponent, showToast, t]);

  // A typed name that is not on the list yet. Offering to add it HERE rather
  // than sending the coach to the competition manager is the point: a detour
  // mid-form is how the list stays empty forever.
  const [addingOpponent, setAddingOpponent] = useState(false);
  const opponentIsNew = useMemo(() => {
    const trimmed = opponentName.trim();
    if (!trimmed || !selectedSeasonId) return false;
    if (!onAddOpponentToSeason) return false;
    return !findExistingSpelling(trimmed, seasonOpponents);
  }, [opponentName, selectedSeasonId, seasonOpponents, onAddOpponentToSeason]);

  const handleAddOpponentToSeason = useCallback(async () => {
    const trimmed = opponentName.trim();
    if (!trimmed || !selectedSeasonId || !onAddOpponentToSeason) return;
    setAddingOpponent(true);
    try {
      await onAddOpponentToSeason(selectedSeasonId, trimmed);
    } catch {
      // Non-fatal by design: failing to remember the name must never stop the
      // coach creating the game they are in the middle of creating.
      showToast(t('newGameSetupModal.opponentAddFailed', 'Could not add the team to the league.'), 'error');
    } finally {
      setAddingOpponent(false);
    }
  }, [opponentName, selectedSeasonId, onAddOpponentToSeason, showToast, t]);

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
      // The competition sets the VENUE, so the pitch that belonged to the
      // previous venue must go. A season or tournament cannot know which pitch
      // a given match lands on - and before the split, a competition whose
      // location read "Kimpisen kentta TN 2" handed TN 2 to every game in it.
      setFieldNumber('');
      // The competition names a venue but does not know where it is, so any pin
      // from a previously picked location would now point at the wrong place.
      setLocationLat(undefined);
      setLocationLng(undefined);
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
      // THE COMPETITION'S START DATE IS NOT THE MATCH'S DATE, and treating it
      // as one is what produced a season record full of draws nobody played.
      // A Kausi runs from August; picking it dated every match created for it
      // to mid-August, in the past - so "not played yet" derived to played, a
      // 0-0 scoreline resolved to a DRAW, and a booked fixture joined the
      // record as a result. The owner's Home read "14 peliä, 4-10-0" almost
      // entirely from matches that had not happened.
      //
      // A tournament is the one case where the start date is a plausible guess
      // at the match date, since its games fall inside a few days - but only
      // when it has not started. In the past it is the same trap, so today
      // wins whenever the competition already began.
      setGameDate(laterOfTodayAnd(s.startDate));
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
      venueFromDefaultsRef.current = false;
      setSelectedSeasonId(value);
      setSelectedTournamentId(null);
      applySeasonSettings(value);
    } else {
      setSelectedSeasonId(null);
      setActiveTab('none');
    }
  };

  /**
   * Fill the form from the team's bound competition. Synchronous, so the
   * defaults can apply their overrides after it (see applyNewGameDefaults).
   */
  const applyTeamBoundCompetition = (team: Team) => {
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
  };

  /**
   * Team selection: name and bound competition at once, then the team's
   * players once its roster has loaded.
   *
   * @param options.fromDefaults the form preselected this team on opening (not
   *   a tap): no empty-roster prompt, the competition is left to the defaults,
   *   and a roster arriving after the coach has edited the selection is ignored.
   * @param options.keepPlayers an explicit selection (in-match "new game")
   *   wins over the team's roster.
   */
  const handleTeamSelection = async (
    teamId: string | null,
    options: { fromDefaults?: boolean; keepPlayers?: boolean } = {},
  ) => {
    const { fromDefaults = false, keepPlayers = false } = options;
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
      // Auto-fill team name (but keep it editable) and the team's bound
      // competition BEFORE the roster await, so nothing that follows (the
      // defaults' overrides, the coach's own edits) can be overwritten by it.
      const team = teams.find(t => t.id === teamId);
      if (team) {
        setHomeTeamName(team.name);
        setIsTeamNameAutoFilled(true);
        homeNameLockedRef.current = true;
        if (!fromDefaults) {
          venueFromDefaultsRef.current = false;
          applyTeamBoundCompetition(team);
        }
      }
      if (keepPlayers) return;

      try {
        // Load team roster
        const teamRoster = await getTeamRoster(teamId);

        // Check if this is still the current request
        if (requestId !== teamSelectionRequestRef.current) {
          return; // A newer request has been made, abandon this one
        }
        // The coach already chose the squad while the roster loaded: keep theirs.
        if (fromDefaults && playersTouchedRef.current) return;

        // Always show master roster from props, but pre-select only team players
        setAvailablePlayersForSetup(pickableRoster);

        if (teamRoster && teamRoster.length > 0) {
          // Pre-select the team's players: by id, with a per-player name
          // fallback for rosters whose ids never matched (duplicated teams)
          const selectedIds = teamMemberIds(teamRoster, pickableRoster);

          setSelectedPlayerIds(selectedIds);
        } else {
          // Team roster is empty - no players pre-selected
          setSelectedPlayerIds([]);

          // Prompt to manage the roster - only when the coach picked the team.
          if (!fromDefaults) {
            setEmptyRosterTeamId(teamId);
            setShowManageRosterConfirm(true);
          }
        }
      } catch (error) {
        logger.error('[NewGameSetupModal] Error loading team roster:', error);

        // Check if this is still the current request
        if (requestId !== teamSelectionRequestRef.current) {
          return;
        }
        if (fromDefaults && playersTouchedRef.current) return;

        // Fallback to master roster on error
        setAvailablePlayersForSetup(pickableRoster);
        setSelectedPlayerIds([]); // No players selected on error
      }
    } else {
      // No team selected - use master roster with no players pre-selected
      setAvailablePlayersForSetup(pickableRoster);
      setSelectedPlayerIds([]);

      // Clear team name only if it was auto-filled (preserve manual input)
      if (isTeamNameAutoFilled) {
        setHomeTeamName('');
        setIsTeamNameAutoFilled(false);
      }
    }
  };

  const handleTeamNameChange = (newName: string) => {
    homeNameLockedRef.current = true;
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
      // The competition sets the VENUE, so the pitch that belonged to the
      // previous venue must go. A season or tournament cannot know which pitch
      // a given match lands on - and before the split, a competition whose
      // location read "Kimpisen kentta TN 2" handed TN 2 to every game in it.
      setFieldNumber('');
      // The competition names a venue but does not know where it is, so any pin
      // from a previously picked location would now point at the wrong place.
      setLocationLat(undefined);
      setLocationLng(undefined);
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
      // Same rule as the season branch above - see the note there.
      setGameDate(laterOfTodayAnd(tournament.startDate));
      setActiveTab('tournament');
      // Prefill game type from tournament (defaults to 'soccer' if not set)
      setGameType(tournament.gameType || 'soccer');
      // Prefill gender from tournament (undefined if not set)
      setGender(tournament.gender);
    }
  }, [tournaments, prefillPayload]);

  /**
   * The form's starting values (Onboarding v3, D6/D7/D26) - see
   * utils/newGameDefaults for the rules. Order matters: team (name, players)
   * -> competition (the previous game's, else the team's bound one) -> the
   * previous game's own values last, because applying a competition
   * overwrites venue, periods and age group.
   */
  applyNewGameDefaultsRef.current = () => {
    const defaults = buildNewGameDefaults({
      teams,
      games: savedGames,
      seasons,
      tournaments,
      fallbackAgeGroup: getStoredSetupAgeGroup(onboardingUserIdRef.current) ?? undefined,
    });
    const team = defaults.teamId ? teams.find((t) => t.id === defaults.teamId) : undefined;
    defaultsTeamIdRef.current = team?.id ?? null;
    if (team) {
      void handleTeamSelection(team.id, {
        fromDefaults: true,
        keepPlayers: !!initialPlayerSelection && initialPlayerSelection.length > 0,
      });
    }

    const competition = defaults.competition;
    if (competition?.kind === 'season') {
      setSelectedSeasonId(competition.id);
      setSelectedTournamentId(null);
      applySeasonSettings(competition.id);
    } else if (competition?.kind === 'tournament') {
      setSelectedTournamentId(competition.id);
      setSelectedSeasonId(null);
      applyTournamentSettings(competition.id);
      const series = competition.seriesId
        ? tournaments.find((tt) => tt.id === competition.id)?.series?.find((se) => se.id === competition.seriesId)
        : undefined;
      if (series) {
        setSelectedTournamentSeriesId(series.id);
        setTournamentLevel(series.level);
      }
    } else if (team) {
      applyTeamBoundCompetition(team);
    }

    if (defaults.periods) {
      setLocalNumPeriods(defaults.periods.numberOfPeriods);
      setLocalPeriodDurationString(String(defaults.periods.periodMinutes));
    }
    if (defaults.homeOrAway) setLocalHomeOrAway(defaults.homeOrAway);
    if (defaults.venue) {
      handleVenueChange(defaults.venue);
      setFieldNumber('');
      venueFromDefaultsRef.current = true;
    }
    if (defaults.ageGroup) setAgeGroup(defaults.ageGroup);
    if (defaults.gameType) setGameType(defaults.gameType);
  };

  /**
   * Home / away. A venue that came from the previous game belongs to that
   * game's side (D26), so flipping the side swaps it for the team's last venue
   * on the new side, or clears it - unless the coach has changed the venue.
   */
  const handleHomeOrAwayChange = (side: 'home' | 'away') => {
    setLocalHomeOrAway(side);
    if (side === localHomeOrAway || !venueFromDefaultsRef.current) return;
    const venue = venueFor(savedGames, selectedTeamId, side);
    handleVenueChange(venue ?? { name: '' });
    setFieldNumber('');
  };

  const handleTournamentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value) {
      venueFromDefaultsRef.current = false;
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
    // Canonicalised, not just trimmed: blur normally handles this, but a name
    // that arrived by prefill ("repeat last game") and was submitted without
    // the field ever being focused would otherwise slip through untouched.
    const trimmedOpponentName = canonicalOpponent(opponentName);

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

    // Validate period duration
    const duration = parseInt(localPeriodDurationString, 10);
    if (isNaN(duration) || duration <= 0) {
        setPeriodDurationError(t('newGameSetupModal.invalidPeriodDuration', 'Period duration must be a positive number.'));
        return;
    }

    // Validate custom league name when "Muu" is selected
    if (leagueId === CUSTOM_LEAGUE_ID && !customLeagueName.trim()) {
        setCustomLeagueError(t('newGameSetupModal.customLeagueNameRequired', 'Please enter the other league name.'));
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
      fieldNumber.trim(),
      locationLat,
      locationLng,
      locationAddress,
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
      prefillPayload, // Planner prefill (Phase 2): planned XI + subs, or undefined
      isFriendly, // Friendly / practice match flag
      // Any KNOWN preset is valid regardless of squad size (owner round 6);
      // then the resolved default; "Automatic" falls back to the squad size.
      explicitPreset?.id ?? resolvedFormation?.presetId ?? getDefaultPresetIdForSize(preferredFormationSize),
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


  const modalTitleId = useId();

  if (!isOpen) return null;

  return (
    <div className={`${MODAL_BACKDROP} ${Z_LAYER.modal}`} role="dialog" aria-modal="true" aria-labelledby={modalTitleId}>
      <div className={`${modalContainerStyle} relative h-full w-full`}>
        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col min-h-0 h-full font-ui">
          {/* Modal-chrome slimming: X-header + pinned primary (Create) replace
              the header and the Cancel/Create footer. "Repeat last game"
              (utility) heads the scrolling form. */}
          <CollapsibleModalHeader
          titleId={modalTitleId}
            title={t('newGameSetupModal.title', 'Create New Match')}
            onClose={onCancel}
            closeLabel={t('common.cancelButton', 'Cancel')}
          />

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-2 pb-6 space-y-6">
            {/* A utility at the head of the form, not pinned: it scrolls away with it. */}
            {lastGame && (
              <button
                type="button"
                onClick={handleRepeatLastGame}
                className={`${secondaryButtonStyle} w-full min-h-12`}
              >
                <HiOutlineArrowPath className="w-[18px] h-[18px] text-ink-3" aria-hidden="true" />
                {t('newGameSetupModal.repeatLastGame', 'Repeat last game')}
              </button>
            )}
            {/* SECTION 1: Teams & Roster - a section label over one solid
                list surface; the player and personnel pickers follow as their
                own lists instead of nesting inside this card. */}
            <section>
              <h3 className={`${sectionLabelStyle} px-1 mb-2.5`}>
                {t('newGameSetupModal.teamsAndRosterLabel', 'Teams & Roster')}
              </h3>
              <div className={`${cardStyle} space-y-4`}>

              {/* Team Selection */}
              <div>
                <label htmlFor="teamSelectTop" className={labelStyle}>
                  {t('newGameSetupModal.selectTeamLabel', 'Select Team')}
                </label>
                <select
                  id="teamSelectTop"
                  value={selectedTeamId || ''}
                  onChange={(e) => handleTeamSelection(e.target.value || null)}
                  className={selectStyle}
                >
                  <option value="">
                    {t('newGameSetupModal.noTeamMasterRoster', 'No Team (Use Master Roster)')}
                  </option>
                  {sortTeamsByName(teams.filter(team => !team.archived)).map((team) => (
                    <option key={team.id} value={team.id}>
                      {getTeamDisplayName(team, seasons, tournaments, { futsalLabel: t('common.futsal', 'Futsal') })}
                    </option>
                  ))}
                </select>
                {selectedTeamId && (
                  <p className={fieldHintStyle}>
                    {t('newGameSetupModal.teamSelectedNote', 'Player roster will be loaded from selected team.')}
                  </p>
                )}
                {!selectedTeamId && (
                  <p className={fieldHintStyle}>
                    {teams.some((team) => !team.archived)
                      ? t('newGameSetupModal.selectTeamTip', 'Tip: pick a team to auto-fill its roster and linked competition.')
                      : t('newGameSetupModal.masterRosterNote', 'Using master roster - all players available.')}
                  </p>
                )}
              </div>

              {/* Team & Opponent Names */}
              <div>
                <TeamOpponentInputs
                  teamName={homeTeamName}
                  opponentName={opponentName}
                  onTeamNameChange={handleTeamNameChange}
                  onOpponentNameChange={(v) => { handleOpponentNameChange(v); if (opponentError) setOpponentError(null); }}
                  teamLabel={t('newGameSetupModal.homeTeamName', 'Your Team Name') + ' *'}
                  teamPlaceholder={t('newGameSetupModal.homeTeamPlaceholder', 'e.g., Galaxy U10')}
                  opponentLabel={t('newGameSetupModal.opponentNameLabel', 'Opponent Name') + ' *'}
                  opponentPlaceholder={t('newGameSetupModal.opponentPlaceholder', 'Enter opponent name')}
                  teamInputRef={homeTeamInputRef}
                  opponentInputRef={opponentInputRef}
                  onKeyDown={handleKeyDown}
                  teamError={homeTeamError}
                  opponentError={opponentError}
                  opponentOptions={opponentOptions}
                  onOpponentBlur={handleOpponentBlur}
                  opponentFooter={
                    /* The adoption notice outranks "add to this league": the
                       field just changed under the coach's hands, and telling
                       them so - with the way out - matters more than an
                       invitation to curate. */
                    adoptedOver && onRenameOpponent ? (
                      <div className="mt-2" data-testid="opponent-adopted-notice">
                        <p className="text-[13px] leading-snug text-ink-3">
                          {t(
                            'newGameSetupModal.opponentAdopted',
                            'Changed to “{{adopted}}”, the spelling you have used before.',
                            { adopted: adoptedOver.adopted },
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={handleKeepTypedSpelling}
                          disabled={keepingTyped}
                          data-testid="opponent-keep-typed"
                          className={`${chipStyle} mt-2`}
                        >
                          {keepingTyped
                            ? t('newGameSetupModal.keepSpellingWorking', 'Changing…')
                            : t('newGameSetupModal.keepSpelling', 'Use “{{typed}}” everywhere instead', {
                                typed: adoptedOver.typed,
                              })}
                        </button>
                      </div>
                    ) : opponentIsNew ? (
                      <button
                        type="button"
                        onClick={handleAddOpponentToSeason}
                        disabled={addingOpponent}
                        data-testid="opponent-add-to-season"
                        className={`${chipStyle} mt-2.5`}
                      >
                        {t('newGameSetupModal.addOpponentToSeason', 'Add to this league')}
                      </button>
                    ) : null
                  }
                />
              </div>

              {/* Prefill from a Playing-Time Planner plan (optional) */}
              {playtimePlans.length > 0 && (
                <div>
                  <label htmlFor="prefillPlanSelect" className={labelStyle}>
                    {t('newGameSetupModal.prefillFromPlanLabel', 'Prefill from plan (optional)')}
                  </label>
                  <select
                    id="prefillPlanSelect"
                    value={prefillPlanId}
                    onChange={(e) => handlePrefillPlanChange(e.target.value)}
                    className={selectStyle}
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
                      className={`${selectStyle} mt-2`}
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
                    <p className={fieldHintStyle}>
                      {t('newGameSetupModal.prefillMissingPlayers', '{{count}} planned players are not in this roster and were skipped.', {
                        count: prefillMissingCount,
                      })}
                    </p>
                  )}
                </div>
              )}

              </div>
            </section>

              {/* Player Selection */}
              <PlayerSelectionSection
                availablePlayers={availablePlayersForSetup}
                selectedPlayerIds={selectedPlayerIds}
                onSelectedPlayersChange={handleSelectedPlayersChange}
                title={t('newGameSetupModal.selectPlayers', 'Select Players')}
                playersSelectedText={t('newGameSetupModal.playersSelected', 'selected')}
                selectAllText={t('newGameSetupModal.selectAll', 'Select All')}
                noPlayersText={t('newGameSetupModal.noPlayersAddInline', 'No players yet - add your first player below.')}
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
                        playersTouchedRef.current = true;
                        setPlayersTouched(true);
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
                title={t('newGameSetupModal.selectPersonnel', 'Select Personnel (Coaches, Trainers, etc.)')}
              />

            {/* SECTION 2: Game Details */}
            <section>
              <h3 className={`${sectionLabelStyle} px-1 mb-2.5`}>
                {t('newGameSetupModal.gameDetailsLabel', 'Game Details')}
              </h3>
              <div className={`${cardStyle} space-y-4`}>

              {/* Game Type Tabs */}
              <div>
                <label className={labelStyle}>
                  {t('gameSettingsModal.gameTypeLabel', 'Link to Competition')}
                </label>
                <div className={segmentTrackStyle}>
                        <button
                          onClick={() => handleTabChange('none')}
                          aria-pressed={activeTab === 'none'}
                          className={activeTab === 'none' ? segmentSelectedStyle : segmentStyle}
                        >
                          {t('gameSettingsModal.eiMitaan', 'None')}
                        </button>
                        <button
                          onClick={() => handleTabChange('season')}
                          aria-pressed={activeTab === 'season'}
                          className={activeTab === 'season' ? segmentSelectedStyle : segmentStyle}
                        >
                          {t('gameSettingsModal.kausi', 'League')}
                        </button>
                        <button
                          onClick={() => handleTabChange('tournament')}
                          aria-pressed={activeTab === 'tournament'}
                          className={activeTab === 'tournament' ? segmentSelectedStyle : segmentStyle}
                        >
                          {t('gameSettingsModal.turnaus', 'Tournament')}
                        </button>
                </div>
              </div>

                      {/* Season Selection */}
                      {activeTab === 'season' && (
                        <div>
                          <select
                            id="seasonSelect"
                            value={selectedSeasonId || ''}
                            onChange={handleSeasonChange}
                            className={selectStyle}
                          >
                            <option value="">{t('newGameSetupModal.selectSeason', 'Select League')}</option>
                            {sortedSeasons.map((season) => (
                              <option key={season.id} value={season.id}>
                                {getSeasonDisplayName(season)}
                              </option>
                            ))}
                          </select>

                          {/* League Selection - shows when season is selected */}
                          {selectedSeasonId && (
                            <div className="mt-3">
                              <label htmlFor="leagueSelect" className={labelStyle}>
                                {t('newGameSetupModal.leagueLabel', 'Official league')}
                              </label>
                              {/* The Level/Area filters Match details has (review 7.L11). */}
                              <LeagueSelectWithFilters
                                id="leagueSelect"
                                filterIdSuffix="new"
                                value={leagueId}
                                placeholder={t('newGameSetupModal.selectLeague', 'Select official league')}
                                onChange={(value) => {
                                  setLeagueId(value);
                                  // Clear custom name when switching away from "Muu" (intentional)
                                  if (value !== CUSTOM_LEAGUE_ID) setCustomLeagueName('');
                                }}
                                onKeyDown={handleKeyDown}
                              />
                              {/* Custom League Name - shown when "Muu" selected */}
                              {leagueId === CUSTOM_LEAGUE_ID && (
                                <div className="mt-2">
                                  <input
                                    type="text"
                                    value={customLeagueName}
                                    onChange={(e) => { setCustomLeagueName(e.target.value); if (customLeagueError) setCustomLeagueError(null); }}
                                    onKeyDown={handleKeyDown}
                                    placeholder={t('newGameSetupModal.customLeaguePlaceholder', 'Enter the official league name')}
                                    className={`${inputBaseStyle} ${customLeagueError ? inputErrorStyle : ''}`}
                                  />
                                  {customLeagueError && <p className={fieldErrorStyle}>{customLeagueError}</p>}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tournament Selection */}
                      {activeTab === 'tournament' && (
                        <div>
                          <select
                            id="tournamentSelect"
                            value={selectedTournamentId || ''}
                            onChange={handleTournamentChange}
                            className={selectStyle}
                          >
                            <option value="">{t('newGameSetupModal.selectTournament', 'Select Tournament')}</option>
                            {sortedTournaments.map((tournament) => (
                              <option key={tournament.id} value={tournament.id}>
                                {getTournamentDisplayName(tournament)}
                              </option>
                            ))}
                          </select>
                          {selectedTournament && (
                            <div className="mt-2">
                              <label htmlFor="tournamentLevelInput" className={labelStyle}>
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
                                  className={selectStyle}
                                >
                                  <option value="">{t('common.selectSeries', 'Select level')}</option>
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
                                  className={selectStyle}
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
                      <div>
                        <label htmlFor="ageGroupSelect" className={labelStyle}>
                          {t('newGameSetupModal.ageGroupLabel', 'Age Group (Optional)')}
                        </label>
                        <select
                          id="ageGroupSelect"
                          value={ageGroup}
                          onChange={(e) => setAgeGroup(e.target.value)}
                          onKeyDown={handleKeyDown}
                          className={selectStyle}

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
              <div>
                <label className={labelStyle}>
                  {t('common.gameTypeLabel', 'Sport Type')}
                </label>
                <div className={segmentTrackStyle}>
                  <button
                    type="button"
                    onClick={() => setGameType('soccer')}
                    aria-pressed={gameType === 'soccer'}
                    className={gameType === 'soccer' ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.gameTypeSoccer', 'Soccer')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGameType('futsal')}
                    aria-pressed={gameType === 'futsal'}
                    className={gameType === 'futsal' ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.gameTypeFutsal', 'Futsal')}
                  </button>
                </div>
              </div>

              {/* Formation (owner round 2): choose the starting shape; options
                  follow the squad size selected above. */}
              <div>
                <label htmlFor="formationSelect" className={labelStyle}>
                  {t('newGameSetupModal.formationLabel', 'Formation')}
                </label>
                <select
                  id="formationSelect"
                  /* Owner rounds 4+6: ALL sizes are offered (squad size never
                     RESTRICTS the choice - a 15-player squad can still play
                     5v5 with subs); the player count only PRESELECTS and tags
                     the recommended size's default. Unknown/stale ids fall
                     back to that default. */
                  value={explicitPreset?.id ?? resolvedFormation?.presetId ?? ''}
                  onChange={(e) => setFormationPresetId(e.target.value || null)}
                  className={selectStyle}
                >
                  {/* Nothing to go on yet (no previous game, no age group, the
                      squad not chosen by hand): say so rather than tag a guess
                      such as "3v3 1-1 · Recommended" at zero players. */}
                  {!explicitPreset && !resolvedFormation && (
                    <option value="">{t('newGameSetupModal.formationAuto', 'Automatic')}</option>
                  )}
                  {FIELD_SIZES.map((size) => (
                    <optgroup key={size} label={size}>
                      {PRESETS_BY_SIZE[size].map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {t(preset.labelKey, preset.name)}
                          {resolvedFormation && preset.id === getDefaultPresetIdForSize(resolvedFormation.fieldSize)
                            ? ` · ${t('formations.recommended', 'Recommended')}`
                            : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {formatMismatch && (
                  <p
                    className={fieldHintStyle}
                    data-testid="format-nudge"
                  >
                    {t(
                      'newGameSetupModal.formatNudge',
                      '{{ageGroup}} officially plays {{official}}. You can still choose another - a series may differ.',
                      { ageGroup, official: formatMismatch.fieldSize },
                    )}
                  </p>
                )}
              </div>

              {/* Gender (Boys/Girls) */}
              <div>
                <label className={labelStyle}>
                  {t('common.genderLabel', 'Gender')}
                </label>
                <div className={segmentTrackStyle}>
                  <button
                    type="button"
                    onClick={() => setGender(undefined)}
                    aria-pressed={gender === undefined}
                    className={gender === undefined ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.genderNotSet', 'Not Set')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('boys')}
                    aria-pressed={gender === 'boys'}
                    className={gender === 'boys' ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.genderBoys', 'Boys')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('girls')}
                    aria-pressed={gender === 'girls'}
                    className={gender === 'girls' ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.genderGirls', 'Girls')}
                  </button>
                </div>
              </div>

                      {/* Date and time share one row (time is the narrow
                          column); then place, address and pitch - the same
                          order as the match details (GameSettingsModal). */}
                      <div className="grid grid-cols-1 min-[360px]:grid-cols-[minmax(0,1fr)_132px] gap-3">
                        <div className="min-w-0">
                          <label htmlFor="gameDateInput" className={labelStyle}>
                            {t('newGameSetupModal.gameDateLabel', 'Game Date')}
                          </label>
                          <input
                            type="date"
                            id="gameDateInput"
                            name="gameDate"
                            value={gameDate}
                            onChange={(e) => setGameDate(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className={`${inputBaseStyle} [color-scheme:dark]`}
                            autoComplete="off"

                          />
                        </div>

                        <div className="min-w-0">
                          <label htmlFor="gameTimeInput" className={labelStyle}>
                            {t('newGameSetupModal.gameTimeLabel', 'Time (Optional)')}
                          </label>
                          <TimeInput
                            id="gameTimeInput"
                            name="gameTime"
                            value={gameTime}
                            onChange={setGameTime}
                            onKeyDown={handleKeyDown}
                          />
                        </div>

                      </div>

                      {/* Game Location */}
                      <div>
                        {/* No label here: VenueInput is TWO labelled fields -
                            the name and the street address - and a heading over
                            both would only re-introduce the ambiguity about
                            which box is which. */}
                        <VenueInput
                          id="gameLocationInput"
                          value={gameLocation}
                          hasCoordinates={locationLat !== undefined}
                          latitude={locationLat}
                          longitude={locationLng}
                          address={locationAddress}
                          knownVenues={knownVenues}
                          onChange={(venue) => {
                            venueFromDefaultsRef.current = false;
                            handleVenueChange(venue);
                          }}
                          onKeyDown={handleKeyDown}
                          className={inputBaseStyle}
                        />
                        {/* Confirm the venue resolves BEFORE the drive, which is
                            the only moment it can still be corrected cheaply. */}
                        {locationMapUrl ? (
                          <a
                            href={locationMapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1.5 min-h-11 rounded font-ui text-sm font-semibold text-ink-2 underline-offset-[3px] hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                          >
                            <HiOutlineMapPin className="w-4 h-4 text-ink-3" aria-hidden="true" />
                            {t('common.checkOnMap', 'Check on map')}
                          </a>
                        ) : null}
                      </div>

                      {/* Pitch. Its own field because the venue above is what a
                          map searches for, and "TN 2" is exactly what stops one
                          finding it - see migration 047. */}
                      <div>
                        <label htmlFor="fieldNumberInput" className={labelStyle}>
                          {t('newGameSetupModal.fieldNumberLabel', 'Pitch (optional)')}
                        </label>
                        <input
                          type="text"
                          id="fieldNumberInput"
                          value={fieldNumber}
                          onChange={(e) => setFieldNumber(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={t('newGameSetupModal.fieldNumberPlaceholder', 'e.g., TN 2')}
                          className={inputBaseStyle}
                        />
                      </div>

              {/* Home/Away Selection */}
              <div>
                <label className={labelStyle}>
                  {t('newGameSetupModal.homeOrAwayLabel', 'Home / away')}
                </label>
                <div className={segmentTrackStyle}>
                  <button
                    onClick={() => handleHomeOrAwayChange('home')}
                    aria-pressed={localHomeOrAway === 'home'}
                    className={localHomeOrAway === 'home' ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.home', 'Home')}
                  </button>
                  <button
                    onClick={() => handleHomeOrAwayChange('away')}
                    aria-pressed={localHomeOrAway === 'away'}
                    className={localHomeOrAway === 'away' ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.away', 'Away')}
                  </button>
                </div>
              </div>
              </div>
            </section>

            {/* SECTION 3: Pelin asetukset (Game Configuration) */}
            <section>
              <h3 className={`${sectionLabelStyle} px-1 mb-2.5`}>
                {t('newGameSetupModal.gameConfigLabel', 'Game Configuration')}
              </h3>
              <div className={`${cardStyle} space-y-4`}>

              {/* Periods and period length: two half-width fields on one row. */}
              <div className="grid grid-cols-2 items-end gap-3">
              {/* Number of Periods */}
              <div className="min-w-0">
                <label htmlFor="numPeriodsSelect" className={labelStyle}>
                  {t('newGameSetupModal.numPeriodsLabel', 'Number of Periods')}
                </label>
                <select
                  id="numPeriodsSelect"
                  value={localNumPeriods}
                  onChange={(e) => setLocalNumPeriods(parseInt(e.target.value) as 1 | 2)}
                  className={selectStyle}
                >
                  <option value={1}>{t('newGameSetupModal.periodOptionOne', '1')}</option>
                  <option value={2}>{t('newGameSetupModal.periodOptionTwo', '2')}</option>
                </select>
              </div>

              {/* Period Duration */}
              <div className="min-w-0">
                <label htmlFor="periodDurationInput" className={labelStyle}>
                  {t('newGameSetupModal.periodDurationLabel', 'Period length (min)')}
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
                  className={`${inputBaseStyle} ${periodDurationError ? inputErrorStyle : ''}`}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  placeholder="15"
                />
                {periodDurationError && <p className={fieldErrorStyle}>{periodDurationError}</p>}
              </div>
              </div>

              {/* The demand-level slider used to sit here. Only the assessment
                  averaging reads it, behind a setting that is off by default, so
                  it left the form (owner, 2026-09-30); `demandFactor` stays in the
                  data model and the props so old games and callers are untouched. */}

              {/* Not played yet / friendly: hairline-separated rows of the card. */}
              <div>
                <ModalSwitch checked={!isPlayed} onToggle={() => setIsPlayed(v => !v)}>
                  {t('newGameSetupModal.unplayedToggle', 'Not played yet')}
                </ModalSwitch>
                <ModalSwitch checked={isFriendly} onToggle={() => setIsFriendly(v => !v)} hint={t('newGameSetupModal.friendlyHint', 'Kept out of competitive stats')}>
                  {t('newGameSetupModal.friendlyToggle', 'Friendly match')}
                </ModalSwitch>
              </div>
              </div>
            </section>
          </div>

          {/* Chrome slimming: the ONE commit action as a sticky bottom bar
              (thumb zone); Cancel is the header X / hardware back. */}
          <ModalStickyPrimary onClick={handleStartClick}>
            {t('newGameSetupModal.createGame', 'Create Game')}
          </ModalStickyPrimary>

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
