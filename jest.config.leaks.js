/**
 * Jest configuration for periodic memory leak audits
 *
 * Run with: npm run test:leaks
 * Or target specific files: npm run test:leaks -- src/components/MyComponent.test.tsx
 *
 * This config enables detectLeaks for identifying memory leaks.
 * Note: detectLeaks has a high false-positive rate (31/80 suites flagged
 * in initial audit), so it's not enabled in the default config.
 * Use this for periodic audits only.
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

    // Run tests serially to make leak detection more reliable
    // and reduce false positives from parallelism
    runInBand: true,
  };
};

export default leaksConfig;
