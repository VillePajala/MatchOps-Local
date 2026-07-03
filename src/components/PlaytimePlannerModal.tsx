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
import PlanFieldView from '@/components/PlanFieldView';
import PlanSubsEditor from '@/components/PlanSubsEditor';
import PlanBalanceView from '@/components/PlanBalanceView';
import type { PlaytimePlan, PlanSub } from '@/utils/playtimePlanner/types';
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

  const [view, setView] = useState<View>('loading');
  const [roster, setRoster] = useState<Player[]>([]);
  const [activePlan, setActivePlan] = useState<PlaytimePlan | null>(null);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [planList, setPlanList] = useState<PlaytimePlan[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Setup form state.
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [gameCount, setGameCount] = useState(5);
  const [numberOfPeriods, setNumberOfPeriods] = useState(2);
  const [periodMinutes, setPeriodMinutes] = useState(12);
  const [formationId, setFormationId] = useState(DEFAULT_FORMATION);

  const resetSetupForm = useCallback((players: Player[]) => {
    setName(t('playtimePlanner.setup.defaultName', 'Tournament plan'));
    setSelectedIds(new Set(players.map((p) => p.id)));
    setGameCount(5);
    setNumberOfPeriods(2);
    setPeriodMinutes(12);
    setFormationId(DEFAULT_FORMATION);
  }, [t]);

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
      .map((p) => ({ id: p.id, name: p.name }));
    if (players.length === 0) return;
    const plan = createPlan({
      name: name.trim() || t('playtimePlanner.setup.defaultName', 'Tournament plan'),
      players,
      gameCount,
      formationId,
      numberOfPeriods,
      periodMinutes,
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
      }
    },
    [activePlan?.id, flushSave],
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
    void flushSave();
    try {
      const blob = new Blob([serializePlan(activePlan)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activePlan.name || 'plan'}.json`;
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
      <ModalHeader title={t('playtimePlanner.title', 'Playing-Time Planner')} />

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
                      onChange={(e) => setGameCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
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
                      onChange={(e) => setPeriodMinutes(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
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

            {/* Versions & JSON toolbar */}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleDuplicate} className={secondaryButtonStyle}>
                {t('playtimePlanner.versions.duplicate', 'Duplicate')}
              </button>
              <button type="button" onClick={handleExport} className={secondaryButtonStyle}>
                {t('playtimePlanner.versions.export', 'Export JSON')}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={secondaryButtonStyle}
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
            className={secondaryButtonStyle}
          >
            {t('playtimePlanner.lineup.back', 'Back to plan')}
          </button>
        )}
        {view === 'overview' && (
          <>
            <button type="button" onClick={handleDelete} className={`${dangerButtonStyle} mr-auto`}>
              {t('playtimePlanner.overview.deletePlan', 'Delete plan')}
            </button>
            <button type="button" onClick={startNewPlan} className={secondaryButtonStyle}>
              {t('playtimePlanner.overview.newPlan', 'New plan')}
            </button>
          </>
        )}
        <button type="button" onClick={onClose} className={secondaryButtonStyle}>
          {t('common.close', 'Close')}
        </button>
      </ModalFooter>
    </ModalContainer>
  );
};

export default PlaytimePlannerModal;
