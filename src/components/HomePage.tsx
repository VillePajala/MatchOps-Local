'use client';

import React, { useState, useEffect } from 'react';
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

  // "Cheat" to avoid layout shift: when bootstrapping ends, render GameContainer
  // invisibly for one frame so it can layout, then reveal it. The loading screen
  // stays as a fixed overlay during that invisible frame.
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    if (!isBootstrapping && !isResetting) {
      // Double rAF: first frame renders GameContainer at opacity-0,
      // second frame it has laid out → safe to reveal
      let innerFrameId: number;
      const outerFrameId = requestAnimationFrame(() => {
        innerFrameId = requestAnimationFrame(() => {
          setLayoutReady(true);
        });
      });
      return () => {
        cancelAnimationFrame(outerFrameId);
        cancelAnimationFrame(innerFrameId);
      };
    } else {
      setLayoutReady(false);
    }
  }, [isBootstrapping, isResetting]);

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
      {/* Keep loading overlay until layout has settled */}
      {!layoutReady && (
        <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" aria-hidden="true" />
            <p className="text-slate-400 text-sm">{t('status.loadingGameData', 'Loading Game Data...')}</p>
          </div>
        </div>
      )}
      {/* Render game view - invisible until layout settles, then instant reveal */}
      <div style={{ opacity: layoutReady ? 1 : 0 }}>
        <GameContainer {...gameContainerProps} />
      </div>
      <ModalManager {...modalManagerProps} />
    </>
  );
}

export default HomePage;
