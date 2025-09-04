/**
 * Console control utilities for tests
 * Reduces noise in CI environments while preserving debugging info locally
 */

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug,
};

// Detect CI environment
const isCI = process.env.CI === 'true' || 
             process.env.NODE_ENV === 'test' ||
             process.env.JEST_WORKER_ID !== undefined;

// Detect if we're in a specific test that needs console output
const isDebugTest = process.env.TEST_DEBUG === 'true' ||
                   process.argv.some(arg => arg.includes('--verbose'));

// Console control functions
const muteConsole = () => {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  
  // Keep warnings and errors but reduce noise
  console.warn = (...args) => {
    const message = args.join(' ');
    // Filter out known noisy warnings in tests
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
    // Filter out expected test errors
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

// Apply console control based on environment
if (isCI && !isDebugTest) {
  // In CI: mute most console output to reduce noise
  muteConsole();
} else if (!isDebugTest) {
  // Local development: reduce but don't eliminate console output
  const originalLog = console.log;
  console.log = (...args) => {
    const message = args.join(' ');
    // Skip very repetitive log messages
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