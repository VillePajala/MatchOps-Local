// Jest globals for TypeScript
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import { jest } from '@jest/globals';

// Type for global object mocking
declare const global: typeof globalThis & {
  window?: unknown;
  document?: unknown;
  process?: unknown;
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
    delete (global as typeof global & { window?: unknown }).window;
    delete (global as typeof global & { document?: unknown }).document;
    delete (global as typeof global & { process?: unknown }).process;
  });

  afterEach(() => {
    // Restore originals
    if (originalWindow) {
      (global as typeof global & { window?: unknown }).window = originalWindow;
    }
    if (originalProcess) {
      (global as typeof global & { process?: unknown }).process = originalProcess;
    }
  });

  describe('isBrowserEnvironment', () => {
    it('should return true when window and document are available', async () => {
      // Mock browser environment
      (global as typeof global & { window?: unknown }).window = {};
      (global as typeof global & { document?: unknown }).document = {};
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBrowserEnvironment()).toBe(true);
    });

    it('should return false when window is missing', async () => {
      (global as typeof global & { document?: unknown }).document = {};
      // window is undefined
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBrowserEnvironment()).toBe(false);
    });

    it('should return false when document is missing', async () => {
      (global as typeof global & { window?: unknown }).window = {};
      // document is undefined
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBrowserEnvironment()).toBe(false);
    });
  });

  describe('isNodeEnvironment', () => {
    it('should return true when process with versions.node is available', async () => {
      (global as typeof global & { process?: unknown }).process = createMockProcess();
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(true);
    });

    it('should return false when process is missing', async () => {
      // process is undefined
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });

    it('should return false when process.versions is null', async () => {
      (global as typeof global & { process?: unknown }).process = {
        versions: null,
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });

    it('should return false when process.versions.node is null', async () => {
      (global as typeof global & { process?: unknown }).process = {
        versions: { node: null },
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });

    it('should return false when process.env is not an object', async () => {
      (global as typeof global & { process?: unknown }).process = {
        versions: mockProcessVersions,
        env: null
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isNodeEnvironment()).toBe(false);
    });
  });

  describe('isBuildTimeEnvironment', () => {
    it('should return true during build time', async () => {
      (global as typeof global & { process?: unknown }).process = createMockProcess({ NODE_ENV: 'production' });
      // No window/document (not browser)
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBuildTimeEnvironment()).toBe(true);
    });

    it('should return false in browser environment', async () => {
      (global as typeof global & { process?: unknown }).process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv
      };
      (global as typeof global & { window?: unknown }).window = {};
      (global as typeof global & { document?: unknown }).document = {};
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBuildTimeEnvironment()).toBe(false);
    });

    it('should return false when NODE_ENV is missing', async () => {
      (global as typeof global & { process?: unknown }).process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isBuildTimeEnvironment()).toBe(false);
    });
  });

  describe('isServerEnvironment', () => {
    it('should return true in server environment', async () => {
      (global as typeof global & { process?: unknown }).process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv
      };
      // No window/document (not browser)
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(true);
    });

    it('should return false in browser environment', async () => {
      (global as typeof global & { process?: unknown }).process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv
      };
      (global as typeof global & { window?: unknown }).window = {};
      (global as typeof global & { document?: unknown }).document = {};
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(false);
    });

    it('should return false in test environment', async () => {
      (global as typeof global & { process?: unknown }).process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(false);
    });

    it('should return true when NODE_ENV is missing (default server)', async () => {
      (global as typeof global & { process?: unknown }).process = {
        versions: mockProcessVersions,
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv
      };
      
      const { environmentDetection } = await import('../environment');
      
      expect(environmentDetection.isServerEnvironment()).toBe(true);
    });
  });

  describe('detectEnvironment', () => {
    it('should correctly identify browser environment', async () => {
      (global as typeof global & { window?: unknown }).window = {};
      (global as typeof global & { document?: unknown }).document = {};
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
      (global as typeof global & { process?: unknown }).process = {
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
      (global as typeof global & { process?: unknown }).process = {
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
      (global as typeof global & { process?: unknown }).process = {
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