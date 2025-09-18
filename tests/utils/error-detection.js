/**
 * Enhanced error detection utilities for tests
 * Ensures critical issues are never silently ignored
 */

// Track error types to prevent silent failures
const criticalErrorTypes = new Set([
  'SecurityError',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'NetworkError',
  'AuthenticationError',
  'AuthorizationError'
]);

const securityKeywords = [
  'xss',
  'csrf',
  'cors',
  'csp',
  'security',
  'authentication',
  'authorization',
  'permission',
  'origin',
  'protocol'
];

const performanceKeywords = [
  'memory leak',
  'performance',
  'timeout',
  'slow',
  'bundle size',
  'memory pressure'
];

/**
 * Determines if an error should cause test failure
 * @param {Error|string} error - The error to evaluate
 * @returns {boolean} - True if this error should fail the test
 */
function shouldFailTest(error) {
  const errorMessage = typeof error === 'string' ? error : error?.message || '';
  const errorType = error?.constructor?.name || '';
  const errorStack = error?.stack || '';

  // Always fail on critical error types
  if (criticalErrorTypes.has(errorType)) {
    return true;
  }

  // Always fail on security-related errors
  if (securityKeywords.some(keyword =>
    errorMessage.toLowerCase().includes(keyword) ||
    errorStack.toLowerCase().includes(keyword)
  )) {
    return true;
  }

  // Always fail on performance issues in tests
  if (performanceKeywords.some(keyword =>
    errorMessage.toLowerCase().includes(keyword)
  )) {
    return true;
  }

  // Fail on network errors that aren't explicitly mocked
  if (errorMessage.includes('fetch') &&
      errorMessage.includes('failed') &&
      !errorMessage.includes('mock')) {
    return true;
  }

  // Allow known test environment limitations
  const allowedErrors = [
    'ResizeObserver loop limit exceeded', // React 18 timing
    'Not implemented: HTMLCanvasElement', // Canvas mock limitation
    'Not implemented: navigation', // Navigation API mock
    'Warning: An update to', // React testing library timing
    'act(...) warning' // React testing timing
  ];

  if (allowedErrors.some(allowed => errorMessage.includes(allowed))) {
    return false;
  }

  // Default: fail on unexpected errors
  return true;
}

/**
 * Enhanced error reporter that provides context
 * @param {Error|string} error - The error to report
 * @param {string} context - Additional context (e.g., 'unhandled rejection')
 */
function reportError(error, context = 'error') {
  const errorInfo = {
    type: error?.constructor?.name || 'Unknown',
    message: error?.message || error,
    stack: error?.stack,
    context,
    testFile: expect.getState()?.testPath,
    testName: expect.getState()?.currentTestName,
    timestamp: new Date().toISOString()
  };

  // Log with emoji for visibility
  console.error(`🚨 ${context.toUpperCase()}:`, errorInfo);

  // Return structured info for further processing
  return errorInfo;
}

/**
 * Create a test-failing error with enhanced context
 * @param {Error|string} originalError - The original error
 * @param {string} context - Context where the error occurred
 * @returns {Error} - Enhanced error ready to throw
 */
function createTestFailureError(originalError, context) {
  const testState = expect.getState();
  const testName = testState?.currentTestName || 'unknown test';

  const message = `${context} in test "${testName}": ${originalError?.message || originalError}`;
  const enhancedError = new Error(message);

  // Preserve original stack trace
  enhancedError.stack = originalError?.stack || enhancedError.stack;
  enhancedError.originalError = originalError;
  enhancedError.context = context;

  return enhancedError;
}

module.exports = {
  shouldFailTest,
  reportError,
  createTestFailureError,
  criticalErrorTypes,
  securityKeywords,
  performanceKeywords
};