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
import { useModalContext } from '@/contexts/ModalProvider';
import { useAssessmentRatingStyle } from '@/hooks/useAssessmentRatingStyle';
import { useAssessmentTemplate } from '@/hooks/useAssessmentTemplate';

type HomePageProps = UseGameOrchestrationProps;

/**
 * Reset gate (L.0b): while useAppSettingsController wipes data (hard reset /
 * re-sync / factory reset), the ENTIRE game hook chain must stop - not just
 * the rendered tree. Returning null from inside HomePageInner would keep its
 * hooks alive (useGameOrchestration -> useTimerManagement -> useGameTimer ->
 * usePrecisionTimer keeps ticking and autosaving into the storage being
 * wiped). So the gate lives in a PARENT component: unmounting HomePageInner
 * runs the timer hooks' cleanups (interval cleared, pending debounced save
 * cleared - not flushed) and cancels query subscriptions wholesale.
 * The blocking overlay renders in ClubModalsHost (page level).
 */
function HomePage(props: HomePageProps) {
  const { isAppResetting } = useModalContext();
  if (isAppResetting) {
    return null;
  }
  return <HomePageInner {...props} />;
}

function HomePageInner(props: HomePageProps) {
  const { t } = useTranslation();
  const {
    gameContainerProps,
    modalManagerProps,
    isBootstrapping,
  } = useGameOrchestration(props);
  const assessmentRatingStyle = useAssessmentRatingStyle();
  const assessmentTemplate = useAssessmentTemplate();

  // "Cheat" to avoid layout shift: when bootstrapping ends, render GameContainer
  // invisibly for one frame so it can layout, then reveal it. The loading screen
  // stays as a fixed overlay during that invisible frame.
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    if (isBootstrapping) return;

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
      // Reset layout flag when re-entering bootstrap state
      // (cleanup runs before next effect when dependencies change)
      setLayoutReady(false);
    };
  }, [isBootstrapping]);

  if (isBootstrapping) {
    return <LoadingScreen message={t('status.loadingGameData', 'Loading Game Data...')} />;
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
      <ModalManager {...modalManagerProps} ratingStyle={assessmentRatingStyle} assessmentTemplate={assessmentTemplate} />
    </>
  );
}

export default HomePage;
