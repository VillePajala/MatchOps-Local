/**
 * Type-safe logger interface with improved IDE support
 */
export interface Logger {
  /**
   * Log informational messages (only in development)
   * @param message - Primary log message
   * @param data - Additional data to log
   */
  log: (message: string, ...data: unknown[]) => void;

  /**
   * Log warning messages (always logged, including production)
   * @param message - Primary warning message
   * @param data - Additional data to log
   */
  warn: (message: string, ...data: unknown[]) => void;

  /**
   * Log error messages (always logged, including production)
   * @param message - Primary error message
   * @param data - Additional data to log
   */
  error: (message: string, ...data: unknown[]) => void;
}

const logger: Logger = {
  log: (message: string, ...data: unknown[]) => {
    // Check environment at runtime for better testability
    if (process.env.NODE_ENV !== 'production') console.log(message, ...data);
  },
  warn: (message: string, ...data: unknown[]) => {
    // Always show warnings - they indicate potential issues worth investigating
    console.warn(message, ...data);
  },
  error: (message: string, ...data: unknown[]) => {
    console.error(message, ...data);
  },
};

export default logger;
