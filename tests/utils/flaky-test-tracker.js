/**
 * Flaky Test Tracking and Reporting System
 *
 * This module tracks test retry attempts and generates reports on flaky tests
 * to help identify patterns and prioritize fixes.
 */

const fs = require('fs');
const path = require('path');

/**
 * Flaky test tracker that monitors retry attempts and patterns
 */
class FlakyTestTracker {
  constructor() {
    this.flakyTests = new Map();
    this.testRuns = [];
    this.startTime = Date.now();
    this.isCI = process.env.CI === 'true';
  }

  /**
   * Records a test retry attempt
   *
   * @param {string} testPath - Path to the test file
   * @param {string} testName - Name of the specific test
   * @param {number} attemptNumber - Which retry attempt (1, 2, 3)
   * @param {string} error - Error message from the failed attempt
   */
  recordRetry(testPath, testName, attemptNumber, error) {
    const testKey = `${testPath}::${testName}`;

    if (!this.flakyTests.has(testKey)) {
      this.flakyTests.set(testKey, {
        testPath,
        testName,
        attempts: [],
        totalRetries: 0,
        lastFailure: null,
        pattern: null
      });
    }

    const testData = this.flakyTests.get(testKey);
    testData.attempts.push({
      attemptNumber,
      timestamp: Date.now(),
      error: error?.substring(0, 500), // Truncate long errors
      environment: {
        ci: this.isCI,
        nodeVersion: process.version,
        platform: process.platform
      }
    });

    testData.totalRetries++;
    testData.lastFailure = Date.now();

    // Detect common flaky patterns
    testData.pattern = this.detectFlakyPattern(testData.attempts);
  }

  /**
   * Analyzes retry attempts to detect common flaky test patterns
   *
   * @param {Array} attempts - Array of retry attempts
   * @returns {string|null} Detected pattern or null
   */
  detectFlakyPattern(attempts) {
    const errors = attempts.map(a => a.error).filter(Boolean);

    // Common flaky patterns
    const patterns = {
      'timing': /timeout|timing|race condition|setImmediate|setTimeout/i,
      'async': /promise|async|await|pending|unhandled/i,
      'dom': /not found|not.*(visible|present)|detached|stale/i,
      'network': /network|fetch|request|connection|ECONNREFUSED/i,
      'memory': /memory|leak|heap|out of memory/i,
      'concurrency': /resource busy|locked|concurrent|parallel/i
    };

    for (const [patternName, regex] of Object.entries(patterns)) {
      if (errors.some(error => regex.test(error))) {
        return patternName;
      }
    }

    return null;
  }

  /**
   * Records successful test completion after retries
   *
   * @param {string} testPath - Path to the test file
   * @param {string} testName - Name of the specific test
   * @param {number} totalAttempts - Total attempts before success
   */
  recordSuccess(testPath, testName, totalAttempts) {
    if (totalAttempts > 1) {
      const testKey = `${testPath}::${testName}`;
      const testData = this.flakyTests.get(testKey);
      if (testData) {
        testData.eventuallySucceeded = true;
        testData.successfulAttempt = totalAttempts;
      }
    }
  }

  /**
   * Generates a comprehensive flaky test report
   *
   * @returns {Object} Report data
   */
  generateReport() {
    const flakyTestsArray = Array.from(this.flakyTests.values());

    // Sort by retry count (most problematic first)
    flakyTestsArray.sort((a, b) => b.totalRetries - a.totalRetries);

    // Group by pattern
    const patternGroups = {};
    flakyTestsArray.forEach(test => {
      const pattern = test.pattern || 'unknown';
      if (!patternGroups[pattern]) {
        patternGroups[pattern] = [];
      }
      patternGroups[pattern].push(test);
    });

    return {
      summary: {
        totalFlakyTests: flakyTestsArray.length,
        totalRetries: flakyTestsArray.reduce((sum, test) => sum + test.totalRetries, 0),
        runDuration: Date.now() - this.startTime,
        environment: {
          ci: this.isCI,
          nodeVersion: process.version,
          platform: process.platform
        }
      },
      mostProblematic: flakyTestsArray.slice(0, 10), // Top 10 flaky tests
      patternAnalysis: Object.entries(patternGroups).map(([pattern, tests]) => ({
        pattern,
        count: tests.length,
        totalRetries: tests.reduce((sum, test) => sum + test.totalRetries, 0),
        tests: tests.map(t => ({ testPath: t.testPath, testName: t.testName }))
      })),
      recommendations: this.generateRecommendations(flakyTestsArray, patternGroups)
    };
  }

