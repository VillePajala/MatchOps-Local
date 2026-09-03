'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import { addPlayer } from '@/utils/masterRosterManager';
import { addTeam, setTeamRoster } from '@/utils/teams';
import { setSetupWizardActive } from './setupWizardActive';
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
const FORMAT_PREFIX = 'matchops_setup_format_';

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
        const player = await addPlayer(
          { name, nickname: '', jerseyNumber: '', notes: '' },
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
      try {
        // eslint-disable-next-line no-restricted-globals -- per-user UI default hint, not app data
        localStorage.setItem(`${FORMAT_PREFIX}${userId ?? 'local'}`, format);
      } catch {
        // Non-critical preference - ignore.
      }

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
      className="flex flex-col h-screen h-[100dvh] bg-slate-900 text-white overflow-y-auto"
    >
      <div className="w-full max-w-sm mx-auto flex flex-col flex-1 px-6 py-8">
        <h1 className="text-5xl font-bold tracking-tight text-center mt-2">
          <span className="text-amber-400">MatchOps</span>
        </h1>
        <p className="text-center text-slate-400 mt-1.5">
          {t('startScreen.tagline', 'Plan · Track · Discover')}
        </p>

        {/* Step dots */}
        <div className="flex gap-1.5 justify-center mt-5 mb-8" aria-hidden="true">
          <span className="w-6 h-1 rounded-full bg-amber-400" />
          <span className={`w-6 h-1 rounded-full ${step === 2 ? 'bg-amber-400' : 'bg-slate-700'}`} />
        </div>

        {step === 1 ? (
          /* Owner round 5: deterministic rhythm instead of centering - the
             card sits anchored under the header and the ONLY flexible gap is
             above the bottom skip link. (my-auto + the skip's mt-auto split
             the whitespace into odd thirds - nothing looked anchored.) The
             card fill is also a step stronger so it reads as a surface, not a
             stray hairline box. */
          {/* House surface recipe (owner round 6: the wizard spoke a foreign
              dialect - ghost-outline 2xl card, hollow chips, too-dark input).
              This is the exact inner-card vocabulary of the app's forms. */}
          <div className="mt-6 rounded-lg bg-slate-900/70 border border-slate-700 shadow-inner p-5">
            <h2 className="text-2xl font-semibold">
              {t('setupWizard.teamTitle', 'Your team')}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {t('setupWizard.teamHint', 'Name your team - you can fill in details later.')}
            </p>

            <label
              htmlFor="setup-team-name"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mt-6 mb-1.5"
            >
              {t('setupWizard.teamNameLabel', 'Team name')}
            </label>
            <input
              id="setup-team-name"
              data-testid="wizard-team-name"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder={t('setupWizard.teamNamePlaceholder', 'e.g. FC Honka P12') ?? undefined}
              className="w-full rounded-md bg-slate-700 border border-slate-600 px-3.5 py-2.5 text-base text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            />

            <div className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mt-5 mb-1.5">
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
                  className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors shadow-sm ${
                    format === f
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
                // card (input, Lisaa, Valmis, skip) is visible first.
                (document.activeElement as HTMLElement | null)?.blur?.();
                setStep(2);
              }}
              disabled={!teamName.trim()}
              className="w-full mt-6 rounded-lg bg-indigo-600 hover:bg-indigo-500 py-3 text-lg font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors disabled:opacity-40 disabled:hover:bg-indigo-600"
            >
              {t('setupWizard.next', 'Continue')}
            </button>
          </div>
        ) : (
          /* Step 2 does not scroll the PAGE in portrait (owner round 3): the
             card fills the remaining height, the ROWS scroll internally
             (newest first, oldest slide away), and Valmis + the skip link stay
             pinned. The page keeps overflow-y-auto as a FALLBACK only - on a
             short/landscape viewport the fixed-height children exceed 100dvh
             and the page must scroll rather than clip (review #732). */
          <div className="flex-1 min-h-0 mt-2 flex flex-col rounded-lg bg-slate-900/70 border border-slate-700 shadow-inner p-5">
            {/* Quiet back link on its own row (owner round 2: the arrow glued
                to the title read badly). No autofocus on step 1 for the same
                round: the keyboard covered the format chips before the coach
                ever saw them. */}
            <button
              type="button"
              data-testid="wizard-back"
              onClick={() => setStep(1)}
              className="self-start -ml-1 mb-1 px-1 text-sm text-slate-500 hover:text-slate-300"
            >
              &lsaquo; {t('setupWizard.back', 'Back')}
            </button>
            <h2 className="text-2xl font-semibold">
              {t('setupWizard.playersTitle', 'Players')}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {t('setupWizard.playersHint', 'One name per row - Enter adds the next.')}
            </p>

            {/* Input PINNED here (keyboard-safe, never moves as the list grows);
                committed rows stack BELOW it newest-first, so it is the OLD rows
                that scroll away behind the phone keyboard (owner round 1). The
                visible "+ Add" button gives Enter's action a discoverable twin -
                without it, coaches tapped the big Valmis after one name. */}
            <div className="mt-5 flex gap-2">
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
                className="flex-1 min-w-0 rounded-md bg-slate-700 border border-slate-600 px-3.5 py-2.5 text-base text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                type="button"
                data-testid="wizard-add-player"
                onClick={commitDraft}
                disabled={!draft.trim()}
                className="rounded-md bg-slate-700 hover:bg-slate-600 px-4 text-sm font-semibold text-white transition-colors disabled:opacity-40 shadow-sm"
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
                    className="flex items-center justify-between rounded-md bg-slate-800/90 border border-slate-700/60 px-3.5 py-2"
                  >
                    <span className="text-sm">{name}</span>
                    <button
                      type="button"
                      onClick={() => removeName(originalIndex)}
                      aria-label={`${t('setupWizard.removePlayer', 'Remove')} ${name}`}
                      className="text-slate-500 hover:text-white px-1"
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
              className="w-full flex-none mt-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 py-3 text-lg font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors disabled:opacity-40 disabled:hover:bg-indigo-600"
            >
              {isSaving
                ? t('setupWizard.saving', 'Saving…')
                : totalCount > 0
                  ? t('setupWizard.finishWithCount', 'Done ({{count}} players)', { count: totalCount })
                  : t('setupWizard.finish', 'Done')}
            </button>
          </div>
        )}

        {/* Quiet skip (owner decision): a text link, not a button - present for
            the coach who wants to look around first, invisible to the one who
            is already on the happy path. Creates nothing. */}
        <button
          type="button"
          data-testid="wizard-skip"
          onClick={handleSkip}
          className="flex-none mt-auto pt-5 pb-1 text-sm text-slate-500 hover:text-slate-300 underline decoration-slate-600 underline-offset-2 text-center w-full"
        >
          {skipLabel}
        </button>
      </div>
    </div>
  );
};

export default SetupWizard;
