import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // No special experimental config needed - instrumentation.ts is auto-detected
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
