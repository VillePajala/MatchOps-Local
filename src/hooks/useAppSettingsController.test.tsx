/**
 * L.0b: app/device-scope settings handlers extracted from useGameOrchestration
 * so SettingsModal works from the page-level ClubModalsHost with no game
 * mounted. Covers the hard-reset confirm flow, the Settings -> "show app
 * guide" -> Instructions chain, and the destructive reset flows themselves
 * (hard reset, re-sync, factory reset incl. the partial-cloud-failure branch).
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppSettingsController } from './useAppSettingsController';
import ModalProvider, { useModalContext } from '@/contexts/ModalProvider';

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({ userId: 'user-1' }),
}));
jest.mock('@/utils/appSettings', () => ({
  resetAppSettings: jest.fn().mockResolvedValue(undefined),
  resetUserAppSettings: jest.fn().mockResolvedValue(undefined),
  getLastHomeTeamName: jest.fn().mockResolvedValue('FC Persisted'),
  updateAppSettings: jest.fn().mockResolvedValue(undefined),
}));
const mockClearAllUserData = jest.fn();
jest.mock('@/datastore', () => ({
  getDataStore: jest.fn(async () => ({ clearAllUserData: mockClearAllUserData })),
}));
jest.mock('@/config/backendConfig', () => ({
  setMigrationCompleted: jest.fn(),
}));
jest.mock('@/utils/backupSnapshots', () => ({
  createSnapshot: jest.fn().mockResolvedValue(undefined),
}));
// JSDOM's window.location can't be replaced or redefined in this environment,
// so the controller reloads through this mockable indirection instead.
const reloadMock = jest.fn();
jest.mock('@/utils/reloadApp', () => ({
  __esModule: true,
  reloadApp: () => reloadMock(),
  default: () => reloadMock(),
}));
jest.mock('@/utils/logger', () => {
  const makeLogger = () => ({
    debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  });
  return { __esModule: true, default: makeLogger(), createLogger: makeLogger };
});

import {
  getLastHomeTeamName,
  resetAppSettings,
  resetUserAppSettings,
} from '@/utils/appSettings';
import { setMigrationCompleted } from '@/config/backendConfig';
import { createSnapshot } from '@/utils/backupSnapshots';


// Harness exposing both the controller and the modal context it drives.
function useHarness() {
  const controller = useAppSettingsController();
  const modal = useModalContext();
  return { controller, modal };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ModalProvider>{children}</ModalProvider>
);

const renderHarness = async () => {
  const utils = renderHook(useHarness, { wrapper });
  // Flush the async default-team-name load so its setState stays inside act.
  await act(async () => {});
  return utils;
};

describe('useAppSettingsController (L.0b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClearAllUserData.mockResolvedValue(undefined);
  });

  it('hard reset request opens the confirm flag; cancel clears it', async () => {
    const { result } = await renderHarness();
    expect(result.current.controller.showHardResetConfirm).toBe(false);
    act(() => result.current.controller.handleHardResetApp());
    expect(result.current.controller.showHardResetConfirm).toBe(true);
    act(() => result.current.controller.setShowHardResetConfirm(false));
    expect(result.current.controller.showHardResetConfirm).toBe(false);
  });


  it('loads the persisted default team name for the current user', async () => {
    const { result } = await renderHarness();
    await waitFor(() =>
      expect(result.current.controller.defaultTeamNameSetting).toBe('FC Persisted'),
    );
    expect(getLastHomeTeamName).toHaveBeenCalledWith('user-1');
  });

  it('confirmed hard reset wipes storage, raises the shared reset flag, and reloads', async () => {
    const { result } = await renderHarness();
    await act(async () => {
      await result.current.controller.handleHardResetConfirmed();
    });
    expect(resetAppSettings).toHaveBeenCalledTimes(1);
    expect(reloadMock).toHaveBeenCalledTimes(1);
    // The shared flag stays raised until the reload lands - the game tree
    // must remain unmounted for the whole wipe window.
    expect(result.current.modal.isAppResetting).toBe(true);
    expect(result.current.controller.showHardResetConfirm).toBe(false);
  });

  it('failed hard reset lowers the reset flag and shows an error toast (no reload)', async () => {
    (resetAppSettings as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHarness();
    await act(async () => {
      await result.current.controller.handleHardResetConfirmed();
    });
    expect(reloadMock).not.toHaveBeenCalled();
    expect(result.current.modal.isAppResetting).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('re-sync from cloud clears local data with the migration flag and reloads', async () => {
    const { result } = await renderHarness();
    await act(async () => {
      await result.current.controller.handleResyncFromCloud();
    });
    expect(resetUserAppSettings).toHaveBeenCalledWith('user-1', { clearMigrationFlag: true });
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(result.current.modal.isAppResetting).toBe(true);
  });

  it('factory reset snapshots first, clears cloud+local, marks migration done, reloads', async () => {
    const { result } = await renderHarness();
    await act(async () => {
      await result.current.controller.handleFactoryReset();
    });
    expect(createSnapshot).toHaveBeenCalledWith('user-1', 'pre-clear');
    expect(mockClearAllUserData).toHaveBeenCalledTimes(1);
    expect(resetUserAppSettings).toHaveBeenCalledWith('user-1', { clearMigrationFlag: false });
    expect(setMigrationCompleted).toHaveBeenCalledWith('user-1');
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('factory reset with cloud-clear failure still resets local, warns, and reloads', async () => {
    jest.useFakeTimers();
    try {
      mockClearAllUserData.mockRejectedValueOnce(new Error('cloud unreachable'));
      const { result } = await renderHarness();
      let promise: Promise<void>;
      act(() => {
        promise = result.current.controller.handleFactoryReset();
      });
      // The partial-failure branch waits 1.5s so the warning toast is visible.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
        await promise!;
      });
      expect(resetUserAppSettings).toHaveBeenCalledWith('user-1', { clearMigrationFlag: false });
      expect(setMigrationCompleted).toHaveBeenCalledWith('user-1');
      expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
      expect(reloadMock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
