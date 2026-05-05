'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  classifyRoleSplit,
  addHalftimeSplit,
  keepStarter as halftimeKeepStarter,
  keepSub as halftimeKeepSub,
} from '@/utils/planHalftimeSplit';
import { generateId } from '@/utils/idGenerator';
import PlanningTimeline from './PlanningTimeline';
import PlanningMinutesDashboard from './PlanningMinutesDashboard';
import PlanningTotalsTable from './PlanningTotalsTable';
import PlanningChipGrid from './PlanningChipGrid';
import type { DraftScheduledSub } from '@/utils/planSwapEngine';
import PlanningApplyPreview from './PlanningApplyPreview';
import { computeApplyDiff, type ApplyDiff } from '@/utils/applyPreview';
import {
  captureApplyableFields,
  type ApplySnapshot,
  type ApplySnapshotEntry,
} from '@/utils/applySnapshot';

export interface PlanningEditorProps {
  /** Game ids picked in the previous page; the editor mutates each on Apply. */
  gameIds: string[];
  /** Saved-games map; each picked id should resolve to an AppState. */
  savedGames: SavedGamesCollection;
  /** Master roster — used as the player universe when Apply is wired. */
  roster: Player[];
  onBack: () => void;
  /**
   * Called once Apply finishes so the parent can transition out of
   * the editor. When the apply mutated at least one game (full
   * success), the snapshot of the pre-apply state is passed so the
   * parent can render a post-apply undo banner. Partial-success and
   * warning paths don't carry a snapshot — the editor stays open with
   * the existing warning banner there.
   *
   * The `appliedDrafts` argument carries the in-memory per-game
   * PlanDraft Record that was just written to games — exactly what
   * the editor had on the active tabs at Apply time. The parent
   * persists it onto the saved session row alongside `appliedAt`, so
   * a coach who edits a saved session and clicks Apply (without an
   * explicit Save) still ends up with the session row matching what
   * was applied to the games. Without this, the session metadata
   * would lie about which drafts ran. `includedGameIds` carries the
   * include-flag state for the same reason — apply implicitly commits
   * the entire editor state, not just the lineup.
   */
  onApplied: (
    snapshot?: ApplySnapshot,
    appliedDrafts?: Record<string, PlanDraft>,
    includedGameIds?: string[],
  ) => void;
  /** Persists one game's lineup; called once per `gameIds` entry on Apply. */
  applyToGame: (gameId: string, updates: Partial<AppState>) => Promise<void>;

  // ── Reopen / Save flow ───────────────────────────────────────────────
  // When the editor is opened from a saved PlanningSession, the parent
  // hydrates these props so the user picks up where they left off.
  /**
   * Per-game pre-existing drafts (from a saved session) keyed by gameId.
   * When supplied, the editor seeds each tab's draft from this map; any
   * gameId NOT in the map falls back to draftFromGame(savedGames[gid]).
   * Per-game divergence is the design intent — tabs are independent.
   */
  initialDrafts?: Record<string, PlanDraft>;
  /**
   * Back-compat: a single PlanDraft seeded onto every tab. Use only
   * when the caller has one canonical lineup that should apply across
   * games (e.g., legacy callers, the standalone-import handoff before
   * gameIds[0] is selected). Prefer `initialDrafts` for per-game
   * intent. If both are supplied, `initialDrafts` wins per-key and
   * `initialDraft` fills in the remaining keys.
   */
  initialDraft?: PlanDraft;
  /**
   * Per-game include-in-totals flags. `undefined` means "all included"
   * (the default for new + legacy sessions). When non-undefined,
   * gameIds not in the array are excluded from minutes aggregation.
   */
  initialIncludedGameIds?: string[];
  /**
   * Formation preset the drafts were authored against. When provided,
   * overrides the game-derived default — without this, reopening a
   * session can mis-render against a different preset and drop role
   * assignments whose role names don't exist in the new preset.
   *
   * Note: a single preset applies to all tabs in the current rebuild
   * (Phase 1 of per-game-drafts). Per-tab presets is a future PR.
   */
  initialPresetId?: string;
  /** Pre-fills the Save form's name input; also displayed in the editor header. */
  initialName?: string;
  /** When set, Save updates that session instead of creating a new one. */
  editingSessionId?: string;
  /**
   * Epoch ms of the most recent successful save mutation, or null
   * when no save has happened yet (or the indicator window has
   * elapsed). Drives the "✓ Saved HH:MM:SS" badge in the editor
   * header. Owned by PlanningModal so the timer state is centralised.
   */
  lastSavedAt?: number | null;
  /**
   * Save handler — called when the user submits the inline name form.
   * Implementations call `savePlanningSession` and either create or
   * update based on whether `sessionId` is provided. `drafts` is the
   * full per-game map exactly as the editor produced it; `includedGameIds`
   * is the include-flag array (or undefined for "all included").
   *
   * Must return a Promise: the editor `await`s it to drive the
   * isSaving spinner + close-on-success behavior.
   */
  onSavePlan?: (data: {
    sessionId: string | undefined;
    name: string;
    drafts: Record<string, PlanDraft>;
    gameIds: string[];
    includedGameIds: string[] | undefined;
  }) => Promise<void>;

