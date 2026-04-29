'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowLeft,
  HiOutlineCheck,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';
import type { Player } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';
import {
  FORMATION_PRESETS,
  getPresetById,
  type FormationPreset,
} from '@/config/formationPresets';
import {
  performSwap,
  BENCH,
  type PlanDraft,
  type PlayerId,
  type SwapTarget,
} from '@/utils/planSwapEngine';
import {
  applyDraftToGame,
  roleForCoord,
} from '@/utils/planApply';
import logger from '@/utils/logger';

export interface PlanningEditorProps {
  /** Game ids picked in the previous page; the editor mutates each on Apply. */
  gameIds: string[];
  /** Saved-games map; each picked id should resolve to an AppState. */
  savedGames: SavedGamesCollection;
  /** Master roster — used as the player universe when Apply is wired. */
  roster: Player[];
  onBack: () => void;
  /** Called once Apply finishes so the parent can transition out of the editor. */
  onApplied: () => void;
  /** Persists one game's lineup; called once per `gameIds` entry on Apply. */
  applyToGame: (gameId: string, updates: Partial<AppState>) => Promise<void>;
}

// TODO(PR 5e+): include roster members not in selectedPlayerIds.
function draftFromGame(
  game: AppState | undefined,
  preset: FormationPreset,
): PlanDraft {
  const startingXI: Record<string, PlayerId> = {};
  const benchSet = new Set<PlayerId>();
  if (!game) return { startingXI, bench: [] };

  for (const p of game.playersOnField ?? []) {
    const role = roleForCoord(preset, p.relX ?? 0.5, p.relY ?? 0.5);
    if (role && !startingXI[role.name]) {
      startingXI[role.name] = p.id;
    } else {
      benchSet.add(p.id);
    }
  }
  const onFieldIds = new Set(Object.values(startingXI));
  for (const id of game.selectedPlayerIds ?? []) {
    if (!onFieldIds.has(id)) {
      benchSet.add(id);
    }
  }
  return { startingXI, bench: [...benchSet] };
}

interface SelectedSlot {
  target: SwapTarget;
  /** Required when `target === BENCH` to disambiguate among bench players. */
  benchPlayerId?: PlayerId;
}

