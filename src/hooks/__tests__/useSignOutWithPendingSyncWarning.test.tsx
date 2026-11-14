import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSignOutWithPendingSyncWarning } from '../useSignOutWithPendingSyncWarning';

const mockStatus = {
  mode: 'cloud' as 'cloud' | 'local',
  pendingCount: 0,
  failedCount: 0,
  isSyncing: false,
  isOnline: true,
  syncNow: jest.fn(),
};
jest.mock('@/hooks/useSyncStatus', () => ({ useSyncStatus: () => mockStatus }));
// The sync engine's own view (what the hook reads at click time and while syncing).
const mockEngineStatus = { pendingCount: 0, failedCount: 0, isOnline: true, state: 'synced' as string };
const mockGetStatus = jest.fn(async () => ({ ...mockEngineStatus }));
let mockEngineRunning = true;
jest.mock('@/sync', () => ({
  isSyncEngineInitialized: () => mockEngineRunning,
  getSyncEngine: () => ({ getStatus: mockGetStatus }),
}));
const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string) => fallback }),
}));
jest.mock('@/hooks/useFocusTrap', () => ({ useFocusTrap: () => {} }));
jest.mock('@/utils/logger', () => ({ __esModule: true, default: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn(), log: jest.fn() } }));

function Harness({ signOut }: { signOut: () => void }) {
  const { requestSignOut, signOutWarning } = useSignOutWithPendingSyncWarning(signOut);
  return (
    <div>
      <button onClick={requestSignOut}>sign out</button>
      {signOutWarning}
    </div>
  );
}

/**
 * Review 3.13: signing out warns first when the account has changes not yet in the
 * cloud; signing out anyway keeps them on the device (not a discard).
 * @critical
 */
describe('useSignOutWithPendingSyncWarning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockStatus, { mode: 'cloud', pendingCount: 0, failedCount: 0, isSyncing: false, isOnline: true });
    Object.assign(mockEngineStatus, { pendingCount: 0, failedCount: 0, isOnline: true, state: 'synced' });
    mockEngineRunning = true;
    mockGetStatus.mockImplementation(async () => ({ ...mockEngineStatus }));
    // Like the real syncNow: starts processing and resolves at once, never throws.
    mockStatus.syncNow.mockResolvedValue(undefined);
  });

  const unsent = (pendingCount: number, failedCount = 0) =>
    Object.assign(mockEngineStatus, { pendingCount, failedCount, state: 'pending' });

  it('signs out straight away when everything is synced', async () => {
    const signOut = jest.fn();
    render(<Harness signOut={signOut} />);
    await act(async () => { fireEvent.click(screen.getByText('sign out')); });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('warns when changes are pending or failed; "Sign out anyway" signs out without discarding', async () => {
    unsent(0, 2);
    const signOut = jest.fn();
    render(<Harness signOut={signOut} />);
    await act(async () => { fireEvent.click(screen.getByText('sign out')); });
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/stay on this device/)).toBeInTheDocument();
    expect(screen.queryByText('Discard & Continue')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('Sign out anyway')); });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('warns even when the hook\'s own counts have not loaded yet (asks the engine)', async () => {
    unsent(3); // mockStatus still reads 0/0, like right after a sign-in
    const signOut = jest.fn();
    render(<Harness signOut={signOut} />);
    await act(async () => { fireEvent.click(screen.getByText('sign out')); });
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('"Sync first" signs out only once the queue is really empty', async () => {
    unsent(1);
    mockEngineStatus.state = 'syncing';
    // The push finishes after a few status reads.
    let reads = 0;
    mockGetStatus.mockImplementation(async () => {
      reads++;
      if (reads >= 4) Object.assign(mockEngineStatus, { pendingCount: 0, state: 'synced' });
      return { ...mockEngineStatus };
    });
    const signOut = jest.fn();
    render(<Harness signOut={signOut} />);
    await act(async () => { fireEvent.click(screen.getByText('sign out')); });
    await act(async () => { fireEvent.click(screen.getByText('Sync First')); });
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(mockStatus.syncNow).toHaveBeenCalledTimes(1);
    expect(reads).toBeGreaterThanOrEqual(4); // did not sign out while changes were still queued
  });

  it('when changes remain after "Sync first", keeps the warning open and does not sign out', async () => {
    unsent(0, 1); // only a failed change in backoff: processing stops with it still there
    const signOut = jest.fn();
    render(<Harness signOut={signOut} />);
    await act(async () => { fireEvent.click(screen.getByText('sign out')); });
    await act(async () => { fireEvent.click(screen.getByText('Sync First')); });
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('Cancel neither signs out nor syncs', async () => {
    unsent(1);
    const signOut = jest.fn();
    render(<Harness signOut={signOut} />);
    await act(async () => { fireEvent.click(screen.getByText('sign out')); });
    await act(async () => { fireEvent.click(screen.getByText('Cancel')); });
    expect(signOut).not.toHaveBeenCalled();
    expect(mockStatus.syncNow).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
