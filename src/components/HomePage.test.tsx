/**
 * L.0b data-integrity contract: while a hard reset / re-sync / factory reset
 * wipes storage (shared isAppResetting flag), HomePage must UNMOUNT
 * GameContainer + ModalManager so no in-flight timer/query/autosave touches
 * the data mid-wipe. The blocking overlay renders in ClubModalsHost.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from './HomePage';
import ModalProvider, { useModalContext } from '@/contexts/ModalProvider';

jest.mock('@/components/HomePage/hooks/useGameOrchestration', () => ({
  useGameOrchestration: () => ({
    gameContainerProps: {},
    modalManagerProps: {},
    isBootstrapping: false,
  }),
}));
jest.mock('@/components/HomePage/containers/GameContainer', () => ({
  GameContainer: () => <div data-testid="game-container" />,
}));
jest.mock('@/components/HomePage/containers/ModalManager', () => ({
  ModalManager: () => <div data-testid="modal-manager" />,
}));
jest.mock('@/hooks/useAssessmentRatingStyle', () => ({
  useAssessmentRatingStyle: () => 'words',
}));
jest.mock('@/hooks/useAssessmentTemplate', () => ({
  useAssessmentTemplate: () => 'balanced',
}));

function ResetToggle() {
  const { setIsAppResetting } = useModalContext();
  return <button onClick={() => setIsAppResetting(true)}>start-reset</button>;
}

describe('HomePage (L.0b reset unmount)', () => {
  it('unmounts the game tree while isAppResetting is set', async () => {
    render(
      <ModalProvider>
        <ResetToggle />
        <HomePage skipInitialSetup />
      </ModalProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('game-container')).toBeInTheDocument());
    expect(screen.getByTestId('modal-manager')).toBeInTheDocument();

    fireEvent.click(screen.getByText('start-reset'));

    await waitFor(() => expect(screen.queryByTestId('game-container')).not.toBeInTheDocument());
    expect(screen.queryByTestId('modal-manager')).not.toBeInTheDocument();
  });
});
