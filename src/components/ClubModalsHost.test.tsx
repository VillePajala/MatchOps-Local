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
import { __resetModalHardwareBackForTests } from '@/hooks/useModalHardwareBack';

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
  let backSpy: jest.SpyInstance;

  beforeEach(() => {
    __resetModalHardwareBackForTests();
    // No-op implementation: jsdom's real back() fires an async popstate that
    // would race the assertions; the suppression counter is reset above.
    backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    backSpy.mockRestore();
  });

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
    // Closed by the back press itself - no programmatic back needed.
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('hardware back closes only the TOPMOST modal when two are stacked', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-rules'));
    await waitFor(() => expect(screen.getByTestId('rules-modal')).toBeInTheDocument());
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // Rules opened last -> it closes; Training underneath stays open.
    await waitFor(() => expect(screen.queryByTestId('rules-modal')).not.toBeInTheDocument());
    expect(screen.getByTestId('training-modal')).toBeInTheDocument();
    // A second back press closes the remaining modal.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument());
  });

  it('closing via the modal UI consumes the pushed history entry', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('close-training'));
    await waitFor(() => expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument());
    // The hook consumed its own history entry exactly once...
    expect(backSpy).toHaveBeenCalledTimes(1);
    // ...and the popstate that back() fires is swallowed - it must not
    // close or reopen anything.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument();
  });
});
