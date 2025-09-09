import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { config } from "./src/config/environment";

const nextConfig: NextConfig = {
  
  // Environment-specific optimizations
  ...(config.isProduction && {
    // Production optimizations
    compress: true,
    poweredByHeader: false,
    
    // Comprehensive security headers
    headers: async () => [
      {
        source: '/(.*)',
        headers: [
          // Content Security Policy - Secure configuration without unsafe directives
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Strict script policy - no unsafe-eval or unsafe-inline
              "script-src 'self' 'nonce-__CSP_NONCE__' 'strict-dynamic'",
              // Style policy with hash-based allowances for Tailwind
              "style-src 'self' 'nonce-__CSP_NONCE__'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.sentry.io https://vitals.vercel-insights.com",
              "media-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
              // Report violations for monitoring
              "report-uri /api/csp-report",
            ].join('; '),
          },
          // Additional security headers
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: [
              'camera=()',
              'microphone=()',
              'geolocation=()',
              'interest-cohort=()',
              'payment=()',
              'usb=()',
            ].join(', '),
          },
        ],
      },
      // PWA-specific headers
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ],
  }),
  
  // Development-specific configuration
  ...(config.isDevelopment && {
    // Development optimizations
    experimental: {
      turbo: {
        rules: {
          '*.ts': ['@swc/core'],
          '*.tsx': ['@swc/core'],
        },
      },
    },
  }),
};

// Sentry configuration
const sentryWebpackPluginOptions = {
  org: config.build.sentryOrg,
  project: config.build.sentryProject,
  authToken: config.build.sentryAuthToken,
  
  // Only upload source maps in production builds with auth token
  silent: !config.app.debugMode,
  widenClientFileUpload: true,
  hideSourceMaps: config.isProduction,
  disableLogger: !config.app.debugMode,
  automaticVercelMonitors: config.isVercelProduction,
};

// Wrap with bundle analyzer if ANALYZE is set
const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false, // We'll open it manually
});

// Apply transformations in order
let finalConfig = nextConfig;

// First apply bundle analyzer
finalConfig = withAnalyzer(finalConfig);

// Then apply Sentry if needed
if (config.build.uploadSourceMaps) {
  finalConfig = withSentryConfig(finalConfig, sentryWebpackPluginOptions);
}

export default finalConfig;
