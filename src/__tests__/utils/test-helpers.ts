import { jest } from '@jest/globals';

/**
 * Test utilities and mocks for security and integration testing
 */

// Environment variable mocking utilities
export class EnvironmentMocker {
  private originalEnv: NodeJS.ProcessEnv;

  constructor() {
    this.originalEnv = { ...process.env };
  }

  setEnv(key: string, value: string | undefined) {
    if (value === undefined) {
      delete (process.env as any)[key];
    } else {
      (process.env as any)[key] = value;
    }
  }

  setProductionEnv() {
    this.setEnv('NODE_ENV', 'production');
    this.setEnv('VERCEL_ENV', 'production');
  }

  setDevelopmentEnv() {
    this.setEnv('NODE_ENV', 'development');
    this.setEnv('VERCEL_ENV', undefined);
  }

  setTestEnv() {
    this.setEnv('NODE_ENV', 'test');
    this.setEnv('VERCEL_ENV', undefined);
  }

  setSentryEnv(dsn?: string, authToken?: string, forceEnable?: boolean) {
    this.setEnv('NEXT_PUBLIC_SENTRY_DSN', dsn);
    this.setEnv('SENTRY_AUTH_TOKEN', authToken);
    this.setEnv('NEXT_PUBLIC_SENTRY_FORCE_ENABLE', forceEnable ? 'true' : undefined);
  }

  setDangerousEnv() {
    // Simulate accidentally exposed secrets
    this.setEnv('NEXT_PUBLIC_SECRET_KEY', 'sk-abc123secretkey456def');
    this.setEnv('NEXT_PUBLIC_AWS_KEY', 'AKIAIOSFODNN7EXAMPLE');
    this.setEnv('NEXT_PUBLIC_GITHUB_TOKEN', 'ghp_abcdefghijklmnopqrstuvwxyz123456789012');
  }

  restore() {
    // Clear current env
    Object.keys(process.env).forEach(key => {
      delete (process.env as any)[key];
    });
    
    // Restore original
    Object.assign(process.env, this.originalEnv);
  }
}

// Sentry mocking utilities
export class SentryMocker {
  public captureException = jest.fn();
  public captureMessage = jest.fn();
  public setContext = jest.fn();
  public setTag = jest.fn();
  public setLevel = jest.fn();

  constructor() {
    this.reset();
  }

  reset() {
    this.captureException.mockClear();
    this.captureMessage.mockClear();
    this.setContext.mockClear();
    this.setTag.mockClear();
    this.setLevel.mockClear();
  }

  mockSentryFailure() {
    this.captureException.mockRejectedValue(new Error('Sentry service unavailable'));
    this.captureMessage.mockRejectedValue(new Error('Sentry service unavailable'));
  }

  getLastException() {
    const calls = this.captureException.mock.calls;
    return calls.length > 0 ? calls[calls.length - 1] : null;
  }

  getLastMessage() {
    const calls = this.captureMessage.mock.calls;
    return calls.length > 0 ? calls[calls.length - 1] : null;
  }

  getAllCalls() {
    return {
      exceptions: this.captureException.mock.calls,
      messages: this.captureMessage.mock.calls,
      contexts: this.setContext.mock.calls,
    };
  }
}

// File system mocking utilities
export class FileSystemMocker {
  private mockFs: any;
  private mockFiles: Map<string, string | Buffer> = new Map();
  
  constructor() {
    this.mockFs = {
      existsSync: jest.fn(),
      readFileSync: jest.fn(),
      writeFileSync: jest.fn(),
      statSync: jest.fn(),
      readdirSync: jest.fn(),
    };
  }

  addFile(path: string, content: string | Buffer, size?: number) {
    this.mockFiles.set(path, content);
    
    this.mockFs.existsSync.mockImplementation((filePath: string) => {
      return this.mockFiles.has(filePath);
    });
    
    this.mockFs.readFileSync.mockImplementation((filePath: string) => {
      const content = this.mockFiles.get(filePath);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
      }
      return content;
    });
    
    this.mockFs.statSync.mockImplementation((filePath: string) => {
      if (!this.mockFiles.has(filePath)) {
        throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
      }
      const content = this.mockFiles.get(filePath);
      return {
        size: size || (typeof content === 'string' ? content.length : content?.length || 0),
        isDirectory: () => false,
        isFile: () => true,
      };
    });
  }

  addDirectory(path: string, files: string[]) {
    this.mockFs.existsSync.mockImplementation((filePath: string) => {
      return filePath === path || this.mockFiles.has(filePath);
    });
    
    this.mockFs.readdirSync.mockImplementation((dirPath: string) => {
      if (dirPath === path) {
        return files;
      }
      return [];
    });
    
    this.mockFs.statSync.mockImplementation((filePath: string) => {
      if (filePath === path) {
        return {
          isDirectory: () => true,
          isFile: () => false,
        };
      }
      // Handle files in directory
      const content = this.mockFiles.get(filePath);
      if (content !== undefined) {
        return {
          size: typeof content === 'string' ? content.length : content.length,
          isDirectory: () => false,
          isFile: () => true,
        };
      }
      throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
    });
  }

  getMocks() {
    return this.mockFs;
  }

  clear() {
    this.mockFiles.clear();
    Object.values(this.mockFs).forEach((fn: any) => fn.mockClear());
  }
}

