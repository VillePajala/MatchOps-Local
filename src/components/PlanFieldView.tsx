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
import type { PlanGame, PlanPlayer } from '@/utils/playtimePlanner/types';

interface PlanFieldViewProps {
  game: PlanGame;
  players: PlanPlayer[];
  /** Assign (or clear with null) the given slot. */
  onAssign: (slotId: string, playerId: string | null) => void;
}

/** Short display token for a disc: nickname, else first name, else initials. */
const shortName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const first = trimmed.split(/\s+/)[0];
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
};

const PlanFieldView: React.FC<PlanFieldViewProps> = ({ game, players, onAssign }) => {
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

  const activeOccupant = activeSlotId ? playerBySlot.get(activeSlotId) ?? null : null;

  const handleSlotClick = (slotId: string) => {
    setActiveSlotId((prev) => (prev === slotId ? null : slotId));
  };

  const handleBenchClick = (playerId: string) => {
    if (!activeSlotId) return;
    onAssign(activeSlotId, playerId);
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
          const positionLabel = slot.isGoalie ? 'GK' : `#${i}`;
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
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center focus:outline-none"
              style={{ left: `${slot.relX * 100}%`, top: `${slot.relY * 100}%` }}
            >
              <span
                className={[
                  'w-11 h-11 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors',
                  filled
                    ? slot.isGoalie
                      ? 'bg-amber-500 text-slate-900 border-amber-300'
                      : 'bg-indigo-600 text-white border-indigo-300'
                    : 'bg-slate-900/40 text-white/70 border-dashed border-white/50',
                  isActive ? 'ring-2 ring-yellow-300 ring-offset-1 ring-offset-green-800' : '',
                ].join(' ')}
              >
                {filled ? shortName(name ?? '') : slot.isGoalie ? 'GK' : '+'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Assignment panel */}
      <div className="max-w-sm mx-auto">
        {activeSlotId ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-300">
                {t('playtimePlanner.lineup.pickForSlot', 'Tap a player for this position')}
              </p>
              {activeOccupant && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  {t('playtimePlanner.lineup.clearSlot', 'Clear')}
                </button>
              )}
            </div>
            {bench.length === 0 ? (
              <p className="text-xs text-slate-400">
                {t('playtimePlanner.lineup.benchEmpty', 'Everyone is on the field.')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {bench.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleBenchClick(id)}
                    className="px-3 py-1.5 rounded-full bg-slate-700 hover:bg-slate-600 text-sm text-white border border-slate-500/40"
                  >
                    {nameById.get(id) ?? id}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-400 mb-2">
              {t('playtimePlanner.lineup.hint', 'Tap a position to assign a player.')}
            </p>
            {bench.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1">
                  {t('playtimePlanner.lineup.benchHeading', 'Bench')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {bench.map((id) => (
                    <span
                      key={id}
                      className="px-3 py-1.5 rounded-full bg-slate-800/70 text-sm text-slate-300 border border-slate-700/50"
                    >
                      {nameById.get(id) ?? id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PlanFieldView;
