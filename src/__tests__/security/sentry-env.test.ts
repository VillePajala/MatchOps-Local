describe('Sentry Environment Variables Security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DSN validation', () => {
    it('should not expose auth tokens in client-side DSN', () => {
      const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
      if (dsn) {
        // DSN format: https://[PUBLIC_KEY]@[organization].ingest.sentry.io/[PROJECT_ID]
        // Ensure no secret keys or auth tokens are in the DSN
        expect(dsn).toMatch(/^https:\/\/[a-f0-9]+@[\w.-]+\.sentry\.io\/\d+$/i);
        expect(dsn).not.toContain('auth_token');
        expect(dsn).not.toContain('secret');
        expect(dsn).not.toContain('private');
      }
    });

    it('should validate DSN format if present', () => {
      const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
      if (dsn) {
        const url = new URL(dsn);
        expect(url.protocol).toBe('https:');
        expect(url.hostname).toContain('sentry.io');
        expect(url.username).toBeTruthy(); // Public key should be present
        expect(url.password).toBe(''); // No password should be in DSN
      }
    });
  });

  describe('Auth token security', () => {
    it('should not expose SENTRY_AUTH_TOKEN as public variable', () => {
      // Auth token should never be prefixed with NEXT_PUBLIC_
      expect(process.env.NEXT_PUBLIC_SENTRY_AUTH_TOKEN).toBeUndefined();

      // Check if auth token exists in non-public variable
      if (process.env.SENTRY_AUTH_TOKEN) {
        expect(process.env.SENTRY_AUTH_TOKEN).not.toContain('NEXT_PUBLIC');
      }
    });

    it('should not include auth tokens in any public environment variables', () => {
      const publicEnvVars = Object.entries(process.env)
        .filter(([key]) => key.startsWith('NEXT_PUBLIC_'));

      publicEnvVars.forEach(([key, value]) => {
        if (value) {
          expect(value.toLowerCase()).not.toContain('auth');
          expect(value.toLowerCase()).not.toContain('token');
          expect(value.toLowerCase()).not.toContain('secret');
          expect(value.toLowerCase()).not.toContain('key');
          // Exception for 'public key' in DSN which is safe
          if (!key.includes('DSN')) {
            expect(value.toLowerCase()).not.toContain('private');
          }
        }
      });
    });
  });

  describe('Required variables in production', () => {
    it('should have required Sentry variables when in production', () => {
      if (process.env.NODE_ENV === 'production') {
        // DSN is required for error reporting in production
        expect(process.env.NEXT_PUBLIC_SENTRY_DSN).toBeDefined();
        expect(process.env.NEXT_PUBLIC_SENTRY_DSN).not.toBe('');

        // Organization and project should be configured
        expect(process.env.SENTRY_ORG).toBeDefined();
        expect(process.env.SENTRY_PROJECT).toBeDefined();
      }
    });

    it('should validate environment variable values', () => {
      // Check SENTRY_ENVIRONMENT is valid
      const validEnvironments = ['production', 'staging', 'development', 'test'];
      const sentryEnv = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;

      if (sentryEnv) {
        expect(validEnvironments).toContain(sentryEnv);
      }

      // Check force enable is boolean string
      const forceEnable = process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE;
      if (forceEnable) {
        expect(['true', 'false']).toContain(forceEnable);
      }
    });
  });

  describe('Build-time validation', () => {
    it('should validate Sentry configuration completeness', () => {
      const hasSDK = process.env.NEXT_PUBLIC_SENTRY_DSN;
      const hasOrg = process.env.SENTRY_ORG;
      const hasProject = process.env.SENTRY_PROJECT;

      // If any Sentry config is present, ensure it's complete
      if (hasSDK || hasOrg || hasProject) {
        if (process.env.NODE_ENV === 'production') {
          expect(hasSDK).toBeTruthy();
          expect(hasOrg).toBeTruthy();
          expect(hasProject).toBeTruthy();
        }
      }
    });
  });
});