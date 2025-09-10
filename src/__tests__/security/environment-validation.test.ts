import { jest } from '@jest/globals';
import { EnvironmentMocker, SecurityTester } from '../utils/test-helpers';

describe('Security Environment Validation', () => {
  let envMocker: EnvironmentMocker;

  beforeEach(() => {
    envMocker = new EnvironmentMocker();
    
    // Clear any existing module cache
    jest.resetModules();
  });

  afterEach(() => {
    envMocker.restore();
  });

  describe('Secret Exposure Prevention', () => {
    it('should detect exposed OpenAI API keys', async () => {
      envMocker.setEnv('NEXT_PUBLIC_OPENAI_KEY', 'sk-abc123def456ghi789jklmnop');
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Potential OpenAI API Key exposed in client-side environment variable')
      );
    });

    it('should detect exposed AWS access keys', async () => {
      envMocker.setEnv('NEXT_PUBLIC_AWS_ACCESS_KEY', 'AKIAIOSFODNN7EXAMPLE');
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Potential AWS Access Key exposed in client-side environment variable')
      );
    });

    it('should detect exposed GitHub tokens', async () => {
      envMocker.setEnv('NEXT_PUBLIC_GITHUB_TOKEN', 'ghp_abcdefghijklmnopqrstuvwxyz123456789012');
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Potential GitHub Token exposed in client-side environment variable')
      );
    });

    it('should detect server-side secrets incorrectly exposed', async () => {
      envMocker.setEnv('NEXT_PUBLIC_SENTRY_AUTH_TOKEN', 'secret_auth_token_123');
      envMocker.setProductionEnv();
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Server secret SENTRY_AUTH_TOKEN incorrectly configured')
      );
    });

    it('should warn about suspiciously long client-exposed values', async () => {
      envMocker.setEnv('NEXT_PUBLIC_LONG_VALUE', 'a'.repeat(100)); // 100 character string
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.warnings).toContain(
        expect.stringContaining('Suspiciously long value in client-exposed variable')
      );
    });

    it('should allow legitimate public values', async () => {
      envMocker.setEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://abc123@sentry.io/123456');
      envMocker.setEnv('NEXT_PUBLIC_APP_URL', 'https://matchops.example.com');
      envMocker.setEnv('NEXT_PUBLIC_FEATURE_FLAG', 'true');
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('Production Environment Validation', () => {
    it('should require Sentry DSN in production', async () => {
      envMocker.setProductionEnv();
      envMocker.setSentryEnv(); // No DSN provided
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Production deployment missing Sentry configuration')
      );
    });

    it('should validate Sentry DSN format in production', async () => {
      envMocker.setProductionEnv();
      envMocker.setSentryEnv('invalid-dsn-format');
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Invalid Sentry DSN format detected')
      );
    });

    it('should accept valid Sentry DSN in production', async () => {
      envMocker.setProductionEnv();
      envMocker.setSentryEnv('https://abcd1234@sentry.io/5678910');
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(true);
    });
  });

  describe('Development Environment Safety', () => {
    it('should allow missing Sentry in development', async () => {
      envMocker.setDevelopmentEnv();
      envMocker.setSentryEnv(); // No Sentry configured
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(true);
    });

    it('should still detect secrets in development', async () => {
      envMocker.setDevelopmentEnv();
      envMocker.setEnv('NEXT_PUBLIC_SECRET_KEY', 'sk-verysecretkey123456789');
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('exposed in client-side environment variable')
      );
    });
  });

  describe('SecurityTester Utility', () => {
    it('should detect various secret patterns in content', () => {
      const content = `
        const openaiKey = 'sk-abc123def456ghi789jklmnopqrstuv';
        const awsKey = 'AKIAIOSFODNN7EXAMPLE';
        const githubToken = 'ghp_abcdefghijklmnopqrstuvwxyz123456789012';
      `;
      
      const findings = SecurityTester.scanForSecrets(content);
      
      expect(findings).toHaveLength(3);
      expect(findings[0].type).toBe('OpenAI API Key');
      expect(findings[1].type).toBe('AWS Access Key');
      expect(findings[2].type).toBe('GitHub Token');
    });

    it('should validate environment variables for security issues', () => {
      const issues = SecurityTester.validateEnvironmentVariable(
        'NEXT_PUBLIC_API_KEY',
        'sk-secretkey123456789'
      );
      
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('error');
      expect(issues[0].message).toContain('OpenAI API Key exposed in client-side variable');
    });

    it('should warn about long client-exposed values', () => {
      const issues = SecurityTester.validateEnvironmentVariable(
        'NEXT_PUBLIC_LONG_CONFIG',
        'x'.repeat(100)
      );
      
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].message).toContain('Suspiciously long value');
    });

    it('should not flag legitimate URLs or DSNs', () => {
      const urlIssues = SecurityTester.validateEnvironmentVariable(
        'NEXT_PUBLIC_API_URL',
        'https://api.example.com/v1/endpoint?key=public_key_123'
      );
      
      const dsnIssues = SecurityTester.validateEnvironmentVariable(
        'NEXT_PUBLIC_SENTRY_DSN',
        'https://abc123@sentry.io/456789'
      );
      
      expect(urlIssues).toHaveLength(0);
      expect(dsnIssues).toHaveLength(0);
    });
  });

  describe('Environment Context Detection', () => {
    it('should detect browser environment correctly', async () => {
      // Mock browser globals
      (globalThis as any).window = {};
      (globalThis as any).document = {};
      
      const { environmentDetection } = await import('@/config/environment');
      
      expect(environmentDetection.isBrowserEnvironment()).toBe(true);
      expect(environmentDetection.isServerEnvironment()).toBe(false);
      
      // Cleanup
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;
    });

    it('should detect Node environment correctly', async () => {
      const { environmentDetection } = await import('@/config/environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(true);
      expect(environmentDetection.isBrowserEnvironment()).toBe(false);
    });

    it('should handle missing environment gracefully', async () => {
      // Temporarily remove process
      const originalProcess = global.process;
      (globalThis as any).process = undefined;
      
      const { environmentDetection } = await import('@/config/environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
      expect(environmentDetection.isServerEnvironment()).toBe(false);
      
      // Restore process
      global.process = originalProcess;
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle typical production deployment configuration', async () => {
      envMocker.setProductionEnv();
      envMocker.setSentryEnv(
        'https://abcd1234efgh5678@sentry.io/1234567',
        'secret_auth_token_for_builds'
      );
      envMocker.setEnv('NEXT_PUBLIC_APP_URL', 'https://matchops.com');
      envMocker.setEnv('NEXT_PUBLIC_ANALYTICS_ID', 'GA-123456789');
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should catch common deployment mistakes', async () => {
      envMocker.setProductionEnv();
      
      // Simulate common mistakes
      envMocker.setEnv('NEXT_PUBLIC_DATABASE_URL', 'mongodb://user:password@localhost:27017/db');
      envMocker.setEnv('NEXT_PUBLIC_JWT_SECRET', 'super_secret_jwt_key_123456789');
      envMocker.setEnv('NEXT_PUBLIC_STRIPE_SECRET', 'sk_live_abcdefghijklmnopqrstuv');
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should handle CI/CD environment correctly', async () => {
      envMocker.setEnv('CI', 'true');
      envMocker.setEnv('NODE_ENV', 'production');
      envMocker.setSentryEnv(
        'https://ci-build@sentry.io/ci-project',
        'ci_auth_token'
      );
      
      const { validateEnvironment } = await import('@/config/environment');
      const result = validateEnvironment();
      
      expect(result.valid).toBe(true);
    });
  });
});