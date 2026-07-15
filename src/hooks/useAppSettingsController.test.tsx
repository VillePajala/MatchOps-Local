/**
 * L.0b: app/device-scope settings handlers extracted from useGameOrchestration
 * so SettingsModal works from the page-level ClubModalsHost with no game
 * mounted. Covers the hard-reset confirm flow and the Settings -> "show app
 * guide" -> Instructions chain (both page-level contracts).
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppSettingsController } from './useAppSettingsController';
import ModalProvider, { useModalContext } from '@/contexts/ModalProvider';

jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({ userId: 'user-1' }),
}));
jest.mock('@/utils/appSettings', () => ({
  resetAppSettings: jest.fn().mockResolvedValue(undefined),
  resetUserAppSettings: jest.fn().mockResolvedValue(undefined),
  saveHasSeenAppGuide: jest.fn(),
  getLastHomeTeamName: jest.fn().mockResolvedValue('FC Persisted'),
  updateAppSettings: jest.fn().mockResolvedValue(undefined),
}));

import { saveHasSeenAppGuide, getLastHomeTeamName } from '@/utils/appSettings';

// Harness exposing both the controller and the modal context it drives.
function useHarness() {
  const controller = useAppSettingsController();
  const modal = useModalContext();
  return { controller, modal };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ModalProvider>{children}</ModalProvider>
);

describe('useAppSettingsController (L.0b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hard reset request opens the confirm flag; cancel clears it', async () => {
    const { result } = renderHook(useHarness, { wrapper });
    // Flush the async default-team-name load so its setState stays inside act.
    await act(async () => {});
    expect(result.current.controller.showHardResetConfirm).toBe(false);
    act(() => result.current.controller.handleHardResetApp());
    expect(result.current.controller.showHardResetConfirm).toBe(true);
    act(() => result.current.controller.setShowHardResetConfirm(false));
    expect(result.current.controller.showHardResetConfirm).toBe(false);
  });

  it('show app guide closes Settings and opens Instructions (chain survives the lift)', async () => {
    const { result } = renderHook(useHarness, { wrapper });
    await act(async () => {});
    act(() => result.current.modal.setIsSettingsModalOpen(true));
    expect(result.current.modal.isSettingsModalOpen).toBe(true);

    act(() => result.current.controller.handleShowAppGuide());

    expect(saveHasSeenAppGuide).toHaveBeenCalledWith(false);
    expect(result.current.modal.isSettingsModalOpen).toBe(false);
    expect(result.current.modal.isInstructionsModalOpen).toBe(true);
  });

  it('loads the persisted default team name for the current user', async () => {
    const { result } = renderHook(useHarness, { wrapper });
    await waitFor(() =>
      expect(result.current.controller.defaultTeamNameSetting).toBe('FC Persisted'),
    );
    expect(getLastHomeTeamName).toHaveBeenCalledWith('user-1');
  });
});
