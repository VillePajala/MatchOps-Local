/**
 * Enhanced logging system with severity levels and structured format
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export interface LogContext {
  component?: string;
  section?: string;
  userId?: string;
  sessionId?: string;
  errorId?: string;
  stack?: string;
  [key: string]: unknown;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error;
  metadata?: Record<string, unknown>;
}

class Logger {
  private minLevel: LogLevel;
  private isProd: boolean;

  constructor() {
    this.isProd = process.env.NODE_ENV === 'production';
    this.minLevel = this.isProd ? LogLevel.WARN : LogLevel.DEBUG;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private formatLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error,
    metadata?: Record<string, unknown>
  ): StructuredLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error,
      metadata,
    };
  }

  private async sendToPlatforms(entry: StructuredLogEntry): Promise<void> {
    // Console logging (always for errors, conditionally for others)
    if (entry.level >= LogLevel.ERROR || !this.isProd) {
      const logMethod = this.getConsoleMethod(entry.level);
      const formattedMessage = this.formatConsoleMessage(entry);
      
      if (entry.error) {
        logMethod(formattedMessage, entry.error);
      } else {
        logMethod(formattedMessage);
      }
    }

    // Sentry logging for warnings and above in production
    if (entry.level >= LogLevel.WARN && this.isProd) {
      try {
        const { captureMessage, captureException, setContext } = await import('@/lib/sentry');
        
        if (entry.context) {
          setContext('logContext', entry.context);
        }
        
        if (entry.error) {
          captureException(entry.error, {
            level: this.getSentryLevel(entry.level),
            extra: {
              message: entry.message,
              metadata: entry.metadata,
            },
            tags: {
              component: entry.context?.component,
              section: entry.context?.section,
            },
          });
        } else {
          captureMessage(entry.message, this.getSentryLevel(entry.level));
        }
      } catch (sentryError) {
        // Fallback to console if Sentry fails
        console.error('Failed to send to Sentry:', sentryError);
      }
    }
  }

  private getConsoleMethod(level: LogLevel): typeof console.log {
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        return console.log;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        return console.error;
    }
  }

  private getSentryLevel(level: LogLevel): 'debug' | 'info' | 'warning' | 'error' | 'fatal' {
    switch (level) {
      case LogLevel.DEBUG:
        return 'debug';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARN:
        return 'warning';
      case LogLevel.ERROR:
        return 'error';
      case LogLevel.CRITICAL:
        return 'fatal';
    }
  }

  private formatConsoleMessage(entry: StructuredLogEntry): string {
    const levelName = LogLevel[entry.level];
    const contextStr = entry.context 
      ? ` [${entry.context.component || 'App'}${entry.context.section ? `/${entry.context.section}` : ''}]`
      : '';
    
    return `${entry.timestamp} [${levelName}]${contextStr} ${entry.message}`;
  }

  // Public logging methods
  debug(message: string, context?: LogContext, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.formatLogEntry(LogLevel.DEBUG, message, context, undefined, metadata);
      this.sendToPlatforms(entry).catch(console.error);
    }
  }

  info(message: string, context?: LogContext, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.formatLogEntry(LogLevel.INFO, message, context, undefined, metadata);
      this.sendToPlatforms(entry).catch(console.error);
    }
  }

  warn(message: string, context?: LogContext, metadata?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.formatLogEntry(LogLevel.WARN, message, context, undefined, metadata);
      this.sendToPlatforms(entry).catch(console.error);
    }
  }

  error(
    message: string,
    error?: Error,
    context?: LogContext,
    metadata?: Record<string, unknown>
  ): void {
    const entry = this.formatLogEntry(LogLevel.ERROR, message, context, error, metadata);
    this.sendToPlatforms(entry).catch(console.error);
  }

  critical(
    message: string,
    error?: Error,
    context?: LogContext,
    metadata?: Record<string, unknown>
  ): void {
    const entry = this.formatLogEntry(LogLevel.CRITICAL, message, context, error, metadata);
    this.sendToPlatforms(entry).catch(console.error);
  }

  // Legacy compatibility methods
  log(...args: unknown[]): void {
    if (args.length === 1 && typeof args[0] === 'string') {
      this.info(args[0]);
    } else {
      this.info('Legacy log call', undefined, { args });
    }
  }
}

const logger = new Logger();

export default logger;
