'use client';

/**
 * Playing-Time Planner modal (Phase 1, PR 1.2).
 *
 * Self-contained entry point for the tournament planner. It is intentionally
 * independent of the live game session: it loads the master roster, lets the
 * coach set up a plan (roster, number of games, game length, formation), and
 * persists it as a local blob with auto-save. Per-game lineups and substitutions
 * are added in later PRs; this modal owns setup + the plan overview.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiChevronDown,
  HiChevronRight,
  HiOutlineArchiveBox,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineDocumentDuplicate,
  HiOutlineEllipsisVertical,
  HiOutlinePencil,
  HiOutlineSquares2X2,
  HiOutlineTrash,
  HiOutlineUsers,
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { getTeams, getTeamRoster, getTeamDisplayName } from '@/utils/teams';
import { getSeasons } from '@/utils/seasons';
import { getTournaments } from '@/utils/tournaments';
import type { Team, Season, Tournament } from '@/types';
import { PRESETS_BY_SIZE, FIELD_SIZES, getPresetById } from '@/config/formationPresets';
import logger from '@/utils/logger';
import { generateId } from '@/utils/idGenerator';
import {
  ModalContainer,
  ModalHeader,
  ModalFooter,
  ScrollableContent,
  headerStyle,
  titleStyle,
  labelStyle,
  subtextStyle,
  inputBaseStyle,
  selectStyle,
  cardStyle,
  iconButtonDangerStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/styles/modalStyles';
import {
  getPlans,
  getPlan,
  savePlan,
  deletePlan,
  createPlan,
  duplicatePlan,
  serializePlan,
  importPlan,
} from '@/utils/playtimePlanner/storage';
import {
  ensureStartingSlots,
  assignPlayerToSlot,
  getGameSlots,
  clearSlotSchedule,
  clearAllPlacements,
} from '@/utils/playtimePlanner/lineup';
import { addSub, removeSub, moveSubToSlot, setSubPlayer } from '@/utils/playtimePlanner/subs';
import { swapPlayersInGame } from '@/utils/playtimePlanner/swap';
import { suggestFairShareLineup } from '@/utils/playtimePlanner/suggest';
import {
  addPlayerToPlan,
  normalizePlanAbsences,
  removePlayerFromPlan,
  replacePlayerInPlan,
  playerPlanImpact,
} from '@/utils/playtimePlanner/roster';
import {
  reapplyPlanToLinkedGames,
  countReapplicableGames,
} from '@/utils/playtimePlanner/reapply';
import { setGameSubs } from '@/utils/playtimePlanner/gameSubs';
import { getAllPlanLinks, deletePlanLinksForPlan } from '@/utils/playtimePlanner/planLinks';
import { computePlanMinutes } from '@/utils/playtimePlanner/minutes';
import { toEnginePlan } from '@/utils/playtimePlanner/adapter';
import { getSavedGames, saveGame as utilSaveGame } from '@/utils/savedGames';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import ConfirmationModal from '@/components/ConfirmationModal';
import PlanFieldView, { type PlanPlayerMinutes } from '@/components/PlanFieldView';
import PlanFairnessStrip, { type FairnessStripRow } from '@/components/PlanFairnessStrip';
import PlanSubsEditor from '@/components/PlanSubsEditor';
import PlanSubSheet from '@/components/PlanSubSheet';
import PlayerSelectionSection from '@/components/PlayerSelectionSection';
import PlanBalanceView from '@/components/PlanBalanceView';
import type { PlaytimePlan, PlanSub, PlanGame, PlanPlayer } from '@/utils/playtimePlanner/types';
import type { Player } from '@/types';

interface PlaytimePlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Flush the currently loaded game's debounced autosave. Called BEFORE the bulk
   * re-apply reads persisted blobs, so an edit made in the last ~500ms is in the
   * blob being patched instead of silently dropped by the rewrite.
   */
  onFlushLiveGame?: () => Promise<void>;
  /**
   * Bulk re-apply rewrote these games in storage. The host uses this to refresh
   * live state when the currently loaded game is among them (otherwise the next
   * autosave would write the stale in-memory lineup back over the update).
   */
  onLinkedGamesUpdated?: (gameIds: string[]) => void;
}

const DEFAULT_FORMATION = '8v8-2-1-2-1-1';

/** Which plan was open - survives a resume-from-background remount (pairs with
 *  GameContainer's PLANNER_OPEN_KEY, which already restores the modal itself). */
const PLANNER_ACTIVE_PLAN_KEY = 'matchops_planner_active_plan';

type View = 'loading' | 'manager' | 'setup' | 'games' | 'minutes' | 'plan';
/** The three peer tabs of an OPEN plan (standalone-planner structure). */
const PLAN_TABS = ['games', 'minutes', 'plan'] as const;
type PlanTab = (typeof PLAN_TABS)[number];
const isPlanTab = (v: View): v is PlanTab => (PLAN_TABS as readonly string[]).includes(v);

