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
import { defaultSubTimeSeconds, makeSub } from '@/utils/playtimePlanner/subs';
import { fairnessText } from '@/utils/playtimePlanner/colors';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  sectionLabelStyle,
  subtextStyle,
  chipStyle,
  groupedListStyle,
  listRowStyle,
  dialogTitleStyle,
  Z_LAYER,
} from '@/styles/modalStyles';

/** The minute stepper's round 44px keys. */
const stepKeyStyle =
  'w-11 h-11 shrink-0 rounded-full s1-raised font-ui text-ink font-semibold leading-none transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
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

  const defaultMinute = Math.round(defaultSubTimeSeconds(game) / 60);
  // Cap strictly BELOW the final whistle: a sub at full time grants zero seconds
  // and would silently defeat the full-game bench alarm.
  const maxMinute = Math.max(1, game.numberOfPeriods * game.periodMinutes - 1);
  const [minute, setMinute] = useState(() => Math.min(maxMinute, Math.max(1, defaultMinute)));

  // ANY player may come on (rotations: two players trading a slot, a starter
  // re-entering after coming off). True bench players (appearing nowhere in
  // this game yet) list first; players already in the game follow under their
  // own label. Excluded: absentees, and whoever holds THIS slot at the chosen
  // minute - subbing a player in for themselves is the one true no-op (it
  // would render as "12' Alex in for Alex"). Impossible same-minutes overlaps
  // elsewhere are flagged by the lineup's conflict banner, not blocked here.
  const { benchIds, inGameIds } = useMemo(() => {
    const absent = new Set(game.absentIds ?? []);
    const appearing = new Set<string>();
    starting.forEach((a) => {
      if (a.playerId) appearing.add(a.playerId);
    });
    game.subs.forEach((sub) => {
      if (sub.inPlayerId) appearing.add(sub.inPlayerId);
    });
    // Walk THIS slot's schedule to find its occupant at the chosen minute.
    let occupantAtMinute = starting.find((a) => a.slotId === slotId)?.playerId ?? null;
    [...game.subs]
      .filter((sub) => sub.slotId === slotId && sub.timeSeconds <= minute * 60)
      .sort((a, b) => a.timeSeconds - b.timeSeconds)
      .forEach((sub) => {
        occupantAtMinute = sub.inPlayerId;
      });
    const ids = players
      .map((p) => p.id)
      .filter((id) => !absent.has(id) && id !== occupantAtMinute);
    return {
      benchIds: ids.filter((id) => !appearing.has(id)),
      inGameIds: ids.filter((id) => appearing.has(id)),
    };
  }, [players, starting, game.subs, game.absentIds, slotId, minute]);
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
      className={`fixed inset-0 ${Z_LAYER.modal} flex items-end justify-center bg-black/60`}
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
        className="w-full max-w-sm s1-sheet rounded-t-[26px] px-4 pt-3 pb-6 max-h-[80vh] overflow-y-auto font-ui focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" aria-hidden="true" />
        <h4 className={`${dialogTitleStyle} text-center`}>
          {t('playtimePlanner.subSheet.title', 'Substitution · {{position}} ({{player}})', {
            position: positionLabel,
            player: occupantName,
          })}
        </h4>

        {/* Minute stepper - pre-filled to half-time so the common case is zero edits. */}
        <p className={`${sectionLabelStyle} px-1 mt-5 mb-2.5`}>{t('playtimePlanner.subs.timeLabel', 'Minute')}</p>
        <div className="flex items-center justify-center gap-2 mb-1">
          <button
            type="button"
            onClick={() => step(-5)}
            aria-label="-5"
            className={`${stepKeyStyle} text-sm tabular-nums`}
          >
            −5
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="-1"
            className={`${stepKeyStyle} text-xl`}
          >
            −
          </button>
          <span className="s1-numeral min-w-[4.5rem] pr-[3px] text-center font-display text-[40px] font-bold italic leading-none tabular-nums">
            {minute}&#39;
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="+1"
            className={`${stepKeyStyle} text-xl`}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => step(5)}
            aria-label="+5"
            className={`${stepKeyStyle} text-sm tabular-nums`}
          >
            +5
          </button>
        </div>
        {/* Reserved line, so the grid below does not jump when the stepper
            leaves half-time. */}
        <p className={`${subtextStyle} text-center min-h-5 mb-4`}>
          {atHalftime ? t('playtimePlanner.subSheet.halftime', 'half-time') : null}
        </p>

        {/* Already-planned changes for this slot - removable in place. */}
        {onRemove && slotSubs.length > 0 && (
          <div className="mb-5">
            <p className={`${sectionLabelStyle} px-1 mb-2.5`}>
              {t('playtimePlanner.subSheet.existing', 'Planned for this position')}
            </p>
            <ul className={groupedListStyle}>
              {slotSubs.map((sub) => (
                <li
                  key={sub.id}
                  className={`${listRowStyle} justify-between`}
                >
                  <span className="min-w-0 truncate text-[15px] text-ink tabular-nums">
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
                    className="shrink-0 min-h-11 px-3 rounded-full text-sm font-semibold text-red-400 hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                  >
                    {t('playtimePlanner.subs.remove', 'Remove')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Live player grid: tap = create the sub. Tinted minutes make the fair
            pick obvious. Bench first; players already in this game follow under
            their own label (picking one plans a rotation / re-entry). */}
        <p className={`${sectionLabelStyle} px-1 mb-2.5`}>{t('playtimePlanner.subs.inLabel', 'Player on')}</p>
        {benchIds.length === 0 && inGameIds.length === 0 ? (
          <p className={`${subtextStyle} px-1`}>
            {t('playtimePlanner.subs.noBench', 'No bench players available.')}
          </p>
        ) : (
          <>
            {benchIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {benchIds.map((id) => {
                  const fair = minutesByPlayer?.[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => pick(id)}
                      className={`${chipStyle} min-h-11! text-ink!`}
                    >
                      {nameById.get(id) ?? id}
                      {fair && (
                        <span
                          className="text-xs font-semibold tabular-nums"
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
            {inGameIds.length > 0 && (
              <div className="mt-5">
                <p className={`${sectionLabelStyle} px-1 mb-2.5`}>
                  {t('playtimePlanner.subs.inGameGroup', 'Already in this game')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {inGameIds.map((id) => {
                    const fair = minutesByPlayer?.[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => pick(id)}
                        className={`${chipStyle} min-h-11! bg-transparent! shadow-none! border border-dashed border-white/25`}
                      >
                        {nameById.get(id) ?? id}
                        {fair && (
                          <span
                            className="text-xs font-semibold tabular-nums"
                            style={{ color: fairnessText(fair.ratio) }}
                          >
                            {fair.minutes}&#39;
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PlanSubSheet;
