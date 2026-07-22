import React, { createContext, useContext, useState, useMemo, useRef, useReducer, useCallback, useEffect } from 'react';
import { initialModalState, modalReducer } from './modalReducer';
import { isHandlingHardwareBack } from '@/hooks/useModalHardwareBack';
import type { Player } from '@/types';

/** Live-match hooks for the host-level planner (L.3c). Registered by the
 *  match view while it is mounted; null on Home, where the planner operates
 *  on storage alone (no live game to flush or refresh). */
export interface PlannerLiveGameHooks {
  /** Flush the loaded game's debounced autosave before bulk re-apply reads storage. */
  onFlushLiveGame: () => Promise<void>;
  /** Bulk re-apply rewrote these games; refresh live state if one is loaded. */
  onLinkedGamesUpdated: (gameIds: string[]) => void;
}

type SettingsTab = 'general' | 'data' | 'account' | 'about';
type StatsTab = 'currentGame' | 'season' | 'tournament' | 'overall' | 'player';

interface ModalContextValue {
  isGameSettingsModalOpen: boolean;
  setIsGameSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadGameModalOpen: boolean;
  setIsLoadGameModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isRosterModalOpen: boolean;
  setIsRosterModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSeasonTournamentModalOpen: boolean;
  setIsSeasonTournamentModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Which competition list the (single) manager modal shows - the Kaudet and
  // Turnaukset rows are two entry points into the same kind-parameterized modal.
  competitionManagerKind: 'season' | 'tournament';
  setCompetitionManagerKind: React.Dispatch<React.SetStateAction<'season' | 'tournament'>>;
  isTrainingResourcesOpen: boolean;
  setIsTrainingResourcesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isRulesDirectoryOpen: boolean;
  setIsRulesDirectoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isInstructionsModalOpen: boolean;
  setIsInstructionsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isPersonnelManagerOpen: boolean;
  setIsPersonnelManagerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isTeamManagerOpen: boolean;
  setIsTeamManagerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Player deep-link for GameStats (set by the roster modal's stats shortcut,
   *  read by GameStatsModal as its initial selection). Lifted in L.2. */
  selectedPlayerForStats: Player | null;
  setSelectedPlayerForStats: React.Dispatch<React.SetStateAction<Player | null>>;
  /** True while a hard reset / re-sync / factory reset wipes data (L.0b).
   *  Shared so ClubModalsHost shows the overlay AND HomePage unmounts the
   *  game tree - in-flight timers/autosaves must not touch storage mid-wipe. */
  isAppResetting: boolean;
  setIsAppResetting: React.Dispatch<React.SetStateAction<boolean>>;
  isGoalLogModalOpen: boolean;
  setIsGoalLogModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isGameStatsModalOpen: boolean;
  setIsGameStatsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isNewGameSetupModalOpen: boolean;
  setIsNewGameSetupModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Initial player selection for NewGameSetup (set by match-side flows to
   *  carry the current game's selection into the next game, null = modal
   *  defaults to the full roster). Lifted in L.3b - the modal renders in
   *  ClubModalsHost, so openers on BOTH levels prefill through here. */
  playerIdsForNewGame: string[] | null;
  setPlayerIdsForNewGame: React.Dispatch<React.SetStateAction<string[] | null>>;
  /** Playing-Time Planner open-state (L.3c - the modal renders in
   *  ClubModalsHost). Replaces GameContainer's PLANNER_OPEN_KEY
   *  sessionStorage hack: this provider stays mounted across the
   *  resume-from-background loading flash, so React state alone survives. */
  isPlaytimePlannerOpen: boolean;
  setIsPlaytimePlannerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** See PlannerLiveGameHooks - registered by the match view while mounted. */
  plannerLiveGameHooks: PlannerLiveGameHooks | null;
  setPlannerLiveGameHooks: React.Dispatch<React.SetStateAction<PlannerLiveGameHooks | null>>;
  /** Club-level (aggregate) stats surface - GameStatsModal in aggregateOnly
   *  mode, rendered by ClubModalsHost (L.4). Separate from the match's
   *  isGameStatsModalOpen: the match modal keeps the current-game side. */
  isClubStatsOpen: boolean;
  setIsClubStatsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Open club stats on a specific aggregate tab (menu "Team stats" links). */
  openClubStatsToTab: (tab: StatsTab) => void;
  /** The tab club stats opens on (undefined = the surface's own default). */
  clubStatsInitialTab: StatsTab | undefined;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Open settings modal to a specific tab */
  openSettingsToTab: (tab: SettingsTab) => void;
  /** The tab to open settings modal to (undefined = default) */
  settingsInitialTab: SettingsTab | undefined;
  isPlayerAssessmentModalOpen: boolean;
  setIsPlayerAssessmentModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export const ModalProvider = ({ children, currentUserId }: {
  children: React.ReactNode;
  /** Cloud-mode user id (undefined in local mode / signed out). Sign-out
   *  closes the planner - see the effect below. Passed as a prop because the
   *  page renders this provider and already tracks auth; requiring useAuth
   *  here would force an AuthProvider around every ModalProvider in tests. */
  currentUserId?: string;
}) => {
  const [isGameSettingsModalOpen, setIsGameSettingsModalOpen] = useState(false);
  // Layer 2 (2.1): Wire Load Game modal to reducer; keep API stable
  const [modalState, dispatchModal] = useReducer(modalReducer, initialModalState);
  const [isTrainingResourcesOpen, setIsTrainingResourcesOpen] = useState(false);
  const [isRulesDirectoryOpen, setIsRulesDirectoryOpen] = useState(false);
  // L.0b: Instructions open-state lifted here from useModalOrchestration so the
  // page-level ClubModalsHost (and Settings' "show app guide" chain) can drive it.
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);
  // L.1: Personnel open-state lifted here from useModalOrchestration so the
  // page-level ClubModalsHost can render the manager with no game mounted.
  const [isPersonnelManagerOpen, setIsPersonnelManagerOpen] = useState(false);
  // L.2: TeamManager open-state + the GameStats player deep-link lifted here
  // (roster modal renders in ClubModalsHost; GameStats still match-side).
  const [isTeamManagerOpen, setIsTeamManagerOpen] = useState(false);
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<Player | null>(null);
  // L.3b: NewGameSetup prefill selection lifted here (modal renders in ClubModalsHost).
  const [playerIdsForNewGame, setPlayerIdsForNewGame] = useState<string[] | null>(null);
  // L.3c: planner open-state + the match view's live-game hooks lifted here.
  const [isPlaytimePlannerOpen, setIsPlaytimePlannerOpen] = useState(false);
  const [plannerLiveGameHooks, setPlannerLiveGameHooks] = useState<PlannerLiveGameHooks | null>(null);
  // Which competition kind the manager modal shows (set by the Kaudet/Turnaukset
  // rows before opening the shared modal).
  const [competitionManagerKind, setCompetitionManagerKind] = useState<'season' | 'tournament'>('season');
  // L.4: club-level aggregate stats surface (setters defined below, after
  // the match stats setter they mutually exclude against).
  const [clubStatsOpen, setClubStatsOpen] = useState(false);
  const [clubStatsInitialTab, setClubStatsInitialTab] = useState<StatsTab | undefined>(undefined);
  // Deep-review Minor 7: whenever club stats is CLOSED - by the host
  // handler, the mutual exclusion, or the user-change reset - the player
  // deep-link must not linger for the next open. Adjust-during-render
  // pattern (sanctioned setState-during-own-render).
  const [prevClubStatsOpen, setPrevClubStatsOpen] = useState(clubStatsOpen);
  if (prevClubStatsOpen !== clubStatsOpen) {
    setPrevClubStatsOpen(clubStatsOpen);
    if (!clubStatsOpen) setSelectedPlayerForStats(null);
  }

