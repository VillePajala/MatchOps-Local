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

    it('should have CSP violation reporting endpoint', () => {
      expect(configContent).toContain('report-uri /api/csp-report');
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
  });

  describe('Resource Hints', () => {
    it('should have DNS prefetch hints for Sentry', () => {
      expect(configContent).toContain('rel=dns-prefetch');
      expect(configContent).toContain('sentry.io');
    });
  });
});
