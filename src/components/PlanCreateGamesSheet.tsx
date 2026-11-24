'use client';

/**
 * "Luo kaikki pelit" - create a real game for every planned game of a plan
 * that does not have one yet, from one sheet.
 *
 * Team, competition and game type are chosen once at the top; each planned
 * game gets its own opponent, date, kick-off (optional - tournament times are
 * often not known yet), venue (optional) and home/away. Every row is checked
 * before anything is created, so a missing opponent never leaves half the
 * games made. If a game still fails to save, the sheet keeps that row (and
 * what was typed in it) and says which one; the games that were made drop out.
 *
 * The sheet only collects input. Creating is the caller's job (`onSubmit`),
 * which reports per planned game what happened.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  Z_LAYER,
  cardStyle,
  dialogTitleStyle,
  fieldErrorStyle,
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
  defaultOpponentFromLabel,
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
  onSubmit,
  onDone,
  onClose,
}) => {
  const { t } = useTranslation();
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
    return games.map((g) => ({
      planGameId: g.id,
      opponentName: defaultOpponentFromLabel(g.label),
      gameDate: '',
      gameTime: '',
      gameLocation: venue,
      homeOrAway: 'home' as const,
    }));
  });
  const [validation, setValidation] = useState<PlanBatchValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedLabels, setFailedLabels] = useState<string[]>([]);

  const activeSeasons = useMemo(() => seasons.filter((se) => !se.archived), [seasons]);
  const activeTournaments = useMemo(() => tournaments.filter((tt) => !tt.archived), [tournaments]);
  const selectedTournament =
    competition.kind === 'tournament' ? tournaments.find((tt) => tt.id === competition.id) : undefined;
  const seriesOptions = validSeries(selectedTournament);

  const labelOf = (planGameId: string) => plan.games.find((g) => g.id === planGameId)?.label ?? '';

  /** A competition change re-derives the game type and fills venues nobody typed. */
  const applyCompetition = (next: PlanBatchCompetition, forTeam: Team | undefined) => {
    const prevVenue = competitionVenue(competition);
    const nextVenue = competitionVenue(next);
    setCompetition(next);
    setGameType(defaultGameType(next, forTeam, seasons, tournaments));
    setRows((rs) => rs.map((r) => (r.gameLocation === '' || r.gameLocation === prevVenue ? { ...r, gameLocation: nextVenue } : r)));
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
    if (!check.ok) return;
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
        className="w-full max-w-md s1-sheet rounded-t-[26px] px-4 pt-3 pb-6 max-h-[90vh] overflow-y-auto font-ui focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" aria-hidden="true" />
        <h4 id="plan-create-games-title" className={`${dialogTitleStyle} text-center`}>
          {t('planCreateGames.title', 'Create all games')}
        </h4>
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
                className={`${validation?.teamName ? inputErrorStyle : inputBaseStyle} mt-2`}
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

        <h5 className={`${sectionLabelStyle} px-1 mt-5 mb-2.5`}>
          {t('planCreateGames.gamesHeading', 'Games')}
        </h5>
        <div className="space-y-3">
          {rows.map((row, index) => {
            const errors = rowErrors[row.planGameId] ?? {};
            const label = labelOf(row.planGameId);
            const id = (field: string) => `plan-create-${field}-${row.planGameId}`;
            return (
              <div key={row.planGameId} className={`${cardStyle} space-y-3`} data-testid={`plan-create-row-${row.planGameId}`}>
                <p className="text-base font-semibold text-ink truncate">{label}</p>
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
                    className={errors.opponentName ? inputErrorStyle : inputBaseStyle}
                  />
                  {errors.opponentName && <p className={fieldErrorStyle}>{fieldError(errors.opponentName, 'opponent')}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={id('date')} className={labelStyle}>
                      {t('planCreateGames.date', 'Date')}
                    </label>
                    <input
                      id={id('date')}
                      type="date"
                      value={row.gameDate}
                      onChange={(e) => updateRow(index, { gameDate: e.target.value })}
                      aria-invalid={!!errors.gameDate}
                      className={errors.gameDate ? inputErrorStyle : inputBaseStyle}
                    />
                    {errors.gameDate && <p className={fieldErrorStyle}>{fieldError(errors.gameDate, 'date')}</p>}
                  </div>
                  <div>
                    <label htmlFor={id('time')} className={labelStyle}>
                      {t('planCreateGames.time', 'Kick-off (optional)')}
                    </label>
                    <input
                      id={id('time')}
                      type="time"
                      value={row.gameTime}
                      onChange={(e) => updateRow(index, { gameTime: e.target.value })}
                      aria-invalid={!!errors.gameTime}
                      className={errors.gameTime ? inputErrorStyle : inputBaseStyle}
                    />
                    {errors.gameTime && <p className={fieldErrorStyle}>{fieldError(errors.gameTime, 'time')}</p>}
                  </div>
                </div>
                <div>
                  <label htmlFor={id('venue')} className={labelStyle}>
                    {t('planCreateGames.venue', 'Venue (optional)')}
                  </label>
                  <input
                    id={id('venue')}
                    type="text"
                    value={row.gameLocation}
                    onChange={(e) => updateRow(index, { gameLocation: e.target.value })}
                    className={inputBaseStyle}
                  />
                </div>
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
                {errors.periodMinutes && (
                  <p className={fieldErrorStyle}>
                    {t('planCreateGames.errorLength', 'This game has no length in the plan. Set its minutes first.')}
                  </p>
                )}
              </div>
            );
          })}
        </div>

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
