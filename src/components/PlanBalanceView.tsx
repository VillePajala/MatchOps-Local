'use client';

/**
 * Playing-Time Planner — fair-minutes balance (Phase 1, PR 1.5; rebuilt to the
 * standalone planner's Minutes-tab design).
 *
 * Top to bottom: actionable warnings (0-minute players, big spread, lone GK) →
 * a grid of chunky chips, each painted ENTIRELY in the player's fairness colour
 * (sorted least-played first, so the grid reads as a red→green gradient) → a
 * focus stack: one rich card per highlighted player (worst-off by default) with
 * a %-of-fair-share bar and a per-game tile row (position + minutes, tinted by
 * how much of that game they play). One shared highlight selection drives the
 * chips, the cards, the lineup view and the fairness strip.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computePlanMinutes } from '@/utils/playtimePlanner/minutes';
import { toEnginePlan } from '@/utils/playtimePlanner/adapter';
import { computePlanPositions, PLAN_ZONES, zoneOfLabel, type PlanZone } from '@/utils/playtimePlanner/positions';
import { gameTotalSeconds, type PlaytimePlan, type PlanGame } from '@/utils/playtimePlanner/types';
import { getGameSlots } from '@/utils/playtimePlanner/lineup';
import { getPositionLabel } from '@/utils/positionLabels';
import { fairnessChipColors } from '@/utils/playtimePlanner/colors';
import { cardStyle, subtextStyle } from '@/styles/modalStyles';

/** Solid, distinct fill per zone for the distribution bar (dark-theme tuned). */
const ZONE_BAR_COLOR: Record<PlanZone, string> = {
  gk: '#38bdf8', // sky-400
  def: '#60a5fa', // blue-400
  mid: '#34d399', // emerald-400
  att: '#fb7185', // rose-400
};

interface PlanBalanceViewProps {
  plan: PlaytimePlan;
  highlightPlayerIds?: readonly string[];
  onToggleHighlight: (playerId: string) => void;
  /** Warnings replace the whole selection (exact-set toggle). */
  onReplaceHighlights: (playerIds: string[]) => void;
  /** Tap a focus card's game tile to open that game's lineup. */
  onOpenGame?: (gameId: string) => void;
}

const toMin = (sec: number): number => Math.round(sec / 60);

/** Fair share (ratio 1.0) draws an 80%-wide bar so over-share stays visible. */
const FAIR_SHARE_BAR_PCT = 80;

interface Warning {
  kind: 'zero' | 'sitout' | 'spread' | 'gk';
  label: string;
  detail: string;
  players: string[];
}

// House alert palette (modalStyles' -900/30 bg + -700 border scale).
const warningTone: Record<Warning['kind'], string> = {
  zero: 'bg-red-900/30 border-red-700 text-red-200',
  sitout: 'bg-amber-900/30 border-amber-700 text-amber-200',
  spread: 'bg-amber-900/30 border-amber-700 text-amber-200',
  gk: 'bg-sky-900/30 border-sky-700 text-sky-200',
};