  // Sign-out closes the planner (mirrors the retired PLANNER_OPEN_KEY cleanup
  // in page.tsx): without this, an open planner would auto-reopen over Home
  // the next time someone signs in. Handled here because this provider is
  // the one component that stays mounted across the auth screens -
  // ClubModalsHost is gated out while signed out, so it could not do this
  // itself. Official adjust-state-when-props-change pattern (both the
  // set-state-in-effect and refs-during-render lint rules bar the
  // alternatives; setState during the owner's own render is the sanctioned
  // form - React restarts the render before committing).
  const [prevUserId, setPrevUserId] = useState(currentUserId);
  if (prevUserId !== currentUserId) {
    setPrevUserId(currentUserId);
    if (!currentUserId && isPlaytimePlannerOpen) setIsPlaytimePlannerOpen(false);
  }
  const [isAppResetting, setIsAppResetting] = useState(false);
  const [isGoalLogModalOpen, setIsGoalLogModalOpen] = useState(false);
  // Reducer-backed in L2 2.3
  const [isPlayerAssessmentModalOpen, setIsPlayerAssessmentModalOpen] = useState(false);

  // Anti-flash guard: ignore closes occurring too soon after opening for critical modals
  const ANTI_FLASH_MS = 200;
  const loadGameLastOpenRef = useRef<number>(0);
  const newGameLastOpenRef = useRef<number>(0);
  const loadGameOpenRef = useRef<boolean>(false);
  const newGameSetupOpenRef = useRef<boolean>(false);
  const settingsOpenRef = useRef<boolean>(false);
  const gameStatsOpenRef = useRef<boolean>(false);
  const rosterOpenRef = useRef<boolean>(false);
  const seasonTournamentOpenRef = useRef<boolean>(false);

