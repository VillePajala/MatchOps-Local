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
 * tap a stint then ANY player - a bench disc, an "Already in this game" disc,
 * or a player on the field - to hand the stint over (or its own empty kickoff
 * spot to promote the incomer to starter); Clear empties a position
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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HiChevronDown } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { getGameSlots, ensureStartingSlots, benchPlayerIds } from '@/utils/playtimePlanner/lineup';
import { fairnessFill, fairnessText } from '@/utils/playtimePlanner/colors';
import { findSimultaneityConflicts, conflictedSlotIds } from '@/utils/playtimePlanner/conflicts';
import PlanFieldBackdrop from '@/components/PlanFieldBackdrop';
import PlanChainSheet, { type PlanChainSheetRow } from '@/components/PlanChainSheet';
import {
  chainCardLayout,
  estimateChainCardWidthPx,
  chainCardFit,
  maxChainRows,
  type ChainCardMetrics,
  type ChainFieldItem,
} from '@/utils/playtimePlanner/chainLayout';
import {
  subtextStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionLabelStyle,
  chipStyle,
  errorBoxStyle,
} from '@/styles/modalStyles';

/** Clear field: destructive, but undoable and always on screen - so a compact
 *  red-text button at the side, not a standing pill (round 2, owner). */
const resetButtonStyle =
  'inline-flex items-center min-h-11 px-3 -mr-1 rounded-full font-ui text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action';

/** Clear / Remove sub on a selected placement: a red OUTLINE pill, so the amber
 *  Sub action beside it stays the one primary (round 2, owner). */
const selectionDangerStyle = `${secondaryButtonStyle} flex-1 text-red-400! shadow-[inset_0_0_0_1.5px_rgb(248_113_113/0.6)]! hover:bg-red-500/10!`;

/** A fold-out section toggle (bench availability): the uppercase section label as a 44px button. */
/** Bench strip grid: equal columns so the outer discs align with the edges. */
const benchGridStyle = 'grid grid-cols-[repeat(auto-fit,minmax(3.5rem,1fr))] gap-y-2 justify-items-center';

const foldToggleStyle =
  'flex items-center gap-1.5 min-h-11 -my-1.5 px-1 rounded-lg font-ui text-xs font-semibold uppercase tracking-[0.14em] text-ink-3 hover:text-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-action';
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

/**
 * This view's chain-card geometry (see chainLayout). A stacked pill row is
 * ~25px (py-1 + 10px text + hairline); the pill's top row is anchored on the
 * slot point, so the card reaches 13px above it and grows DOWN; the mark at
 * the slot below reaches up to 22px (a disc's half height) above its point.
 * Field size is measured; these are the fallbacks for a 360px phone.
 */
