'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';

/** Completion signals for the recommended full-setup workflow. */
export interface SetupProgress {
  players: boolean;
  competition: boolean;
  team: boolean;
  teamLinkedGame: boolean;
}

interface RecommendedSetupCardProps {
  progress: SetupProgress;
  onDismiss: () => void;
}

/** Full online guide section that walks through the recommended workflow. */
const GUIDE_URL = 'https://www.match-ops.com/guide/full-setup-path';

/**
 * A dismissible Start Screen card that teaches the fuller
 * players → competition → team → game-from-team → stats workflow that
 * quick-path users often miss. Shows live progress (ticks) but never blocks
 * the quick path. Hidden once all steps are done or the user dismisses it.
 */
const RecommendedSetupCard: React.FC<RecommendedSetupCardProps> = ({ progress, onDismiss }) => {
  const { t } = useTranslation();

  const steps = [
    { done: progress.players, label: t('recommendedSetup.stepPlayers', 'Add your players') },
    { done: progress.competition, label: t('recommendedSetup.stepCompetition', 'Create a competition (league or tournament)') },
    { done: progress.team, label: t('recommendedSetup.stepTeam', 'Build a team') },
    { done: progress.teamLinkedGame, label: t('recommendedSetup.stepGame', 'Start a game from that team') },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mt-6 max-w-sm mx-auto w-full rounded-xl bg-slate-800/70 border border-slate-700 p-4 text-left">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-semibold text-white">
          {t('recommendedSetup.title', 'Get the most out of MatchOps')}
        </h3>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('recommendedSetup.dismiss', 'Dismiss')}
          className="-mt-1 -mr-1 px-2 text-lg leading-none text-slate-500 hover:text-slate-300 transition-colors"
        >
          ×
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        {t('recommendedSetup.subtitle', 'A quick setup unlocks player, team, and competition stats.')} ({doneCount}/{steps.length})
      </p>
      <ul className="space-y-1.5 mb-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start text-sm">
            <span className={`mr-2 ${step.done ? 'text-green-400' : 'text-slate-600'}`} aria-hidden="true">
              {step.done ? '✓' : '○'}
            </span>
            <span className={step.done ? 'text-slate-500 line-through' : 'text-slate-200'}>{step.label}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500 mb-3">
        {t('recommendedSetup.payoff', 'Games started from a team pull in its roster and competition automatically — and your stats roll up by player, team, and competition.')}
      </p>
      <a
        href={GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-amber-400 hover:text-amber-300 hover:underline"
      >
        {t('recommendedSetup.showMeHow', 'Show me how')} →
      </a>
    </div>
  );
};

export default RecommendedSetupCard;
