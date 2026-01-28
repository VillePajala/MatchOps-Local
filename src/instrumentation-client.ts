/**
 * Client-side Sentry configuration for browser error tracking
 *
 * This file initializes Sentry in the browser environment with:
 * - Environment-aware initialization (production-only by default)
 * - Performance monitoring and session replay
 * - Error filtering to reduce noise
 * - Router transition tracking for navigation performance
 */

import * as Sentry from '@sentry/nextjs';

/**
 * CRITICAL SECURITY CHECK: Prevent mock billing in production
 *
 * Mock billing bypasses real payments. If this env var is accidentally
 * deployed to production, users could get premium features for free.
 *
 * Defense-in-depth layers:
 * 1. This check - halts app initialization completely
 * 2. Runtime check in playBilling.ts - refuses to enable and logs to Sentry
 * 3. Edge Function check - rejects test tokens unless MOCK_BILLING secret is set
 */
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_MOCK_BILLING === 'true') {
  // Log to console for visibility in browser dev tools
  // eslint-disable-next-line no-console
  console.error('🚨 CRITICAL SECURITY: NEXT_PUBLIC_MOCK_BILLING=true in production. App halted.');

  // Throw to halt execution - prevents any mock billing code from running
  throw new Error(
    'CRITICAL SECURITY VIOLATION: Mock billing is enabled in production. ' +
    'This would allow users to bypass payment. Deployment blocked. ' +
    'Remove NEXT_PUBLIC_MOCK_BILLING from production environment variables.'
  );
}

const isProduction = process.env.NODE_ENV === 'production';
const isForceEnabled = process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true';
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Initialize Sentry only in production or when explicitly enabled
 *
 * Configuration features:
 * - 10% performance trace sampling in production, 100% in development
 * - Session replays only on errors (privacy-conscious)
 * - Automatic filtering of common browser noise
 * - Debug mode in development for easier troubleshooting
 */
if (dsn && (isProduction || isForceEnabled)) {
  Sentry.init({
    dsn,

    // Integrations for browser monitoring
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Only capture replays for errors, not all sessions
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Performance monitoring - 100% sampling for small user base (20 users)
    tracesSampleRate: 1.0,

    // Session replay - capture all error replays for debugging
    replaysSessionSampleRate: 0.0, // Disable session replays by default (privacy)
    replaysOnErrorSampleRate: 1.0, // Capture replay for every error

    // Environment
    environment: process.env.NODE_ENV,

    // Release tracking
    release: process.env.npm_package_version,

    // Debug mode in development
    debug: !isProduction,

    /**
     * Filter errors before sending to Sentry
     *
     * Filters out:
     * - All errors in development (unless force-enabled)
     * - ResizeObserver errors (browser implementation quirks)
     * - Generic network errors (often user connectivity issues)
     *
     * @param event - The error event to potentially send
     * @returns The event to send, or null to filter it out
     */
    beforeSend(event) {
      // Filter out development-only errors
      if (!isProduction && !isForceEnabled) {
        return null;
      }

      // Filter out ResizeObserver errors (common browser noise)
      if (event.exception?.values?.[0]?.value?.includes('ResizeObserver')) {
        return null;
      }

      // Filter out network errors that might be user-network related
      if (event.exception?.values?.[0]?.value?.includes('NetworkError')) {
        return null;
      }

      return event;
    },
  });
}

/**
 * Hook for capturing router transitions
 *
 * This export is required by @sentry/nextjs to instrument navigation
 * performance. It tracks client-side route changes and measures their
 * duration for performance monitoring.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;