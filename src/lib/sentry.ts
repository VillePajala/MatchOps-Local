import * as Sentry from "@sentry/nextjs";
import { config } from '@/config/environment';

/**
 * Initialize Sentry for error tracking and performance monitoring
 * Only activates in production environment or when DSN is provided
 */
export function initSentry() {
  const sentryConfig = config.monitoring.sentry;
  
  // Only initialize Sentry if enabled and DSN is provided
  const shouldInitialize = sentryConfig.enabled && 
    (config.isProduction || sentryConfig.forceEnable);
  
  if (!shouldInitialize) {
    console.log('Sentry disabled for', sentryConfig.environment, 'environment');
    return;
  }

  Sentry.init({
    dsn: sentryConfig.dsn,
    environment: sentryConfig.environment,
    release: sentryConfig.release || '1.0.0',
    
    // Performance Monitoring
    tracesSampleRate: config.isProduction ? 0.1 : 1.0, // 10% in prod, 100% in dev
    
    // Error Sampling
    sampleRate: 1.0, // Capture 100% of errors
    
    // User Privacy Settings
    beforeSend(event) {
      // Don't send events in development unless explicitly enabled
      if (config.isDevelopment && !sentryConfig.forceEnable) {
        return null;
      }
      
      // Filter out local development URLs from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.filter(breadcrumb => {
          if (breadcrumb.category === 'navigation') {
            const url = breadcrumb.data?.to || breadcrumb.data?.from;
            return url && !url.includes('localhost') && !url.includes('127.0.0.1');
          }
          return true;
        });
      }
      
      return event;
    },
    
    // Privacy and Security
    attachStacktrace: true,
    
    // Custom Tags
    initialScope: {
      tags: {
        component: 'matchops-local',
        version: sentryConfig.release || '1.0.0',
        branch: config.app.branch,
        environment: sentryConfig.environment,
      },
    },
  });

  // Set user context (anonymous)
  Sentry.setUser({
    id: 'anonymous',
    // No personal information - this is a local-first app
  });

  console.log('Sentry initialized for', sentryConfig.environment, 'environment');
}

/**
 * Capture an exception with additional context
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message with additional context
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, unknown>) {
  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Set additional context for error reporting
 */
export function setContext(key: string, context: Record<string, unknown>) {
  Sentry.setContext(key, context);
}

/**
 * Set user feedback context
 */
export function setUser(user: { id: string; [key: string]: unknown }) {
  Sentry.setUser(user);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(message: string, category?: string, data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    message,
    category: category || 'custom',
    data,
    level: 'info',
  });
}

export default Sentry;