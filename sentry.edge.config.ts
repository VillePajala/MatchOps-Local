/**
 * Sentry configuration for Edge runtime (Vercel Edge Functions, Middleware)
 *
 * Edge runtime has limited APIs compared to Node.js, but still benefits from
 * error tracking and performance monitoring for middleware and edge functions.
 */
import * as Sentry from '@sentry/nextjs';

const isProduction = process.env.NODE_ENV === 'production';
const isForceEnabled = process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true';
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Initialize Sentry for Edge runtime with appropriate configuration
 *
 * Note: Some features available in Node.js/browser may not be available in Edge runtime
 * due to the limited execution environment.
 */
if (dsn && (isProduction || isForceEnabled)) {
  Sentry.init({
    dsn,

    // Performance monitoring - 10% sampling, sustainable at Play Store scale
    tracesSampleRate: 0.1,

    // Environment tracking
    environment: process.env.NODE_ENV,

    // Release tracking — use build-time env var (npm_package_version is undefined at runtime)
    release: process.env.NEXT_PUBLIC_APP_VERSION,

    // Debug mode in development for troubleshooting
    debug: !isProduction,

    /**
     * Error filtering for Edge runtime
     *
     * Filters out noise and development-only errors to keep
     * Sentry focused on real production issues.
     */
    beforeSend(event, _hint) {
      // Don't send events in development unless force-enabled
      if (!isProduction && !isForceEnabled) {
        return null;
      }

      // Filter out network timeouts — these are client-side issues, not edge errors
      const errorMessage = event.exception?.values?.[0]?.value;
      if (errorMessage) {
        if (errorMessage.includes('fetch timeout') ||
            errorMessage.includes('Request timeout')) {
          return null;
        }
      }

      return event;
    },
  });
}