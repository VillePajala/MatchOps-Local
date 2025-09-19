// This file configures the initialization of Sentry on the browser/client side
import * as Sentry from '@sentry/nextjs';

const isProduction = process.env.NODE_ENV === 'production';
const isForceEnabled = process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true';
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Only initialize Sentry if we have a DSN and we're in production or force-enabled
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

    // Error filtering
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

// Export router transition hook for navigation instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;