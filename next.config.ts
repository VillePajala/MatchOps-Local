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
    
    // Security headers
    headers: async () => [
      {
        source: '/(.*)',
        headers: [
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
