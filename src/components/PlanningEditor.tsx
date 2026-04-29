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
  /**
   * Persists `{ playersOnField, selectedPlayerIds }` for a single game. The
   * editor invokes this once per `gameIds` entry on Apply and waits for all
   * to settle before calling `onApplied`. Errors propagate so the editor can
   * show a banner and let the coach retry.
   */
  applyToGame: (gameId: string, updates: Partial<AppState>) => Promise<void>;
}

/**
 * Reconstruct an initial draft from a saved game's `playersOnField` /
 * `selectedPlayerIds`, snapping each on-field player to a role via
 * `roleForCoord`. Off-formation players (legacy coord drift, ad-hoc tactical
 * placements) fall through to the bench so the coach can re-slot them.
 */
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
  for (const id of game.selectedPlayerIds ?? []) {
    if (!Object.values(startingXI).includes(id)) {
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
  const firstGame = savedGames[gameIds[0]];

  // Default preset: pick by playersOnField count if the first picked game
  // already has a lineup; otherwise the largest preset. `playerCount` on
  // a preset excludes the GK, so add one when matching against the
  // count we observe (which does include the keeper).
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

  const rosterMap = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of roster) m.set(p.id, p);
    return m;
  }, [roster]);

  // Switching formation: rebuild from the same game, snap with the new
  // preset's roles. Drops any in-progress swaps to keep semantics simple.
  const handlePresetChange = (id: string) => {
    const next = getPresetById(id);
    if (!next) return;
    setPresetId(id);
    setDraft(draftFromGame(firstGame, next));
    setSelected(null);
  };

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
      // Don't enter selection mode on an empty role — there's nothing to
      // swap from. Tap a player slot or a bench player first.
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
      // Bench-to-bench is a no-op in the engine; just move the
      // selection to the new bench player so the next role tap acts
      // on the most recent choice.
      setSelected({ target: BENCH, benchPlayerId: playerId });
      return;
    }
    // Source is a role → bring the tapped bench player on; the engine's
    // bench→field branch handles the displacement atomically (existing
    // role occupant goes to the bench tail).
    setDraft((d) =>
      performSwap(d, {
        source: BENCH,
        target: selected.target,
        benchPlayerId: playerId,
      }),
    );
    setSelected(null);
  };

  const handleApply = async () => {
    setIsApplying(true);
    setApplyError(null);
    try {
      for (const id of gameIds) {
        const game = savedGames[id];
        if (!game) continue;
        // Use the per-game availablePlayers as the roster filter so
        // CLAUDE.md Rule 3 (playersOnField ⊆ selectedPlayerIds ⊆
        // availablePlayers) holds for each individual game without us
        // widening the team roster.
        const result = applyDraftToGame(draft, preset, game.availablePlayers);
        await applyToGame(id, {
          playersOnField: result.playersOnField,
          selectedPlayerIds: result.selectedPlayerIds,
        });
      }
      onApplied();
    } catch (err) {
      setApplyError(
        err instanceof Error
          ? err.message
          : t('planningEditor.applyFailed', 'Apply failed; please try again.'),
      );
    } finally {
      setIsApplying(false);
    }
  };

  // Count the entire role list (incl. GK) so the "5/8 on field" indicator
  // tracks every slot — `preset.playerCount` excludes the keeper.
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
            disabled={isApplying}
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
          {t('planningEditor.gameCount', '{{count}} games', {
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

      {/* Pitch */}
      <div
        className="relative w-full rounded-md bg-emerald-900/30 border border-emerald-800/50"
        // 2:3 portrait pitch — standard for half-field tactical views.
        style={{ aspectRatio: '2 / 3' }}
        data-testid="planning-editor-pitch"
      >
        {(preset.roles ?? []).map((role) => {
          const occupant = draft.startingXI[role.name];
          const sel = isSelected({ target: role.name });
          return (
            <button
              key={role.name}
              type="button"
              onClick={() => handleRoleTap(role.name)}
              disabled={isApplying}
              data-testid={`planning-editor-role-${role.name}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] leading-tight whitespace-nowrap shadow ${
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

      {/* Bench drawer */}
      <div>
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
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => handleBenchTap(id)}
                    disabled={isApplying}
                    data-testid={`planning-editor-bench-${id}`}
                    className={`rounded-md px-3 py-1.5 text-sm shadow ${
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
        >
          <HiOutlineExclamationTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>{applyError}</p>
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
            : t('planningEditor.applyButton', 'Apply to {{count}} games', {
                count: gameIds.length,
              })}
        </button>
      </div>
    </div>
  );
};

export default PlanningEditor;
