import { z } from 'zod';

/**
 * Environment variable schema with validation
 * This ensures type safety and validates required environment variables
 */
const environmentSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  
  // Sentry Configuration
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
  NEXT_PUBLIC_SENTRY_RELEASE: z.string().optional(),
  NEXT_PUBLIC_SENTRY_FORCE_ENABLE: z.string().transform(val => val === 'true').optional(),
  
  // Sentry Build Configuration (server-side only)
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  
  // Analytics
  NEXT_PUBLIC_ANALYTICS_ID: z.string().optional(),
  
  // Feature Flags
  NEXT_PUBLIC_FEATURE_ADVANCED_ANALYTICS: z.string().transform(val => val === 'true').default('false'),
  NEXT_PUBLIC_FEATURE_PREMIUM_FEATURES: z.string().transform(val => val === 'true').default('false'),
  NEXT_PUBLIC_FEATURE_EXPORT_FORMATS: z.string().transform(val => val === 'true').default('true'),
  NEXT_PUBLIC_FEATURE_MULTI_LANGUAGE: z.string().transform(val => val === 'true').default('true'),
  NEXT_PUBLIC_FEATURE_PWA_INSTALL: z.string().transform(val => val === 'true').default('true'),
  
  // Deployment Configuration
  VERCEL_GIT_COMMIT_REF: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  
  // Performance Configuration
  NEXT_PUBLIC_PERFORMANCE_MONITORING: z.string().transform(val => val === 'true').default('false'),
  NEXT_PUBLIC_DEBUG_MODE: z.string().transform(val => val === 'true').default('false'),
});

/**
 * Parse and validate environment variables
 * This will throw an error if required variables are missing or invalid
 */
function parseEnvironment() {
  try {
    return environmentSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment configuration:');
      error.issues.forEach(issue => {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      });
      throw new Error('Environment validation failed');
    }
    throw error;
  }
}

// Export validated environment
export const env = parseEnvironment();

/**
 * Environment-specific configurations
 */
export const config = {
  // Current environment
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
  isProduction: env.NODE_ENV === 'production',
  
  // Deployment environment (Vercel-specific)
  isVercelProduction: env.VERCEL_ENV === 'production',
  isVercelPreview: env.VERCEL_ENV === 'preview',
  
  // Feature flags
  features: {
    advancedAnalytics: env.NEXT_PUBLIC_FEATURE_ADVANCED_ANALYTICS,
    premiumFeatures: env.NEXT_PUBLIC_FEATURE_PREMIUM_FEATURES,
    exportFormats: env.NEXT_PUBLIC_FEATURE_EXPORT_FORMATS,
    multiLanguage: env.NEXT_PUBLIC_FEATURE_MULTI_LANGUAGE,
    pwaInstall: env.NEXT_PUBLIC_FEATURE_PWA_INSTALL,
  },
  
  // Monitoring configuration
  monitoring: {
    sentry: {
      enabled: !!env.NEXT_PUBLIC_SENTRY_DSN,
      dsn: env.NEXT_PUBLIC_SENTRY_DSN,
      environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || env.NODE_ENV,
      release: env.NEXT_PUBLIC_SENTRY_RELEASE,
      forceEnable: env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE,
    },
    analytics: {
      enabled: !!env.NEXT_PUBLIC_ANALYTICS_ID,
      id: env.NEXT_PUBLIC_ANALYTICS_ID,
    },
    performance: env.NEXT_PUBLIC_PERFORMANCE_MONITORING,
  },
  
  // Application configuration
  app: {
    branch: env.VERCEL_GIT_COMMIT_REF || 'development',
    url: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'http://localhost:3000',
    debugMode: env.NEXT_PUBLIC_DEBUG_MODE,
  },
  
  // Build configuration
  build: {
    uploadSourceMaps: env.NODE_ENV === 'production' && !!env.SENTRY_AUTH_TOKEN,
    sentryOrg: env.SENTRY_ORG,
    sentryProject: env.SENTRY_PROJECT,
    sentryAuthToken: env.SENTRY_AUTH_TOKEN,
  },
} as const;

/**
 * Get environment-specific settings
 */
export function getEnvironmentConfig() {
  return {
    environment: env.NODE_ENV,
    isDev: config.isDevelopment,
    isProd: config.isProduction,
    features: config.features,
    monitoring: config.monitoring,
    app: config.app,
  };
}

/**
 * Runtime feature flag checker
 */
export function isFeatureEnabled(feature: keyof typeof config.features): boolean {
  return config.features[feature];
}

/**
 * Environment-based logger configuration
 */
export const logConfig = {
  level: config.isDevelopment ? 'debug' : 'info',
  enableConsole: !config.isProduction || config.app.debugMode,
  enableSentry: config.monitoring.sentry.enabled,
} as const;

export default env;