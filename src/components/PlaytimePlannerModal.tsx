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
import { addSub, removeSub } from '@/utils/playtimePlanner/subs';
import {
  reapplyPlanToLinkedGames,
  countReapplicableGames,
} from '@/utils/playtimePlanner/reapply';
import { setGameSubs } from '@/utils/playtimePlanner/gameSubs';
import { getSavedGames, saveGame as utilSaveGame } from '@/utils/savedGames';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import PlanFieldView from '@/components/PlanFieldView';
import PlanSubsEditor from '@/components/PlanSubsEditor';
import PlanBalanceView from '@/components/PlanBalanceView';
import type { PlaytimePlan, PlanSub, PlanGame } from '@/utils/playtimePlanner/types';
import type { Player } from '@/types';

interface PlaytimePlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_FORMATION = '8v8-2-1-2-1-1';

type View = 'loading' | 'setup' | 'overview' | 'lineup' | 'balance';

const PlaytimePlannerModal: React.FC<PlaytimePlannerModalProps> = ({ isOpen, onClose }) => {
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
          setActivePlan(list[0]);
          setView('overview');
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
  }, [isOpen, user?.id]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

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

  const updateActivePlan = useCallback(
    (mutate: (plan: PlaytimePlan) => PlaytimePlan) => {
      setActivePlan((prev) => {
        if (!prev) return prev;
        const next = mutate(prev);
        dirtyPlanRef.current = next;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          const pending = dirtyPlanRef.current;
          dirtyPlanRef.current = null;
          if (pending) void persist(pending);
        }, 600);
        return next;
      });
    },
    [persist],
  );

  // Assign (or clear) a player in a game's starting lineup. Normalizes the
  // game's slots to its formation first, so stored data always matches the shape.
  const handleAssign = useCallback(
    (gameId: string, slotId: string, playerId: string | null) => {
      updateActivePlan((plan) => ({
        ...plan,
        games: plan.games.map((g) =>
          g.id === gameId
            ? { ...g, startingSlots: assignPlayerToSlot(ensureStartingSlots(g), slotId, playerId) }
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
        setEditingGameId(null);
        setView('overview');
      } else {
        // Target is gone (e.g. deleted in another tab). Tell the user instead of
        // letting the controlled <select> silently snap back with no explanation.
        showToast(t('playtimePlanner.versions.switchError', 'Could not open that plan.'), 'error');
        await refreshPlanList();
      }
    },
    [activePlan?.id, flushSave, refreshPlanList, showToast, t],
  );

  // Phase 3.4: tally unplayed real games created from each planned game so the
  // overview can offer a one-tap "update N games" action.
  const refreshLinkedCounts = useCallback(
    async (planId: string) => {
      try {
        const games = await getSavedGames(user?.id);
        setLinkedCounts(countReapplicableGames(games, planId));
      } catch (err) {
        logger.error('[planner] Failed to count linked games (non-fatal)', err);
        setLinkedCounts({});
      }
    },
    [user],
  );

  // Only re-count when the active plan identity changes, not on every plan edit.
  useEffect(() => {
    const planId = activePlan?.id;
    let cancelled = false;
    void (async () => {
      if (!planId) {
        if (!cancelled) setLinkedCounts({});
        return;
      }
      await refreshLinkedCounts(planId);
    })();
    return () => {
      cancelled = true;
    };
  }, [activePlan?.id, refreshLinkedCounts]);

  // Re-apply the current plan to every unplayed game created from one planned game.
  const handleReapplyLinkedGames = useCallback(
    async (game: PlanGame) => {
      if (!activePlan) return;
      const count = linkedCounts[game.id] ?? 0;
      if (count === 0) return;
      const confirmed = window.confirm(
        t(
          'playtimePlanner.overview.confirmReapply',
          'Update {{count}} unplayed game(s) created from "{{label}}" with the current plan? Their lineups and planned substitutions will be overwritten.',
          { count, label: game.label },
        ),
      );
      if (!confirmed) return;
      // Persist any in-flight plan edits first so the re-apply uses the latest lineup.
      await flushSave();
      try {
        const summary = await reapplyPlanToLinkedGames(
          {
            getAllGames: () => getSavedGames(user?.id),
            saveGame: (id, g) => utilSaveGame(id, g, user?.id),
            setGameSubs,
          },
          activePlan,
          game.id,
        );
        // The saved-games React Query cache is now stale - refetch so a later load
        // shows the updated lineup.
        queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, user?.id] });
        await refreshLinkedCounts(activePlan.id);
        showToast(
          summary.missingTotal > 0
            ? t(
                'playtimePlanner.overview.reapplyDoneMissing',
                'Updated {{updated}} game(s). {{missing}} planned player slot(s) were skipped (not in a game roster).',
                { updated: summary.updated, missing: summary.missingTotal },
              )
            : t('playtimePlanner.overview.reapplyDone', 'Updated {{updated}} game(s) from the plan.', {
                updated: summary.updated,
              }),
          'success',
        );
      } catch (err) {
        logger.error('[planner] Bulk re-apply failed', err);
        showToast(t('playtimePlanner.overview.reapplyError', 'Could not update the linked games.'), 'error');
      }
    },
    [activePlan, linkedCounts, user, flushSave, queryClient, refreshLinkedCounts, showToast, t],
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
    setEditingGameId(null);
    setView('overview');
    await refreshPlanList();
  }, [activePlan, flushSave, refreshPlanList, showToast, t]);

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
        setEditingGameId(null);
        setView('overview');
        await refreshPlanList();
      } catch (error) {
        logger.error('[PlaytimePlannerModal] Import failed:', error);
        showToast(t('playtimePlanner.versions.importError', 'Could not read that file as a plan.'), 'error');
      }
    },
    [refreshPlanList, showToast, t],
  );

  const handleDelete = async () => {
    if (!activePlan) return;
    if (!window.confirm(t('playtimePlanner.overview.confirmDelete', 'Delete this plan? This cannot be undone.'))) {
      return;
    }
    // Cancel any pending autosave for the plan we're about to remove.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyPlanRef.current = null;
    const deleted = await deletePlan(activePlan.id);
    if (!deleted) {
      showToast(t('playtimePlanner.deleteError', 'Could not delete the plan.'), 'error');
      return;
    }
    const plans = await getPlans();
    const list = Object.values(plans).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setPlanList(list);
    if (list.length > 0) {
      setActivePlan(list[0]);
      setView('overview');
    } else {
      setActivePlan(null);
      resetSetupForm(roster);
      setView('setup');
    }
  };

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

        {view === 'overview' && activePlan && (
          <div className="max-w-lg mx-auto space-y-5">
            {/* Plan switcher (only when more than one plan exists) */}
            {planList.length > 1 && (
              <div>
                <label className={labelStyle}>{t('playtimePlanner.versions.switchLabel', 'Plan')}</label>
                <select
                  value={activePlan.id}
                  onChange={(e) => handleSwitchPlan(e.target.value)}
                  className={selectStyle}
                >
                  {planList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === activePlan.id ? activePlan.name : p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={labelStyle}>{t('playtimePlanner.setup.nameLabel', 'Plan name')}</label>
              <input
                type="text"
                value={activePlan.name}
                onChange={(e) => {
                  const value = e.target.value;
                  updateActivePlan((plan) => ({ ...plan, name: value }));
                }}
                className={inputBaseStyle}
              />
            </div>

            {/* Versions & JSON toolbar - one full-width block of equal buttons. */}
            <div className="flex gap-2">
              <button type="button" onClick={handleDuplicate} className={`${secondaryButtonStyle} flex-1 whitespace-nowrap`}>
                {t('playtimePlanner.versions.duplicate', 'Duplicate')}
              </button>
              <button type="button" onClick={handleExport} className={`${secondaryButtonStyle} flex-1 whitespace-nowrap`}>
                {t('playtimePlanner.versions.export', 'Export JSON')}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`${secondaryButtonStyle} flex-1 whitespace-nowrap`}
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

            <div className={cardStyle}>
              <p className="text-slate-200">
                {t('playtimePlanner.overview.rosterSummary', '{{count}} players', { count: activePlan.players.length })}
              </p>
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

            <div>
              <h3 className={`${labelStyle} mb-2`}>{t('playtimePlanner.overview.gamesHeading', 'Games')}</h3>
              <div className="space-y-2">
                {activePlan.games.map((game, i) => {
                  const slotCount = getGameSlots(game.formationId).length;
                  const placed = ensureStartingSlots(game).filter((s) => s.playerId).length;
                  return (
                    <div
                      key={game.id}
                      className="bg-slate-800/40 border border-slate-700/50 rounded-md px-3 py-2 space-y-2"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={game.label}
                          onChange={(e) => {
                            const value = e.target.value;
                            updateActivePlan((plan) => ({
                              ...plan,
                              games: plan.games.map((g, gi) => (gi === i ? { ...g, label: value } : g)),
                            }));
                          }}
                          className={`${inputBaseStyle} flex-1`}
                        />
                        <label className="flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap">
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
                      <div className="flex items-center justify-between">
                        <span className={subtextStyle}>
                          {t('playtimePlanner.overview.placedCount', '{{placed}}/{{total}} placed', {
                            placed,
                            total: slotCount,
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingGameId(game.id);
                            setView('lineup');
                          }}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          {t('playtimePlanner.overview.editLineup', 'Edit lineup')}
                        </button>
                      </div>
                      {(linkedCounts[game.id] ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleReapplyLinkedGames(game)}
                          className={`${secondaryButtonStyle} w-full text-xs`}
                        >
                          {t('playtimePlanner.overview.updateLinked', 'Update {{count}} game(s) from this', {
                            count: linkedCounts[game.id],
                          })}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {view === 'lineup' && activePlan && editingGame && (
          <div className="max-w-lg mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">{editingGame.label}</h3>
              <span className={subtextStyle}>
                {getPresetById(editingGame.formationId)?.name ?? '-'}
              </span>
            </div>
            <PlanFieldView
              game={editingGame}
              players={activePlan.players}
              onAssign={(slotId, playerId) => handleAssign(editingGame.id, slotId, playerId)}
            />
            <div className="border-t border-slate-700/40 pt-4">
              <PlanSubsEditor
                game={editingGame}
                players={activePlan.players}
                onAdd={(sub) => handleAddSub(editingGame.id, sub)}
                onRemove={(subId) => handleRemoveSub(editingGame.id, subId)}
              />
            </div>
          </div>
        )}

        {view === 'balance' && activePlan && (
          <PlanBalanceView plan={activePlan} />
        )}
      </ScrollableContent>

      <ModalFooter>
        {(view === 'lineup' || view === 'balance') && (
          <button
            type="button"
            onClick={() => {
              setEditingGameId(null);
              setView('overview');
            }}
            className={`${secondaryButtonStyle} flex-1`}
          >
            {t('playtimePlanner.lineup.back', 'Back')}
          </button>
        )}
        {view === 'overview' && (
          <>
            <button type="button" onClick={handleDelete} className={`${dangerButtonStyle} flex-1`}>
              {t('playtimePlanner.overview.deletePlan', 'Delete')}
            </button>
            <button type="button" onClick={startNewPlan} className={`${secondaryButtonStyle} flex-1`}>
              {t('playtimePlanner.overview.newPlan', 'New')}
            </button>
          </>
        )}
        <button type="button" onClick={onClose} className={`${secondaryButtonStyle} flex-1`}>
          {t('common.close', 'Close')}
        </button>
      </ModalFooter>
    </ModalContainer>
  );
};

export default PlaytimePlannerModal;