  // Guarded modal setter for Load Game modal (with anti-flash protection)
  const setIsLoadGameModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
    const now = Date.now();
    const prev = loadGameOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;

    if (next && !prev) {
      loadGameLastOpenRef.current = now;
      loadGameOpenRef.current = true;
      dispatchModal({ type: 'OPEN_MODAL', id: 'loadGame', at: now });
      return;
    }

    if (!next && prev) {
      if (!isHandlingHardwareBack() && now - loadGameLastOpenRef.current < ANTI_FLASH_MS) {
        return;
      }
      loadGameOpenRef.current = false;
      dispatchModal({ type: 'CLOSE_MODAL', id: 'loadGame' });
    }
  }, []);

  // Guarded modal setter for New Game Setup modal (with anti-flash protection)
  const setIsNewGameSetupModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
    const now = Date.now();
    const prev = newGameSetupOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;

    if (next && !prev) {
      newGameLastOpenRef.current = now;
      newGameSetupOpenRef.current = true;
      dispatchModal({ type: 'OPEN_MODAL', id: 'newGameSetup', at: now });
      return;
    }

    if (!next && prev) {
      if (!isHandlingHardwareBack() && now - newGameLastOpenRef.current < ANTI_FLASH_MS) {
        return;
      }
      newGameSetupOpenRef.current = false;
      dispatchModal({ type: 'CLOSE_MODAL', id: 'newGameSetup' });
    }
  }, []);

  // Settings modal initial tab state
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);

  // Reducer-backed setter for Settings modal (no anti-flash needed)
  const setIsSettingsModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
    const prev = settingsOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next && !prev) {
      settingsOpenRef.current = true;
      dispatchModal({ type: 'OPEN_MODAL', id: 'settings', at: Date.now() });
      return;
    }
    if (!next && prev) {
      settingsOpenRef.current = false;
      setSettingsInitialTab(undefined); // Reset initial tab when closing
      dispatchModal({ type: 'CLOSE_MODAL', id: 'settings' });
    }
  }, []);

  // Open settings modal to a specific tab
  const openSettingsToTab = useCallback((tab: SettingsTab) => {
    setSettingsInitialTab(tab);
    settingsOpenRef.current = true;
    dispatchModal({ type: 'OPEN_MODAL', id: 'settings', at: Date.now() });
  }, []);

  // Reducer-backed setter for Game Stats modal (no anti-flash needed).
  // L.4: the tab-targeted variant (openGameStatsToTab/gameStatsInitialTab)
  // retired with the aggregate side's move to the club-stats surface - this
  // match modal is current-game-first.
  const setIsGameStatsModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
    const prev = gameStatsOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next && !prev) {
       
      // (same pattern as every guarded setter here): written at EVENT time,
      // never read during render; the compiler flags it only because this
      // callback also calls sibling state setters for the exclusion below.
      gameStatsOpenRef.current = true;
      // Mutual exclusion with the club-stats surface: both are mounts of
      // GameStatsModal at the same z-index, so opening one closes the other
      // (UI flows can't stack them today; this pins the invariant).
      setClubStatsOpen(false);
      setClubStatsInitialTab(undefined);
      dispatchModal({ type: 'OPEN_MODAL', id: 'gameStats', at: Date.now() });
      return;
    }
    if (!next && prev) {
      gameStatsOpenRef.current = false;
      dispatchModal({ type: 'CLOSE_MODAL', id: 'gameStats' });
    }
  }, []);

  // L.4: club-stats surface setters. Opening goes through
  // setIsGameStatsModalOpen(false) for the mutual exclusion (both surfaces
  // are GameStatsModal mounts at the same z-index).
  const setIsClubStatsOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
    // Q6 symmetry: opening through the RAW setter excludes the match stats
    // modal too, so the invariant is not caller-convention-only.
    const opening = typeof valueOrUpdater === 'function' ? undefined : valueOrUpdater === true;
    if (opening) {
      setIsGameStatsModalOpen(false);
    }
    setClubStatsOpen((prev) => {
      const next = typeof valueOrUpdater === 'function'
        ? (valueOrUpdater as (p: boolean) => boolean)(prev)
        : valueOrUpdater;
      if (!next && prev) setClubStatsInitialTab(undefined); // reset tab on close
      return next;
    });
  }, [setIsGameStatsModalOpen]);
  const openClubStatsToTab = useCallback((tab: StatsTab) => {
    setIsGameStatsModalOpen(false);
    setClubStatsInitialTab(tab);
    setClubStatsOpen(true);
  }, [setIsGameStatsModalOpen]);

  // Roster modal setter (no anti-flash guard needed)
  // Rationale: Triggered from static buttons (ControlBar CTAs),
  // not from closing menus/overlays. Lower risk of click-through timing issues.
  const setIsRosterModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
    const prev = rosterOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next === prev) return;
    rosterOpenRef.current = next;
    if (next) {
      dispatchModal({ type: 'OPEN_MODAL', id: 'roster', at: Date.now() });
    } else {
      dispatchModal({ type: 'CLOSE_MODAL', id: 'roster' });
    }
  }, []);

  // Season/Tournament modal setter (no anti-flash guard needed)
  // Rationale: Same as roster - triggered from persistent UI elements,
  // not timing-sensitive menu/overlay contexts. Add guard if flash-close issues emerge.
  const setIsSeasonTournamentModalOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((valueOrUpdater) => {
    const prev = seasonTournamentOpenRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: boolean) => boolean)(prev)
      : valueOrUpdater;
    if (next === prev) return;
    seasonTournamentOpenRef.current = next;
    if (next) {
      dispatchModal({ type: 'OPEN_MODAL', id: 'seasonTournament', at: Date.now() });
    } else {
      dispatchModal({ type: 'CLOSE_MODAL', id: 'seasonTournament' });
    }
  }, []);

  // Deep-review Issue 5 (+ #681 review): NO modal open-state may survive a user
  // change. A session expiring mid-modal, or signing out from an open modal,
  // used to re-open that modal over the NEXT user's session (match-scope with an
  // inverted back-stack, or a club-scope modal popping over Home after sign-in),
  // and a stale prefill could seed a new game with another user's player ids.
  // Declared after every guarded setter so the reset routes through them (no
  // direct mirror-ref mutation - the compiler forbids writing a ref an effect
  // also reads). Fires at most once per user change via the ref gate.
  const effectPrevUserRef = useRef(currentUserId);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (effectPrevUserRef.current === currentUserId) return;
    effectPrevUserRef.current = currentUserId;
    // Match-scope
    setIsGameSettingsModalOpen(false);
    setIsGoalLogModalOpen(false);
    setIsPlayerAssessmentModalOpen(false);
    setIsGameStatsModalOpen(false);
    setPlayerIdsForNewGame(null);
    setSelectedPlayerForStats(null);
    setClubStatsOpen(false);
    // Club-scope (the #681 gap): these stayed open across sign-out and popped
    // back over Home on the next sign-in.
    setIsSettingsModalOpen(false);
    setIsRosterModalOpen(false);
    setIsSeasonTournamentModalOpen(false);
    setIsPersonnelManagerOpen(false);
    setIsTeamManagerOpen(false);
    setIsLoadGameModalOpen(false);
    setIsNewGameSetupModalOpen(false);
    setIsTrainingResourcesOpen(false);
    setIsRulesDirectoryOpen(false);
    setIsInstructionsModalOpen(false);
  }, [
    currentUserId,
    setIsGameStatsModalOpen,
    setClubStatsOpen,
    setIsSettingsModalOpen,
    setIsRosterModalOpen,
    setIsSeasonTournamentModalOpen,
    setIsLoadGameModalOpen,
    setIsNewGameSetupModalOpen,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const value: ModalContextValue = useMemo(() => ({
    isGameSettingsModalOpen,
    setIsGameSettingsModalOpen,
    isLoadGameModalOpen: modalState.loadGame,
    setIsLoadGameModalOpen,
    isRosterModalOpen: modalState.roster,
    setIsRosterModalOpen,
    isSeasonTournamentModalOpen: modalState.seasonTournament,
    setIsSeasonTournamentModalOpen,
    competitionManagerKind,
    setCompetitionManagerKind,
    isTrainingResourcesOpen,
    setIsTrainingResourcesOpen,
    isRulesDirectoryOpen,
    setIsRulesDirectoryOpen,
    isInstructionsModalOpen,
    setIsInstructionsModalOpen,
    isPersonnelManagerOpen,
    setIsPersonnelManagerOpen,
    isTeamManagerOpen,
    setIsTeamManagerOpen,
    selectedPlayerForStats,
    setSelectedPlayerForStats,
    isAppResetting,
    setIsAppResetting,
    isGoalLogModalOpen,
    setIsGoalLogModalOpen,
    isGameStatsModalOpen: modalState.gameStats,
    setIsGameStatsModalOpen,
    isNewGameSetupModalOpen: modalState.newGameSetup,
    setIsNewGameSetupModalOpen,
    playerIdsForNewGame,
    setPlayerIdsForNewGame,
    isPlaytimePlannerOpen,
    setIsPlaytimePlannerOpen,
    plannerLiveGameHooks,
    setPlannerLiveGameHooks,
    isClubStatsOpen: clubStatsOpen,
    setIsClubStatsOpen,
    openClubStatsToTab,
    clubStatsInitialTab,
    isSettingsModalOpen: modalState.settings,
    setIsSettingsModalOpen,
    openSettingsToTab,
    settingsInitialTab,
    isPlayerAssessmentModalOpen,
    setIsPlayerAssessmentModalOpen,
  }), [
    isGameSettingsModalOpen, setIsGameSettingsModalOpen,
    modalState.loadGame, setIsLoadGameModalOpen,
    modalState.roster, setIsRosterModalOpen,
    modalState.seasonTournament, setIsSeasonTournamentModalOpen,
    competitionManagerKind, setCompetitionManagerKind,
    isTrainingResourcesOpen, setIsTrainingResourcesOpen,
    isRulesDirectoryOpen, setIsRulesDirectoryOpen,
    isInstructionsModalOpen, setIsInstructionsModalOpen,
    isPersonnelManagerOpen, setIsPersonnelManagerOpen,
    isTeamManagerOpen, setIsTeamManagerOpen,
    selectedPlayerForStats, setSelectedPlayerForStats,
    isAppResetting, setIsAppResetting,
    isGoalLogModalOpen, setIsGoalLogModalOpen,
    modalState.gameStats, setIsGameStatsModalOpen,
    modalState.newGameSetup, setIsNewGameSetupModalOpen,
    playerIdsForNewGame, setPlayerIdsForNewGame,
    isPlaytimePlannerOpen, setIsPlaytimePlannerOpen,
    plannerLiveGameHooks, setPlannerLiveGameHooks,
    clubStatsOpen, setIsClubStatsOpen, openClubStatsToTab, clubStatsInitialTab,
    modalState.settings, setIsSettingsModalOpen,
    openSettingsToTab, settingsInitialTab,
    isPlayerAssessmentModalOpen, setIsPlayerAssessmentModalOpen,
  ]);

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
};

export const useModalContext = () => {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error('useModalContext must be used within ModalProvider');
  }
  return ctx;
};

export default ModalProvider;
