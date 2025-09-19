import logger from './logger';

// Mock console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error
};

// Store original NODE_ENV
const originalNodeEnv = process.env.NODE_ENV;

describe('Logger Utility', () => {
  beforeEach(() => {
    // Mock console methods
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    // Restore original NODE_ENV
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
      configurable: true
    });
    jest.clearAllMocks();
  });

  describe('Development Environment', () => {
    beforeEach(() => {
      // Mock development environment
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true
      });
    });

    it('should log messages in development environment', () => {
      logger.log('Test message', { data: 'test' });

      expect(console.log).toHaveBeenCalledWith('Test message', { data: 'test' });
    });

    it('should log warnings in development environment', () => {
      logger.warn('Warning message', { warning: 'test' });

      expect(console.warn).toHaveBeenCalledWith('Warning message', { warning: 'test' });
    });

    it('should always log errors regardless of environment', () => {
      logger.error('Error message', { error: 'test' });

      expect(console.error).toHaveBeenCalledWith('Error message', { error: 'test' });
    });

    it('should handle multiple data arguments', () => {
      logger.log('Message', 'arg1', 'arg2', { obj: 'data' });

      expect(console.log).toHaveBeenCalledWith('Message', 'arg1', 'arg2', { obj: 'data' });
    });
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      // Mock production environment
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true
      });
    });

    it('should not log messages in production environment', () => {
      logger.log('Test message', { data: 'test' });

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should not log warnings in production environment', () => {
      logger.warn('Warning message', { warning: 'test' });

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should still log errors in production environment', () => {
      logger.error('Error message', { error: 'test' });

      expect(console.error).toHaveBeenCalledWith('Error message', { error: 'test' });
    });
  });

  describe('Type Safety', () => {
    beforeEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true
      });
    });

    it('should require string message as first argument for log', () => {
      logger.log('Valid message');
      expect(console.log).toHaveBeenCalledWith('Valid message');
    });

    it('should require string message as first argument for warn', () => {
      logger.warn('Valid warning');
      expect(console.warn).toHaveBeenCalledWith('Valid warning');
    });

    it('should require string message as first argument for error', () => {
      logger.error('Valid error');
      expect(console.error).toHaveBeenCalledWith('Valid error');
    });

    it('should handle complex data objects', () => {
      const complexData = {
        nested: { obj: 'value' },
        array: [1, 2, 3],
        nullValue: null,
        undefinedValue: undefined
      };

      logger.log('Complex data', complexData);
      expect(console.log).toHaveBeenCalledWith('Complex data', complexData);
    });
  });
});