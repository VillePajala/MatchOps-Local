'use client';

/**
 * Playing-Time Planner — bottom-sheet substitution creator.
 *
 * The standalone planner's sub flow, ported: tap a filled disc, choose "Sub…",
 * and this sheet slides up with the minute pre-filled to half-time and a LIVE
 * bench grid - every candidate as a tappable chip carrying their ramp-tinted
 * cumulative minutes, so the fair choice is self-evident. Tapping a player
 * creates the sub and closes the sheet. Replaces the old three-dropdown form.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getGameSlots, ensureStartingSlots } from '@/utils/playtimePlanner/lineup';
import { availableSubInIds, defaultSubTimeSeconds, makeSub } from '@/utils/playtimePlanner/subs';
import { fairnessText } from '@/utils/playtimePlanner/colors';
import type { PlanGame, PlanPlayer, PlanSub } from '@/utils/playtimePlanner/types';
import type { PlanPlayerMinutes } from '@/components/PlanFieldView';

interface PlanSubSheetProps {
  game: PlanGame;
  /** The slot receiving the substitution. */
  slotId: string;
  players: PlanPlayer[];
  minutesByPlayer?: Record<string, PlanPlayerMinutes>;
  onAdd: (sub: PlanSub) => void;
  onClose: () => void;
}

const PlanSubSheet: React.FC<PlanSubSheetProps> = ({
  game,
  slotId,
  players,
  minutesByPlayer,
  onAdd,
  onClose,
}) => {
  const { t } = useTranslation();

  const slots = useMemo(() => getGameSlots(game.formationId), [game.formationId]);
  const starting = useMemo(() => ensureStartingSlots(game), [game]);
  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);

  const slotIndex = slots.findIndex((s) => s.slotId === slotId);
  const slot = slotIndex >= 0 ? slots[slotIndex] : null;
  const positionLabel = slot?.isGoalie ? t('playtimePlanner.gkShort', 'GK') : `#${slotIndex}`;
  const occupantId = starting.find((a) => a.slotId === slotId)?.playerId ?? null;
  const occupantName = occupantId ? nameById.get(occupantId) ?? occupantId : '';

  const benchIds = useMemo(
    () => availableSubInIds(players.map((p) => p.id), starting, game.subs),
    [players, starting, game.subs],
  );

  const defaultMinute = Math.round(defaultSubTimeSeconds(game) / 60);
  const maxMinute = Math.max(1, game.numberOfPeriods * game.periodMinutes);
  const [minute, setMinute] = useState(() => Math.min(maxMinute, Math.max(1, defaultMinute)));
  const atHalftime = minute === defaultMinute && game.numberOfPeriods === 2;

  const step = (delta: number) =>
    setMinute((m) => Math.min(maxMinute, Math.max(1, m + delta)));

  const pick = (playerId: string) => {
    onAdd(makeSub(slotId, playerId, minute * 60));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
      onClick={onClose}
      data-testid="plan-sub-sheet-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('playtimePlanner.subSheet.title', 'Substitution · {{position}} ({{player}})', {
          position: positionLabel,
          player: occupantName,
        })}
        className="w-full max-w-sm bg-slate-900 border border-slate-700 border-b-0 rounded-t-2xl p-4 pb-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-9 h-1 rounded-full bg-slate-600 mx-auto mb-3" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-slate-100">
          {t('playtimePlanner.subSheet.title', 'Substitution · {{position}} ({{player}})', {
            position: positionLabel,
            player: occupantName,
          })}
        </h4>

        {/* Minute stepper - pre-filled to half-time so the common case is zero edits. */}
        <div className="flex items-center gap-2 mt-3 mb-3">
          <span className="text-xs text-slate-400 uppercase tracking-wide">
            {t('playtimePlanner.subs.timeLabel', 'Minute')}
          </span>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="-1"
            className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-lg leading-none"
          >
            −
          </button>
          <span className="min-w-[2.6rem] text-center text-lg font-bold text-slate-50 tabular-nums">
            {minute}&#39;
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="+1"
            className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-lg leading-none"
          >
            +
          </button>
          {atHalftime && (
            <span className="text-xs text-slate-400">
              {t('playtimePlanner.subSheet.halftime', 'half-time')}
            </span>
          )}
        </div>

        {/* Live bench grid: tap = create the sub. Tinted minutes make the fair pick obvious. */}
        <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1.5">
          {t('playtimePlanner.subs.inLabel', 'Player on')}
        </p>
        {benchIds.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t('playtimePlanner.subs.noBench', 'No bench players available.')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {benchIds.map((id) => {
              const fair = minutesByPlayer?.[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => pick(id)}
                  className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-indigo-600 border border-slate-600 text-sm font-medium text-slate-100"
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

export default PlanSubSheet;
