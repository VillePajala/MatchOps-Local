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
import { useAssessmentRatingStyle } from '@/hooks/useAssessmentRatingStyle';
import { useAssessmentTemplate } from '@/hooks/useAssessmentTemplate';

type HomePageProps = UseGameOrchestrationProps;

function HomePage(props: HomePageProps) {
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

  // L.0b: the resetting overlay moved to ClubModalsHost - the reset flow is
  // owned by useAppSettingsController and must work with no game mounted.

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
