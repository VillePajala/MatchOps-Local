/**
 * Review 7.3: a failed first sign-in cloud check must keep retrying until it
 * knows, and mark the account as checked only then.
 * @critical
 */
import { renderHook, act } from '@testing-library/react';
import { usePendingCloudPull, pendingCloudPullDelayMs } from '../usePendingCloudPull';

const hasCloudData = jest.fn();
const hydrateLocalFromCloudWithRetry = jest.fn();
jest.mock('@/services/reverseMigrationService', () => ({
  hasCloudData: (...a: unknown[]) => hasCloudData(...a),
  hydrateLocalFromCloudWithRetry: (...a: unknown[]) => hydrateLocalFromCloudWithRetry(...a),
}));
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

type Props = { pending: boolean; userId: string | undefined };

describe('usePendingCloudPull', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const setup = (initial: Props = { pending: true, userId: 'u1' }) => {
    const onPulled = jest.fn().mockResolvedValue(undefined);
    const onResolved = jest.fn();
    const hook = renderHook((p: Props) => usePendingCloudPull({ ...p, onPulled, onResolved }), { initialProps: initial });
    return { onPulled, onResolved, hook };
  };

  it('backs off 10 s, 20 s, 40 s, then once a minute', () => {
    expect([1, 2, 3, 4, 9].map(pendingCloudPullDelayMs)).toEqual([10_000, 20_000, 40_000, 60_000, 60_000]);
  });

  it('tries at once, retries a failing check, then pulls and resolves once the cloud answers', async () => {
    hasCloudData
      .mockResolvedValueOnce({ hasData: false, checkFailed: true, error: 'Failed to fetch' })
      .mockResolvedValueOnce({ hasData: true, checkFailed: false });
    hydrateLocalFromCloudWithRetry.mockResolvedValue({ success: true });
    const { onPulled, onResolved } = setup();

    await act(async () => { await flush(); });
    expect(hasCloudData).toHaveBeenCalledTimes(1);
    expect(onResolved).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(10_000); await flush(); });
    expect(hydrateLocalFromCloudWithRetry).toHaveBeenCalledWith('u1');
    expect(onPulled).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledWith('u1');
  });

  it('a failed pull is not "resolved" - it retries', async () => {
    hasCloudData.mockResolvedValue({ hasData: true, checkFailed: false });
    hydrateLocalFromCloudWithRetry.mockResolvedValueOnce({ success: false, errors: ['x'] }).mockResolvedValueOnce({ success: true });
    const { onResolved } = setup();

    await act(async () => { await flush(); });
    expect(onResolved).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(10_000); await flush(); });
    expect(onResolved).toHaveBeenCalledWith('u1');
  });

  it('an empty account resolves without a pull', async () => {
    hasCloudData.mockResolvedValue({ hasData: false, checkFailed: false });
    const { onPulled, onResolved } = setup();
    await act(async () => { await flush(); });
    expect(hydrateLocalFromCloudWithRetry).not.toHaveBeenCalled();
    expect(onPulled).not.toHaveBeenCalled();
    expect(onResolved).toHaveBeenCalledWith('u1');
  });

  it('a throw goes back on the schedule', async () => {
    hasCloudData.mockRejectedValueOnce(new Error('chunk load failed')).mockResolvedValue({ hasData: false, checkFailed: false });
    const { onResolved } = setup();
    await act(async () => { await flush(); });
    expect(onResolved).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(10_000); await flush(); });
    expect(onResolved).toHaveBeenCalledWith('u1');
  });

  it('tries at once when the device comes back online, but never twice at the same time', async () => {
    let answer: (v: unknown) => void = () => {};
    hasCloudData
      .mockResolvedValueOnce({ hasData: false, checkFailed: true, error: 'offline' })
      .mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const { onResolved } = setup();
    await act(async () => { await flush(); });
    expect(hasCloudData).toHaveBeenCalledTimes(1);

    await act(async () => { window.dispatchEvent(new Event('online')); await flush(); });
    await act(async () => { window.dispatchEvent(new Event('online')); await flush(); });
    expect(hasCloudData).toHaveBeenCalledTimes(2); // the second 'online' found one running

    await act(async () => { answer({ hasData: false, checkFailed: false }); await flush(); });
    expect(onResolved).toHaveBeenCalledWith('u1');
  });

  it('counts failed tries for the notice, and "Try again" skips the wait', async () => {
    hasCloudData.mockResolvedValue({ hasData: false, checkFailed: true, error: 'Failed to fetch' });
    const { hook, onResolved } = setup();
    await act(async () => { await flush(); });
    await act(async () => { jest.advanceTimersByTime(10_000); await flush(); });
    await act(async () => { jest.advanceTimersByTime(20_000); await flush(); });
    expect(hook.result.current.failures).toBe(3);

    hasCloudData.mockResolvedValue({ hasData: false, checkFailed: false });
    await act(async () => { hook.result.current.retryNow(); await flush(); });
    expect(onResolved).toHaveBeenCalledWith('u1');
    hook.rerender({ pending: false, userId: 'u1' });
    expect(hook.result.current.failures).toBe(0);
  });

  it('does nothing when not pending, and a pull cancelled by an account change never resolves', async () => {
    const idle = setup({ pending: false, userId: 'u1' });
    await act(async () => { jest.advanceTimersByTime(120_000); await flush(); });
    expect(hasCloudData).not.toHaveBeenCalled();
    idle.hook.unmount();

    let finishPull: (v: unknown) => void = () => {};
    hasCloudData.mockResolvedValue({ hasData: true, checkFailed: false });
    hydrateLocalFromCloudWithRetry.mockReturnValueOnce(new Promise((resolve) => { finishPull = resolve; }));
    const { onPulled, onResolved, hook } = setup();
    await act(async () => { await flush(); });
    expect(hydrateLocalFromCloudWithRetry).toHaveBeenCalledTimes(1);

    hook.rerender({ pending: true, userId: undefined }); // signed out mid-pull
    await act(async () => { finishPull({ success: true }); await flush(); });
    await act(async () => { jest.advanceTimersByTime(120_000); await flush(); });
    expect(onPulled).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
