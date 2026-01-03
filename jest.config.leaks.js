/**
 * Jest configuration for periodic memory leak audits
 *
 * Run with: npm test -- --config jest.config.leaks.js
 *
 * This config enables detectLeaks for identifying memory leaks.
 * Note: detectLeaks has a high false-positive rate, so it's not enabled
 * in the default config. Use this for periodic audits only.
 *
 * @see https://jestjs.io/docs/cli#--detectleaks
 */
import baseConfig from './jest.config.js';

/** @type {import('jest').Config} */
const leaksConfig = async () => {
  const config = await baseConfig();

  return {
    ...config,
    // Enable leak detection
    detectLeaks: true,

    // Run fewer workers to reduce false positives from parallelism
    maxWorkers: 1,

    // Run tests in serial to make leak detection more reliable
    runInBand: true,

    // Focus on new/critical test files for leak audits
    // Add patterns here as you fix leaks in each module
    testPathPatterns: [
      // Add paths to test files you want to audit for leaks
      // Example: 'src/components/NewComponent.test.tsx'
    ],
  };
};

export default leaksConfig;