// Console mocking utilities
export class ConsoleMocker {
  private originalConsole: Console;
  public log = jest.fn();
  public warn = jest.fn();
  public error = jest.fn();
  public info = jest.fn();

  constructor() {
    this.originalConsole = global.console;
  }

  mock() {
    global.console = {
      ...this.originalConsole,
      log: this.log,
      warn: this.warn,
      error: this.error,
      info: this.info,
    };
  }

  restore() {
    global.console = this.originalConsole;
  }

  reset() {
    this.log.mockClear();
    this.warn.mockClear();
    this.error.mockClear();
    this.info.mockClear();
  }

  getLogs() {
    return {
      log: this.log.mock.calls,
      warn: this.warn.mock.calls,
      error: this.error.mock.calls,
      info: this.info.mock.calls,
    };
  }
}

// Performance testing utilities
export class PerformanceTester {
  private marks: Map<string, number> = new Map();

  mark(name: string) {
    this.marks.set(name, performance.now());
  }

  measure(startMark: string, endMark?: string): number {
    const startTime = this.marks.get(startMark);
    const endTime = endMark ? this.marks.get(endMark) : performance.now();
    
    if (startTime === undefined) {
      throw new Error(`Start mark '${startMark}' not found`);
    }
    
    if (endMark && endTime === undefined) {
      throw new Error(`End mark '${endMark}' not found`);
    }
    
    return (endTime as number) - startTime;
  }

  async measureAsync<T>(operation: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const startTime = performance.now();
    const result = await operation();
    const duration = performance.now() - startTime;
    
    return { result, duration };
  }

  expectWithinThreshold(duration: number, threshold: number, operation?: string) {
    const message = operation 
      ? `${operation} took ${duration.toFixed(2)}ms, expected < ${threshold}ms`
      : `Operation took ${duration.toFixed(2)}ms, expected < ${threshold}ms`;
    
    if (duration >= threshold) {
      throw new Error(message);
    }
  }
}

// Bundle size testing utilities
export class BundleAnalyzer {
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  static calculateCompressionRatio(original: number, compressed: number): number {
    return compressed / original;
  }

  static analyzeChunkDistribution(chunks: Array<{ name: string; size: number }>) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    
    return {
      total,
      chunks: chunks.map(chunk => ({
        ...chunk,
        percentage: (chunk.size / total) * 100,
      })),
      largest: chunks.reduce((max, chunk) => chunk.size > max.size ? chunk : max),
      distribution: chunks.reduce((acc, chunk) => {
        const category = this.categorizeChunk(chunk.name);
        acc[category] = (acc[category] || 0) + chunk.size;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  private static categorizeChunk(filename: string): string {
    if (filename.includes('framework')) return 'framework';
    if (filename.includes('vendor')) return 'vendor';
    if (filename.includes('main')) return 'main';
    if (filename.includes('webpack')) return 'runtime';
    if (filename.includes('polyfills')) return 'polyfills';
    return 'app';
  }
}

// Security testing utilities
export class SecurityTester {
  static readonly COMMON_SECRETS = [
    { name: 'OpenAI API Key', pattern: /sk-[a-zA-Z0-9-_]{20,}/ },
    { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
    { name: 'GitHub Token', pattern: /gh[psr]_[a-zA-Z0-9]{36}/ },
    { name: 'Slack Token', pattern: /xox[bpars]-[0-9]+-[0-9]+-[0-9]+-[a-f0-9]+/ },
    { name: 'Stripe Secret', pattern: /sk_live_[a-zA-Z0-9]{24}/ },
    { name: 'JWT Secret', pattern: /jwt[_-]?secret[\s]*[:=][\s]*['"][^'"]{16,}['"]/ },
  ];

  static scanForSecrets(content: string): Array<{ type: string; match: string }> {
    const findings: Array<{ type: string; match: string }> = [];
    
    for (const { name, pattern } of this.COMMON_SECRETS) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          findings.push({ type: name, match });
        });
      }
    }
    
    return findings;
  }

  static validateEnvironmentVariable(key: string, value: string): Array<{ severity: 'error' | 'warning'; message: string }> {
    const issues: Array<{ severity: 'error' | 'warning'; message: string }> = [];
    
    // Check if secret patterns are exposed in client-side variables
    if (key.startsWith('NEXT_PUBLIC_')) {
      const secrets = this.scanForSecrets(value);
      if (secrets.length > 0) {
        secrets.forEach(secret => {
          issues.push({
            severity: 'error',
            message: `${secret.type} exposed in client-side variable ${key}`,
          });
        });
      }
      
      // Check for suspiciously long values
      if (value.length > 50 && !/^https?:\/\//.test(value) && !key.includes('DSN')) {
        issues.push({
          severity: 'warning',
          message: `Suspiciously long value in client-exposed variable ${key}`,
        });
      }
    }
    
    return issues;
  }
}

// Export all utilities
export {
  EnvironmentMocker,
  SentryMocker,
  FileSystemMocker,
  ConsoleMocker,
  PerformanceTester,
  BundleAnalyzer,
  SecurityTester,
};