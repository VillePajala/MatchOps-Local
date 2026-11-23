'use client';

import { useHoldUnsavedInput } from '@/utils/unsavedInputSignal';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import { addPlayer, removePlayer } from '@/utils/masterRosterManager';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { addTeam, setTeamRoster, updateTeam } from '@/utils/teams';
import { AGE_GROUPS } from '@/config/gameOptions';
import { FIELD_SIZES, type FieldSize } from '@/config/formationPresets';
import { suggestFormatForAgeGroup, suggestPeriodsForAgeGroup } from '@/config/formatsByAgeGroup';
import {
  markOnboardingJustFinished,
  setSetupWizardActive,
  storeSetupFormat,
  storeSetupAgeGroup,
} from './setupWizardActive';
import { defaultNickname, splitPastedNames, PASTE_MAX_NAMES } from '@/utils/splitPastedNames';
import { recordMilestone } from '@/utils/onboardingMilestones';
import type { NextGameContext } from '@/services/nextGameContext';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';
import NextGameFlow from './NextGameFlow';
import type { GameType, Player, Team, TeamPlayer } from '@/types';
import logger from '@/utils/logger';
import {
  titleStyle,
  subtextStyle,
  labelStyle,
  inputBaseStyle,
  textareaStyle,
  selectStyle,
  segmentTrackStyle,
  segmentStyle,
  segmentSelectedStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  fieldHintStyle,
} from '@/styles/modalStyles';

/**
 * SetupWizard - the first-sign-in flow (cloud/Play only), Onboarding v3.
 *
 * Steps, one time per account:
 *   1. team name, sport, age group -> suggested format (every format selectable)
 *   2. players (type one at a time, or paste a whole list)
 *      "Valmis" creates REAL data through the existing utils (master roster
 *      players, a team, its roster) - no demo data.
 *   3. "Milloin seuraava peli?" - date + optional opponent. Only now are a game
 *      and its one-game playing-time plan created (no placeholder game ever).
 *   4. the plan, in the planner's compact mode (PlanQuickView).
 *   Steps 3-4 are NextGameFlow, the same flow basic Home's "Uusi ottelu" opens.
 * Skipping (a deliberately QUIET text link) creates nothing; Home's empty
 * states pick the coach up instead. With no players there is nothing to plan,
 * so "Valmis" goes straight to Home.
 *
 * Seen-ness is stored twice (review R9): the localStorage flag below is the
 * fast per-device cache, and the `wizardDone` / `wizardSkipped` milestones in
 * the synced settings row are the account's own record, which page.tsx checks
 * before ever opening the wizard - so a new phone never shows it again.
 * Hardware back steps back (R10): player list -> team, date step -> player list.
 */

// --- Per-user one-time flag --------------------------------------------------
// Same localStorage pattern as the guided tour's completion flag.
const DONE_PREFIX = 'matchops_setup_wizard_done_';

/**
 * Whether this account has already seen the wizard (finished OR skipped).
 * On any storage failure we report "done" - never trap a user in a wizard
 * whose dismissal can't persist.
 */
export function isSetupWizardDone(userId: string | null | undefined): boolean {
  if (typeof window === 'undefined') return true;
  try {
    // eslint-disable-next-line no-restricted-globals -- one-time onboarding flag, not app data
    return localStorage.getItem(`${DONE_PREFIX}${userId ?? 'local'}`) === '1';
  } catch {
    return true;
  }
}

function markSetupWizardDone(userId: string | null | undefined): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- one-time onboarding flag, not app data
    localStorage.setItem(`${DONE_PREFIX}${userId ?? 'local'}`, '1');
  } catch {
    // Not persistable - the session-level dismissal in page.tsx still hides it.
  }
}

const DEFAULT_FORMAT: FieldSize = '8v8';
const isFieldSize = (v: unknown): v is FieldSize => (FIELD_SIZES as unknown[]).includes(v);

