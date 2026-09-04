'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import { addPlayer } from '@/utils/masterRosterManager';
import { addTeam, setTeamRoster } from '@/utils/teams';
import { setSetupWizardActive, storeSetupFormat } from './setupWizardActive';
import type { Player, Team, TeamPlayer } from '@/types';
import logger from '@/utils/logger';

/**
 * SetupWizard - the Onboarding v2 first-sign-in flow (cloud/Play only).
 *
 * Two steps, one time per account: (1) team name + format, (2) rapid roster
 * entry. Finishing creates REAL data through the existing utils (master roster
 * players, a team, its roster) - no demo data, nothing to undo. Skipping (a
 * deliberately QUIET text link) creates nothing; the start screen's empty-state
 * composition picks the coach up instead. Replaces the auto-started guided
 * tour, which is now opt-in (gear -> "Aloitusopastus").
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
    // eslint-disable-next-line no-restricted-globals -- one-time onboarding flag, not app data (same pattern as the guided-tour flag)
    return localStorage.getItem(`${DONE_PREFIX}${userId ?? 'local'}`) === '1';
  } catch {
    return true;
  }
}

function markSetupWizardDone(userId: string | null | undefined): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- one-time onboarding flag, not app data (same pattern as the guided-tour flag)
    localStorage.setItem(`${DONE_PREFIX}${userId ?? 'local'}`, '1');
  } catch {
    // Not persistable - the session-level dismissal in page.tsx still hides it.
  }
}

type WizardFormat = '5v5' | '8v8' | '11v11';
const FORMATS: WizardFormat[] = ['5v5', '8v8', '11v11'];


interface SetupWizardProps {
  /** Called after the wizard is done (finished or skipped) - hide it and refresh signals. */
  onComplete: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { userId } = useDataStore();
  const { showToast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [teamName, setTeamName] = useState('');
  const [format, setFormat] = useState<WizardFormat>('8v8');
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Committed rows + a non-empty draft: what Valmis will actually create.
  const totalCount = names.length + (draft.trim() ? 1 : 0);

  // Retry safety: a failed finish must not duplicate what already got created.
  const createdPlayersRef = useRef<Player[]>([]);
  const createdTeamRef = useRef<Team | null>(null);
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
    markSetupWizardDone(userId);
    onComplete();
  }, [userId, onComplete]);

  /** Quiet skip: creates NOTHING, on either step. "Valmis" is the only creator. */
  const handleSkip = useCallback(() => {
    if (savingRef.current) return;
    finish();
  }, [finish]);

  const commitDraft = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setNames((prev) => [...prev, trimmed]);
    setDraft('');
  }, [draft]);

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
      const pendingDraft = draft.trim();
      const finalNames = pendingDraft ? [...names, pendingDraft] : names;

      // Create players sequentially, resuming past what an earlier failed
      // attempt already created (retry-safe, no duplicates).
      while (createdPlayersRef.current.length < finalNames.length) {
        const name = finalNames[createdPlayersRef.current.length];
        // "Matti Meikalainen" -> disc shows "Matti": multi-word names get
        // the first word as the nickname, the same outcome as a coach setting
        // one in the roster (the disc renders nickname || name). Single words
        // stay nickname-free so the roster list doesn't echo "Aino (Aino)".
        const firstWord = name.trim().split(/\s+/)[0] ?? '';
        const player = await addPlayer(
          { name, nickname: firstWord === name.trim() ? '' : firstWord, jerseyNumber: '', notes: '' },
          userId ?? undefined,
        );
        if (!player) throw new Error(`player creation failed: ${name}`);
        createdPlayersRef.current.push(player);
      }

      if (!createdTeamRef.current) {
        createdTeamRef.current = await addTeam({ name: teamName.trim() }, userId ?? undefined);
      }

      if (createdPlayersRef.current.length > 0) {
        const roster: TeamPlayer[] = createdPlayersRef.current.map((p) => ({
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

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...queryKeys.masterRoster, userId] }),
        queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] }),
        queryClient.invalidateQueries({
          queryKey: [...queryKeys.teamRoster(createdTeamRef.current.id), userId],
        }),
      ]);

      savingRef.current = false;
      if (!mountedRef.current) return;
      finish();
    } catch (error) {
      logger.error('[SetupWizard] finish failed:', error);
      savingRef.current = false;
      if (!mountedRef.current) return;
      showToast(t('setupWizard.error', 'Saving failed - please try again.'), 'error');
      setIsSaving(false);
    }
  }, [draft, names, teamName, format, userId, queryClient, showToast, t, finish]);

  const skipLabel = t('setupWizard.skip', "Skip, I'll do this later");

  return (
    <div
      data-testid="setup-wizard"
      className="relative flex flex-col h-screen h-[100dvh] bg-slate-900 text-white overflow-y-auto"
    >
      {/* Same ambient glows as StartScreen - the background must not visibly
          change at the wizard -> start screen hand-off (audit 1.15). */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[15%] w-[60%] h-[60%] bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-[15%] -left-[10%] w-[55%] h-[55%] bg-sky-500/15 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-sm mx-auto flex flex-col flex-1 px-6 py-8">
        {/* Step 1 centers the WHOLE group (wordmark -> skip) like the landing
            page: mt-auto here + mb-auto on the skip split the leftover space
            in two (not the odd thirds of round 5, where the skip's own
            mt-auto added a third gap). Autos collapse to 0 when the keyboard
            shrinks the viewport, so the column degrades to a normal scroll. */}
        <h1 className={`text-[clamp(2.3rem,10.5vw,3.5rem)] font-bold tracking-tight text-center ${step === 1 ? 'mt-auto' : 'mt-2'}`}>
          <span className="text-amber-400">MatchOps</span>
        </h1>

        {/* Step dots */}
        <div className="flex gap-1.5 justify-center mt-4 mb-6" aria-hidden="true">
          <span className="w-6 h-1 rounded-full bg-amber-400" />
          <span className={`w-6 h-1 rounded-full ${step === 2 ? 'bg-amber-400' : 'bg-slate-700'}`} />
        </div>

        {step === 1 ? (
          /* Landing language (owner round 8): the auth screen is the design
             reference - centered headings, open h-12 fields directly on the
             ambient background (no card chrome), full-width hero CTA. The
             wizard must read as page 2 of the same flow, not a settings form. */
          <>
            <h2 className="text-2xl font-bold text-center">
              {t('setupWizard.teamTitle', 'Your team')}
            </h2>
            <p className="text-sm text-slate-400 text-center mt-2 mb-6">
              {t('setupWizard.teamHint', 'Name your team - you can fill in details later.')}
            </p>
            <input
              id="setup-team-name"
              data-testid="wizard-team-name"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder={t('setupWizard.teamNamePlaceholder', 'e.g. FC Honka P12') ?? undefined}
              aria-label={t('setupWizard.teamNameLabel', 'Team name')}
              className="w-full h-12 px-4 rounded-md bg-slate-800 border border-slate-700 text-base text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />

            <div className="text-sm font-medium text-slate-300 text-center mt-6 mb-2">
              {t('setupWizard.formatLabel', 'Format')}
            </div>
            <div className="flex gap-2" role="group" aria-label={t('setupWizard.formatLabel', 'Format')}>
              {FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  data-testid={`wizard-format-${f}`}
                  onClick={() => setFormat(f)}
                  aria-pressed={format === f}
                  className={`flex-1 h-11 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500 ${
                    format === f
                      ? 'bg-indigo-600 border border-indigo-400/30 text-white'
                      : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              type="button"
              data-testid="wizard-continue"
              onClick={() => {
                // Owner round 4: close the keyboard before step 2 so the whole
                // column (input, Add, Done, skip) is visible first.
                (document.activeElement as HTMLElement | null)?.blur?.();
                setStep(2);
              }}
              disabled={!teamName.trim()}
              className="mt-8 w-full p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-bold text-lg hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20 text-center disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-amber-500"
            >
              {t('setupWizard.next', 'Continue')}
            </button>
          </>
        ) : (
          /* Step 2 does not scroll the PAGE in portrait (owner round 3): the
             card fills the remaining height, the ROWS scroll internally
             (newest first, oldest slide away), and Valmis + the skip link stay
             pinned. The page keeps overflow-y-auto as a FALLBACK only - on a
             short/landscape viewport the fixed-height children exceed 100dvh
             and the page must scroll rather than clip (review #732). */
          <>
            {/* Quiet back link on its own row (owner round 2: the arrow glued
                to the title read badly). No autofocus on step 1 for the same
                round: the keyboard covered the format chips before the coach
                ever saw them. */}
            <button
              type="button"
              data-testid="wizard-back"
              onClick={() => setStep(1)}
              className="self-start -ml-1 mt-1 px-1 text-sm text-slate-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
            >
              &lsaquo; {t('setupWizard.back', 'Back')}
            </button>
            <h2 className="text-2xl font-bold text-center">
              {t('setupWizard.playersTitle', 'Players')}
            </h2>
            <p className="text-sm text-slate-400 text-center mt-2">
              {t('setupWizard.playersHint', 'One name per row - Enter adds the next.')}
            </p>
          {/* No card chrome (round 8) - the same open background as the
              landing; the column keeps its pinned-input / scrolling-rows /
              pinned-Valmis structure. */}
          <div className="flex-1 min-h-0 mt-5 flex flex-col">

            {/* Input PINNED here (keyboard-safe, never moves as the list grows);
                committed rows stack BELOW it newest-first, so it is the OLD rows
                that scroll away behind the phone keyboard (owner round 1). The
                visible "+ Add" button gives Enter's action a discoverable twin -
                without it, coaches tapped the big Valmis after one name. */}
            <div className="flex gap-2">
              <input
                data-testid="wizard-player-input"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitDraft();
                  }
                }}
                placeholder={t('setupWizard.playerPlaceholder', 'Player name…') ?? undefined}
                className="flex-1 min-w-0 h-12 px-4 rounded-md bg-slate-800 border border-slate-700 text-base text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                type="button"
                data-testid="wizard-add-player"
                onClick={commitDraft}
                disabled={!draft.trim()}
                className="h-12 rounded-md bg-slate-600 hover:bg-slate-500 border border-slate-400/30 px-4 text-sm font-medium text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500"
              >
                {t('setupWizard.add', 'Add')}
              </button>
            </div>
            <p className="text-right text-xs text-slate-400 mt-2" data-testid="wizard-player-count">
              {t('setupWizard.playersAdded', '{{count}} players added', { count: totalCount })}
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 mt-2 -mx-1 px-1">
              {[...names].reverse().map((name, i) => {
                const originalIndex = names.length - 1 - i;
                return (
                  <div
                    key={`${name}-${originalIndex}`}
                    data-testid="wizard-player-row"
                    className="flex items-center justify-between rounded-lg bg-slate-800/90 border border-slate-700/60 px-3.5 py-2"
                  >
                    <span className="text-sm">{name}</span>
                    <button
                      type="button"
                      onClick={() => removeName(originalIndex)}
                      aria-label={`${t('setupWizard.removePlayer', 'Remove')} ${name}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Valmis announces what it will create, so a premature tap
                self-identifies ("Done (1 player)") instead of silently
                finishing a one-player roster. */}
            <button
              type="button"
              data-testid="wizard-finish"
              onClick={() => void handleFinish()}
              disabled={isSaving}
              className="flex-none mt-4 w-full p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-bold text-lg hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20 text-center disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-amber-500"
            >
              {isSaving
                ? t('setupWizard.saving', 'Saving…')
                : totalCount > 0
                  ? t('setupWizard.finishWithCount', 'Done ({{count}} players)', { count: totalCount })
                  : t('setupWizard.finish', 'Done')}
            </button>
          </div>
          </>
        )}

        {/* Quiet skip (owner decision): a text link, not a button - present for
            the coach who wants to look around first, invisible to the one who
            is already on the happy path. Creates nothing. */}
        <button
          type="button"
          data-testid="wizard-skip"
          onClick={handleSkip}
          className={`flex-none ${step === 1 ? 'mt-8 mb-auto' : 'mt-auto pt-5'} pb-1 text-sm text-slate-500 hover:text-slate-300 underline decoration-slate-600 underline-offset-2 text-center w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded`}
        >
          {skipLabel}
        </button>
      </div>
    </div>
  );
};

export default SetupWizard;
