import { jest } from '@jest/globals';

// Mock environment config type
interface MockConfig {
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
  features: {
    advancedAnalytics: boolean;
    premiumFeatures: boolean;
    exportFormats: boolean;
    multiLanguage: boolean;
    pwaInstall: boolean;
  };
}

// Create the mock functions outside the module mock
const mockIsFeatureEnabled = jest.fn();

// Mock environment module before importing feature flags
jest.unstable_mockModule('../environment', () => ({
  config: {
    isDevelopment: false,
    isProduction: false,
    isTest: true,
    features: {
      advancedAnalytics: false,
      premiumFeatures: false,
      exportFormats: true,
      multiLanguage: true,
      pwaInstall: true,
    }
  } as MockConfig,
  isFeatureEnabled: mockIsFeatureEnabled,
}));

// Import modules for testing
let useFeature: (feature: string) => boolean;
let getEnabledFeatures: () => Record<string, boolean>;
let FEATURES: Record<string, string>;
let config: MockConfig;

beforeAll(async () => {
  const featureFlags = await import('../feature-flags');
  const environment = await import('../environment');
  
  useFeature = featureFlags.useFeature;
  getEnabledFeatures = featureFlags.getEnabledFeatures;
  FEATURES = featureFlags.FEATURES;
  
  config = environment.config;
});

describe('Feature Flags', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsFeatureEnabled.mockClear();
  });

  describe('useFeature', () => {
    it('should return environment override for development', () => {
      // Mock development environment
      const mockConfig = config as MockConfig;
      mockConfig.isDevelopment = true;
      mockConfig.isProduction = false;
      mockIsFeatureEnabled.mockReturnValue(false);

      const result = useFeature('advancedAnalytics');
      
      // Should return true from development override, not from config
      expect(result).toBe(true);
    });

    it('should return environment override for test', () => {
      // Mock test environment
      const mockConfig = config as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = false;
      mockIsFeatureEnabled.mockReturnValue(true);

      const result = useFeature('pwaInstall');
      
      // Should return false from test override, not from config
      expect(result).toBe(false);
    });

    it('should fall back to regular feature flag in production', () => {
      // Mock production environment
      const mockConfig = config as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = true;
      mockIsFeatureEnabled.mockReturnValue(true);

      const result = useFeature('exportFormats');
      
      // Should call isFeatureEnabled and return its result
      expect(mockIsFeatureEnabled).toHaveBeenCalledWith('exportFormats');
      expect(result).toBe(true);
    });

    it('should handle unknown features gracefully', () => {
      const mockConfig = config as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = true;
      mockIsFeatureEnabled.mockReturnValue(false);

      const result = useFeature('unknownFeature');
      
      expect(result).toBe(false);
      expect(mockIsFeatureEnabled).toHaveBeenCalledWith('unknownFeature');
    });
  });

  describe('getEnabledFeatures', () => {
    it('should return all feature states', () => {
      const mockConfig = config as MockConfig;
      mockConfig.isDevelopment = true;
      mockConfig.isProduction = false;
      mockIsFeatureEnabled.mockImplementation((feature: unknown): boolean => {
        return mockConfig.features[(feature as string) as keyof typeof mockConfig.features] || false;
      });

      const enabledFeatures = getEnabledFeatures();

      expect(enabledFeatures).toEqual({
        advancedAnalytics: true, // Override in development
        premiumFeatures: false,
        exportFormats: true, // Override in development + base config
        multiLanguage: true,
        pwaInstall: true,
      });
    });
  });

  describe('FEATURES constants', () => {
    it('should have all expected feature keys', () => {
      expect(FEATURES.ADVANCED_ANALYTICS).toBe('advancedAnalytics');
      expect(FEATURES.PREMIUM_FEATURES).toBe('premiumFeatures');
      expect(FEATURES.EXPORT_FORMATS).toBe('exportFormats');
      expect(FEATURES.MULTI_LANGUAGE).toBe('multiLanguage');
      expect(FEATURES.PWA_INSTALL).toBe('pwaInstall');
    });
  });

  describe('Environment-specific overrides', () => {
    it('should enable all features in development', () => {
      const mockConfig = config as MockConfig;
      mockConfig.isDevelopment = true;
      mockConfig.isProduction = false;

      expect(useFeature('advancedAnalytics')).toBe(true);
      expect(useFeature('exportFormats')).toBe(true);
    });

    it('should disable external features in test', () => {
      const mockConfig = config as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = false;
      mockIsFeatureEnabled.mockReturnValue(true);

      expect(useFeature('pwaInstall')).toBe(false); // Override in test
      expect(useFeature('advancedAnalytics')).toBe(false); // Override in test
    });

    it('should use environment variables in production', () => {
      const mockConfig = config as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = true;
      mockIsFeatureEnabled.mockReturnValue(true);

      useFeature('multiLanguage');
      
      expect(mockIsFeatureEnabled).toHaveBeenCalledWith('multiLanguage');
    });
  });

  describe('Edge cases', () => {
    it('should handle missing config gracefully', () => {
      const mockConfig = config as Partial<MockConfig>;
      mockConfig.isDevelopment = undefined;
      mockConfig.isProduction = undefined;
      mockIsFeatureEnabled.mockReturnValue(false);

      // Use a feature that doesn't have test overrides to ensure it falls back to isFeatureEnabled
      const result = useFeature('premiumFeatures');
      
      // Should fall back to regular feature checking
      expect(result).toBe(false);
      expect(mockIsFeatureEnabled).toHaveBeenCalledWith('premiumFeatures');
    });

    it('should handle feature flag errors gracefully', () => {
      const mockConfig = config as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = true;
      mockIsFeatureEnabled.mockImplementation(() => {
        throw new Error('Feature flag error');
      });

      expect(() => useFeature('exportFormats')).not.toThrow();
    });
  });
});

describe('Feature Flag Integration', () => {
  it('should work with React components', () => {
    // This test ensures the feature flags work in a React context
    const mockConfig = config as MockConfig;
    mockConfig.isDevelopment = true;
    
    const isAnalyticsEnabled = useFeature('advancedAnalytics');
    const isExportEnabled = useFeature('exportFormats');
    
    expect(isAnalyticsEnabled).toBe(true);
    expect(isExportEnabled).toBe(true);
  });

  it('should provide consistent results across multiple calls', () => {
    const mockConfig = config as unknown as MockConfig;
    mockConfig.isDevelopment = false;
    mockConfig.isProduction = true;
    mockIsFeatureEnabled.mockReturnValue(true);

    const result1 = useFeature('multiLanguage');
    const result2 = useFeature('multiLanguage');
    
    expect(result1).toBe(result2);
    expect(mockIsFeatureEnabled).toHaveBeenCalledTimes(2);
  });
});