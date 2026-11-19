'use client';

/**
 * NextGameFlow - "Milloin seuraava peli?" and then the plan screen, as one
 * full-screen flow (Onboarding v3 steps 4-5; review R1, R3, R10).
 *
 * Two entries, one flow:
 *   - the setup wizard, right after "Valmis" (it passes the squad it created);
 *   - basic Home's "Uusi ottelu" (the squad is read back from the account:
 *     `resolveNextGameContext`).
 * "Tee suunnitelma" creates the game and its one-game plan (createNextGamePair)
 * and shows the plan (PlanQuickView); "Näyttää hyvältä" ends the flow.
 *
 * While the date step is open its answers are kept on the device
 * (nextGameStepDraft), so a reload or an app kill brings the coach back to it
 * (R3). Hardware/browser back steps back (R10): from the date step to the
 * previous screen (the wizard's player list, or Home), from the plan to Home.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/contexts/ToastProvider';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';
import { createNextGamePair, type NextGamePair } from '@/services/nextGamePair';
import { resolveNextGameContext, type NextGameContext } from '@/services/nextGameContext';
import { buildAndPersistNewGame } from '@/components/HomePage/utils/newGameHandlers';
import { savePlan, deletePlan, getPlans } from '@/utils/playtimePlanner/storage';
import { getSavedGames, saveGame as utilSaveGame } from '@/utils/savedGames';
import { saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting } from '@/utils/appSettings';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { getAllTeamRosters, getTeams } from '@/utils/teams';
import { getStoredSetupAgeGroup, getStoredSetupFormat } from '@/components/setupWizardActive';
import {
  clearNextGameStepDraft,
  readNextGameStepDraft,
  writeNextGameStepDraft,
  type NextGameStepDraft,
} from '@/utils/nextGameStepDraft';
import NextGameStep from './NextGameStep';
import PlanQuickView from './PlanQuickView';
import { recordMilestone } from '@/utils/onboardingMilestones';
import logger from '@/utils/logger';
import { primaryButtonStyle, subtextStyle } from '@/styles/modalStyles';

export interface NextGameFlowProps {
  userId: string | undefined;
  /** The squad when the caller has it (the wizard); read from the account otherwise. */
  context?: NextGameContext;
  /**
   * The flow is over. 'planned': a game and its plan were made and the coach
   * saw the plan; 'skipped': nothing was made ("Ei nyt", or back from the date
   * step with nowhere else to go).
   */
  onClose: (outcome: 'planned' | 'skipped') => void;
  /** Back from the date step to a previous step (the wizard's player list). */
  onBack?: () => void;
  /** "Lisää asetuksia": the full New Game form (Home only). */
  onMoreSettings?: () => void;
}

type LoadState = { status: 'loading' } | { status: 'ready'; context: NextGameContext } | { status: 'failed' };

