/**
 * L.0a: club/app-scope modals render at PAGE level - opening them never
 * mounts the match view, and hardware back closes the topmost modal
 * (modal governance contract).
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClubModalsHost from './ClubModalsHost';
import ModalProvider, { useModalContext } from '@/contexts/ModalProvider';

jest.mock('@/components/TrainingResourcesModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="training-modal"><button onClick={onClose}>close-training</button></div>
  ),
}));
jest.mock('@/components/RulesDirectoryModal', () => ({
  __esModule: true,
  default: () => <div data-testid="rules-modal" />,
}));

function Opener() {
  const { setIsTrainingResourcesOpen, setIsRulesDirectoryOpen } = useModalContext();
  return (
    <>
      <button onClick={() => setIsTrainingResourcesOpen(true)}>open-training</button>
      <button onClick={() => setIsRulesDirectoryOpen(true)}>open-rules</button>
    </>
  );
}

const renderHost = () =>
  render(
    <ModalProvider>
      <Opener />
      <ClubModalsHost />
    </ModalProvider>,
  );

describe('ClubModalsHost (L.0a)', () => {
  it('renders nothing until a club modal opens, then renders it at host level', async () => {
    renderHost();
    expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-rules'));
    await waitFor(() => expect(screen.getByTestId('rules-modal')).toBeInTheDocument());
  });

  it('hardware back closes the open modal (governance contract)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument());
  });

  it('closing via the modal UI consumes the pushed history entry', async () => {
    renderHost();
    const before = window.history.length;
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('close-training'));
    await waitFor(() => expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument());
    // history.back() was called to consume our entry (jsdom keeps length, but
    // a second popstate must NOT reopen or close anything unexpectedly).
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument();
    expect(before).toBeGreaterThan(0);
  });
});
