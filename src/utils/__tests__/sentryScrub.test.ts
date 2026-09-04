import {
  isAiProviderUrl,
  scrubSecretsDeep,
  scrubSecretsInString,
  scrubUrl,
} from '../sentryScrub';

describe('sentryScrub', () => {
  describe('scrubUrl', () => {
    it('redacts auth query params and token hashes', () => {
      expect(scrubUrl('https://x.test/auth/callback?access_token=abc&code=1&keep=2')).toBe(
        'https://x.test/auth/callback?access_token=%5BREDACTED%5D&code=%5BREDACTED%5D&keep=2',
      );
      expect(scrubUrl('https://x.test/#access_token=abc')).toBe('https://x.test/#[REDACTED]');
    });

    /** @critical - Kirjuri: an API key in a query string must never survive. */
    it('redacts api_key and key params', () => {
      expect(scrubUrl('https://api.openai.com/v1/x?api_key=sk-secret&key=k')).toBe(
        'https://api.openai.com/v1/x?api_key=%5BREDACTED%5D&key=%5BREDACTED%5D',
      );
    });

    it('keeps same-origin paths as paths', () => {
      expect(scrubUrl('/api/csp-report?token=abc')).toBe('/api/csp-report?token=%5BREDACTED%5D');
    });
  });

  describe('scrubSecretsInString', () => {
    /** @critical - the shape of an OpenAI key and of a bearer header. */
    it('redacts sk- keys and bearer tokens, leaves ordinary text alone', () => {
      expect(scrubSecretsInString('failed with key sk-proj-abcdefghijklmnop123')).toBe(
        'failed with key [REDACTED]',
      );
      expect(scrubSecretsInString('Authorization: Bearer abcdefghijklmnopqrstuvwxyz')).toBe(
        'Authorization: [REDACTED]',
      );
      expect(scrubSecretsInString('skate sk-short')).toBe('skate sk-short');
    });
  });

  describe('scrubSecretsDeep', () => {
    /** @critical - logger.error(extra) is the real leak vector. */
    it('scrubs nested objects and arrays, preserving structure', () => {
      const extra = {
        message: 'AI failed',
        data: { headers: { Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz' }, keys: ['sk-abcdefghijklmnop'] },
        count: 3,
      };
      expect(scrubSecretsDeep(extra)).toEqual({
        message: 'AI failed',
        data: { headers: { Authorization: '[REDACTED]' }, keys: ['[REDACTED]'] },
        count: 3,
      });
    });

    it('does not recurse forever on very deep values', () => {
      let deep: Record<string, unknown> = { key: 'sk-abcdefghijklmnop' };
      for (let i = 0; i < 10; i++) deep = { child: deep };
      expect(() => scrubSecretsDeep(deep)).not.toThrow();
    });
  });

  it('recognises AI provider hosts', () => {
    expect(isAiProviderUrl('https://api.openai.com/v1/audio/transcriptions')).toBe(true);
    expect(isAiProviderUrl('https://x.supabase.co/rest/v1/games')).toBe(false);
  });
});
