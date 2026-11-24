import { isLabsEnabled, onLabsChange, resetLabsForTests, setLabsEnabled } from '../labs';
import {
  acceptAiConsent,
  getAiProviderKey,
  getAiProviderState,
  resetAiProviderStateForTests,
  setAiProviderKey,
} from '../aiProvider';

/**
 * The device-local labs switch hides the experimental AI (privacy 2026-11).
 */
describe('labs switch', () => {
  beforeEach(() => {
    localStorage.clear();
    resetLabsForTests();
    resetAiProviderStateForTests();
  });

  it('is off by default and remembers being turned on for this device', () => {
    expect(isLabsEnabled()).toBe(false);
    setLabsEnabled(true);
    expect(isLabsEnabled()).toBe(true);
    // A fresh read (next app start) comes from storage.
    resetLabsForTests();
    expect(isLabsEnabled()).toBe(true);
    setLabsEnabled(false);
    resetLabsForTests();
    expect(isLabsEnabled()).toBe(false);
  });

  it('tells listeners when it flips', () => {
    const listener = jest.fn();
    const unsubscribe = onLabsChange(listener);
    setLabsEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setLabsEnabled(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  /**
   * @critical - a device that already had the AI set up keeps the setup, but
   * nothing AI is reachable while labs is off: not connected, no key handed out.
   */
  it('keeps an existing AI setup but makes it unreachable while off', () => {
    setLabsEnabled(true);
    setAiProviderKey('sk-test-abcdefghijkl');
    acceptAiConsent();
    expect(getAiProviderState().connected).toBe(true);
    expect(getAiProviderKey()).toBe('sk-test-abcdefghijkl');

    setLabsEnabled(false);
    expect(getAiProviderState().connected).toBe(false);
    expect(getAiProviderState().hasKey).toBe(true);
    expect(getAiProviderState().hasConsent).toBe(true);
    expect(getAiProviderKey()).toBeNull();

    setLabsEnabled(true);
    expect(getAiProviderState().connected).toBe(true);
    expect(getAiProviderKey()).toBe('sk-test-abcdefghijkl');
  });
});