/**
 * The wizard's input, kept for the tab (review 7.1b). Android may destroy a
 * backgrounded app's page while the coach reads names from another app; without
 * this the restored page started the wizard empty. Scope: sessionStorage survives
 * a reload, a tab discard and a TWA page recreation - not a full process kill
 * followed by a cold start, which begins a new session (a deliberate trade-off:
 * no stale half-finished wizard weeks later). It also carries what a failed
 * finish already created, so finishing after a restore does not create those
 * players or the team twice (the 7.6 retry rule, across a reload).
 */
interface WizardDraft {
  step: 1 | 2;
  teamName: string;
  sport: GameType;
  format: FieldSize;
  /** The coach picked the format themselves - a later age-group change keeps it. */
  formatTouched: boolean;
  ageGroup: string;
  names: Array<{ id: number; name: string }>;
  draft: string;
  nextRowId: number;
  created: Array<[number, Player]>;
  createdTeam: Team | null;
}

const DRAFT_PREFIX = 'matchops_setup_wizard_draft_';

function readWizardDraft(userId: string | null | undefined): WizardDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${DRAFT_PREFIX}${userId ?? 'local'}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardDraft> | null;
    if (!parsed || !Array.isArray(parsed.names) || typeof parsed.teamName !== 'string') return null;
    return {
      step: parsed.step === 2 ? 2 : 1,
      teamName: parsed.teamName,
      sport: parsed.sport === 'futsal' ? 'futsal' : 'soccer',
      format: isFieldSize(parsed.format) ? parsed.format : DEFAULT_FORMAT,
      formatTouched: parsed.formatTouched === true,
      ageGroup: typeof parsed.ageGroup === 'string' ? parsed.ageGroup : '',
      names: parsed.names.filter((r) => r && typeof r.id === 'number' && typeof r.name === 'string'),
      draft: typeof parsed.draft === 'string' ? parsed.draft : '',
      nextRowId: typeof parsed.nextRowId === 'number' ? parsed.nextRowId : 1,
      created: Array.isArray(parsed.created) ? parsed.created : [],
      createdTeam: parsed.createdTeam ?? null,
    };
  } catch {
    return null;
  }
}

function writeWizardDraft(userId: string | null | undefined, value: WizardDraft): void {
  try {
    sessionStorage.setItem(`${DRAFT_PREFIX}${userId ?? 'local'}`, JSON.stringify(value));
  } catch {
    // Not persistable: the wizard still works for this page load.
  }
}

function clearWizardDraft(userId: string | null | undefined): void {
  try {
    sessionStorage.removeItem(`${DRAFT_PREFIX}${userId ?? 'local'}`);
  } catch {
    // Nothing to clear.
  }
}

/** The quiet skip link, the same on every step. */
const quietLinkStyle =
  'inline-flex min-h-11 items-center justify-center px-3 font-ui text-sm text-ink-3 hover:text-ink-2 underline decoration-ink-3/60 underline-offset-[3px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-action';

/** The format chips: a five-way segmented row (amber ring only on the selection). */
const formatChipStyle = (selected: boolean) =>
  `${selected ? segmentSelectedStyle : segmentStyle} px-0! text-[13px]!`;

interface SetupWizardProps {
  /** Called after the wizard is done (finished or skipped) - hide it and refresh signals. */
  onComplete: () => void;
}

type Step = 1 | 2 | 'nextGame';

/** What "Valmis" created - the next-game step builds the game from it. */
interface CreatedSquad {
  team: Team;
  players: Player[];
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  // The wizard is the coach's first input - typing the squad while reading names
  // from another app must not be lost to the long-background reload (review 7.1).
  useHoldUnsavedInput(true);
  const queryClient = useQueryClient();
  const { userId } = useDataStore();
  const { showToast } = useToast();

