import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

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
 * 2. Nonce-based CSP requires dynamic rendering (no static optimization)
 * 3. For a local-first PWA, static optimization is critical for performance
 *
 * Why Hash-Based CSP Isn't Feasible:
 * Next.js generates dynamic inline scripts containing:
 * - React Server Component (RSC) payloads with build-specific data
 * - Chunk hashes that change every build (e.g., "static/chunks/app/page-abc123.js")
 * - Hydration data that varies per page and build
 * Pre-computing hashes would require post-build processing of every HTML file,
 * and hashes would need to be regenerated on every build - not practical.
 *
 * Risk Assessment (LOW for this app):
 * - No user-generated content that could contain scripts
 * - No third-party scripts except Vercel Analytics (trusted)
 * - All data is local (IndexedDB), not from external APIs
 * - Single-page app with minimal attack surface
 *
 * TODO: Implement nonce-based CSP when Next.js supports it with static pages
 * See: https://nextjs.org/docs/app/guides/content-security-policy
 */
const securityHeaders = [
  {
    // Content Security Policy
    // TODO: Replace unsafe-inline/unsafe-eval with nonce-based CSP
    // when Next.js supports nonces with static optimization
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required by Next.js - see note above
      "style-src 'self' 'unsafe-inline'", // Required for CSS-in-JS and Next.js styles
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.ingest.sentry.io https://*.sentry.io https://play.googleapis.com",
      "worker-src 'self'",
      "object-src 'none'", // Block Flash, Java applets, and other plugins
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "upgrade-insecure-requests", // Force HTTPS for all resources
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
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    // DNS prefetch hints for external services
    // Improves connection time to Sentry for error reporting
    key: 'Link',
    value: '<https://sentry.io>; rel=dns-prefetch, <https://ingest.sentry.io>; rel=preconnect',
  },
];

const nextConfig: NextConfig = {
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

export default shouldUseSentry
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
