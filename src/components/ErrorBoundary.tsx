import React, { Component, ReactNode } from 'react';
import { HiExclamationTriangle } from 'react-icons/hi2';
import * as Sentry from '@sentry/nextjs';
import logger from '@/utils/logger';
import i18n from '@/i18n';
import { primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';

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
  private handleVisibilityChange: (() => void) | null = null;
  // Recovery count is instance-based and resets on unmount. This is acceptable because:
  // - Production: ErrorBoundary is at root level, rarely unmounts
  // - Development: Fast Refresh may reset counter, but persistent errors will still
  //   hit the limit within each component lifecycle. If stricter cross-lifecycle
  //   limits are needed, consider sessionStorage persistence.
  private recoveryCount = 0;
  private recoveryResetTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly MAX_RECOVERIES = 3;
  private static readonly RECOVERY_RESET_MS = 30000; // Reset counter after 30s of stability

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  componentDidMount() {
    // Auto-recover from error state when app becomes visible (Android TWA resume fix)
    // Limited to MAX_RECOVERIES to prevent infinite loops from persistent bugs
    this.handleVisibilityChange = () => {
      if (!document.hidden && this.state.hasError) {
        if (this.recoveryCount < ErrorBoundary.MAX_RECOVERIES) {
          this.recoveryCount++;
          logger.log(`[ErrorBoundary] App became visible with error state - auto-recovering (attempt ${this.recoveryCount}/${ErrorBoundary.MAX_RECOVERIES})`);
          this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
          });

          // Reset recovery count after period of stability FOLLOWING successful recovery
          // This is more defensive than resetting after error catch - ensures app is actually stable
          if (this.recoveryResetTimer) {
            clearTimeout(this.recoveryResetTimer);
          }
          this.recoveryResetTimer = setTimeout(() => {
            if (this.recoveryCount > 0) {
              logger.log('[ErrorBoundary] Resetting recovery count after stability period');
              this.recoveryCount = 0;
            }
          }, ErrorBoundary.RECOVERY_RESET_MS);
        } else {
          logger.warn('[ErrorBoundary] Max auto-recovery attempts reached - staying in error state to prevent infinite loop');
        }
      }
    };
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  componentWillUnmount() {
    if (this.handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (this.recoveryResetTimer) {
      clearTimeout(this.recoveryResetTimer);
    }
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
    logger.error('ErrorBoundary caught an error:', error, errorInfo);

    // Report to Sentry for production monitoring (matches global-error.tsx pattern)
    try {
      Sentry.captureException(error, {
        extra: { componentStack: errorInfo.componentStack },
      });
    } catch {
      // Sentry failure must not break error boundary
    }

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Note: Recovery count reset timer is started in handleVisibilityChange
    // AFTER successful recovery, not here. This ensures counter only resets
    // when the app is actually stable, not just because time passed after an error.
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
        <div className="s1-list flex flex-col items-center justify-center min-h-[200px] p-6 font-ui">
          <div className="flex items-center mb-4">
            <HiExclamationTriangle
              className="w-8 h-8 text-action mr-3"
              aria-hidden="true"
            />
            <h3 className="font-display text-2xl font-bold italic text-ink">
              {i18n.t('errors.somethingWentWrong', 'Something went wrong')}
            </h3>
          </div>

          <p className="text-ink-2 text-center mb-4 max-w-md">
            {i18n.t('errors.unexpectedError', 'An unexpected error occurred. This has been logged and will be investigated.')}
          </p>

          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className={primaryButtonStyle}
            >
              {i18n.t('errors.tryAgain', 'Try Again')}
            </button>
            <button
              onClick={this.handleRefresh}
              className={secondaryButtonStyle}
            >
              {i18n.t('errors.refreshPage', 'Refresh Page')}
            </button>
          </div>

          {/* Error Details (Development only) */}
          {(this.props.showErrorDetails || process.env.NODE_ENV === 'development') && this.state.error && (
            <details className="mt-6 w-full">
              <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink-2">
                {i18n.t('errors.showErrorDetails', 'Show error details (dev only)')}
              </summary>
              <div className="mt-2 p-3 bg-carbon rounded-xl text-xs text-ink-2 overflow-auto">
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