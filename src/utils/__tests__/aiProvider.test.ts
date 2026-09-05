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
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await testAiProviderKey('sk-abcdefghijklmnop')).toBe('network');
    expect(await testAiProviderKey('   ')).toBe('unauthorized');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
