'use client';

/**
 * Playing-Time Planner — per-game lineup field (Phase 1, PR 1.3).
 *
 * A lightweight, native pitch for placing a game's starting XI. It reuses the
 * app's formation presets for slot geometry (via `getGameSlots`) but renders as
 * plain positioned DOM - deliberately NOT the canvas `SoccerField`, which is
 * built for free drag on the live game. Interaction is DIRECT MANIPULATION:
 * every placement (a disc, or each stint segment of a rotation pill) is its
 * own tap target. Tap one placement then another and the two players trade
 * their whole-game timelines; tap a player then an empty spot to move them;
 * tap a stint then a bench disc to hand the stint over (or its own empty
 * kickoff spot to promote the incomer to starter); Clear empties a position
 * including its subs, Clear field empties everything. Bench tap still fills
 * the selected (or first empty) spot. Mobile-first and keyboard-accessible.
 *
 * When `minutesByPlayer` is provided, the field doubles as the balance view:
 * every disc is FILLED with the player's fairness colour (one red→green ramp,
 * standalone-planner style) with a white border so it never blends into the
 * grass, and a slot with scheduled subs stretches into a divided pill - one
 * segment per time window ("Onni | 12' Eino"), each tinted by its own player's
 * ramp colour. Colour never stands alone: the minutes number is always printed.
 */

import React, { useMemo, useState } from 'react';
import { HiChevronDown } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { getGameSlots, ensureStartingSlots, benchPlayerIds } from '@/utils/playtimePlanner/lineup';
import { fairnessFill, fairnessText } from '@/utils/playtimePlanner/colors';
import { findSimultaneityConflicts, conflictedSlotIds } from '@/utils/playtimePlanner/conflicts';
import { subtextStyle, primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle } from '@/styles/modalStyles';
import { gameTotalSeconds, type PlanGame, type PlanPlayer, type PlanSub } from '@/utils/playtimePlanner/types';

/** A player's cumulative planned minutes across the WHOLE plan + fair-share ratio. */
export interface PlanPlayerMinutes {
  minutes: number;
  /** totalSeconds / fairShareSeconds; null when no field time exists yet. */
  ratio: number | null;
}

interface PlanFieldViewProps {
  game: PlanGame;
  players: PlanPlayer[];
  /** Assign (or clear with null) the given slot. */
  onAssign: (slotId: string, playerId: string | null) => void;
  /**
   * Optional live fairness read (cumulative minutes across the plan, keyed by
   * player id). When provided, discs fill with the ramp colour and bench chips
   * show tinted totals - the effect of a swap is visible WHILE editing.
   */
  minutesByPlayer?: Record<string, PlanPlayerMinutes>;
  /**
   * Highlight players everywhere (their discs/chips ringed, everyone else
   * dimmed) - the cross-surface "track these kids" primitive. Empty = none.
   */
  highlightPlayerIds?: readonly string[];
  /**
   * Open the substitution sheet for a slot (shown as a "Sub…" action when a
   * filled slot is selected). Omit to hide the action (read-only embeds).
   */
  onRequestSub?: (slotId: string) => void;
  /**
   * Direct-manipulation swap: tap one placement (disc or pill segment), tap
   * another, and the two players trade their ENTIRE game timelines (see
   * swap.ts). Omit to disable tap-to-swap (read-only embeds).
   */
  onSwapPlayers?: (playerAId: string, playerBId: string) => void;
  /** Empty ONE position completely (starter + its scheduled subs). */
  onClearSlot?: (slotId: string) => void;
  /** Empty EVERY position (all starters + the whole sub schedule). */
  onClearAll?: () => void;
  /** Remove one scheduled sub (per-stint delete from the field). */
  onRemoveSub?: (subId: string) => void;
  /** Move one scheduled sub to another (starter-empty) position. */
  onMoveSub?: (subId: string, slotId: string) => void;
  /** Promote a scheduled incomer to kickoff starter of their own slot (one
   *  atomic plan update: assign starter + remove the sub row). */
  onPromoteSub?: (subId: string, slotId: string, playerId: string) => void;
  /** Change WHO one scheduled sub brings on (bench tap with a stint selected). */
  onSetSubPlayer?: (subId: string, playerId: string) => void;
  /** Toggle a player's absence for THIS game. Omit to hide the section. */
  onToggleAbsent?: (playerId: string) => void;
  /** Controlled fold-out state for the absence section (lifted in the
   *  single-game layout so it survives per-game remounts). */
  absenceOpen?: boolean;
  onToggleAbsenceOpen?: () => void;
}

