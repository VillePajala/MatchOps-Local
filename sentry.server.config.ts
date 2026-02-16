// This file configures the initialization of Sentry on the server side
import * as Sentry from '@sentry/nextjs';

const isProduction = process.env.NODE_ENV === 'production';
const isForceEnabled = process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true';
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Only initialize Sentry if we have a DSN and we're in production or force-enabled
if (dsn && (isProduction || isForceEnabled)) {
  Sentry.init({
    dsn,

    // Performance monitoring - 10% sampling, sustainable at Play Store scale
    tracesSampleRate: 0.1,

    // Environment
    environment: process.env.NODE_ENV,

    // Release tracking — use build-time env var (npm_package_version is undefined at runtime)
    release: process.env.NEXT_PUBLIC_APP_VERSION,

    // Debug mode in development
    debug: !isProduction,

    // Error filtering
    beforeSend(event, _hint) {
      // Filter out development-only errors
      if (!isProduction && !isForceEnabled) {
        return null;
      }

      return event;
    },
  });
}