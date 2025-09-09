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
  isFeatureEnabled: jest.fn(),
}));

const { useFeature, getEnabledFeatures, FEATURES } = await import('../feature-flags');
const { config, isFeatureEnabled } = await import('../environment');

describe('Feature Flags', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useFeature', () => {
    it('should return environment override for development', () => {
      // Mock development environment
      const mockConfig = config as unknown as MockConfig;
      mockConfig.isDevelopment = true;
      mockConfig.isProduction = false;
      (isFeatureEnabled as jest.Mock).mockReturnValue(false);

      const result = useFeature('advancedAnalytics');
      
      // Should return true from development override, not from config
      expect(result).toBe(true);
    });

    it('should return environment override for test', () => {
      // Mock test environment
      const mockConfig = config as unknown as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = false;
      (isFeatureEnabled as jest.Mock).mockReturnValue(true);

      const result = useFeature('pwaInstall');
      
      // Should return false from test override, not from config
      expect(result).toBe(false);
    });

    it('should fall back to regular feature flag in production', () => {
      // Mock production environment
      const mockConfig = config as unknown as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = true;
      (isFeatureEnabled as jest.Mock).mockReturnValue(true);

      const result = useFeature('exportFormats');
      
      // Should call isFeatureEnabled and return its result
      expect(isFeatureEnabled).toHaveBeenCalledWith('exportFormats');
      expect(result).toBe(true);
    });

    it('should handle unknown features gracefully', () => {
      const mockConfig = config as unknown as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = true;
      (isFeatureEnabled as jest.Mock).mockReturnValue(false);

      const result = useFeature('unknownFeature' as keyof typeof config.features);
      
      expect(result).toBe(false);
    });
  });

  describe('getEnabledFeatures', () => {
    it('should return all feature states', () => {
      const mockConfig = config as unknown as MockConfig;
      mockConfig.isDevelopment = true;
      mockConfig.isProduction = false;
      (isFeatureEnabled as jest.Mock).mockImplementation((feature: string) => {
        return mockConfig.features[feature as keyof typeof mockConfig.features] || false;
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
      const mockConfig = config as unknown as MockConfig;
      mockConfig.isDevelopment = true;
      mockConfig.isProduction = false;

      expect(useFeature('advancedAnalytics')).toBe(true);
      expect(useFeature('exportFormats')).toBe(true);
    });

    it('should disable external features in test', () => {
      const mockConfig = config as unknown as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = false;
      (isFeatureEnabled as jest.Mock).mockReturnValue(true);

      expect(useFeature('pwaInstall')).toBe(false); // Override in test
      expect(useFeature('advancedAnalytics')).toBe(false); // Override in test
    });

    it('should use environment variables in production', () => {
      const mockConfig = config as unknown as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = true;
      (isFeatureEnabled as jest.Mock).mockReturnValue(true);

      useFeature('multiLanguage');
      
      expect(isFeatureEnabled).toHaveBeenCalledWith('multiLanguage');
    });
  });

  describe('Edge cases', () => {
    it('should handle missing config gracefully', () => {
      const mockConfig = config as unknown as Partial<MockConfig>;
      mockConfig.isDevelopment = undefined;
      mockConfig.isProduction = undefined;
      (isFeatureEnabled as jest.Mock).mockReturnValue(false);

      const result = useFeature('exportFormats');
      
      // Should fall back to regular feature checking
      expect(result).toBe(false);
    });

    it('should handle feature flag errors gracefully', () => {
      const mockConfig = config as unknown as MockConfig;
      mockConfig.isDevelopment = false;
      mockConfig.isProduction = true;
      (isFeatureEnabled as jest.Mock).mockImplementation(() => {
        throw new Error('Feature flag error');
      });

      expect(() => useFeature('exportFormats')).not.toThrow();
    });
  });
});

describe('Feature Flag Integration', () => {
  it('should work with React components', () => {
    // This test ensures the feature flags work in a React context
    const mockConfig = config as unknown as MockConfig;
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
    (isFeatureEnabled as jest.Mock).mockReturnValue(true);

    const result1 = useFeature('multiLanguage');
    const result2 = useFeature('multiLanguage');
    
    expect(result1).toBe(result2);
    expect(isFeatureEnabled).toHaveBeenCalledTimes(2);
  });
});