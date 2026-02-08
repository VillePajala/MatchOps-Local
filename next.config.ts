import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

/**
 * Environment variable validation
 * Runs at build time to catch misconfigurations early
 */
function validateEnvironment(): void {
  // Block NEXT_PUBLIC_INTERNAL_TESTING in production deployments
  // Internal testing mode should only be used on Play Store internal testing track,
  // never on public production releases
  const isInternalTesting = process.env.NEXT_PUBLIC_INTERNAL_TESTING === 'true';
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  const vercelEnv = process.env.VERCEL_ENV;
  const isProductionBranch = branch === 'master' || branch === 'main';
  const isVercelProduction = vercelEnv === 'production';

  if (isInternalTesting && (isProductionBranch || isVercelProduction)) {
    throw new Error(
      'NEXT_PUBLIC_INTERNAL_TESTING must not be enabled in production.\n' +
      'This flag is for Play Store internal testing track only.\n' +
      `Current: VERCEL_ENV=${vercelEnv}, branch=${branch}`
    );
  }
}

// Run validation at config load time
validateEnvironment();

/**
 * Security headers for production deployment
 * CSP is configured for a local-first PWA with:
 * - Self-hosted scripts/styles
 * - Sentry for error reporting
 * - Play Store API for license validation (future)
 *
 * SECURITY NOTE: 'unsafe-inline' and 'unsafe-eval' in script-src
 * ----------------------------------------------------------------
 * These directives weaken CSP but are currently necessary because:
 * 1. Next.js injects inline scripts for hydration and routing
 * 2. Nonce-based CSP requires dynamic rendering (server-side on each request)
 * 3. For a local-first PWA, static/client rendering is critical for:
 *    - Offline-first capability (static assets cached by service worker)
 *    - Fast initial loads without server roundtrip
 *    - Lower hosting costs (no SSR compute needed)
 *
 * Alternative Approaches Evaluated:
 *
 * 1. Hash-Based CSP: NOT FEASIBLE
 *    Next.js generates dynamic inline scripts (RSC payloads, chunk hashes)
 *    that change every build. Pre-computing hashes would require post-build
 *    processing and regeneration on every build.
 *
 * 2. Nonce-Based CSP with Middleware: NOT SUITABLE FOR THIS APP
 *    Requires dynamic rendering (server generates fresh nonce per request).
 *    This breaks PWA offline capability - pages can't load without server.
 *    See: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
 *
 * Risk Assessment (LOW for this app):
 * - No user-generated content that could contain scripts
 * - No third-party scripts (Sentry uses connect-src, not script-src)
 * - All data is local (IndexedDB), not from external APIs
 * - Single-page PWA with minimal attack surface
 * - XSS would require attacker to modify static files on hosting server
 *
 * ACCEPTED RISK: unsafe-inline/unsafe-eval are security trade-offs accepted
 * for PWA offline capability. This is documented and intentional.
 */
const securityHeaders = [
  {
    // Content Security Policy
    // Note: unsafe-inline/unsafe-eval required for Next.js + PWA offline capability
    // See security documentation above for risk assessment and alternatives evaluated
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required by Next.js - see note above
      "style-src 'self' 'unsafe-inline'", // Required for CSS-in-JS and Next.js styles
      "img-src 'self'", // Strict: no data: or blob: URIs needed for images
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io https://*.sentry.io https://play.googleapis.com",
      "worker-src 'self'",
      "object-src 'none'", // Block Flash, Java applets, and other plugins
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "upgrade-insecure-requests", // Force HTTPS for all resources
      "report-to csp-endpoint", // Modern browsers (Chrome 70+, Firefox 65+)
      "report-uri /api/csp-report", // Legacy browsers fallback (deprecated but needed for Safari, older browsers)
    ].join('; '),
  },
  {
    // Prevent clickjacking
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    // Prevent MIME type sniffing
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    // Control referrer information
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // DNS prefetch control
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    // Permissions Policy (formerly Feature-Policy)
    // Disable features we don't need
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    // Preconnect hints for Sentry error reporting
    // preconnect includes DNS + TCP + TLS handshake for faster first request
    key: 'Link',
    value: '<https://sentry.io>; rel=preconnect, <https://ingest.sentry.io>; rel=preconnect',
  },
  {
    // Report-To header for modern CSP reporting (Chrome 70+, Firefox 65+)
    // Defines the endpoint group referenced by CSP's report-to directive
    key: 'Report-To',
    value: JSON.stringify({
      group: 'csp-endpoint',
      max_age: 10886400,
      endpoints: [{ url: '/api/csp-report' }],
    }),
  },
  {
    // Cross-Origin-Opener-Policy
    // Prevents other sites from opening this app in a popup and accessing window.opener
    // 'same-origin' is the strictest setting for a standalone PWA
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    // Cross-Origin-Resource-Policy
    // Prevents other origins from reading this app's resources
    // 'same-origin' blocks cross-origin resource requests
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
];

const nextConfig: NextConfig = {
  // Expose Git branch to client for preview/production indicators
  env: {
    NEXT_PUBLIC_GIT_BRANCH: process.env.VERCEL_GIT_COMMIT_REF || 'development',
  },
  // No special experimental config needed - instrumentation.ts is auto-detected
  async headers() {
    return [
      // Apply security headers to all routes
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Cache control for specific files
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        ],
      },
      {
        source: '/release-notes.json',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        ],
      },
      // Asset Links for TWA (Trusted Web Activity) verification
      // Google requires specific headers for Digital Asset Links
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          // Short cache (1 hour) to ensure signing key updates propagate quickly
          // while still allowing reasonable caching for Google's verification
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
          // CORS headers for Google verification
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: true,

  // Upload source maps only in production builds
  dryRun: process.env.NODE_ENV !== 'production',

  // Organization and project for source map uploads
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Authentication token for uploads
  authToken: process.env.SENTRY_AUTH_TOKEN,
};

// Only wrap with Sentry in production or when Sentry is force-enabled
const shouldUseSentry =
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true');

export default async function buildConfig(): Promise<NextConfig> {
  // Bundle analyzer - run with ANALYZE=true npm run build
  // Lazy-load to avoid requiring devDependencies when ANALYZE is not set
  let withBundleAnalyzer = (config: NextConfig) => config;
  if (process.env.ANALYZE === 'true') {
    const { default: bundleAnalyzer } = await import('@next/bundle-analyzer');
    withBundleAnalyzer = bundleAnalyzer({ enabled: true });
  }

  const configWithAnalyzer = withBundleAnalyzer(nextConfig);

  return shouldUseSentry
    ? withSentryConfig(configWithAnalyzer, sentryWebpackPluginOptions)
    : configWithAnalyzer;
}
