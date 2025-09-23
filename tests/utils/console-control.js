/**
 * Console control utilities for tests
 * Reduces noise in CI environments while preserving debugging info locally
 * CRITICAL: Only suppresses console output in test environments - never in production
 */

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug,
};

// SECURITY: Ensure we only operate in test environments
const isProduction = process.env.NODE_ENV === 'production';
const isTestEnvironment = process.env.NODE_ENV === 'test' ||
                         process.env.JEST_WORKER_ID !== undefined ||
                         typeof jest !== 'undefined';

// Detect CI environment
const isCI = process.env.CI === 'true' && isTestEnvironment;

// Detect if we're in a specific test that needs console output
const isDebugTest = process.env.TEST_DEBUG === 'true' ||
                   process.argv.some(arg => arg.includes('--verbose'));

// CRITICAL: Never suppress anything in production
if (isProduction) {
  console.warn('⚠️  Console control should not run in production environment');
  module.exports = {
    muteConsole: () => {},
    restoreConsole: () => {},
    originalConsole,
    isCI: false,
    isDebugTest: false
  };
} else {

// Console control functions
const muteConsole = () => {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  
  // Keep warnings and errors but reduce noise
  console.warn = (...args) => {
    const message = args.join(' ');

    // SECURITY: Always preserve security-related warnings
    if (message.includes('security') ||
        message.includes('CORS') ||
        message.includes('CSP') ||
        message.includes('XSS') ||
        message.includes('authentication') ||
        message.includes('authorization') ||
        message.includes('permission') ||
        message.includes('origin') ||
        message.includes('protocol')) {
      originalConsole.warn('🔒 SECURITY WARNING:', ...args);
      return;
    }

    // PERFORMANCE: Always preserve performance warnings
    if (message.includes('performance') ||
        message.includes('memory') ||
        message.includes('leak') ||
        message.includes('timeout') ||
        message.includes('slow') ||
        message.includes('bundle size')) {
      originalConsole.warn('⚡ PERFORMANCE WARNING:', ...args);
      return;
    }

    // Filter out known noisy warnings in tests only
    if (message.includes('Warning: An update to') ||
        message.includes('Warning: React does not recognize') ||
        message.includes('Warning: componentWillMount') ||
        message.includes('Screen Wake Lock API not supported') ||
        message.includes('TanStack Query') ||
        message.includes('Modal opened with')) {
      return;
    }
    originalConsole.warn(...args);
  };

  console.error = (...args) => {
    const message = args.join(' ');

    // CRITICAL: Always preserve security and critical errors
    if (message.includes('security') ||
        message.includes('CORS') ||
        message.includes('CSP') ||
        message.includes('XSS') ||
        message.includes('authentication') ||
        message.includes('authorization') ||
        message.includes('network') ||
        message.includes('fetch failed') ||
        message.includes('connection') ||
        message.includes('critical')) {
      originalConsole.error('🚨 CRITICAL ERROR:', ...args);
      return;
    }

    // Filter out expected test errors only
    if (message.includes('[setLocalStorageItem] Error setting item') ||
        message.includes('Error parsing roster') ||
        message.includes('LocalStorage failure') ||
        message.includes('Storage quota exceeded') ||
        message.includes('An update to') && message.includes('was not wrapped in act')) {
      return;
    }
    originalConsole.error(...args);
  };
};

const restoreConsole = () => {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
};

// Apply console control based on environment (TEST ONLY)
if (isTestEnvironment && !isProduction) {
  if (isCI && !isDebugTest) {
    // In CI: mute most console output to reduce noise
    muteConsole();
  } else if (!isDebugTest) {
    // Local development: reduce but don't eliminate console output
    const originalLog = console.log;
    console.log = (...args) => {
      const message = args.join(' ');

      // ALWAYS preserve important logs even in tests
      if (message.includes('error') ||
          message.includes('fail') ||
          message.includes('security') ||
          message.includes('warning') ||
          message.includes('performance') ||
          message.includes('critical')) {
        originalLog(...args);
        return;
      }

      // Skip very repetitive log messages in tests
      if (message.includes('[Home Render] highlightRosterButton') ||
          message.includes('[page.tsx] About to render PlayerBar') ||
          message.includes('[TanStack Query]') ||
          message.includes('[EFFECT game load]') ||
          message.includes('[Modal Trigger Effect]')) {
        return;
      }
      originalLog(...args);
    };
  }
}

// Export utilities for manual control
module.exports = {
  muteConsole,
  restoreConsole,
  originalConsole,
  isCI,
  isDebugTest
};

// Global cleanup on test completion
if (typeof afterAll === 'function') {
  afterAll(() => {
    restoreConsole();
  });
}

} // End of else block