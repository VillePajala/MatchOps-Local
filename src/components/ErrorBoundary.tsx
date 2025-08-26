'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';
import logger from '@/utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error
    logger.error('[ErrorBoundary] Caught error:', error);
    logger.error('[ErrorBoundary] Error info:', errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6 bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center mb-4">
            <HiOutlineExclamationTriangle className="w-8 h-8 text-amber-400 mr-3" />
            <h3 className="text-xl font-semibold text-slate-200">Something went wrong</h3>
          </div>
          
          <p className="text-slate-400 text-center mb-4 max-w-md">
            An unexpected error occurred. This has been logged and will be investigated.
          </p>
          
          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors"
            >
              Try Again
            </button>
            
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-md font-medium transition-colors"
            >
              Refresh Page
            </button>
          </div>

          {/* Development-only error details */}
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-6 w-full">
              <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-300">
                Show error details (dev only)
              </summary>
              <div className="mt-2 p-3 bg-slate-900 rounded text-xs text-slate-300 overflow-auto">
                <div className="mb-2">
                  <strong>Error:</strong> {this.state.error?.message}
                </div>
                <div className="mb-2">
                  <strong>Stack:</strong>
                  <pre className="whitespace-pre-wrap">{this.state.error?.stack}</pre>
                </div>
                {this.state.errorInfo && (
                  <div>
                    <strong>Component Stack:</strong>
                    <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easy wrapping
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) => {
  return (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );
};

// Hook for error boundary in functional components (requires react-error-boundary)
export const useErrorHandler = () => {
  return (error: Error, errorInfo?: ErrorInfo) => {
    logger.error('[ErrorHandler] Manual error:', error);
    if (errorInfo) {
      logger.error('[ErrorHandler] Error info:', errorInfo);
    }
    
    // Re-throw to trigger error boundary
    throw error;
  };
};

export default ErrorBoundary;