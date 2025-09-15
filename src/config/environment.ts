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
/**
 * Type guards for robust environment detection
 */
function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isNodeEnvironment(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions !== null &&
    process.versions.node !== null &&
    typeof process.env === 'object'
  );
}

function isBuildTimeEnvironment(): boolean {
  return (
    isNodeEnvironment() &&
    typeof process.env.NODE_ENV === 'string' &&
    !isBrowserEnvironment()
  );
}

function isServerEnvironment(): boolean {
  return (
    isNodeEnvironment() &&
    !isBrowserEnvironment() &&
    (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test')
  );
}

/**
 * Runtime environment detection with type guards
 */
interface EnvironmentContext {
  isBrowser: boolean;
  isBuild: boolean;
  isServer: boolean;
  isTest: boolean;
}

function detectEnvironment(): EnvironmentContext {
  const isBrowser = isBrowserEnvironment();
  const isBuild = isBuildTimeEnvironment();
  const isServer = isServerEnvironment();
  const isTest = isNodeEnvironment() && process.env.NODE_ENV === 'test';

  return {
    isBrowser,
    isBuild,
    isServer,
    isTest,
  };
}

function parseEnvironment() {
  const env = detectEnvironment();

  if (env.isBrowser) {
    // Browser environment - use minimal validation for client-side vars only
    const processEnv = typeof process !== 'undefined' ? process.env : {} as Record<string, string | undefined>;
    return {
      NODE_ENV: (processEnv.NODE_ENV as 'development' | 'test' | 'production') || 'development',
      NEXT_PUBLIC_SENTRY_DSN: processEnv.NEXT_PUBLIC_SENTRY_DSN,
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: processEnv.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      NEXT_PUBLIC_SENTRY_RELEASE: processEnv.NEXT_PUBLIC_SENTRY_RELEASE,
      NEXT_PUBLIC_SENTRY_FORCE_ENABLE: processEnv.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true',
      NEXT_PUBLIC_ANALYTICS_ID: processEnv.NEXT_PUBLIC_ANALYTICS_ID,
      NEXT_PUBLIC_FEATURE_ADVANCED_ANALYTICS: processEnv.NEXT_PUBLIC_FEATURE_ADVANCED_ANALYTICS === 'true',
      NEXT_PUBLIC_FEATURE_PREMIUM_FEATURES: processEnv.NEXT_PUBLIC_FEATURE_PREMIUM_FEATURES === 'true',
      NEXT_PUBLIC_FEATURE_EXPORT_FORMATS: processEnv.NEXT_PUBLIC_FEATURE_EXPORT_FORMATS !== 'false',
      NEXT_PUBLIC_FEATURE_MULTI_LANGUAGE: processEnv.NEXT_PUBLIC_FEATURE_MULTI_LANGUAGE !== 'false',
      NEXT_PUBLIC_FEATURE_PWA_INSTALL: processEnv.NEXT_PUBLIC_FEATURE_PWA_INSTALL !== 'false',
      VERCEL_GIT_COMMIT_REF: processEnv.VERCEL_GIT_COMMIT_REF,
      VERCEL_URL: processEnv.VERCEL_URL,
      VERCEL_ENV: processEnv.VERCEL_ENV as 'development' | 'preview' | 'production' | undefined,
      NEXT_PUBLIC_PERFORMANCE_MONITORING: processEnv.NEXT_PUBLIC_PERFORMANCE_MONITORING === 'true',
      NEXT_PUBLIC_DEBUG_MODE: processEnv.NEXT_PUBLIC_DEBUG_MODE === 'true',
      // Server-only variables are undefined in browser
      SENTRY_ORG: undefined,
      SENTRY_PROJECT: undefined,
      SENTRY_AUTH_TOKEN: undefined,
    };
  }

  // Server or build environment - use full validation
  try {
    const result = environmentSchema.parse(process.env);
    if (env.isServer) {
      // Additional server-side validation if needed
      console.log(`🔧 Environment validated for ${result.NODE_ENV} mode`);
    }
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const contextLabel = env.isBuild ? 'build' : env.isServer ? 'server' : env.isTest ? 'test' : 'unknown';
      console.error(`❌ Invalid environment configuration (${contextLabel} mode):`);
      error.issues.forEach(issue => {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      });
      throw new Error(`Environment validation failed in ${contextLabel} context`);
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
 * Runtime environment validation helper with security checks
 * Useful for health checks or startup validation
 */
export function validateEnvironment(): { valid: boolean; errors?: string[]; warnings?: string[] } {
  try {
    // Force re-parse to validate current environment
    const tempEnv = parseEnvironment();
    
    // Additional runtime checks
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Security validation - Check for secret exposure
    const securityValidation = validateSecurityConfiguration();
    errors.push(...securityValidation.errors);
    warnings.push(...securityValidation.warnings);
    
    // Check for critical production requirements
    if (config.isProduction) {
      if (!tempEnv.NEXT_PUBLIC_SENTRY_DSN && !tempEnv.NEXT_PUBLIC_SENTRY_FORCE_ENABLE) {
        errors.push('Production deployment missing Sentry configuration');
      }
      
      // Validate Sentry DSN format in production
      if (tempEnv.NEXT_PUBLIC_SENTRY_DSN) {
        const sentryDsnPattern = /^https:\/\/[a-f0-9]+@[a-zA-Z0-9.-]+\/\d+$/;
        if (!sentryDsnPattern.test(tempEnv.NEXT_PUBLIC_SENTRY_DSN)) {
          errors.push('Invalid Sentry DSN format detected');
        }
      }
    }
    
    // Check for conflicting configurations
    if (config.monitoring.sentry.enabled && !tempEnv.NEXT_PUBLIC_SENTRY_DSN) {
      errors.push('Sentry monitoring enabled but DSN not configured');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Environment validation failed']
    };
  }
}

/**
 * Validate security configuration and check for potential secret exposure
 */
function validateSecurityConfiguration(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for potentially exposed secrets in environment variables
  const envVars: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {};
  
  for (const [key, value] of Object.entries(envVars)) {
    if (!value || typeof value !== 'string') continue;
    
    // Check for secrets with NEXT_PUBLIC_ prefix (would be exposed to client)
    if (key.startsWith('NEXT_PUBLIC_')) {
      // Check for common secret patterns
      const secretPatterns = [
        { pattern: /sk-[a-zA-Z0-9-_]{20,}/, name: 'OpenAI API Key' },
        { pattern: /^[a-f0-9]{32,}$/, name: 'Generic Hash/Token' },
        { pattern: /xoxb-[0-9]+-[0-9]+-[0-9]+-[a-f0-9]+/, name: 'Slack Bot Token' },
        { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub Personal Access Token' },
        { pattern: /gho_[a-zA-Z0-9]{36}/, name: 'GitHub OAuth Token' },
        { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key' },
      ];
      
      for (const { pattern, name } of secretPatterns) {
        if (pattern.test(value)) {
          errors.push(`Potential ${name} exposed in client-side environment variable: ${key}`);
        }
      }
      
      // Check for suspiciously long strings that might be secrets
      if (value.length > 50 && !/^https?:\/\//.test(value) && !key.includes('DSN')) {
        warnings.push(`Suspiciously long value in client-exposed variable: ${key} (${value.length} chars)`);
      }
    }
    
    // Validate auth tokens and secrets are not exposed client-side
    if (key.startsWith('NEXT_PUBLIC_') && (
      value.includes('auth') && value.includes('token') || 
      value.includes('secret') || 
      value.includes('private') || 
      key.includes('AUTH_TOKEN') ||
      key.includes('SECRET') ||
      key.includes('PRIVATE')
    )) {
      errors.push(`Potential secret exposed client-side: ${key} - server secrets must not have NEXT_PUBLIC_ prefix`);
    }
  }
  
  // Additional security checks
  if (config.isProduction) {
    // Check that server-only secrets are properly configured
    const serverSecrets = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'];
    for (const secret of serverSecrets) {
      const publicKey = `NEXT_PUBLIC_${secret}`;
      if (envVars[publicKey]) {
        errors.push(`Server secret ${secret} incorrectly configured as ${publicKey} - this exposes it to client`);
      }
    }
  }
  
  return { errors, warnings };
}

/**
 * Simple boolean version for quick checks
 */
export function isEnvironmentValid(): boolean {
  return validateEnvironment().valid;
}

/**
 * Export environment detection utilities
 */
export const environmentDetection = {
  isBrowserEnvironment,
  isNodeEnvironment,
  isBuildTimeEnvironment,
  isServerEnvironment,
  detectEnvironment,
} as const;

export default env;