const CHAIN_METRICS: Omit<ChainCardMetrics, 'fieldWidthPx' | 'fieldHeightPx'> = {
  horizontalReachPx: 96,
  anchorAbovePx: 13,
  neighbourAbovePx: 22,
  gapPx: 4,
  rowPx: 25,
  chromePx: 4,
};
const FALLBACK_PITCH = { w: 328, h: 437 };
/** A one-row pill is h-10, centred on its slot point. */
const PILL_HALF_HEIGHT_PX = 20;
/** A plain disc is w-11 h-11, centred on its slot point. */
const DISC_PX = 44;
/** A capped card never gets narrower than this; names truncate inside it. */
const MIN_CARD_WIDTH_PX = 72;

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
  // The position whose full chain is open in the sheet (a compact card's +N).
  const [chainSheetSlotId, setChainSheetSlotId] = useState<string | null>(null);
  // Measured pitch size: how much room each chain card has depends on it.
  const pitchRef = useRef<HTMLDivElement>(null);
  const [pitchSize, setPitchSize] = useState(FALLBACK_PITCH);
  useEffect(() => {
    const el = pitchRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setPitchSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const showAbsence = absenceOpen ?? showAbsenceLocal;
  const toggleAbsenceOpen = onToggleAbsenceOpen ?? (() => setShowAbsenceLocal((v) => !v));
  const absentSet = useMemo(() => new Set(game.absentIds ?? []), [game.absentIds]);

  const slots = useMemo(() => getGameSlots(game.formationId), [game.formationId]);
  const chainMetrics = useMemo<ChainCardMetrics>(
    () => ({ ...CHAIN_METRICS, fieldWidthPx: pitchSize.w, fieldHeightPx: pitchSize.h }),
    [pitchSize],
  );
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

  // With a stint selected, ANY available player may take it (PlanSubSheet's
  // rule): true bench players (appearing nowhere in this game) first, then the
  // players already in the game - a starter re-entering after coming off, or
  // someone moving position (giveStintToPlayer ends their other stint at that
  // minute). Excluded: absentees, the stint's current player, and whoever
  // holds the position just before the change (a self-sub is a no-op).
  const selectedStint =
    selection?.type === 'sub' ? game.subs.find((s) => s.id === selection.subId) ?? null : null;
  const stintOccupantBefore = useMemo(() => {
    if (!selectedStint) return null;
    let occupant = playerBySlot.get(selectedStint.slotId) ?? null;
    (subsBySlot.get(selectedStint.slotId) ?? [])
      .filter((s) => s.id !== selectedStint.id && s.timeSeconds < selectedStint.timeSeconds)
      .forEach((s) => {
        occupant = s.inPlayerId;
      });
    return occupant;
  }, [selectedStint, playerBySlot, subsBySlot]);
  const stintCandidates = useMemo(() => {
    if (!selectedStint || !onSetSubPlayer) return null;
    const appearing = new Set<string>();
    assignments.forEach((a) => {
      if (a.playerId) appearing.add(a.playerId);
    });
    game.subs.forEach((s) => {
      if (s.inPlayerId) appearing.add(s.inPlayerId);
    });
    const ids = players
      .map((p) => p.id)
      .filter((id) => !absentSet.has(id) && id !== selectedStint.inPlayerId && id !== stintOccupantBefore);
    return {
      benchIds: ids.filter((id) => !appearing.has(id)),
      inGameIds: ids.filter((id) => appearing.has(id)),
    };
  }, [selectedStint, onSetSubPlayer, assignments, game.subs, players, absentSet, stintOccupantBefore]);

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
  // navy/amber discs render (read-only embeds stay untouched).
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
    if (
      selection?.type === 'sub' &&
      onSetSubPlayer &&
      targetPlayer &&
      targetPlayer !== selection.playerId &&
      targetPlayer !== stintOccupantBefore
    ) {
      // A stint selected, then a player on the field: that player takes the
      // stint (they move here at that minute) - NOT a whole-game swap.
      onSetSubPlayer(selection.subId, targetPlayer);
      setSelection(null);
      return;
    }
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

  // Tapping empty grass (anywhere on the pitch that isn't a disc/pill/button)
  // clears the current selection - a faster deselect than re-tapping the disc.
  const handlePitchBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (selection) setSelection(null);
  };

  // The full chain of one position (opened from a compact card's +N badge).
  // Rendered OUTSIDE the pitch div: React events bubble through portals, and
  // the pitch's background click would clear the selection on every tap.
  const renderChainSheet = () => {
    if (!chainSheetSlotId) return null;
    const index = slots.findIndex((sl) => sl.slotId === chainSheetSlotId);
    if (index === -1) return null;
    const slot = slots[index];
    const starterId = playerBySlot.get(slot.slotId) ?? null;
    // Each player's total planned minutes, in the same ramp colour as the field.
    const totals = (id: string | null): Pick<PlanChainSheetRow, 'totalMinutes' | 'totalColor'> => {
      const fair = id ? minutesByPlayer?.[id] : undefined;
      return fair ? { totalMinutes: fair.minutes, totalColor: fairnessText(fair.ratio) } : {};
    };
    const rows: PlanChainSheetRow[] = [
      {
        key: 'starter',
        minute: null,
        name: starterId ? nameById.get(starterId) ?? starterId : '-',
        ...totals(starterId),
        onSelect: () => handleStarterClick(slot.slotId),
      },
      ...(subsBySlot.get(slot.slotId) ?? []).map((sub) => ({
        key: sub.id,
        minute: Math.round(sub.timeSeconds / 60),
        name: sub.inPlayerId ? nameById.get(sub.inPlayerId) ?? sub.inPlayerId : '?',
        ...totals(sub.inPlayerId),
        onSelect: () => handleSubSegmentClick(slot.slotId, sub),
      })),
    ];
    return (
      <PlanChainSheet
        positionLabel={slot.isGoalie ? t('playtimePlanner.gkShort', 'GK') : `#${index}`}
        rows={rows}
        onClose={() => setChainSheetSlotId(null)}
      />
    );
  };

  // One bench disc. `inGame` marks a player already in this game (offered
  // only while a stint is selected): a dashed border, like the sub sheet.
  const renderBenchDisc = (id: string, inGame: boolean) => {
    const fair = minutesByPlayer?.[id];
    const involved = isTracked(id);
    const sitsOut = !inGame && !enteringIds.has(id);
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
        className={`flex flex-col items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50 disabled:cursor-not-allowed ${dimClass(involved)}`}
      >
        <span
          className={[
            'w-11 h-11 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 transition-colors shadow-md shadow-black/40',
            inGame ? 'border-dashed border-white/60' : sitsOut ? 'border-red-500/80' : 'border-white/60',
            fair ? '' : 'bg-surface-2 hover:brightness-125',
            anyHighlight && involved ? 'ring-2 ring-amber-300' : '',
          ].join(' ')}
          style={
            fair
              ? {
                  backgroundColor: fairnessFill(fair.ratio),
                  backgroundImage:
                    'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.30), rgba(255,255,255,0) 60%)',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }
              : undefined
          }
        >
          {shortName(nameById.get(id) ?? id)}
        </span>
        {fair && (
          <span
            className="mt-0.5 text-xs font-semibold tabular-nums leading-tight"
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
  };

  // Each position's card form, worked out for all slots first: a card's width
  // lane depends on the marks beside it (chainLayout.chainCardFit).
  const slotCards = slots.map((slot, i) => {
    const slotSubs = subsBySlot.get(slot.slotId) ?? [];
    const hasSubs = slotSubs.length > 0;
    // Long chains (and any chain without room below it) go COMPACT: the
    // starter, ONE incoming stint and a "+N" badge that opens the whole
    // chain in a sheet - a card never grows over the position below it.
    const layout = chainCardLayout(slotSubs.length, maxChainRows(slots, i, chainMetrics));
    const stacked = hasSubs && !layout.compact && slotSubs.length > 1;
    // The one stint a compact card shows: the selected one when it lives
    // behind the badge (so a selection picked in the sheet stays visible),
    // else the next change.
    const shownSubs = layout.compact
      ? [slotSubs.find((sub) => selection?.type === 'sub' && selection.subId === sub.id) ?? slotSubs[0]]
      : slotSubs;
    const starterId = playerBySlot.get(slot.slotId) ?? null;
    const item: ChainFieldItem = hasSubs
      ? {
          relX: slot.relX,
          relY: slot.relY,
          abovePx: stacked ? CHAIN_METRICS.anchorAbovePx : PILL_HALF_HEIGHT_PX,
          belowPx: stacked
            ? (1 + shownSubs.length) * CHAIN_METRICS.rowPx + CHAIN_METRICS.chromePx - CHAIN_METRICS.anchorAbovePx
            : PILL_HALF_HEIGHT_PX,
          naturalWidthPx: estimateChainCardWidthPx({
            starter: starterId ? shortName(nameById.get(starterId) ?? '') : '+',
            subs: shownSubs.map((sub) => ({
              minute: Math.round(sub.timeSeconds / 60),
              name: shortName(sub.inPlayerId ? nameById.get(sub.inPlayerId) ?? sub.inPlayerId : '?'),
            })),
            more: layout.compact,
            stacked,
          }),
        }
      : { relX: slot.relX, relY: slot.relY, abovePx: DISC_PX / 2, belowPx: DISC_PX / 2, fixedWidthPx: DISC_PX };
    return { slotSubs, hasSubs, layout, stacked, shownSubs, item };
  });
  const cardItems = slotCards.map((c) => c.item);
  const cardFits = slotCards.map((c, i) => (c.hasSubs ? chainCardFit(cardItems, i, chainMetrics) : null));

  return (
    <div className="space-y-4">
      {/* Pitch - the REAL field: the live game's grass + markings painted by
          the shared canvas painters (PlanFieldBackdrop), discs as DOM on top. */}
      <div
        ref={pitchRef}
        className="relative w-full max-w-sm mx-auto rounded-[18px] overflow-hidden shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_16px_26px_-18px_rgb(2_6_23/0.85)]"
        style={{ aspectRatio: '3 / 4', background: '#427B44' }}
        onClick={handlePitchBackgroundClick}
      >
        <PlanFieldBackdrop />

        {slots.map((slot, i) => {
          const playerId = playerBySlot.get(slot.slotId) ?? null;
          const name = playerId ? nameById.get(playerId) : null;
          const filled = !!playerId;
          // 1-based human label (#1, #2, …); note `i` includes the GK at 0, so
          // field slot `s0` reads as `#1`. Intentional - friendlier than slotId.
          // GK shorthand is localized (fi coaches read "MV", not "GK").
          const positionLabel = slot.isGoalie ? t('playtimePlanner.gkShort', 'GK') : `#${i}`;
          // The pill renders whenever subs are scheduled - even with the starter
          // cleared (the engine still grants the incoming player minutes, so the
          // field must not pretend the slot is plain empty).
          const { slotSubs, hasSubs, layout, stacked, shownSubs } = slotCards[i];
          // Kept in its lane beside the cards at the same height (chainLayout):
          // moved toward the touchline first, capped (names truncate) last.
          const fit = cardFits[i];
          const cardMaxWidth =
            fit && Number.isFinite(fit.maxWidthPx) ? Math.max(MIN_CARD_WIDTH_PX, Math.floor(fit.maxWidthPx)) : undefined;
          const cardShift = fit ? Math.round(fit.shiftPx) : 0;
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
              : 'bg-surface-2 text-white border-white/80';

          const slotSelected = selection?.type === 'slot' && selection.slotId === slot.slotId;
          const starterLabel = filled
            ? t('playtimePlanner.lineup.slotFilled', '{{position}}: {{player}}', {
                position: positionLabel,
                player: name ?? '',
              })
            : t('playtimePlanner.lineup.slotEmpty', '{{position}}: empty', {
                position: positionLabel,
              });
          const selectionRing = 'ring-2 ring-amber-300 ring-offset-1 ring-offset-green-800';
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
                // A stacked pill hangs DOWN from its slot (top row on the point,
                // see CHAIN_METRICS) - the room below is what chainLayout caps.
                transform: hasSubs
                  ? `translate(calc(-${(slot.relX * 100).toFixed(1)}% + ${cardShift}px), ${stacked ? '-13px' : '-20px'})`
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
                    'flex overflow-hidden border-2 transition-colors shadow-md shadow-black/40',
                    stacked ? 'flex-col rounded-2xl' : 'rounded-full h-10',
                    'border-white/90',
                    conflictRing,
                  ].join(' ')}
                  // Never wider than its lane (see cardFits); names truncate.
                  style={cardMaxWidth !== undefined ? { maxWidth: cardMaxWidth } : undefined}
                >
                  <button
                    type="button"
                    onClick={() => handleStarterClick(slot.slotId)}
                    aria-label={starterLabel}
                    aria-pressed={slotSelected}
                    className={[
                      'flex min-w-0 items-center justify-center px-2 text-[10px] font-bold text-white whitespace-nowrap',
                      stacked ? 'py-1' : '',
                      segmentFocus,
                      slotSelected ? `${selectionRing} z-10` : '',
                    ].join(' ')}
                    style={{
                      backgroundColor: filled ? fillFor(playerId) ?? '#1e293b' : 'rgba(15,23,42,0.7)',
                      backgroundImage: filled
                        ? 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.22), rgba(255,255,255,0) 60%)'
                        : undefined,
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    }}
                  >
                    <span className="truncate">{filled ? shortName(name ?? '') : '+'}</span>
                  </button>
                  {shownSubs.map((sub) => {
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
                          'flex min-w-0 items-center justify-center px-2 text-[10px] font-bold text-white whitespace-nowrap border-white/35 gap-1',
                          stacked ? 'flex-row py-1 border-t' : 'flex-col border-l',
                          segmentFocus,
                          subSelected ? `${selectionRing} z-10` : '',
                        ].join(' ')}
                        style={{
                          backgroundColor: fillFor(sub.inPlayerId) ?? '#1e293b',
                          backgroundImage:
                            'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), rgba(255,255,255,0) 60%)',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        }}
                      >
                        <span className="shrink-0 text-xs font-extrabold text-amber-200 leading-none tabular-nums bg-black/30 rounded px-1 py-0.5">
                          {Math.round(sub.timeSeconds / 60)}&#39;
                        </span>
                        <span className="truncate max-w-full">{shortName(inName)}</span>
                      </button>
                    );
                  })}
                  {layout.compact && (
                    <button
                      type="button"
                      onClick={() => setChainSheetSlotId(slot.slotId)}
                      aria-haspopup="dialog"
                      aria-expanded={chainSheetSlotId === slot.slotId}
                      aria-label={t('playtimePlanner.lineup.chainShowAll', {
                        position: positionLabel,
                        count: slotSubs.length,
                        defaultValue_one: '{{position}}: {{count}} change, show all',
                        defaultValue_other: '{{position}}: {{count}} changes, show all',
                      })}
                      data-testid="plan-chain-more"
                      className={[
                        'flex shrink-0 items-center justify-center min-w-9 px-1.5 border-l border-white/35 bg-slate-900/85',
                        'text-xs font-extrabold text-amber-200 tabular-nums',
                        segmentFocus,
                      ].join(' ')}
                    >
                      +{layout.hiddenCount}
                    </button>
                  )}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStarterClick(slot.slotId)}
                  aria-label={starterLabel}
                  aria-pressed={slotSelected}
                  className={[
                    'w-11 h-11 rounded-full flex flex-col items-center justify-center text-[10px] font-bold border-2',
                    'transition-[transform,background-color,border-color] duration-150 motion-reduce:transition-none motion-reduce:transform-none',
                    filled ? discClasses : 'bg-slate-900/50 text-white border-dashed border-white/60',
                    // Token treatment: a picked-up disc lifts; placed discs cast
                    // a small shadow so they sit ON the grass, not in it.
                    slotSelected ? 'scale-110 shadow-lg shadow-black/50' : filled ? 'shadow-md shadow-black/40' : '',
                    segmentFocus,
                    slotSelected ? selectionRing : conflictRing,
                  ].join(' ')}
                  style={
                    filled && rampMode
                      ? {
                          backgroundColor: fillFor(playerId),
                          backgroundImage:
                            'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.30), rgba(255,255,255,0) 60%)',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        }
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
              {/* Minutes under the disc - the keeper's ABOVE it, clear of the
                  goal line it stands on. Absolutely placed so the disc stays
                  anchored to its slot point either way. */}
              {!hasSubs && filled && playerId && minutesByPlayer?.[playerId] && (
                <span
                  data-testid="plan-disc-minutes"
                  className={`absolute left-1/2 -translate-x-1/2 text-xs font-semibold tabular-nums leading-tight whitespace-nowrap pointer-events-none ${
                    slot.isGoalie ? 'bottom-full mb-0.5' : 'top-full mt-0.5'
                  }`}
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
      <div className="max-w-sm mx-auto space-y-3 font-ui">
        {conflicts.length > 0 && (
          <div
            role="status"
            data-testid="plan-conflict-banner"
            className={`${errorBoxStyle} px-3.5! py-3! space-y-1`}
          >
            {conflicts.map((c) => {
              const posA = slots.findIndex((sl) => sl.slotId === c.slotIdA);
              const posB = slots.findIndex((sl) => sl.slotId === c.slotIdB);
              const label = (idx: number) =>
                idx >= 0 && slots[idx].isGoalie ? t('playtimePlanner.gkShort', 'GK') : `#${idx}`;
              return (
                <p
                  key={`${c.playerId}-${c.slotIdA}-${c.slotIdB}-${c.overlapStartSeconds}`}
                  className="text-[13px] leading-snug text-ink"
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
        {(selection !== null || (emptySlots.length > 0 && bench.length > 0)) && (
          <div className="flex gap-2">
            {/* Sub… is available from ANY selected placement - the starter
                segment, a stint segment, or a starterless rotation pill - so
                a position's schedule can always grow more changes. */}
            {selection && onRequestSub && (
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
                className={selectionDangerStyle}
              >
                {t('playtimePlanner.lineup.removeSubAction', 'Remove sub')}
              </button>
            )}
            {selection?.type === 'slot' && onClearSlot && (activeOccupant || selectedSlotSubs.length > 0) && (
              <button type="button" onClick={handleClearSlot} className={selectionDangerStyle}>
                {t('playtimePlanner.lineup.clearSlot', 'Clear')}
              </button>
            )}
            {emptySlots.length > 0 && bench.length > 0 && (
              <button type="button" onClick={handleAutoFill} className={`${secondaryButtonStyle} flex-1`}>
                {t('playtimePlanner.lineup.autoFill', 'Auto-fill')}
              </button>
            )}
          </div>
        )}
        {players.length === 0 ? (
          <p className={subtextStyle}>
            {t('playtimePlanner.lineup.noPlayers', 'No players in this plan - add them on the Plan tab.')}
          </p>
        ) : stintCandidates ? (
          /* A stint is selected: any available player can take it. Bench first,
             then players already in this game (same grouping/wording as the
             sub sheet, dashed to read as "already playing"). */
          <div className="s1-list px-2 pt-3 pb-3">
            {stintCandidates.benchIds.length > 0 && (
              <>
                <p className={`${sectionLabelStyle} px-2 mb-2.5`}>
                  {t('playtimePlanner.lineup.benchLabel', 'Bench')}
                </p>
                <div className={benchGridStyle}>
                  {stintCandidates.benchIds.map((id) => renderBenchDisc(id, false))}
                </div>
              </>
            )}
            {stintCandidates.inGameIds.length > 0 && (
              <div className={stintCandidates.benchIds.length > 0 ? 'mt-4' : ''}>
                <p className={`${sectionLabelStyle} px-2 mb-2.5`}>
                  {t('playtimePlanner.subs.inGameGroup', 'Already in this game')}
                </p>
                <div className={benchGridStyle} data-testid="plan-stint-in-game">
                  {stintCandidates.inGameIds.map((id) => renderBenchDisc(id, true))}
                </div>
              </div>
            )}
            {stintCandidates.benchIds.length === 0 && stintCandidates.inGameIds.length === 0 && (
              <p className={`${subtextStyle} px-2`}>
                {t('playtimePlanner.subs.noBench', 'No bench players available.')}
              </p>
            )}
          </div>
        ) : bench.length === 0 ? (
          <p className={subtextStyle}>
            {absentSet.size > 0
              ? t('playtimePlanner.lineup.benchEmptyAbsent', 'Everyone is placed or absent.')
              : t('playtimePlanner.lineup.benchEmpty', 'Everyone is on the field.')}
          </p>
        ) : (
          <div className="s1-list px-2 pt-3 pb-3">
            {/* Sideline strip: the bench gets a visual home next to the pitch. */}
            <p className={`${sectionLabelStyle} px-2 mb-2.5`}>
              {t('playtimePlanner.lineup.benchLabel', 'Bench')}
            </p>
            {/* Equal-column grid (same fix as the fairness strip): a wrapping
                flex row left the row remainder as dead space on the right -
                columns stretch so the outer discs align with the edges. */}
            <div className={benchGridStyle}>{bench.map((id) => renderBenchDisc(id, false))}</div>
          </div>
        )}

        {/* Clear field lives UNDER the bench, at the side (owner placement).
            Clearing every game is a plan-level action on the Settings tab. */}
        {anyPlacement && onClearAll && (
          <div className="flex justify-end">
            <button type="button" onClick={handleClearAll} className={resetButtonStyle}>
              {t('playtimePlanner.lineup.clearAll', 'Clear field')}
            </button>
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
              className={foldToggleStyle}
            >
              <HiChevronDown
                aria-hidden="true"
                className={`w-4 h-4 transition-transform ${showAbsence ? '' : '-rotate-90'}`}
              />
              {t('playtimePlanner.lineup.absentHeading', 'Absent from this game')}
              {absentSet.size > 0 && <span className="text-red-400 normal-case tracking-normal">({absentSet.size})</span>}
            </button>
            {showAbsence && (
              <div
                role="group"
                aria-label={t('playtimePlanner.lineup.absentHeading', 'Absent from this game')}
                className="flex flex-wrap gap-2 mt-1.5"
              >
                {players.map((p) => {
                  const absent = absentSet.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onToggleAbsent(p.id)}
                      aria-pressed={absent}
                      className={`${chipStyle} ${
                        absent
                          ? 'bg-red-500/10! shadow-[inset_0_0_0_1px_rgb(255_107_107/0.55)]! text-red-200! line-through'
                          : ''
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
      {renderChainSheet()}
    </div>
  );
};

export default PlanFieldView;
