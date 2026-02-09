'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingScreen } from '@/components/LoadingScreen';
import { GameContainer } from '@/components/HomePage/containers/GameContainer';
import { ModalManager } from '@/components/HomePage/containers/ModalManager';
import {
  useGameOrchestration,
  type UseGameOrchestrationProps,
} from '@/components/HomePage/hooks/useGameOrchestration';

type HomePageProps = UseGameOrchestrationProps;

function HomePage(props: HomePageProps) {
  const { t } = useTranslation();
  const {
    gameContainerProps,
    modalManagerProps,
    isBootstrapping,
    isResetting,
  } = useGameOrchestration(props);

  if (isBootstrapping) {
    return <LoadingScreen message={t('status.loadingGameData', 'Loading Game Data...')} />;
  }

  if (isResetting) {
    return (
      <div
        className="fixed inset-0 bg-slate-900 z-[9999] flex flex-col items-center justify-center"
        role="alert"
        aria-live="assertive"
        data-testid="reset-overlay"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
          <div className="text-center">
            <h2 className="text-xl font-bold text-slate-200 mb-2">
              {t('reset.resetting', 'Resetting Application...')}
            </h2>
            <p className="text-sm text-slate-400">
              {t('reset.pleaseWait', 'Please wait while we clear all data')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <GameContainer {...gameContainerProps} />
      <ModalManager {...modalManagerProps} />
    </>
  );
}

export default HomePage;
