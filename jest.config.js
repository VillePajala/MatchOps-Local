import nextJest from 'next/jest.js'; // Use .js extension

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: [
    '<rootDir>/src/setupTests.mjs',
    '<rootDir>/tests/utils/test-cleanup.js',
    '<rootDir>/tests/utils/console-control.js'
  ],
  
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '<rootDir>/tests/e2e/', // Only ignore E2E Playwright specs
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Test patterns - include both src/ and tests/ directories
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/tests/**/*.test.{ts,tsx}'
  ],
  
  // Improved reporting
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'test-results', outputName: 'results.xml' }],
    ['jest-html-reporters', { publicPath: 'test-results', filename: 'report.html' }]
  ],
  
  // Performance optimizations
  passWithNoTests: true,
  testFailureExitCode: 1,
  maxWorkers: process.env.CI ? 2 : '50%',
  testTimeout: 30000, // 30 second timeout
  slowTestThreshold: 5, // Warn about tests > 5s
  
  // Reduce console noise in CI
  silent: process.env.CI === 'true',
  verbose: process.env.CI !== 'true',
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(customJestConfig); 
