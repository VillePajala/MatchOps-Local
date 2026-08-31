'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import { addPlayer } from '@/utils/masterRosterManager';
import { addTeam, setTeamRoster } from '@/utils/teams';
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

// --- Wizard-active store (module level) -------------------------------------
// The marketing-consent prompt lives in layout.tsx OUTSIDE the page tree, so it
// can't read page state; this tiny external store lets it defer while the
// wizard is on screen (same role the guided tour's isActive plays for it).
let wizardActive = false;
const listeners = new Set<() => void>();
const setWizardActive = (value: boolean) => {
  if (wizardActive === value) return;
  wizardActive = value;
  listeners.forEach((l) => l());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => wizardActive;
const getServerSnapshot = () => false;

/** True while the setup wizard is mounted - the marketing prompt defers on it. */
export function useSetupWizardActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// --- Per-user one-time flag --------------------------------------------------
// Same localStorage pattern as the guided tour's completion flag.
const DONE_PREFIX = 'matchops_setup_wizard_done_';
const FORMAT_PREFIX = 'matchops_setup_format_';

/**
 * Whether this account has already seen the wizard (finished OR skipped).
 * On any storage failure we report "done" - never trap a user in a wizard
 * whose dismissal can't persist.
 */
export function isSetupWizardDone(userId: string | null): boolean {
  if (typeof window === 'undefined') return true;
  try {
    // eslint-disable-next-line no-restricted-globals -- one-time onboarding flag, not app data (same pattern as the guided-tour flag)
    return localStorage.getItem(`${DONE_PREFIX}${userId ?? 'local'}`) === '1';
  } catch {
    return true;
  }
}

function markSetupWizardDone(userId: string | null): void {
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

  // Retry safety: a failed finish must not duplicate what already got created.
  const createdPlayersRef = useRef<Player[]>([]);
  const createdTeamRef = useRef<Team | null>(null);

  useEffect(() => {
    setWizardActive(true);
    return () => setWizardActive(false);
  }, []);

  const finish = useCallback(() => {
    markSetupWizardDone(userId);
    onComplete();
  }, [userId, onComplete]);

  /** Quiet skip: creates NOTHING, on either step. "Valmis" is the only creator. */
  const handleSkip = useCallback(() => {
    if (isSaving) return;
    finish();
  }, [isSaving, finish]);

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
    if (isSaving) return;
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

      finish();
    } catch (error) {
      logger.error('[SetupWizard] finish failed:', error);
      showToast(t('setupWizard.error', 'Saving failed - please try again.'), 'error');
      setIsSaving(false);
    }
  }, [isSaving, draft, names, teamName, format, userId, queryClient, showToast, t, finish]);

  const skipLabel = t('setupWizard.skip', "Skip, I'll do this later");

  return (
    <div
      data-testid="setup-wizard"
      className="flex flex-col h-screen h-[100dvh] bg-slate-900 text-white overflow-y-auto"
    >
      <div className="w-full max-w-sm mx-auto flex flex-col flex-1 px-6 py-8">
        <h1 className="text-4xl font-bold tracking-tight text-center">
          <span className="text-amber-400">MatchOps</span>
        </h1>

        {/* Step dots */}
        <div className="flex gap-1.5 justify-center mt-3 mb-6" aria-hidden="true">
          <span className="w-6 h-1 rounded-full bg-amber-400" />
          <span className={`w-6 h-1 rounded-full ${step === 2 ? 'bg-amber-400' : 'bg-slate-700'}`} />
        </div>

        {step === 1 ? (
          <>
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
              autoFocus
              className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3.5 py-2.5 text-base text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
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
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                    format === f
                      ? 'bg-indigo-600 text-white'
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
              onClick={() => setStep(2)}
              disabled={!teamName.trim()}
              className="w-full mt-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3 text-lg font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors disabled:opacity-40 disabled:hover:bg-indigo-600"
            >
              {t('setupWizard.next', 'Continue')}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="wizard-back"
                onClick={() => setStep(1)}
                aria-label={t('setupWizard.back', 'Back')}
                className="text-slate-400 hover:text-white text-xl leading-none px-1"
              >
                &lsaquo;
              </button>
              <h2 className="text-2xl font-semibold">
                {t('setupWizard.playersTitle', 'Players')}
              </h2>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {t('setupWizard.playersHint', 'One name per row - Enter adds the next.')}
            </p>

            <div className="flex flex-col gap-2 mt-5">
              {names.map((name, index) => (
                <div
                  key={`${name}-${index}`}
                  className="flex items-center justify-between rounded-lg bg-slate-800/90 border border-slate-700/60 px-3.5 py-2"
                >
                  <span className="text-sm">{name}</span>
                  <button
                    type="button"
                    onClick={() => removeName(index)}
                    aria-label={`${t('setupWizard.removePlayer', 'Remove')} ${name}`}
                    className="text-slate-500 hover:text-white px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
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
                autoFocus
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3.5 py-2.5 text-base text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
            <p className="text-right text-xs text-slate-400 mt-2" data-testid="wizard-player-count">
              {t('setupWizard.playersAdded', '{{count}} players added', {
                count: names.length + (draft.trim() ? 1 : 0),
              })}
            </p>

            <button
              type="button"
              data-testid="wizard-finish"
              onClick={() => void handleFinish()}
              disabled={isSaving}
              className="w-full mt-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3 text-lg font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors disabled:opacity-40 disabled:hover:bg-indigo-600"
            >
              {isSaving ? t('setupWizard.saving', 'Saving…') : t('setupWizard.finish', 'Done')}
            </button>
          </>
        )}

        {/* Quiet skip (owner decision): a text link, not a button - present for
            the coach who wants to look around first, invisible to the one who
            is already on the happy path. Creates nothing. */}
        <button
          type="button"
          data-testid="wizard-skip"
          onClick={handleSkip}
          className="mt-auto pt-8 pb-1 text-sm text-slate-500 hover:text-slate-300 underline decoration-slate-600 underline-offset-2 text-center w-full"
        >
          {skipLabel}
        </button>
      </div>
    </div>
  );
};

export default SetupWizard;
