/**
 * Type-safe logger interface with improved IDE support
 */
export interface Logger {
  /**
   * Log debug messages (only in development)
   * @param message - Primary debug message
   * @param data - Additional data to log
   */
  debug: (message: string, ...data: unknown[]) => void;

  /**
   * Log informational messages (only in development)
   * @param message - Primary log message
   * @param data - Additional data to log
   */
  log: (message: string, ...data: unknown[]) => void;

  /**
   * Log informational messages (only in development)
   * @param message - Primary log message
   * @param data - Additional data to log
   */
  info: (message: string, ...data: unknown[]) => void;

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
  debug: (message: string, ...data: unknown[]) => {
    // Check environment at runtime for better testability
    if (process.env.NODE_ENV !== 'production') console.debug(message, ...data);
  },
  log: (message: string, ...data: unknown[]) => {
    // Check environment at runtime for better testability
    if (process.env.NODE_ENV !== 'production') console.log(message, ...data);
  },
  info: (message: string, ...data: unknown[]) => {
    // Check environment at runtime for better testability
    if (process.env.NODE_ENV !== 'production') console.info(message, ...data);
  },
  warn: (message: string, ...data: unknown[]) => {
    // Always show warnings - they indicate potential issues worth investigating
    console.warn(message, ...data);
  },
  error: (message: string, ...data: unknown[]) => {
    console.error(message, ...data);
  },
};

/**
 * Creates a namespaced logger for a specific component or module
 * @param namespace - The namespace/component name for logging context
 * @returns Logger instance with namespaced messages
 */
export function createLogger(namespace: string): Logger {
  return {
    debug: (message: string, ...data: unknown[]) => {
      logger.debug(`[${namespace}] ${message}`, ...data);
    },
    log: (message: string, ...data: unknown[]) => {
      logger.log(`[${namespace}] ${message}`, ...data);
    },
    info: (message: string, ...data: unknown[]) => {
      logger.info(`[${namespace}] ${message}`, ...data);
    },
    warn: (message: string, ...data: unknown[]) => {
      logger.warn(`[${namespace}] ${message}`, ...data);
    },
    error: (message: string, ...data: unknown[]) => {
      logger.error(`[${namespace}] ${message}`, ...data);
    },
  };
}

export default logger;
