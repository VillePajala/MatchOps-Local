# Test Maintenance Guide

## Overview

This guide provides comprehensive instructions for maintaining the MatchOps-Local testing infrastructure, ensuring tests remain reliable, fast, and comprehensive as the application evolves.

## Daily Maintenance

### 1. Monitor Test Execution

```bash
# Run full test suite daily
npm run test:all && npm run e2e

# Check coverage reports
npm run test:coverage
npm run coverage:report
```

**Key Metrics to Monitor**:
- Coverage percentage (target: >90%)
- Test execution time (target: <5 minutes for unit, <15 minutes for E2E)
- Flaky test identification
- New failing tests

### 2. Review Test Results

Check for:
- ❌ **Failed tests** - Immediate investigation required
- ⚠️ **Flaky tests** - Tests that intermittently fail
- 🐌 **Slow tests** - Tests taking longer than expected
- 📊 **Coverage drops** - New code without adequate tests

## Weekly Maintenance

### 1. Update Test Dependencies

```bash
# Check for outdated testing packages
npm outdated

# Update testing dependencies
npm update @playwright/test jest @testing-library/react @testing-library/jest-dom

# Run full test suite after updates
npm run test:all && npm run e2e
```

### 2. Review and Clean Test Code

- Remove obsolete tests for deleted features
- Consolidate duplicate test cases
- Update test descriptions and comments
- Refactor common test utilities

### 3. Performance Analysis

```bash
# Analyze Jest performance
npm run test:debug

# Check E2E test timing
npx playwright test --reporter=json > test-timing.json
```

**Performance Targets**:
- Unit tests: <2 seconds per file
- Integration tests: <10 seconds per file
- E2E tests: <30 seconds per test

## Monthly Maintenance

### 1. Comprehensive Test Review

#### Coverage Analysis
```bash
# Generate detailed coverage report
npm run test:coverage
open coverage/lcov-report/index.html

# Identify uncovered code
npm run test:coverage -- --collectCoverageFrom="src/**/*.{ts,tsx}" --coverageReporters=text-summary
```

#### Test Quality Assessment
- **Test clarity**: Are test names descriptive?
- **Test isolation**: Do tests depend on each other?
- **Test completeness**: Are edge cases covered?
- **Test maintainability**: Are tests easy to update?

### 2. Visual Regression Updates

```bash
# Update visual baselines after UI changes
npx playwright test visual-regression.spec.ts --update-snapshots

# Review screenshot differences
npx playwright show-report
```

### 3. Test Data Management

#### Mock Data Review
```typescript
// tests/utils/test-utils.tsx
// Review and update mock data factories
export const createMockPlayer = (overrides = {}) => ({
  // Ensure mock data reflects current interfaces
  id: generateId(),
  name: generateName(),
  // ... other properties
  ...overrides
});
```

#### Test Database Cleanup
```typescript
// Clean up test artifacts
afterEach(async () => {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});
```

## Quarterly Maintenance

### 1. Testing Strategy Review

- Assess test coverage across different areas:
  - **Core functionality**: 95%+ coverage
  - **UI components**: 90%+ coverage  
  - **Utilities**: 95%+ coverage
  - **Edge cases**: 80%+ coverage

- Review testing pyramid balance:
  - **Unit tests**: 70% of total tests
  - **Integration tests**: 20% of total tests
  - **E2E tests**: 10% of total tests

### 2. Technology Updates

```bash
# Major version updates
npm install @playwright/test@latest
npm install jest@latest
npm install @testing-library/react@latest

# Update browser versions
npx playwright install
```

### 3. Test Infrastructure Optimization

#### Parallel Execution Tuning
```javascript
// jest.config.js
module.exports = {
  maxWorkers: process.env.CI ? 2 : '50%',
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.mjs']
};
```

#### CI/CD Pipeline Optimization
```yaml
# .github/workflows/test-guards.yml
- name: Cache dependencies
  uses: actions/cache@v3
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}

- name: Cache Playwright browsers
  uses: actions/cache@v3
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('**/package-lock.json') }}
```

## Troubleshooting Common Issues

### 1. Flaky Tests

**Identification**:
```bash
# Run test multiple times to identify flakiness
npm test -- --testNamePattern="flaky test" --verbose --runInBand
```

**Common Causes & Solutions**:

| Issue | Cause | Solution |
|-------|--------|----------|
| Timing issues | Async operations not awaited | Use proper async/await patterns |
| Test pollution | Tests affecting each other | Improve test isolation |
| External dependencies | Network requests in tests | Mock external services |
| Race conditions | Concurrent operations | Use proper synchronization |

### 2. Memory Leaks in Tests

**Detection**:
```bash
# Run with memory monitoring
node --expose-gc --max-old-space-size=4096 node_modules/.bin/jest --logHeapUsage
```

