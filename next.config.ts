import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

/**
 * Security headers for production deployment
 * CSP is configured for a local-first PWA with:
 * - Self-hosted scripts/styles (Next.js requires unsafe-inline/eval for development)
 * - Sentry for error reporting
 * - Play Store API for license validation (future)
 */
const securityHeaders = [
  {
    // Content Security Policy
    // Note: 'unsafe-inline' and 'unsafe-eval' are required by Next.js for development
    // In production, Next.js uses nonces but we keep these for compatibility
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.ingest.sentry.io https://*.sentry.io https://play.googleapis.com",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
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
