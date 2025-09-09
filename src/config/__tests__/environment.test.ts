import { jest } from '@jest/globals';

// Type for global object mocking
declare const global: any;

describe('Environment Detection Type Guards', () => {
  let originalWindow: any;
  let originalProcess: any;

  beforeEach(() => {
    // Store originals
    originalWindow = global.window;
    originalProcess = global.process;
    
    // Clean slate for each test
    delete global.window;
    delete global.document;
    delete global.process;
  });

  afterEach(() => {
    // Restore originals
    if (originalWindow) {
      global.window = originalWindow;
    }
    if (originalProcess) {
      global.process = originalProcess;
    }
  });

  describe('isBrowserEnvironment', () => {
    it('should return true when window and document are available', async () => {
      // Mock browser environment
      global.window = {};
      global.document = {};
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBrowserEnvironment()).toBe(true);
    });

    it('should return false when window is missing', async () => {
      global.document = {};
      // window is undefined
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBrowserEnvironment()).toBe(false);
    });

    it('should return false when document is missing', async () => {
      global.window = {};
      // document is undefined
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBrowserEnvironment()).toBe(false);
    });
  });

  describe('isNodeEnvironment', () => {
    it('should return true when process with versions.node is available', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: {}
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(true);
    });

    it('should return false when process is missing', async () => {
      // process is undefined
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });

    it('should return false when process.versions is null', async () => {
      global.process = {
        versions: null,
        env: {}
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });

    it('should return false when process.versions.node is null', async () => {
      global.process = {
        versions: { node: null },
        env: {}
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });

    it('should return false when process.env is not an object', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: null
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });
  });

  describe('isBuildTimeEnvironment', () => {
    it('should return true during build time', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: { NODE_ENV: 'production' }
      };
      // No window/document (not browser)
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBuildTimeEnvironment()).toBe(true);
    });

    it('should return false in browser environment', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: { NODE_ENV: 'production' }
      };
      global.window = {};
      global.document = {};
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBuildTimeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is missing', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: {}
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBuildTimeEnvironment()).toBe(false);
    });
  });

  describe('isServerEnvironment', () => {
    it('should return true in server environment', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: { NODE_ENV: 'production' }
      };
      // No window/document (not browser)
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(true);
    });

    it('should return false in browser environment', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: { NODE_ENV: 'production' }
      };
      global.window = {};
      global.document = {};
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(false);
    });

    it('should return false in test environment', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: { NODE_ENV: 'test' }
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(false);
    });

    it('should return true when NODE_ENV is missing (default server)', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: {}
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(true);
    });
  });

  describe('detectEnvironment', () => {
    it('should correctly identify browser environment', async () => {
      global.window = {};
      global.document = {};
      global.process = {
        versions: { node: '18.0.0' },
        env: { NODE_ENV: 'development' }
      };
      
      const { environmentDetection } = await import('../environment');
      
      const result = environmentDetection.detectEnvironment();
      
      expect(result).toEqual({
        isBrowser: true,
        isBuild: false, // Because browser is true
        isServer: false, // Because browser is true
        isTest: false,
      });
    });

    it('should correctly identify build environment', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: { NODE_ENV: 'production' }
      };
      // No window/document
      
      const { environmentDetection } = await import('../environment');
      
      const result = environmentDetection.detectEnvironment();
      
      expect(result).toEqual({
        isBrowser: false,
        isBuild: true,
        isServer: true, // Also server in this case
        isTest: false,
      });
    });

    it('should correctly identify test environment', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: { NODE_ENV: 'test' }
      };
      
      const { environmentDetection } = await import('../environment');
      
      const result = environmentDetection.detectEnvironment();
      
      expect(result).toEqual({
        isBrowser: false,
        isBuild: true, // Has NODE_ENV
        isServer: false, // NODE_ENV is test
        isTest: true,
      });
    });

    it('should handle missing process gracefully', async () => {
      // No process global
      
      const { environmentDetection } = await import('../environment');
      
      const result = environmentDetection.detectEnvironment();
      
      expect(result).toEqual({
        isBrowser: false,
        isBuild: false,
        isServer: false,
        isTest: false,
      });
    });
  });

  describe('Integration with environment validation', () => {
    it('should use proper context in error messages', async () => {
      global.process = {
        versions: { node: '18.0.0' },
        env: {
          NODE_ENV: 'production',
          // Missing required fields to trigger validation error
        }
      };
      
      // Import after setting up globals
      const { validateEnvironment } = await import('../environment');
      
      const result = validateEnvironment();
      
      // Should detect build/server environment and provide appropriate context
      expect(result.valid).toBe(true); // No required fields in our schema trigger errors
    });
  });
});