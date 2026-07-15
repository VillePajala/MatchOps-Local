/**
 * L.0b data-integrity contract: while a hard reset / re-sync / factory reset
 * wipes storage (shared isAppResetting flag), HomePage must unmount the WHOLE
 * game hook chain (useGameOrchestration -> ... -> usePrecisionTimer), not
 * just the rendered tree - a still-mounted timer keeps autosaving into the
 * storage being wiped. The blocking overlay renders in ClubModalsHost.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from './HomePage';
import ModalProvider, { useModalContext } from '@/contexts/ModalProvider';

const orchestrationSpy = jest.fn(() => ({
  gameContainerProps: {},
  modalManagerProps: {},
  isBootstrapping: false,
}));
jest.mock('@/components/HomePage/hooks/useGameOrchestration', () => ({
  useGameOrchestration: () => orchestrationSpy(),
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

function Harness() {
  const { setIsAppResetting, setIsTrainingResourcesOpen } = useModalContext();
  return (
    <>
      <button onClick={() => setIsAppResetting(true)}>start-reset</button>
      <button onClick={() => setIsTrainingResourcesOpen(true)}>provider-rerender</button>
    </>
  );
}

describe('HomePage (L.0b reset unmount)', () => {
  beforeEach(() => {
    orchestrationSpy.mockClear();
  });

  it('unmounts the game tree AND its hook chain while isAppResetting is set', async () => {
    render(
      <ModalProvider>
        <Harness />
        <HomePage skipInitialSetup />
      </ModalProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('game-container')).toBeInTheDocument());
    expect(screen.getByTestId('modal-manager')).toBeInTheDocument();
    expect(orchestrationSpy).toHaveBeenCalled();

    fireEvent.click(screen.getByText('start-reset'));

    await waitFor(() => expect(screen.queryByTestId('game-container')).not.toBeInTheDocument());
    expect(screen.queryByTestId('modal-manager')).not.toBeInTheDocument();

    // The hook chain must be DEAD, not just hidden: further provider renders
    // must not re-invoke useGameOrchestration (a mounted-but-null HomePage
    // would keep calling it, keeping timers/autosaves alive mid-wipe).
    const callsAfterUnmount = orchestrationSpy.mock.calls.length;
    fireEvent.click(screen.getByText('provider-rerender'));
    expect(orchestrationSpy.mock.calls.length).toBe(callsAfterUnmount);
  });
});
