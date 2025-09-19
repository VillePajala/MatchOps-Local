// This file configures the initialization of Sentry for Edge runtime
import * as Sentry from '@sentry/nextjs';

const isProduction = process.env.NODE_ENV === 'production';
const isForceEnabled = process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true';
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Only initialize Sentry if we have a DSN and we're in production or force-enabled
if (dsn && (isProduction || isForceEnabled)) {
  Sentry.init({
    dsn,

    // Performance monitoring
    tracesSampleRate: isProduction ? 0.1 : 1.0,

    // Environment
    environment: process.env.NODE_ENV,

    // Release tracking
    release: process.env.npm_package_version,

    // Debug mode in development
    debug: !isProduction,
  });
}