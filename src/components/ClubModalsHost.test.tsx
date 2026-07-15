/**
 * L.0a/L.0b: club/app-scope modals render at PAGE level - opening them never
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
jest.mock('@/components/InstructionsModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="instructions-modal"><button onClick={onClose}>close-instructions</button></div>
  ),
}));
jest.mock('@/components/SettingsModal', () => ({
  __esModule: true,
  default: ({ onClose, initialTab }: { onClose: () => void; initialTab?: string }) => (
    <div data-testid="settings-modal" data-initial-tab={initialTab ?? ''}>
      <button onClick={onClose}>close-settings</button>
    </div>
  ),
}));

const mockController = {
  appLanguage: 'fi',
  setAppLanguage: jest.fn(),
  defaultTeamNameSetting: 'FC Test',
  setDefaultTeamNameSetting: jest.fn(),
  isResetting: false,
  showHardResetConfirm: false,
  setShowHardResetConfirm: jest.fn(),
  handleHardResetApp: jest.fn(),
  handleHardResetConfirmed: jest.fn(),
  handleResyncFromCloud: jest.fn(),
  handleFactoryReset: jest.fn(),
  handleCreateBackup: jest.fn(),
  handleCloudDataDownload: jest.fn(),
  handleShowAppGuide: jest.fn(),
};
jest.mock('@/hooks/useAppSettingsController', () => ({
  __esModule: true,
  useAppSettingsController: () => mockController,
  default: () => mockController,
}));

function Opener() {
  const {
    setIsTrainingResourcesOpen,
    setIsRulesDirectoryOpen,
    setIsInstructionsModalOpen,
    setIsSettingsModalOpen,
    openSettingsToTab,
  } = useModalContext();
  return (
    <>
      <button onClick={() => setIsTrainingResourcesOpen(true)}>open-training</button>
      <button onClick={() => setIsRulesDirectoryOpen(true)}>open-rules</button>
      <button onClick={() => setIsInstructionsModalOpen(true)}>open-instructions</button>
      <button onClick={() => setIsSettingsModalOpen(true)}>open-settings</button>
      <button onClick={() => openSettingsToTab('data')}>open-settings-data</button>
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

describe('ClubModalsHost (L.0a/L.0b)', () => {
  let backSpy: jest.SpyInstance;

  beforeEach(() => {
    __resetModalHardwareBackForTests();
    mockController.isResetting = false;
    mockController.showHardResetConfirm = false;
    // No-op implementation: jsdom's real back() fires an async popstate that
    // would race the assertions; the suppression counter is reset above.
    backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    backSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('renders nothing until a club modal opens, then renders it at host level', async () => {
    renderHost();
    expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-rules'));
    await waitFor(() => expect(screen.getByTestId('rules-modal')).toBeInTheDocument());
  });

  it('renders Settings and Instructions at host level (L.0b)', async () => {
    renderHost();
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('instructions-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-instructions'));
    await waitFor(() => expect(screen.getByTestId('instructions-modal')).toBeInTheDocument());
  });

  it('passes settingsInitialTab through to SettingsModal (openSettingsToTab contract)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-settings-data'));
    await waitFor(() =>
      expect(screen.getByTestId('settings-modal')).toHaveAttribute('data-initial-tab', 'data'),
    );
  });

  it('hardware back closes the open modal (governance contract)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-modal')).toBeInTheDocument());
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument());
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

  it('closing a NON-topmost modal via its own UI leaves the topmost open', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-rules'));
    await waitFor(() => expect(screen.getByTestId('rules-modal')).toBeInTheDocument());
    // Close the one UNDER the top (training opened first).
    fireEvent.click(screen.getByText('close-training'));
    await waitFor(() => expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument());
    expect(screen.getByTestId('rules-modal')).toBeInTheDocument();
    expect(backSpy).toHaveBeenCalledTimes(1);
    // The suppressed pop from back() must not close the remaining modal...
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('rules-modal')).toBeInTheDocument();
    // ...but the NEXT real back press does.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('rules-modal')).not.toBeInTheDocument());
  });

  it('renders the resetting overlay when a reset is in progress (L.0b)', () => {
    mockController.isResetting = true;
    renderHost();
    expect(screen.getByTestId('reset-overlay')).toBeInTheDocument();
  });

  it('unmounts all lifted modals during a reset wipe - overlay only (L.0b)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-modal')).toBeInTheDocument());
    // The wipe starts (re-render via a context change so the host re-reads
    // the controller flag): everything under the overlay must unmount.
    mockController.isResetting = true;
    fireEvent.click(screen.getByText('open-settings-data'));
    await waitFor(() => expect(screen.getByTestId('reset-overlay')).toBeInTheDocument());
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('hard-reset confirm dialog confirms through the controller (L.0b)', () => {
    mockController.showHardResetConfirm = true;
    renderHost();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(mockController.handleHardResetConfirmed).toHaveBeenCalledTimes(1);
  });

  it('hardware back closes the hard-reset confirm, NOT the Settings underneath (L.0b)', async () => {
    renderHost();
    // 1. Settings opens first and registers on the back stack.
    fireEvent.click(screen.getByText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-modal')).toBeInTheDocument());
    // 2. The confirm dialog opens ON TOP (re-render via a context change so
    //    its hardware-back effect re-runs and pushes it above Settings).
    mockController.showHardResetConfirm = true;
    fireEvent.click(screen.getByText('open-settings-data'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument());
    // 3. Hardware back must target the TOPMOST entry: the confirm dialog.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(mockController.setShowHardResetConfirm).toHaveBeenCalledWith(false);
    // Settings must stay open - no orphaned destructive dialog scenario.
    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
  });
});
