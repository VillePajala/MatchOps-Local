'use client';

/**
 * Playing-Time Planner — per-game substitutions (Phase 1, PR 1.4).
 *
 * Schedules who comes on and when for one game. Each sub, at its minute, hands a
 * position to an incoming bench player (the starter comes off) - the exact shape
 * the minutes engine reads. Defaults to a single half-time swap window but the
 * minute is editable. Pure logic lives in `subs.ts`.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getGameSlots, ensureStartingSlots } from '@/utils/playtimePlanner/lineup';
import { subtextStyle } from '@/styles/modalStyles';
import type { PlanGame, PlanPlayer } from '@/utils/playtimePlanner/types';

interface PlanSubsEditorProps {
  game: PlanGame;
  players: PlanPlayer[];
  onRemove: (subId: string) => void;
}

const PlanSubsEditor: React.FC<PlanSubsEditorProps> = ({ game, players, onRemove }) => {
  const { t } = useTranslation();

  const slots = useMemo(() => getGameSlots(game.formationId), [game.formationId]);
  const starting = useMemo(() => ensureStartingSlots(game), [game]);
  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);

  // Localized goalkeeper shorthand (fi coaches read "MV", not "GK").
  const gkLabel = t('playtimePlanner.gkShort', 'GK');
  const positionLabel = useMemo(() => {
    const m = new Map<string, string>();
    slots.forEach((s, i) => m.set(s.slotId, s.isGoalie ? gkLabel : `#${i}`));
    return m;
  }, [slots, gkLabel]);
  const sortedSubs = [...game.subs].sort((a, b) => a.timeSeconds - b.timeSeconds);

  // Who comes OFF for each sub: walk the schedule in time order, tracking each
  // slot's occupant (a second sub on the same slot replaces the previous incoming
  // player, not the original starter). Without this the row "12' — Matti → #3"
  // read as Matti moving positions rather than a swap.
  const outNameBySubId = useMemo(() => {
    const occupant = new Map(starting.map((s) => [s.slotId, s.playerId]));
    const m = new Map<string, string | null>();
    for (const sub of [...game.subs].sort((a, b) => a.timeSeconds - b.timeSeconds)) {
      const outId = occupant.get(sub.slotId) ?? null;
      m.set(sub.id, outId ? (nameById.get(outId) ?? null) : null);
      occupant.set(sub.slotId, sub.inPlayerId);
    }
    return m;
  }, [game.subs, starting, nameById]);

  return (
    <div className="max-w-sm mx-auto space-y-3">
      <h4 className="text-lg font-semibold text-slate-200">{t('playtimePlanner.subs.heading', 'Substitutions')}</h4>

      {sortedSubs.length === 0 ? (
        <p className={subtextStyle}>{t('playtimePlanner.subs.none', 'No substitutions yet.')}</p>
      ) : (
        <ul className="space-y-1">
          {sortedSubs.map((sub) => {
            const inName = nameById.get(sub.inPlayerId ?? '') ?? '-';
            const pos = positionLabel.get(sub.slotId) ?? sub.slotId;
            const outName = outNameBySubId.get(sub.id) ?? null;
            return (
              <li
                key={sub.id}
                className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 rounded-md px-3 py-1.5 text-sm text-slate-200"
              >
                <span>
                  {outName
                    ? t('playtimePlanner.subs.rowInOut', "{{minute}}' {{player}} in for {{out}} ({{position}})", {
                        minute: Math.round(sub.timeSeconds / 60),
                        player: inName,
                        out: outName,
                        position: pos,
                      })
                    : t('playtimePlanner.subs.row', "{{minute}}' {{player}} in ({{position}})", {
                        minute: Math.round(sub.timeSeconds / 60),
                        player: inName,
                        position: pos,
                      })}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(sub.id)}
                  className="text-sm text-red-400 hover:text-red-300 ml-2 py-2 px-2 -my-1.5 -mr-2"
                >
                  {t('playtimePlanner.subs.remove', 'Remove')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Creation moved to the field: tap a filled disc, choose "Sub…" - the
          bottom sheet has the minute + a live bench grid. This list is for
          reviewing and removing what's scheduled. */}
    </div>
  );
};

export default PlanSubsEditor;
