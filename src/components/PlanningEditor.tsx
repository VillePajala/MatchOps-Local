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
import PlanningTimeline from './PlanningTimeline';
import type { DraftScheduledSub } from '@/utils/planSwapEngine';

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

  // ── Reopen / Save flow (PR 7c) ────────────────────────────────────────
  // When the editor is opened from a saved PlanningSession, the parent
  // hydrates these props so the user picks up where they left off.
  /** Pre-existing draft (from a saved session). Overrides the game-derived default. */
  initialDraft?: PlanDraft;
  /**
   * Formation preset the draft was authored against. When provided,
   * overrides the game-derived default — without this, reopening a
   * session can mis-render against a different preset and drop role
   * assignments whose role names don't exist in the new preset.
   */
  initialPresetId?: string;
  /** Pre-fills the Save form's name input; also displayed in the editor header. */
  initialName?: string;
  /** When set, Save updates that session instead of creating a new one. */
  editingSessionId?: string;
  /**
   * Save handler — called when the user submits the inline name form.
   * Implementations call `savePlanningSession` and either create or
   * update based on whether `sessionId` is provided. The draft carries
   * `presetId` so reopen can rehydrate the same role grid the user
   * authored under.
   */
  onSavePlan?: (data: {
    sessionId: string | undefined;
    name: string;
    draft: PlanDraft;
    gameIds: string[];
  }) => Promise<void> | void;
}

