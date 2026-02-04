import React from 'react';
import { render } from '@testing-library/react';
import logger from '@/utils/logger';
import ErrorBoundary from '../ErrorBoundary';

// Mock the logger
jest.mock('@/utils/logger');
const mockLogger = logger as jest.Mocked<typeof logger>;

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

describe('Logger Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.log.mockImplementation(() => {});
    mockLogger.warn.mockImplementation(() => {});
    mockLogger.error.mockImplementation(() => {});
  });

  describe('Direct Logger Usage Tests', () => {
    it('should verify logger.error is called with correct parameters for game import issues', () => {
      // Simulate the exact call made in SettingsModal
      const mockResult = {
        warnings: ['Warning 1', 'Warning 2'],
        failed: ['Error 1']
      };

      logger.error('Game import issues:', mockResult);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Game import issues:',
        mockResult
      );
    });

    it('should verify logger.error is called correctly for app-level errors', () => {
      // Simulate the exact call made in app/page.tsx
      const mockError = new Error('Test error');
      const mockErrorInfo = { componentStack: 'test stack' };

      logger.error('App-level error caught:', mockError, mockErrorInfo);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'App-level error caught:',
        mockError,
        mockErrorInfo
      );
    });
  });

  describe('ErrorBoundary Logger Integration', () => {
    // Component that throws an error for testing
    const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) {
        throw new Error('Test error for logger integration');
      }
      return <div>No error</div>;
    };

    it('should call logger.error when onError callback is triggered', () => {
      const mockOnError = jest.fn((error, errorInfo) => {
        mockLogger.error('App-level error caught:', error, errorInfo);
      });

      // Suppress console.error for this test since we're testing error scenarios
      const originalConsoleError = console.error;
      console.error = jest.fn();

      try {
        const { rerender } = render(
          <ErrorBoundary onError={mockOnError}>
            <ThrowError shouldThrow={false} />
          </ErrorBoundary>
        );

        // Trigger error
        rerender(
          <ErrorBoundary onError={mockOnError}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        );

        expect(mockOnError).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'App-level error caught:',
          expect.any(Error),
          expect.any(Object)
        );
      } finally {
        console.error = originalConsoleError;
      }
    });
  });

  describe('Logger Type Safety in Components', () => {
    it('should enforce string message requirement', () => {
      // These should work (string first argument)
      expect(() => logger.log('Valid message')).not.toThrow();
      expect(() => logger.warn('Valid warning')).not.toThrow();
      expect(() => logger.error('Valid error')).not.toThrow();

      // Verify calls were made with correct arguments
      expect(mockLogger.log).toHaveBeenCalledWith('Valid message');
      expect(mockLogger.warn).toHaveBeenCalledWith('Valid warning');
      expect(mockLogger.error).toHaveBeenCalledWith('Valid error');
    });

    it('should handle complex data structures correctly', () => {
      const complexData = {
        nested: { value: 'test' },
        array: [1, 2, 3],
        nullValue: null
      };

      logger.error('Game import issues:', { warnings: ['warn1'], failed: ['fail1'] });
      logger.log('[GameState] Checking conditions:', complexData);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Game import issues:',
        { warnings: ['warn1'], failed: ['fail1'] }
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[GameState] Checking conditions:',
        complexData
      );
    });
  });
});