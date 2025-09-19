/**
 * Tests for Analytics environment gating
 * These tests verify that analytics is only loaded when appropriate
 */

describe('Analytics Environment Gating', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Configuration', () => {
    it('should have valid analytics enabled flag format when configured', () => {
      const analyticsEnabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED;

      if (analyticsEnabled) {
        expect(['true', 'false']).toContain(analyticsEnabled);
      }
    });

    it('should not expose sensitive analytics data in public variables', () => {
      // Check all public environment variables
      Object.entries(process.env)
        .filter(([key]) => key.startsWith('NEXT_PUBLIC_'))
        .forEach(([key, value]) => {
          if (value && key.includes('ANALYTICS')) {
            // Analytics variables should not contain sensitive tokens
            expect(value.toLowerCase()).not.toContain('secret');
            expect(value.toLowerCase()).not.toContain('private');
            expect(value.toLowerCase()).not.toContain('token');
            expect(value.toLowerCase()).not.toContain('password');
          }
        });
    });

    it('should have proper default analytics configuration', () => {
      // Analytics should be disabled by default in non-production
      if (process.env.NODE_ENV !== 'production') {
        const analyticsEnabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED;
        if (analyticsEnabled !== undefined) {
          expect(analyticsEnabled).toBe('false');
        }
      }
    });
  });

  describe('Analytics Gating Logic', () => {
    it('should define proper analytics conditions', async () => {
      // Verify our configuration documents the gating logic
      const fs = await import('fs');
      const path = await import('path');

      const layoutFile = fs.readFileSync(
        path.join(process.cwd(), 'src/app/layout.tsx'),
        'utf8'
      );

      // Should contain environment checks
      expect(layoutFile).toContain('NODE_ENV === \'production\'');
      expect(layoutFile).toContain('NEXT_PUBLIC_ANALYTICS_ENABLED');
      expect(layoutFile).toContain('<Analytics />');
    });

    it('should have analytics dependency available', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const packageJson = JSON.parse(fs.readFileSync(
        path.join(process.cwd(), 'package.json'),
        'utf8'
      ));

      expect(packageJson.dependencies).toHaveProperty('@vercel/analytics');
    });
  });

  describe('Configuration Completeness', () => {
    it('should have analytics settings documented in env example', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const envExample = fs.readFileSync(
        path.join(process.cwd(), '.env.example'),
        'utf8'
      );

      expect(envExample).toContain('ANALYTICS');
      expect(envExample).toContain('NEXT_PUBLIC_ANALYTICS_ENABLED');
    });
  });
});