  /**
   * When true, Apply opens a per-game diff preview the user must
   * confirm before persistence. When false, Apply runs immediately.
   */
  enableApplyPreview?: boolean;
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
    // A player with null/undefined coords has no anchored field
    // position — falling back to (0.5, 0.5) would snap them to centre
    // pitch and let `roleForCoord` assign whatever role lives there
    // (typically a midfielder), silently misclassifying. Treat
    // missing coords as bench instead; coaches can drag onto the
    // pitch from the bench tray to confirm placement.
    if (p.relX == null || p.relY == null) {
      benchSet.add(p.id);
      continue;
    }
    const role = roleForCoord(preset, p.relX, p.relY);
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
  // Hydrate scheduledSubs from the game record. Filter out fired/skipped
  // entries — the draft represents the editable future, and a re-Apply
  // would otherwise resurrect historical events as new pending subs.
  // outPlayer is dropped (recomputed lazily by the swap engine; storing
  // it would go stale on every pitch swap).
  const scheduledSubs = (game.scheduledSubs ?? [])
    .filter((s) => s.status !== 'fired' && s.status !== 'skipped')
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
  initialDrafts,
  initialDraft,
  initialIncludedGameIds,
  initialPresetId,
  initialName,
  editingSessionId,
  lastSavedAt,
  onSavePlan,
  enableApplyPreview = false,
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

  // Reopen path: explicit `initialPresetId` wins; the first non-empty
  // draft's own `presetId` annotation is the secondary source; the
  // game-derived default is the fallback. If the saved id no longer
  // exists in the registry (preset removed/renamed), fall through to
  // the default.
  const [presetId, setPresetId] = useState<string>(() => {
    const fromDraft = gameIds
      .map((g) => initialDrafts?.[g]?.presetId)
      .find((id): id is string => Boolean(id));
    const candidate =
      initialPresetId ?? fromDraft ?? initialDraft?.presetId;
    if (candidate && getPresetById(candidate)) return candidate;
    return defaultPreset.id;
  });
  const preset = getPresetById(presetId) ?? defaultPreset;

  // Per-game drafts. Each picked gameId gets its own independent
  // PlanDraft — the design intent of the planner is N-game tournaments
  // where each game has its own lineup. Tabs (below) switch which
  // game's draft is active for editing; `draft` and `setDraft` are
  // adapters that read/write `drafts[selectedGameId]` so the rest of
  // the editor logic continues to think it's editing one draft.
  //
  // Seed precedence per gameId:
  //   1. initialDrafts[gid] (per-game session record on reopen)
  //   2. initialDraft (back-compat single seed; same lineup on every tab)
  //   3. draftFromGame(savedGames[gid], preset) (game-derived default)
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>(() => {
    const seeded: Record<string, PlanDraft> = {};
    for (const gid of gameIds) {
      seeded[gid] =
        initialDrafts?.[gid] ??
        initialDraft ??
        draftFromGame(savedGames[gid], preset);
    }
    return seeded;
  });
  const [selectedGameId, setSelectedGameId] = useState<string>(
    () => gameIds[0] ?? '',
  );
  // Per-game include-in-totals flags. `undefined` keeps the
  // "all-included" default for new + legacy sessions; toggling the
  // checkbox materializes the array.
  const [includedGameIds, setIncludedGameIds] = useState<
    string[] | undefined
  >(initialIncludedGameIds);

