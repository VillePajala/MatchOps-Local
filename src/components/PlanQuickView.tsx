'use client';

/**
 * PlanQuickView - the playing-time planner in COMPACT mode for one game
 * (Onboarding v3, "Peluutus").
 *
 * The coach lands here right after naming the next game. It is the planner
 * reduced to one game: no Pelit / Tasapaino / Asetukset tabs, just the facts,
 * the planned minutes, the pitch with tap-to-swap (PlanFieldView, the same
 * pitch the full planner uses), the keeper line, "Sekoita uudelleen", and
 * "muuta" for the date and the length. "Tarkempi muokkaus" opens the FULL
 * planner for the same plan as a layer; closing it returns here with the
 * changes. Every edit is saved to the plan and re-applied to its (unplayed)
 * game straight away, so leaving at any moment leaves the two in step.
 *
 * Copy rule: facts only (who starts, minutes, changes) - never a claim about
 * fairness or that everyone plays.
 *
 * Reusable on purpose: Home's "Näytä peluutus" will open this same screen.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useToast } from '@/contexts/ToastProvider';
import { getPlan, savePlan } from '@/utils/playtimePlanner/storage';
import { getPlanLink } from '@/utils/playtimePlanner/planLinks';
import { setGameSubs } from '@/utils/playtimePlanner/gameSubs';
import { swapPlayersInGame } from '@/utils/playtimePlanner/swap';
import { assignPlayerToSlot, ensureStartingSlots, getGameSlots } from '@/utils/playtimePlanner/lineup';
import { computePlanMinutes } from '@/utils/playtimePlanner/minutes';
import { toEnginePlan } from '@/utils/playtimePlanner/adapter';
import type { PlaytimePlan, PlanGame } from '@/utils/playtimePlanner/types';
import { getGame, saveGame } from '@/utils/savedGames';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { getPresetById } from '@/config/formationPresets';
import { changePlanGameLength, reshufflePlan, syncPairedGame } from '@/services/nextGamePair';
import { formatShortGameDay } from '@/utils/nextGameDates';
import type { AppState } from '@/types';
import PlanFieldView from '@/components/PlanFieldView';
import { lazyModal } from '@/components/lazyModal';
import logger from '@/utils/logger';
import {
  titleStyle,
  subtextStyle,
  sectionLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  inputBaseStyle,
  selectStyle,
  segmentTrackStyle,
  segmentStyle,
  segmentSelectedStyle,
  chipStyle,
  chipSelectedStyle,
  labelStyle,
} from '@/styles/modalStyles';

const PlaytimePlannerModal = lazyModal(() => import('@/components/PlaytimePlannerModal'));

/** An inline "muuta" link: ink, underlined, 44px tall target. */
const changeLinkStyle =
  'inline-flex min-h-11 -my-2.5 items-center px-1 font-ui text-sm font-semibold text-ink underline decoration-ink-3 underline-offset-[3px] hover:decoration-ink rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-action';

/** A secondary action drawn as a quiet underlined link (44px target). */
const quietActionStyle =
  'inline-flex min-h-11 items-center px-2 font-ui text-sm font-semibold text-ink-2 hover:text-ink underline decoration-ink-3/70 underline-offset-[3px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-action';

const MINUTE_OPTIONS = [5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45];

export interface PlanQuickViewProps {
  planId: string;
  gameId: string;
  userId: string | undefined;
  /** "Näyttää hyvältä": the coach is done here. */
  onDone: () => void;
}

