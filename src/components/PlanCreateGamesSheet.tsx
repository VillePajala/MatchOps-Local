'use client';

/**
 * "Luo kaikki pelit" - create a real game for every planned game of a plan
 * that does not have one yet, from one sheet.
 *
 * Team, competition and game type are chosen once at the top; each planned
 * game gets its own opponent, date, kick-off (optional - tournament times are
 * often not known yet), venue (optional, the same venue field as the new-game
 * form) and home/away. A date or venue entered in one game fills the empty
 * ones after it. Every row is checked
 * before anything is created, so a missing opponent never leaves half the
 * games made. If a game still fails to save, the sheet keeps that row (and
 * what was typed in it) and says which one; the games that were made drop out.
 *
 * SEVERAL GAMES, VISIBLY. The owner's first look read the sheet as one game:
 * the first game's fields filled the phone screen. So the top says how many
 * games will be made, and each game is its own block headed "Peli N · label"
 * that folds to a one-line summary (opponent · date · time · side). Only the
 * first is open at the start, so the others show below it.
 *
 * The sheet only collects input. Creating is the caller's job (`onSubmit`),
 * which reports per planned game what happened.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineChevronDown } from 'react-icons/hi2';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import VenueInput from '@/components/VenueInput';
import TimeInput from '@/components/TimeInput';
import type { KnownVenue } from '@/utils/venueBook';
import {
  Z_LAYER,
  cardStyle,
  dialogTitleStyle,
  fieldErrorStyle,
  fieldHintStyle,
  inputBaseStyle,
  inputErrorStyle,
  labelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionLabelStyle,
  segmentSelectedStyle,
  segmentStyle,
  segmentTrackStyle,
  selectStyle,
  subtextStyle,
} from '@/styles/modalStyles';
import {
  buildBatchShared,
  defaultGameType,
  isPlaceholderLabel,
  opponentFromLabel,
  teamDefaultCompetition,
  validSeries,
  validatePlanBatch,
  type CreateGamesFromPlanResult,
  type PlanBatchCompetition,
  type PlanBatchFieldError,
  type PlanBatchRow,
  type PlanBatchShared,
  type PlanBatchValidation,
} from '@/utils/playtimePlanner/createFromPlan';
import type { PlanGame, PlaytimePlan } from '@/utils/playtimePlanner/types';
import type { GameType, Season, Team, Tournament } from '@/types';

interface PlanCreateGamesSheetProps {
  plan: PlaytimePlan;
  /** The planned games without a real game yet, in plan order. */
  games: PlanGame[];
  teams: Team[];
  seasons: Season[];
  tournaments: Tournament[];
  /** The coach's venue book, for the venue field's own-venue suggestions. */
  knownVenues?: readonly KnownVenue[];
  onSubmit: (shared: PlanBatchShared, rows: PlanBatchRow[]) => Promise<CreateGamesFromPlanResult>;
  /** Every row was created (or already existed): the caller closes the sheet. */
  onDone: (result: CreateGamesFromPlanResult) => void;
  onClose: () => void;
}

const competitionValue = (c: PlanBatchCompetition): string =>
  c.kind === 'none' ? '' : `${c.kind}:${c.id}`;

