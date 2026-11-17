/**
 * CR-H8: storage adapter retry-lockout recovery.
 *
 * After MAX_RETRY_ATTEMPTS consecutive adapter-creation failures, getStorageAdapter()
 * used to be permanently locked out — the retry state only reset on a successful
 * creation, which could never happen while locked, so the whole app stayed wedged
 * ("Storage is temporarily unavailable") until a full page reload. The TTL-based
 * lockout reset must clear that state after a cooldown so the app can recover.
 *
 * This file mocks ./storageFactory to force creation failures, which is why it lives
 * separately from storage.test.ts (that suite exercises the real fake-indexeddb path).
 */

jest.mock('./storageFactory', () => ({
  createStorageAdapter: jest.fn(),
  createUserAdapter: jest.fn(),
}));

jest.mock('./logger', () => {
  const fns = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return {
    __esModule: true,
    default: fns,
    createLogger: jest.fn(() => fns),
  };
});

jest.mock('@sentry/nextjs', () => ({
  setContext: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

import { getStorageAdapter, clearAdapterCache, getStorageItem, setStorageItem, removeStorageItem, clearStorage } from './storage';
import { createStorageAdapter } from './storageFactory';
import type { StorageAdapter } from './storageAdapter';

const mockCreate = createStorageAdapter as jest.Mock;

// Minimal stand-in adapter — getStorageAdapter only returns it, doesn't call into it.
const fakeAdapter = { getItem: jest.fn(), setItem: jest.fn() } as unknown as StorageAdapter;

describe('getStorageAdapter retry lockout recovery (CR-H8)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    clearAdapterCache(); // reset module-global retry state between tests
    mockCreate.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears the lockout after the cooldown so the adapter can recover without a reload', async () => {
    mockCreate.mockRejectedValue(new Error('IndexedDB unavailable'));

    // Failure 1 (no prior failure → allowed immediately).
    await expect(getStorageAdapter()).rejects.toThrow();
    // Failure 2 — advance past the backoff for retryCount=1 (2s).
    jest.advanceTimersByTime(2000);
    await expect(getStorageAdapter()).rejects.toThrow();
    // Failure 3 — advance past the backoff for retryCount=2 (4s). Now at MAX.
    jest.advanceTimersByTime(4000);
    await expect(getStorageAdapter()).rejects.toThrow();

    const callsAfterLockout = mockCreate.mock.calls.length;

    // Locked out: the next call is rejected WITHOUT attempting creation.
    await expect(getStorageAdapter()).rejects.toThrow(/temporarily unavailable/i);
    expect(mockCreate.mock.calls.length).toBe(callsAfterLockout);

    // After the 30s cooldown, the lockout clears and a fresh attempt is made.
    jest.advanceTimersByTime(30000);
    mockCreate.mockResolvedValueOnce(fakeAdapter);

    const adapter = await getStorageAdapter();
    expect(adapter).toBe(fakeAdapter);
    expect(mockCreate.mock.calls.length).toBe(callsAfterLockout + 1);
  });
});

/**
 * Review 10.6: the item operations returned the adapter's promise without awaiting
 * it, so a rejection skipped the retry loop - the first transient IndexedDB failure
 * was final and the user-friendly error mapping never ran.
 * @critical
 */
describe('storage item operations retry a transient failure', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearAdapterCache();
    mockCreate.mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const flakyAdapter = () => {
    const transient = () => Promise.reject(new Error('Transaction aborted'));
    return {
      getItem: jest.fn().mockImplementationOnce(transient).mockResolvedValue('value'),
      setItem: jest.fn().mockImplementationOnce(transient).mockResolvedValue(undefined),
      removeItem: jest.fn().mockImplementationOnce(transient).mockResolvedValue(undefined),
      clear: jest.fn().mockImplementationOnce(transient).mockResolvedValue(undefined),
    } as unknown as StorageAdapter & Record<'getItem' | 'setItem' | 'removeItem' | 'clear', jest.Mock>;
  };

  it.each([
    ['getStorageItem', (a: ReturnType<typeof flakyAdapter>) => a.getItem, () => getStorageItem('k')],
    ['setStorageItem', (a: ReturnType<typeof flakyAdapter>) => a.setItem, () => setStorageItem('k', 'v')],
    ['removeStorageItem', (a: ReturnType<typeof flakyAdapter>) => a.removeItem, () => removeStorageItem('k')],
    ['clearStorage', (a: ReturnType<typeof flakyAdapter>) => a.clear, () => clearStorage()],
  ] as const)('%s succeeds on the retry', async (_name, op, call) => {
    const adapter = flakyAdapter();
    mockCreate.mockResolvedValue(adapter);
    const pending = call();
    await jest.advanceTimersByTimeAsync(5000);
    await pending; // rejects - and fails the test - if the retry did not happen
    expect(op(adapter)).toHaveBeenCalledTimes(2);
  });

  it('gives up with a user-friendly error after the last attempt', async () => {
    const adapter = { getItem: jest.fn().mockRejectedValue(new Error('QuotaExceededError')) } as unknown as StorageAdapter;
    mockCreate.mockResolvedValue(adapter);
    const pending = getStorageItem('k');
    const settled = pending.catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(20000);
    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect((adapter as unknown as { getItem: jest.Mock }).getItem).toHaveBeenCalledTimes(3);
  });
});
