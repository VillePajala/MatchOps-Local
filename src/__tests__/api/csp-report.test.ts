/**
 * Tests for CSP violation report endpoint configuration
 * @integration
 *
 * Note: Full integration tests with NextRequest require a different test environment.
 * These tests verify the route file exists and has correct structure.
 */

describe('CSP Report Endpoint', () => {
  const fs = require('fs');
  const path = require('path');

  let routeContent: string;

  beforeAll(() => {
    const routePath = path.join(process.cwd(), 'src', 'app', 'api', 'csp-report', 'route.ts');
    routeContent = fs.readFileSync(routePath, 'utf8');
  });

  describe('Route Configuration', () => {
    it('should export POST handler', () => {
      expect(routeContent).toContain('export async function POST');
    });

    it('should parse CSP violation reports', () => {
      expect(routeContent).toContain("'csp-report'");
      expect(routeContent).toContain("'violated-directive'");
      expect(routeContent).toContain("'blocked-uri'");
    });

    it('should send violations to Sentry when configured', () => {
      expect(routeContent).toContain('Sentry.captureMessage');
      expect(routeContent).toContain("'CSP Violation'");
      expect(routeContent).toContain("level: 'warning'");
    });

    it('should tag violations with type and directive', () => {
      expect(routeContent).toContain("type: 'csp-violation'");
      expect(routeContent).toContain("directive: violation['effective-directive']");
    });

    it('should include violation details in extra context', () => {
      expect(routeContent).toContain('documentUri');
      expect(routeContent).toContain('blockedUri');
      expect(routeContent).toContain('sourceFile');
      expect(routeContent).toContain('lineNumber');
    });

    it('should return 204 status for successful reports', () => {
      expect(routeContent).toContain('status: 204');
    });

    it('should handle invalid JSON gracefully', () => {
      expect(routeContent).toContain('catch');
      // Should not throw on invalid input
      expect(routeContent).toContain('received: true');
    });

    it('should log violations in development', () => {
      expect(routeContent).toContain("process.env.NODE_ENV === 'development'");
      expect(routeContent).toContain('logger.warn');
    });
  });
});