const PlanQuickView: React.FC<PlanQuickViewProps> = ({ planId, gameId, userId, onDone }) => {
  const { t } = useTranslation();
  const [language] = useAppLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [plan, setPlan] = useState<PlaytimePlan | null>(null);
  const [game, setGame] = useState<AppState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<null | 'date' | 'length' | 'keeper'>(null);
  const [fullPlannerOpen, setFullPlannerOpen] = useState(false);
  // Draft values for the inline editors.
  const [dateDraft, setDateDraft] = useState('');
  const [periodsDraft, setPeriodsDraft] = useState<1 | 2>(2);
  const [minutesDraft, setMinutesDraft] = useState(15);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, g] = await Promise.all([getPlan(planId), getGame(gameId, userId)]);
        if (cancelled) return;
        if (!p || !g || p.games.length === 0) {
          setLoadFailed(true);
          return;
        }
        setPlan(p);
        setGame(g);
      } catch (error) {
        logger.error('[PlanQuickView] load failed:', error);
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, gameId, userId]);

  // ── Save + re-apply, one at a time and in order ─────────────────────────
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const persist = useCallback(
    (next: PlaytimePlan, gamePatch?: Parameters<typeof syncPairedGame>[3]) => {
      chainRef.current = chainRef.current.then(async () => {
        try {
          await syncPairedGame(
            {
              savePlan,
              getGame: (id) => getGame(id, userId),
              saveGame: (id, g) => saveGame(id, g, userId),
              getPlanLink,
              getMasterRoster: () => getMasterRoster(userId),
              setGameSubs,
            },
            next,
            gameId,
            gamePatch,
          );
          await queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });
        } catch (error) {
          logger.error('[PlanQuickView] save failed:', error);
          showToast(t('firstPlan.saveError', 'Could not save the change. Please try again.'), 'error');
        }
      });
      return chainRef.current;
    },
    [gameId, userId, queryClient, showToast, t],
  );

  const planGame: PlanGame | null = plan?.games[0] ?? null;

  const updatePlanGame = useCallback(
    (mutate: (g: PlanGame) => PlanGame) => {
      if (!plan || !planGame) return;
      const next: PlaytimePlan = {
        ...plan,
        games: plan.games.map((g) => (g.id === planGame.id ? mutate(g) : g)),
      };
      setPlan(next);
      void persist(next);
    },
    [plan, planGame, persist],
  );

  // ── Pitch interactions ──────────────────────────────────────────────────
  const handleSwap = useCallback(
    (a: string, b: string) => updatePlanGame((g) => swapPlayersInGame(g, a, b)),
    [updatePlanGame],
  );
  // A bench player tapped onto a position takes that player's WHOLE game (a
  // swap), so a substitute never ends up in two places; an empty spot is filled.
  const handleAssign = useCallback(
    (slotId: string, playerId: string | null) =>
      updatePlanGame((g) => {
        const occupant = ensureStartingSlots(g).find((s) => s.slotId === slotId)?.playerId ?? null;
        if (occupant && playerId && occupant !== playerId) return swapPlayersInGame(g, occupant, playerId);
        return { ...g, startingSlots: assignPlayerToSlot(ensureStartingSlots(g), slotId, playerId) };
      }),
    [updatePlanGame],
  );

  const handleReshuffle = useCallback(() => {
    if (!plan) return;
    const next = reshufflePlan(plan);
    setPlan(next);
    void persist(next);
  }, [plan, persist]);

  // ── Derived facts ───────────────────────────────────────────────────────
  const nameById = useMemo(() => new Map((plan?.players ?? []).map((p) => [p.id, p.name])), [plan]);
  const keeperId = useMemo(() => {
    if (!planGame) return null;
    const gkSlot = getGameSlots(planGame.formationId).find((s) => s.isGoalie);
    if (!gkSlot) return null;
    return ensureStartingSlots(planGame).find((s) => s.slotId === gkSlot.slotId)?.playerId ?? null;
  }, [planGame]);

  const minutesRows = useMemo(() => {
    if (!plan) return [];
    const engine = computePlanMinutes(toEnginePlan(plan));
    const absent = new Set(planGame?.absentIds ?? []);
    return engine.players
      .filter((m) => !absent.has(m.playerId))
      .map((m) => ({
        id: m.playerId,
        name: nameById.get(m.playerId) ?? m.playerId,
        minutes: Math.round(m.totalSeconds / 60),
      }));
  }, [plan, planGame, nameById]);

  const subTimes = useMemo(() => {
    if (!planGame) return [];
    const counts = new Map<number, number>();
    for (const s of planGame.subs) {
      if (!s.inPlayerId) continue;
      counts.set(s.timeSeconds, (counts.get(s.timeSeconds) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [planGame]);

  const formatClock = (seconds: number): string =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  // ── Inline editors ──────────────────────────────────────────────────────
  const openDateEditor = () => {
    setDateDraft(game?.gameDate ?? '');
    setEditing((e) => (e === 'date' ? null : 'date'));
  };
  const openLengthEditor = () => {
    if (!planGame) return;
    setPeriodsDraft(planGame.numberOfPeriods === 1 ? 1 : 2);
    setMinutesDraft(planGame.periodMinutes);
    setEditing((e) => (e === 'length' ? null : 'length'));
  };
  const applyDate = () => {
    if (!plan || !game || !/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) return;
    setGame({ ...game, gameDate: dateDraft });
    setEditing(null);
    void persist(plan, { gameDate: dateDraft });
  };
  const applyLength = () => {
    if (!plan || !planGame || !game) return;
    const next = changePlanGameLength(plan, planGame.id, periodsDraft, minutesDraft);
    setPlan(next);
    setGame({ ...game, numberOfPeriods: periodsDraft, periodDurationMinutes: minutesDraft });
    setEditing(null);
    void persist(next, { numberOfPeriods: periodsDraft, periodDurationMinutes: minutesDraft });
  };
  const pickKeeper = (playerId: string) => {
    if (keeperId && playerId !== keeperId) handleSwap(keeperId, playerId);
    setEditing(null);
  };

  // ── Full planner as a layer ─────────────────────────────────────────────
  const latestFromFullRef = useRef<PlaytimePlan | null>(null);
  const handleFullPlannerChange = useCallback(
    (p: PlaytimePlan) => {
      if (p.id === planId) latestFromFullRef.current = p;
    },
    [planId],
  );
  const closeFullPlanner = useCallback(() => {
    setFullPlannerOpen(false);
    const edited = latestFromFullRef.current;
    latestFromFullRef.current = null;
    if (!edited || edited.games.length === 0) return;
    setPlan(edited);
    const g0 = edited.games[0];
    const lengthChanged =
      game && (game.numberOfPeriods !== g0.numberOfPeriods || game.periodDurationMinutes !== g0.periodMinutes);
    if (game && lengthChanged) {
      const periods: 1 | 2 = g0.numberOfPeriods === 1 ? 1 : 2;
      setGame({ ...game, numberOfPeriods: periods, periodDurationMinutes: g0.periodMinutes });
      void persist(edited, { numberOfPeriods: periods, periodDurationMinutes: g0.periodMinutes });
    } else {
      void persist(edited);
    }
  }, [game, persist]);

  const handleDone = useCallback(async () => {
    await chainRef.current; // the last edit is written before leaving
    onDone();
  }, [onDone]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (loadFailed) {
    return (
      <div className="s1-canvas min-h-screen min-h-[100dvh] font-ui text-ink flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className={subtextStyle}>{t('firstPlan.loadError', 'The plan could not be opened.')}</p>
        <button type="button" onClick={onDone} className={`${primaryButtonStyle} w-full max-w-sm min-h-12`}>
          {t('firstPlan.toHome', 'Go to Home')}
        </button>
      </div>
    );
  }
  if (!plan || !planGame || !game) {
    return (
      <div
        className="s1-canvas min-h-screen min-h-[100dvh] font-ui text-ink-3 flex items-center justify-center"
        role="status"
      >
        {t('common.loading', 'Loading...')}
      </div>
    );
  }

  const fieldSize = getPresetById(planGame.formationId)?.fieldSize ?? '';
  const playerCount = plan.players.length - (planGame.absentIds?.length ?? 0);

  return (
    <div
      data-testid="plan-quick-view"
      className="s1-canvas relative h-screen h-[100dvh] overflow-y-auto font-ui text-ink"
    >
      <div className="w-full max-w-md mx-auto px-4 pt-5 pb-8 pb-safe space-y-4">
        <header className="space-y-2">
          <h1 className={titleStyle}>{t('firstPlan.title', 'Rotation')}</h1>
          <p className="text-[15px] text-ink-2 flex flex-wrap items-center gap-x-1.5">
            <span data-testid="plan-quick-date">{formatShortGameDay(game.gameDate, language)}</span>
            <button
              type="button"
              onClick={openDateEditor}
              aria-expanded={editing === 'date'}
              aria-label={t('firstPlan.changeDateAria', 'Change the date')}
              className={changeLinkStyle}
            >
              {t('firstPlan.change', 'change')}
            </button>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-ink">
              {game.teamName} – {game.opponentName}
            </span>
          </p>
          <p className="text-[15px] text-ink-2 flex flex-wrap items-center gap-x-1.5" data-testid="plan-quick-facts">
            <span>
              {t('firstPlan.facts', '{{players}} players · {{format}} · {{periods}} × {{minutes}} min', {
                players: playerCount,
                format: fieldSize,
                periods: planGame.numberOfPeriods,
                minutes: planGame.periodMinutes,
              })}
            </span>
            <button
              type="button"
              onClick={openLengthEditor}
              aria-expanded={editing === 'length'}
              aria-label={t('firstPlan.changeLengthAria', 'Change the length')}
              className={changeLinkStyle}
            >
              {t('firstPlan.change', 'change')}
            </button>
          </p>
        </header>

        {editing === 'date' && (
          <div className="s1-list p-4 space-y-3">
            <label htmlFor="plan-quick-date-input" className={labelStyle}>
              {t('nextGameStep.dateLabel', 'Date')}
            </label>
            <input
              id="plan-quick-date-input"
              type="date"
              value={dateDraft}
              onChange={(e) => setDateDraft(e.target.value)}
              className={`${inputBaseStyle} [color-scheme:dark]`}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className={`${secondaryButtonStyle} flex-1`}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={applyDate}
                disabled={!dateDraft}
                className={`${primaryButtonStyle} flex-1`}
              >
                {t('common.save', 'Save')}
              </button>
            </div>
          </div>
        )}

        {editing === 'length' && (
          <div className="s1-list p-4 space-y-3" data-testid="plan-quick-length-editor">
            <div className={segmentTrackStyle} role="group" aria-label={t('firstPlan.periodsLabel', 'Periods')}>
              {([1, 2] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={periodsDraft === n}
                  onClick={() => setPeriodsDraft(n)}
                  className={periodsDraft === n ? segmentSelectedStyle : segmentStyle}
                >
                  {n === 1 ? t('firstPlan.periodsOne', '1 period') : t('firstPlan.periodsTwo', '2 periods')}
                </button>
              ))}
            </div>
            <label htmlFor="plan-quick-minutes" className={labelStyle}>
              {t('firstPlan.minutesLabel', 'Minutes per period')}
            </label>
            <select
              id="plan-quick-minutes"
              value={minutesDraft}
              onChange={(e) => setMinutesDraft(Number(e.target.value))}
              className={selectStyle}
            >
              {[...new Set([...MINUTE_OPTIONS, planGame.periodMinutes])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {t('firstPlan.minutesOption', '{{m}} min', { m })}
                  </option>
                ))}
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className={`${secondaryButtonStyle} flex-1`}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button type="button" onClick={applyLength} className={`${primaryButtonStyle} flex-1`}>
                {t('common.save', 'Save')}
              </button>
            </div>
          </div>
        )}

        <section aria-labelledby="plan-quick-minutes-heading">
          <h2 id="plan-quick-minutes-heading" className={`${sectionLabelStyle} mb-2`}>
            {t('firstPlan.plannedMinutes', 'Planned playing time')}
          </h2>
          <ul className="grid grid-cols-3 gap-1.5" data-testid="plan-quick-minutes">
            {minutesRows.map((row) => (
              <li
                key={row.id}
                className="s1-list flex items-center justify-between gap-1 px-2.5 min-h-10 rounded-xl text-[13px]"
              >
                <span className="truncate font-semibold">{row.name}</span>
                <span className="shrink-0 tabular-nums text-ink-2">{row.minutes}&#39;</span>
              </li>
            ))}
          </ul>
        </section>

        <PlanFieldView
          game={planGame}
          players={plan.players}
          onAssign={handleAssign}
          onSwapPlayers={handleSwap}
        />

        <div className="space-y-1">
          <p className="text-[15px] text-ink flex flex-wrap items-center gap-x-1.5" data-testid="plan-quick-keeper">
            <span>
              {keeperId
                ? t('firstPlan.keeper', 'In goal: {{name}}', { name: nameById.get(keeperId) ?? '' })
                : t('firstPlan.noKeeper', 'No keeper yet')}
            </span>
            {keeperId && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setEditing((e) => (e === 'keeper' ? null : 'keeper'))}
                  aria-expanded={editing === 'keeper'}
                  className={changeLinkStyle}
                >
                  {t('firstPlan.changeKeeper', 'change')}
                </button>
              </>
            )}
          </p>
          {editing === 'keeper' && keeperId && (
            <div role="group" aria-label={t('firstPlan.pickKeeper', 'Who goes in goal?')} className="flex flex-wrap gap-2 pt-1">
              {plan.players
                .filter((p) => !(planGame.absentIds ?? []).includes(p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={p.id === keeperId}
                    onClick={() => pickKeeper(p.id)}
                    className={p.id === keeperId ? chipSelectedStyle : chipStyle}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          )}
          <p className={subtextStyle}>
            {t('firstPlan.swapHint', 'To swap two players, tap one and then the other.')}
          </p>
          {subTimes.length > 0 && (
            <p className={subtextStyle} data-testid="plan-quick-subs">
              {t('firstPlan.subsLine', 'Changes: {{times}}', {
                times: subTimes
                  .map(([sec, count]) =>
                    t('firstPlan.subsAt', '{{time}} ({{n}})', { time: formatClock(sec), n: count }),
                  )
                  .join(', '),
              })}
            </p>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="button"
            data-testid="plan-quick-done"
            onClick={() => void handleDone()}
            className={`${primaryButtonStyle} w-full min-h-12`}
          >
            {t('firstPlan.looksGood', 'Looks good')}
          </button>
          {/* Two quiet links, not buttons: "Näyttää hyvältä" is the one action. */}
          <div className="flex flex-wrap justify-center gap-x-4">
            <button
              type="button"
              data-testid="plan-quick-reshuffle"
              onClick={handleReshuffle}
              className={quietActionStyle}
            >
              {t('firstPlan.reshuffle', 'Shuffle again')}
            </button>
            <button
              type="button"
              data-testid="plan-quick-full"
              onClick={() => setFullPlannerOpen(true)}
              className={quietActionStyle}
            >
              {t('firstPlan.moreEditing', 'Detailed editing')}
            </button>
          </div>
        </div>
      </div>

      {fullPlannerOpen && (
        <PlaytimePlannerModal
          isOpen
          onClose={closeFullPlanner}
          initialTarget={{ planId, planGameId: planGame.id }}
          onActivePlanChange={handleFullPlannerChange}
          singlePlanLayer
        />
      )}
    </div>
  );
};

export default PlanQuickView;