  /**
   * Generates actionable recommendations for fixing flaky tests
   *
   * @param {Array} flakyTests - Array of flaky test data
   * @param {Object} patternGroups - Tests grouped by flaky patterns
   * @returns {Array} Array of recommendations
   */
  generateRecommendations(flakyTests, patternGroups) {
    const recommendations = [];

    // Pattern-based recommendations
    if (patternGroups.timing) {
      recommendations.push({
        priority: 'HIGH',
        category: 'timing',
        issue: `${patternGroups.timing.length} tests failing due to timing issues`,
        solution: 'Add proper waitFor() and act() wrappers around async operations',
        affectedTests: patternGroups.timing.slice(0, 3).map(t => t.testName)
      });
    }

    if (patternGroups.async) {
      recommendations.push({
        priority: 'HIGH',
        category: 'async',
        issue: `${patternGroups.async.length} tests with unhandled promises`,
        solution: 'Ensure all async operations are properly awaited and wrapped in act()',
        affectedTests: patternGroups.async.slice(0, 3).map(t => t.testName)
      });
    }

    if (patternGroups.dom) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'dom',
        issue: `${patternGroups.dom.length} tests with DOM timing issues`,
        solution: 'Use proper wait conditions instead of fixed timeouts',
        affectedTests: patternGroups.dom.slice(0, 3).map(t => t.testName)
      });
    }

    // General recommendations based on retry count
    const highRetryTests = flakyTests.filter(t => t.totalRetries > 5);
    if (highRetryTests.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'stability',
        issue: `${highRetryTests.length} tests are extremely unstable (5+ retries)`,
        solution: 'These tests need immediate attention and may need complete rewriting',
        affectedTests: highRetryTests.map(t => t.testName)
      });
    }

    return recommendations.sort((a, b) => {
      const priority = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
      return priority[b.priority] - priority[a.priority];
    });
  }

  /**
   * Saves the flaky test report to disk
   *
   * @param {string} outputPath - Path to save the report
   */
  saveReport(outputPath = 'test-results/flaky-tests-report.json') {
    const report = this.generateReport();

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save detailed JSON report
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

    // Generate human-readable summary
    const summaryPath = outputPath.replace('.json', '-summary.txt');
    this.generateHumanReadableSummary(report, summaryPath);

    return { reportPath: outputPath, summaryPath };
  }

  /**
   * Generates a human-readable summary of flaky tests
   *
   * @param {Object} report - The detailed report data
   * @param {string} outputPath - Path to save the summary
   */
  generateHumanReadableSummary(report, outputPath) {
    let summary = `
FLAKY TEST REPORT SUMMARY
========================

📊 OVERVIEW:
- Total flaky tests: ${report.summary.totalFlakyTests}
- Total retries needed: ${report.summary.totalRetries}
- Test run duration: ${Math.round(report.summary.runDuration / 1000)}s
- Environment: ${report.summary.environment.ci ? 'CI' : 'Local'} (${report.summary.environment.platform})

🚨 MOST PROBLEMATIC TESTS:
${report.mostProblematic.slice(0, 5).map((test, i) =>
  `${i + 1}. ${test.testName} (${test.totalRetries} retries) - ${test.pattern || 'unknown pattern'}`
).join('\n')}

🔍 PATTERN ANALYSIS:
${report.patternAnalysis.map(pattern =>
  `- ${pattern.pattern.toUpperCase()}: ${pattern.count} tests, ${pattern.totalRetries} total retries`
).join('\n')}

💡 TOP RECOMMENDATIONS:
${report.recommendations.slice(0, 3).map((rec, i) =>
  `${i + 1}. [${rec.priority}] ${rec.issue}
     Solution: ${rec.solution}`
).join('\n\n')}

For detailed information, see: ${outputPath.replace('-summary.txt', '.json')}
    `.trim();

    fs.writeFileSync(outputPath, summary);
  }
}

// Global instance
const flakyTracker = new FlakyTestTracker();

// Jest hooks integration
if (typeof global !== 'undefined' && global.beforeEach) {
  // Track test start
  beforeEach(() => {
    // Reset retry tracking for each test
    global.__currentTestRetryCount = 0;
  });

  // Generate report after all tests complete
  afterAll(() => {
    if (flakyTracker.flakyTests.size > 0) {
      const { reportPath, summaryPath } = flakyTracker.saveReport();

      if (!flakyTracker.isCI) {
        console.log('\n🔍 Flaky test report generated:');
        console.log(`   Detailed: ${reportPath}`);
        console.log(`   Summary:  ${summaryPath}`);
      }
    }
  });
}

module.exports = {
  FlakyTestTracker,
  flakyTracker
};