const PlanCreateGamesSheet: React.FC<PlanCreateGamesSheetProps> = ({
  plan,
  games,
  teams,
  seasons,
  tournaments,
  knownVenues,
  onSubmit,
  onDone,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => opener?.focus();
  }, []);

  const initialTeam = teams.find((tm) => tm.id === plan.teamId);
  const [teamId, setTeamId] = useState<string>(initialTeam?.id ?? '');
  const [typedTeamName, setTypedTeamName] = useState('');
  const [competition, setCompetition] = useState<PlanBatchCompetition>(() =>
    teamDefaultCompetition(initialTeam, tournaments),
  );
  const [gameType, setGameType] = useState<GameType>(() =>
    defaultGameType(teamDefaultCompetition(initialTeam, tournaments), initialTeam, seasons, tournaments),
  );
  const team = teams.find((tm) => tm.id === teamId);

  const competitionVenue = (c: PlanBatchCompetition): string =>
    c.kind === 'season'
      ? seasons.find((se) => se.id === c.id)?.location ?? ''
      : c.kind === 'tournament'
        ? tournaments.find((tt) => tt.id === c.id)?.location ?? ''
        : '';

  const [rows, setRows] = useState<PlanBatchRow[]>(() => {
    const venue = competitionVenue(teamDefaultCompetition(initialTeam, tournaments));
    const ownNames = teams.map((tm) => tm.name);
    return games.map((g) => {
      const fromLabel = opponentFromLabel(g.label, ownNames);
      return {
        planGameId: g.id,
        opponentName: fromLabel.opponent,
        gameDate: '',
        gameTime: '',
        gameLocation: venue,
        homeOrAway: fromLabel.homeOrAway ?? 'home',
      };
    });
  });
  /**
   * Rows whose venue nobody typed (the competition's venue, or filled down
   * from an earlier game): a venue entered higher up may replace them.
   */
  const [autoVenue, setAutoVenue] = useState<Set<string>>(() => new Set(games.map((g) => g.id)));
  /** Open game blocks. Only the first at the start, so the rest show below it. */
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set(games.slice(0, 1).map((g) => g.id)));
  const [validation, setValidation] = useState<PlanBatchValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedLabels, setFailedLabels] = useState<string[]>([]);

  const activeSeasons = useMemo(() => seasons.filter((se) => !se.archived), [seasons]);
  const activeTournaments = useMemo(() => tournaments.filter((tt) => !tt.archived), [tournaments]);
  const selectedTournament =
    competition.kind === 'tournament' ? tournaments.find((tt) => tt.id === competition.id) : undefined;
  const seriesOptions = validSeries(selectedTournament);

  const labelOf = (planGameId: string) => plan.games.find((g) => g.id === planGameId)?.label ?? '';

  const planNumberOf = (planGameId: string) => plan.games.findIndex((g) => g.id === planGameId) + 1;

  /** "Peli 3 · HJK"; a default label ("Peli 3") is shown as it is. */
  const headingOf = (planGameId: string) => {
    const label = labelOf(planGameId).trim();
    if (isPlaceholderLabel(label)) return label || t('planCreateGames.gameNumber', 'Game {{number}}', { number: planNumberOf(planGameId) });
    return t('planCreateGames.gameHeading', 'Game {{number}} · {{label}}', { number: planNumberOf(planGameId), label });
  };

  const formatDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    try {
      return new Date(y, m - 1, d).toLocaleDateString(i18n.language || undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  /** The folded block's line: what is set, and what is still missing. */
  const summaryOf = (row: PlanBatchRow) =>
    [
      row.opponentName.trim() || t('planCreateGames.noOpponent', 'Opponent missing'),
      row.gameDate ? formatDate(row.gameDate) : t('planCreateGames.noDate', 'Date missing'),
      row.gameTime,
      row.homeOrAway === 'home' ? t('planCreateGames.home', 'Home') : t('planCreateGames.away', 'Away'),
    ]
      .filter(Boolean)
      .join(' · ');

  const toggleRow = (planGameId: string) =>
    setOpenRows((open) => {
      const next = new Set(open);
      if (next.has(planGameId)) next.delete(planGameId);
      else next.add(planGameId);
      return next;
    });

  /** A competition change re-derives the game type and fills venues nobody typed. */
  const applyCompetition = (next: PlanBatchCompetition, forTeam: Team | undefined) => {
    const prevVenue = competitionVenue(competition);
    const nextVenue = competitionVenue(next);
    setCompetition(next);
    setGameType(defaultGameType(next, forTeam, seasons, tournaments));
    // The competition names a venue but not where it is: no pin travels with it.
    setRows((rs) =>
      rs.map((r) =>
        r.gameLocation === '' || r.gameLocation === prevVenue
          ? { ...r, gameLocation: nextVenue, locationLat: undefined, locationLng: undefined, locationAddress: undefined }
          : r,
      ),
    );
  };

  const handleTeamChange = (id: string) => {
    setTeamId(id);
    const nextTeam = teams.find((tm) => tm.id === id);
    applyCompetition(teamDefaultCompetition(nextTeam, tournaments), nextTeam);
  };

  const handleCompetitionChange = (value: string) => {
    if (!value) return applyCompetition({ kind: 'none' }, team);
    const [kind, id] = value.split(':');
    if (kind === 'season') return applyCompetition({ kind: 'season', id }, team);
    const series = validSeries(tournaments.find((tt) => tt.id === id));
    applyCompetition({ kind: 'tournament', id, seriesId: series[0]?.id ?? null }, team);
  };

  const updateRow = (index: number, patch: Partial<PlanBatchRow>) => {
    setRows((rs) =>
      rs.map((r, i) => {
        if (i === index) return { ...r, ...patch };
        // A tournament's games are usually on one day: a date typed into a row
        // fills the empty rows after it (each stays editable).
        if (patch.gameDate && i > index && r.gameDate === '') return { ...r, gameDate: patch.gameDate };
        return r;
      }),
    );
  };

  /**
   * A venue entered in one game fills the games after it whose venue is empty
   * or was never typed there (each stays editable) - like the date.
   */
  const updateVenue = (
    index: number,
    venue: { name: string; latitude?: number; longitude?: number; address?: string },
  ) => {
    const patch = {
      gameLocation: venue.name,
      locationLat: venue.latitude,
      locationLng: venue.longitude,
      locationAddress: venue.address,
    };
    const follows = (r: PlanBatchRow, i: number) =>
      i > index && (r.gameLocation === '' || autoVenue.has(r.planGameId));
    const targets = new Set(rows.filter(follows).map((r) => r.planGameId));
    const typedId = rows[index]?.planGameId;
    setRows((rs) => rs.map((r, i) => (i === index || targets.has(r.planGameId) ? { ...r, ...patch } : r)));
    setAutoVenue((auto) => {
      const next = new Set(auto);
      if (typedId) next.delete(typedId);
      targets.forEach((id) => next.add(id));
      return next;
    });
  };

  const shared = (): PlanBatchShared =>
    buildBatchShared({ team, teamName: typedTeamName, competition, gameType, seasons, tournaments });

  const fieldError = (err: PlanBatchFieldError | undefined, field: 'opponent' | 'date' | 'time' | 'team') => {
    if (!err) return null;
    if (err === 'tooLong') return t('planCreateGames.errorTooLong', 'Too long.');
    if (field === 'opponent') return t('planCreateGames.errorOpponent', 'Enter the opponent.');
    if (field === 'team') return t('planCreateGames.errorTeam', 'Choose a team or enter its name.');
    if (field === 'date') return err === 'required'
      ? t('planCreateGames.errorDate', 'Choose the date.')
      : t('planCreateGames.errorDateInvalid', 'Check the date.');
    return t('planCreateGames.errorTime', 'Check the time.');
  };

  const handleSubmit = async () => {
    if (busy || rows.length === 0) return;
    const sharedNow = shared();
    const check = validatePlanBatch(plan, sharedNow, rows);
    setValidation(check);
    if (!check.ok) {
      // Open every game that needs fixing, so no error hides in a folded block.
      setOpenRows((open) => new Set([...open, ...Object.keys(check.rows)]));
      return;
    }
    setBusy(true);
    setFailedLabels([]);
    try {
      const result = await onSubmit(sharedNow, rows);
      if (result.failed.length === 0) {
        onDone(result);
        return;
      }
      // Keep only the rows that failed, with everything typed in them.
      const failed = new Set(result.failed);
      setRows((rs) => rs.filter((r) => failed.has(r.planGameId)));
      setFailedLabels(result.failed.map(labelOf));
    } catch {
      setFailedLabels(rows.map((r) => labelOf(r.planGameId)));
    } finally {
      setBusy(false);
    }
  };

  const rowErrors = validation?.rows ?? {};

  return (
    <div
      className={`fixed inset-0 ${Z_LAYER.modal} flex items-end justify-center bg-black/60`}
      onClick={busy ? undefined : onClose}
      data-testid="plan-create-games-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-create-games-title"
        aria-describedby="plan-create-games-count"
        className="w-full max-w-md s1-sheet rounded-t-[26px] px-4 pt-3 pb-6 max-h-[90vh] overflow-y-auto font-ui focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" aria-hidden="true" />
        <h4 id="plan-create-games-title" className={`${dialogTitleStyle} text-center`}>
          {t('planCreateGames.title', 'Create all games')}
        </h4>
        <p
          id="plan-create-games-count"
          data-testid="plan-create-games-count"
          className="mt-1 text-center font-ui text-base font-semibold text-action"
        >
          {t('planCreateGames.countLine', '{{count}} games will be created', { count: rows.length })}
        </p>
        <p className={`${subtextStyle} text-center mt-1`}>
          {t(
            'planCreateGames.intro',
            'Each game gets its line-up and changes from the plan. Fill in the opponent and date - kick-off and venue can be added later.',
          )}
        </p>

        <div className={`${cardStyle} space-y-4 mt-4`}>
          <div>
            <label htmlFor="plan-create-team" className={labelStyle}>
              {t('planCreateGames.team', 'Team')}
            </label>
            <select
              id="plan-create-team"
              value={teamId}
              onChange={(e) => handleTeamChange(e.target.value)}
              className={selectStyle}
            >
              <option value="">{t('planCreateGames.noTeam', 'No team')}</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
            {!team && (
              <input
                type="text"
                value={typedTeamName}
                onChange={(e) => setTypedTeamName(e.target.value)}
                aria-label={t('planCreateGames.teamName', 'Your team name')}
                placeholder={t('planCreateGames.teamName', 'Your team name')}
                aria-invalid={!!validation?.teamName}
                className={`${inputBaseStyle} ${validation?.teamName ? inputErrorStyle : ''} mt-2`}
              />
            )}
            {validation?.teamName && <p className={fieldErrorStyle}>{fieldError(validation.teamName, 'team')}</p>}
          </div>

          <div>
            <label htmlFor="plan-create-competition" className={labelStyle}>
              {t('planCreateGames.competition', 'League or tournament')}
            </label>
            <select
              id="plan-create-competition"
              value={competitionValue(competition)}
              onChange={(e) => handleCompetitionChange(e.target.value)}
              className={selectStyle}
            >
              <option value="">{t('planCreateGames.noCompetition', 'None')}</option>
              {activeSeasons.length > 0 && (
                <optgroup label={t('planCreateGames.seasons', 'Leagues')}>
                  {activeSeasons.map((se) => (
                    <option key={se.id} value={`season:${se.id}`}>
                      {se.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {activeTournaments.length > 0 && (
                <optgroup label={t('planCreateGames.tournaments', 'Tournaments')}>
                  {activeTournaments.map((tt) => (
                    <option key={tt.id} value={`tournament:${tt.id}`}>
                      {tt.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {competition.kind === 'tournament' && seriesOptions.length > 1 && (
              <select
                aria-label={t('planCreateGames.series', 'Level')}
                value={competition.seriesId ?? ''}
                onChange={(e) => setCompetition({ ...competition, seriesId: e.target.value || null })}
                className={`${selectStyle} mt-2`}
              >
                {seriesOptions.map((se) => (
                  <option key={se.id} value={se.id}>
                    {t(`common.level${se.level}` as 'common.levelKilpa', se.level)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <span className={labelStyle}>{t('planCreateGames.gameType', 'Sport')}</span>
            <div className={segmentTrackStyle} role="group" aria-label={t('planCreateGames.gameType', 'Sport')}>
              {(['soccer', 'futsal'] as const).map((gt) => (
                <button
                  key={gt}
                  type="button"
                  aria-pressed={gameType === gt}
                  onClick={() => setGameType(gt)}
                  className={gameType === gt ? segmentSelectedStyle : segmentStyle}
                >
                  {gt === 'soccer' ? t('common.gameTypeSoccer', 'Soccer') : t('common.gameTypeFutsal', 'Futsal')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <h5 className={`${sectionLabelStyle} px-1 mt-5`}>
          {t('planCreateGames.gamesHeadingCount', 'Games ({{count}})', { count: rows.length })}
        </h5>
        <p className={`${subtextStyle} px-1 mt-1 mb-2.5`}>
          {t('planCreateGames.gamesHint', 'Tap a game\'s title to open or close it.')}
        </p>
        <ol className="space-y-3" aria-label={t('planCreateGames.gamesHeading', 'Games')}>
          {rows.map((row, index) => {
            const errors = rowErrors[row.planGameId] ?? {};
            const hasErrors = Object.keys(errors).length > 0;
            const isOpen = openRows.has(row.planGameId);
            const id = (field: string) => `plan-create-${field}-${row.planGameId}`;
            return (
              <li
                key={row.planGameId}
                className={`${cardStyle} ${hasErrors ? 'shadow-[inset_0_0_0_1.5px_var(--color-loss)]' : ''}`}
                data-testid={`plan-create-row-${row.planGameId}`}
              >
                <button
                  type="button"
                  onClick={() => toggleRow(row.planGameId)}
                  aria-expanded={isOpen}
                  aria-controls={id('fields')}
                  data-testid={`plan-create-toggle-${row.planGameId}`}
                  className="-m-1 flex w-[calc(100%+0.5rem)] min-h-11 items-center gap-3 rounded-xl p-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-ink">{headingOf(row.planGameId)}</span>
                    {!isOpen && (
                      <span
                        className={`mt-0.5 block truncate text-sm ${hasErrors ? 'text-loss' : 'text-ink-3'}`}
                        data-testid={`plan-create-summary-${row.planGameId}`}
                      >
                        {summaryOf(row)}
                      </span>
                    )}
                  </span>
                  <HiOutlineChevronDown
                    className={`h-5 w-5 flex-none text-ink-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div id={id('fields')} className="mt-3 space-y-3 border-t border-hairline pt-3">
                    <div>
                      <label htmlFor={id('opponent')} className={labelStyle}>
                        {t('planCreateGames.opponent', 'Opponent')}
                      </label>
                      <input
                        id={id('opponent')}
                        type="text"
                        value={row.opponentName}
                        onChange={(e) => updateRow(index, { opponentName: e.target.value })}
                        aria-invalid={!!errors.opponentName}
                        className={`${inputBaseStyle} ${errors.opponentName ? inputErrorStyle : ''}`}
                      />
                      {errors.opponentName && <p className={fieldErrorStyle}>{fieldError(errors.opponentName, 'opponent')}</p>}
                    </div>
                    {/* One-line labels over both columns, so the two inputs always line up. */}
                    <div className="grid grid-cols-2 items-start gap-3">
                      <div className="min-w-0">
                        <label htmlFor={id('date')} className={`${labelStyle} truncate`}>
                          {t('planCreateGames.date', 'Date')}
                        </label>
                        <input
                          id={id('date')}
                          type="date"
                          value={row.gameDate}
                          onChange={(e) => updateRow(index, { gameDate: e.target.value })}
                          aria-invalid={!!errors.gameDate}
                          className={`${inputBaseStyle} ${errors.gameDate ? inputErrorStyle : ''} [color-scheme:dark]`}
                        />
                        {errors.gameDate && <p className={fieldErrorStyle}>{fieldError(errors.gameDate, 'date')}</p>}
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={id('time')} className={`${labelStyle} truncate`}>
                          {t('planCreateGames.time', 'Kick-off')}
                        </label>
                        <TimeInput
                          id={id('time')}
                          value={row.gameTime}
                          onChange={(value) => updateRow(index, { gameTime: value })}
                          invalid={!!errors.gameTime}
                          aria-describedby={id('time-hint')}
                        />
                        {errors.gameTime ? (
                          <p className={fieldErrorStyle}>{fieldError(errors.gameTime, 'time')}</p>
                        ) : (
                          <p id={id('time-hint')} className={fieldHintStyle}>
                            {t('planCreateGames.optional', 'Optional')}
                          </p>
                        )}
                      </div>
                    </div>
                    <VenueInput
                      id={id('venue')}
                      value={row.gameLocation}
                      hasCoordinates={row.locationLat !== undefined}
                      latitude={row.locationLat}
                      longitude={row.locationLng}
                      address={row.locationAddress}
                      knownVenues={knownVenues}
                      onChange={(venue) => updateVenue(index, venue)}
                      className={inputBaseStyle}
                    />
                    <div className={segmentTrackStyle} role="group" aria-label={t('planCreateGames.homeAway', 'Home or away')}>
                      {(['home', 'away'] as const).map((side) => (
                        <button
                          key={side}
                          type="button"
                          aria-pressed={row.homeOrAway === side}
                          onClick={() => updateRow(index, { homeOrAway: side })}
                          className={row.homeOrAway === side ? segmentSelectedStyle : segmentStyle}
                        >
                          {side === 'home' ? t('planCreateGames.home', 'Home') : t('planCreateGames.away', 'Away')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {errors.periodMinutes && (
                  <p className={fieldErrorStyle}>
                    {t('planCreateGames.errorLength', 'This game has no length in the plan. Set its minutes first.')}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        {validation && !validation.ok && (
          <p className={`${fieldErrorStyle} mt-3`} role="alert">
            {t('planCreateGames.fixErrors', 'Fill in the marked fields. Nothing has been created yet.')}
          </p>
        )}
        {failedLabels.length > 0 && (
          <p className={`${fieldErrorStyle} mt-3`} role="alert">
            {t('planCreateGames.someFailed', 'These games could not be created: {{names}}. Your entries are kept - press again to retry.', {
              names: failedLabels.join(', '),
            })}
          </p>
        )}

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || rows.length === 0}
            className={`${primaryButtonStyle} w-full`}
          >
            {busy
              ? t('planCreateGames.creating', 'Creating…')
              : t('planCreateGames.createCount', 'Create {{count}} games', { count: rows.length })}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={`${secondaryButtonStyle} w-full`}>
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanCreateGamesSheet;
