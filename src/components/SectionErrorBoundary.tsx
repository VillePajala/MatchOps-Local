'use client';

import React, { Component, ReactNode } from 'react';
import { HiExclamationCircle } from 'react-icons/hi2';
import logger from '@/utils/logger';

interface Props {
  children: ReactNode;
  sectionName: string;
  fallback?: ReactNode;
  showRetry?: boolean;
  onError?: (error: Error, errorInfo: React.ErrorInfo, sectionName: string) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

/**
 * Granular error boundary for specific component sections
 * Provides isolated error handling without breaking the entire app
 */
class SectionErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { sectionName, onError } = this.props;
    const { retryCount } = this.state;
    
    // Enhanced structured logging with severity based on retry count
    const errorId = `section-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Use critical logging for repeated failures
    if (retryCount >= 2) {
      logger.critical(
        'Section component critical failure (multiple retries)',
        error,
        {
          component: 'SectionErrorBoundary',
          section: sectionName,
          errorId,
          stack: errorInfo.componentStack || 'No stack trace available',
          retryCount,
        }
      );
    } else {
      logger.error(
        'Section component error occurred',
        error,
        {
          component: 'SectionErrorBoundary',
          section: sectionName,
          errorId,
          stack: errorInfo.componentStack || 'No stack trace available',
          retryCount,
        },
        {
          errorInfo,
          isRepeatedFailure: retryCount > 0,
          maxRetriesReached: retryCount >= this.maxRetries,
          timestamp: new Date().toISOString(),
        }
      );
    }
    
    // Send to Sentry with section context
    this.sendErrorToSentry(error, errorInfo, sectionName);
    
    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo, sectionName);
    }
  }

  private async sendErrorToSentry(error: Error, errorInfo: React.ErrorInfo, sectionName: string) {
    try {
      const { captureException, setContext } = await import('@/lib/sentry');
      
      setContext('sectionError', {
        sectionName,
        componentStack: errorInfo.componentStack,
        retryCount: this.state.retryCount,
      });
      
      captureException(error, {
        tags: {
          section: sectionName,
          errorBoundary: 'section',
        },
        extra: {
          errorInfo,
          retryCount: this.state.retryCount,
        },
      });
    } catch (sentryError) {
      console.error('Failed to send section error to Sentry:', sentryError);
    }
  }

  handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        retryCount: prevState.retryCount + 1,
      }));
    }
  };

  render() {
    const { children, sectionName, fallback, showRetry = true } = this.props;
    const { hasError, error, retryCount } = this.state;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default section error UI
      return (
        <div className="flex flex-col items-center justify-center p-4 bg-slate-800/50 rounded-lg border border-slate-600/50">
          <div className="flex items-center mb-3">
            <HiExclamationCircle className="w-5 h-5 text-amber-400 mr-2" />
            <h4 className="text-sm font-medium text-slate-300">
              {sectionName} unavailable
            </h4>
          </div>
          
          <p className="text-xs text-slate-400 text-center mb-3 max-w-xs">
            This section encountered an error and has been temporarily disabled.
          </p>

          {showRetry && retryCount < this.maxRetries && (
            <button
              onClick={this.handleRetry}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded font-medium transition-colors"
            >
              Try Again {retryCount > 0 && `(${retryCount}/${this.maxRetries})`}
            </button>
          )}

          {retryCount >= this.maxRetries && (
            <p className="text-xs text-slate-500 mt-2">
              Please refresh the page if the issue persists
            </p>
          )}

          {process.env.NODE_ENV === 'development' && error && (
            <details className="mt-3 w-full">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-400">
                Error details (dev)
              </summary>
              <div className="mt-1 p-2 bg-slate-900 rounded text-xs text-slate-400 overflow-auto max-h-32">
                <strong>Error:</strong> {error.message}
                {error.stack && (
                  <div className="mt-1">
                    <strong>Stack:</strong>
                    <pre className="whitespace-pre-wrap text-xs">{error.stack}</pre>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      );
    }

    return children;
  }
}

export default SectionErrorBoundary;