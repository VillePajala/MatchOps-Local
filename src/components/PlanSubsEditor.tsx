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
import { subtextStyle, sectionLabelStyle, groupedListStyle, listRowStyle } from '@/styles/modalStyles';
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
  const sortedSubs = useMemo(
    () => [...game.subs].sort((a, b) => a.timeSeconds - b.timeSeconds),
    [game.subs],
  );

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
    <div className="max-w-sm mx-auto font-ui">
      <h4 className={`${sectionLabelStyle} px-1 mb-2.5`}>{t('playtimePlanner.subs.heading', 'Substitutions')}</h4>

      {sortedSubs.length === 0 ? (
        <p className={`${subtextStyle} px-1`}>{t('playtimePlanner.subs.none', 'No substitutions yet.')}</p>
      ) : (
        <ul className={groupedListStyle}>
          {sortedSubs.map((sub) => {
            const inName = nameById.get(sub.inPlayerId ?? '') ?? '-';
            const pos = positionLabel.get(sub.slotId) ?? sub.slotId;
            const outName = outNameBySubId.get(sub.id) ?? null;
            return (
              <li
                key={sub.id}
                className={`${listRowStyle} justify-between text-[15px] text-ink-2`}
              >
                <span className="min-w-0 py-2">
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
                  className="shrink-0 min-h-11 px-3 rounded-full font-ui text-sm font-semibold text-red-400 hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
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
