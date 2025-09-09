import React from 'react';
import { config, isFeatureEnabled } from './environment';

/**
 * Feature flag definitions with descriptions
 */
export const FEATURES = {
  // Analytics Features
  ADVANCED_ANALYTICS: 'advancedAnalytics',
  PREMIUM_FEATURES: 'premiumFeatures',
  
  // Export Features
  EXPORT_FORMATS: 'exportFormats',
  
  // UI Features
  MULTI_LANGUAGE: 'multiLanguage',
  PWA_INSTALL: 'pwaInstall',
} as const;

/**
 * Feature flag descriptions for documentation
 */
export const FEATURE_DESCRIPTIONS = {
  [FEATURES.ADVANCED_ANALYTICS]: 'Enable advanced analytics and detailed statistics',
  [FEATURES.PREMIUM_FEATURES]: 'Enable premium features (future use)',
  [FEATURES.EXPORT_FORMATS]: 'Enable multiple export formats (CSV, JSON, etc.)',
  [FEATURES.MULTI_LANGUAGE]: 'Enable multi-language support (EN/FI)',
  [FEATURES.PWA_INSTALL]: 'Enable PWA installation prompts',
} as const;

/**
 * Environment-based feature overrides
 * Some features may be force-enabled/disabled based on environment
 */
const ENVIRONMENT_OVERRIDES = {
  development: {
    // In development, enable all features for testing
    [FEATURES.ADVANCED_ANALYTICS]: true,
    [FEATURES.EXPORT_FORMATS]: true,
  },
  test: {
    // In test environment, disable external integrations
    [FEATURES.PWA_INSTALL]: false,
    [FEATURES.ADVANCED_ANALYTICS]: false,
  },
  production: {
    // Production features are controlled by environment variables
    // No overrides here - use actual feature flags
  },
} as const;

/**
 * Check if a feature is enabled with environment overrides
 */
export function useFeature(feature: keyof typeof config.features): boolean {
  const envOverrides = ENVIRONMENT_OVERRIDES[config.app.branch as keyof typeof ENVIRONMENT_OVERRIDES] || {};
  
  // Check environment override first
  if (feature in envOverrides) {
    return envOverrides[feature as keyof typeof envOverrides] as boolean;
  }
  
  // Fall back to regular feature flag
  return isFeatureEnabled(feature);
}

/**
 * Get all enabled features for debugging
 */
export function getEnabledFeatures(): Record<string, boolean> {
  const features = Object.keys(config.features) as (keyof typeof config.features)[];
  
  return features.reduce((enabled, feature) => {
    enabled[feature] = useFeature(feature);
    return enabled;
  }, {} as Record<string, boolean>);
}

/**
 * Component wrapper for conditional feature rendering
 */
export function FeatureGuard({ 
  feature, 
  children, 
  fallback = null 
}: {
  feature: keyof typeof config.features;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  if (useFeature(feature)) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
}

/**
 * Hook for using features in React components
 */
export function useFeatureFlag(feature: keyof typeof config.features): boolean {
  return useFeature(feature);
}

/**
 * Development helper to log all feature states
 */
export function logFeatureStates(): void {
  if (config.isDevelopment || config.app.debugMode) {
    console.group('🚀 Feature Flags Status');
    
    Object.entries(getEnabledFeatures()).forEach(([feature, enabled]) => {
      const description = FEATURE_DESCRIPTIONS[feature as keyof typeof FEATURE_DESCRIPTIONS] || 'No description';
      console.log(`${enabled ? '✅' : '❌'} ${feature}: ${description}`);
    });
    
    console.log(`\n📍 Environment: ${config.app.branch}`);
    console.log(`📍 Node ENV: ${process.env.NODE_ENV}`);
    console.groupEnd();
  }
}

/**
 * Feature configuration for different environments
 */
export const ENVIRONMENT_CONFIGS = {
  development: {
    description: 'Development environment with all features enabled for testing',
    features: {
      [FEATURES.ADVANCED_ANALYTICS]: true,
      [FEATURES.EXPORT_FORMATS]: true,
      [FEATURES.MULTI_LANGUAGE]: true,
      [FEATURES.PWA_INSTALL]: true,
      [FEATURES.PREMIUM_FEATURES]: false, // Keep premium features disabled by default
    },
  },
  staging: {
    description: 'Staging environment mirroring production with debug features',
    features: {
      [FEATURES.ADVANCED_ANALYTICS]: true,
      [FEATURES.EXPORT_FORMATS]: true,
      [FEATURES.MULTI_LANGUAGE]: true,
      [FEATURES.PWA_INSTALL]: true,
      [FEATURES.PREMIUM_FEATURES]: false,
    },
  },
  production: {
    description: 'Production environment with stable features only',
    features: {
      [FEATURES.ADVANCED_ANALYTICS]: false, // Enable via env var
      [FEATURES.EXPORT_FORMATS]: true,
      [FEATURES.MULTI_LANGUAGE]: true,
      [FEATURES.PWA_INSTALL]: true,
      [FEATURES.PREMIUM_FEATURES]: false, // Future premium features
    },
  },
} as const;