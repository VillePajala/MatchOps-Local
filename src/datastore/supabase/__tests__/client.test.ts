/**
 * Tests for Supabase client singleton
 *
 * Tests client initialization, singleton behavior, and error handling.
 * Part of PR #2: Supabase Client & Types
 */

import { SupabaseClient } from '@supabase/supabase-js';

// Mock @supabase/supabase-js
const mockSupabaseClient = {
  auth: {
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(),
  },
  from: jest.fn(),
} as unknown as SupabaseClient;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Store original env
const originalEnv = { ...process.env };

describe('Supabase Client', () => {
  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Clear all mocks
    jest.clearAllMocks();

    // Reset module to clear singleton state
    jest.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getSupabaseClient', () => {
    it('throws error when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      // Re-import after env change
      const { getSupabaseClient } = await import('../client');

      expect(() => getSupabaseClient()).toThrow(
        'Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
      );
    });

    it('throws error when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';

      const { getSupabaseClient } = await import('../client');

      expect(() => getSupabaseClient()).toThrow(
        'Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
      );
    });

    it('throws error when both env vars are missing', async () => {
      const { getSupabaseClient } = await import('../client');

      expect(() => getSupabaseClient()).toThrow(
        'Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
      );
    });

    it('creates client when both env vars are set', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      const { createClient } = await import('@supabase/supabase-js');
      const { getSupabaseClient } = await import('../client');

      const client = getSupabaseClient();

      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key',
        expect.objectContaining({
          auth: expect.objectContaining({
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          }),
          global: expect.objectContaining({
            headers: expect.objectContaining({
              'x-client-info': 'matchops-web',
            }),
            fetch: expect.any(Function),
          }),
          realtime: expect.objectContaining({
            params: expect.objectContaining({
              eventsPerSecond: 2,
            }),
          }),
        })
      );
      expect(client).toBe(mockSupabaseClient);
    });

    it('logs info message on client creation', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      const logger = (await import('@/utils/logger')).default;
      const { getSupabaseClient } = await import('../client');

      getSupabaseClient();

      expect(logger.info).toHaveBeenCalledWith('[Supabase] Client initialized');
    });

    it('returns same instance on subsequent calls (singleton)', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      const { createClient } = await import('@supabase/supabase-js');
      const { getSupabaseClient } = await import('../client');

      const client1 = getSupabaseClient();
      const client2 = getSupabaseClient();
      const client3 = getSupabaseClient();

      expect(client1).toBe(client2);
      expect(client2).toBe(client3);
      // createClient should only be called once
      expect(createClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetSupabaseClient', () => {
    it('allows creating a new client after reset', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      const { createClient } = await import('@supabase/supabase-js');
      const { getSupabaseClient, resetSupabaseClient } = await import('../client');

      // Create first client
      getSupabaseClient();
      expect(createClient).toHaveBeenCalledTimes(1);

      // Reset
      resetSupabaseClient();

      // Create second client
      getSupabaseClient();
      expect(createClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('isSupabaseClientInitialized', () => {
    it('returns false before client creation', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      const { isSupabaseClientInitialized } = await import('../client');

      expect(isSupabaseClientInitialized()).toBe(false);
    });

    it('returns true after client creation', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      const { getSupabaseClient, isSupabaseClientInitialized } = await import('../client');

      getSupabaseClient();

      expect(isSupabaseClientInitialized()).toBe(true);
    });

    it('returns false after reset', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

      const { getSupabaseClient, resetSupabaseClient, isSupabaseClientInitialized } =
        await import('../client');

      getSupabaseClient();
      expect(isSupabaseClientInitialized()).toBe(true);

      resetSupabaseClient();
      expect(isSupabaseClientInitialized()).toBe(false);
    });
  });

  /**
   * Review 1.10: a network-level failure of an auth request is reported, so an offline
   * start doesn't wait out Supabase's 30 s token-renewal retries.
   */
  describe('custom fetch: auth server unreachable signal', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    async function setup(fetchImpl: jest.Mock) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
      global.fetch = fetchImpl as unknown as typeof fetch;
      const { createClient } = await import('@supabase/supabase-js');
      const { getSupabaseClient } = await import('../client');
      const reachability = await import('@/auth/authReachability');
      getSupabaseClient();
      const options = (createClient as jest.Mock).mock.calls[0][2];
      const listener = jest.fn();
      const stop = reachability.onAuthServerUnreachable(listener);
      return { customFetch: options.global.fetch as typeof fetch, listener, stop };
    }

    it('reports a failed token renewal and still rejects with the original error', async () => {
      const failure = new TypeError('Failed to fetch');
      const { customFetch, listener, stop } = await setup(jest.fn().mockRejectedValue(failure));
      await expect(customFetch('https://test.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' })).rejects.toBe(failure);
      expect(listener).toHaveBeenCalledTimes(1);
      stop();
    });

    it('does not report failures of data requests', async () => {
      const { customFetch, listener, stop } = await setup(jest.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      await expect(customFetch('https://test.supabase.co/rest/v1/games', {})).rejects.toThrow('Failed to fetch');
      expect(listener).not.toHaveBeenCalled();
      stop();
    });

    it('does not report a request the caller cancelled itself', async () => {
      const controller = new AbortController();
      controller.abort();
      const { customFetch, listener, stop } = await setup(jest.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
      await expect(customFetch('https://test.supabase.co/auth/v1/user', { signal: controller.signal })).rejects.toThrow('aborted');
      expect(listener).not.toHaveBeenCalled();
      stop();
    });

    it('does not report successful auth requests', async () => {
      const ok = { ok: true, status: 200 } as Response;
      const { customFetch, listener, stop } = await setup(jest.fn().mockResolvedValue(ok));
      await expect(customFetch('https://test.supabase.co/auth/v1/user', {})).resolves.toBe(ok);
      expect(listener).not.toHaveBeenCalled();
      stop();
    });
  });
});
