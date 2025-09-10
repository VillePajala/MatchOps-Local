import { jest } from '@jest/globals';
import { render } from '@testing-library/react';
import React from 'react';

// Mock Sentry before imports
const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();
const mockSetContext = jest.fn();

jest.unstable_mockModule('@/lib/sentry', () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  setContext: mockSetContext,
}));

// Import after mocking
let logger: any;

describe('Sentry Error Reporting Integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Import logger dynamically
    const loggerModule = await import('@/utils/logger');
    logger = loggerModule.default;
    
    // Mock production environment for Sentry integration
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
  });

  afterEach(() => {
    // Reset to test environment
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      configurable: true,
    });
  });

  describe('Logger Integration', () => {
    it('should send error logs to Sentry in production', async () => {
      const testError = new Error('Test error for Sentry');
      const context = {
        component: 'TestComponent',
        section: 'testSection',
        errorId: 'test-error-123',
      };
      const metadata = {
        userId: 'user123',
        timestamp: new Date().toISOString(),
      };

      // Call logger.error which should trigger Sentry in production
      logger.error('Test error message', testError as Error, {
        component: 'TestComponent',
        section: 'testSection'
      });

      // Wait for async Sentry call
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSetContext).toHaveBeenCalledWith('logContext', context);
      expect(mockCaptureException).toHaveBeenCalledWith(testError, {
        level: 'error',
        extra: {
          message: 'Test error message',
          metadata: metadata,
        },
        tags: {
          component: 'TestComponent',
          section: 'testSection',
        },
      });
    });

    it('should send critical logs to Sentry with fatal level', async () => {
      const criticalError = new Error('Critical system failure');
      const context = {
        component: 'SystemCore',
        section: 'initialization',
      };

      logger.critical('Critical system error', criticalError as Error, {
        component: 'SystemCore',
        section: 'initialization'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCaptureException).toHaveBeenCalledWith(criticalError, {
        level: 'fatal',
        extra: {
          message: 'Critical system error',
          metadata: undefined,
        },
        tags: {
          component: 'SystemCore',
          section: 'initialization',
        },
      });
    });

    it('should send warning messages to Sentry', async () => {
      const context = {
        component: 'UserInterface',
        section: 'validation',
      };

      logger.warn('User input validation warning', {
        component: 'UserInterface',
        section: 'validation'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'User input validation warning',
        'warning'
      );
    });

    it('should not send debug/info logs to Sentry in production', async () => {
      logger.debug('Debug message', { component: 'Test', section: 'debug-test' });
      logger.info('Info message', { component: 'Test', section: 'info-test' });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCaptureMessage).not.toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('should handle Sentry failures gracefully', async () => {
      // Mock Sentry failure
      mockCaptureException.mockRejectedValueOnce(new Error('Sentry is down') as never);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const testError = new Error('Test error');
      logger.error('Error when Sentry fails', testError as Error, {
        component: 'Test',
        section: 'sentry-failure-handling'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to send to Sentry:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Error Boundary Integration', () => {
    it('should report section error boundary failures to Sentry', async () => {
      // Create a component that throws an error
      const ThrowError = () => {
        throw new Error('Component error for testing');
      };

      const SectionErrorBoundary = (await import('@/components/SectionErrorBoundary')).default;
      
      // Suppress console.error for this test
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <SectionErrorBoundary sectionName="TestSection">
          <ThrowError />
        </SectionErrorBoundary>
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockSetContext).toHaveBeenCalledWith('sectionError', {
        sectionName: 'TestSection',
        componentStack: expect.any(String),
        retryCount: 0,
      });

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: {
            section: 'TestSection',
            errorBoundary: 'section',
          },
          extra: expect.objectContaining({
            retryCount: 0,
          }),
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should escalate repeated section failures to critical level', async () => {
      const ThrowError = () => {
        throw new Error('Repeated component error');
      };

      const SectionErrorBoundary = (await import('@/components/SectionErrorBoundary')).default;
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Create error boundary with high retry count to simulate repeated failures
      const ErrorBoundaryWrapper = () => (
        <SectionErrorBoundary sectionName="FailingSection">
          <ThrowError />
        </SectionErrorBoundary>
      );

      render(<ErrorBoundaryWrapper />);

      // Simulate retry attempts by re-rendering multiple times
      for (let i = 0; i < 3; i++) {
        render(<ErrorBoundaryWrapper />);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Verify that critical level logging was triggered
      const criticalCalls = mockCaptureException.mock.calls.filter(call => 
        (call[1] as any)?.level === 'fatal'
      );
      
      expect(criticalCalls.length).toBeGreaterThan(0);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Error Feedback Integration', () => {
    it('should send user error feedback to Sentry', async () => {
      const { default: ErrorFeedback } = await import('@/components/ErrorFeedback');
      const { fireEvent, getByText, getByPlaceholderText } = await import('@testing-library/react');

      const testError = new Error('User-reported error');

      const { container } = render(<ErrorFeedback error={testError} />);

      // Open feedback modal
      const feedbackButton = getByText(container, 'Send Feedback');
      fireEvent.click(feedbackButton);

      // Fill out feedback form
      const textArea = getByPlaceholderText(container, 'Describe what you were doing when the error occurred...');
      const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;

      fireEvent.change(textArea, { target: { value: 'I was trying to save a game when this happened' } });
      fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

      // Submit feedback
      const submitButton = getByText(container, 'Send Feedback');
      fireEvent.click(submitButton);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'User Error Feedback',
        'info',
        {
          feedback: 'I was trying to save a game when this happened',
          email: 'user@example.com',
          errorMessage: 'User-reported error',
          errorStack: expect.any(String),
          timestamp: expect.any(String),
        }
      );
    });

    it('should handle anonymous feedback without email', async () => {
      const { default: ErrorFeedback } = await import('@/components/ErrorFeedback');
      const { fireEvent, getByText, getByPlaceholderText } = await import('@testing-library/react');

      const { container } = render(<ErrorFeedback error={null} />);

      fireEvent.click(getByText(container, 'Send Feedback'));

      const textArea = getByPlaceholderText(container, 'Describe what you were doing when the error occurred...');
      fireEvent.change(textArea, { target: { value: 'Anonymous feedback' } });

      fireEvent.click(getByText(container, 'Send Feedback'));

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'User Error Feedback',
        'info',
        expect.objectContaining({
          feedback: 'Anonymous feedback',
          email: 'anonymous',
        })
      );
    });
  });

  describe('Environment-Specific Behavior', () => {
    it('should only send to Sentry in production environment', async () => {
      // Reset to development environment
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        configurable: true,
      });

      const testError = new Error('Development error');
      logger.error('Development error message', testError as Error, {
        component: 'Test',
        section: 'development-error'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('should respect Sentry force enable flag', async () => {
      // Set force enable flag
      Object.defineProperty(process.env, 'NEXT_PUBLIC_SENTRY_FORCE_ENABLE', {
        value: 'true',
        configurable: true,
      });

      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        configurable: true,
      });

      const testError = new Error('Forced Sentry error');
      logger.error('Force enabled error', testError as Error, {
        component: 'Test',
        section: 'force-enabled-error'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should send to Sentry even in development when force enabled
      expect(mockCaptureException).toHaveBeenCalled();

      // Cleanup
      delete (process.env as NodeJS.ProcessEnv).NEXT_PUBLIC_SENTRY_FORCE_ENABLE;
    });
  });

  describe('Sentry Context Management', () => {
    it('should set appropriate context for different error types', async () => {
      const gameError = new Error('Game save failed');
      
      logger.error('Game save error', gameError as Error, {
        component: 'GameManager',
        section: 'save'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSetContext).toHaveBeenCalledWith('logContext', {
        component: 'GameManager',
        section: 'save',
        userId: 'player123',
        sessionId: 'session456',
      });

      expect(mockCaptureException).toHaveBeenCalledWith(
        gameError,
        expect.objectContaining({
          tags: {
            component: 'GameManager',
            section: 'save',
          },
        })
      );
    });

    it('should handle missing context gracefully', async () => {
      const simpleError = new Error('Simple error');
      logger.error('Error without context', simpleError as Error, {
        component: 'Test',
        section: 'simple-error-test'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCaptureException).toHaveBeenCalledWith(
        simpleError,
        expect.objectContaining({
          level: 'error',
          extra: {
            message: 'Error without context',
            metadata: undefined,
          },
          tags: {
            component: undefined,
            section: undefined,
          },
        })
      );
    });
  });
});