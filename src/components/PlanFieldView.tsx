'use client';

/**
 * Playing-Time Planner — per-game lineup field (Phase 1, PR 1.3).
 *
 * A lightweight, native pitch for placing a game's starting XI. It reuses the
 * app's formation presets for slot geometry (via `getGameSlots`) but renders as
 * plain positioned DOM - deliberately NOT the canvas `SoccerField`, which is
 * built for free drag on the live game. Interaction is tap-to-assign: tap a
 * position to select it, then tap a bench player to place them (a player can
 * only hold one slot). Mobile-first and keyboard-accessible.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getGameSlots, ensureStartingSlots, benchPlayerIds } from '@/utils/playtimePlanner/lineup';
import { subtextStyle } from '@/styles/modalStyles';
import type { PlanGame, PlanPlayer, PlanSub } from '@/utils/playtimePlanner/types';
import type { FairnessBand } from '@/utils/playtimePlanner/minutes';

/** A player's cumulative planned minutes across the WHOLE plan + fairness band. */
export interface PlanPlayerMinutes {
  minutes: number;
  band: FairnessBand;
}

interface PlanFieldViewProps {
  game: PlanGame;
  players: PlanPlayer[];
  /** Assign (or clear with null) the given slot. */
  onAssign: (slotId: string, playerId: string | null) => void;
  /**
   * Optional live fairness read (cumulative minutes across the plan, keyed by
   * player id). When provided, bench chips and filled discs show each player's
   * total minutes tinted by band - so the coach sees the effect of a swap
   * WHILE editing instead of round-tripping to the balance view. Number +
   * colour together (never colour alone).
   */
  minutesByPlayer?: Record<string, PlanPlayerMinutes>;
}

/** Text tints matching the balance view's band colours (red/green/blue). */
const bandText: Record<FairnessBand, string> = {
  under: 'text-red-400',
  fair: 'text-green-400',
  over: 'text-sky-400',
  none: 'text-slate-400',
};

/** Short display token for a disc: nickname, else first name, else initials. */
const shortName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const first = trimmed.split(/\s+/)[0];
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
};

