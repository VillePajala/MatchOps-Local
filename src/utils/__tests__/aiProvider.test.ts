/**
 * Kirjuri BYOK provider state.
 * @critical - the key must stay on the device, consent must be versioned,
 * and the key must never appear anywhere but the Authorization header.
 */
import fs from 'fs';
import path from 'path';
import { renderHook, act } from '@testing-library/react';
import {
  AI_CONSENT_VERSION,
  acceptAiConsent,
  clearAiProviderKey,
  forgetAiAccount,
  setAiAccount,
  getAiProviderKey,
  getAiProviderState,
  resetAiProviderStateForTests,
  revokeAiConsent,
  setAiProviderKey,
  setPseudonymizeNames,
  testAiProviderKey,
  useAiProviderState,
} from '../aiProvider';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

beforeEach(() => {
  localStorage.clear();
  resetAiProviderStateForTests();
});

/**
 * Review 3.15: the key, consent and model belong to the signed-in ACCOUNT. Stored per
 * device, coach B used coach A's key (billed to A) and never saw the consent gate.
 * @critical
 */
describe('per-account AI setup', () => {
  it("another account on this device does not see or use the first account's key or consent", () => {
    setAiAccount('coach-a');
    setAiProviderKey('sk-coach-a-1234');
    acceptAiConsent();
    expect(getAiProviderState().connected).toBe(true);

    setAiAccount(null); // A signs out
    setAiAccount('coach-b');
    expect(getAiProviderKey()).toBeNull();
    expect(getAiProviderState()).toMatchObject({ hasKey: false, hasConsent: false, connected: false });
  });

  it("an account signing back in gets its own setup back", () => {
    setAiAccount('coach-a');
    setAiProviderKey('sk-coach-a-1234');
    acceptAiConsent();
    setAiAccount(null);
    setAiAccount('coach-a');
    expect(getAiProviderKey()).toBe('sk-coach-a-1234');
    expect(getAiProviderState().connected).toBe(true);
  });

  // A setup stored device-wide by the version before this change.
  const preUpdateSetup = () => {
    localStorage.setItem('matchops_ai_key', 'sk-device-wide-9999');
    localStorage.setItem('matchops_ai_consent', AI_CONSENT_VERSION);
  };

  it('a pre-update device-wide setup goes to the account whose session is restored, once', () => {
    preUpdateSetup();
    setAiAccount('coach-a', { restored: true });
    expect(getAiProviderKey()).toBe('sk-device-wide-9999');
    expect(localStorage.getItem('matchops_ai_key')).toBeNull(); // no longer device-wide

    setAiAccount(null);
    setAiAccount('coach-b', { restored: true });
    expect(getAiProviderKey()).toBeNull();
  });

  it('a coach signing in interactively never takes the pre-update device-wide setup', () => {
    preUpdateSetup();
    setAiAccount(null); // app start, nobody signed in
    setAiAccount('coach-b'); // B signs in on A's device
    expect(getAiProviderKey()).toBeNull();
    expect(getAiProviderState().hasConsent).toBe(false);
  });

  it('a local-mode setup made after the update is never handed to an account', () => {
    setAiAccount(null); // updated app, no account (local mode)
    setAiProviderKey('sk-local-mode-5555');
    acceptAiConsent();
    setAiAccount('coach-b', { restored: true });
    expect(getAiProviderKey()).toBeNull();
    setAiAccount(null);
    expect(getAiProviderKey()).toBe('sk-local-mode-5555'); // still local mode's own
  });

  it("account deletion removes that account's key and consent", () => {
    setAiAccount('coach-a');
    setAiProviderKey('sk-coach-a-1234');
    acceptAiConsent();
    forgetAiAccount('coach-a');
    expect(getAiProviderState()).toMatchObject({ hasKey: false, hasConsent: false });
    expect(Object.keys(localStorage).filter((k) => k.includes('coach-a'))).toEqual([]);
  });
});

describe('aiProvider state', () => {
  it('starts disconnected with pseudonymization on', () => {
    expect(getAiProviderState()).toMatchObject({ hasKey: false, hasConsent: false, connected: false, pseudonymize: true });
  });

  it('is connected only with BOTH current consent and a key', () => {
    setAiProviderKey('sk-proj-abcdefghijklmnop1234');
    expect(getAiProviderState().connected).toBe(false);
    acceptAiConsent();
    expect(getAiProviderState()).toMatchObject({ connected: true, keyHint: '1234', consentVersion: AI_CONSENT_VERSION });
    expect(getAiProviderKey()).toBe('sk-proj-abcdefghijklmnop1234');
  });

  it('falls back to openai for an unknown stored provider id instead of crashing', () => {
    localStorage.setItem('matchops_ai_provider', 'gone-provider');
    expect(getAiProviderState().provider).toBe('openai');
  });

  it('an older consent version does not count', () => {
    localStorage.setItem('matchops_ai_consent', '2020-01');
    setAiProviderKey('sk-abcdefghijklmnop');
    expect(getAiProviderState().hasConsent).toBe(false);
    expect(getAiProviderState().connected).toBe(false);
  });

  it('disconnect removes the key; revoke removes key and consent', () => {
    acceptAiConsent();
    setAiProviderKey('sk-abcdefghijklmnop');
    clearAiProviderKey();
    expect(getAiProviderState()).toMatchObject({ hasKey: false, hasConsent: true });
    setAiProviderKey('sk-abcdefghijklmnop');
    revokeAiConsent();
    expect(localStorage.getItem('matchops_ai_key')).toBeNull();
    expect(localStorage.getItem('matchops_ai_consent')).toBeNull();
  });

  it('exposes changes to subscribers', () => {
    const { result } = renderHook(() => useAiProviderState());
    expect(result.current.pseudonymize).toBe(true);
    act(() => setPseudonymizeNames(false));
    expect(result.current.pseudonymize).toBe(false);
  });

  /** @critical - the backup allowlist must not know the key's storage name. */
  it('the key store is unknown to the full backup', () => {
    const backupSource = fs.readFileSync(path.join(process.cwd(), 'src/utils/fullBackup.ts'), 'utf8');
    const keysSource = fs.readFileSync(path.join(process.cwd(), 'src/config/storageKeys.ts'), 'utf8');
    expect(backupSource).not.toContain('matchops_ai_key');
    expect(keysSource).not.toContain('matchops_ai_key');
  });
});

describe('testAiProviderKey', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends the key only as a bearer header and reports ok', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    expect(await testAiProviderKey('  sk-abcdefghijklmnop  ')).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/models?limit=1');
    expect(url).not.toContain('sk-');
    expect(init.headers.Authorization).toBe('Bearer sk-abcdefghijklmnop');
  });

  it('maps 401/403 to unauthorized and failures to network', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await testAiProviderKey('sk-abcdefghijklmnop')).toBe('unauthorized');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    expect(await testAiProviderKey('sk-abcdefghijklmnop')).toBe('rateLimited');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await testAiProviderKey('sk-abcdefghijklmnop')).toBe('network');
    expect(await testAiProviderKey('   ')).toBe('unauthorized');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