**Common Fixes**:
```typescript
// Cleanup subscriptions
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  cleanup(); // React Testing Library cleanup
});
```

### 3. CI/CD Test Failures

**Environment Differences**:
```bash
# Use same Node version as CI
nvm use $(cat .nvmrc)

# Run tests with CI environment variables
CI=true npm run test:ci
```

**Resource Constraints**:
```javascript
// Adjust for CI environment
const config = {
  testTimeout: process.env.CI ? 30000 : 10000,
  maxWorkers: process.env.CI ? 1 : '50%',
};
```

## Test Metrics and Monitoring

### 1. Key Performance Indicators

Track these metrics over time:

```typescript
interface TestMetrics {
  coverage: {
    statements: number; // Target: >90%
    branches: number;   // Target: >85%
    functions: number;  // Target: >90%
    lines: number;      // Target: >90%
  };
  
  performance: {
    unitTestDuration: number;    // Target: <5 minutes
    e2eTestDuration: number;     // Target: <15 minutes
    totalTestCount: number;      // Growth trend
  };
  
  reliability: {
    passRate: number;            // Target: >98%
    flakeyTestCount: number;     // Target: <5
    avgRetryRate: number;        // Target: <2%
  };
}
```

### 2. Automated Monitoring

```bash
# Generate weekly test report
#!/bin/bash
echo "# Weekly Test Report - $(date)" > test-report.md
echo "## Coverage" >> test-report.md
npm run test:coverage -- --coverageReporters=text-summary | grep -A 10 "Coverage summary" >> test-report.md

echo "## Performance" >> test-report.md
npm test -- --verbose 2>&1 | grep "Test Suites" >> test-report.md

echo "## E2E Results" >> test-report.md
npm run e2e 2>&1 | tail -5 >> test-report.md
```

## Best Practices Checklist

### ✅ Test Writing
- [ ] Tests have descriptive names
- [ ] One assertion per test (when possible)
- [ ] Tests are isolated and independent
- [ ] Mock external dependencies
- [ ] Use appropriate test types (unit/integration/e2e)

### ✅ Test Maintenance
- [ ] Remove obsolete tests promptly
- [ ] Update tests when requirements change
- [ ] Keep test utilities DRY
- [ ] Document complex test scenarios
- [ ] Regular dependency updates

### ✅ Performance
- [ ] Tests run in reasonable time
- [ ] Parallel execution where possible
- [ ] Efficient test data setup
- [ ] Proper cleanup after tests
- [ ] Monitor test execution trends

### ✅ Reliability
- [ ] Tests pass consistently
- [ ] No external dependencies in unit tests
- [ ] Proper error handling in tests
- [ ] Clear failure messages
- [ ] Stable test data

## Emergency Procedures

### Test Suite Completely Broken

1. **Isolate the Issue**:
   ```bash
   # Run tests individually to find the culprit
   npm test -- --testNamePattern="specific test"
   ```

2. **Quick Fixes**:
   ```bash
   # Skip failing tests temporarily
   test.skip('broken test', () => { /* ... */ });
   
   # Or focus on working tests
   test.only('working test', () => { /* ... */ });
   ```

3. **Rollback Strategy**:
   ```bash
   # Revert to last known good commit
   git log --oneline | head -10
   git revert <commit-hash>
   ```

### CI/CD Pipeline Blocked

1. **Bypass Strategy** (use sparingly):
   ```yaml
   # Temporary CI bypass
   - name: Run tests
     run: npm run test:ci || echo "Tests failed but continuing"
     continue-on-error: true
   ```

2. **Quick Resolution**:
   ```bash
   # Focus on critical tests only
   npm run test:critical
   npm run e2e -- --grep "smoke|critical"
   ```

## Tools and Resources

### Testing Tools Stack
- **Jest**: Unit and integration testing
- **React Testing Library**: Component testing
- **Playwright**: End-to-end testing
- **jest-axe**: Accessibility testing
- **jest-canvas-mock**: Canvas API mocking

### Monitoring Tools
```bash
# Test coverage visualization
npm install --save-dev nyc
npx nyc report --reporter=html

# Performance monitoring
npm install --save-dev clinic
npx clinic doctor -- npm test
```

### Useful Scripts
```json
{
  "scripts": {
    "test:changed": "jest -o",
    "test:watch:coverage": "jest --watch --coverage",
    "test:debug:node": "node --inspect-brk node_modules/.bin/jest --runInBand",
    "e2e:specific": "playwright test --grep",
    "test:profile": "clinic doctor -- npm test"
  }
}
```

This maintenance guide ensures the testing infrastructure remains robust and continues to provide value as MatchOps-Local evolves.