  // A draft from before Android recreated the page, if there is one (review 7.1b).
  const [restored] = useState(() => readWizardDraft(userId));
  const [step, setStep] = useState<Step>(restored?.step ?? 1);
  const [teamName, setTeamName] = useState(restored?.teamName ?? '');
  const [sport, setSport] = useState<GameType>(restored?.sport ?? 'soccer');
  const [format, setFormat] = useState<FieldSize>(restored?.format ?? DEFAULT_FORMAT);
  const [formatTouched, setFormatTouched] = useState(restored?.formatTouched ?? false);
  /**
   * Optional, like before. Empty means the coach skipped it: no suggestion, the
   * format stays as chosen - it must never become a gate on creating a team.
   */
  const [ageGroup, setAgeGroup] = useState(restored?.ageGroup ?? '');
  // Each row has its own id (review 7.6): a retry after a partial failure must
  // match created players to the rows on screen, not to positions that shift
  // when the coach removes a row in between.
  const [names, setNames] = useState<Array<{ id: number; name: string }>>(restored?.names ?? []);
  const nextRowIdRef = useRef(restored?.nextRowId ?? 1);
  const [draft, setDraft] = useState(restored?.draft ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [squad, setSquad] = useState<CreatedSquad | null>(null);

  const suggestion = useMemo(() => suggestFormatForAgeGroup(ageGroup, sport), [ageGroup, sport]);

  /**
   * The age group (with the sport) suggests the format until the coach picks
   * one themselves; after that their pick stays. Set in the handlers, not an
   * effect, so the chips never flash the old value.
   */
  const applySuggestion = useCallback(
    (nextAgeGroup: string, nextSport: GameType) => {
      if (formatTouched) return;
      const s = suggestFormatForAgeGroup(nextAgeGroup, nextSport);
      if (s) setFormat(s.fieldSize);
    },
    [formatTouched],
  );

  // Committed rows + a non-empty draft: what Valmis will actually create.
  const totalCount = names.length + (draft.trim() ? 1 : 0);

  // Retry safety: a failed finish must not duplicate what already got created.
  const createdPlayersRef = useRef<Map<number, Player>>(new Map(restored?.created ?? []));
  const createdTeamRef = useRef<Team | null>(restored?.createdTeam ?? null);
  // Kept current as the coach types; also after each create (see saveDraftNow).
  // `over`: the finish path passes the rows it is creating, which state has not
  // caught up with yet (a pending draft just became a row).
  const saveDraftNow = useCallback((over?: Pick<WizardDraft, 'names' | 'draft'>) => {
    if (step !== 1 && step !== 2) return;
    writeWizardDraft(userId, {
      step,
      teamName,
      sport,
      format,
      formatTouched,
      ageGroup,
      names: over?.names ?? names,
      draft: over?.draft ?? draft,
      nextRowId: nextRowIdRef.current,
      created: Array.from(createdPlayersRef.current.entries()),
      createdTeam: createdTeamRef.current,
    });
  }, [userId, step, teamName, sport, format, formatTouched, ageGroup, names, draft]);
  const finishedRef = useRef(false);

  // The account id can settle after the first render (auth rehydrating in cloud
  // mode): the draft is under the real id, so look again then - but only while
  // nothing has been typed, never over the coach's input.
  const draftReadForRef = useRef(userId);
  useEffect(() => {
    if (draftReadForRef.current === userId) return;
    draftReadForRef.current = userId;
    if (teamName || names.length > 0 || draft) return;
    const late = readWizardDraft(userId);
    if (!late) return;
    setStep(late.step);
    setTeamName(late.teamName);
    setSport(late.sport);
    setFormat(late.format);
    setFormatTouched(late.formatTouched);
    setAgeGroup(late.ageGroup);
    setNames(late.names);
    setDraft(late.draft);
    nextRowIdRef.current = late.nextRowId;
    createdPlayersRef.current = new Map(late.created);
    createdTeamRef.current = late.createdTeam;
  }, [userId, teamName, names.length, draft]);

  useEffect(() => {
    if (!finishedRef.current) saveDraftNow();
  }, [saveDraftNow]);
  // Re-entrancy guard as a REF (state commits too late to stop a double tap)
  // and an unmount guard for the async save chain (review #725).
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setSetupWizardActive(true);
    return () => setSetupWizardActive(false);
  }, []);

  const finish = useCallback(() => {
    finishedRef.current = true;
    clearWizardDraft(userId);
    markSetupWizardDone(userId);
    // The first Home visit after this is the coach's first look at their own
    // Home: no marketing prompt on it (R13).
    markOnboardingJustFinished();
    onComplete();
  }, [userId, onComplete]);

  /** Quiet skip: creates NOTHING on steps 1-2. "Valmis" is the only creator. */
  const handleSkip = useCallback(() => {
    if (savingRef.current) return;
    // The account remembers the skip, not only this device (R9).
    void recordMilestone('wizardSkipped', userId);
    finish();
  }, [finish, userId]);

  // Hardware back on the player list goes to the team step (R10). The date
  // step registers its own back (NextGameFlow); the team step has none.
  useModalHardwareBack(step === 2, () => setStep(1));

  /** Append names as rows (capped at PASTE_MAX_NAMES rows); returns how many were added. */
  const appendNames = useCallback((list: string[]): number => {
    const take = list.slice(0, Math.max(0, PASTE_MAX_NAMES - names.length));
    if (take.length === 0) return 0;
    const rows = take.map((name) => ({ id: nextRowIdRef.current++, name }));
    setNames((prev) => [...prev, ...rows]);
    return rows.length;
  }, [names.length]);

  const commitDraft = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const id = nextRowIdRef.current++;
    setNames((prev) => [...prev, { id, name: trimmed }]);
    setDraft('');
  }, [draft]);

  /**
   * A pasted list becomes rows at once ("1. Onni\n2. Toivo" -> two rows,
   * leading numbers stripped - D8). A single name stays in the field.
   */
  const addPastedText = useCallback(
    (text: string): boolean => {
      const list = splitPastedNames(text, { maxNameLength: VALIDATION_LIMITS.PLAYER_NAME_MAX });
      if (list.length < 2) return false;
      const added = appendNames(list);
      showToast(t('setupWizard.pastedCount', '{{count}} players added', { count: added }), 'success');
      return true;
    },
    [appendNames, showToast, t],
  );

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (addPastedText(text)) return;
      const single = splitPastedNames(text, { maxNameLength: VALIDATION_LIMITS.PLAYER_NAME_MAX });
      if (single.length === 1) {
        appendNames(single);
        return;
      }
      showToast(t('setupWizard.pasteEmpty', 'No names found on the clipboard.'), 'info');
    } catch {
      showToast(
        t('setupWizard.pasteUnavailable', 'Could not read the clipboard. Long-press the name field and choose Paste.'),
        'info',
      );
    }
  }, [addPastedText, appendNames, showToast, t]);

  // Keep the newest row in view as rows are added (typed or pasted).
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const rowCountRef = useRef(names.length);
  useEffect(() => {
    const grew = names.length > rowCountRef.current;
    rowCountRef.current = names.length;
    const el = rowsRef.current;
    if (grew && el) el.scrollTop = el.scrollHeight;
  }, [names.length]);

  const removeName = useCallback((index: number) => {
    setNames((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleFinish = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      // A typed-but-unentered name still counts - losing it on Valmis would
      // surprise exactly the fast typist the rapid entry is for.
      // It becomes a row of its own, so a retry finds it under the same id.
      const pendingDraft = draft.trim();
      let rows = names;
      if (pendingDraft) {
        rows = [...names, { id: nextRowIdRef.current++, name: pendingDraft }];
        setNames(rows);
        setDraft('');
      }
      const created = createdPlayersRef.current;

      // A row removed after an earlier failed attempt created its player: that
      // player goes again, or it would stay in the roster (review 7.6).
      const rowIds = new Set(rows.map((r) => r.id));
      for (const [rowId, player] of Array.from(created.entries())) {
        if (rowIds.has(rowId)) continue;
        // removePlayer reports failure as `false`: stop here (toast, wizard stays
        // open) so the retry tries the removal again instead of leaving an orphan.
        if (!(await removePlayer(player.id, userId ?? undefined))) {
          throw new Error(`player removal failed: ${player.id}`);
        }
        created.delete(rowId);
        saveDraftNow({ names: rows, draft: '' });
      }

      // Create players sequentially, skipping rows an earlier failed attempt
      // already created (retry-safe, no duplicates).
      for (const row of rows) {
        if (created.has(row.id)) continue;
        const name = row.name;
        // "Matti Meikalainen" -> disc shows "Matti" (defaultNickname).
        const player = await addPlayer(
          { name, nickname: defaultNickname(name), jerseyNumber: '', notes: '' },
          userId ?? undefined,
        );
        if (!player) throw new Error('player creation failed');
        created.set(row.id, player);
        saveDraftNow({ names: rows, draft: '' }); // a reload now must not create this player again
      }
      // In the order on screen.
      const players = rows.map((r) => created.get(r.id)).filter((p): p is Player => !!p);

      // ageGroup omitted rather than sent empty: the store validates it, and ""
      // is not a valid age group, it is the absence of one. gameType likewise
      // only for futsal - football is the app-wide default.
      const teamFields = {
        name: teamName.trim(),
        ...(ageGroup ? { ageGroup } : {}),
        ...(sport === 'futsal' ? { gameType: sport } : {}),
      };
      if (!createdTeamRef.current) {
        createdTeamRef.current = await addTeam(teamFields, userId ?? undefined);
        saveDraftNow({ names: rows, draft: '' });
      } else if (createdTeamRef.current.name !== teamFields.name) {
        // A retry after the coach went back and renamed the team.
        const renamed = await updateTeam(createdTeamRef.current.id, { name: teamFields.name }, userId ?? undefined);
        if (renamed) createdTeamRef.current = renamed;
      }

      if (players.length > 0) {
        const roster: TeamPlayer[] = players.map((p) => ({
          id: p.id,
          name: p.name,
          nickname: p.nickname,
          jerseyNumber: p.jerseyNumber,
          isGoalie: p.isGoalie,
          receivedFairPlayCard: p.receivedFairPlayCard,
        }));
        await setTeamRoster(createdTeamRef.current.id, roster, userId ?? undefined);
      }

      // The format choice is a UI default hint for later steps (game size,
      // formations) - a per-user local preference, not entity data.
      storeSetupFormat(userId, format);
      // The age group becomes the default age group on the next new game,
      // which is what makes the Rules screen and the formats table specific
      // instead of generic (nothing reads teams.ageGroup for that).
      if (ageGroup) storeSetupAgeGroup(userId, ageGroup);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...queryKeys.masterRoster, userId] }),
        queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] }),
        queryClient.invalidateQueries({
          queryKey: [...queryKeys.teamRoster(createdTeamRef.current.id), userId],
        }),
      ]);

      savingRef.current = false;
      if (!mountedRef.current) return;
      // The team and players exist now: this account has done the wizard, even
      // if the app is closed on the next step.
      recordMilestone('wizardDone', userId);
      markSetupWizardDone(userId);
      if (players.length === 0) {
        finish();
        return;
      }
      finishedRef.current = true;
      clearWizardDraft(userId);
      setSquad({ team: createdTeamRef.current, players });
      setIsSaving(false);
      setStep('nextGame');
    } catch (error) {
      logger.error('[SetupWizard] finish failed:', error);
      savingRef.current = false;
      if (!mountedRef.current) return;
      showToast(t('setupWizard.error', 'Saving failed - please try again.'), 'error');
      setIsSaving(false);
    }
  }, [draft, names, teamName, sport, format, ageGroup, userId, queryClient, showToast, t, finish, saveDraftNow]);

  const skipLabel = t('setupWizard.skip', "Skip, I'll do this later");

  /**
   * The wizard is the FIRST screen a new coach sees, so it offers the language
   * switch like every other entry point. SSR-safe initial value and a
   * post-hydration adopt (useAppLanguage, MATCHOPS-LOCAL-8K); changed by the
   * buttons only, never by an effect keyed on the value.
   */
  const [language, changeLanguage] = useAppLanguage();

  if (step === 'nextGame' && squad) {
    const periods = suggestPeriodsForAgeGroup(ageGroup, sport);
    const context: NextGameContext = {
      team: { id: squad.team.id, name: squad.team.name },
      players: squad.players,
      fieldSize: format,
      gameType: sport,
      ageGroup,
      numberOfPeriods: periods.numberOfPeriods,
      periodMinutes: periods.periodMinutes,
    };
    return (
      <div data-testid="setup-wizard">
        <NextGameFlow
          userId={userId ?? undefined}
          context={context}
          onClose={finish}
          onBack={() => {
            // Back to the player list (R10). What "Valmis" created stays known
            // (the created-row map), so Valmis again creates nothing twice.
            finishedRef.current = false;
            setStep(2);
          }}
        />
      </div>
    );
  }

  const suggestionText =
    suggestion && ageGroup
      ? t('setupWizard.formatSuggestion', 'Suggested for the age group: {{format}}. You can pick any.', {
          format: suggestion.alternatives.length > 0
            ? [suggestion.fieldSize, ...suggestion.alternatives].join(' / ')
            : suggestion.fieldSize,
        })
      : t('setupWizard.formatHintNoAge', 'Pick the age group for a suggestion, or choose yourself.');

  return (
    <div
      data-testid="setup-wizard"
      className="s1-canvas relative flex flex-col h-screen h-[100dvh] font-ui text-ink overflow-y-auto"
    >
      {/* Upper-right, the same place and the same pill as the sign-in screens. */}
      <div className="absolute top-3 right-4 z-20 s1-raised flex h-11 rounded-full px-0.5 text-xs font-bold tracking-[0.06em]">
        {(['en', 'fi'] as const).map((lng) => (
          <button
            key={lng}
            type="button"
            onClick={() => changeLanguage(lng)}
            data-testid={`wizard-lang-${lng}`}
            aria-pressed={language === lng}
            className="group grid h-11 min-w-10 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <span
              className={`grid h-9 min-w-9 place-items-center rounded-full px-1.5 transition-colors ${
                language === lng ? 's1-seg-on text-ink' : 'text-ink-3 group-hover:text-ink-2'
              }`}
            >
              {lng.toUpperCase()}
            </span>
          </button>
        ))}
      </div>

      <div
        className={`relative z-10 w-full max-w-sm mx-auto flex flex-col flex-1 px-5 pt-5 pb-6 pb-safe ${
          // Step 2: the column is bounded by the screen so the ROWS scroll and
          // Valmis stays in view; step 1 grows and the page scrolls if needed.
          step === 2 ? 'min-h-0' : ''
        }`}
      >
        {step === 2 ? (
          <button
            type="button"
            data-testid="wizard-back"
            onClick={() => setStep(1)}
            className="self-start -ml-1 inline-flex min-h-11 items-center gap-1 pr-3 text-sm text-ink-3 hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-full"
          >
            &lsaquo; {t('setupWizard.back', 'Back')}
          </button>
        ) : (
          <div className="min-h-11" aria-hidden="true" />
        )}
        <p className="mt-1 font-ui text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
          {t('setupWizard.stepOf', 'Step {{step}} / {{total}}', { step, total: 2 })}
        </p>

        {step === 1 ? (
          <>
            <h1 className={`${titleStyle} mt-1`}>{t('setupWizard.teamTitle', 'Your team')}</h1>
            <p className={`${subtextStyle} mt-1 mb-5`}>
              {t('setupWizard.teamHint', 'Name your team - you can fill in details later.')}
            </p>

            <label htmlFor="setup-team-name" className={labelStyle}>
              {t('setupWizard.teamNameLabel', 'Team name')}
            </label>
            <input
              id="setup-team-name"
              data-testid="wizard-team-name"
              type="text"
              value={teamName}
              maxLength={VALIDATION_LIMITS.TEAM_NAME_MAX}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder={t('setupWizard.teamNamePlaceholder', 'e.g. FC Honka P12') ?? undefined}
              className={inputBaseStyle}
            />

            <p className={`${labelStyle} mt-5`} id="wizard-sport-label">
              {t('setupWizard.sport', 'Sport')}
            </p>
            <div className={segmentTrackStyle} role="group" aria-labelledby="wizard-sport-label">
              {(['soccer', 'futsal'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`wizard-sport-${s}`}
                  aria-pressed={sport === s}
                  onClick={() => {
                    setSport(s);
                    applySuggestion(ageGroup, s);
                  }}
                  className={sport === s ? segmentSelectedStyle : segmentStyle}
                >
                  {s === 'soccer'
                    ? t('setupWizard.sportFootball', 'Football')
                    : t('setupWizard.sportFutsal', 'Futsal')}
                </button>
              ))}
            </div>

            <label htmlFor="wizard-age-group" className={`${labelStyle} mt-5`}>
              {t('setupWizard.ageGroupLabel', 'Age group (optional)')}
            </label>
            <select
              id="wizard-age-group"
              data-testid="wizard-age-group"
              value={ageGroup}
              onChange={(e) => {
                setAgeGroup(e.target.value);
                applySuggestion(e.target.value, sport);
              }}
              className={selectStyle}
            >
              <option value="">{t('setupWizard.ageGroupNone', 'Not set')}</option>
              {AGE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <p className={`${labelStyle} mt-5`} id="wizard-format-label">
              {t('setupWizard.formatLabel', 'Format')}
            </p>
            <div className={segmentTrackStyle} role="group" aria-labelledby="wizard-format-label">
              {FIELD_SIZES.map((f) => (
                <button
                  key={f}
                  type="button"
                  data-testid={`wizard-format-${f}`}
                  onClick={() => {
                    setFormat(f);
                    setFormatTouched(true);
                  }}
                  aria-pressed={format === f}
                  className={formatChipStyle(format === f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <p className={fieldHintStyle} data-testid="wizard-format-hint">
              {suggestionText}
            </p>

            <button
              type="button"
              data-testid="wizard-continue"
              onClick={() => {
                // Close the keyboard before step 2 so the whole column is visible.
                (document.activeElement as HTMLElement | null)?.blur?.();
                setStep(2);
              }}
              disabled={!teamName.trim()}
              className={`${primaryButtonStyle} mt-7 w-full min-h-12 text-base`}
            >
              {t('setupWizard.next', 'Continue')}
            </button>
          </>
        ) : (
          /* Step 2 does not scroll the PAGE in portrait: the column fills the
             remaining height, the ROWS scroll internally (newest first), and
             Valmis + the skip link stay pinned. The page keeps overflow-y-auto
             as a fallback for short/landscape viewports. */
          <>
            <h1 className={`${titleStyle} mt-1`}>{t('setupWizard.playersTitle', 'Players')}</h1>
            <p className={`${subtextStyle} mt-1`}>
              {t('setupWizard.playersHint', 'Paste a list of names or type one at a time.')}{' '}
              {t('privacyHints.firstNameEnough', 'A first name or nickname is enough.')}
            </p>
            <div className="flex-1 min-h-0 mt-4 flex flex-col">
              <button
                type="button"
                data-testid="wizard-paste"
                onClick={() => void handlePasteFromClipboard()}
                className={`${secondaryButtonStyle} w-full`}
              >
                {t('setupWizard.pasteButton', 'Paste from clipboard')}
              </button>
              {/* A one-row textarea, not an input: an input drops the line
                  breaks of a pasted list, and some Android keyboards paste
                  without a paste event - the line breaks are how the list is
                  recognised in onChange too. Enter still adds the row. */}
              <div className="flex gap-2 mt-3">
                <textarea
                  data-testid="wizard-player-input"
                  rows={1}
                  value={draft}
                  maxLength={VALIDATION_LIMITS.PLAYER_NAME_MAX * PASTE_MAX_NAMES}
                  aria-label={t('setupWizard.playerPlaceholder', 'Player name…')}
                  onPaste={(e) => {
                    const text = e.clipboardData?.getData('text') ?? '';
                    if (addPastedText(text)) e.preventDefault();
                  }}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/[\r\n]/.test(value)) {
                      // A pasted list without a paste event, or Enter on a
                      // keyboard that inserts the line break itself.
                      const list = splitPastedNames(value, { maxNameLength: VALIDATION_LIMITS.PLAYER_NAME_MAX });
                      appendNames(list);
                      setDraft('');
                      return;
                    }
                    setDraft(value.slice(0, VALIDATION_LIMITS.PLAYER_NAME_MAX));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitDraft();
                    }
                  }}
                  placeholder={t('setupWizard.playerPlaceholder', 'Player name…') ?? undefined}
                  className={`${textareaStyle} flex-1 min-w-0 overflow-hidden`}
                />
                <button
                  type="button"
                  data-testid="wizard-add-player"
                  onClick={commitDraft}
                  disabled={!draft.trim()}
                  className={`${secondaryButtonStyle} min-h-[52px]`}
                >
                  {t('setupWizard.add', 'Add')}
                </button>
              </div>
              <p className="text-right text-sm text-ink-3 mt-2" data-testid="wizard-player-count">
                {t('setupWizard.playersAdded', '{{count}} players added', { count: totalCount })}
              </p>
              {/* Rows in the order entered (a pasted list reads as pasted);
                  the list scrolls itself to the newest row. */}
              <div
                ref={rowsRef}
                className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 mt-2 -mx-1 px-1"
              >
                {names.map(({ id, name }, originalIndex) => {
                  return (
                    <div
                      key={id}
                      data-testid="wizard-player-row"
                      className="s1-list flex items-center justify-between rounded-xl pl-3.5 pr-1 min-h-11"
                    >
                      <span className="text-[15px]">{name}</span>
                      <button
                        type="button"
                        onClick={() => removeName(originalIndex)}
                        aria-label={`${t('setupWizard.removePlayer', 'Remove')} ${name}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:bg-white/[0.06] hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className={`${fieldHintStyle} text-center`}>
                {t('setupWizard.numbersLater', 'First names are enough. Numbers can be added later.')}
              </p>

              <button
                type="button"
                data-testid="wizard-finish"
                onClick={() => void handleFinish()}
                disabled={isSaving}
                className={`${primaryButtonStyle} flex-none mt-3 w-full min-h-12 text-base`}
              >
                {isSaving ? t('setupWizard.saving', 'Saving…') : t('setupWizard.finish', 'Done')}
              </button>
            </div>
          </>
        )}

        {/* Quiet skip (owner decision): a text link, not a button - present for
            the coach who wants to look around first. Creates nothing. */}
        <button
          type="button"
          data-testid="wizard-skip"
          onClick={handleSkip}
          className={`${quietLinkStyle} flex-none ${step === 1 ? 'mt-3' : 'mt-2'} w-full`}
        >
          {skipLabel}
        </button>
      </div>
    </div>
  );
};

export default SetupWizard;
