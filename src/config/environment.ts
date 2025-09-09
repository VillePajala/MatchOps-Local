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
  // Explicit environment detection for validation strategy
  const isBrowser = typeof window !== 'undefined';
  const isBuild = typeof process !== 'undefined' && process.env.NODE_ENV && !isBrowser;
  const isServer = !isBrowser && !isBuild;

  if (isBrowser) {
    // Browser environment - use minimal validation for client-side vars only
    return {
      NODE_ENV: (process.env.NODE_ENV as 'development' | 'test' | 'production') || 'development',
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      NEXT_PUBLIC_SENTRY_FORCE_ENABLE: process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true',
      NEXT_PUBLIC_ANALYTICS_ID: process.env.NEXT_PUBLIC_ANALYTICS_ID,
      NEXT_PUBLIC_FEATURE_ADVANCED_ANALYTICS: process.env.NEXT_PUBLIC_FEATURE_ADVANCED_ANALYTICS === 'true',
      NEXT_PUBLIC_FEATURE_PREMIUM_FEATURES: process.env.NEXT_PUBLIC_FEATURE_PREMIUM_FEATURES === 'true',
      NEXT_PUBLIC_FEATURE_EXPORT_FORMATS: process.env.NEXT_PUBLIC_FEATURE_EXPORT_FORMATS !== 'false',
      NEXT_PUBLIC_FEATURE_MULTI_LANGUAGE: process.env.NEXT_PUBLIC_FEATURE_MULTI_LANGUAGE !== 'false',
      NEXT_PUBLIC_FEATURE_PWA_INSTALL: process.env.NEXT_PUBLIC_FEATURE_PWA_INSTALL !== 'false',
      VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
      VERCEL_URL: process.env.VERCEL_URL,
      VERCEL_ENV: process.env.VERCEL_ENV as 'development' | 'preview' | 'production' | undefined,
      NEXT_PUBLIC_PERFORMANCE_MONITORING: process.env.NEXT_PUBLIC_PERFORMANCE_MONITORING === 'true',
      NEXT_PUBLIC_DEBUG_MODE: process.env.NEXT_PUBLIC_DEBUG_MODE === 'true',
      // Server-only variables are undefined in browser
      SENTRY_ORG: undefined,
      SENTRY_PROJECT: undefined,
      SENTRY_AUTH_TOKEN: undefined,
    };
  }

  // Server or build environment - use full validation
  try {
    const result = environmentSchema.parse(process.env);
    if (isServer) {
      // Additional server-side validation if needed
      console.log(`🔧 Environment validated for ${result.NODE_ENV} mode`);
    }
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(`❌ Invalid environment configuration (${isBuild ? 'build' : 'server'} mode):`);
      error.issues.forEach(issue => {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      });
      throw new Error('Environment validation failed');
    }
    throw error;
  }
}

// Export validated environment with lazy initialization
let _env: ReturnType<typeof parseEnvironment> | null = null;
export const env = new Proxy({} as ReturnType<typeof parseEnvironment>, {
  get(target, prop) {
    if (!_env) {
      _env = parseEnvironment();
    }
    return _env[prop as keyof typeof _env];
  }
});

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

/**
 * Runtime environment validation helper
 * Useful for health checks or startup validation
 */
export function validateEnvironment(): { valid: boolean; errors?: string[] } {
  try {
    // Force re-parse to validate current environment
    const tempEnv = parseEnvironment();
    
    // Additional runtime checks
    const errors: string[] = [];
    
    // Check for critical production requirements
    if (config.isProduction) {
      if (!tempEnv.NEXT_PUBLIC_SENTRY_DSN && !tempEnv.NEXT_PUBLIC_SENTRY_FORCE_ENABLE) {
        errors.push('Production deployment missing Sentry configuration');
      }
    }
    
    // Check for conflicting configurations
    if (config.monitoring.sentry.enabled && !tempEnv.NEXT_PUBLIC_SENTRY_DSN) {
      errors.push('Sentry monitoring enabled but DSN not configured');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Environment validation failed']
    };
  }
}

/**
 * Simple boolean version for quick checks
 */
export function isEnvironmentValid(): boolean {
  return validateEnvironment().valid;
}

export default env;