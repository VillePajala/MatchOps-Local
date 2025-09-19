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

    // Performance monitoring
    tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% in production, 100% in dev

    // Session replay
    replaysSessionSampleRate: 0.0, // Disable session replays by default
    replaysOnErrorSampleRate: isProduction ? 0.1 : 1.0, // Only capture replays on errors

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