/**
 * Tests for Content Security Policy and security headers configuration
 * @critical - Security headers protect against XSS and other attacks
 */

// Import the security headers configuration directly from next.config
// We test the configuration values, not the actual HTTP response
// (HTTP response testing would require running the server)

describe('Security Headers Configuration', () => {
  // Read the next.config.ts to extract header values
  // This is a static analysis test - validates the config is correct

  const fs = require('fs');
  const path = require('path');

  let configContent: string;

  beforeAll(() => {
    const configPath = path.join(process.cwd(), 'next.config.ts');
    configContent = fs.readFileSync(configPath, 'utf8');
  });

  describe('Content Security Policy', () => {
    it('should have default-src self', () => {
      expect(configContent).toContain("default-src 'self'");
    });

    it('should have script-src with required Next.js directives', () => {
      expect(configContent).toContain("script-src 'self'");
    });

    it('should have style-src for CSS', () => {
      expect(configContent).toContain("style-src 'self'");
    });

    it('should block object embeds (Flash, Java)', () => {
      expect(configContent).toContain("object-src 'none'");
    });

    it('should prevent framing (clickjacking protection)', () => {
      expect(configContent).toContain("frame-ancestors 'none'");
    });

    it('should restrict form submissions', () => {
      expect(configContent).toContain("form-action 'self'");
    });

    it('should restrict base URI', () => {
      expect(configContent).toContain("base-uri 'self'");
    });

    it('should upgrade insecure requests', () => {
      expect(configContent).toContain('upgrade-insecure-requests');
    });

    it('should allow Sentry connections for error reporting', () => {
      expect(configContent).toContain('https://*.sentry.io');
      expect(configContent).toContain('https://*.ingest.sentry.io');
    });

    it('should allow Play Store API for license validation', () => {
      expect(configContent).toContain('https://play.googleapis.com');
    });

    it('should allow service workers', () => {
      expect(configContent).toContain("worker-src 'self'");
    });

    it('should have CSP violation reporting with both modern and legacy directives', () => {
      // Modern browsers (Chrome 70+, Firefox 65+)
      expect(configContent).toContain('report-to csp-endpoint');
      // Legacy browsers fallback (Safari, older browsers)
      expect(configContent).toContain('report-uri /api/csp-report');
    });

    it('should have Report-To header defining the CSP endpoint', () => {
      expect(configContent).toContain("key: 'Report-To'");
      expect(configContent).toContain('csp-endpoint');
      expect(configContent).toContain('/api/csp-report');
    });
  });

  describe('Additional Security Headers', () => {
    it('should have X-Frame-Options DENY', () => {
      expect(configContent).toContain("key: 'X-Frame-Options'");
      expect(configContent).toContain("value: 'DENY'");
    });

    it('should have X-Content-Type-Options nosniff', () => {
      expect(configContent).toContain("key: 'X-Content-Type-Options'");
      expect(configContent).toContain("value: 'nosniff'");
    });

    it('should have Referrer-Policy', () => {
      expect(configContent).toContain("key: 'Referrer-Policy'");
      expect(configContent).toContain('strict-origin-when-cross-origin');
    });

    it('should have DNS prefetch control enabled', () => {
      expect(configContent).toContain("key: 'X-DNS-Prefetch-Control'");
      expect(configContent).toContain("value: 'on'");
    });

    it('should have Permissions-Policy disabling unused features', () => {
      expect(configContent).toContain("key: 'Permissions-Policy'");
      expect(configContent).toContain('camera=()');
      expect(configContent).toContain('microphone=()');
      expect(configContent).toContain('geolocation=()');
    });

    it('should have Cross-Origin-Opener-Policy same-origin', () => {
      expect(configContent).toContain("key: 'Cross-Origin-Opener-Policy'");
      expect(configContent).toContain("value: 'same-origin'");
    });

    it('should have Cross-Origin-Resource-Policy same-origin', () => {
      expect(configContent).toContain("key: 'Cross-Origin-Resource-Policy'");
      expect(configContent).toContain("value: 'same-origin'");
    });
  });

  describe('Cache Control Headers', () => {
    it('should disable caching for sw.js', () => {
      expect(configContent).toContain("source: '/sw.js'");
      expect(configContent).toContain('no-store');
    });

    it('should disable caching for manifest.json', () => {
      expect(configContent).toContain("source: '/manifest.json'");
    });

    it('should disable caching for release-notes.json', () => {
      expect(configContent).toContain("source: '/release-notes.json'");
    });
  });

  describe('Asset Links Configuration', () => {
    it('should have headers for assetlinks.json', () => {
      expect(configContent).toContain("source: '/.well-known/assetlinks.json'");
    });

    it('should set correct Content-Type for assetlinks.json', () => {
      expect(configContent).toContain("value: 'application/json'");
    });

    it('should allow CORS for Google verification', () => {
      expect(configContent).toContain("key: 'Access-Control-Allow-Origin'");
    });

    it('should have stale-while-revalidate cache policy for assetlinks.json', () => {
      expect(configContent).toContain('stale-while-revalidate');
    });
  });

  describe('Resource Hints', () => {
    it('should have preconnect hints for Sentry', () => {
      expect(configContent).toContain('rel=preconnect');
      expect(configContent).toContain('sentry.io');
    });
  });
});

describe('Asset Links File Structure', () => {
  const fs = require('fs');
  const path = require('path');

  interface AssetLink {
    relation: string[];
    target: {
      namespace: string;
      package_name: string;
      sha256_cert_fingerprints: string[];
    };
  }

  let assetLinksContent: AssetLink[];

  beforeAll(() => {
    const assetLinksPath = path.join(process.cwd(), 'public', '.well-known', 'assetlinks.json');
    assetLinksContent = JSON.parse(fs.readFileSync(assetLinksPath, 'utf8'));
  });

  it('should be valid JSON array', () => {
    expect(Array.isArray(assetLinksContent)).toBe(true);
    expect(assetLinksContent.length).toBeGreaterThan(0);
  });

  it('should have correct relation for TWA', () => {
    const entry = assetLinksContent[0];
    expect(entry.relation).toContain('delegate_permission/common.handle_all_urls');
  });

  it('should target android_app namespace', () => {
    const entry = assetLinksContent[0];
    expect(entry.target.namespace).toBe('android_app');
  });

  it('should have package name com.matchops.local', () => {
    const entry = assetLinksContent[0];
    expect(entry.target.package_name).toBe('com.matchops.local');
  });

  it('should have sha256_cert_fingerprints array', () => {
    const entry = assetLinksContent[0];
    expect(Array.isArray(entry.target.sha256_cert_fingerprints)).toBe(true);
    expect(entry.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
  });

  it('should not have placeholder fingerprint on protected branches in CI', () => {
    const isCI = process.env.CI === 'true';
    const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || '';
    const isProtectedBranch = ['master', 'main'].includes(branch);

    if (!isCI || !isProtectedBranch) {
      // Skip validation outside CI or on non-protected branches
      return;
    }

    const entry = assetLinksContent[0];
    const fingerprint = entry.target.sha256_cert_fingerprints[0];
    const hasPlaceholder =
      fingerprint.includes('PLACEHOLDER') ||
      fingerprint.includes('REPLACE') ||
      fingerprint.startsWith('__');

    expect(hasPlaceholder).toBe(false);
  });
});