const PlanFieldView: React.FC<PlanFieldViewProps> = ({ game, players, onAssign, minutesByPlayer }) => {
  const { t } = useTranslation();
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  const slots = useMemo(() => getGameSlots(game.formationId), [game.formationId]);
  const assignments = useMemo(() => ensureStartingSlots(game), [game]);
  const nameById = useMemo(
    () => new Map(players.map((p) => [p.id, p.name])),
    [players],
  );
  const playerBySlot = useMemo(
    () => new Map(assignments.map((a) => [a.slotId, a.playerId])),
    [assignments],
  );
  const bench = useMemo(
    () => benchPlayerIds(players.map((p) => p.id), assignments),
    [players, assignments],
  );
  // Slots with no starter yet - autofill and quick-tap placement target these.
  const emptySlots = useMemo(
    () => slots.filter((s) => !playerBySlot.get(s.slotId)),
    [slots, playerBySlot],
  );
  // Fill outfield first and leave the goalkeeper for last, so a quick tap or
  // Auto-fill never silently turns an arbitrary bench player into the keeper.
  const emptyFillOrder = useMemo(
    () => [...emptySlots.filter((s) => !s.isGoalie), ...emptySlots.filter((s) => s.isGoalie)],
    [emptySlots],
  );
  // Planned subs grouped by the slot they come into, earliest first - drives the
  // on-pitch sub badges so a scheduled change is visible on the field, not just
  // in the list below.
  const subsBySlot = useMemo(() => {
    const m = new Map<string, PlanSub[]>();
    [...game.subs]
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
      .forEach((s) => {
        const arr = m.get(s.slotId) ?? [];
        arr.push(s);
        m.set(s.slotId, arr);
      });
    return m;
  }, [game.subs]);

  const activeOccupant = activeSlotId ? playerBySlot.get(activeSlotId) ?? null : null;

  const handleSlotClick = (slotId: string) => {
    setActiveSlotId((prev) => (prev === slotId ? null : slotId));
  };

  // Tap a bench player: fill the selected slot, or - with none selected - drop
  // them into the first empty slot so placement is always one tap.
  const handleBenchClick = (playerId: string) => {
    const target = activeSlotId ?? emptyFillOrder[0]?.slotId ?? null;
    if (!target) return;
    onAssign(target, playerId);
    setActiveSlotId(null);
  };

  // Fill every empty slot from the bench in order (a snapshot pairing, so it is
  // safe to fire onAssign per slot even though assignments update asynchronously).
  const handleAutoFill = () => {
    const pool = [...bench];
    emptyFillOrder.forEach((slot) => {
      const pick = pool.shift();
      if (pick) onAssign(slot.slotId, pick);
    });
    setActiveSlotId(null);
  };

  const handleClear = () => {
    if (!activeSlotId) return;
    onAssign(activeSlotId, null);
    setActiveSlotId(null);
  };

  return (
    <div className="space-y-4">
      {/* Pitch */}
      <div
        className="relative w-full max-w-sm mx-auto rounded-lg overflow-hidden border border-green-900/60 shadow-inner"
        style={{ aspectRatio: '3 / 4', background: 'linear-gradient(180deg,#15803d 0%,#166534 100%)' }}
      >
        {/* Field markings */}
        <div className="absolute inset-3 border-2 border-white/25 rounded" />
        <div className="absolute left-3 right-3 top-1/2 h-0.5 bg-white/25 -translate-y-1/2" />
        <div className="absolute left-1/2 top-1/2 w-16 h-16 border-2 border-white/25 rounded-full -translate-x-1/2 -translate-y-1/2" />

        {slots.map((slot, i) => {
          const playerId = playerBySlot.get(slot.slotId) ?? null;
          const name = playerId ? nameById.get(playerId) : null;
          const isActive = slot.slotId === activeSlotId;
          const filled = !!playerId;
          // 1-based human label (#1, #2, …); note `i` includes the GK at 0, so
          // field slot `s0` reads as `#1`. Intentional - friendlier than slotId.
          // GK shorthand is localized (fi coaches read "MV", not "GK").
          const positionLabel = slot.isGoalie ? t('playtimePlanner.gkShort', 'GK') : `#${i}`;
          const slotSubs = subsBySlot.get(slot.slotId) ?? [];
          const firstSub = slotSubs[0];
          const subInName = firstSub?.inPlayerId ? nameById.get(firstSub.inPlayerId) : null;
          return (
            <button
              key={slot.slotId}
              type="button"
              onClick={() => handleSlotClick(slot.slotId)}
              aria-label={
                filled
                  ? t('playtimePlanner.lineup.slotFilled', '{{position}}: {{player}}', {
                      position: positionLabel,
                      player: name ?? '',
                    })
                  : t('playtimePlanner.lineup.slotEmpty', '{{position}}: empty', {
                      position: positionLabel,
                    })
              }
              aria-pressed={isActive}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-1 focus-visible:ring-offset-green-800"
              style={{ left: `${slot.relX * 100}%`, top: `${slot.relY * 100}%` }}
            >
              <span
                className={[
                  'w-11 h-11 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors',
                  filled
                    ? slot.isGoalie
                      ? 'bg-amber-500 text-slate-900 border-amber-300'
                      : 'bg-indigo-600 text-white border-indigo-300'
                    : 'bg-slate-900/70 text-white border-dashed border-white/80',
                  isActive ? 'ring-2 ring-yellow-300 ring-offset-1 ring-offset-green-800' : '',
                ].join(' ')}
              >
                {filled ? shortName(name ?? '') : slot.isGoalie ? t('playtimePlanner.gkShort', 'GK') : '+'}
              </span>
              {filled && playerId && minutesByPlayer?.[playerId] && (
                <span
                  className={`mt-0.5 text-[10px] font-semibold tabular-nums leading-tight ${bandText[minutesByPlayer[playerId].band]}`}
                >
                  {minutesByPlayer[playerId].minutes}&#39;
                </span>
              )}
              {firstSub && (
                <span
                  className="mt-0.5 px-1 rounded-full bg-sky-600 text-white text-[8px] font-semibold leading-tight whitespace-nowrap max-w-[3.5rem] truncate shadow"
                  title={slotSubs
                    .map(
                      (s) =>
                        `${Math.round(s.timeSeconds / 60)}' ${s.inPlayerId ? nameById.get(s.inPlayerId) ?? '' : ''}`,
                    )
                    .join(', ')}
                >
                  ⇄ {Math.round(firstSub.timeSeconds / 60)}&#39;
                  {subInName ? ` ${shortName(subInName)}` : ''}
                  {slotSubs.length > 1 ? ` +${slotSubs.length - 1}` : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Assignment panel - the bench keeps one consistent look whether or not a
          slot is selected; only the hint and the Clear / Auto-fill actions adapt. */}
      <div className="max-w-sm mx-auto space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-slate-300">
            {activeSlotId
              ? t('playtimePlanner.lineup.pickForSlot', 'Tap a player for this position')
              : t('playtimePlanner.lineup.hint', 'Tap a player to place them, or a position first.')}
          </p>
          <div className="flex items-center gap-3 shrink-0">
            {activeSlotId && activeOccupant && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-red-400 hover:text-red-300 py-2.5 px-2 -my-2.5"
              >
                {t('playtimePlanner.lineup.clearSlot', 'Clear')}
              </button>
            )}
            {emptySlots.length > 0 && bench.length > 0 && (
              <button
                type="button"
                onClick={handleAutoFill}
                className="text-xs font-medium text-indigo-300 hover:text-indigo-200 py-2.5 px-2 -my-2.5"
              >
                {t('playtimePlanner.lineup.autoFill', 'Auto-fill')}
              </button>
            )}
          </div>
        </div>
        {bench.length === 0 ? (
          <p className={subtextStyle}>
            {t('playtimePlanner.lineup.benchEmpty', 'Everyone is on the field.')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bench.map((id) => {
              const fair = minutesByPlayer?.[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleBenchClick(id)}
                  className="px-3 py-1.5 rounded-full bg-slate-700 hover:bg-slate-600 text-sm text-white border border-slate-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  {nameById.get(id) ?? id}
                  {fair && (
                    <span className={`ml-1.5 tabular-nums text-xs font-semibold ${bandText[fair.band]}`}>
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

export default PlanFieldView;
