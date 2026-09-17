/**
 * @jest-environment jsdom
 * @critical - the owner reported this from a real install: the app asked for a
 * backup within minutes of signing in, next to the first-run prompts, about
 * games they had not yet touched.
 */
import { getDataFirstSeenTime, markDataFirstSeen } from '../appSettings';
import { getStorageItem, setStorageItem } from '../storage';

jest.mock('../storage', () => ({
  getStorageItem: jest.fn(),
  setStorageItem: jest.fn(),
}));

const mockGet = getStorageItem as jest.Mock;
const mockSet = setStorageItem as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSet.mockResolvedValue(undefined);
});

describe('data-first-seen, the backup reminder\'s clock', () => {
  it('stamps the moment this device first holds data', async () => {
    mockGet.mockResolvedValue(null);

    await markDataFirstSeen();

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [, value] = mockSet.mock.calls[0];
    expect(Number(value)).toBeGreaterThan(0);
  });

  /**
   * The stamp must be the FIRST time, not the latest - otherwise the grace
   * period renews on every launch and the reminder never appears at all.
   */
  it('does not move once it has been set', async () => {
    mockGet.mockResolvedValue('1700000000000');

    await markDataFirstSeen();

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('reads the stamp back as a number', async () => {
    mockGet.mockResolvedValue('1700000000000');

    await expect(getDataFirstSeenTime()).resolves.toBe(1700000000000);
  });

  it('reads as null when this device has never held data', async () => {
    mockGet.mockResolvedValue(null);

    await expect(getDataFirstSeenTime()).resolves.toBeNull();
  });

  it('treats a corrupted stamp as absent rather than as 1970', async () => {
    mockGet.mockResolvedValue('not-a-number');

    await expect(getDataFirstSeenTime()).resolves.toBeNull();
  });

  /** Storage can be unavailable; a reminder must never break the app. */
  it('survives storage throwing', async () => {
    mockGet.mockRejectedValue(new Error('storage disabled'));

    await expect(getDataFirstSeenTime()).resolves.toBeNull();
    await expect(markDataFirstSeen()).resolves.toBeUndefined();
  });
});
