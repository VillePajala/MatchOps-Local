/**
 * Tests for Sentry configuration validation
 * These tests verify that our Sentry setup follows best practices
 */

describe('Sentry Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Configuration', () => {
    it('should have valid DSN format when configured', () => {
      const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
      if (dsn) {
        // Validate DSN format
        expect(dsn).toMatch(/^https:\/\/[a-f0-9]+@[\w.-]+\.sentry\.io\/\d+$/i);

        // Parse and validate DSN structure
        const url = new URL(dsn);
        expect(url.protocol).toBe('https:');
        expect(url.hostname).toContain('sentry.io');
        expect(url.username).toBeTruthy(); // Public key present
        expect(url.password).toBe(''); // No password in DSN
      }
    });

    it('should have proper environment settings', () => {
      const sentryEnv = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
      const forceEnable = process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE;

      if (sentryEnv) {
        const validEnvironments = ['production', 'staging', 'development', 'test'];
        expect(validEnvironments).toContain(sentryEnv);
      }

      if (forceEnable) {
        expect(['true', 'false']).toContain(forceEnable);
      }
    });

    it('should have organization and project configured with DSN', () => {
      const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
      const org = process.env.SENTRY_ORG;
      const project = process.env.SENTRY_PROJECT;

      // If DSN is configured, org and project should also be configured
      if (dsn) {
        expect(org).toBeTruthy();
        expect(project).toBeTruthy();
      }
    });

    it('should not expose sensitive tokens in public variables', () => {
      // Check all public environment variables
      Object.entries(process.env)
        .filter(([key]) => key.startsWith('NEXT_PUBLIC_'))
        .forEach(([key, value]) => {
          if (value && !key.includes('DSN')) {
            // DSN is allowed to have a public key
            expect(value.toLowerCase()).not.toContain('secret');
            expect(value.toLowerCase()).not.toContain('private');
            expect(value.toLowerCase()).not.toContain('token');
            expect(value.toLowerCase()).not.toContain('password');
          }
        });

      // Auth token should never be public
      expect(process.env.NEXT_PUBLIC_SENTRY_AUTH_TOKEN).toBeUndefined();
    });
  });

  describe('File Structure', () => {
    it('should have required Sentry configuration files', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const requiredFiles = [
        'src/instrumentation.ts',
        'src/instrumentation-client.ts',
        'sentry.server.config.ts',
        'sentry.edge.config.ts',
        'src/app/global-error.tsx',
      ];

      requiredFiles.forEach(file => {
        const filePath = path.join(process.cwd(), file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });
  });

  describe('Error Filtering Logic', () => {
    it('should define proper error filters', async () => {
      // These are the error types we expect to filter
      const filteredErrors = [
        'ResizeObserver',
        'NetworkError',
      ];

      // Verify our configuration documents these filters
      const fs = await import('fs');
      const path = await import('path');
      const clientConfig = fs.readFileSync(
        path.join(process.cwd(), 'src/instrumentation-client.ts'),
        'utf8'
      );

      filteredErrors.forEach(error => {
        expect(clientConfig).toContain(error);
      });
    });
  });
});