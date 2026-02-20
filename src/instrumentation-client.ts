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
 * Known bot User-Agent substrings. Errors from bots are not actionable
 * (e.g., Service Worker registration fails in crawler environments).
 */
const BOT_UA_PATTERNS = [
  'Googlebot',
  'Google-Read-Aloud',
  'bingbot',
  'Baiduspider',
  'YandexBot',
  'DuckDuckBot',
  'Slurp',
  'facebookexternalhit',
  'Twitterbot',
  'LinkedInBot',
  'WhatsApp',
  'Applebot',
];

/**
 * Patterns that indicate auth-related data that should be scrubbed from Sentry.
 * These patterns match URL paths, header names, and data fields that may contain
 * tokens, emails, or other PII from the auth flow.
 */
const AUTH_URL_PATTERNS = [
  '/auth/',
  '/token',
  '/callback',
  'access_token=',
  'refresh_token=',
  'type=recovery',
  'type=signup',
  'type=magiclink',
];

/**
 * Scrub potential PII from a URL string.
 * Redacts query parameters and hash fragments that may contain tokens or emails.
 */
function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url, 'https://placeholder.local');
    // Redact known sensitive query params
    const sensitiveParams = ['access_token', 'refresh_token', 'token', 'email', 'code'];
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '[REDACTED]');
      }
    }
    // Redact hash fragments that contain tokens (e.g., #access_token=...)
    if (parsed.hash && AUTH_URL_PATTERNS.some(p => parsed.hash.includes(p))) {
      parsed.hash = '#[REDACTED]';
    }
    return parsed.toString().replace('https://placeholder.local', '');
  } catch {
    // If URL parsing fails, return as-is (non-URL string)
    return url;
  }
}

/**
 * Initialize Sentry only in production or when explicitly enabled
 *
 * Configuration features:
 * - 100% performance trace sampling (small user base)
 * - Session replays only on errors (privacy-conscious)
 * - Automatic filtering of common browser noise
 * - PII scrubbing for auth-related data (emails, tokens, headers)
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

    // Performance monitoring - 10% sampling (sustainable at scale for Play Store release)
    tracesSampleRate: 0.1,

    // Session replay - capture all error replays for debugging
    replaysSessionSampleRate: 0.0, // Disable session replays by default (privacy)
    replaysOnErrorSampleRate: 1.0, // Capture replay for every error

    // Environment
    environment: process.env.NODE_ENV,

    // Release tracking — use build-time env var (npm_package_version is undefined at runtime)
    release: process.env.NEXT_PUBLIC_APP_VERSION,

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
     * Scrubs PII:
     * - Auth-related URLs (tokens, emails) in breadcrumbs
     * - User email from event context
     *
     * @param event - The error event to potentially send
     * @returns The event to send, or null to filter it out
     */
    beforeSend(event) {
      // Filter out development-only errors
      if (!isProduction && !isForceEnabled) {
        return null;
      }

      // Filter out bot traffic (crawlers don't support SW, PWA features etc.)
      const userAgent = navigator?.userAgent ?? '';
      if (BOT_UA_PATTERNS.some(bot => userAgent.includes(bot))) {
        return null;
      }

      // Filter out ResizeObserver errors (common browser noise)
      if (event.exception?.values?.[0]?.value?.includes('ResizeObserver')) {
        return null;
      }

      // Filter out Play Billing errors (expected when app is not installed from Play Store)
      if (event.exception?.values?.[0]?.value?.includes('clientAppUnavailable')) {
        return null;
      }

      // Filter out raw browser network errors (user connectivity issues).
      // Only match known browser-level patterns, NOT app-level NetworkError instances
      // from retry exhaustion (which are actionable and should be reported).
      const exceptionValue = event.exception?.values?.[0]?.value ?? '';
      if (
        exceptionValue === 'NetworkError when attempting to fetch resource.' ||
        exceptionValue === 'Failed to fetch' ||
        exceptionValue === 'Network request failed' ||
        exceptionValue === 'Load failed'
      ) {
        return null;
      }

      // Scrub user email from event context (keep user ID for debugging)
      if (event.user?.email) {
        delete event.user.email;
      }

      // Scrub auth-related data from request headers
      if (event.request?.headers) {
        const headers = event.request.headers;
        if (headers['Authorization'] || headers['authorization']) {
          headers['Authorization'] = '[REDACTED]';
          delete headers['authorization'];
        }
        if (headers['Cookie'] || headers['cookie']) {
          headers['Cookie'] = '[REDACTED]';
          delete headers['cookie'];
        }
      }

      // Scrub auth-related URLs in request data
      if (event.request?.url) {
        event.request.url = scrubUrl(event.request.url);
      }

      return event;
    },

    /**
     * Filter breadcrumbs before they are added to error context.
     *
     * Scrubs PII from:
     * - fetch/xhr breadcrumbs that may capture auth endpoints
     * - navigation breadcrumbs that may contain auth callback URLs
     *
     * @param breadcrumb - The breadcrumb to filter
     * @returns The breadcrumb (possibly modified), or null to drop it
     */
    beforeBreadcrumb(breadcrumb) {
      // Scrub auth-related fetch/xhr breadcrumbs
      if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
        const url = breadcrumb.data?.url as string | undefined;
        if (url && AUTH_URL_PATTERNS.some(p => url.includes(p))) {
          // Keep the breadcrumb but redact the URL to preserve debugging context
          breadcrumb.data = {
            ...breadcrumb.data,
            url: scrubUrl(url),
          };
        }
      }

      // Scrub auth callback URLs from navigation breadcrumbs
      if (breadcrumb.category === 'navigation') {
        if (breadcrumb.data?.to) {
          breadcrumb.data.to = scrubUrl(breadcrumb.data.to as string);
        }
        if (breadcrumb.data?.from) {
          breadcrumb.data.from = scrubUrl(breadcrumb.data.from as string);
        }
      }

      return breadcrumb;
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