const PlanBalanceView: React.FC<PlanBalanceViewProps> = ({
  plan,
  highlightPlayerIds = [],
  onToggleHighlight,
  onReplaceHighlights,
  onOpenGame,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'minutes' | 'positions'>('minutes');
  // Within Positions: coarse zones (GK/DEF/MID/ATT) or specific roles (RM, CDM…).
  const [granularity, setGranularity] = useState<'zones' | 'roles'>('zones');

  // Short zone labels for the position read (GK/DEF/MID/ATT).
  const zoneLabel = useMemo<Record<PlanZone, string>>(() => ({
    gk: t('playtimePlanner.balance.zoneGk', 'GK'),
    def: t('playtimePlanner.balance.zoneDef', 'DEF'),
    mid: t('playtimePlanner.balance.zoneMid', 'MID'),
    att: t('playtimePlanner.balance.zoneAtt', 'ATT'),
  }), [t]);

  const { minutes, gameTotals, nameById } = useMemo(() => {
    const m = computePlanMinutes(toEnginePlan(plan));
    return {
      minutes: m,
      gameTotals: plan.games.map((g) => gameTotalSeconds(g)),
      nameById: new Map(plan.players.map((p) => [p.id, p.name])),
    };
  }, [plan]);

  // Least-played first: the chip grid reads as a red→green gradient.
  const rows = useMemo(
    () =>
      [...minutes.players].sort((a, b) => {
        if (a.totalSeconds !== b.totalSeconds) return a.totalSeconds - b.totalSeconds;
        return (nameById.get(a.playerId) ?? '').localeCompare(nameById.get(b.playerId) ?? '');
      }),
    [minutes.players, nameById],
  );
  const rowById = useMemo(() => new Map(rows.map((r) => [r.playerId, r])), [rows]);

  // Players marked absent from EVERY included game earn no minutes by decision,
  // not by unfairness - they must not drive the spread warning or the default
  // "worst-off" focus (they'd always sort first with 0 seconds).
  const fullyAbsentIds = useMemo(() => {
    const included = plan.games.filter((g) => g.included);
    if (included.length === 0) return new Set<string>();
    return new Set(
      plan.players
        .map((p) => p.id)
        .filter((id) => included.every((g) => (g.absentIds ?? []).includes(id))),
    );
  }, [plan]);

  const gameShort = (i: number) => t('playtimePlanner.balance.gameShort', 'G{{n}}', { n: i + 1 });

  // Positions a player holds in one game: starting slot, plus any slot they enter
  // via a sub, deduped in order ("CB/ST"); em dash when they never appear.
  // Uses the field's real position labels (CB, ST, GK) rather than slot numbers.
  const positionsFor = (playerId: string, game: PlanGame): string => {
    const slots = getGameSlots(game.formationId);
    const labelOf = (slotId: string): string | null => {
      const slot = slots.find((s) => s.slotId === slotId);
      if (!slot) return null;
      return slot.isGoalie
        ? t('playtimePlanner.gkShort', 'GK')
        : getPositionLabel(slot.relX, slot.relY).label;
    };
    const seq: string[] = [];
    for (const a of game.startingSlots) {
      if (a.playerId === playerId) {
        const l = labelOf(a.slotId);
        if (l && !seq.includes(l)) seq.push(l);
      }
    }
    for (const sub of [...game.subs].sort((a, b) => a.timeSeconds - b.timeSeconds)) {
      if (sub.inPlayerId === playerId) {
        const l = labelOf(sub.slotId);
        if (l && !seq.includes(l)) seq.push(l);
      }
    }
    return seq.length > 0 ? seq.join('/') : '—';
  };

  // ── Warnings: surfaced problems, each tap replaces the highlight selection ──
  const warnings = useMemo((): Warning[] => {
    const out: Warning[] = [];
    const name = (id: string) => nameById.get(id) ?? id;

    // 1a. Players with NO minutes anywhere (truly forgotten - red alarm).
    // 1b. Players who sit out at least one FULL game but do play elsewhere -
    //     that is normal rotation, so it is an amber note, NOT the red alarm.
    //     (Auto-filled plans with varied starters made the old combined
    //     warning shout "15 players with 0 minutes" at a full roster.)
    const zeroGamesByPlayer = new Map<string, number[]>();
    plan.games.forEach((g, i) => {
      if (!g.included) return;
      // A marked absence is a decision, not a mistake - no alarm for it.
      const absent = new Set(g.absentIds ?? []);
      for (const p of minutes.players) {
        if (absent.has(p.playerId)) continue;
        if ((p.perGameSeconds[i] ?? 0) === 0) {
          const arr = zeroGamesByPlayer.get(p.playerId) ?? [];
          arr.push(i);
          zeroGamesByPlayer.set(p.playerId, arr);
        }
      }
    });
    const totalById = new Map(minutes.players.map((p) => [p.playerId, p.totalSeconds]));
    const describe = (ids: string[]) =>
      ids
        .slice(0, 3)
        .map((id) => `${name(id)} (${zeroGamesByPlayer.get(id)!.map(gameShort).join(', ')})`)
        .join(', ') + (ids.length > 3 ? ` +${ids.length - 3}` : '');
    const sortByName = (a: string, b: string) => name(a).localeCompare(name(b));

    const forgotten = [...zeroGamesByPlayer.keys()]
      .filter((id) => (totalById.get(id) ?? 0) === 0)
      .sort(sortByName);
    if (forgotten.length > 0) {
      out.push({
        kind: 'zero',
        label: t('playtimePlanner.balance.zeroMinutes', '{{count}} players with 0 minutes', {
          count: forgotten.length,
        }),
        detail: describe(forgotten),
        players: forgotten,
      });
    }

    const sitsOut = [...zeroGamesByPlayer.keys()]
      .filter((id) => (totalById.get(id) ?? 0) > 0)
      .sort(sortByName);
    if (sitsOut.length > 0) {
      out.push({
        kind: 'sitout',
        label: t('playtimePlanner.balance.sitsOut', '{{count}} players sit out a full game', {
          count: sitsOut.length,
        }),
        detail: describe(sitsOut),
        players: sitsOut,
      });
    }

    // 2. Spread between least- and most-played beyond 15 minutes - among
    // players actually participating (fully-absent players are excluded).
    const participating = rows.filter((r) => !fullyAbsentIds.has(r.playerId));
    if (participating.length > 1 && minutes.includedGameCount > 0) {
      const least = participating[0];
      const most = participating[participating.length - 1];
      const spread = toMin(most.totalSeconds - least.totalSeconds);
      if (spread > 15) {
        out.push({
          kind: 'spread',
          label: t('playtimePlanner.balance.spreadLabel', "{{spread}} min spread ({{min}}' - {{max}}')", {
            spread,
            min: toMin(least.totalSeconds),
            max: toMin(most.totalSeconds),
          }),
          detail: t('playtimePlanner.balance.spreadDetail', 'Least: {{least}} · Most: {{most}}', {
            least: name(least.playerId),
            most: name(most.playerId),
          }),
          players: [least.playerId, most.playerId],
        });
      }
    }

    // 3. A single goalkeeper across every included game.
    const keepers = new Set<string>();
    for (const g of plan.games) {
      if (!g.included) continue;
      const gkSlot = getGameSlots(g.formationId).find((s) => s.isGoalie)?.slotId;
      if (!gkSlot) continue;
      const starter = g.startingSlots.find((a) => a.slotId === gkSlot)?.playerId;
      if (starter) keepers.add(starter);
      for (const sub of g.subs) if (sub.slotId === gkSlot && sub.inPlayerId) keepers.add(sub.inPlayerId);
    }
    if (keepers.size === 1) {
      const sole = [...keepers][0];
      out.push({
        kind: 'gk',
        label: t('playtimePlanner.balance.gkLabel', 'Only {{name}} plays goalkeeper', {
          name: name(sole),
        }),
        detail: t('playtimePlanner.balance.gkDetail', 'Consider rotating goalkeepers'),
        players: [sole],
      });
    }
    return out;
    // gameShort/positionsFor are stable per render; the memo keys on the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, minutes, rows, fullyAbsentIds, nameById, t]);

  const anyHighlight = highlightPlayerIds.length > 0;
  // Focus stack: the highlighted players (least-played first), or the worst-off
  // player as the always-on default - the pane is never empty.
  const focusIds = useMemo(() => {
    const tracked = rows.filter((r) => highlightPlayerIds.includes(r.playerId)).map((r) => r.playerId);
    if (tracked.length > 0) return tracked;
    // Default focus = the worst-off PARTICIPANT; a player absent from every
    // game has zero minutes by decision and is not "worst-off".
    const worstOff = rows.find((r) => !fullyAbsentIds.has(r.playerId)) ?? rows[0];
    return worstOff ? [worstOff.playerId] : [];
  }, [rows, highlightPlayerIds, fullyAbsentIds]);

  const fairMin = minutes.fairShareSeconds !== null ? toMin(minutes.fairShareSeconds) : null;

  // ── Positions: zone distribution per player (the "control positions" read) ──
  const positions = useMemo(() => computePlanPositions(plan), [plan]);
  const posRows = useMemo(
    () =>
      // Only players who actually take the field; least variety first, then
      // least time, then name - so players stuck in one position surface first.
      positions.players
        .filter((p) => p.totalSeconds > 0)
        .sort((a, b) => {
          if (a.zoneCount !== b.zoneCount) return a.zoneCount - b.zoneCount;
          if (a.totalSeconds !== b.totalSeconds) return a.totalSeconds - b.totalSeconds;
          return (nameById.get(a.playerId) ?? '').localeCompare(nameById.get(b.playerId) ?? '');
        }),
    [positions.players, nameById],
  );
  // Players who only ever play ONE zone across the plan (variety flag).
  const singleZoneIds = useMemo(() => posRows.filter((p) => p.zoneCount === 1).map((p) => p.playerId), [posRows]);
  // Roles view: MOST distinct roles first, so the highest role-switching load
  // (the point of the detailed read - RM vs CDM is a real role change) surfaces.
  const roleRows = useMemo(
    () =>
      [...posRows].sort((a, b) => {
        if (b.positionCount !== a.positionCount) return b.positionCount - a.positionCount;
        if (a.totalSeconds !== b.totalSeconds) return a.totalSeconds - b.totalSeconds;
        return (nameById.get(a.playerId) ?? '').localeCompare(nameById.get(b.playerId) ?? '');
      }),
    [posRows, nameById],
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-200">{t('playtimePlanner.balance.title', 'Playing-time balance')}</h3>
        <p className={subtextStyle}>
          {fairMin === null
            ? plan.players.length === 0
              ? t('playtimePlanner.lineup.noPlayers', 'No players in this plan - add them on the Plan tab.')
              : t('playtimePlanner.balance.noGames', 'No games counted yet. Mark games as included.')
            : `${t('playtimePlanner.balance.fairShare', "Share {{minutes}}' each", {
                minutes: fairMin,
              })} · ${t('playtimePlanner.balance.gamesCounted', '{{count}} games counted', {
                count: minutes.includedGameCount,
              })}`}
        </p>
      </div>

      {/* Minutes / Positions toggle: the tab reads both time AND position
          variety (hence "Balance" / "Tasapaino"). */}
      <div className="flex w-full gap-2" role="tablist" aria-label={t('playtimePlanner.balance.readToggle', 'Balance view')}>
        {([
          ['minutes', t('playtimePlanner.balance.modeMinutes', 'Minutes')],
          ['positions', t('playtimePlanner.balance.modePositions', 'Positions')],
        ] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'minutes' && (<>
      <div className={`${cardStyle} space-y-3`}>
      {/* Warnings: tappable - each replaces the highlight with its players. */}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {warnings.map((w) => (
            <button
              key={w.kind}
              type="button"
              onClick={() => onReplaceHighlights(w.players)}
              className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left cursor-pointer ${warningTone[w.kind]}`}
            >
              <span className="text-[13px] font-bold">{w.label}</span>
              <span className="text-[11px] opacity-85">{w.detail}</span>
            </button>
          ))}
        </div>
      )}

      {/* Chip grid: whole-chip fairness colour, least-played first. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {rows.map((p) => {
          const name = nameById.get(p.playerId) ?? p.playerId;
          const c = fairnessChipColors(p.ratio);
          const highlighted = highlightPlayerIds.includes(p.playerId);
          return (
            <button
              key={p.playerId}
              type="button"
              onClick={() => onToggleHighlight(p.playerId)}
              aria-pressed={highlighted}
              className={[
                'flex items-center justify-between gap-2 px-4 py-3 min-h-[3.25rem] rounded-lg border border-black/25',
                'text-left font-semibold text-sm shadow-[0_1px_2px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                highlighted ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900 brightness-110' : '',
                anyHighlight && !highlighted ? 'opacity-40' : '',
              ].join(' ')}
              style={{ backgroundColor: c.bg, color: c.fg }}
            >
              <span className="flex-1 min-w-0 truncate">{name}</span>
              <span className="shrink-0 font-bold text-base tabular-nums opacity-90">
                {toMin(p.totalSeconds)}&#39;
              </span>
            </button>
          );
        })}
      </div>

      </div>

      {/* Focus stack: one card per tracked player (or the worst-off by default). */}
      <div className="flex flex-col gap-3">
        {focusIds.map((playerId) => {
          const p = rowById.get(playerId);
          if (!p) return null;
          const name = nameById.get(playerId) ?? playerId;
          const c = fairnessChipColors(p.ratio);
          const pct = p.ratio !== null ? Math.round(p.ratio * 100) : null;
          const barW = p.ratio !== null ? Math.min(100, Math.round(p.ratio * FAIR_SHARE_BAR_PCT)) : 0;
          // Per-player deviation from the ENGINE: with absences each player has
          // their own attending share, and the plan-wide average would
          // contradict the % / bar / chip (all ratio-based) on the same card.
          const deltaMin = p.ratio !== null ? toMin(p.deviationSeconds) : null;
          const deltaStr =
            deltaMin === null
              ? ''
              : deltaMin === 0
                ? t('playtimePlanner.balance.focusOnShare', 'on fair share')
                : t('playtimePlanner.balance.focusDelta', '{{delta}} min vs own share', {
                    delta: deltaMin > 0 ? `+${deltaMin}` : `${deltaMin}`,
                  });
          return (
            <div
              key={playerId}
              className="rounded-lg border border-slate-600/50 bg-gradient-to-b from-slate-800/90 to-slate-900/95 p-3.5 shadow-lg"
            >
              <div className="flex items-baseline justify-between gap-3 mb-2.5">
                <span className="flex-1 min-w-0 truncate text-lg font-bold text-slate-100">{name}</span>
                <span className="shrink-0 text-xl font-bold text-amber-300 tabular-nums">
                  {toMin(p.totalSeconds)}&#39;
                </span>
              </div>
              {pct !== null && (
                <div className="mb-3">
                  <div className="h-1.5 rounded-full bg-slate-950/70 border border-slate-600/50 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${barW}%`, backgroundColor: c.bg }}
                    />
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-400">
                    {t('playtimePlanner.balance.ofFairShare', '{{pct}}% of share', { pct })}
                    {deltaStr ? ` · ${deltaStr}` : ''}
                  </p>
                </div>
              )}
              {/* Per-game tiles: position + minutes, tinted full/half/zero; tap = open lineup. */}
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${Math.min(plan.games.length, 5)}, 1fr)` }}
              >
                {plan.games.map((g, i) => {
                  const sec = p.perGameSeconds[i] ?? 0;
                  const gRatio = gameTotals[i] > 0 ? sec / gameTotals[i] : 0;
                  const tone =
                    gRatio >= 0.95
                      ? 'bg-green-500/20 border-green-500/50 [&_.fg-mins]:text-green-300'
                      : gRatio >= 0.05
                        ? 'bg-amber-400/15 border-amber-400/45 [&_.fg-mins]:text-amber-200'
                        : 'bg-red-500/10 border-red-500/40 [&_.fg-mins]:text-red-300';
                  const tileClasses = [
                    'flex flex-col items-center gap-0.5 px-1 py-1.5 min-h-[3.9rem] rounded-md border text-center',
                    tone,
                    !g.included ? 'opacity-40 line-through' : '',
                  ].join(' ');
                  return onOpenGame ? (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => onOpenGame(g.id)}
                      title={g.label}
                      className={`${tileClasses} focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
                    >
                      <span className="text-[9px] font-medium text-slate-400">
                        {gameShort(i)}
                      </span>
                      <span className="text-[11px] font-bold text-amber-300 truncate max-w-full">
                        {positionsFor(playerId, g)}
                      </span>
                      <span className="fg-mins text-xs font-bold tabular-nums">{toMin(sec)}&#39;</span>
                    </button>
                  ) : (
                    <div key={g.id} title={g.label} className={tileClasses}>
                      <span className="text-[9px] font-medium text-slate-400">
                        {gameShort(i)}
                      </span>
                      <span className="text-[11px] font-bold text-amber-300 truncate max-w-full">
                        {positionsFor(playerId, g)}
                      </span>
                      <span className="fg-mins text-xs font-bold tabular-nums">{toMin(sec)}&#39;</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </>)}

      {mode === 'positions' && (
        <div className={`${cardStyle} space-y-3`}>
          {posRows.length === 0 ? (
            <p className={subtextStyle}>
              {t('playtimePlanner.balance.noPositionData', 'No positions yet. Fill in some lineups on included games.')}
            </p>
          ) : (
            <>
              {/* Zones | Roles: coarse zones vs specific positions. Roles reads
                  the switching load INSIDE a zone (RM vs CDM are both mid). */}
              <div className="flex w-full gap-2" role="group" aria-label={t('playtimePlanner.balance.granularityToggle', 'Position detail')}>
                {([
                  ['zones', t('playtimePlanner.balance.granularityZones', 'Zones')],
                  ['roles', t('playtimePlanner.balance.granularityRoles', 'Roles')],
                ] as const).map(([g, label]) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGranularity(g)}
                    aria-pressed={granularity === g}
                    className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      granularity === g ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Zone legend (colours are shared - a role is tinted by its zone). */}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {PLAN_ZONES.map((z) => (
                  <span key={z} className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ZONE_BAR_COLOR[z] }} aria-hidden="true" />
                    {zoneLabel[z]}
                  </span>
                ))}
              </div>

              {granularity === 'zones' ? (
                <>
                  {/* Variety flag: players stuck in a single zone (tap to highlight). */}
                  {singleZoneIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onReplaceHighlights(singleZoneIds)}
                      className="flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left cursor-pointer bg-amber-900/30 border-amber-700 text-amber-200"
                    >
                      <span className="text-[13px] font-bold">
                        {t('playtimePlanner.balance.oneZone', '{{count}} players play only one position', { count: singleZoneIds.length })}
                      </span>
                      <span className="text-[11px] opacity-85">
                        {t('playtimePlanner.balance.oneZoneDetail', 'Tap to review and rotate them')}
                      </span>
                    </button>
                  )}

                  {/* Per-player zone distribution: a stacked bar + minutes per zone.
                      Shares the highlight selection with the minutes chips + lineup. */}
                  <div className="flex flex-col gap-2">
                    {posRows.map((p) => {
                      const name = nameById.get(p.playerId) ?? p.playerId;
                      const highlighted = highlightPlayerIds.includes(p.playerId);
                      const zones = PLAN_ZONES.filter((z) => p.byZone[z] > 0);
                      return (
                        <button
                          key={p.playerId}
                          type="button"
                          onClick={() => onToggleHighlight(p.playerId)}
                          aria-pressed={highlighted}
                          className={[
                            'w-full flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border border-slate-600/50 bg-slate-800/60 text-left',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                            highlighted ? 'ring-2 ring-amber-300' : '',
                            anyHighlight && !highlighted ? 'opacity-40' : '',
                          ].join(' ')}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="flex-1 min-w-0 truncate font-semibold text-sm text-slate-100">{name}</span>
                            <span className="shrink-0 text-xs text-slate-400 tabular-nums">{toMin(p.totalSeconds)}&#39;</span>
                          </div>
                          <div className="flex h-2 rounded-full overflow-hidden bg-slate-950/60">
                            {zones.map((z) => (
                              <div
                                key={z}
                                style={{ width: `${(p.byZone[z] / p.totalSeconds) * 100}%`, backgroundColor: ZONE_BAR_COLOR[z] }}
                                title={`${zoneLabel[z]} ${toMin(p.byZone[z])}'`}
                              />
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {zones.map((z) => (
                              <span key={z} className="text-[11px] font-medium tabular-nums" style={{ color: ZONE_BAR_COLOR[z] }}>
                                {zoneLabel[z]} {toMin(p.byZone[z])}&#39;
                              </span>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* Roles: specific positions, tinted by zone, most-roles-first.
                   The role count is the switching-load headline. */
                <div className="flex flex-col gap-2">
                  {roleRows.map((p) => {
                    const name = nameById.get(p.playerId) ?? p.playerId;
                    const highlighted = highlightPlayerIds.includes(p.playerId);
                    const labels = Object.keys(p.byLabel)
                      .filter((l) => p.byLabel[l] > 0)
                      .sort((a, b) => p.byLabel[b] - p.byLabel[a]);
                    return (
                      <button
                        key={p.playerId}
                        type="button"
                        onClick={() => onToggleHighlight(p.playerId)}
                        aria-pressed={highlighted}
                        className={[
                          'w-full flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border border-slate-600/50 bg-slate-800/60 text-left',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                          highlighted ? 'ring-2 ring-amber-300' : '',
                          anyHighlight && !highlighted ? 'opacity-40' : '',
                        ].join(' ')}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="flex-1 min-w-0 truncate font-semibold text-sm text-slate-100">{name}</span>
                          <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                            {t('playtimePlanner.balance.rolesCount', '{{count}} roles', { count: p.positionCount })}
                          </span>
                        </div>
                        <div className="flex h-2 rounded-full overflow-hidden bg-slate-950/60">
                          {labels.map((l) => (
                            <div
                              key={l}
                              className="border-r border-slate-950/50 last:border-r-0"
                              style={{ width: `${(p.byLabel[l] / p.totalSeconds) * 100}%`, backgroundColor: ZONE_BAR_COLOR[zoneOfLabel(l)] }}
                              title={`${l} ${toMin(p.byLabel[l])}'`}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {labels.map((l) => (
                            <span key={l} className="text-[11px] font-medium tabular-nums" style={{ color: ZONE_BAR_COLOR[zoneOfLabel(l)] }}>
                              {l} {toMin(p.byLabel[l])}&#39;
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PlanBalanceView;
