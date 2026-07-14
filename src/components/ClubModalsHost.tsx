'use client';

/**
 * ClubModalsHost - the page-level home for club/app-scope modals (two-level
 * restructure, L-waves). Rendered on BOTH screens (Home and match), so
 * opening these from Home never mounts the match view, and closing them
 * lands back on whatever screen the user was on.
 *
 * Wave L.0a: TrainingResources + RulesDirectory (self-contained; open-state
 * already lives in ModalProvider). Later waves move the remaining club
 * modals here - see two-level-app-structure.md §6. A modal must NEVER render
 * both here and in ModalManager (dual-render guard: the ModalManager block
 * is deleted in the same PR that lifts a modal).
 */
import React from 'react';
import dynamic from 'next/dynamic';
import { useModalContext } from '@/contexts/ModalProvider';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';

const TrainingResourcesModal = dynamic(() => import('@/components/TrainingResourcesModal'));
const RulesDirectoryModal = dynamic(() => import('@/components/RulesDirectoryModal'));

export default function ClubModalsHost() {
  const {
    isTrainingResourcesOpen,
    setIsTrainingResourcesOpen,
    isRulesDirectoryOpen,
    setIsRulesDirectoryOpen,
  } = useModalContext();

  // Hardware-back contract (modal governance): back closes the modal.
  useModalHardwareBack(isTrainingResourcesOpen, () => setIsTrainingResourcesOpen(false));
  useModalHardwareBack(isRulesDirectoryOpen, () => setIsRulesDirectoryOpen(false));

  return (
    <>
      {isTrainingResourcesOpen && (
        <TrainingResourcesModal isOpen onClose={() => setIsTrainingResourcesOpen(false)} />
      )}
      {isRulesDirectoryOpen && (
        <RulesDirectoryModal isOpen onClose={() => setIsRulesDirectoryOpen(false)} />
      )}
    </>
  );
}