const PlaytimePlannerModal: React.FC<PlaytimePlannerModalProps> = ({
  isOpen,
  onClose,
  onFlushLiveGame,
  onLinkedGamesUpdated,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>('loading');
  const [roster, setRoster] = useState<Player[]>([]);
  const [activePlan, setActivePlan] = useState<PlaytimePlan | null>(null);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [planList, setPlanList] = useState<PlaytimePlan[]>([]);
  // Per-planned-game count of unplayed real games created from it (Phase 3.4 bulk
  // re-apply). Keyed by planned-game id.
  const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({});
  // Confirm-dialog + roster-edit state, declared early because the Escape handler
  // (an early effect) must know whether a confirm is open before navigating.
  // bulkReapplyTarget: planned game pending the bulk "update linked games" confirm.
  const [bulkReapplyTarget, setBulkReapplyTarget] = useState<PlanGame | null>(null);
  const [isBulkReapplying, setIsBulkReapplying] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlaytimePlan | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Manager rows: which plan's 3-dot actions menu is open (null = none), and
  // whether archived plans are listed (same pattern as the competitions modal).
  const [actionsMenuId, setActionsMenuId] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Overview "Games & format" editor (collapsed by default - the header line
  // doubles as the format summary) and the pending remove-last-game confirm.
  const [showFormatEditor, setShowFormatEditor] = useState(false);
  const [trimConfirm, setTrimConfirm] = useState<PlanGame | null>(null);
  // Games tab layout: one editable field, or every game side by side
  // (standalone's view toggle; replaces the old separate grid view).
  const [gamesLayout, setGamesLayout] = useState<'single' | 'grid'>('single');
  // Fairness strip fold state lives HERE so it survives tab/layout switches
  // (local state reset on every unmount re-expanded it constantly).
  const [stripCollapsed, setStripCollapsed] = useState(false);
  // FINGER-TRACKING tab strip: its visible height follows the scroll delta
  // pixel-for-pixel (clamped 0..full height), so hiding and revealing happen
  // exactly at the user's scrolling pace - no threshold, no timed snap that
  // nudges the content. DOM styles are written directly (no re-render per
  // scroll event); React only re-renders content, never this chrome.
  const tabsOuterRef = useRef<HTMLDivElement | null>(null);
  const tabsInnerRef = useRef<HTMLDivElement | null>(null);
  const tabsOffsetRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const applyTabsOffset = useCallback((offset: number) => {
    const outer = tabsOuterRef.current;
    const inner = tabsInnerRef.current;
    if (!outer || !inner) return;
    const h = inner.offsetHeight;
    const clamped = Math.max(0, Math.min(h, offset));
    tabsOffsetRef.current = clamped;
    outer.style.height = `${h - clamped}px`;
    inner.style.transform = `translateY(-${clamped}px)`;
    inner.setAttribute('aria-hidden', clamped >= h && h > 0 ? 'true' : 'false');
  }, []);
  const handleContentScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const y = e.currentTarget.scrollTop;
      const delta = y - lastScrollTopRef.current;
      lastScrollTopRef.current = y;
      if (delta === 0) return;
      // At (or rubber-banding past) the top the strip is always fully shown.
      applyTabsOffset(y <= 0 ? 0 : tabsOffsetRef.current + delta);
    },
    [applyTabsOffset],
  );
  // Switching tabs (or leaving the plan) always reveals the strip again.
  useEffect(() => {
    lastScrollTopRef.current = 0;
    tabsOffsetRef.current = 0;
    const outer = tabsOuterRef.current;
    const inner = tabsInnerRef.current;
    if (outer && inner) {
      outer.style.height = '';
      inner.style.transform = '';
      inner.setAttribute('aria-hidden', 'false');
    }
  }, [view]);
  // Availability fold-out open/closed - lifted so "mark the same kids absent
  // across the morning games" survives ribbon taps (the field remounts per
  // game via key={editingGame.id}).
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const ribbonRef = useRef<HTMLElement | null>(null);
  // Plan tab: collapsed replace-a-player section (the one roster edit that
  // checkboxes can't express - it hands spots and subs over).
  const [showReplace, setShowReplace] = useState(false);
  // replacingId: plan player whose replacement is being chosen (Phase 4);
  // removeQueue: plan players pending the destructive remove confirm, asked one
  // at a time (a team switch or mass-uncheck can queue several). Cancel skips
  // just that player.
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [removeQueue, setRemoveQueue] = useState<PlanPlayer[]>([]);
  const removeTarget = removeQueue[0] ?? null;
  // "Suggest fair lineup" pending confirm (it overwrites included games).
  const [showSuggestConfirm, setShowSuggestConfirm] = useState(false);
  const [showClearAllGamesConfirm, setShowClearAllGamesConfirm] = useState(false);
  // Open substitution sheet target: which game + slot (null = closed). Game id
  // is part of the target because the grid view edits ALL games at once.
  const [subSheetTarget, setSubSheetTarget] = useState<{ gameId: string; slotId: string } | null>(null);
  // Undo/redo: full-state snapshots of the ACTIVE plan (standalone-planner
  // style). Refs hold the stack (no re-render per edit); historyTick forces the
  // toolbar's disabled states to refresh. The stack reseeds whenever the plan
  // IDENTITY changes (load/switch/create/duplicate/import) - history never
  // crosses plans.
  const historyRef = useRef<{ stack: PlaytimePlan[]; index: number }>({ stack: [], index: -1 });
  const [, setHistoryTick] = useState(0);
  const seedHistory = useCallback((plan: PlaytimePlan | null) => {
    historyRef.current = plan ? { stack: [plan], index: 0 } : { stack: [], index: -1 };
    pendingEditRef.current = null;
    lastEditCoalescedRef.current = null;
    setHistoryTick((t) => t + 1);
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Setup form state.
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [gameCount, setGameCount] = useState(5);
  const [numberOfPeriods, setNumberOfPeriods] = useState(2);
  const [periodMinutes, setPeriodMinutes] = useState(12);
  const [formationId, setFormationId] = useState(DEFAULT_FORMATION);
  // Optional team source (Phase 2): teams + their linked competitions seed the
  // roster selection and durations, mirroring new-game setup. '' = no team.
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const teamSelectRef = useRef(0); // discards stale async team-roster responses

  const resetSetupForm = useCallback((players: Player[]) => {
    setName(t('playtimePlanner.setup.defaultName', 'Tournament plan'));
    setSelectedIds(new Set(players.map((p) => p.id)));
    setGameCount(5);
    setNumberOfPeriods(2);
    setPeriodMinutes(12);
    setFormationId(DEFAULT_FORMATION);
    setTeamId('');
  }, [t]);

  // Optional team source: on pick, inherit the team's competition durations and
  // pre-select the matching master-roster players (by name — team-roster ids are a
  // separate id space, matching NewGameSetupModal). Blank = full master roster.
  const applyTeamSelection = useCallback(
    async (nextTeamId: string) => {
      const requestId = ++teamSelectRef.current;
      if (!nextTeamId) {
        // Back to freehand: full roster and the planner's default durations, so a
        // team's inherited durations don't linger after you deselect it.
        setTeamId('');
        setSelectedIds(new Set(roster.map((p) => p.id)));
        setNumberOfPeriods(2);
        setPeriodMinutes(12);
        return;
      }
      const team = teams.find((tm) => tm.id === nextTeamId);
      const comp = team?.boundSeasonId
        ? seasons.find((s) => s.id === team.boundSeasonId)
        : team?.boundTournamentId
          ? tournaments.find((tn) => tn.id === team.boundTournamentId)
          : undefined;
      try {
        const teamRoster = await getTeamRoster(nextTeamId, user?.id);
        if (teamSelectRef.current !== requestId) return; // a newer pick superseded this
        // Commit teamId only after the fetch succeeds, together with the roster and
        // durations - so a plan's teamId always matches what was actually applied. A
        // failed/slow load never leaves teamId stamped on a stale roster (which would
        // break the "lossless" invariant later prefill relies on).
        setTeamId(nextTeamId);
        const names = new Set(teamRoster.map((tp) => tp.name.trim().toLowerCase()));
        setSelectedIds(
          new Set(roster.filter((p) => names.has(p.name.trim().toLowerCase())).map((p) => p.id)),
        );
        // Apply durations only after the roster load succeeds, so a failure never
        // leaves a half-applied state (durations changed, selection stale). Always
        // set them from the selected team's competition, or fall back to the planner
        // defaults when the team is unbound - otherwise a team->team switch onto an
        // unbound team would keep the previous team's inherited durations.
        if (comp) {
          setNumberOfPeriods(comp.periodCount && comp.periodCount > 0 ? comp.periodCount : 2);
          setPeriodMinutes(comp.periodDuration && comp.periodDuration > 0 ? comp.periodDuration : 15);
        } else {
          setNumberOfPeriods(2);
          setPeriodMinutes(12);
        }
      } catch (error) {
        if (teamSelectRef.current !== requestId) return;
        logger.error('[PlaytimePlannerModal] Failed to load team roster:', error);
        showToast(t('playtimePlanner.setup.teamLoadError', "Could not load that team's roster."), 'error');
      }
    },
    [roster, teams, seasons, tournaments, user, showToast, t],
  );

  // Keep a stable handle to resetSetupForm so the load effect does not depend on
  // it (it changes identity with `t`); the effect must only re-run on open/user.
  const resetSetupFormRef = useRef(resetSetupForm);
  useEffect(() => {
    resetSetupFormRef.current = resetSetupForm;
  }, [resetSetupForm]);
  const loadErrorToastRef = useRef<() => void>(() => {});
  useEffect(() => {
    loadErrorToastRef.current = () =>
      showToast(t('playtimePlanner.loadError', 'Could not load your plans. Close the planner and try again.'), 'error');
  }, [showToast, t]);

  // Mirror of activePlan for effects that must READ it without re-running on
  // every edit (the load effect below).
  const activePlanRef = useRef<PlaytimePlan | null>(null);
  useEffect(() => {
    activePlanRef.current = activePlan;
  }, [activePlan]);

  // Remember which plan is open (session-scoped) so a background/resume
  // remount restores the workspace instead of the manager.
  useEffect(() => {
    try {
      if (activePlan && isPlanTab(view)) sessionStorage.setItem(PLANNER_ACTIVE_PLAN_KEY, activePlan.id);
      else if (view === 'manager' || view === 'setup') sessionStorage.removeItem(PLANNER_ACTIVE_PLAN_KEY);
    } catch {
      // Session storage unavailable (private mode edge) - resume just degrades.
    }
  }, [activePlan, view]);

  // House modal behaviour: Tab cycles inside the planner and the app behind
  // goes inert. The nested PlanSubSheet runs its own trap; useFocusTrap's
  // nested-modal safety keeps the two from fighting over focus.
  const modalRootRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRootRef, isOpen);

  // Move focus IN on open and hand it back to the opener on close - the
  // shared trap only cycles Tab, it never places focus (same contract as
  // PlanSubSheet's own focus handling).
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRootRef.current?.focus();
    return () => opener?.focus();
  }, [isOpen]);

  // Deliberate close abandons the resume intent: the key exists so a
  // background/resume remount restores the workspace, not so an explicit
  // Close re-enters the plan on the next open.
  const handleClose = useCallback(() => {
    try {
      sessionStorage.removeItem(PLANNER_ACTIVE_PLAN_KEY);
    } catch {
      // Session storage unavailable - nothing to clear.
    }
    onClose();
  }, [onClose]);

  // Load roster + any existing plan when the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setView('loading');
      try {
        const [players, plans] = await Promise.all([getMasterRoster(user?.id), getPlans()]);
        if (cancelled) return;
        setRoster(players);
        const list = Object.values(plans).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setPlanList(list);
        // Nested so an early "stay where you are" decision can return WITHOUT
        // skipping the team/season/tournament load below - the resume paths
        // used to exit the whole effect here, leaving those selectors empty
        // for the rest of the modal instance after every background remount.
        const decideView = () => {
          // Re-run with a plan already open (auth/user refresh when the app
          // returns from the background): keep the user exactly where they were
          // instead of dumping them back on the manager.
          const open = activePlanRef.current;
          if (open && plans[open.id]) return;
          // Fresh mount after a background/resume remount: reopen the plan the
          // session had open.
          let resumeId: string | null = null;
          try {
            resumeId = sessionStorage.getItem(PLANNER_ACTIVE_PLAN_KEY);
          } catch {
            resumeId = null;
          }
          if (resumeId && plans[resumeId]) {
            const resumed = normalizePlanAbsences(plans[resumeId]);
            setActivePlan(resumed);
            seedHistory(resumed);
            setEditingGameId(null);
            setReplacingId(null);
            setHighlightPlayerIds([]);
            setView('games');
            return;
          }
          if (list.length > 0) {
            // Step-by-step flow: pick (or create) a plan first; its workspace
            // opens only after an explicit choice.
            setActivePlan(null);
            seedHistory(null);
            setView('manager');
          } else {
            resetSetupFormRef.current(players);
            setView('setup');
          }
        };
        decideView();
      } catch (error) {
        logger.error('[PlaytimePlannerModal] Failed to load:', error);
        if (!cancelled) {
          setRoster([]);
          resetSetupFormRef.current([]);
          setView('setup');
          // Without this a user WITH saved plans dead-ends on an empty setup
          // screen with no explanation (mobile IndexedDB reads can fail once).
          loadErrorToastRef.current();
        }
      }
      // Team/season/tournament data is best-effort: it only feeds the optional
      // Team selector in setup, so a failure here must never gate the view or hide
      // the user's roster/plans behind the empty-setup screen.
      try {
        const [teamList, seasonList, tournamentList] = await Promise.all([
          getTeams(user?.id),
          getSeasons(user?.id),
          getTournaments(user?.id),
        ]);
        if (!cancelled) {
          setTeams(teamList.filter((tm) => !tm.archived));
          setSeasons(seasonList);
          setTournaments(tournamentList);
        }
      } catch (error) {
        logger.error('[PlaytimePlannerModal] Team data load failed (non-fatal):', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.id, seedHistory]);



  // isCreating gates a double-tap: two taps inside the IndexedDB-write window
  // used to create two identical plans.
  const [isCreating, setIsCreating] = useState(false);
  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const players = roster
        .filter((p) => selectedIds.has(p.id))
        // Store the disc name (nickname first, like the field) so the planner shows
        // the same short name the created game will - not the full legal name.
        .map((p) => ({ id: p.id, name: p.nickname?.trim() || p.name }));
      if (players.length === 0) return;
      const plan = createPlan({
        name: name.trim() || t('playtimePlanner.setup.defaultName', 'Tournament plan'),
        players,
        gameCount,
        formationId,
        numberOfPeriods,
        periodMinutes,
        teamId: teamId || undefined,
        gameLabel: (i) => t('playtimePlanner.overview.gameLabel', 'Game {{n}}', { n: i + 1 }),
      });
      const saved = await savePlan(plan);
      if (saved) {
        setActivePlan(saved);
        seedHistory(saved);
        setView('games');
        void refreshPlanList();
      } else {
        showToast(
          t('playtimePlanner.saveError', 'Could not save the plan. Your latest changes may not persist.'),
          'error',
        );
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Debounced auto-save. Overview edits (name, labels, included) update state
  // immediately for a responsive UI but coalesce writes so fast typing doesn't
  // hammer IndexedDB. A failed save surfaces a toast rather than failing silently.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyPlanRef = useRef<PlaytimePlan | null>(null);

  const persist = useCallback(
    async (plan: PlaytimePlan) => {
      const saved = await savePlan(plan);
      if (!saved) {
        showToast(
          t('playtimePlanner.saveError', 'Could not save the plan. Your latest changes may not persist.'),
          'error',
        );
      }
    },
    [showToast, t],
  );

  // Write any pending edit now (on close/unmount, or before a read that must see
  // it) instead of waiting out the debounce. Returns the persist promise so callers
  // that then read from storage (e.g. switching plans) can await the write first -
  // getPlan/getPlans read the collection directly and would otherwise race it.
  const flushSave = useCallback((): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = dirtyPlanRef.current;
    dirtyPlanRef.current = null;
    return pending ? persist(pending) : Promise.resolve();
  }, [persist]);

  // The updater stays PURE (React StrictMode double-invokes it - side effects
  // here double-pushed history). pendingEditRef marks the commit as a user edit;
  // the effect below records it exactly once. A coalesceKey (text inputs) makes
  // consecutive edits TO THE SAME FIELD replace the top history entry instead of
  // pushing one per keystroke - the key match keeps renames of two different
  // games (or a game and the plan) from merging into one undo step.
  const pendingEditRef = useRef<null | { coalesceKey: string | null }>(null);
  const lastEditCoalescedRef = useRef<string | null>(null);
  const updateActivePlan = useCallback(
    (mutate: (plan: PlaytimePlan) => PlaytimePlan, opts?: { coalesceKey?: string }) => {
      pendingEditRef.current = { coalesceKey: opts?.coalesceKey ?? null };
      setActivePlan((prev) => (prev ? mutate(prev) : prev));
    },
    [],
  );

  // Record the committed edit: push (or coalesce into) the history stack and
  // schedule the debounced persist. Runs once per commit regardless of how many
  // updateActivePlan calls batched into it (Auto-fill's burst = ONE undo step).
  useEffect(() => {
    const pending = pendingEditRef.current;
    if (!pending || !activePlan) return;
    pendingEditRef.current = null;
    const h = historyRef.current;
    if (h.stack.length === 0) {
      h.stack = [activePlan];
      h.index = 0;
    } else if (h.stack[h.index] !== activePlan) {
      const replaceTop =
        pending.coalesceKey !== null &&
        lastEditCoalescedRef.current === pending.coalesceKey &&
        h.index === h.stack.length - 1 &&
        h.index > 0;
      h.stack = h.stack.slice(0, h.index + 1);
      if (replaceTop) {
        h.stack[h.stack.length - 1] = activePlan;
      } else {
        h.stack.push(activePlan);
        if (h.stack.length > 50) h.stack.shift();
      }
      h.index = h.stack.length - 1;
    }
    lastEditCoalescedRef.current = pending.coalesceKey;
    setHistoryTick((t) => t + 1);
    dirtyPlanRef.current = activePlan;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const toSave = dirtyPlanRef.current;
      dirtyPlanRef.current = null;
      if (toSave) void persist(toSave);
    }, 600);
  }, [activePlan, persist]);

  // Step through the snapshot stack WITHOUT pushing; the restored state persists
  // through the same debounced autosave as a normal edit.
  const applyHistory = useCallback(
    (delta: -1 | 1) => {
      const h = historyRef.current;
      const ni = h.index + delta;
      if (ni < 0 || ni >= h.stack.length) return;
      h.index = ni;
      const restored = h.stack[ni];
      pendingEditRef.current = null; // restoring is not an edit
      lastEditCoalescedRef.current = null;
      setActivePlan(restored);
      // The restored roster may lack currently-highlighted players (undo of a
      // replace/remove) - prune, or the whole lineup ghost-dims with no cell
      // left to un-toggle.
      setHighlightPlayerIds((prev) => prev.filter((id) => restored.players.some((pl) => pl.id === id)));
      dirtyPlanRef.current = restored;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const pending = dirtyPlanRef.current;
        dirtyPlanRef.current = null;
        if (pending) void persist(pending);
      }, 600);
      setHistoryTick((t) => t + 1);
    },
    [persist],
  );
  const canUndo = historyRef.current.index > 0;
  const canRedo = historyRef.current.index < historyRef.current.stack.length - 1;

  // Horizontal swipe on the lineup flips to the previous/next game (standalone
  // heuristic: >60px, clearly more horizontal than vertical, <700ms). Complements
  // the tab strip for one-handed use.
  const swipeRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const handleLineupTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  };
  const handleLineupTouchEnd = (e: React.TouchEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || !activePlan) return;
    // editingGameId may still be null right after opening a plan - the games
    // tab falls back to the first game, and so does the swipe.
    const currentId = editingGameId ?? activePlan.games[0]?.id;
    if (!currentId) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Date.now() - start.at > 700 || Math.abs(dx) < 60 || Math.abs(dx) < 1.4 * Math.abs(dy)) return;
    const idx = activePlan.games.findIndex((g) => g.id === currentId);
    const nextGame = activePlan.games[dx < 0 ? idx + 1 : idx - 1];
    if (nextGame) {
      setEditingGameId(nextGame.id);
      setSubSheetTarget(null);
    }
  };

  // Assign (or clear) a player in a game's starting lineup. Normalizes the
  // game's slots to its formation first, so stored data always matches the shape.
  // Scheduled subs bringing the placed player on are KEPT (rotations are legal);
  // any impossible same-minutes overlap is flagged by the conflict banner instead.
  const handleAssign = useCallback(
    (gameId: string, slotId: string, playerId: string | null) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) =>
          g.id === gameId
            ? {
                ...g,
                startingSlots: assignPlayerToSlot(ensureStartingSlots(g), slotId, playerId),
              }
            : g,
        ),
      }));
    },
    [updateActivePlan],
  );

  // Add / remove a scheduled substitution in a game.
  // Screen-reader announcement for sub creation/removal: the sheet closes on
  // add, so the live region lives HERE (persists across the sheet's unmount).
  // The nonce forces a DOM mutation even when the SAME message repeats
  // (remove two subs in a row) - live regions only announce on mutation, so
  // identical consecutive text would announce once and go silent.
  const [subAnnouncement, setSubAnnouncement] = useState<{ text: string; nonce: number }>({
    text: '',
    nonce: 0,
  });

  const handleAddSub = useCallback(
    (gameId: string, sub: PlanSub) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => (g.id === gameId ? { ...g, subs: addSub(g.subs, sub) } : g)),
      }));
      setSubAnnouncement((prev) => ({
        text: t('playtimePlanner.subs.added', 'Substitution added'),
        nonce: prev.nonce + 1,
      }));
    },
    [updateActivePlan, t],
  );

  // Whole-game player swap (swap.ts): trades the two players' entire
  // timelines in one game - lineup slots AND sub rows. Announced for SRs.
  const handleSwapPlayers = useCallback(
    (gameId: string, playerAId: string, playerBId: string) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => (g.id === gameId ? swapPlayersInGame(g, playerAId, playerBId) : g)),
      }));
      const nameOf = (id: string) => activePlan?.players.find((p) => p.id === id)?.name ?? id;
      setSubAnnouncement((prev) => ({
        text: t('playtimePlanner.swap.done', 'Swapped {{a}} and {{b}}', {
          a: nameOf(playerAId),
          b: nameOf(playerBId),
        }),
        nonce: prev.nonce + 1,
      }));
    },
    [updateActivePlan, t, activePlan],
  );

  // Empty ONE position (starter + its scheduled subs) / EVERY position.
  const handleClearSlot = useCallback(
    (gameId: string, slotId: string) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => (g.id === gameId ? { ...g, ...clearSlotSchedule(g, slotId) } : g)),
      }));
      // Announce like every sibling action - this one can silently delete
      // several scheduled subs along with the starter.
      setSubAnnouncement((prev) => ({
        text: t('playtimePlanner.lineup.clearedSlot', 'Position cleared'),
        nonce: prev.nonce + 1,
      }));
    },
    [updateActivePlan, t],
  );

  // Promote a scheduled incomer to the kickoff starter of their own slot
  // (tap a stint, then the slot's empty "+" spot). ONE plan update so it is
  // one undo step: the player starts from 0' and their sub row disappears.
  const handlePromoteSubToStarter = useCallback(
    (gameId: string, subId: string, slotId: string, playerId: string) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) =>
          g.id === gameId
            ? {
                ...g,
                startingSlots: assignPlayerToSlot(ensureStartingSlots(g), slotId, playerId),
                subs: removeSub(g.subs, subId),
              }
            : g,
        ),
      }));
      const name = activePlan?.players.find((p) => p.id === playerId)?.name ?? playerId;
      setSubAnnouncement((prev) => ({
        text: t('playtimePlanner.lineup.promotedStarter', '{{player}} promoted to starter', { player: name }),
        nonce: prev.nonce + 1,
      }));
    },
    [updateActivePlan, t, activePlan],
  );

  const handleClearAllPlacements = useCallback(
    (gameId: string) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => (g.id === gameId ? { ...g, ...clearAllPlacements(g) } : g)),
      }));
      setSubAnnouncement((prev) => ({
        text: t('playtimePlanner.lineup.clearedAll', 'Field cleared'),
        nonce: prev.nonce + 1,
      }));
    },
    [updateActivePlan, t],
  );

  // Empty EVERY game's field in the plan (behind a confirm - it nukes the
  // whole schedule; the planner's undo restores it in one tap).
  const handleClearAllGames = useCallback(() => {
    updateActivePlan((plan) => ({
      ...plan,
      games: plan.games.map((g) => ({ ...g, ...clearAllPlacements(g) })),
    }));
    setSubAnnouncement((prev) => ({
      text: t('playtimePlanner.lineup.clearedAllGames', 'All games cleared'),
      nonce: prev.nonce + 1,
    }));
  }, [updateActivePlan, t]);

  // Direct-manipulation stint edits: move a scheduled sub to another position /
  // hand it to another player (bench tap with a stint selected).
  const handleMoveSub = useCallback(
    (gameId: string, subId: string, slotId: string) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => (g.id === gameId ? { ...g, subs: moveSubToSlot(g.subs, subId, slotId) } : g)),
      }));
      setSubAnnouncement((prev) => ({
        text: t('playtimePlanner.lineup.movedSub', 'Substitution moved'),
        nonce: prev.nonce + 1,
      }));
    },
    [updateActivePlan, t],
  );

  const handleSetSubPlayer = useCallback(
    (gameId: string, subId: string, playerId: string) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => (g.id === gameId ? { ...g, subs: setSubPlayer(g.subs, subId, playerId) } : g)),
      }));
      setSubAnnouncement((prev) => ({
        text: t('playtimePlanner.lineup.subPlayerChanged', 'Substitution updated'),
        nonce: prev.nonce + 1,
      }));
    },
    [updateActivePlan, t],
  );

  const handleRemoveSub = useCallback(
    (gameId: string, subId: string) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => (g.id === gameId ? { ...g, subs: removeSub(g.subs, subId) } : g)),
      }));
      setSubAnnouncement((prev) => ({
        text: t('playtimePlanner.subs.removed', 'Substitution removed'),
        nonce: prev.nonce + 1,
      }));
    },
    [updateActivePlan, t],
  );

  // Flush a pending debounced save when the modal is hidden (Escape, Close, or
  // the parent hiding it) or unmounts, so the last edit is never lost to the debounce.
  useEffect(() => {
    if (!isOpen) void flushSave();
  }, [isOpen, flushSave]);
  useEffect(() => () => void flushSave(), [flushSave]);

  // ── Versions & JSON (PR 1.6) ──
  const refreshPlanList = useCallback(async () => {
    const plans = await getPlans();
    const list = Object.values(plans).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setPlanList(list);
    return list;
  }, []);

  const handleSwitchPlan = useCallback(
    async (id: string) => {
      if (id === activePlan?.id) return;
      teamSelectRef.current++; // invalidate any in-flight team-roster fetch
      await flushSave(); // persist the outgoing plan before reading the target
      const p = await getPlan(id);
      if (p) {
        // Self-heal stale absence data from older builds (placed-and-absent,
        // removed players' ids) before the plan touches the UI or history.
        const healed = normalizePlanAbsences(p);
        setActivePlan(healed);
        seedHistory(healed);
        setEditingGameId(null);
        setReplacingId(null);
        setHighlightPlayerIds([]);
        setView('games');
      } else {
        // Target is gone (e.g. deleted in another tab). Tell the user instead of
        // letting the controlled <select> silently snap back with no explanation.
        showToast(t('playtimePlanner.versions.switchError', 'Could not open that plan.'), 'error');
        await refreshPlanList();
      }
    },
    [activePlan?.id, flushSave, refreshPlanList, seedHistory, showToast, t],
  );

  // Phase 3.4: tally unplayed real games created from each planned game so the
  // overview can offer a one-tap "update N games" action.
  const refreshLinkedCounts = useCallback(
    async (planId: string) => {
      try {
        const [games, links] = await Promise.all([getSavedGames(user?.id), getAllPlanLinks()]);
        setLinkedCounts(countReapplicableGames(games, links, planId));
      } catch (err) {
        logger.error('[planner] Failed to count linked games (non-fatal)', err);
        setLinkedCounts({});
      }
    },
    [user],
  );

  // Re-count when the active plan changes AND on isOpen: GameContainer currently
  // unmounts the closed planner (fresh mount per open), but this must not silently
  // regress if a host ever keeps it mounted with isOpen=false - games can be
  // created/played/deleted between opens, so a stale count would mis-label the
  // "update N games" button.
  useEffect(() => {
    const planId = activePlan?.id;
    let cancelled = false;
    void (async () => {
      if (!isOpen || !planId) {
        if (!cancelled) setLinkedCounts({});
        return;
      }
      await refreshLinkedCounts(planId);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, activePlan?.id, refreshLinkedCounts]);

  // Re-apply the current plan to every unplayed game created from one planned game.
  // Guarded behind the app's ConfirmationModal (not window.confirm): the "update"
  // button stores the target game, the confirm dialog runs this.
  const handleReapplyLinkedGames = useCallback(
    async (game: PlanGame) => {
      if (!activePlan) return;
      const count = linkedCounts[game.id] ?? 0;
      if (count === 0) return;
      // Persist any in-flight PLAN edits first so the re-apply uses the latest
      // lineup, and flush the host's loaded-GAME autosave so its pending edits are
      // in the blob we're about to read and rewrite (not silently dropped).
      await flushSave();
      await onFlushLiveGame?.();
      try {
        const summary = await reapplyPlanToLinkedGames(
          {
            getAllGames: () => getSavedGames(user?.id),
            getAllPlanLinks,
            saveGame: (id, g) => utilSaveGame(id, g, user?.id),
            setGameSubs,
          },
          activePlan,
          game.id,
        );
        // The saved-games React Query cache is now stale - refetch so a later load
        // shows the updated lineup.
        queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, user?.id] });
        // Let the host refresh live state if the currently loaded game was updated
        // (otherwise its next autosave would revert the storage write).
        if (summary.updatedIds.length > 0) onLinkedGamesUpdated?.(summary.updatedIds);
        await refreshLinkedCounts(activePlan.id);
        // The pluralized number rides the i18next `count` option (selects the
        // _one/_other key variants); other numbers are plain interpolations.
        if (summary.failed > 0) {
          // Partial success: some games were updated, some writes failed - say so
          // explicitly rather than reporting a clean success.
          showToast(
            t(
              'playtimePlanner.overview.reapplyDonePartial',
              'Updated {{count}} games; {{failed}} could not be updated.',
              { count: summary.updated, failed: summary.failed },
            ),
            'error',
          );
        } else if (summary.skippedNoRoster > 0) {
          // Honest count: a linked game whose roster was since emptied is left
          // untouched - say so instead of letting "Updated N" imply everything.
          showToast(
            t(
              'playtimePlanner.overview.reapplyDoneNoRoster',
              'Updated {{updated}} games; {{skipped}} had no players in their roster and were left unchanged.',
              { updated: summary.updated, skipped: summary.skippedNoRoster },
            ),
            'info',
          );
        } else {
          showToast(
            summary.missingTotal > 0
              ? t(
                  'playtimePlanner.overview.reapplyDoneMissing',
                  'Updated {{count}} games. Not in a game roster, skipped: {{names}}.',
                  { count: summary.updated, names: summary.missingNames.join(', ') },
                )
              : t('playtimePlanner.overview.reapplyDone', 'Updated {{count}} games from the plan.', {
                  count: summary.updated,
                }),
            'success',
          );
        }
      } catch (err) {
        logger.error('[planner] Bulk re-apply failed', err);
        showToast(t('playtimePlanner.overview.reapplyError', 'Could not update the linked games.'), 'error');
      }
    },
    [activePlan, linkedCounts, user, flushSave, onFlushLiveGame, queryClient, refreshLinkedCounts, onLinkedGamesUpdated, showToast, t],
  );

  // Duplicate from the manager's 3-dot menu: the copy lands as a new row (the
  // user stays in the manager) instead of opening. When the source is the
  // still-loaded plan, its pending edits are flushed and used so the copy
  // matches what the user last saw.
  const [isDuplicating, setIsDuplicating] = useState(false);
  const handleDuplicate = useCallback(
    async (target: PlaytimePlan) => {
      // Re-entry guard: a double-tap on the menu item before it unmounts used
      // to create two "(copy)" plans (same class of bug as isCreating).
      if (isDuplicating) return;
      setIsDuplicating(true);
      try {
        const isActive = activePlan?.id === target.id;
        if (isActive) await flushSave();
        const source = isActive && activePlan ? activePlan : target;
        const suffix = ` ${t('playtimePlanner.versions.copySuffix', '(copy)')}`;
        // A copy always starts active, even when duplicated off an archived plan.
        const saved = await savePlan({ ...duplicatePlan(source, suffix), archived: false });
        if (!saved) {
          showToast(t('playtimePlanner.saveError', 'Could not save the plan. Your latest changes may not persist.'), 'error');
          return;
        }
        await refreshPlanList();
      } finally {
        setIsDuplicating(false);
      }
    },
    [activePlan, isDuplicating, flushSave, refreshPlanList, showToast, t],
  );

  // Archive/unarchive from the manager. If the target is the still-loaded plan,
  // the in-memory copy and history reseed too - otherwise a later autosave of
  // the stale copy would silently flip the flag back.
  const handleToggleArchive = useCallback(
    async (target: PlaytimePlan) => {
      const isActive = activePlan?.id === target.id;
      if (isActive) await flushSave();
      const base = isActive && activePlan ? activePlan : target;
      const saved = await savePlan({ ...base, archived: !base.archived });
      if (!saved) {
        showToast(t('playtimePlanner.saveError', 'Could not save the plan. Your latest changes may not persist.'), 'error');
        return;
      }
      if (isActive) {
        setActivePlan(saved);
        seedHistory(saved);
      }
      await refreshPlanList();
    },
    [activePlan, flushSave, refreshPlanList, seedHistory, showToast, t],
  );

  // Close the manager's actions menu on any outside tap (house pattern from the
  // competitions modal).
  useEffect(() => {
    if (!actionsMenuId) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [actionsMenuId]);

  const handleExport = useCallback(() => {
    if (!activePlan) return;
    // Fire-and-forget is fine here (unlike handleSwitchPlan): export serializes the
    // in-memory activePlan, not a storage re-read, so it needs no read-after-write.
    void flushSave();
    try {
      const blob = new Blob([serializePlan(activePlan)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Sanitize the user-editable plan name into a safe filename.
      const safeName = (activePlan.name || 'plan').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'plan';
      a.download = `${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('[PlaytimePlannerModal] Export failed:', error);
      showToast(t('playtimePlanner.versions.exportError', 'Could not export the plan.'), 'error');
    }
  }, [activePlan, flushSave, showToast, t]);

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const imported = await importPlan(await file.text());
        if (!imported) {
          showToast(t('playtimePlanner.versions.importError', 'Could not read that file as a plan.'), 'error');
          return;
        }
        const healedImport = normalizePlanAbsences(imported);
        setActivePlan(healedImport);
        seedHistory(healedImport);
        setEditingGameId(null);
        setReplacingId(null);
        setHighlightPlayerIds([]);
        setView('games');
        await refreshPlanList();
      } catch (error) {
        logger.error('[PlaytimePlannerModal] Import failed:', error);
        showToast(t('playtimePlanner.versions.importError', 'Could not read that file as a plan.'), 'error');
      }
    },
    [refreshPlanList, seedHistory, showToast, t],
  );

  // Roster editing (Phase 4): add / replace / remove players on an existing plan.
  // Plan-level only - real games change only via an explicit re-apply afterwards.
  // Master-roster players not yet in the plan (candidates for add/replace),
  // shown with the same disc name (nickname first) the plan stores.
  const rosterCandidates = useMemo(() => {
    if (!activePlan) return [] as { id: string; name: string }[];
    const inPlan = new Set(activePlan.players.map((p) => p.id));
    return roster
      .filter((p) => !inPlan.has(p.id))
      .map((p) => ({ id: p.id, name: p.nickname?.trim() || p.name }));
  }, [roster, activePlan]);

  // Overview roster checkboxes (same gradient picker as creation): the full
  // master roster, plus any plan players no longer on it (imported plans),
  // with the plan's members checked.
  const overviewRoster = useMemo((): Player[] => {
    if (!activePlan) return [];
    const known = new Set(roster.map((p) => p.id));
    const extras: Player[] = activePlan.players
      .filter((pp) => !known.has(pp.id))
      .map((pp) => ({ id: pp.id, name: pp.name }));
    return [...roster, ...extras];
  }, [roster, activePlan]);

  // Live fairness read for the lineup view: cumulative planned minutes per player
  // across the WHOLE plan, recomputed on every edit (the engine is pure + fast at
  // this scale). One engine run feeds both the per-player map (disc fills, bench
  // tints) and the sorted worst-first strip rows.
  const fairness = useMemo(() => {
    if (!activePlan) {
      return { byPlayer: {} as Record<string, PlanPlayerMinutes>, rows: [] as FairnessStripRow[] };
    }
    const m = computePlanMinutes(toEnginePlan(activePlan));
    const planNameById = new Map(activePlan.players.map((pp) => [pp.id, pp.name]));
    const byPlayer: Record<string, PlanPlayerMinutes> = {};
    const rows: (FairnessStripRow & { totalSeconds: number })[] = [];
    for (const pl of m.players) {
      const entry = { minutes: Math.round(pl.totalSeconds / 60), ratio: pl.ratio };
      byPlayer[pl.playerId] = entry;
      rows.push({
        id: pl.playerId,
        name: planNameById.get(pl.playerId) ?? pl.playerId,
        totalSeconds: pl.totalSeconds,
        ...entry,
      });
    }
    rows.sort((a, b) => a.totalSeconds - b.totalSeconds || a.name.localeCompare(b.name));
    return { byPlayer, rows };
  }, [activePlan]);
  // Cross-surface highlight: tap strip cells / minutes chips / warnings to track
  // one OR MORE players everywhere (multi-select enables side-by-side comparison,
  // e.g. the spread warning highlighting both the least and most played).
  const [highlightPlayerIds, setHighlightPlayerIds] = useState<string[]>([]);
  const toggleHighlight = useCallback((playerId: string) => {
    setHighlightPlayerIds((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId],
    );
  }, []);
  // Warnings REPLACE the selection with their affected players; tapping the same
  // warning again clears it (exact-set toggle, standalone behavior).
  const replaceHighlights = useCallback((playerIds: string[]) => {
    setHighlightPlayerIds((prev) => {
      const same = prev.length === playerIds.length && playerIds.every((id) => prev.includes(id));
      return same ? [] : playerIds;
    });
  }, []);

  const handleReplacePlanPlayer = useCallback(
    (oldId: string, replacement: { id: string; name: string }) => {
      updateActivePlan((plan) => replacePlayerInPlan(plan, oldId, replacement));
      setReplacingId(null);
      // Tracking follows the takeover: if the replaced player was highlighted,
      // the highlight moves to whoever inherited their slots and subs.
      setHighlightPlayerIds((prev) => prev.map((id) => (id === oldId ? replacement.id : id)));
    },
    [updateActivePlan],
  );
  const handleRemovePlanPlayer = useCallback(
    (playerId: string) => {
      updateActivePlan((plan) => removePlayerFromPlan(plan, playerId));
      // Advance only when the confirmed player is still the queue head - a
      // double-tap otherwise slices twice and silently skips the next player.
      setRemoveQueue((q) => (q[0]?.id === playerId ? q.slice(1) : q));
      // A dangling highlight would ghost-dim the whole lineup with no cell left
      // to un-toggle it.
      setHighlightPlayerIds((prev) => prev.filter((id) => id !== playerId));
    },
    [updateActivePlan],
  );
  // Overview checkbox diffing: additions apply instantly; unchecking a player
  // with lineup spots or subs routes through the impact-confirm QUEUE (asked
  // one at a time). Zero-impact removals just leave; undo covers them like any
  // other edit.
  const handleOverviewRosterChange = useCallback(
    (ids: string[]) => {
      if (!activePlan) return;
      const next = new Set(ids);
      const current = new Set(activePlan.players.map((p) => p.id));
      const additions = overviewRoster
        .filter((p) => next.has(p.id) && !current.has(p.id))
        .map((p) => ({ id: p.id, name: p.nickname?.trim() || p.name }));
      const removals = activePlan.players.filter((p) => !next.has(p.id));
      const impacted = removals.filter((p) => {
        const impact = playerPlanImpact(activePlan, p.id);
        return impact.startingCount + impact.subCount > 0;
      });
      const clean = removals.filter((p) => !impacted.includes(p));
      if (additions.length > 0 || clean.length > 0) {
        const cleanIds = new Set(clean.map((p) => p.id));
        updateActivePlan((plan) => {
          let updated = plan;
          for (const pp of additions) updated = addPlayerToPlan(updated, pp);
          for (const id of cleanIds) updated = removePlayerFromPlan(updated, id);
          return updated;
        });
        setHighlightPlayerIds((prev) => prev.filter((id) => !cleanIds.has(id)));
      }
      if (impacted.length > 0) setRemoveQueue(impacted);
    },
    [activePlan, overviewRoster, updateActivePlan],
  );

  // Team change on an EXISTING plan (overview format editor). Mirrors creation's
  // name-matching against the master roster, but goes through the plan roster's
  // add/remove machinery: matched players join instantly, unmatched ones with
  // lineup spots queue through the impact confirm. Game durations are NOT
  // rewritten - the coach edits lengths in the same card if needed.
  const handleOverviewTeamChange = useCallback(
    async (nextTeamId: string) => {
      if (!activePlan) return;
      const requestId = ++teamSelectRef.current;
      if (!nextTeamId) {
        // Freehand again: unstamp the source team, keep the roster as-is.
        updateActivePlan((plan) => ({ ...plan, teamId: undefined }));
        return;
      }
      try {
        const teamRoster = await getTeamRoster(nextTeamId, user?.id);
        if (teamSelectRef.current !== requestId) return;
        const names = new Set(teamRoster.map((tp) => tp.name.trim().toLowerCase()));
        const matched = roster.filter((p) => names.has(p.name.trim().toLowerCase()));
        const matchedIds = new Set(matched.map((p) => p.id));
        const current = new Set(activePlan.players.map((p) => p.id));
        const additions = matched
          .filter((p) => !current.has(p.id))
          .map((p) => ({ id: p.id, name: p.nickname?.trim() || p.name }));
        const removals = activePlan.players.filter((p) => !matchedIds.has(p.id));
        const impacted = removals.filter((p) => {
          const impact = playerPlanImpact(activePlan, p.id);
          return impact.startingCount + impact.subCount > 0;
        });
        const cleanIds = new Set(removals.filter((p) => !impacted.includes(p)).map((p) => p.id));
        const targetPlanId = activePlan.id;
        updateActivePlan((plan) => {
          // Belt and braces: never apply a diff computed for one plan to another
          // (the requestId guard covers nav paths, this covers everything else).
          if (plan.id !== targetPlanId) return plan;
          let updated: PlaytimePlan = { ...plan, teamId: nextTeamId };
          for (const pp of additions) updated = addPlayerToPlan(updated, pp);
          for (const id of cleanIds) updated = removePlayerFromPlan(updated, id);
          return updated;
        });
        setHighlightPlayerIds((prev) => prev.filter((id) => !cleanIds.has(id)));
        if (impacted.length > 0) setRemoveQueue(impacted);
      } catch (error) {
        if (teamSelectRef.current !== requestId) return;
        logger.error('[PlaytimePlannerModal] Failed to load team roster:', error);
        showToast(t('playtimePlanner.setup.teamLoadError', "Could not load that team's roster."), 'error');
      }
    },
    [activePlan, roster, updateActivePlan, user, showToast, t],
  );

  // Overview format edits apply to EVERY game, like creation's single format.
  // Formation changes keep players by slot index where slots overlap (gk, s0…)
  // and drop assignments/subs whose slot no longer exists - undo restores.
  const handleFormationChange = useCallback(
    (fid: string) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => {
          const next = { ...g, formationId: fid };
          const slotIds = new Set(getGameSlots(fid).map((slot) => slot.slotId));
          return {
            ...next,
            startingSlots: ensureStartingSlots(next),
            subs: g.subs.filter((sub) => slotIds.has(sub.slotId)),
          };
        }),
      }));
    },
    [updateActivePlan],
  );
  const handleDurationChange = useCallback(
    (patch: Partial<Pick<PlanGame, 'numberOfPeriods' | 'periodMinutes'>>) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => ({ ...g, ...patch })),
      }));
    },
    [updateActivePlan],
  );

  // Add/remove games after creation. New games copy the last game's format;
  // removal is per-row on the plan tab and asks first if the game has content.
  const handleAddGame = useCallback(() => {
    updateActivePlan((plan) => {
      if (plan.games.length >= 20) return plan;
      const last = plan.games[plan.games.length - 1];
      return {
        ...plan,
        games: [
          ...plan.games,
          {
            id: generateId('ptg'),
            label: t('playtimePlanner.overview.gameLabel', 'Game {{n}}', { n: plan.games.length + 1 }),
            formationId: last?.formationId ?? DEFAULT_FORMATION,
            numberOfPeriods: last?.numberOfPeriods ?? 2,
            periodMinutes: last?.periodMinutes ?? 12,
            included: true,
            startingSlots: [],
            subs: [],
          },
        ],
      };
    });
  }, [updateActivePlan, t]);
  // Toggle a player's absence for one game. Marking absent also clears their
  // lineup spots and incoming subs in THAT game (an absent starter would be a
  // lie on the field); marking available just returns them to the bench.
  // One updateActivePlan call = one undo step.
  const handleToggleAbsent = useCallback(
    (gameId: string, playerId: string) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => {
          if (g.id !== gameId) return g;
          const absent = new Set(g.absentIds ?? []);
          if (absent.has(playerId)) {
            absent.delete(playerId);
            return { ...g, absentIds: [...absent] };
          }
          absent.add(playerId);
          return {
            ...g,
            absentIds: [...absent],
            startingSlots: g.startingSlots.map((slot) =>
              slot.playerId === playerId ? { ...slot, playerId: null } : slot,
            ),
            subs: g.subs.filter((sub) => sub.inPlayerId !== playerId),
          };
        }),
      }));
    },
    [updateActivePlan],
  );

  const performRemoveGame = useCallback(
    (gameId: string) => {
      updateActivePlan((plan) =>
        plan.games.length > 1 ? { ...plan, games: plan.games.filter((g) => g.id !== gameId) } : plan,
      );
      // A stale id would misroute the swipe gesture (findIndex -1 walks to
      // games[0]); null falls back to the first game everywhere.
      setEditingGameId((id) => (id === gameId ? null : id));
      setTrimConfirm(null);
    },
    [updateActivePlan],
  );
  const requestRemoveGame = useCallback(
    (game: PlanGame) => {
      if (!activePlan || activePlan.games.length <= 1) return;
      const hasContent = game.startingSlots.some((slot) => slot.playerId) || game.subs.length > 0;
      if (hasContent) setTrimConfirm(game);
      else performRemoveGame(game.id);
    },
    [activePlan, performRemoveGame],
  );

  // Plan deletion is confirmed via the app's ConfirmationModal (danger variant),
  // matching every other destructive action in the app. isDeleting gates re-entry:
  // a double-tap used to race two deletes, and the second (finding the plan gone)
  // showed a spurious "could not delete" toast after a successful delete.
  const performDelete = async (target: PlaytimePlan) => {
    if (isDeleting) return;
    const isActive = activePlan?.id === target.id;
    // Cancel any pending autosave for the plan we're about to remove, but KEEP the
    // dirty state until the delete succeeds - if it fails, the plan still exists
    // and silently discarding the user's last ~600ms of edits would desync the
    // on-screen plan from storage.
    if (isActive && saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const deleted = await deletePlan(target.id);
    if (!deleted) {
      showToast(t('playtimePlanner.deleteError', 'Could not delete the plan.'), 'error');
      if (isActive) {
        // The plan survives - persist its pending edits now instead of dropping them.
        const pending = dirtyPlanRef.current;
        dirtyPlanRef.current = null;
        if (pending) void persist(pending);
      }
      return;
    }
    if (isActive) dirtyPlanRef.current = null;
    // Purge links pointing at the deleted plan so linked games don't keep offering
    // a "Re-apply plan" that can only fail. Best-effort (links are also validated
    // against the plan on read).
    await deletePlanLinksForPlan(target.id).catch((err) => logger.error('[planner] Plan-links cleanup after delete failed:', err));
    const plans = await getPlans();
    const list = Object.values(plans).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setPlanList(list);
    if (isActive) {
      setActivePlan(null);
      seedHistory(null);
    }
    if (list.length > 0) {
      if (isActive || view === 'manager') setView('manager');
    } else {
      setActivePlan(null);
      seedHistory(null);
      resetSetupForm(roster);
      setView('setup');
    }
  };
  const handleDeleteConfirmed = async () => {
    const target = deleteTarget;
    if (!target) return;
    setIsDeleting(true);
    try {
      await performDelete(target);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Leave the open plan back to the manager: persist pending edits first so the
  // list shows fresh names/metadata.
  const handleBackToManager = useCallback(async () => {
    teamSelectRef.current++; // invalidate any in-flight team-roster fetch
    await flushSave();
    await refreshPlanList();
    setEditingGameId(null);
    setReplacingId(null);
    setSubSheetTarget(null);
    setView('manager');
  }, [flushSave, refreshPlanList]);

  // Open a plan from the manager (re-opening the already-loaded plan is instant).
  const handleOpenPlan = useCallback(
    (id: string) => {
      if (activePlan?.id === id) {
        setView('games');
        return;
      }
      void handleSwitchPlan(id);
    },
    [activePlan?.id, handleSwitchPlan],
  );

  // Escape steps back one level: plan tabs -> manager -> close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A ConfirmationModal is open: Escape belongs to it (cancel). This listener
      // registered earlier, so it would fire FIRST and also navigate - skip.
      if (deleteTarget !== null || removeTarget !== null || bulkReapplyTarget !== null || trimConfirm !== null || showSuggestConfirm || showClearAllGamesConfirm) return;
      // Typing in a field: Escape dismisses the field (the desktop reflex),
      // never yanks the user off the screen mid-edit.
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.tagName === 'SELECT')
      ) {
        focused.blur();
        return;
      }
      // The manager's actions menu is open: Escape closes it, nothing else.
      if (actionsMenuId !== null) {
        setActionsMenuId(null);
        return;
      }
      // The sub sheet is open: Escape closes it, nothing else.
      if (subSheetTarget !== null) {
        setSubSheetTarget(null);
        return;
      }
      if (isPlanTab(view)) {
        void handleBackToManager();
      } else {
        handleClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, view, handleClose, deleteTarget, removeTarget, bulkReapplyTarget, trimConfirm, showSuggestConfirm, showClearAllGamesConfirm, subSheetTarget, actionsMenuId, handleBackToManager]);

  const startNewPlan = () => {
    resetSetupForm(roster);
    setView('setup');
  };

  const formationOptions = useMemo(
    () =>
      FIELD_SIZES.map((size) => ({
        size,
        presets: PRESETS_BY_SIZE[size],
      })),
    [],
  );

  const editingGame = activePlan?.games.find((g) => g.id === editingGameId) ?? activePlan?.games[0] ?? null;

  // Keep the active game's ribbon tab in view - jumping to G14 from the
  // Minutes tab (or by swiping) must not leave the ribbon showing G1-G4.
  // HORIZONTAL only, by hand: scrollIntoView also scrolled the PAGE, yanking
  // the user back to the top of the tab after every swipe on the field.
  const editingGameIdResolved = editingGame?.id ?? null;
  useEffect(() => {
    if (view !== 'games' || !editingGameIdResolved) return;
    const nav = ribbonRef.current;
    const el = nav?.querySelector(`[data-game-id="${editingGameIdResolved}"]`);
    if (!nav || !(el instanceof HTMLElement)) return;
    const nr = nav.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.left < nr.left) nav.scrollLeft += er.left - nr.left;
    else if (er.right > nr.right) nav.scrollLeft += er.right - nr.right;
  }, [view, editingGameIdResolved]);

  if (!isOpen) return null;

  return (
    <ModalContainer containerRef={modalRootRef} aria-label={t('playtimePlanner.title', 'Match planner')}>
      {/* Header names what's on screen: tool name outside a plan; the ACTIVE
          GAME (tap-editable) on the single-game surface; the plan name
          (tap-editable on the plan tab) everywhere else in an open plan. */}
      {activePlan && isPlanTab(view) ? (
        view === 'games' && gamesLayout === 'single' && editingGame ? (
          <div className={headerStyle}>
            <input
              type="text"
              value={editingGame.label}
              onChange={(e) => {
                const value = e.target.value;
                updateActivePlan(
                  (plan) => ({
                    ...plan,
                    games: plan.games.map((g) => (g.id === editingGame.id ? { ...g, label: value } : g)),
                  }),
                  { coalesceKey: `game-label:${editingGame.id}` },
                );
              }}
              aria-label={t('playtimePlanner.lineup.gameName', 'Game name')}
              className={`${titleStyle} w-full bg-transparent text-center rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            />
          </div>
        ) : view === 'plan' ? (
          <div className={headerStyle}>
            <input
              type="text"
              value={activePlan.name}
              onChange={(e) => {
                const value = e.target.value;
                updateActivePlan((plan) => ({ ...plan, name: value }), { coalesceKey: 'plan-name' });
              }}
              aria-label={t('playtimePlanner.setup.nameLabel', 'Plan name')}
              className={`${titleStyle} w-full bg-transparent text-center rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            />
          </div>
        ) : (
          <div className={headerStyle}>
            <h2 className={`${titleStyle} truncate`}>{activePlan.name}</h2>
          </div>
        )
      ) : (
        <ModalHeader title={t('playtimePlanner.title', 'Match planner')} />
      )}

      {/* House pattern (TeamManager/RosterSettings): create-new is a full-width
          primary button PINNED under the header, not buried in the scroll. */}
      {view === 'manager' && (
        <div className="px-6 py-3 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          <button type="button" onClick={startNewPlan} className={`${primaryButtonStyle} w-full`}>
            {t('playtimePlanner.manager.new', 'New plan')}
          </button>
        </div>
      )}

      {/* The three peer tabs of an open plan (standalone structure, house tab
          styling from GameStats): the working surface, the fairness read, and
          the plan's data. No hub page, no Back-stepping between them. */}
      {activePlan && isPlanTab(view) && (
        <div ref={tabsOuterRef} className="flex-shrink-0 overflow-hidden">
        <div
          ref={tabsInnerRef}
          className="px-6 py-3 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20"
        >
          <div
            className="flex w-full gap-2"
            role="tablist"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              const idx = PLAN_TABS.indexOf(view as PlanTab);
              const next = PLAN_TABS[(idx + (e.key === 'ArrowRight' ? 1 : PLAN_TABS.length - 1)) % PLAN_TABS.length];
              setSubSheetTarget(null);
              setView(next);
              (e.currentTarget.querySelector(`#planner-tab-${next}`) as HTMLElement | null)?.focus();
            }}
          >
            {(
              [
                ['games', t('playtimePlanner.tabs.games', 'Games')],
                ['minutes', t('playtimePlanner.tabs.minutes', 'Balance')],
                ['plan', t('playtimePlanner.tabs.plan', 'Settings')],
              ] as [PlanTab, string][]
            ).map(([tab, label]) => (
              <button
                key={tab}
                id={`planner-tab-${tab}`}
                role="tab"
                aria-selected={view === tab}
                aria-controls={`planner-panel-${tab}`}
                tabIndex={view === tab ? 0 : -1}
                onClick={() => {
                  setSubSheetTarget(null);
                  setView(tab);
                }}
                className={`flex-1 px-2 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  view === tab ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        </div>
      )}

      <ScrollableContent className="px-6 py-4" onScroll={handleContentScroll} data-testid="planner-scroll">
        {view === 'loading' && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <svg className="animate-spin h-8 w-8 mb-3 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {t('common.loading', 'Loading...')}
          </div>
        )}

        {view === 'setup' && (
          <div className="space-y-4">
            {roster.length === 0 ? (
              <div className="text-center py-8">
                <HiOutlineUsers className="w-12 h-12 mx-auto mb-3 text-slate-600" aria-hidden="true" />
                <p className="text-lg font-medium text-slate-300 mb-1">
                  {t('playtimePlanner.setup.rosterEmpty', 'Add players to your roster first.')}
                </p>
                <p className="text-slate-500 text-sm">
                  {t('playtimePlanner.setup.rosterEmptyHint', 'Open All Players from the main menu to add your squad.')}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4 bg-gradient-to-br from-slate-900/60 to-slate-800/40 p-4 rounded-lg border border-slate-700 shadow-inner">
                <h3 className="text-lg font-semibold text-slate-200 mb-3">{t('playtimePlanner.setup.detailsHeading', 'Plan details')}</h3>
                <div>
                  <label className={labelStyle}>{t('playtimePlanner.setup.nameLabel', 'Plan name')}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputBaseStyle}
                    placeholder={t('playtimePlanner.setup.namePlaceholder', 'e.g. Sunday tournament')}
                  />
                </div>

                {teams.length > 0 && (
                  <div>
                    <label className={labelStyle}>{t('playtimePlanner.setup.teamLabel', 'Team (optional)')}</label>
                    <select
                      value={teamId}
                      onChange={(e) => void applyTeamSelection(e.target.value)}
                      className={selectStyle}
                    >
                      <option value="">{t('playtimePlanner.setup.teamNone', 'No team - all players')}</option>
                      {teams.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {getTeamDisplayName(tm, seasons, tournaments, { futsalLabel: t('common.futsal', 'Futsal') })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                </div>

                {/* House roster picker - the same component new-game setup and
                    game settings use (gradient card, Select All, yellow counter). */}
                <PlayerSelectionSection
                  availablePlayers={roster}
                  selectedPlayerIds={[...selectedIds]}
                  onSelectedPlayersChange={(ids) => setSelectedIds(new Set(ids))}
                  title={t('playtimePlanner.setup.rosterLabel', 'Players')}
                  playersSelectedText={t('newGameSetupModal.playersSelected', 'selected')}
                  selectAllText={t('newGameSetupModal.selectAll', 'Select All')}
                  noPlayersText={t('newGameSetupModal.noPlayersInRoster', 'No players in roster. Add players in Roster Settings.')}
                />

                <div className="space-y-4 bg-gradient-to-br from-slate-900/60 to-slate-800/40 p-4 rounded-lg border border-slate-700 shadow-inner">
                <h3 className="text-lg font-semibold text-slate-200 mb-3">{t('playtimePlanner.setup.formatHeading', 'Games & format')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelStyle}>{t('playtimePlanner.setup.gamesLabel', 'Number of games')}</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={gameCount}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setGameCount(Math.max(1, Math.min(20, Math.floor(Number(e.target.value) || 1))))}
                      className={inputBaseStyle}
                    />
                  </div>
                  <div>
                    <label className={labelStyle}>{t('playtimePlanner.setup.formationLabel', 'Formation')}</label>
                    <select
                      value={formationId}
                      onChange={(e) => setFormationId(e.target.value)}
                      className={selectStyle}
                    >
                      {formationOptions.map(({ size, presets }) => (
                        <optgroup key={size} label={size}>
                          {presets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>{t('playtimePlanner.setup.periodsLabel', 'Periods')}</label>
                    <select
                      value={numberOfPeriods}
                      onChange={(e) => setNumberOfPeriods(Number(e.target.value))}
                      className={selectStyle}
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>{t('playtimePlanner.setup.periodMinutesLabel', 'Minutes per period')}</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={periodMinutes}
                      // Select on focus so typing replaces the value instead of appending
                      // to it (appending to "12" gave "12x" > 60, which clamped to 60).
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setPeriodMinutes(Math.max(1, Math.min(60, Math.floor(Number(e.target.value) || 1))))}
                      className={inputBaseStyle}
                    />
                  </div>
                </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={selectedIds.size === 0 || isCreating}
                  className={`${primaryButtonStyle} w-full`}
                >
                  {t('playtimePlanner.setup.create', 'Create plan')}
                </button>
              </>
            )}
          </div>
        )}

        {view === 'manager' && (
          <div className="space-y-4">
            {/* Rows sit directly on the background like LoadGame's list - an
                outer card double-insets them and reads narrower than the app. */}
            <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-200">{t('playtimePlanner.manager.title', 'Plans')}</h3>
              {planList.some((p) => p.archived) && (
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  aria-pressed={showArchived}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                    showArchived ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {t('playtimePlanner.manager.showArchived', 'Show archived')}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {planList.filter((p) => showArchived || !p.archived).map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-1 bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 transition-all rounded-lg ${p.archived ? 'opacity-60' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenPlan(p.id)}
                    className="flex-1 min-w-0 flex items-center justify-between gap-3 p-4 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-base font-semibold text-slate-100 truncate">{p.name}</span>
                        {p.archived && (
                          <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-slate-700/70 text-slate-400 border border-slate-600">
                            {t('playtimePlanner.manager.archivedBadge', 'Archived')}
                          </span>
                        )}
                      </span>
                      <span className={subtextStyle}>
                        {t('playtimePlanner.manager.meta', '{{games}} games · {{players}} players', {
                          games: p.games.length,
                          players: p.players.length,
                        })}
                      </span>
                    </span>
                    <HiChevronRight aria-hidden="true" className="w-5 h-5 text-slate-500 shrink-0" />
                  </button>
                  {/* 3-dot actions menu - same pattern as the competitions list:
                      edit (open), duplicate, archive, delete. No standing red
                      button anywhere. */}
                  <div
                    className="relative shrink-0 mr-2"
                    ref={actionsMenuId === p.id ? actionsMenuRef : null}
                  >
                    <button
                      type="button"
                      onClick={() => setActionsMenuId(actionsMenuId === p.id ? null : p.id)}
                      aria-label={`${t('playtimePlanner.manager.actions', 'Plan actions')}: ${p.name}`}
                      aria-expanded={actionsMenuId === p.id}
                      className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-600 rounded transition-colors"
                    >
                      <HiOutlineEllipsisVertical className="w-4 h-4" />
                    </button>
                    {actionsMenuId === p.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50">
                        <button
                          type="button"
                          onClick={() => {
                            setActionsMenuId(null);
                            handleOpenPlan(p.id);
                          }}
                          className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 transition-colors"
                        >
                          <HiOutlinePencil className="w-4 h-4" />
                          {t('common.edit', 'Edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionsMenuId(null);
                            void handleDuplicate(p);
                          }}
                          className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 transition-colors"
                        >
                          <HiOutlineDocumentDuplicate className="w-4 h-4" />
                          {t('playtimePlanner.versions.duplicate', 'Duplicate')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionsMenuId(null);
                            void handleToggleArchive(p);
                          }}
                          className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 transition-colors"
                        >
                          <HiOutlineArchiveBox className="w-4 h-4" />
                          {p.archived
                            ? t('playtimePlanner.manager.unarchive', 'Unarchive')
                            : t('playtimePlanner.manager.archive', 'Archive')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionsMenuId(null);
                            setDeleteTarget(p);
                          }}
                          disabled={isDeleting}
                          className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600/20 flex items-center gap-2 transition-colors"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                          {t('playtimePlanner.overview.deletePlan', 'Delete')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </div>
            {/* New plan is pinned above the scroll; Import JSON lives in the
                footer (left) - only its hidden file input remains here. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {view === 'plan' && activePlan && (
          <div role="tabpanel" id="planner-panel-plan" aria-labelledby="planner-tab-plan" className="space-y-4">
            {/* Roster as checkboxes in the SAME gradient picker as creation -
                checking adds a player to the plan, unchecking removes (with an
                impact confirm when they hold lineup spots). */}
            <PlayerSelectionSection
              availablePlayers={overviewRoster}
              selectedPlayerIds={activePlan.players.map((p) => p.id)}
              onSelectedPlayersChange={handleOverviewRosterChange}
              title={t('playtimePlanner.setup.rosterLabel', 'Players')}
              playersSelectedText={t('newGameSetupModal.playersSelected', 'selected')}
              selectAllText={t('newGameSetupModal.selectAll', 'Select All')}
              noPlayersText={t('newGameSetupModal.noPlayersInRoster', 'No players in roster. Add players in Roster Settings.')}
            />
            {/* Replace-a-player - the one roster edit checkboxes can't express:
                hands one player's lineup spots and subs to another. */}
            <div className="space-y-4 bg-gradient-to-br from-slate-900/60 to-slate-800/40 p-4 rounded-lg border border-slate-700 shadow-inner">
              <button
                type="button"
                onClick={() => setShowReplace((v) => !v)}
                aria-expanded={showReplace}
                className="w-full flex items-center justify-between gap-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-lg font-semibold text-slate-200">
                    {t('playtimePlanner.players.replaceTitle', 'Replace a player')}
                  </span>
                  <span className={subtextStyle}>
                    {t(
                      'playtimePlanner.players.hint',
                      'Changes affect this plan only. Created games update when you re-apply the plan; played games are never changed.',
                    )}
                  </span>
                </span>
                <HiChevronDown
                  aria-hidden="true"
                  className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${showReplace ? 'rotate-180' : ''}`}
                />
              </button>
              {showReplace &&
                (rosterCandidates.length === 0 ? (
                  <p className={subtextStyle}>
                    {t('playtimePlanner.players.noCandidates', 'Everyone from your roster is already in this plan.')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {activePlan.players.map((p) => (
                      <li key={p.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base text-slate-100 font-medium">{p.name}</span>
                          <button
                            type="button"
                            onClick={() => setReplacingId(replacingId === p.id ? null : p.id)}
                            className="text-sm font-medium text-indigo-400 hover:text-indigo-300 py-2 px-2"
                          >
                            {t('playtimePlanner.players.replaceAction', 'Replace')}
                          </button>
                        </div>
                        {replacingId === p.id && (
                          <div className="space-y-1.5">
                            <p className={subtextStyle}>
                              {t('playtimePlanner.players.replacingHint', 'Choose who takes over {{name}}\u0027s lineup spots and subs:', {
                                name: p.name,
                              })}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {rosterCandidates.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => handleReplacePlanPlayer(p.id, c)}
                                  className="px-3 py-1.5 rounded-full bg-slate-700 border border-slate-500/40 text-slate-100 text-sm font-medium hover:bg-indigo-600"
                                >
                                  {c.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ))}
            </div>

            {/* Games & format stays editable AFTER creation - same fields as
                setup, applied to the whole plan. The collapsed header doubles
                as the old format summary line. */}
            <div className="space-y-4 bg-gradient-to-br from-slate-900/60 to-slate-800/40 p-4 rounded-lg border border-slate-700 shadow-inner">
              <button
                type="button"
                onClick={() => setShowFormatEditor((v) => !v)}
                aria-expanded={showFormatEditor}
                className="w-full flex items-center justify-between gap-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-lg font-semibold text-slate-200">
                    {t('playtimePlanner.setup.formatHeading', 'Games & format')}
                  </span>
                  <span className={subtextStyle}>
                    {t('playtimePlanner.overview.formatSummary', '{{games}} games · {{periods}}×{{minutes}} min', {
                      games: activePlan.games.length,
                      periods: activePlan.games[0]?.numberOfPeriods ?? 0,
                      minutes: activePlan.games[0]?.periodMinutes ?? 0,
                    })}
                    {' · '}
                    {getPresetById(activePlan.games[0]?.formationId ?? '')?.name ?? '-'}
                  </span>
                </span>
                <HiChevronDown
                  aria-hidden="true"
                  className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${showFormatEditor ? 'rotate-180' : ''}`}
                />
              </button>
              {showFormatEditor && (
                <>
                  {teams.length > 0 && (
                    <div>
                      <label htmlFor="overview-team" className={labelStyle}>{t('playtimePlanner.setup.teamLabel', 'Team (optional)')}</label>
                      <select
                        id="overview-team"
                        value={activePlan.teamId ?? ''}
                        onChange={(e) => void handleOverviewTeamChange(e.target.value)}
                        className={selectStyle}
                      >
                        <option value="">{t('playtimePlanner.setup.teamNone', 'No team - all players')}</option>
                        {teams.map((tm) => (
                          <option key={tm.id} value={tm.id}>
                            {getTeamDisplayName(tm, seasons, tournaments, { futsalLabel: t('common.futsal', 'Futsal') })}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="overview-formation" className={labelStyle}>{t('playtimePlanner.setup.formationLabel', 'Formation')}</label>
                      <select
                        id="overview-formation"
                        value={activePlan.games[0]?.formationId ?? DEFAULT_FORMATION}
                        onChange={(e) => handleFormationChange(e.target.value)}
                        className={selectStyle}
                      >
                        {formationOptions.map(({ size, presets }) => (
                          <optgroup key={size} label={size}>
                            {presets.map((preset) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="overview-periods" className={labelStyle}>{t('playtimePlanner.setup.periodsLabel', 'Periods')}</label>
                      <select
                        id="overview-periods"
                        value={activePlan.games[0]?.numberOfPeriods ?? 2}
                        onChange={(e) => handleDurationChange({ numberOfPeriods: Number(e.target.value) })}
                        className={selectStyle}
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="overview-period-minutes" className={labelStyle}>{t('playtimePlanner.setup.periodMinutesLabel', 'Minutes per period')}</label>
                      <input
                        id="overview-period-minutes"
                        type="number"
                        min={1}
                        max={60}
                        value={activePlan.games[0]?.periodMinutes ?? 12}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          handleDurationChange({
                            periodMinutes: Math.max(1, Math.min(60, Math.floor(Number(e.target.value) || 1))),
                          })
                        }
                        className={inputBaseStyle}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                // Never ask consent for a no-op: with nothing included the
                // confirm would "accept" and then do nothing.
                if (!activePlan.games.some((g) => g.included)) {
                  showToast(t('playtimePlanner.balance.noGames', 'No games counted yet. Mark games as included.'), 'info');
                  return;
                }
                setShowSuggestConfirm(true);
              }}
              className={`${secondaryButtonStyle} w-full`}
            >
              {t('playtimePlanner.overview.suggestButton', 'Suggest fair lineups')}
            </button>

            {/* Games are EDITED here as data (standalone Settings-tab pattern):
                rename, remove, add. Navigation between games lives on the Games
                tab's ribbon - no more navigate-only cards. */}
            <div>
              <h3 className="text-lg font-semibold text-slate-200 mb-3">{t('playtimePlanner.overview.gamesHeading', 'Games')}</h3>
              <div className="space-y-2">
                {activePlan.games.map((game) => {
                  const slotCount = getGameSlots(game.formationId).length;
                  const placed = ensureStartingSlots(game).filter((s) => s.playerId).length;
                  return (
                    <div
                      key={game.id}
                      className={`p-3 rounded-lg bg-gradient-to-br from-slate-600/50 to-slate-800/30 space-y-1.5 transition-all ${game.included ? '' : 'opacity-60'}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={game.label}
                          aria-label={t('playtimePlanner.lineup.gameName', 'Game name')}
                          onChange={(e) => {
                            const value = e.target.value;
                            updateActivePlan(
                              (plan) => ({
                                ...plan,
                                games: plan.games.map((g) => (g.id === game.id ? { ...g, label: value } : g)),
                              }),
                              { coalesceKey: `game-label:${game.id}` },
                            );
                          }}
                          className={inputBaseStyle}
                        />
                        <button
                          type="button"
                          onClick={() => requestRemoveGame(game)}
                          disabled={activePlan.games.length <= 1}
                          aria-label={`${t('playtimePlanner.overview.removeGame', 'Remove game')}: ${game.label}`}
                          title={t('playtimePlanner.overview.removeGame', 'Remove game')}
                          className={`${iconButtonDangerStyle} shrink-0`}
                        >
                          <HiOutlineTrash className="w-5 h-5" />
                        </button>
                      </div>
                      <p className={subtextStyle}>
                        {t('playtimePlanner.overview.placedCount', '{{placed}}/{{total}} placed', {
                          placed,
                          total: slotCount,
                        })}
                        {!game.included && (
                          <> · {t('playtimePlanner.overview.notCounted', 'Not counted')}</>
                        )}
                      </p>
                      {(linkedCounts[game.id] ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setBulkReapplyTarget(game)}
                          disabled={isBulkReapplying}
                          className={`${secondaryButtonStyle} w-full`}
                        >
                          {t('playtimePlanner.overview.updateLinked', 'Update {{count}} games created from this', {
                            count: linkedCounts[game.id],
                          })}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleAddGame}
                disabled={activePlan.games.length >= 20}
                className={`${secondaryButtonStyle} w-full mt-2`}
              >
                {t('playtimePlanner.overview.addGame', 'Add game')}
              </button>
            </div>

          </div>
        )}

        {view === 'games' && activePlan && editingGame && (
          <div
            role="tabpanel"
            id="planner-panel-games"
            aria-labelledby="planner-tab-games"
            className="space-y-4"
            onTouchStart={gamesLayout === 'single' ? handleLineupTouchStart : undefined}
            onTouchEnd={gamesLayout === 'single' ? handleLineupTouchEnd : undefined}
            data-testid="lineup-swipe-area"
          >
            {gamesLayout === 'single' ? (
              <>
            {/* Game ribbon (standalone-planner style): two-line tabs - short
                label on top, the GAME NAME under it - so the strip carries each
                game's identity, not anonymous pills. The active tab gets the
                standalone's amber accent; an amber dot after the short label
                marks an incomplete lineup. Each tab carries the include dot
                (top-right): tap it to count the game in/out of the totals -
                this is the ONLY place inclusion is toggled, so the strip
                renders even for a single-game plan. Excluded tabs dim. */}
            <div className="flex items-center gap-1.5">
            <nav
              ref={ribbonRef}
              aria-label={t('playtimePlanner.lineup.gameTabs', 'Switch game')}
              className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 flex-1 min-w-0"
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              {activePlan.games.map((g, i) => {
                const isCurrent = g.id === editingGame.id;
                const placedCount = ensureStartingSlots(g).filter((a) => a.playerId).length;
                const incomplete = placedCount < getGameSlots(g.formationId).length;
                const toggleTitle = g.included
                  ? t('playtimePlanner.lineup.includedToggle', 'Counted in totals - tap to exclude')
                  : t('playtimePlanner.lineup.excludedToggle', 'Excluded from totals - tap to include');
                return (
                  <div key={g.id} data-game-id={g.id} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGameId(g.id);
                        setSubSheetTarget(null);
                      }}
                      aria-current={isCurrent ? 'true' : undefined}
                      title={g.label}
                      className={[
                        'w-28 pl-3 pr-6 py-2 rounded-lg text-left border transition-colors',
                        isCurrent
                          ? 'bg-indigo-600 border-indigo-400/40'
                          : 'bg-slate-800 border-slate-600 hover:bg-slate-700',
                        g.included ? '' : 'opacity-50',
                      ].join(' ')}
                    >
                      <span
                        className={`block text-xs font-semibold tabular-nums ${
                          isCurrent ? 'text-indigo-200' : 'text-slate-400'
                        }`}
                      >
                        {t('playtimePlanner.balance.gameShort', 'G{{n}}', { n: i + 1 })}
                        {incomplete && (
                          /* Placed count instead of a second dot - two unlabeled
                             dots (incomplete vs included) were indistinguishable. */
                          <span className="ml-1.5 text-amber-400">
                            {placedCount}/{getGameSlots(g.formationId).length}
                          </span>
                        )}
                      </span>
                      <span
                        className={`block text-sm font-medium truncate ${
                          isCurrent ? 'text-white' : 'text-slate-300'
                        }`}
                      >
                        {g.label}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateActivePlan((plan) => ({
                          ...plan,
                          games: plan.games.map((gg) => (gg.id === g.id ? { ...gg, included: !gg.included } : gg)),
                        }))
                      }
                      aria-pressed={g.included}
                      aria-label={`${toggleTitle}: ${g.label}`}
                      title={toggleTitle}
                      className="absolute top-0 right-0 p-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 after:absolute after:-inset-1.5 after:content-['']"
                    >
                      <span
                        aria-hidden="true"
                        className={`block w-2.5 h-2.5 rounded-full border transition-colors ${
                          g.included ? 'bg-green-400 border-green-300' : 'bg-transparent border-slate-400'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </nav>
            </div>
            <div className="w-full max-w-sm mx-auto">
              <PlanFairnessStrip
                rows={fairness.rows}
                highlightPlayerIds={highlightPlayerIds}
                onToggleHighlight={toggleHighlight}
                collapsed={stripCollapsed}
                onToggleCollapsed={() => setStripCollapsed((c) => !c)}
              />
            </div>
            <PlanFieldView
              key={editingGame.id}
              game={editingGame}
              players={activePlan.players}
              onAssign={(slotId, playerId) => handleAssign(editingGame.id, slotId, playerId)}
              minutesByPlayer={fairness.byPlayer}
              highlightPlayerIds={highlightPlayerIds}
              onRequestSub={(slotId) => setSubSheetTarget({ gameId: editingGame.id, slotId })}
              onSwapPlayers={(a, b) => handleSwapPlayers(editingGame.id, a, b)}
              onClearSlot={(slotId) => handleClearSlot(editingGame.id, slotId)}
              onClearAll={() => handleClearAllPlacements(editingGame.id)}
              onClearAllGames={() => setShowClearAllGamesConfirm(true)}
              onRemoveSub={(subId) => handleRemoveSub(editingGame.id, subId)}
              onMoveSub={(subId, slotId) => handleMoveSub(editingGame.id, subId, slotId)}
              onPromoteSub={(subId, slotId, playerId) => handlePromoteSubToStarter(editingGame.id, subId, slotId, playerId)}
              onSetSubPlayer={(subId, playerId) => handleSetSubPlayer(editingGame.id, subId, playerId)}
              onToggleAbsent={(playerId) => handleToggleAbsent(editingGame.id, playerId)}
              absenceOpen={absenceOpen}
              onToggleAbsenceOpen={() => setAbsenceOpen((v) => !v)}
            />
            <div className="border-t border-slate-700/40 pt-4">
              <PlanSubsEditor
                game={editingGame}
                players={activePlan.players}
                onRemove={(subId) => handleRemoveSub(editingGame.id, subId)}
              />
            </div>
              </>
            ) : (
              <>
                <PlanFairnessStrip
                  rows={fairness.rows}
                  highlightPlayerIds={highlightPlayerIds}
                  onToggleHighlight={toggleHighlight}
                  collapsed={stripCollapsed}
                  onToggleCollapsed={() => setStripCollapsed((c) => !c)}
                />
                {/* All games side by side (stacked on phones): every card is the
                    SAME fully editable field as the single-game layout -
                    tap-assign, sub sheet, live minutes. */}
                <div className="grid gap-4 md:grid-cols-2">
                  {activePlan.games.map((g) => (
                    <div
                      key={g.id}
                      className={`${cardStyle} space-y-2 ${!g.included ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-100 min-w-0 truncate">{g.label}</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGameId(g.id);
                              setSubSheetTarget(null);
                              setGamesLayout('single');
                            }}
                            className="text-sm text-indigo-400 hover:text-indigo-300 py-2 px-2 -my-2"
                          >
                            {t('playtimePlanner.overview.editLineup', 'Edit lineup')}
                          </button>
                          {/* Same include toggle as the ribbon dot - the grid is
                              the comparison view, so counting a game in/out must
                              not require leaving it. */}
                          <button
                            type="button"
                            onClick={() =>
                              updateActivePlan((plan) => ({
                                ...plan,
                                games: plan.games.map((gg) => (gg.id === g.id ? { ...gg, included: !gg.included } : gg)),
                              }))
                            }
                            aria-pressed={g.included}
                            aria-label={`${
                              g.included
                                ? t('playtimePlanner.lineup.includedToggle', 'Counted in totals - tap to exclude')
                                : t('playtimePlanner.lineup.excludedToggle', 'Excluded from totals - tap to include')
                            }: ${g.label}`}
                            title={
                              g.included
                                ? t('playtimePlanner.lineup.includedToggle', 'Counted in totals - tap to exclude')
                                : t('playtimePlanner.lineup.excludedToggle', 'Excluded from totals - tap to include')
                            }
                            className="p-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                          >
                            <span
                              aria-hidden="true"
                              className={`block w-2.5 h-2.5 rounded-full border transition-colors ${
                                g.included ? 'bg-green-400 border-green-300' : 'bg-transparent border-slate-400'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                      <PlanFieldView
                        game={g}
                        players={activePlan.players}
                        onAssign={(slotId, playerId) => handleAssign(g.id, slotId, playerId)}
                        minutesByPlayer={fairness.byPlayer}
                        highlightPlayerIds={highlightPlayerIds}
                        onRequestSub={(slotId) => setSubSheetTarget({ gameId: g.id, slotId })}
                        onSwapPlayers={(a, b) => handleSwapPlayers(g.id, a, b)}
                        onClearSlot={(slotId) => handleClearSlot(g.id, slotId)}
                        onClearAll={() => handleClearAllPlacements(g.id)}
                        onClearAllGames={() => setShowClearAllGamesConfirm(true)}
                        onRemoveSub={(subId) => handleRemoveSub(g.id, subId)}
                        onMoveSub={(subId, slotId) => handleMoveSub(g.id, subId, slotId)}
                        onPromoteSub={(subId, slotId, playerId) => handlePromoteSubToStarter(g.id, subId, slotId, playerId)}
                        onSetSubPlayer={(subId, playerId) => handleSetSubPlayer(g.id, subId, playerId)}
                        onToggleAbsent={(playerId) => handleToggleAbsent(g.id, playerId)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {view === 'minutes' && activePlan && (
          <div role="tabpanel" id="planner-panel-minutes" aria-labelledby="planner-tab-minutes">
          <PlanBalanceView
            plan={activePlan}
            highlightPlayerIds={highlightPlayerIds}
            onToggleHighlight={toggleHighlight}
            onReplaceHighlights={replaceHighlights}
            onOpenGame={(gameId) => {
              setEditingGameId(gameId);
              setSubSheetTarget(null);
              setGamesLayout('single');
              setView('games');
            }}
          />
          </div>
        )}
      </ScrollableContent>

      {/* Polite live region: announces sub add/remove to assistive tech. The
          sheet closes on add, so this must outlive it. Visually hidden. */}
      <div role="status" aria-live="polite" className="sr-only">
        {/* key remounts the text node per announcement - the mutation is what
            makes assistive tech re-announce a repeated message. */}
        {subAnnouncement.text && (
          <span key={subAnnouncement.nonce} data-announcement-nonce={subAnnouncement.nonce}>
            {subAnnouncement.text}
          </span>
        )}
      </div>

      {subSheetTarget !== null &&
        activePlan &&
        (() => {
          const sheetGame = activePlan.games.find((g) => g.id === subSheetTarget.gameId);
          if (!sheetGame) return null;
          return (
            <PlanSubSheet
              game={sheetGame}
              slotId={subSheetTarget.slotId}
              players={activePlan.players}
              minutesByPlayer={fairness.byPlayer}
              onAdd={(sub) => handleAddSub(subSheetTarget.gameId, sub)}
              onRemove={(subId) => handleRemoveSub(subSheetTarget.gameId, subId)}
              onClose={() => setSubSheetTarget(null)}
            />
          );
        })()}

      <ModalFooter>
        {/* Left side of the footer holds the tab's utility actions (house
            pattern - navigation stays right): manager = Import JSON, undo/redo
            on the editing tabs, Export JSON on the plan tab. */}
        {view === 'manager' && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`${secondaryButtonStyle} mr-auto min-w-[9rem]`}
          >
            {t('playtimePlanner.versions.import', 'Import JSON')}
          </button>
        )}
        {view === 'plan' && activePlan && (
          <button type="button" onClick={handleExport} className={`${secondaryButtonStyle} mr-auto min-w-[9rem]`}>
            {t('playtimePlanner.versions.export', 'Export JSON')}
          </button>
        )}
        {activePlan && view === 'games' && (
          <div className="flex gap-1.5 mr-auto">
            <button
              type="button"
              onClick={() => applyHistory(-1)}
              disabled={!canUndo}
              aria-label={t('controlBar.undo', 'Undo')}
              title={t('controlBar.undo', 'Undo')}
              className="p-2 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <HiOutlineArrowUturnLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyHistory(1)}
              disabled={!canRedo}
              aria-label={t('controlBar.redo', 'Redo')}
              title={t('controlBar.redo', 'Redo')}
              className="p-2 rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <HiOutlineArrowUturnRight className="w-4 h-4" />
            </button>
            {/* Layout toggle lives with the other games-tab utilities - inline
                with the ribbon it read as a broken, misaligned extra tab. */}
            {activePlan.games.length > 1 && (
              <button
                type="button"
                onClick={() => setGamesLayout((l) => (l === 'single' ? 'grid' : 'single'))}
                aria-pressed={gamesLayout === 'grid'}
                aria-label={
                  gamesLayout === 'single'
                    ? t('playtimePlanner.lineup.viewGrid', 'Side by side')
                    : t('playtimePlanner.lineup.viewSingle', 'Single game')
                }
                title={
                  gamesLayout === 'single'
                    ? t('playtimePlanner.lineup.viewGrid', 'Side by side')
                    : t('playtimePlanner.lineup.viewSingle', 'Single game')
                }
                className={`p-2 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  gamesLayout === 'grid'
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                }`}
              >
                <HiOutlineSquares2X2 className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {isPlanTab(view) && (
          <button type="button" onClick={() => void handleBackToManager()} className={secondaryButtonStyle}>
            {t('playtimePlanner.lineup.back', 'Back')}
          </button>
        )}
        {view === 'setup' && planList.length > 0 && (
          <button type="button" onClick={() => setView('manager')} className={secondaryButtonStyle}>
            {t('playtimePlanner.lineup.back', 'Back')}
          </button>
        )}
        <button type="button" onClick={handleClose} className={primaryButtonStyle}>
          {t('common.close', 'Close')}
        </button>
      </ModalFooter>

      <ConfirmationModal
        isOpen={showSuggestConfirm}
        title={t('playtimePlanner.overview.suggestConfirmTitle', 'Suggest fair lineups?')}
        message={t(
          'playtimePlanner.overview.suggestConfirmMessage',
          'Builds lineups and half-time substitutions for every included game so playing time comes out as even as possible. The goalkeeper is never subbed mid-game.',
        )}
        warningMessage={t(
          'playtimePlanner.overview.suggestConfirmWarning',
          'Current lineups and substitutions of included games will be replaced. Undo (on the Games tab) restores them.',
        )}
        onConfirm={() => {
          setShowSuggestConfirm(false);
          if (!activePlan?.games.some((g) => g.included)) {
            showToast(t('playtimePlanner.balance.noGames', 'No games counted yet. Mark games as included.'), 'info');
            return;
          }
          updateActivePlan((plan) => suggestFairShareLineup(plan));
          showToast(t('playtimePlanner.overview.suggestDone', 'Fair lineups suggested - check the balance view.'), 'success');
        }}
        onCancel={() => setShowSuggestConfirm(false)}
        confirmLabel={t('playtimePlanner.overview.suggestConfirmLabel', 'Suggest')}
        variant="primary"
      />
      <ConfirmationModal
        isOpen={showClearAllGamesConfirm}
        title={t('playtimePlanner.lineup.clearAllGamesConfirmTitle', 'Clear all games?')}
        message={t(
          'playtimePlanner.lineup.clearAllGamesConfirmMessage',
          "Empties every game's lineup and substitution schedule in this plan.",
        )}
        warningMessage={t(
          'playtimePlanner.lineup.clearAllGamesConfirmWarning',
          'Undo (on the Games tab) restores them.',
        )}
        onConfirm={() => {
          setShowClearAllGamesConfirm(false);
          handleClearAllGames();
        }}
        onCancel={() => setShowClearAllGamesConfirm(false)}
        confirmLabel={t('playtimePlanner.lineup.clearAllGamesConfirmLabel', 'Clear')}
        variant="danger"
      />
      <ConfirmationModal
        isOpen={removeTarget !== null}
        title={t('playtimePlanner.players.removeConfirmTitle', 'Remove player?')}
        message={
          removeTarget && activePlan
            ? (() => {
                const impact = playerPlanImpact(activePlan, removeTarget.id);
                return t(
                  'playtimePlanner.players.removeConfirmMessage',
                  '{{name}} - starting spots: {{starting}}, planned subs: {{subs}}. The spots become empty and the subs are deleted.',
                  { name: removeTarget.name, starting: impact.startingCount, subs: impact.subCount },
                );
              })()
            : ''
        }
        onConfirm={() => {
          if (removeTarget) handleRemovePlanPlayer(removeTarget.id);
        }}
        onCancel={() => setRemoveQueue((q) => q.slice(1))}
        confirmLabel={t('playtimePlanner.players.removeAction', 'Remove')}
        variant="danger"
      />
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        title={deleteTarget?.name ?? t('playtimePlanner.overview.confirmDeleteTitle', 'Delete plan?')}
        message={t('playtimePlanner.overview.confirmDelete', 'Delete this plan? This cannot be undone.')}
        onConfirm={() => void handleDeleteConfirmed()}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
        isConfirming={isDeleting}
      />
      <ConfirmationModal
        isOpen={trimConfirm !== null}
        title={t('playtimePlanner.overview.trimConfirmTitle', 'Remove {{name}}?', { name: trimConfirm?.label ?? '' })}
        message={t(
          'playtimePlanner.overview.trimConfirmMessage',
          'Its lineup and substitutions are deleted. Undo (on the Games tab) restores them.',
        )}
        onConfirm={() => {
          if (trimConfirm) performRemoveGame(trimConfirm.id);
        }}
        onCancel={() => setTrimConfirm(null)}
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
      />
      <ConfirmationModal
        isOpen={bulkReapplyTarget !== null}
        title={t('playtimePlanner.overview.confirmReapplyTitle', 'Update linked games?')}
        message={
          bulkReapplyTarget
            ? t(
                'playtimePlanner.overview.confirmReapply',
                'Update {{count}} unplayed games created from "{{label}}" with the current plan?',
                { count: linkedCounts[bulkReapplyTarget.id] ?? 0, label: bulkReapplyTarget.label },
              )
            : ''
        }
        warningMessage={t(
          'playtimePlanner.overview.confirmReapplyWarning',
          'Their lineups, player selections and planned substitutions will be overwritten.',
        )}
        onConfirm={async () => {
          const game = bulkReapplyTarget;
          setBulkReapplyTarget(null);
          if (!game) return;
          setIsBulkReapplying(true);
          try {
            await handleReapplyLinkedGames(game);
          } finally {
            setIsBulkReapplying(false);
          }
        }}
        onCancel={() => setBulkReapplyTarget(null)}
        confirmLabel={t('playtimePlanner.overview.confirmReapplyLabel', 'Update')}
        variant="primary"
        isConfirming={isBulkReapplying}
      />
    </ModalContainer>
  );
};

export default PlaytimePlannerModal;
