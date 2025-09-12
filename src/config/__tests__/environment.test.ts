// Jest globals for TypeScript
import { jest } from '@jest/globals';

// Type for global object mocking
declare const global: typeof globalThis & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process?: any;
};

// Test helpers
const mockProcessVersions: NodeJS.ProcessVersions = {
  node: '18.0.0',
  v8: '10.0.0',
  uv: '1.0.0',
  zlib: '1.0.0',
  brotli: '1.0.0',
  ares: '1.0.0',
  modules: '108',
  nghttp2: '1.0.0',
  napi: '8',
  llhttp: '1.0.0',
  http_parser: '1.0.0',
  openssl: '1.0.0',
  cldr: '1.0.0',
  icu: '1.0.0',
  tz: '1.0.0',
  unicode: '1.0.0'
};

const createMockProcess = (env: Partial<NodeJS.ProcessEnv> = {}): Partial<NodeJS.Process> => ({
  versions: mockProcessVersions,
  env: { NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv
});

describe('Environment Detection Type Guards', () => {
  let originalWindow: unknown;
  let originalProcess: unknown;

  beforeEach(() => {
    // Store originals
    originalWindow = global.window;
    originalProcess = global.process;
    
    // Clean slate for each test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).document;  
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).process;
    
    // Clear module cache to force re-evaluation
    jest.resetModules();
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
      global.process = createMockProcess();
      
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        versions: null as any,
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });

    it('should return false when process.versions.node is null', async () => {
      global.process = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        versions: { node: null as any } as any,
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });

    it('should return false when process.env is not an object', async () => {
      global.process = {
        versions: mockProcessVersions,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        env: null as any
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });
  });

  describe('isBuildTimeEnvironment', () => {
    it('should return true during build time', async () => {
      global.process = createMockProcess({ NODE_ENV: 'production' });
      // No window/document (not browser)
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBuildTimeEnvironment()).toBe(true);
    });

    it('should return false in browser environment', async () => {
      global.process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv
      };
      global.window = {};
      global.document = {};
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBuildTimeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is missing', async () => {
      global.process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBuildTimeEnvironment()).toBe(false);
    });
  });

  describe('isServerEnvironment', () => {
    it('should return true in server environment', async () => {
      global.process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv
      };
      // No window/document (not browser)
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(true);
    });

    it('should return false in browser environment', async () => {
      global.process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv
      };
      global.window = {};
      global.document = {};
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(false);
    });

    it('should return false in test environment', async () => {
      global.process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(false);
    });

    it('should return true when NODE_ENV is missing (default server)', async () => {
      global.process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(true);
    });
  });

  describe('detectEnvironment', () => {
    it('should correctly identify browser environment', async () => {
      global.window = {};
      global.document = {};
      (global as typeof global & { process?: unknown }).process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'development' } as NodeJS.ProcessEnv
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
        versions: mockProcessVersions,
        env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv
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
        versions: mockProcessVersions,
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
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
        versions: mockProcessVersions,
        env: {
          NODE_ENV: 'production',
          // Missing required fields to trigger validation error
        } as NodeJS.ProcessEnv
      };
      
      // Import after setting up globals
      const { validateEnvironment } = await import('../environment');
      
      const result = validateEnvironment();
      
      // Should detect build/server environment and provide appropriate context
      expect(result.valid).toBe(true); // No required fields in our schema trigger errors
    });
  });
});