const PlanningEditor: React.FC<PlanningEditorProps> = ({
  gameIds,
  savedGames,
  roster,
  onBack,
  onApplied,
  applyToGame,
}) => {
  const { t } = useTranslation();
  // Picker guarantees ≥1 game; firstGame is undefined-tolerant regardless.
  const firstGame = savedGames[gameIds[0]];

  // `preset.playerCount` excludes the GK; add one when matching the
  // observed lineup count (which includes the keeper).
  const defaultPreset = useMemo<FormationPreset>(() => {
    const fieldCount = firstGame?.playersOnField?.length ?? 0;
    return (
      (fieldCount > 0 &&
        FORMATION_PRESETS.find((p) => p.playerCount + 1 === fieldCount)) ||
      FORMATION_PRESETS.find((p) => p.fieldSize === '11v11') ||
      FORMATION_PRESETS[0]
    );
  }, [firstGame]);

  const [presetId, setPresetId] = useState(defaultPreset.id);
  const preset = getPresetById(presetId) ?? defaultPreset;

  const [draft, setDraft] = useState<PlanDraft>(() =>
    draftFromGame(firstGame, preset),
  );
  const [selected, setSelected] = useState<SelectedSlot | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyWarning, setApplyWarning] = useState<string | null>(null);
  // Inline-banner confirmation for formation change. Storing the
  // pending id keeps the controlled <select> on the current preset
  // until the user confirms — no window.confirm anti-pattern.
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);
  // HTML5 drag-drop (desktop). Touch devices don't fire drag events,
  // so tap-to-swap remains the only path on mobile.
  const [dragSource, setDragSource] = useState<SelectedSlot | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<
    SwapTarget | 'bench-drawer' | null
  >(null);

  const rosterMap = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of roster) m.set(p.id, p);
    return m;
  }, [roster]);

  // Prompt only when the draft's role→player map diverged from a fresh
  // snap against the *current* preset — i.e. the user manually retargeted
  // roles. A pristine dropdown bump (or a second switch right after
  // confirming the first) compares clean and skips the banner.
  const applyPresetChange = (id: string) => {
    const next = getPresetById(id);
    if (!next) return;
    setPresetId(id);
    setDraft(draftFromGame(firstGame, next));
    setSelected(null);
    setPendingPresetId(null);
    setApplyError(null);
    setApplyWarning(null);
  };

  const handlePresetChange = (id: string) => {
    if (id === presetId) return;
    if (!getPresetById(id)) return;
    const baseline = draftFromGame(firstGame, preset);
    const baselineKeys = Object.keys(baseline.startingXI);
    const draftKeys = Object.keys(draft.startingXI);
    // When lengths match, a value-mismatch on any baseline key already
    // covers a different draft key set (the missing key reads as
    // undefined and never equals the baseline's player id).
    const diverged =
      baselineKeys.length !== draftKeys.length ||
      baselineKeys.some(
        (k) => baseline.startingXI[k] !== draft.startingXI[k],
      );
    if (diverged) {
      setPendingPresetId(id);
      return;
    }
    applyPresetChange(id);
  };

  const cancelPresetChange = () => setPendingPresetId(null);

  const playerLabel = (id: PlayerId): string => {
    const p = rosterMap.get(id);
    if (!p) return id;
    return p.nickname || p.name || id;
  };

  const isSelected = (s: SelectedSlot): boolean => {
    if (!selected) return false;
    if (selected.target !== s.target) return false;
    if (selected.target === BENCH) {
      return selected.benchPlayerId === s.benchPlayerId;
    }
    return true;
  };

  const handleRoleTap = (roleName: string) => {
    const occupant = draft.startingXI[roleName];
    if (!selected) {
      // Empty role can't be a swap source.
      if (!occupant) return;
      setSelected({ target: roleName });
      return;
    }
    if (selected.target === roleName) {
      setSelected(null);
      return;
    }
    setDraft((d) =>
      performSwap(d, {
        source: selected.target,
        target: roleName,
        benchPlayerId: selected.benchPlayerId,
      }),
    );
    setSelected(null);
  };

  const handleBenchTap = (playerId: PlayerId) => {
    if (!selected) {
      setSelected({ target: BENCH, benchPlayerId: playerId });
      return;
    }
    if (selected.target === BENCH && selected.benchPlayerId === playerId) {
      setSelected(null);
      return;
    }
    if (selected.target === BENCH) {
      setSelected({ target: BENCH, benchPlayerId: playerId });
      return;
    }
    // Engine's bench→field branch displaces the existing occupant atomically.
    setDraft((d) =>
      performSwap(d, {
        source: BENCH,
        target: selected.target,
        benchPlayerId: playerId,
      }),
    );
    setSelected(null);
  };

  // Drag-drop primitives. Drag piggybacks on the same `performSwap` engine
  // that tap-to-swap uses; drop is the same operation as a tap on the
  // destination after a tap on the source.
  const isDragInteractive = !isApplying && pendingPresetId === null;
  const handleDragStart = (source: SelectedSlot) => (e: React.DragEvent) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Firefox requires a non-empty payload to actually start a drag.
      e.dataTransfer.setData('text/plain', '');
    }
    setDragSource(source);
  };
  const handleDragEnd = () => {
    setDragSource(null);
    setDragOverTarget(null);
  };
  const handleDragOver =
    (overKey: SwapTarget | 'bench-drawer') => (e: React.DragEvent) => {
      if (!dragSource) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      // dragover fires at ~60 Hz; skip the state write when the value
      // hasn't changed so React doesn't re-render every frame.
      if (dragOverTarget !== overKey) setDragOverTarget(overKey);
    };
  const handleDragLeave = (e: React.DragEvent) => {
    // Ignore leaves where the cursor is still inside the same element
    // (e.g. moving between a child <button> and its parent drawer); the
    // browser fires dragleave on the parent before dragover on the
    // child, which causes a single-frame ring flicker without this
    // guard.
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDragOverTarget(null);
  };
  const performDrop = (
    target: SwapTarget,
    benchPlayerId?: PlayerId,
  ) => {
    if (!dragSource) return;
    if (dragSource.target === target && dragSource.benchPlayerId === benchPlayerId) {
      return; // dropped on self
    }
    setDraft((d) =>
      performSwap(d, {
        source: dragSource.target,
        target,
        benchPlayerId:
          target === BENCH ? benchPlayerId : dragSource.benchPlayerId,
      }),
    );
    setDragSource(null);
    setDragOverTarget(null);
    setSelected(null);
  };
  const handleDropOnRole = (roleName: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    performDrop(roleName);
  };
  const handleDropOntoBenchPlayer = (playerId: PlayerId) => (e: React.DragEvent) => {
    e.preventDefault();
    // Stop the drop from bubbling to the bench-drawer ancestor — both
    // handlers see the same captured `dragSource` (React closure), so
    // a bubble would run performDrop(BENCH) on the just-placed player
    // and undo the swap.
    e.stopPropagation();
    // Dropping onto a specific bench player mirrors the tap gesture:
    // source's occupant trades places with this bench player. Engine
    // handles it via bench→field with the bench player as the new
    // occupant.
    if (!dragSource) return;
    if (dragSource.target === BENCH) {
      // Bench→bench is a no-op; just clear drag state.
      setDragSource(null);
      setDragOverTarget(null);
      setSelected(null);
      return;
    }
    setDraft((d) =>
      performSwap(d, {
        source: BENCH,
        target: dragSource.target,
        benchPlayerId: playerId,
      }),
    );
    setDragSource(null);
    setDragOverTarget(null);
    setSelected(null);
  };
  const handleDropOnBenchDrawer = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragSource) return;
    if (dragSource.target === BENCH) {
      setDragSource(null);
      setDragOverTarget(null);
      return;
    }
    performDrop(BENCH);
  };

  const isDragSource = (s: SelectedSlot): boolean => {
    if (!dragSource) return false;
    if (dragSource.target !== s.target) return false;
    if (dragSource.target === BENCH) {
      return dragSource.benchPlayerId === s.benchPlayerId;
    }
    // Field roles are unique per role name, so matching target is enough.
    return true;
  };

  const handleApply = async () => {
    setIsApplying(true);
    setApplyError(null);
    setApplyWarning(null);
    let gamesWithUnknownPlayers = 0;
    let gamesWithUnknownRoles = 0;
    let gamesNotFound = 0;
    let savedCount = 0;
    try {
      for (const id of gameIds) {
        const game = savedGames[id];
        if (!game) {
          // Picked id no longer resolves (cloud sync, multi-tab race,
          // IndexedDB eviction). Skipping silently would auto-close the
          // modal as if everything saved; surface as a warning instead.
          gamesNotFound++;
          continue;
        }
        // Per-game availablePlayers is the roster filter so CLAUDE.md Rule 3
        // (playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers) holds
        // without widening any team's roster. Drops surface as unknown*
        // counters and feed the warning banner.
        const result = applyDraftToGame(draft, preset, game.availablePlayers);
        await applyToGame(id, {
          playersOnField: result.playersOnField,
          selectedPlayerIds: result.selectedPlayerIds,
        });
        savedCount++;
        // Count drops only on the success path so a throw doesn't claim
        // the failed game had partial saves.
        if (result.unknownPlayerIds.length > 0) gamesWithUnknownPlayers++;
        if (result.unknownRoles.length > 0) gamesWithUnknownRoles++;
      }
      if (
        gamesWithUnknownPlayers > 0 ||
        gamesWithUnknownRoles > 0 ||
        gamesNotFound > 0
      ) {
        // Stay in the editor with a warning banner; coach acknowledges via Done.
        const parts: string[] = [
          t(
            'planningEditor.applySavedSummary',
            'Saved {{saved}} of {{total}} games.',
            { saved: savedCount, total: gameIds.length },
          ),
        ];
        if (gamesNotFound > 0) {
          parts.push(
            t(
              'planningEditor.applyWarnMissing',
              '{{count}} selected game(s) were no longer available and were skipped.',
              { count: gamesNotFound },
            ),
          );
        }
        if (gamesWithUnknownPlayers > 0) {
          parts.push(
            t(
              'planningEditor.applyWarnUnknownPlayers',
              '{{count}} game(s) had players outside their roster; those entries were dropped.',
              { count: gamesWithUnknownPlayers },
            ),
          );
        }
        if (gamesWithUnknownRoles > 0) {
          parts.push(
            t(
              'planningEditor.applyWarnUnknownRoles',
              '{{count}} game(s) had roles outside the formation; those entries were dropped.',
              { count: gamesWithUnknownRoles },
            ),
          );
        }
        setApplyWarning(parts.join(' '));
        return;
      }
      onApplied();
    } catch (err) {
      logger.error('[PlanningEditor] Apply failed', err);
      // Translated fallback only — raw error text never reaches the user.
      // Carry forward warning counters from games that succeeded before
      // the throw so a partial-success error doesn't hide them.
      const errorParts: string[] = [
        savedCount > 0
          ? t(
              'planningEditor.applyFailedPartial',
              'Saved {{saved}} of {{total}} games before the error. Please try again.',
              { saved: savedCount, total: gameIds.length },
            )
          : t('planningEditor.applyFailed', 'Apply failed; please try again.'),
      ];
      if (gamesNotFound > 0) {
        errorParts.push(
          t(
            'planningEditor.applyWarnMissing',
            '{{count}} selected game(s) were no longer available and were skipped.',
            { count: gamesNotFound },
          ),
        );
      }
      if (gamesWithUnknownPlayers > 0) {
        errorParts.push(
          t(
            'planningEditor.applyWarnUnknownPlayers',
            '{{count}} game(s) had players outside their roster; those entries were dropped.',
            { count: gamesWithUnknownPlayers },
          ),
        );
      }
      if (gamesWithUnknownRoles > 0) {
        errorParts.push(
          t(
            'planningEditor.applyWarnUnknownRoles',
            '{{count}} game(s) had roles outside the formation; those entries were dropped.',
            { count: gamesWithUnknownRoles },
          ),
        );
      }
      setApplyError(errorParts.join(' '));
    } finally {
      setIsApplying(false);
    }
  };

  // Count entire role list (incl. GK); `playerCount` excludes the keeper.
  const fieldPlayerCount = Object.keys(draft.startingXI).length;
  const targetPlayerCount = (preset.roles ?? []).length;

  return (
    <div className="space-y-4" data-testid="planning-editor">
      <div className="space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-100"
          disabled={isApplying}
        >
          <HiOutlineArrowLeft className="h-4 w-4" />
          {t('common.backButton', 'Back')}
        </button>
        <p className="text-xs text-slate-400">
          {t(
            'planningEditor.subtitle',
            'Set the lineup. Apply writes it to every game in the plan.',
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2 text-slate-300">
          <span>{t('planningEditor.formation', 'Formation')}</span>
          <select
            value={presetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            disabled={isApplying || pendingPresetId !== null}
            className="rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-slate-100"
          >
            {FORMATION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fieldSize} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-slate-500">
          {t('planningEditor.gameCount', '{{count}} game', {
            count: gameIds.length,
          })}
        </span>
        <span
          className={
            fieldPlayerCount === targetPlayerCount
              ? 'text-emerald-400'
              : 'text-amber-400'
          }
        >
          {t('planningEditor.assignedCount', '{{filled}}/{{total}} on field', {
            filled: fieldPlayerCount,
            total: targetPlayerCount,
          })}
        </span>
      </div>

      {pendingPresetId ? (
        <div
          role="alertdialog"
          aria-labelledby="planning-editor-preset-confirm"
          className="rounded-md bg-amber-900/30 border border-amber-700/40 p-3 text-sm text-amber-100"
          data-testid="planning-editor-preset-confirm"
        >
          <p id="planning-editor-preset-confirm">
            {t(
              'planningEditor.formationChangeConfirm',
              'Switching formation will reset your manual assignments. Continue?',
            )}
          </p>
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={cancelPresetChange}
              data-testid="planning-editor-preset-confirm-cancel"
              className="rounded-md bg-slate-700/70 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={() => applyPresetChange(pendingPresetId)}
              data-testid="planning-editor-preset-confirm-accept"
              className="rounded-md bg-amber-500/90 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-400"
            >
              {t('common.confirm', 'Confirm')}
            </button>
          </div>
        </div>
      ) : null}

      {/* Pitch — 2:3 portrait, half-field tactical layout. */}
      <div
        className="relative w-full rounded-md bg-emerald-900/30 border border-emerald-800/50"
        style={{ aspectRatio: '2 / 3' }}
        data-testid="planning-editor-pitch"
      >
        {(preset.roles ?? []).map((role) => {
          const occupant = draft.startingXI[role.name];
          const sel = isSelected({ target: role.name });
          const isSrc = isDragSource({ target: role.name });
          const isOver = dragOverTarget === role.name;
          const draggable = !!occupant && isDragInteractive;
          return (
            <button
              key={role.name}
              type="button"
              onClick={() => handleRoleTap(role.name)}
              disabled={isApplying || pendingPresetId !== null}
              data-testid={`planning-editor-role-${role.name}`}
              draggable={draggable}
              onDragStart={
                draggable ? handleDragStart({ target: role.name }) : undefined
              }
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver(role.name)}
              onDragLeave={handleDragLeave}
              onDrop={handleDropOnRole(role.name)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] leading-tight whitespace-nowrap shadow ${
                isSrc ? 'opacity-50 ' : ''
              }${isOver ? 'ring-2 ring-amber-200 ' : ''}${
                sel
                  ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-200'
                  : occupant
                    ? 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                    : 'bg-slate-700/80 text-slate-300 border border-dashed border-slate-500 hover:bg-slate-700'
              }`}
              style={{
                left: `${role.relX * 100}%`,
                top: `${role.relY * 100}%`,
              }}
            >
              <span className="block text-[9px] uppercase tracking-wider opacity-70">
                {role.name}
              </span>
              <span className="block">
                {occupant ? playerLabel(occupant) : '—'}
              </span>
            </button>
          );
        })}
      </div>

      <div
        onDragOver={
          dragSource && dragSource.target !== BENCH
            ? handleDragOver('bench-drawer')
            : undefined
        }
        onDragLeave={handleDragLeave}
        onDrop={handleDropOnBenchDrawer}
        data-testid="planning-editor-bench-drawer"
        className={
          dragOverTarget === 'bench-drawer'
            ? 'rounded-md ring-2 ring-amber-200/60'
            : undefined
        }
      >
        <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-2">
          {t('planningEditor.bench', 'Bench')} ({draft.bench.length})
        </h3>
        {draft.bench.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            {t('planningEditor.benchEmpty', 'No players on the bench.')}
          </p>
        ) : (
          <ul
            className="flex flex-wrap gap-2"
            data-testid="planning-editor-bench"
          >
            {draft.bench.map((id) => {
              const sel = isSelected({ target: BENCH, benchPlayerId: id });
              const isSrc = isDragSource({
                target: BENCH,
                benchPlayerId: id,
              });
              const draggable = isDragInteractive;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => handleBenchTap(id)}
                    disabled={isApplying || pendingPresetId !== null}
                    data-testid={`planning-editor-bench-${id}`}
                    draggable={draggable}
                    onDragStart={
                      draggable
                        ? handleDragStart({
                            target: BENCH,
                            benchPlayerId: id,
                          })
                        : undefined
                    }
                    onDragEnd={handleDragEnd}
                    onDragOver={
                      dragSource && dragSource.target !== BENCH
                        ? handleDragOver('bench-drawer')
                        : undefined
                    }
                    onDrop={handleDropOntoBenchPlayer(id)}
                    className={`rounded-md px-3 py-1.5 text-sm shadow ${
                      isSrc ? 'opacity-50 ' : ''
                    }${
                      sel
                        ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-200'
                        : 'bg-slate-700/70 text-slate-100 hover:bg-slate-700'
                    }`}
                  >
                    {playerLabel(id)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {applyError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-rose-900/30 border border-rose-700/40 p-3 text-sm text-rose-100"
          data-testid="planning-editor-error"
        >
          <HiOutlineExclamationTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>{applyError}</p>
        </div>
      ) : null}

      {applyWarning ? (
        <div
          role="alert"
          className="rounded-md bg-amber-900/30 border border-amber-700/40 p-3 text-sm text-amber-100"
          data-testid="planning-editor-warning"
        >
          <div className="flex items-start gap-2">
            <HiOutlineExclamationTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>{applyWarning}</p>
          </div>
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={onApplied}
              data-testid="planning-editor-warning-done"
              className="rounded-md bg-amber-500/90 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-400"
            >
              {t('common.doneButton', 'Done')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleApply}
          disabled={isApplying || gameIds.length === 0}
          data-testid="planning-editor-apply"
          className="inline-flex items-center gap-2 rounded-md bg-amber-500/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <HiOutlineCheck className="h-4 w-4" />
          {isApplying
            ? t('planningEditor.applying', 'Applying…')
            : t('planningEditor.applyButton', 'Apply to {{count}} game', {
                count: gameIds.length,
              })}
        </button>
      </div>
    </div>
  );
};

export default PlanningEditor;
