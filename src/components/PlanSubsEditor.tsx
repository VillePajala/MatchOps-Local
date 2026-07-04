'use client';

/**
 * Playing-Time Planner — per-game substitutions (Phase 1, PR 1.4).
 *
 * Schedules who comes on and when for one game. Each sub, at its minute, hands a
 * position to an incoming bench player (the starter comes off) - the exact shape
 * the minutes engine reads. Defaults to a single half-time swap window but the
 * minute is editable. Pure logic lives in `subs.ts`.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getGameSlots, ensureStartingSlots } from '@/utils/playtimePlanner/lineup';
import {
  defaultSubTimeSeconds,
  makeSub,
  availableSubInIds,
} from '@/utils/playtimePlanner/subs';
import { labelStyle, subtextStyle, inputBaseStyle, selectStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import type { PlanGame, PlanPlayer, PlanSub } from '@/utils/playtimePlanner/types';

interface PlanSubsEditorProps {
  game: PlanGame;
  players: PlanPlayer[];
  onAdd: (sub: PlanSub) => void;
  onRemove: (subId: string) => void;
}

const PlanSubsEditor: React.FC<PlanSubsEditorProps> = ({ game, players, onAdd, onRemove }) => {
  const { t } = useTranslation();

  const slots = useMemo(() => getGameSlots(game.formationId), [game.formationId]);
  const starting = useMemo(() => ensureStartingSlots(game), [game]);
  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);

  const positionLabel = useMemo(() => {
    const m = new Map<string, string>();
    slots.forEach((s, i) => m.set(s.slotId, s.isGoalie ? 'GK' : `#${i}`));
    return m;
  }, [slots]);
  const starterBySlot = useMemo(
    () => new Map(starting.map((s) => [s.slotId, s.playerId])),
    [starting],
  );

  // Slots that have a starter - the meaningful targets to swap out.
  const filledSlots = useMemo(
    () => starting.filter((s) => s.playerId !== null),
    [starting],
  );

  const rosterIds = useMemo(() => players.map((p) => p.id), [players]);

  const defaultMinute = Math.round(defaultSubTimeSeconds(game) / 60);
  // A sub can't sensibly happen after the final whistle; cap the minute input at
  // the game length (the engine also clamps, but this gives the coach a clear bound).
  const maxMinute = Math.max(1, game.numberOfPeriods * game.periodMinutes);
  const [slotId, setSlotId] = useState('');
  const [inPlayerId, setInPlayerId] = useState('');
  const [minute, setMinute] = useState(defaultMinute);

  const benchIds = availableSubInIds(rosterIds, starting, game.subs);

  const canAdd = slotId !== '' && inPlayerId !== '';

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd(makeSub(slotId, inPlayerId, Math.max(0, minute) * 60));
    setInPlayerId('');
    setSlotId('');
    setMinute(defaultMinute);
  };

  const sortedSubs = [...game.subs].sort((a, b) => a.timeSeconds - b.timeSeconds);

  return (
    <div className="max-w-sm mx-auto space-y-3">
      <h4 className={labelStyle}>{t('playtimePlanner.subs.heading', 'Substitutions')}</h4>

      {sortedSubs.length === 0 ? (
        <p className={subtextStyle}>{t('playtimePlanner.subs.none', 'No substitutions yet.')}</p>
      ) : (
        <ul className="space-y-1">
          {sortedSubs.map((sub) => {
            const inName = nameById.get(sub.inPlayerId ?? '') ?? '-';
            const pos = positionLabel.get(sub.slotId) ?? sub.slotId;
            return (
              <li
                key={sub.id}
                className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 rounded px-3 py-1.5 text-sm text-slate-200"
              >
                <span>
                  {t('playtimePlanner.subs.row', "{{minute}}' — {{player}} → {{position}}", {
                    minute: Math.round(sub.timeSeconds / 60),
                    player: inName,
                    position: pos,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(sub.id)}
                  className="text-xs text-red-400 hover:text-red-300 ml-2"
                >
                  {t('playtimePlanner.subs.remove', 'Remove')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add form */}
      {filledSlots.length === 0 ? (
        <p className={subtextStyle}>{t('playtimePlanner.subs.noSlots', 'Place your starters first.')}</p>
      ) : benchIds.length === 0 ? (
        <p className={subtextStyle}>{t('playtimePlanner.subs.noBench', 'No bench players available.')}</p>
      ) : (
        <div className="space-y-2 bg-slate-900/40 border border-slate-700/50 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={subtextStyle}>{t('playtimePlanner.subs.slotLabel', 'Position')}</label>
              <select value={slotId} onChange={(e) => setSlotId(e.target.value)} className={selectStyle}>
                <option value="">{t('playtimePlanner.subs.choose', 'Choose…')}</option>
                {filledSlots.map((s) => {
                  const starterId = starterBySlot.get(s.slotId);
                  const starterName = starterId ? nameById.get(starterId) : '';
                  return (
                    <option key={s.slotId} value={s.slotId}>
                      {positionLabel.get(s.slotId)}
                      {starterName ? ` (${starterName})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className={subtextStyle}>{t('playtimePlanner.subs.inLabel', 'Player on')}</label>
              <select value={inPlayerId} onChange={(e) => setInPlayerId(e.target.value)} className={selectStyle}>
                <option value="">{t('playtimePlanner.subs.choose', 'Choose…')}</option>
                {benchIds.map((id) => (
                  <option key={id} value={id}>
                    {nameById.get(id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-24">
              <label className={subtextStyle}>{t('playtimePlanner.subs.timeLabel', 'Minute')}</label>
              <input
                type="number"
                min={0}
                max={maxMinute}
                value={minute}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setMinute(Math.max(0, Math.min(maxMinute, Math.floor(Number(e.target.value) || 0))))}
                className={inputBaseStyle}
              />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd}
              className={`${secondaryButtonStyle} flex-1`}
            >
              {t('playtimePlanner.subs.add', 'Add substitution')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanSubsEditor;