// TODO(PR 5e+): include roster members not in selectedPlayerIds.
function draftFromGame(
  game: AppState | undefined,
  preset: FormationPreset,
): PlanDraft {
  const startingXI: Record<string, PlayerId> = {};
  const benchSet = new Set<PlayerId>();
  if (!game) return { startingXI, bench: [], scheduledSubs: [] };

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
  // Hydrate scheduledSubs from the game record. Status is dropped
  // (the draft has no concept of fired/skipped) and outPlayer is
  // dropped (it's recomputed lazily — storing it would go stale on
  // every pitch swap).
  const scheduledSubs = (game.scheduledSubs ?? [])
    .map(({ id, timeSeconds, inPlayer, positionRole }) => ({
      id,
      timeSeconds,
      inPlayer,
      positionRole,
    }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  return { startingXI, bench: [...benchSet], scheduledSubs };
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
  initialDraft,
  initialPresetId,
  initialName,
  editingSessionId,
  onSavePlan,
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

  // Reopen path: explicit `initialPresetId` wins; the draft's own
  // `presetId` annotation is the secondary source; the game-derived
  // default is the fallback. If the saved id no longer exists in the
  // registry (preset removed/renamed), fall through to the default.
  const [presetId, setPresetId] = useState<string>(() => {
    const candidate = initialPresetId ?? initialDraft?.presetId;
    if (candidate && getPresetById(candidate)) return candidate;
    return defaultPreset.id;
  });
  const preset = getPresetById(presetId) ?? defaultPreset;

  // Reopened sessions hydrate from the saved draft; fresh plans derive
  // the starting XI from the first picked game's existing lineup.
  const [draft, setDraft] = useState<PlanDraft>(
    () => initialDraft ?? draftFromGame(firstGame, preset),
  );
  const [selected, setSelected] = useState<SelectedSlot | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyWarning, setApplyWarning] = useState<string | null>(null);
  // Save flow (PR 7c): inline name-input form. Null = form hidden;
  // otherwise the string is the draft name the user is typing.
  const [savePlanName, setSavePlanName] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    // Also count any draft-side sub change as divergence — add,
    // remove, or in-place edit (time / role / inPlayer). The id
    // survives an edit, so a length+ids check would miss it; check
    // each field by id-keyed lookup instead.
    const baselineSubsById = new Map(
      baseline.scheduledSubs.map((s) => [s.id, s] as const),
    );
    const subsDiverged =
      draft.scheduledSubs.length !== baseline.scheduledSubs.length ||
      draft.scheduledSubs.some((s) => {
        const b = baselineSubsById.get(s.id);
        return (
          !b ||
          b.timeSeconds !== s.timeSeconds ||
          b.positionRole !== s.positionRole ||
          b.inPlayer !== s.inPlayer
        );
      });
    const diverged =
      baselineKeys.length !== draftKeys.length ||
      baselineKeys.some(
        (k) => baseline.startingXI[k] !== draft.startingXI[k],
      ) ||
      subsDiverged;
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

  // Re-sorted on every mutation so callers can treat scheduledSubs as
  // monotonic (renderers + fairness math skip an extra sort step).
  const handleAddSub = (sub: DraftScheduledSub) => {
    setDraft((d) => ({
      ...d,
      scheduledSubs: [...d.scheduledSubs, sub].sort(
        (a, b) => a.timeSeconds - b.timeSeconds,
      ),
    }));
  };
  const handleUpdateSub = (
    subId: string,
    updates: Partial<DraftScheduledSub>,
  ) => {
    setDraft((d) => ({
      ...d,
      scheduledSubs: d.scheduledSubs
        .map((s) => (s.id === subId ? { ...s, ...updates } : s))
        .sort((a, b) => a.timeSeconds - b.timeSeconds),
    }));
  };
  const handleRemoveSub = (subId: string) => {
    setDraft((d) => ({
      ...d,
      scheduledSubs: d.scheduledSubs.filter((s) => s.id !== subId),
    }));
  };

  // Use the MIN duration across selected games so the form can't
  // accept a time that's invalid for a shorter game in the set
  // (the unreachableSubs filter would have dropped it on Apply anyway,
  // but the timeline header would have advertised the longer length).
  // Defaults match CLAUDE.md Rule 10 (createGame's default is 10).
  const gameDurationSec = useMemo(() => {
    const durations = gameIds
      .map((id) => savedGames[id])
      .filter((g): g is NonNullable<typeof g> => Boolean(g))
      .map(
        (g) => (g.numberOfPeriods ?? 2) * (g.periodDurationMinutes ?? 10) * 60,
      );
    if (durations.length === 0) return 2 * 10 * 60; // 2 periods × 10 min, matches Rule 10.
    return Math.max(1, Math.min(...durations));
  }, [gameIds, savedGames]);

  // Drag-drop primitives. Drag piggybacks on the same `performSwap` engine
  // that tap-to-swap uses; drop is the same operation as a tap on the
  // destination after a tap on the source.
  const isDragInteractive = !isApplying && pendingPresetId === null;
  const clearDragState = () => {
    setDragSource(null);
    setDragOverTarget(null);
    setSelected(null);
  };
  const handleDragStart = (source: SelectedSlot) => (e: React.DragEvent) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Firefox requires a non-empty payload to actually start a drag.
      e.dataTransfer.setData('text/plain', '');
    }
    // Drag and tap-select are mutually exclusive gestures. Clearing any
    // pre-existing tap-selection here makes that explicit and prevents
    // a cancelled drag from leaving stale state that would auto-swap
    // with the next role tap.
    clearDragState();
    setDragSource(source);
  };
  const handleDragEnd = () => clearDragState();
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
        // benchPlayerId identifies which bench player is involved.
        // When dropping ONTO bench (field→bench), it's the explicit
        // target arg. When dropping FROM bench onto a role, it's
        // captured on dragSource at dragstart.
        benchPlayerId:
          target === BENCH ? benchPlayerId : dragSource.benchPlayerId,
      }),
    );
    clearDragState();
  };
  const handleDropOnRole = (roleName: string) => (e: React.DragEvent) => {
    e.preventDefault();
    performDrop(roleName);
  };
  const handleDropOntoBenchPlayer = (playerId: PlayerId) => (e: React.DragEvent) => {
    e.preventDefault();
    // Stop the drop from bubbling to the bench-drawer ancestor — both
    // handlers see the same captured `dragSource` (React closure), so
    // a bubble would run performDrop(BENCH) on the just-placed player
    // and undo the swap.
    e.stopPropagation();
    if (!dragSource) return;
    if (dragSource.target === BENCH) {
      // Bench→bench is a no-op; just clear drag state.
      clearDragState();
      return;
    }
    // This is intentionally NOT routed through performDrop. performDrop
    // applies a `source: dragSource.target → target` mapping (drop
    // target receives the dragged item), but the gesture here is the
    // inverse: the dropped-on bench player becomes the new occupant
    // of the dragged role. Inverting that inside performDrop would
    // turn it into a special-case helper; the explicit call below
    // makes the asymmetry obvious.
    setDraft((d) =>
      performSwap(d, {
        source: BENCH,
        target: dragSource.target,
        benchPlayerId: playerId,
      }),
    );
    clearDragState();
  };
  const handleDropOnBenchDrawer = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragSource) return;
    if (dragSource.target === BENCH) {
      clearDragState();
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

  const handleStartSave = () => {
    setSaveError(null);
    setSavePlanName(initialName ?? '');
  };

  const handleCancelSave = () => {
    setSavePlanName(null);
    setSaveError(null);
  };

  const handleConfirmSave = async () => {
    if (!onSavePlan || savePlanName === null) return;
    const trimmed = savePlanName.trim();
    if (!trimmed) {
      setSaveError(
        t(
          'planningEditor.saveNameRequired',
          'Plan name is required.',
        ),
      );
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      // Stamp the current preset onto the draft so reopen restores the
      // same role grid (Codex PR-392 P1: prevents role-key mismatch
      // when the saved formation differs from the game-derived default).
      await onSavePlan({
        sessionId: editingSessionId,
        name: trimmed,
        draft: { ...draft, presetId },
        gameIds,
      });
      setSavePlanName(null);
    } catch (err) {
      logger.error('[PlanningEditor] Save plan failed', err);
      setSaveError(
        t(
          'planningEditor.saveFailed',
          'Could not save plan. Please try again.',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleApply = async () => {
    setIsApplying(true);
    setApplyError(null);
    setApplyWarning(null);
    let gamesWithUnknownPlayers = 0;
    let gamesWithUnknownRoles = 0;
    let gamesWithUnreachableSubs = 0;
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
        const perGameDurationSec = Math.max(
          1,
          (game.numberOfPeriods ?? 2) *
            (game.periodDurationMinutes ?? 10) *
            60,
        );
        const result = applyDraftToGame(
          draft,
          preset,
          game.availablePlayers,
          perGameDurationSec,
        );
        await applyToGame(id, {
          playersOnField: result.playersOnField,
          selectedPlayerIds: result.selectedPlayerIds,
          scheduledSubs: result.scheduledSubs,
        });
        savedCount++;
        // Count drops only on the success path so a throw doesn't claim
        // the failed game had partial saves.
        if (result.unknownPlayerIds.length > 0) gamesWithUnknownPlayers++;
        if (result.unknownRoles.length > 0) gamesWithUnknownRoles++;
        if (result.unreachableSubs.length > 0) gamesWithUnreachableSubs++;
      }
      if (
        gamesWithUnknownPlayers > 0 ||
        gamesWithUnknownRoles > 0 ||
        gamesWithUnreachableSubs > 0 ||
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
        if (gamesWithUnreachableSubs > 0) {
          parts.push(
            t(
              'planningEditor.applyWarnUnreachableSubs',
              '{{count}} game(s) had subs that could not be applied (past game end, empty role, or self-sub); those entries were dropped.',
              { count: gamesWithUnreachableSubs },
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
      if (gamesWithUnreachableSubs > 0) {
        errorParts.push(
          t(
            'planningEditor.applyWarnUnreachableSubs',
            '{{count}} game(s) had subs that could not be applied (past game end, empty role, or self-sub); those entries were dropped.',
            { count: gamesWithUnreachableSubs },
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
              // Drop targets stay registered even when draggable is false:
              // empty role slots accept bench→role drops.
              onDragOver={handleDragOver(role.name)}
              onDragLeave={handleDragLeave}
              onDrop={handleDropOnRole(role.name)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] leading-tight whitespace-nowrap shadow ${
                isSrc ? 'opacity-50 ' : ''
              }${isOver && !isSrc ? 'ring-2 ring-amber-200 ' : ''}${
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
              // Bench items always have an occupant (an empty bench
              // renders the empty-state message above instead), so no
              // !!occupant gate like the role buttons need.
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
                    // No onDragLeave on bench buttons — they're leaf nodes,
                    // so currentTarget.contains(relatedTarget) is always
                    // false and any sibling-button transition would fire
                    // a clear→re-set ring flicker. The drawer's own
                    // onDragLeave covers the bench region.
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

      <PlanningTimeline
        draft={draft}
        preset={preset}
        roster={roster}
        gameDurationSec={gameDurationSec}
        onAddSub={handleAddSub}
        onUpdateSub={handleUpdateSub}
        onRemoveSub={handleRemoveSub}
        disabled={isApplying || pendingPresetId !== null}
      />

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

      {/* Inline Save form: name input + Save / Cancel. <form onSubmit>
          gives Enter-to-submit + native a11y for free; matches the rest
          of the editor's no-nested-modal convention. */}
      {onSavePlan && savePlanName !== null && (
        <form
          className="rounded-md bg-slate-800/60 border border-slate-700 p-3 space-y-2"
          data-testid="planning-editor-save-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleConfirmSave();
          }}
        >
          <label
            htmlFor="planning-editor-save-name"
            className="block text-xs font-semibold text-slate-200"
          >
            {t('planningEditor.savePlanLabel', 'Plan name')}
          </label>
          <input
            id="planning-editor-save-name"
            type="text"
            value={savePlanName}
            onChange={(e) => setSavePlanName(e.target.value)}
            placeholder={t(
              'planningEditor.savePlanNamePlaceholder',
              'e.g. Lauto 80 Verne-5',
            )}
            disabled={isSaving}
            // Auto-focus on form open so the user can start typing
            // immediately without an extra click.
            autoFocus
            className="w-full rounded-md bg-slate-900/60 border border-slate-700 px-2 py-1 text-sm text-slate-100 disabled:opacity-60"
            data-testid="planning-editor-save-name"
          />
          {saveError && (
            <p
              className="text-xs text-rose-300"
              role="alert"
              data-testid="planning-editor-save-error"
            >
              {saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelSave}
              disabled={isSaving}
              className="rounded-md bg-slate-700 px-3 py-1 text-xs text-slate-100 hover:bg-slate-600 disabled:opacity-60"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              data-testid="planning-editor-save-confirm"
              className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {isSaving
                ? t('planningEditor.saving', 'Saving…')
                : editingSessionId
                  ? t('planningEditor.savePlanUpdate', 'Update plan')
                  : t('planningEditor.savePlanButton', 'Save plan')}
            </button>
          </div>
        </form>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onSavePlan && savePlanName === null && (
          <button
            type="button"
            onClick={handleStartSave}
            disabled={isApplying || isSaving || gameIds.length === 0}
            data-testid="planning-editor-save"
            className="inline-flex items-center gap-2 rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 shadow hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {editingSessionId
              ? t('planningEditor.savePlanUpdate', 'Update plan')
              : t('planningEditor.savePlanButton', 'Save plan')}
          </button>
        )}
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

