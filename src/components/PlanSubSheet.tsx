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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getGameSlots, ensureStartingSlots } from '@/utils/playtimePlanner/lineup';
import { availableSubInIds, defaultSubTimeSeconds, makeSub } from '@/utils/playtimePlanner/subs';
import { fairnessText } from '@/utils/playtimePlanner/colors';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { labelStyle } from '@/styles/modalStyles';
import type { PlanGame, PlanPlayer, PlanSub } from '@/utils/playtimePlanner/types';
import type { PlanPlayerMinutes } from '@/components/PlanFieldView';

interface PlanSubSheetProps {
  game: PlanGame;
  /** The slot receiving the substitution. */
  slotId: string;
  players: PlanPlayer[];
  minutesByPlayer?: Record<string, PlanPlayerMinutes>;
  onAdd: (sub: PlanSub) => void;
  /** Remove an already-scheduled sub for this slot (listed in the sheet). */
  onRemove?: (subId: string) => void;
  onClose: () => void;
}

const PlanSubSheet: React.FC<PlanSubSheetProps> = ({
  game,
  slotId,
  players,
  minutesByPlayer,
  onAdd,
  onRemove,
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

  // Subs already scheduled INTO this slot, earliest first - managed right here
  // so removing a planned change never requires hunting the list below the field.
  const slotSubs = useMemo(
    () => game.subs.filter((sub) => sub.slotId === slotId).sort((a, b) => a.timeSeconds - b.timeSeconds),
    [game.subs, slotId],
  );

  const benchIds = useMemo(() => {
    const absent = new Set(game.absentIds ?? []);
    return availableSubInIds(players.map((p) => p.id), starting, game.subs).filter(
      (id) => !absent.has(id),
    );
  }, [players, starting, game.subs, game.absentIds]);

  const defaultMinute = Math.round(defaultSubTimeSeconds(game) / 60);
  // Cap strictly BELOW the final whistle: a sub at full time grants zero seconds
  // and would silently defeat the full-game bench alarm.
  const maxMinute = Math.max(1, game.numberOfPeriods * game.periodMinutes - 1);
  const [minute, setMinute] = useState(() => Math.min(maxMinute, Math.max(1, defaultMinute)));
  const atHalftime = minute === defaultMinute && game.numberOfPeriods === 2;

  // Focus the dialog ONCE on mount (an inline callback ref re-fired on every
  // render, yanking focus off the minute stepper after each press) and hand
  // focus back to the opener on close.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => opener?.focus();
  }, []);
  // House modal behaviour: Tab cycles inside the sheet and the app behind goes
  // inert - without this, keyboard focus could wander into the backdrop.
  useFocusTrap(dialogRef, true);

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
        className="w-full max-w-sm bg-slate-800 border border-slate-600 border-b-0 rounded-t-2xl p-4 pb-6 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="w-9 h-1 rounded-full bg-slate-600 mx-auto mb-3" aria-hidden="true" />
        <h4 className="text-base font-semibold text-slate-100">
          {t('playtimePlanner.subSheet.title', 'Substitution · {{position}} ({{player}})', {
            position: positionLabel,
            player: occupantName,
          })}
        </h4>

        {/* Minute stepper - pre-filled to half-time so the common case is zero edits. */}
        <div className="flex items-center gap-2 mt-3 mb-3">
          <span className={labelStyle}>{t('playtimePlanner.subs.timeLabel', 'Minute')}</span>
          <button
            type="button"
            onClick={() => step(-5)}
            aria-label="-5"
            className="w-9 h-9 rounded-md bg-slate-700 border border-slate-600 text-slate-100 text-xs font-semibold leading-none hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            −5
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="-1"
            className="w-9 h-9 rounded-md bg-slate-700 border border-slate-600 text-slate-100 text-lg leading-none hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
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
            className="w-9 h-9 rounded-md bg-slate-700 border border-slate-600 text-slate-100 text-lg leading-none hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => step(5)}
            aria-label="+5"
            className="w-9 h-9 rounded-md bg-slate-700 border border-slate-600 text-slate-100 text-xs font-semibold leading-none hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            +5
          </button>
          {atHalftime && (
            <span className="text-xs text-slate-400">
              {t('playtimePlanner.subSheet.halftime', 'half-time')}
            </span>
          )}
        </div>

        {/* Already-planned changes for this slot - removable in place. */}
        {onRemove && slotSubs.length > 0 && (
          <div className="mb-3">
            <p className={`${labelStyle} mb-1.5`}>
              {t('playtimePlanner.subSheet.existing', 'Planned for this position')}
            </p>
            <ul className="space-y-1.5">
              {slotSubs.map((sub) => (
                <li
                  key={sub.id}
                  className="flex items-center justify-between gap-2 bg-slate-800/40 border border-slate-700/50 rounded-md px-3 py-1.5"
                >
                  <span className="text-sm text-slate-100 tabular-nums">
                    {Math.round(sub.timeSeconds / 60)}&#39;{' '}
                    {sub.inPlayerId ? nameById.get(sub.inPlayerId) ?? sub.inPlayerId : '?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onRemove(sub.id);
                      // The clicked button unmounts with its row, dropping focus
                      // to <body> - outside BOTH traps, so the next Tab could
                      // land in the parent modal while this sheet is still open.
                      // Park focus back on the sheet dialog instead.
                      dialogRef.current?.focus();
                    }}
                    className="text-sm text-red-400 hover:text-red-300 py-2 px-2"
                  >
                    {t('playtimePlanner.subs.remove', 'Remove')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Live bench grid: tap = create the sub. Tinted minutes make the fair pick obvious. */}
        <p className={`${labelStyle} mb-1.5`}>{t('playtimePlanner.subs.inLabel', 'Player on')}</p>
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

export default PlanSubSheet;
