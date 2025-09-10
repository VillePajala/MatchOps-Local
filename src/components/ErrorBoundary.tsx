import React, { Component, ReactNode } from 'react';
import { HiExclamationTriangle } from 'react-icons/hi2';
import logger from '@/utils/logger';
import ErrorFeedback from './ErrorFeedback';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showErrorDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details
    logger.error('ErrorBoundary caught an error', error, {
      component: 'ErrorBoundary',
      section: 'app-level',
    }, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
      timestamp: new Date().toISOString(),
    });
    
    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Dynamically import and send error to Sentry with context
    this.sendErrorToSentry(error, errorInfo);

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private async sendErrorToSentry(error: Error, errorInfo: React.ErrorInfo) {
    try {
      const { captureException, setContext } = await import('@/lib/sentry');
      
      setContext('errorBoundary', {
        componentStack: errorInfo.componentStack,
        errorBoundary: true,
      });
      
      captureException(error, {
        errorInfo,
        componentStack: errorInfo.componentStack,
      });
    } catch (sentryError) {
      console.error('Failed to send error to Sentry:', sentryError);
    }
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error state when children change (e.g., route change)
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
      });
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6 bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center mb-4">
            <HiExclamationTriangle 
              className="w-8 h-8 text-amber-400 mr-3" 
              aria-hidden="true"
            />
            <h3 className="text-xl font-semibold text-slate-200">
              Something went wrong
            </h3>
          </div>
          
          <p className="text-slate-400 text-center mb-4 max-w-md">
            An unexpected error occurred. This has been logged and will be investigated.
          </p>

          <div className="flex gap-3 mb-4">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={this.handleRefresh}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-md font-medium transition-colors"
            >
              Refresh Page
            </button>
          </div>

          {/* Error Feedback */}
          <div className="flex justify-center">
            <ErrorFeedback error={this.state.error} />
          </div>

          {/* Error Details (Development only) */}
          {(this.props.showErrorDetails || process.env.NODE_ENV === 'development') && this.state.error && (
            <details className="mt-6 w-full">
              <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-300">
                Show error details (dev only)
              </summary>
              <div className="mt-2 p-3 bg-slate-900 rounded text-xs text-slate-300 overflow-auto">
                <div className="mb-2">
                  <strong>Error:</strong> {this.state.error.message}
                </div>
                {this.state.error.stack && (
                  <div className="mb-2">
                    <strong>Stack:</strong>
                    <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
                  </div>
                )}
                {this.state.errorInfo?.componentStack && (
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

    // If no error, render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;