  // Lifted highlight state for the cross-game player view. A click on
  // any chip / dashboard pill / totals-table row toggles the player in
  // this set; the same set drives the visual focus across all three
  // components so highlighting in one place lights up the player
  // everywhere they appear. Not persisted across opens — treated as
  // an in-session reading aid, not part of the saved plan.
  const [highlightedPlayerIds, setHighlightedPlayerIds] = useState<
    Set<PlayerId>
  >(() => new Set());
  // Show-benches toggle — when off, the bench drawer + bench drag
  // affordances hide, compressing the editor onto the pitch + role
  // panel only. Matches the standalone planner's `showBenches` UX.
  // Default true so coaches see the bench by default; in-session
  // only (not persisted on the saved plan).
  const [showBenches, setShowBenches] = useState<boolean>(true);
  const toggleHighlight = useCallback((playerId: PlayerId) => {
    setHighlightedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);
  const clearHighlight = useCallback(
    () => setHighlightedPlayerIds(new Set()),
    [],
  );
  // Drop highlights for players whose role no longer exists in the
  // active preset. Without this, switching from 4-3-3 → 3-2-2 would
  // leave "Clear highlight (1)" surfaced for an invisible selection
  // (the chip grid's old keyed-remount handled this; with the state
  // lifted we filter explicitly instead).
  useEffect(() => {
    setHighlightedPlayerIds((prev) => {
      if (prev.size === 0) return prev;
      const stillReachable = new Set<PlayerId>();
      // A player is "reachable" if they're in startingXI / bench /
      // sub inPlayer of ANY tab's draft — i.e. they currently appear
      // somewhere in the plan.
      // sub.outPlayer is intentionally NOT iterated: outPlayer is
      // always the role's pre-sub occupant, which is by construction
      // either startingXI[role] or an earlier sub's inPlayer. Both
      // are already covered by the loops above; the implicit
      // invariant is `outPlayer ∈ {startingXI ∪ earlier sub inPlayers}`.
      for (const d of Object.values(drafts)) {
        for (const id of Object.values(d.startingXI)) stillReachable.add(id);
        for (const id of d.bench) stillReachable.add(id);
        for (const sub of d.scheduledSubs) stillReachable.add(sub.inPlayer);
      }
      const next = new Set<PlayerId>();
      for (const pid of prev) {
        if (stillReachable.has(pid)) next.add(pid);
      }
      // Identity preservation: only return a new Set when membership
      // actually changed, so consumers' useMemo deps don't re-fire.
      // The size check is sufficient (not just a heuristic) BECAUSE
      // this effect only ever REMOVES elements from prev — `next ⊆
      // prev` by construction. Equal size under removal-only iff
      // identical membership; if we ever added to next, we'd need
      // a deeper compare here.
      return next.size === prev.size ? prev : next;
    });
  }, [drafts]);
  // Adapter: existing logic that reads `draft` / writes via `setDraft`
  // continues to work; the adapter routes the read/write to the active
  // tab's slot in the drafts Record.
  const draft = drafts[selectedGameId] ?? draftFromGame(savedGames[selectedGameId], preset);
  const setDraft = useCallback(
    (next: PlanDraft | ((prev: PlanDraft) => PlanDraft)) => {
      setDrafts((prev) => {
        const current =
          prev[selectedGameId] ??
          draftFromGame(savedGames[selectedGameId], preset);
        const value = typeof next === 'function' ? (next as (p: PlanDraft) => PlanDraft)(current) : next;
        return { ...prev, [selectedGameId]: value };
      });
    },
    [selectedGameId, savedGames, preset],
  );
  const [selected, setSelected] = useState<SelectedSlot | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyWarning, setApplyWarning] = useState<string | null>(null);
  // When the warning path fires AFTER at least one game was successfully
  // saved, the games are already mutated. Hold the snapshot here so the
  // warning Done can hand it to the parent's undo flow — without it,
  // partial successes have no rollback affordance.
  const [warningSnapshot, setWarningSnapshot] = useState<ApplySnapshot | null>(null);
  // When non-null, the preview is shown and the pitch/Apply button
  // are gated behind it. Null = direct edit mode.
  const [previewDiffs, setPreviewDiffs] = useState<ApplyDiff[] | null>(null);
  // gameIds that no longer resolve (cloud sync race / IndexedDB
  // eviction). Tracked separately so the preview can surface an
  // inline notice and the post-apply warning still fires when the
  // user confirms.
  const [missingGameIds, setMissingGameIds] = useState<string[]>([]);
  // Increments on every preview open so the child can be keyed off it.
  // Forces a fresh mount per session even if the rendering structure
  // around PlanningApplyPreview is later refactored away from the
  // null-conditional.
  const [previewOpenCount, setPreviewOpenCount] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  // The preview is appended below the editor's content; on tall plans
  // the user would otherwise have to scroll to see the confirmation
  // step appear after clicking Apply. The function check skips JSDOM
  // (no scrollIntoView impl) and any non-DOM environment.
  useEffect(() => {
    const node = previewRef.current;
    if (previewDiffs !== null && typeof node?.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [previewDiffs]);
  // Save form state. Null = form hidden; otherwise the string is the
  // draft name the user is typing.
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
    // Reset EVERY tab's draft, not just the active one. Role names
    // differ across presets (LM/RM vs LB/RB), so leaving non-active
    // tabs with stale role names would silently drop their field
    // players via unknownRoles when Apply runs. setDrafts directly
    // (not the adapter) so all tabs re-seed in one commit.
    setDrafts(() => {
      const reset: Record<string, PlanDraft> = {};
      for (const gid of gameIds) {
        reset[gid] = draftFromGame(savedGames[gid], next);
      }
      return reset;
    });
    setSelected(null);
    setPendingPresetId(null);
    setApplyError(null);
    setApplyWarning(null);
    setWarningSnapshot(null);
  };

  const handlePresetChange = (id: string) => {
    if (id === presetId) return;
    if (!getPresetById(id)) return;
    // Check every tab's draft against its own per-game baseline.
    // Without this, a coach who diverged on game 2 but not game 1
    // would skip the confirm banner and silently lose game 2's edits
    // when applyPresetChange re-seeds all tabs.
    const checkOneTab = (gid: string): boolean => {
      const baseline = draftFromGame(savedGames[gid], preset);
      const tabDraft = drafts[gid] ?? baseline;
      const baselineKeys = Object.keys(baseline.startingXI);
      const tabKeys = Object.keys(tabDraft.startingXI);
      const baselineSubsById = new Map(
        baseline.scheduledSubs.map((s) => [s.id, s] as const),
      );
      const subsDiverged =
        tabDraft.scheduledSubs.length !== baseline.scheduledSubs.length ||
        tabDraft.scheduledSubs.some((s) => {
          const b = baselineSubsById.get(s.id);
          return (
            !b ||
            b.timeSeconds !== s.timeSeconds ||
            b.positionRole !== s.positionRole ||
            b.inPlayer !== s.inPlayer
          );
        });
      return (
        baselineKeys.length !== tabKeys.length ||
        baselineKeys.some(
          (k) => baseline.startingXI[k] !== tabDraft.startingXI[k],
        ) ||
        subsDiverged
      );
    };
    const diverged = gameIds.some(checkOneTab);
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
    // Trim so a "  " initialName doesn't open the form pre-filled with
    // whitespace the user has to manually clear before typing.
    setSavePlanName((initialName ?? '').trim());
  };

  const handleCancelSave = () => {
    setSavePlanName(null);
    setSaveError(null);
  };

  const handleConfirmSave = async () => {
    // Form-render gate ({onSavePlan && savePlanName !== null && ...})
    // already guarantees both are present when this fires; this remains
    // for the type narrowing.
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
      // Stamp the current preset onto every per-game draft so reopen
      // restores the same role grid; role keys differ across presets
      // (LM/RM vs LB/RB) and a mismatched preset would drop assignments.
      const stampedDrafts: Record<string, PlanDraft> = {};
      for (const gid of gameIds) {
        const d = drafts[gid] ?? draftFromGame(savedGames[gid], preset);
        stampedDrafts[gid] = { ...d, presetId };
      }
      await onSavePlan({
        sessionId: editingSessionId,
        name: trimmed,
        drafts: stampedDrafts,
        gameIds,
        includedGameIds,
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

  // Compute per-game diffs against the saved games and switch the
  // editor into preview mode. The preview's Confirm runs handleApply
  // with only the checked game ids (plus the missing ids tracked
  // here so the post-apply warning still fires). Cancel returns to
  // edit mode. When enableApplyPreview is false this falls through
  // to the direct apply path.
  const handleStartApply = () => {
    if (!enableApplyPreview) {
      void handleApply();
      return;
    }
    setApplyError(null);
    setApplyWarning(null);
    setWarningSnapshot(null);
    try {
      const diffs: ApplyDiff[] = [];
      const missing: string[] = [];
      for (const id of gameIds) {
        const game = savedGames[id];
        if (!game) {
          missing.push(id);
          continue;
        }
        // Per-game draft for the diff. Pre-PR-A this used `draft`
        // (the active-tab adapter), so the preview showed the active
        // tab's diff for every game — misleading once tabs diverged.
        // The actual Apply at handleApply already iterates per-game;
        // align the preview here so the user sees what they'll get.
        const draftForGame = drafts[id] ?? draftFromGame(game, preset);
        diffs.push(computeApplyDiff(id, game, draftForGame, preset));
      }
      setPreviewDiffs(diffs);
      setMissingGameIds(missing);
      setPreviewOpenCount((n) => n + 1);
    } catch (err) {
      // computeApplyDiff is pure but malformed game state could still
      // throw; the sync handler would otherwise swallow the click
      // silently with no user feedback. Mirror handleApply's pattern.
      logger.error('[PlanningEditor] Diff calculation failed', err);
      setApplyError(
        t(
          'planningEditor.applyFailed',
          'Could not apply plan. Please try again.',
        ),
      );
    }
  };

  const handleCancelPreview = () => {
    setPreviewDiffs(null);
    setMissingGameIds([]);
  };

  const handleApply = async (applyGameIds: string[] = gameIds) => {
    setIsApplying(true);
    setApplyError(null);
    setApplyWarning(null);
    setWarningSnapshot(null);
    let gamesWithUnknownPlayers = 0;
    let gamesWithUnknownRoles = 0;
    let gamesWithUnreachableSubs = 0;
    let gamesNotFound = 0;
    let savedCount = 0;
    // Per-game pre-apply snapshots, only for games actually mutated.
    // Used by the modal-level undo banner after a clean full-success
    // apply; partial-success / warning paths don't carry a snapshot.
    const snapshots: ApplySnapshotEntry[] = [];
    try {
      for (const id of applyGameIds) {
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
        // Per-game draft: each tab has its own. Falls back to the
        // game-derived default for any gameId the editor never seeded
        // (defensive — every gameId in `gameIds` is seeded at mount).
        const draftForGame =
          drafts[id] ?? draftFromGame(game, preset);
        const result = applyDraftToGame(
          draftForGame,
          preset,
          game.availablePlayers,
          perGameDurationSec,
        );
        // Capture before the mutation so a mid-loop throw leaves the
        // snapshots array consistent with savedCount.
        const beforeFields = captureApplyableFields(game);
        await applyToGame(id, {
          playersOnField: result.playersOnField,
          selectedPlayerIds: result.selectedPlayerIds,
          scheduledSubs: result.scheduledSubs,
        });
        snapshots.push({ gameId: id, before: beforeFields });
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
            { saved: savedCount, total: applyGameIds.length },
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
        // Capture the partial-success snapshot so the warning Done can
        // hand it to the parent's undo flow. Without this, a warning
        // that fires after some games already wrote leaves the coach
        // with no rollback path.
        if (snapshots.length > 0) {
          setWarningSnapshot({ appliedAt: Date.now(), games: snapshots });
        }
        return;
      }
      onApplied(
        snapshots.length > 0
          ? { appliedAt: Date.now(), games: snapshots }
          : undefined,
        // Pass the per-game drafts that were just applied so the
        // parent can persist them on the session row — Apply implicitly
        // commits the editor state. Pass includedGameIds for the same
        // reason: include flags are part of the editor state.
        drafts,
        includedGameIds,
      );
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
              { saved: savedCount, total: applyGameIds.length },
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
      // Always clear the preview after the apply attempt, regardless of
      // outcome — leaving it open would let the user re-confirm against
      // already-applied state.
      setPreviewDiffs(null);
      setMissingGameIds([]);
    }
  };

  // Count entire role list (incl. GK); `playerCount` excludes the keeper.
  const fieldPlayerCount = Object.keys(draft.startingXI).length;
  const targetPlayerCount = (preset.roles ?? []).length;

  // Resolve included flags. `undefined` means "all included" (legacy
  // semantic preserved on read; toggling materializes the array).
  const isGameIncluded = useCallback(
    (gid: string) =>
      includedGameIds === undefined ? true : includedGameIds.includes(gid),
    [includedGameIds],
  );
  const toggleGameIncluded = useCallback(
    (gid: string) => {
      setIncludedGameIds((prev) => {
        const current = prev ?? [...gameIds];
        const has = current.includes(gid);
        const next = has ? current.filter((g) => g !== gid) : [...current, gid];
        // Re-sort to match gameIds order so the array shape is stable.
        return gameIds.filter((g) => next.includes(g));
      });
    },
    [gameIds],
  );

  return (
    <div className="space-y-4" data-testid="planning-editor">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-100"
            disabled={isApplying}
          >
            <HiOutlineArrowLeft className="h-4 w-4" />
            {t('common.backButton', 'Back')}
          </button>
          <div className="flex items-center gap-3">
            {/* Show-benches toggle — in-session UX preference; not
                persisted on the plan. aria-pressed reflects state for
                AT (a checkbox would also work, but the standalone
                uses a single button to match the chip-grid header
                "Clear" affordance). */}
            <button
              type="button"
              onClick={() => setShowBenches((prev) => !prev)}
              aria-pressed={showBenches}
              data-testid="planning-editor-show-benches-toggle"
              data-state={showBenches ? 'on' : 'off'}
              className="rounded-md bg-slate-700 px-2 py-0.5 text-[11px] text-slate-100 hover:bg-slate-600"
            >
              {showBenches
                ? t('planningEditor.hideBenches', 'Hide benches')
                : t('planningEditor.showBenches', 'Show benches')}
            </button>
            {/* Timer lives in PlanningModal so this component stays stateless. */}
            {lastSavedAt != null && (
              <span
                data-testid="planning-editor-saved-indicator"
                className="text-xs text-emerald-300"
              >
                ✓{' '}
                {t('planningEditor.savedAt', 'Saved {{time}}', {
                  time: new Date(lastSavedAt).toLocaleTimeString(),
                })}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400">
          {gameIds.length > 1
            ? t(
                'planningEditor.subtitlePerGame',
                'Plan each game on its own tab. Apply writes each tab to its game.',
              )
            : t(
                'planningEditor.subtitle',
                'Set the lineup. Apply writes it to every game in the plan.',
              )}
        </p>
      </div>

      {gameIds.length > 1 ? (
        <div
          className="flex flex-wrap items-center gap-1 overflow-x-auto"
          role="tablist"
          aria-label={t('planningEditor.tabsLabel', 'Game tabs')}
          data-testid="planning-editor-game-tabs"
        >
          {gameIds.map((gid, idx) => {
            const game = savedGames[gid];
            const opponent = game?.opponentName ?? gid;
            const included = isGameIncluded(gid);
            const isActive = gid === selectedGameId;
            return (
              <div
                key={gid}
                className={[
                  'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs select-none transition-opacity',
                  isActive
                    ? 'bg-emerald-700/60 border-emerald-500/60 text-emerald-50'
                    : 'bg-slate-700/60 border-slate-600/60 text-slate-200 hover:bg-slate-700',
                  included ? '' : 'opacity-55',
                ].join(' ')}
                data-testid={`planning-editor-game-tab-${gid}`}
                data-active={isActive ? 'true' : 'false'}
                data-included={included ? 'true' : 'false'}
              >
                <input
                  type="checkbox"
                  checked={included}
                  onChange={() => toggleGameIncluded(gid)}
                  className="h-3.5 w-3.5 cursor-pointer accent-emerald-500"
                  title={t(
                    'planningEditor.tabIncludeLabel',
                    'Include this game in totals',
                  )}
                  data-testid={`planning-editor-game-tab-include-${gid}`}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  type="button"
                  onClick={() => setSelectedGameId(gid)}
                  className="flex flex-col items-start text-left leading-tight"
                  role="tab"
                  aria-selected={isActive}
                >
                  <span className="font-semibold">
                    {t('planningEditor.tabGameLabel', 'Game {{n}}', { n: idx + 1 })}
                  </span>
                  <span className="text-[10px] opacity-80 truncate max-w-[140px]">
                    {opponent}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

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

      {(() => {
        // Role-action panel: shows half-time split shortcuts for the
        // currently-selected role. Pure rendering — all state changes
        // route through setDraft so per-tab isolation + undo coverage
        // work the same as drag-drop edits.
        if (!selected || selected.target === BENCH) return null;
        const role = selected.target;
        const game = savedGames[selectedGameId];
        const split = classifyRoleSplit(draft, role, game);
        if (split.kind === 'complex') return null;

        const onSplit = () => {
          if (split.kind !== 'no-sub' || !split.canSplit) return;
          setDraft((d) =>
            addHalftimeSplit(d, role, game, generateId('sub')),
          );
        };
        const onKeepStarter = () => {
          if (split.kind !== 'split') return;
          setDraft((d) => halftimeKeepStarter(d, role, game));
        };
        const onKeepSub = () => {
          if (split.kind !== 'split') return;
          setDraft((d) => halftimeKeepSub(d, role, game));
        };

        return (
          <div
            className="mt-2 rounded-md border border-slate-700 bg-slate-900/40 p-2 text-xs"
            data-testid="planning-editor-role-actions"
            data-role={role}
            data-state={split.kind}
          >
            <div className="mb-1 text-slate-400">
              {t(
                'planningEditor.roleActionsTitle',
                'Role: {{role}} — half-time options',
                { role },
              )}
            </div>
            {split.kind === 'no-sub' && (
              <button
                type="button"
                onClick={onSplit}
                disabled={!split.canSplit}
                data-testid="planning-editor-split-at-half"
                className="rounded-md bg-emerald-700 px-2 py-1 text-emerald-50 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
              >
                {t('planningEditor.splitAtHalf', '✂ Split at half')}
              </button>
            )}
            {split.kind === 'split' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onKeepStarter}
                  data-testid="planning-editor-keep-starter"
                  className="rounded-md bg-slate-700 px-2 py-1 text-slate-100 hover:bg-slate-600"
                >
                  {t('planningEditor.keepStarter', 'Keep {{player}}', {
                    player: split.starter
                      ? playerLabel(split.starter)
                      : '—',
                  })}
                </button>
                <button
                  type="button"
                  onClick={onKeepSub}
                  data-testid="planning-editor-keep-sub"
                  className="rounded-md bg-amber-700 px-2 py-1 text-amber-50 hover:bg-amber-600"
                >
                  {t('planningEditor.keepSub', 'Keep {{player}}', {
                    player: playerLabel(split.subPlayer),
                  })}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      <div
        onDragOver={
          dragSource && dragSource.target !== BENCH
            ? handleDragOver('bench-drawer')
            : undefined
        }
        onDragLeave={handleDragLeave}
        onDrop={handleDropOnBenchDrawer}
        data-testid="planning-editor-bench-drawer"
        // Hide the entire drawer (incl. drag handlers + chips) when
        // showBenches is off. Using `hidden` rather than conditional
        // render so the drag-target element registration stays
        // attached during a brief toggle while a drag is in flight —
        // dropping onto a hidden element is a no-op without throwing.
        hidden={!showBenches}
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

      <PlanningMinutesDashboard
        draft={drafts}
        gameIds={gameIds.filter(isGameIncluded)}
        savedGames={savedGames}
        roster={roster}
        highlightedPlayerIds={highlightedPlayerIds}
        onToggleHighlight={toggleHighlight}
      />

      <PlanningTotalsTable
        drafts={drafts}
        gameIds={gameIds}
        savedGames={savedGames}
        roster={roster}
        includedGameIds={includedGameIds}
        highlightedPlayerIds={highlightedPlayerIds}
        onToggleHighlight={toggleHighlight}
      />

      <PlanningChipGrid
        drafts={drafts}
        preset={preset}
        gameIds={gameIds}
        savedGames={savedGames}
        roster={roster}
        highlightedPlayerIds={highlightedPlayerIds}
        onToggleHighlight={toggleHighlight}
        onClearHighlight={clearHighlight}
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
              // Warning-path Done: exits the warning view, handing
              // any captured partial-success snapshot to the parent so
              // the undo banner can offer rollback for the games that
              // did write. Wrapping arrow keeps the click event from
              // being passed where onApplied expects an ApplySnapshot.
              onClick={() =>
                onApplied(warningSnapshot ?? undefined, drafts, includedGameIds)
              }
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
          onClick={handleStartApply}
          // Gate against re-clicking Apply while the preview is open —
          // a second click would reset previewDiffs but the existing
          // PlanningApplyPreview instance keeps its checked state, so
          // the user could confirm against stale toggles.
          disabled={
            isApplying ||
            gameIds.length === 0 ||
            previewDiffs !== null ||
            // Empty startingXI would resolve playersOnField to [] in
            // applyDraftToGame and silently wipe every field player on
            // each picked game. The amber field-count counter is a
            // hint; this gate is the hard stop.
            fieldPlayerCount === 0
          }
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

      {/* When the user clicks Apply, the editor computes per-game
          diffs and renders this preview so they can review what will
          change and opt individual games out before committing. */}
      {previewDiffs !== null && (
        <div ref={previewRef}>
          {/* `key` derived from previewOpenCount forces a fresh mount
              every time the preview opens, so the component's
              `useState(initialChecked)` cannot leak a stale checked
              set from a prior session — even if a future maintainer
              removes the surrounding null-conditional. */}
          <PlanningApplyPreview
            key={previewOpenCount}
            diffs={previewDiffs}
            savedGames={savedGames}
            roster={roster}
            missingGameIds={missingGameIds}
            isApplying={isApplying}
            onConfirm={(checkedGameIds) => {
              // Re-include missing ids so handleApply hits its !game
              // path and surfaces the applyWarnMissing banner; the
              // preview already informed the user inline.
              void handleApply([...checkedGameIds, ...missingGameIds]);
            }}
            onCancel={handleCancelPreview}
          />
        </div>
      )}
    </div>
  );
};

export default PlanningEditor;

