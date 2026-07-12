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
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { getTeams, getTeamRoster } from '@/utils/teams';
import { getSeasons } from '@/utils/seasons';
import { getTournaments } from '@/utils/tournaments';
import type { Team, Season, Tournament } from '@/types';
import { PRESETS_BY_SIZE, FIELD_SIZES, getPresetById } from '@/config/formationPresets';
import logger from '@/utils/logger';
import {
  ModalContainer,
  ModalHeader,
  ModalFooter,
  ScrollableContent,
  labelStyle,
  subtextStyle,
  inputBaseStyle,
  selectStyle,
  cardStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  dangerButtonStyle,
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
} from '@/utils/playtimePlanner/lineup';
import { addSub, removeSub, removeSubsBringingOn } from '@/utils/playtimePlanner/subs';
import { suggestFairShareLineup } from '@/utils/playtimePlanner/suggest';
import {
  addPlayerToPlan,
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

type View = 'loading' | 'manager' | 'setup' | 'overview' | 'lineup' | 'balance' | 'players' | 'grid';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // replacingId: plan player whose replacement is being chosen (Phase 4);
  // removeTarget: plan player pending the destructive remove confirm.
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PlanPlayer | null>(null);
  // "Suggest fair lineup" pending confirm (it overwrites included games).
  const [showSuggestConfirm, setShowSuggestConfirm] = useState(false);
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
    lastEditCoalescedRef.current = false;
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
      } catch (error) {
        logger.error('[PlaytimePlannerModal] Failed to load:', error);
        if (!cancelled) {
          setRoster([]);
          resetSetupFormRef.current([]);
          setView('setup');
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



  const togglePlayer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
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
      setView('overview');
      void refreshPlanList();
    } else {
      showToast(
        t('playtimePlanner.saveError', 'Could not save the plan. Your latest changes may not persist.'),
        'error',
      );
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
  // the effect below records it exactly once. coalesce=true (text inputs) makes
  // consecutive edits REPLACE the top history entry instead of pushing one per
  // keystroke, so typing a name costs one undo slot, not twenty.
  const pendingEditRef = useRef<null | { coalesce: boolean }>(null);
  const lastEditCoalescedRef = useRef(false);
  const updateActivePlan = useCallback(
    (mutate: (plan: PlaytimePlan) => PlaytimePlan, opts?: { coalesce?: boolean }) => {
      pendingEditRef.current = { coalesce: opts?.coalesce ?? false };
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
      const replaceTop = pending.coalesce && lastEditCoalescedRef.current && h.index === h.stack.length - 1 && h.index > 0;
      h.stack = h.stack.slice(0, h.index + 1);
      if (replaceTop) {
        h.stack[h.stack.length - 1] = activePlan;
      } else {
        h.stack.push(activePlan);
        if (h.stack.length > 50) h.stack.shift();
      }
      h.index = h.stack.length - 1;
    }
    lastEditCoalescedRef.current = pending.coalesce;
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
      lastEditCoalescedRef.current = false;
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
    if (!start || !activePlan || !editingGameId) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Date.now() - start.at > 700 || Math.abs(dx) < 60 || Math.abs(dx) < 1.4 * Math.abs(dy)) return;
    const idx = activePlan.games.findIndex((g) => g.id === editingGameId);
    const nextGame = activePlan.games[dx < 0 ? idx + 1 : idx - 1];
    if (nextGame) {
      setEditingGameId(nextGame.id);
      setSubSheetTarget(null);
    }
  };

  // Assign (or clear) a player in a game's starting lineup. Normalizes the
  // game's slots to its formation first, so stored data always matches the shape.
  // Placing a player also drops any scheduled sub bringing them on - otherwise
  // they'd be starting AND "coming on", double-counting their minutes.
  const handleAssign = useCallback(
    (gameId: string, slotId: string, playerId: string | null) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) =>
          g.id === gameId
            ? {
                ...g,
                startingSlots: assignPlayerToSlot(ensureStartingSlots(g), slotId, playerId),
                subs: removeSubsBringingOn(g.subs, playerId),
              }
            : g,
        ),
      }));
    },
    [updateActivePlan],
  );

  // Add / remove a scheduled substitution in a game.
  const handleAddSub = useCallback(
    (gameId: string, sub: PlanSub) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => (g.id === gameId ? { ...g, subs: addSub(g.subs, sub) } : g)),
      }));
    },
    [updateActivePlan],
  );

  const handleRemoveSub = useCallback(
    (gameId: string, subId: string) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) => (g.id === gameId ? { ...g, subs: removeSub(g.subs, subId) } : g)),
      }));
    },
    [updateActivePlan],
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
      await flushSave(); // persist the outgoing plan before reading the target
      const p = await getPlan(id);
      if (p) {
        setActivePlan(p);
        seedHistory(p);
        setEditingGameId(null);
        setReplacingId(null);
        setHighlightPlayerIds([]);
        setView('overview');
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

  const handleDuplicate = useCallback(async () => {
    if (!activePlan) return;
    await flushSave();
    const suffix = ` ${t('playtimePlanner.versions.copySuffix', '(copy)')}`;
    const saved = await savePlan(duplicatePlan(activePlan, suffix));
    if (!saved) {
      showToast(t('playtimePlanner.saveError', 'Could not save the plan. Your latest changes may not persist.'), 'error');
      return;
    }
    setActivePlan(saved);
    seedHistory(saved);
    setEditingGameId(null);
    setReplacingId(null);
    setHighlightPlayerIds([]);
    setView('overview');
    await refreshPlanList();
  }, [activePlan, flushSave, refreshPlanList, seedHistory, showToast, t]);

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
        setActivePlan(imported);
        seedHistory(imported);
        setEditingGameId(null);
        setReplacingId(null);
        setHighlightPlayerIds([]);
        setView('overview');
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

  const handleAddPlanPlayer = useCallback(
    (player: { id: string; name: string }) => {
      updateActivePlan((plan) => addPlayerToPlan(plan, player));
    },
    [updateActivePlan],
  );
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
      setRemoveTarget(null);
      // A dangling highlight would ghost-dim the whole lineup with no cell left
      // to un-toggle it.
      setHighlightPlayerIds((prev) => prev.filter((id) => id !== playerId));
    },
    [updateActivePlan],
  );

  // Plan deletion is confirmed via the app's ConfirmationModal (danger variant),
  // matching every other destructive action in the app. isDeleting gates re-entry:
  // a double-tap used to race two deletes, and the second (finding the plan gone)
  // showed a spurious "could not delete" toast after a successful delete.
  const performDelete = async () => {
    if (!activePlan || isDeleting) return;
    // Cancel any pending autosave for the plan we're about to remove, but KEEP the
    // dirty state until the delete succeeds - if it fails, the plan still exists
    // and silently discarding the user's last ~600ms of edits would desync the
    // on-screen plan from storage.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const deleted = await deletePlan(activePlan.id);
    if (!deleted) {
      showToast(t('playtimePlanner.deleteError', 'Could not delete the plan.'), 'error');
      // The plan survives - persist its pending edits now instead of dropping them.
      const pending = dirtyPlanRef.current;
      dirtyPlanRef.current = null;
      if (pending) void persist(pending);
      return;
    }
    dirtyPlanRef.current = null;
    // Purge links pointing at the deleted plan so linked games don't keep offering
    // a "Re-apply plan" that can only fail. Best-effort (links are also validated
    // against the plan on read).
    await deletePlanLinksForPlan(activePlan.id).catch(() => {});
    const plans = await getPlans();
    const list = Object.values(plans).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setPlanList(list);
    setActivePlan(null);
    seedHistory(null);
    if (list.length > 0) {
      setView('manager');
    } else {
      resetSetupForm(roster);
      setView('setup');
    }
  };
  const handleDeleteConfirmed = async () => {
    setIsDeleting(true);
    try {
      await performDelete();
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Leave the open plan back to the manager: persist pending edits first so the
  // list shows fresh names/metadata.
  const handleBackToManager = useCallback(async () => {
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
        setView('overview');
        return;
      }
      void handleSwitchPlan(id);
    },
    [activePlan?.id, handleSwitchPlan],
  );

  // Escape steps BACK from a sub-view (lineup/balance -> overview) and only
  // closes the planner from the top-level views - matching how deep the user is,
  // instead of throwing away their navigation context.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A ConfirmationModal is open: Escape belongs to it (cancel). This listener
      // registered earlier, so it would fire FIRST and also navigate - skip.
      if (showDeleteConfirm || removeTarget !== null || bulkReapplyTarget !== null || showSuggestConfirm) return;
      // The sub sheet is open: Escape closes it, nothing else.
      if (subSheetTarget !== null) {
        setSubSheetTarget(null);
        return;
      }
      if (view === 'lineup' || view === 'balance' || view === 'players' || view === 'grid') {
        setEditingGameId(null);
        setReplacingId(null);
        setView('overview');
      } else if (view === 'overview') {
        void handleBackToManager();
      } else {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, view, onClose, showDeleteConfirm, removeTarget, bulkReapplyTarget, showSuggestConfirm, subSheetTarget, handleBackToManager]);

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

  const editingGame = activePlan?.games.find((g) => g.id === editingGameId) ?? null;

  if (!isOpen) return null;

  return (
    <ModalContainer>
      <ModalHeader title={t('playtimePlanner.title', 'Lineup planner')} />

      <ScrollableContent className="px-6 py-5">
        {view === 'loading' && (
          <p className={subtextStyle}>{t('common.loading', 'Loading...')}</p>
        )}

        {view === 'setup' && (
          <div className="max-w-lg mx-auto space-y-5">
            {roster.length === 0 ? (
              <div className={cardStyle}>
                <p className="text-slate-300">
                  {t('playtimePlanner.setup.rosterEmpty', 'Add players to your roster first.')}
                </p>
              </div>
            ) : (
              <>
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
                          {tm.name}
                        </option>
                      ))}
                    </select>
                    <p className={subtextStyle}>
                      {t(
                        'playtimePlanner.setup.teamHint',
                        'Picks the team roster and its competition durations - like new game setup.',
                      )}
                    </p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={labelStyle}>{t('playtimePlanner.setup.rosterLabel', 'Players')}</label>
                    <div className="flex gap-3 text-xs">
                      <button
                        type="button"
                        className="text-indigo-400 hover:text-indigo-300"
                        onClick={() => setSelectedIds(new Set(roster.map((p) => p.id)))}
                      >
                        {t('playtimePlanner.setup.selectAll', 'All')}
                      </button>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-300"
                        onClick={() => setSelectedIds(new Set())}
                      >
                        {t('playtimePlanner.setup.selectNone', 'None')}
                      </button>
                    </div>
                  </div>
                  <div className={`${cardStyle} max-h-52 overflow-y-auto grid grid-cols-2 gap-1`}>
                    {roster.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800/60 cursor-pointer text-sm text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => togglePlayer(p.id)}
                          className="accent-indigo-500"
                        />
                        <span className="truncate">{p.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className={`${subtextStyle} mt-1`}>
                    {t('playtimePlanner.setup.playersSelected', '{{count}} selected', { count: selectedIds.size })}
                  </p>
                </div>

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

                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={selectedIds.size === 0}
                  className={`${primaryButtonStyle} w-full`}
                >
                  {t('playtimePlanner.setup.create', 'Create plan')}
                </button>
              </>
            )}
          </div>
        )}

        {activePlan && (view === 'overview' || view === 'lineup' || view === 'balance' || view === 'players' || view === 'grid') && (
          <div className="max-w-lg mx-auto flex justify-end gap-1.5 mb-2">
            <button
              type="button"
              onClick={() => applyHistory(-1)}
              disabled={!canUndo}
              aria-label={t('controlBar.undo', 'Undo')}
              title={t('controlBar.undo', 'Undo')}
              className="px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm disabled:opacity-40 disabled:cursor-default hover:bg-slate-700"
            >
              ↶
            </button>
            <button
              type="button"
              onClick={() => applyHistory(1)}
              disabled={!canRedo}
              aria-label={t('controlBar.redo', 'Redo')}
              title={t('controlBar.redo', 'Redo')}
              className="px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm disabled:opacity-40 disabled:cursor-default hover:bg-slate-700"
            >
              ↷
            </button>
          </div>
        )}

        {view === 'manager' && (
          <div className="max-w-lg mx-auto space-y-4">
            <h3 className={labelStyle}>{t('playtimePlanner.manager.title', 'Plans')}</h3>
            <div className="space-y-2">
              {planList.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleOpenPlan(p.id)}
                  className="w-full flex items-center justify-between gap-3 bg-slate-800/40 border border-slate-700/50 rounded-md px-4 py-3 text-left hover:bg-slate-700/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-100 truncate">{p.name}</span>
                    <span className={subtextStyle}>
                      {t('playtimePlanner.manager.meta', '{{games}} games · {{players}} players', {
                        games: p.games.length,
                        players: p.players.length,
                      })}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-slate-500 text-lg shrink-0">
                    ›
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={startNewPlan} className={`${primaryButtonStyle} w-full`}>
              {t('playtimePlanner.manager.new', 'New plan')}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`${secondaryButtonStyle} w-full`}
            >
              {t('playtimePlanner.versions.import', 'Import JSON')}
            </button>
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

        {view === 'overview' && activePlan && (
          <div className="max-w-lg mx-auto space-y-5">
            <div>
              <label className={labelStyle}>{t('playtimePlanner.setup.nameLabel', 'Plan name')}</label>
              <input
                type="text"
                value={activePlan.name}
                onChange={(e) => {
                  const value = e.target.value;
                  updateActivePlan((plan) => ({ ...plan, name: value }), { coalesce: true });
                }}
                className={inputBaseStyle}
              />
            </div>

            {/* Plan toolbar - duplicate/export/delete for THIS plan (import lives
                in the manager, where new plans arrive). */}
            <div className="flex gap-2">
              <button type="button" onClick={handleDuplicate} className={`${secondaryButtonStyle} flex-1 whitespace-nowrap`}>
                {t('playtimePlanner.versions.duplicate', 'Duplicate')}
              </button>
              <button type="button" onClick={handleExport} className={`${secondaryButtonStyle} flex-1 whitespace-nowrap`}>
                {t('playtimePlanner.versions.export', 'Export JSON')}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                className={`${dangerButtonStyle} flex-1 whitespace-nowrap`}
              >
                {t('playtimePlanner.overview.deletePlan', 'Delete')}
              </button>
            </div>

            <div className={cardStyle}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-slate-200">
                  {t('playtimePlanner.overview.rosterSummary', '{{count}} players', { count: activePlan.players.length })}
                </p>
                <button
                  type="button"
                  onClick={() => setView('players')}
                  className="text-xs font-medium text-indigo-400 hover:text-indigo-300 py-2.5 px-2 -my-2.5 shrink-0"
                >
                  {t('playtimePlanner.overview.editPlayers', 'Edit players')}
                </button>
              </div>
              <p className={subtextStyle}>
                {t('playtimePlanner.overview.formatSummary', '{{games}} games · {{periods}}×{{minutes}} min', {
                  games: activePlan.games.length,
                  periods: activePlan.games[0]?.numberOfPeriods ?? 0,
                  minutes: activePlan.games[0]?.periodMinutes ?? 0,
                })}
                {' · '}
                {getPresetById(activePlan.games[0]?.formationId ?? '')?.name ?? '-'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setView('balance')}
              className={`${primaryButtonStyle} w-full`}
            >
              {t('playtimePlanner.balance.view', 'View playing-time balance')}
            </button>

            <button
              type="button"
              onClick={() => setShowSuggestConfirm(true)}
              className={`${secondaryButtonStyle} w-full`}
            >
              {t('playtimePlanner.overview.suggestButton', 'Suggest fair lineups')}
            </button>

            <button
              type="button"
              onClick={() => setView('grid')}
              className={`${secondaryButtonStyle} w-full`}
            >
              {t('playtimePlanner.overview.gridButton', 'All games side by side')}
            </button>

            <div>
              <h3 className={`${labelStyle} mb-2`}>{t('playtimePlanner.overview.gamesHeading', 'Games')}</h3>
              <div className="space-y-2">
                {activePlan.games.map((game, i) => {
                  const slotCount = getGameSlots(game.formationId).length;
                  const placed = ensureStartingSlots(game).filter((s) => s.playerId).length;
                  return (
                    <div
                      key={game.id}
                      className="bg-slate-800/40 border border-slate-700/50 rounded-md overflow-hidden"
                    >
                      {/* The whole card head IS the way in: label + fill state +
                          chevron, one obvious tap target (the old tiny "Edit
                          lineup" text link was easy to miss). Renaming happens
                          inside the game view. */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGameId(game.id);
                          setSubSheetTarget(null);
                          setView('lineup');
                        }}
                        className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-slate-700/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-100 truncate">
                            {game.label}
                          </span>
                          <span className={subtextStyle}>
                            {t('playtimePlanner.overview.placedCount', '{{placed}}/{{total}} placed', {
                              placed,
                              total: slotCount,
                            })}
                          </span>
                        </span>
                        <span aria-hidden="true" className="text-slate-500 text-lg shrink-0">
                          ›
                        </span>
                      </button>
                      <div className="flex items-center justify-between px-3 pb-2">
                        <label className="flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap py-1">
                          <input
                            type="checkbox"
                            checked={game.included}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              updateActivePlan((plan) => ({
                                ...plan,
                                games: plan.games.map((g, gi) => (gi === i ? { ...g, included: checked } : g)),
                              }));
                            }}
                            className="accent-indigo-500"
                          />
                          {t('playtimePlanner.overview.included', 'Included')}
                        </label>
                      </div>
                      {(linkedCounts[game.id] ?? 0) > 0 && (
                        <div className="px-3 pb-3">
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
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {view === 'lineup' && activePlan && editingGame && (
          <div
            className="max-w-lg mx-auto space-y-3"
            onTouchStart={handleLineupTouchStart}
            onTouchEnd={handleLineupTouchEnd}
            data-testid="lineup-swipe-area"
          >
            {/* Game tabs: the planner's core loop is flipping between the set's
                games while nudging minutes toward fair - so any game is ONE tap
                away (no round trip through the overview). Short labels match the
                balance strip (P1/G1…); an amber dot marks an incomplete lineup so
                the coach sees where work remains while flipping. */}
            {activePlan.games.length > 1 && (
              <nav
                aria-label={t('playtimePlanner.lineup.gameTabs', 'Switch game')}
                className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                {activePlan.games.map((g, i) => {
                  const isCurrent = g.id === editingGame.id;
                  const placedCount = ensureStartingSlots(g).filter((a) => a.playerId).length;
                  const incomplete = placedCount < getGameSlots(g.formationId).length;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setEditingGameId(g.id);
                        setSubSheetTarget(null);
                      }}
                      aria-current={isCurrent ? 'true' : undefined}
                      title={g.label}
                      className={[
                        'relative shrink-0 px-3.5 py-2 rounded-md text-sm font-medium tabular-nums transition-colors',
                        isCurrent
                          ? 'bg-indigo-600 text-white'
                          : g.included
                            ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                            : 'bg-slate-800/50 text-slate-500 border border-slate-700/50',
                      ].join(' ')}
                    >
                      {t('playtimePlanner.balance.gameShort', 'G{{n}}', { n: i + 1 })}
                      {incomplete && (
                        <span
                          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </nav>
            )}
            <PlanFairnessStrip
              rows={fairness.rows}
              highlightPlayerIds={highlightPlayerIds}
              onToggleHighlight={toggleHighlight}
            />
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={editingGame.label}
                aria-label={t('playtimePlanner.lineup.gameName', 'Game name')}
                onChange={(e) => {
                  const value = e.target.value;
                  updateActivePlan(
                    (plan) => ({
                      ...plan,
                      games: plan.games.map((g) => (g.id === editingGame.id ? { ...g, label: value } : g)),
                    }),
                    { coalesce: true },
                  );
                }}
                className="flex-1 min-w-0 bg-transparent text-base font-semibold text-slate-100 border-b border-transparent focus:border-slate-500 focus:outline-none"
              />
              <span className={`${subtextStyle} shrink-0`}>
                {getPresetById(editingGame.formationId)?.name ?? '-'}
              </span>
            </div>
            <PlanFieldView
              game={editingGame}
              players={activePlan.players}
              onAssign={(slotId, playerId) => handleAssign(editingGame.id, slotId, playerId)}
              minutesByPlayer={fairness.byPlayer}
              highlightPlayerIds={highlightPlayerIds}
              onRequestSub={(slotId) => setSubSheetTarget({ gameId: editingGame.id, slotId })}
            />
            <div className="border-t border-slate-700/40 pt-4">
              <PlanSubsEditor
                game={editingGame}
                players={activePlan.players}
                onRemove={(subId) => handleRemoveSub(editingGame.id, subId)}
              />
            </div>
          </div>
        )}

        {view === 'balance' && activePlan && (
          <PlanBalanceView
            plan={activePlan}
            highlightPlayerIds={highlightPlayerIds}
            onToggleHighlight={toggleHighlight}
            onReplaceHighlights={replaceHighlights}
            onOpenGame={(gameId) => {
              setEditingGameId(gameId);
              setSubSheetTarget(null);
              setView('lineup');
            }}
          />
        )}

        {view === 'players' && activePlan && (
          <div className="max-w-lg mx-auto space-y-5">
            <div>
              <h3 className={labelStyle}>{t('playtimePlanner.players.title', 'Plan players')}</h3>
              <p className={subtextStyle}>
                {t(
                  'playtimePlanner.players.hint',
                  'Changes affect this plan only. Created games update when you re-apply the plan; played games are never changed.',
                )}
              </p>
            </div>

            <ul className="space-y-2">
              {activePlan.players.map((p) => (
                <li
                  key={p.id}
                  className="bg-slate-800/40 border border-slate-700/50 rounded-md px-3 py-2 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-100 font-medium">{p.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setReplacingId(replacingId === p.id ? null : p.id)}
                        disabled={rosterCandidates.length === 0}
                        className="text-xs font-medium text-indigo-400 hover:text-indigo-300 disabled:text-slate-600 py-2 px-2"
                      >
                        {t('playtimePlanner.players.replaceAction', 'Replace')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(p)}
                        className="text-xs text-red-400 hover:text-red-300 py-2 px-2"
                      >
                        {t('playtimePlanner.players.removeAction', 'Remove')}
                      </button>
                    </div>
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
                            className="px-3 py-1.5 rounded-md bg-slate-700 text-slate-100 text-sm hover:bg-indigo-600"
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

            <div>
              <h4 className={`${labelStyle} mb-1.5`}>{t('playtimePlanner.players.addHeading', 'Add players')}</h4>
              {rosterCandidates.length === 0 ? (
                <p className={subtextStyle}>
                  {t('playtimePlanner.players.noCandidates', 'Everyone from your roster is already in this plan.')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {rosterCandidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleAddPlanPlayer(c)}
                      className="px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm hover:bg-slate-700"
                    >
                      + {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {view === 'grid' && activePlan && (
          <div className="space-y-3">
            <div className="max-w-lg mx-auto md:max-w-none">
              <PlanFairnessStrip
                rows={fairness.rows}
                highlightPlayerIds={highlightPlayerIds}
                onToggleHighlight={toggleHighlight}
              />
            </div>
            {/* All games side by side (stacked on phones): every card is the SAME
                fully editable field as the single-game view - tap-assign, sub
                sheet, live minutes - with the totals strip above them all. */}
            <div className="grid gap-4 md:grid-cols-2">
              {activePlan.games.map((g) => (
                <div
                  key={g.id}
                  className={`rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 space-y-2 ${
                    !g.included ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{g.label}</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGameId(g.id);
                        setSubSheetTarget(null);
                        setView('lineup');
                      }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 py-2 px-2 -my-2"
                    >
                      {t('playtimePlanner.overview.editLineup', 'Edit lineup')}
                    </button>
                  </div>
                  <PlanFieldView
                    game={g}
                    players={activePlan.players}
                    onAssign={(slotId, playerId) => handleAssign(g.id, slotId, playerId)}
                    minutesByPlayer={fairness.byPlayer}
                    highlightPlayerIds={highlightPlayerIds}
                    onRequestSub={(slotId) => setSubSheetTarget({ gameId: g.id, slotId })}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollableContent>

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
              onClose={() => setSubSheetTarget(null)}
            />
          );
        })()}

      <ModalFooter>
        {(view === 'lineup' || view === 'balance' || view === 'players' || view === 'grid') && (
          <button
            type="button"
            onClick={() => {
              setEditingGameId(null);
              setReplacingId(null);
              setSubSheetTarget(null);
              setView('overview');
            }}
            className={`${secondaryButtonStyle} flex-1`}
          >
            {t('playtimePlanner.lineup.back', 'Back')}
          </button>
        )}
        {view === 'overview' && (
          <button type="button" onClick={() => void handleBackToManager()} className={`${secondaryButtonStyle} flex-1`}>
            {t('playtimePlanner.lineup.back', 'Back')}
          </button>
        )}
        {view === 'setup' && planList.length > 0 && (
          <button type="button" onClick={() => setView('manager')} className={`${secondaryButtonStyle} flex-1`}>
            {t('playtimePlanner.lineup.back', 'Back')}
          </button>
        )}
        <button type="button" onClick={onClose} className={`${secondaryButtonStyle} flex-1`}>
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
          'Current lineups and substitutions of included games will be replaced. Undo restores them.',
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
        onCancel={() => setRemoveTarget(null)}
        confirmLabel={t('playtimePlanner.players.removeAction', 'Remove')}
        variant="danger"
      />
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title={t('playtimePlanner.overview.confirmDeleteTitle', 'Delete plan?')}
        message={t('playtimePlanner.overview.confirmDelete', 'Delete this plan? This cannot be undone.')}
        onConfirm={() => void handleDeleteConfirmed()}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
        isConfirming={isDeleting}
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
