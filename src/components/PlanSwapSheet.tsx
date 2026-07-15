'use client';

/**
 * Playing-Time Planner — bottom-sheet player swap.
 *
 * Tap a filled disc, choose "Swap…", and this sheet slides up. Picking a
 * target trades the two players' ENTIRE timelines within the game - every
 * kickoff slot and every sub row naming either player (see swap.ts). A slot
 * with a planned rotation holds several identities (starter + incomers), so
 * the sheet first asks WHICH of them to swap when there is more than one.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getGameSlots } from '@/utils/playtimePlanner/lineup';
import { slotTimelinePlayers } from '@/utils/playtimePlanner/swap';
import { fairnessText } from '@/utils/playtimePlanner/colors';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { labelStyle } from '@/styles/modalStyles';
import type { PlanGame, PlanPlayer } from '@/utils/playtimePlanner/types';
import type { PlanPlayerMinutes } from '@/components/PlanFieldView';

interface PlanSwapSheetProps {
  game: PlanGame;
  /** The slot the swap was opened from (supplies the source candidates). */
  slotId: string;
  players: PlanPlayer[];
  minutesByPlayer?: Record<string, PlanPlayerMinutes>;
  /** Apply the whole-game swap of the two players. */
  onSwap: (playerAId: string, playerBId: string) => void;
  onClose: () => void;
}

const PlanSwapSheet: React.FC<PlanSwapSheetProps> = ({
  game,
  slotId,
  players,
  minutesByPlayer,
  onSwap,
  onClose,
}) => {
  const { t } = useTranslation();

  const slots = useMemo(() => getGameSlots(game.formationId), [game.formationId]);
  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);

  const slotIndex = slots.findIndex((s) => s.slotId === slotId);
  const slot = slotIndex >= 0 ? slots[slotIndex] : null;
  const positionLabel = slot?.isGoalie ? t('playtimePlanner.gkShort', 'GK') : `#${slotIndex}`;

  // Who can be the SOURCE: everyone holding this slot at some point (starter
  // first, then incomers in time order). Preselect the starter.
  const sourceEntries = useMemo(() => slotTimelinePlayers(game, slotId), [game, slotId]);
  const [sourceId, setSourceId] = useState<string | null>(sourceEntries[0]?.playerId ?? null);

  // Targets: the whole roster except the source and this game's absentees -
  // swapping with an unplaced player is a deliberate "replace everywhere".
  const targetIds = useMemo(() => {
    const absent = new Set(game.absentIds ?? []);
    return players.map((p) => p.id).filter((id) => id !== sourceId && !absent.has(id));
  }, [players, game.absentIds, sourceId]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => opener?.focus();
  }, []);
  useFocusTrap(dialogRef, true);

  const pick = (targetId: string) => {
    if (!sourceId) return;
    onSwap(sourceId, targetId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
      onClick={onClose}
      data-testid="plan-swap-sheet-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('playtimePlanner.swapSheet.title', 'Swap players · {{position}}', {
          position: positionLabel,
        })}
        className="w-full max-w-sm bg-slate-800 border border-slate-600 border-b-0 rounded-t-2xl p-4 pb-6 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="w-9 h-1 rounded-full bg-slate-600 mx-auto mb-3" aria-hidden="true" />
        <h4 className="text-base font-semibold text-slate-100">
          {t('playtimePlanner.swapSheet.title', 'Swap players · {{position}}', {
            position: positionLabel,
          })}
        </h4>
        <p className="text-xs text-slate-400 mt-1 mb-3">
          {t(
            'playtimePlanner.swapSheet.hint',
            'Trades every appearance of the two players in this game (lineup and substitutions).',
          )}
        </p>

        {/* Source picker - only when the slot's rotation holds several players
            (e.g. the starter vs the 25' incomer). */}
        {sourceEntries.length > 1 && (
          <div className="mb-3">
            <p className={`${labelStyle} mb-1.5`}>
              {t('playtimePlanner.swapSheet.who', 'Swap who?')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sourceEntries.map((entry) => {
                const selected = entry.playerId === sourceId;
                return (
                  <button
                    key={`${entry.playerId}-${entry.fromSeconds}`}
                    type="button"
                    onClick={() => setSourceId(entry.playerId)}
                    aria-pressed={selected}
                    className={`px-3 py-1.5 rounded-full border text-sm font-medium ${
                      selected
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'bg-slate-700 border-slate-500/40 text-slate-100 hover:bg-slate-600'
                    }`}
                  >
                    {nameById.get(entry.playerId) ?? entry.playerId}
                    <span className="ml-1.5 text-xs text-slate-300 tabular-nums">
                      {Math.round(entry.fromSeconds / 60)}&#39;
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className={`${labelStyle} mb-1.5`}>
          {t('playtimePlanner.swapSheet.withLabel', 'Swap with')}
        </p>
        {targetIds.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t('playtimePlanner.swapSheet.noTargets', 'No other players in this plan.')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {targetIds.map((id) => {
              const fair = minutesByPlayer?.[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => pick(id)}
                  className="px-3 py-1.5 rounded-full bg-slate-700 hover:bg-indigo-600 border border-slate-500/40 text-sm font-medium text-slate-100"
                >
                  {nameById.get(id) ?? id}
                  {fair && (
                    <span
                      className="ml-1.5 text-xs font-semibold tabular-nums"
                      style={{ color: fairnessText(fair.ratio) }}
                    >
                      {fair.minutes}&#39;
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanSwapSheet;