/** Short display token for a disc: nickname, else first name, else initials. */
const shortName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const first = trimmed.split(/\s+/)[0];
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
};

const PlanFieldView: React.FC<PlanFieldViewProps> = ({
  game,
  players,
  onAssign,
  minutesByPlayer,
  highlightPlayerIds = [],
  onRequestSub,
  onSwapPlayers,
  onClearSlot,
  onClearAll,
  onRemoveSub,
  onMoveSub,
  onPromoteSub,
  onSetSubPlayer,
  onToggleAbsent,
  absenceOpen,
  onToggleAbsenceOpen,
}) => {
  const { t } = useTranslation();
  // Direct-manipulation selection: a tapped placement - either a position's
  // kickoff spot ('slot': its starter, or the empty spot itself) or one
  // scheduled stint of a rotation pill ('sub'). Tapping a second placement
  // SWAPS the two players' whole-game timelines; tapping an empty spot MOVES
  // the selected player/stint there; tapping a bench disc fills/replaces.
  type FieldSelection =
    | { type: 'slot'; slotId: string }
    | { type: 'sub'; slotId: string; subId: string; playerId: string | null };
  const [selection, setSelection] = useState<FieldSelection | null>(null);
  const [showAbsenceLocal, setShowAbsenceLocal] = useState(false);
  const showAbsence = absenceOpen ?? showAbsenceLocal;
  const toggleAbsenceOpen = onToggleAbsenceOpen ?? (() => setShowAbsenceLocal((v) => !v));
  const absentSet = useMemo(() => new Set(game.absentIds ?? []), [game.absentIds]);

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
  // Absent players are not substitution candidates - they get their own
  // section instead of bench discs.
  const bench = useMemo(
    () => benchPlayerIds(players.map((p) => p.id), assignments).filter((id) => !absentSet.has(id)),
    [players, assignments, absentSet],
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
  // divided pill so a scheduled change is visible on the field itself.
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

  const selectedSlotId = selection?.slotId ?? null;
  const activeOccupant =
    selection?.type === 'slot' ? playerBySlot.get(selection.slotId) ?? null : null;
  /** The player identity the current selection carries (null for empty spots). */
  const selectedPlayerId: string | null =
    selection === null ? null : selection.type === 'sub' ? selection.playerId : activeOccupant;
  const selectedSlotSubs = selectedSlotId ? subsBySlot.get(selectedSlotId) ?? [] : [];

  // Impossible same-minutes overlaps (a player in two slots at once). The
  // planner allows any schedule - rotations, re-entries - and FLAGS the ones
  // that cannot happen on a real pitch instead of blocking edits up front.
  const conflicts = useMemo(() => findSimultaneityConflicts(game), [game]);
  const conflictSlots = useMemo(() => conflictedSlotIds(conflicts), [conflicts]);

  // Bench players scheduled to come on in THIS game; the rest sit out the whole
  // game - flagged with a red border so a full-game benching is never an accident.
  // A sub at (or past) the final whistle grants zero seconds and must not
  // silence the alarm.
  const totalSeconds = gameTotalSeconds(game);
  const enteringIds = useMemo(
    () =>
      new Set(
        game.subs
          .filter((s) => s.timeSeconds < totalSeconds)
          .map((s) => s.inPlayerId)
          .filter((id): id is string => id !== null),
      ),
    [game.subs, totalSeconds],
  );

  // The ramp only makes sense with minutes data; without it the classic
  // indigo/amber discs render (read-only embeds stay untouched).
  const rampMode = !!minutesByPlayer;
  const fillFor = (playerId: string | null): string | undefined => {
    if (!rampMode || !playerId) return undefined;
    return fairnessFill(minutesByPlayer?.[playerId]?.ratio ?? null);
  };

  // Highlight primitive: with any highlight active, everything NOT involving
  // those players drops back; their own discs/chips get an amber ring.
  const anyHighlight = highlightPlayerIds.length > 0;
  const isTracked = (playerId: string | null): boolean =>
    playerId !== null && highlightPlayerIds.includes(playerId);
  const dimClass = (involved: boolean): string =>
    anyHighlight ? (involved ? '' : 'opacity-40') : '';
  const hlRing = (involved: boolean): string =>
    anyHighlight && involved ? 'ring-2 ring-amber-300 ring-offset-1 ring-offset-green-800' : '';

  // Tap a position's kickoff spot (a plain disc, or the first pill segment).
  const handleStarterClick = (slotId: string) => {
    if (selection?.type === 'slot' && selection.slotId === slotId) {
      setSelection(null); // tap the selection again = deselect
      return;
    }
    const targetPlayer = playerBySlot.get(slotId) ?? null;
    if (selection && selectedPlayerId && targetPlayer && selectedPlayerId !== targetPlayer && onSwapPlayers) {
      onSwapPlayers(selectedPlayerId, targetPlayer); // two players tapped = swap
      setSelection(null);
      return;
    }
    if (selection && selectedPlayerId && !targetPlayer) {
      // Selected player onto an empty spot = move there. A stint tapped onto
      // ITS OWN slot's empty kickoff spot promotes the incomer to starter.
      if (selection.type === 'sub' && selection.slotId === slotId) {
        onPromoteSub?.(selection.subId, slotId, selectedPlayerId);
      } else if (selection.type === 'sub') {
        onMoveSub?.(selection.subId, slotId);
      } else {
        onAssign(slotId, selectedPlayerId); // assignPlayerToSlot vacates the old slot
      }
      setSelection(null);
      return;
    }
    setSelection({ type: 'slot', slotId });
  };

  // Tap one scheduled stint of a rotation pill.
  const handleSubSegmentClick = (slotId: string, sub: PlanSub) => {
    if (selection?.type === 'sub' && selection.subId === sub.id) {
      setSelection(null);
      return;
    }
    if (selection && selectedPlayerId && sub.inPlayerId && selectedPlayerId !== sub.inPlayerId && onSwapPlayers) {
      onSwapPlayers(selectedPlayerId, sub.inPlayerId);
      setSelection(null);
      return;
    }
    setSelection({ type: 'sub', slotId, subId: sub.id, playerId: sub.inPlayerId });
  };

  // Tap a bench player: with a stint selected, they take over that stint; with
  // a position selected (or none), fill it (or the first empty spot) at kickoff.
  const handleBenchClick = (playerId: string) => {
    if (selection?.type === 'sub' && onSetSubPlayer) {
      onSetSubPlayer(selection.subId, playerId);
      setSelection(null);
      return;
    }
    const target = (selection?.type === 'slot' ? selection.slotId : null) ?? emptyFillOrder[0]?.slotId ?? null;
    if (!target) return;
    onAssign(target, playerId);
    setSelection(null);
  };

  // Fill every empty slot from the bench in order (a snapshot pairing, so it is
  // safe to fire onAssign per slot even though assignments update asynchronously).
  const handleAutoFill = () => {
    const pool = [...bench];
    emptyFillOrder.forEach((slot) => {
      const pick = pool.shift();
      if (pick) onAssign(slot.slotId, pick);
    });
    setSelection(null);
  };

  // Empty the selected position completely: starter AND its scheduled subs.
  // No partial fallback: the button only renders when onClearSlot is wired,
  // so "Clear" can never mean two different things.
  const handleClearSlot = () => {
    if (!selectedSlotId || !onClearSlot) return;
    onClearSlot(selectedSlotId);
    setSelection(null);
  };

  const handleRemoveSelectedSub = () => {
    if (selection?.type !== 'sub' || !onRemoveSub) return;
    onRemoveSub(selection.subId);
    setSelection(null);
  };

  const handleClearAll = () => {
    onClearAll?.();
    setSelection(null);
  };

  // Anything to clear at all (drives the whole-field Tyhjennä button).
  const anyPlacement = assignments.some((a) => a.playerId !== null) || game.subs.length > 0;

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
        {/* Goal mouths, drawn beyond each goal line (own goal at the bottom,
            where the GK stands). */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 top-[3px] h-[9px] w-14 border-2 border-b-0 border-white/40 rounded-t-sm"
        />
        <div
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 bottom-[3px] h-[9px] w-14 border-2 border-t-0 border-white/40 rounded-b-sm"
        />

        {slots.map((slot, i) => {
          const playerId = playerBySlot.get(slot.slotId) ?? null;
          const name = playerId ? nameById.get(playerId) : null;
          const filled = !!playerId;
          // 1-based human label (#1, #2, …); note `i` includes the GK at 0, so
          // field slot `s0` reads as `#1`. Intentional - friendlier than slotId.
          // GK shorthand is localized (fi coaches read "MV", not "GK").
          const positionLabel = slot.isGoalie ? t('playtimePlanner.gkShort', 'GK') : `#${i}`;
          const slotSubs = subsBySlot.get(slot.slotId) ?? [];
          // The pill renders whenever subs are scheduled - even with the starter
          // cleared (the engine still grants the incoming player minutes, so the
          // field must not pretend the slot is plain empty).
          const hasSubs = slotSubs.length > 0;
          const involved =
            anyHighlight && (isTracked(playerId) || slotSubs.some((sub) => isTracked(sub.inPlayerId)));
          // Screen readers: aria-label OVERRIDES the button's contents, so the
          // pill's incoming players must be folded into the label explicitly.
          const subsLabel = slotSubs
            .map(
              (sub) =>
                `${Math.round(sub.timeSeconds / 60)}' ${
                  sub.inPlayerId ? nameById.get(sub.inPlayerId) ?? sub.inPlayerId : '?'
                }`,
            )
            .join(', ');
          // In ramp mode role colour gives way to the fairness fill; the GK keeps
          // identity via an amber border + the localized "MV" tag inside the disc.
          const discClasses = rampMode
            ? slot.isGoalie
              ? 'border-amber-400 text-white'
              : 'border-white/90 text-white'
            : slot.isGoalie
              ? 'bg-amber-500 text-slate-900 border-amber-300'
              : 'bg-indigo-600 text-white border-indigo-300';

          const slotSelected = selection?.type === 'slot' && selection.slotId === slot.slotId;
          const starterLabel = filled
            ? t('playtimePlanner.lineup.slotFilled', '{{position}}: {{player}}', {
                position: positionLabel,
                player: name ?? '',
              })
            : t('playtimePlanner.lineup.slotEmpty', '{{position}}: empty', {
                position: positionLabel,
              });
          const selectionRing = 'ring-2 ring-yellow-300 ring-offset-1 ring-offset-green-800';
          const conflictRing = conflictSlots.has(slot.slotId)
            ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-green-800'
            : hlRing(involved);
          const segmentFocus =
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-1 focus-visible:ring-offset-green-800';

          return (
            <div
              key={slot.slotId}
              // Only a rotation pill is a multi-target composite worth naming;
              // a plain disc's wrapper must NOT duplicate its button's label.
              role={hasSubs ? 'group' : undefined}
              aria-label={hasSubs ? `${starterLabel}${subsLabel ? `; ${subsLabel}` : ''}` : undefined}
              className={`absolute flex flex-col items-center rounded-full ${
                hasSubs ? 'z-10' : ''
              } ${dimClass(involved)}`}
              style={{
                left: `${slot.relX * 100}%`,
                top: `${slot.relY * 100}%`,
                // Anchor the disc/pill MIDLINE to the slot point with fixed
                // offsets (disc h-11 -> -22px, pill h-10 -> -20px) instead of
                // centering the whole flex column: the minutes line below a disc
                // must hang under it without pushing the circle off the slot -
                // otherwise discs and (minute-less) pills in the same formation
                // row sit at visibly different heights. X: pills shift by relX so
                // edge slots grow toward the field center; discs center as usual.
                // All offsets live in this ONE transform - Tailwind 4 translate
                // classes use the CSS `translate` property and would COMPOSE
                // with it (the doubled-shift bug).
                transform: hasSubs
                  ? `translate(-${(slot.relX * 100).toFixed(1)}%, ${slotSubs.length > 1 ? '-50%' : '-20px'})`
                  : 'translate(-50%, -22px)',
              }}
            >
              {hasSubs ? (
                /* Divided pill: one segment per time window, left→right = time.
                   Every segment is its OWN tap target (direct manipulation: tap
                   a stint, tap another placement, they trade places). Tinted by
                   its player's ramp colour; sub segments carry the minute tag. */
                <span
                  className={[
                    'flex overflow-hidden border-2 transition-colors',
                    slotSubs.length > 1 ? 'flex-col rounded-2xl' : 'rounded-full h-10',
                    rampMode ? 'border-white/90' : 'border-indigo-300',
                    conflictRing,
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => handleStarterClick(slot.slotId)}
                    aria-label={starterLabel}
                    aria-pressed={slotSelected}
                    className={[
                      'flex items-center justify-center px-2 text-[10px] font-bold text-white whitespace-nowrap',
                      slotSubs.length > 1 ? 'py-1' : '',
                      segmentFocus,
                      slotSelected ? `${selectionRing} z-10` : '',
                    ].join(' ')}
                    style={{
                      backgroundColor: filled ? fillFor(playerId) ?? '#4f46e5' : 'rgba(15,23,42,0.7)',
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    }}
                  >
                    {filled ? shortName(name ?? '') : '+'}
                  </button>
                  {slotSubs.map((sub) => {
                    const inName = sub.inPlayerId ? nameById.get(sub.inPlayerId) ?? sub.inPlayerId : '?';
                    const subSelected = selection?.type === 'sub' && selection.subId === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleSubSegmentClick(slot.slotId, sub)}
                        aria-label={t('playtimePlanner.lineup.subStint', "{{minute}}' {{player}} ({{position}})", {
                          minute: Math.round(sub.timeSeconds / 60),
                          player: inName,
                          position: positionLabel,
                        })}
                        aria-pressed={subSelected}
                        className={[
                          'flex items-center justify-center px-2 text-[10px] font-bold text-white whitespace-nowrap border-dashed border-white/70 gap-1',
                          slotSubs.length > 1 ? 'flex-row py-1 border-t-2' : 'flex-col border-l-2',
                          segmentFocus,
                          subSelected ? `${selectionRing} z-10` : '',
                        ].join(' ')}
                        style={{
                          backgroundColor: fillFor(sub.inPlayerId) ?? '#4f46e5',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        }}
                      >
                        <span className="text-[8px] font-extrabold text-amber-200 leading-none tabular-nums">
                          {Math.round(sub.timeSeconds / 60)}&#39;
                        </span>
                        {shortName(inName)}
                      </button>
                    );
                  })}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStarterClick(slot.slotId)}
                  aria-label={starterLabel}
                  aria-pressed={slotSelected}
                  className={[
                    'w-11 h-11 rounded-full flex flex-col items-center justify-center text-[10px] font-bold border-2 transition-colors',
                    filled ? discClasses : 'bg-slate-900/70 text-white border-dashed border-white/80',
                    segmentFocus,
                    slotSelected ? selectionRing : conflictRing,
                  ].join(' ')}
                  style={
                    filled && rampMode
                      ? { backgroundColor: fillFor(playerId), textShadow: '0 1px 2px rgba(0,0,0,0.5)' }
                      : undefined
                  }
                >
                  {filled && rampMode && slot.isGoalie && (
                    <span className="text-[7px] font-extrabold tracking-wide text-amber-200 leading-none">
                      {t('playtimePlanner.gkShort', 'GK')}
                    </span>
                  )}
                  {filled ? shortName(name ?? '') : slot.isGoalie ? t('playtimePlanner.gkShort', 'GK') : '+'}
                </button>
              )}
              {!hasSubs && filled && playerId && minutesByPlayer?.[playerId] && (
                <span
                  className="mt-0.5 text-[10px] font-semibold tabular-nums leading-tight"
                  style={{
                    color: fairnessText(minutesByPlayer[playerId].ratio),
                    textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                  }}
                >
                  {minutesByPlayer[playerId].minutes}&#39;
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Assignment panel - no instruction copy: the actions row and the bench
          discs ARE the affordances. Solid full-width house buttons. */}
      <div className="max-w-sm mx-auto space-y-3">
        {conflicts.length > 0 && (
          <div
            role="status"
            data-testid="plan-conflict-banner"
            className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 space-y-0.5"
          >
            {conflicts.map((c) => {
              const posA = slots.findIndex((sl) => sl.slotId === c.slotIdA);
              const posB = slots.findIndex((sl) => sl.slotId === c.slotIdB);
              const label = (idx: number) =>
                idx >= 0 && slots[idx].isGoalie ? t('playtimePlanner.gkShort', 'GK') : `#${idx}`;
              return (
                <p
                  key={`${c.playerId}-${c.slotIdA}-${c.slotIdB}-${c.overlapStartSeconds}`}
                  className="text-xs text-red-200"
                >
                  {t(
                    'playtimePlanner.conflicts.row',
                    "{{player}} is in {{a}} and {{b}} at the same time ({{from}}'-{{to}}')",
                    {
                      player: nameById.get(c.playerId) ?? c.playerId,
                      a: label(posA),
                      b: label(posB),
                      from: Math.floor(c.overlapStartSeconds / 60),
                      to: Math.ceil(c.overlapEndSeconds / 60),
                    },
                  )}
                </p>
              );
            })}
          </div>
        )}
        {/* Actions for the current selection + whole-field tools. Swapping and
            moving are DIRECT (tap a placement, tap another) - no action needed. */}
        {(selection !== null || (emptySlots.length > 0 && bench.length > 0) || anyPlacement) && (
          <div className="flex gap-2">
            {selection?.type === 'slot' && activeOccupant && onRequestSub && (
              <button
                type="button"
                onClick={() => onRequestSub(selection.slotId)}
                className={`${primaryButtonStyle} flex-1`}
              >
                {t('playtimePlanner.lineup.subAction', 'Sub…')}
              </button>
            )}
            {selection?.type === 'sub' && onRemoveSub && (
              <button
                type="button"
                onClick={handleRemoveSelectedSub}
                className={`${dangerButtonStyle} flex-1`}
              >
                {t('playtimePlanner.lineup.removeSubAction', 'Remove sub')}
              </button>
            )}
            {selection?.type === 'slot' && onClearSlot && (activeOccupant || selectedSlotSubs.length > 0) && (
              <button type="button" onClick={handleClearSlot} className={`${dangerButtonStyle} flex-1`}>
                {t('playtimePlanner.lineup.clearSlot', 'Clear')}
              </button>
            )}
            {emptySlots.length > 0 && bench.length > 0 && (
              <button type="button" onClick={handleAutoFill} className={`${secondaryButtonStyle} flex-1`}>
                {t('playtimePlanner.lineup.autoFill', 'Auto-fill')}
              </button>
            )}
            {selection === null && anyPlacement && onClearAll && (
              <button type="button" onClick={handleClearAll} className={`${dangerButtonStyle} flex-1`}>
                {t('playtimePlanner.lineup.clearAll', 'Clear field')}
              </button>
            )}
          </div>
        )}
        {players.length === 0 ? (
          <p className={subtextStyle}>
            {t('playtimePlanner.lineup.noPlayers', 'No players in this plan - add them on the Plan tab.')}
          </p>
        ) : bench.length === 0 ? (
          <p className={subtextStyle}>
            {absentSet.size > 0
              ? t('playtimePlanner.lineup.benchEmptyAbsent', 'Everyone is placed or absent.')
              : t('playtimePlanner.lineup.benchEmpty', 'Everyone is on the field.')}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(3.5rem,1fr))] gap-y-2 justify-items-center">
            {/* Equal-column grid (same fix as the fairness strip): a wrapping
                flex row left the row remainder as dead space on the right -
                columns stretch so the outer discs align with the edges. */}
            {bench.map((id) => {
              const fair = minutesByPlayer?.[id];
              const involved = isTracked(id);
              const sitsOut = !enteringIds.has(id);
              // Field full and nothing selected: a tap has no target, so the
              // disc reads inert instead of dying silently.
              const inert = selection === null && emptyFillOrder.length === 0;
              return (
                /* Bench players render as DISCS - the same visual object as the
                   players on the pitch - so "tap to place/swap" is obvious. */
                <button
                  key={id}
                  type="button"
                  onClick={() => handleBenchClick(id)}
                  disabled={inert}
                  title={sitsOut ? t('playtimePlanner.lineup.notInGame', 'Not in this game') : undefined}
                  className={`flex flex-col items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed ${dimClass(involved)}`}
                >
                  <span
                    className={[
                      'w-11 h-11 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 transition-colors',
                      sitsOut ? 'border-red-500/80' : 'border-white/60',
                      fair ? '' : 'bg-slate-700 hover:bg-slate-600',
                      anyHighlight && involved ? 'ring-2 ring-amber-300' : '',
                    ].join(' ')}
                    style={
                      fair
                        ? { backgroundColor: fairnessFill(fair.ratio), textShadow: '0 1px 2px rgba(0,0,0,0.5)' }
                        : undefined
                    }
                  >
                    {shortName(nameById.get(id) ?? id)}
                  </span>
                  {fair && (
                    <span
                      className="mt-0.5 text-[10px] font-semibold tabular-nums leading-tight"
                      style={{ color: fairnessText(fair.ratio) }}
                    >
                      {fair.minutes}&#39;
                    </span>
                  )}
                  {sitsOut && (
                    <span className="sr-only">
                      {' '}
                      {t('playtimePlanner.lineup.notInGame', 'Not in this game')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Per-game availability: fold-out chip list of the whole plan roster.
            Absent players leave the bench, Suggest skips them, and this game
            stops counting toward their fair share. */}
        {onToggleAbsent && players.length > 0 && (
          <div>
            <button
              type="button"
              onClick={toggleAbsenceOpen}
              aria-expanded={showAbsence}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 py-1.5 -my-1"
            >
              <HiChevronDown
                aria-hidden="true"
                className={`w-3.5 h-3.5 transition-transform ${showAbsence ? '' : '-rotate-90'}`}
              />
              {t('playtimePlanner.lineup.absentHeading', 'Absent from this game')}
              {absentSet.size > 0 && <span className="text-red-400 normal-case">({absentSet.size})</span>}
            </button>
            {showAbsence && (
              <div
                role="group"
                aria-label={t('playtimePlanner.lineup.absentHeading', 'Absent from this game')}
                className="flex flex-wrap gap-1.5 mt-1"
              >
                {players.map((p) => {
                  const absent = absentSet.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onToggleAbsent(p.id)}
                      aria-pressed={absent}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                        absent
                          ? 'bg-red-900/40 border-red-600 text-red-200 line-through font-medium'
                          : 'bg-transparent border-slate-600/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanFieldView;