const NextGameFlow: React.FC<NextGameFlowProps> = ({
  userId,
  context: givenContext,
  onClose,
  onBack,
  onMoreSettings,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [load, setLoad] = useState<LoadState>(() =>
    givenContext ? { status: 'ready', context: givenContext } : { status: 'loading' },
  );
  const [pair, setPair] = useState<NextGamePair | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const creatingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The answers so far: from a step left open before a reload, if any (R3).
  const [initialDraft] = useState<NextGameStepDraft | null>(() => readNextGameStepDraft(userId));
  const draftRef = useRef<NextGameStepDraft>(initialDraft ?? { gameDate: '', opponent: '' });
  // Open = recorded, so a kill from here on brings the coach back to this step.
  useEffect(() => {
    if (!pair) writeNextGameStepDraft(userId, draftRef.current);
  }, [userId, pair]);
  const handleDraftChange = useCallback(
    (draft: NextGameStepDraft) => {
      draftRef.current = draft;
      writeNextGameStepDraft(userId, draft);
    },
    [userId],
  );

  // Home: read the team, its players, format and length back from the account.
  useEffect(() => {
    if (givenContext) return;
    let cancelled = false;
    (async () => {
      try {
        const [teams, roster, games, plans, teamRosters] = await Promise.all([
          getTeams(userId),
          getMasterRoster(userId),
          getSavedGames(userId),
          getPlans(),
          getAllTeamRosters(userId),
        ]);
        if (cancelled) return;
        const resolved = resolveNextGameContext({
          teams,
          roster,
          teamRosters,
          games,
          plans: Object.values(plans),
          storedFormat: getStoredSetupFormat(userId ?? null),
          storedAgeGroup: getStoredSetupAgeGroup(userId ?? null),
          fallbackTeamName: t('nextGameStep.ownTeam', 'My team'),
        });
        setLoad(resolved ? { status: 'ready', context: resolved } : { status: 'failed' });
      } catch (error) {
        logger.error('[NextGameFlow] context load failed:', error);
        if (!cancelled) setLoad({ status: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [givenContext, userId, t]);

  const leave = useCallback(
    (outcome: 'planned' | 'skipped') => {
      clearNextGameStepDraft(userId);
      onClose(outcome);
    },
    [userId, onClose],
  );

  const handleBack = useCallback(() => {
    if (pair) {
      leave('planned');
      return;
    }
    if (onBack) {
      clearNextGameStepDraft(userId);
      onBack();
      return;
    }
    leave('skipped');
  }, [pair, onBack, leave, userId]);
  useModalHardwareBack(true, handleBack);

  const handleSubmit = useCallback(
    async (gameDate: string, opponent: string) => {
      if (load.status !== 'ready' || creatingRef.current) return;
      creatingRef.current = true;
      setIsCreating(true);
      const ctx = load.context;
      try {
        const created = await createNextGamePair(
          {
            savePlan,
            deletePlan,
            createGame: (request) =>
              buildAndPersistNewGame(
                {
                  availablePlayers: ctx.players,
                  savedGames: {},
                  queryClient,
                  showToast,
                  t,
                  utilSaveGame,
                  utilSaveCurrentGameIdSetting,
                  defaultSubIntervalMinutes: 5,
                  // The game belongs to no season or tournament, so the
                  // per-competition limit check never runs for it.
                  canCreate: () => true,
                  showUpgradePrompt: () => undefined,
                  userId,
                },
                request,
              ),
          },
          {
            ...ctx,
            gameDate,
            opponentName: opponent.trim() || t('nextGameStep.opponentDefault', 'Opponent'),
          },
        );
        if (!mountedRef.current) return;
        // The step is done: a reload from here lands on Home with the new game.
        clearNextGameStepDraft(userId);
        // The plan counts as seen the moment its screen opens (plan decision):
        // closing the app on it lands on Home next time. Kept once (D17).
        void recordMilestone('firstPlanSeen', userId);
        setPair(created);
      } catch (error) {
        logger.error('[NextGameFlow] next game creation failed:', error);
        if (mountedRef.current) {
          showToast(t('nextGameStep.error', 'Could not create the game - please try again.'), 'error');
        }
      } finally {
        creatingRef.current = false;
        if (mountedRef.current) setIsCreating(false);
      }
    },
    [load, queryClient, showToast, t, userId],
  );

  if (pair) {
    return (
      <div data-testid="next-game-flow" className="h-full">
        <PlanQuickView planId={pair.planId} gameId={pair.gameId} userId={userId} onDone={() => leave('planned')} />
      </div>
    );
  }

  if (load.status !== 'ready') {
    return (
      <div
        data-testid="next-game-flow"
        className="s1-canvas flex h-screen h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center font-ui text-ink"
      >
        {load.status === 'loading' ? (
          <p className={subtextStyle} role="status">
            {t('common.loading', 'Loading...')}
          </p>
        ) : (
          <>
            <p className="text-[15px] text-ink-2" data-testid="next-game-flow-failed">
              {t('nextGameStep.noSquad', 'Add players first, then plan the game.')}
            </p>
            <button type="button" onClick={() => leave('skipped')} className={`${primaryButtonStyle} min-h-12 w-full max-w-sm`}>
              {t('nextGameStep.backHome', 'Back to Home')}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div data-testid="next-game-flow">
      <NextGameStep
        onSubmit={handleSubmit}
        onSkip={() => leave('skipped')}
        isSaving={isCreating}
        initialDraft={initialDraft}
        onDraftChange={handleDraftChange}
        onMoreSettings={
          onMoreSettings
            ? () => {
                clearNextGameStepDraft(userId);
                onMoreSettings();
              }
            : undefined
        }
      />
    </div>
  );
};

export default NextGameFlow;
