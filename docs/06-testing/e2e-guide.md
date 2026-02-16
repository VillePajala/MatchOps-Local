# End-to-End Testing Guide

## Overview

MatchOps-Local uses Playwright for comprehensive end-to-end testing across multiple browsers and devices. This guide covers setup, execution, and maintenance of E2E tests.

## Quick Start

### Prerequisites

```bash
# Install dependencies and browsers
npm install
npm run e2e:install
```

**Note**: `npm run e2e:install` requires sudo access to install system dependencies. If running in a restricted environment, you may need to:
- Run `sudo npx playwright install-deps` manually
- Or install required system packages via your package manager

### Running Tests

```bash
# Run all E2E tests
npm run e2e

# Run with UI (interactive mode)
npm run e2e:ui

# Run in headed mode (see browser)
npm run e2e:headed

# Debug mode (step through tests)
npm run e2e:debug

# View test report
npm run e2e:report
```

## Test Categories

### 1. Game Workflows (`game-workflows.spec.ts`)

Tests core user journeys and application functionality:

- **Homepage Loading**: Verifies app initialization and key elements
- **Soccer Field Interactions**: Canvas rendering, drag/drop, tactical mode
- **Modal Operations**: Settings, roster, stats dialogs
- **Timer Functionality**: Game clock operations
- **Responsive Design**: Multi-device viewport testing
- **Error Handling**: Console error monitoring and graceful failures
- **Browser Compatibility**: Cross-browser functionality testing

**Key Features Tested**:
- Canvas-based soccer field rendering
- Player positioning and interactions
- Modal dialog workflows
- Timer and game state management
- Local storage persistence
- Browser refresh handling

### 2. Visual Regression (`visual-regression.spec.ts`)

Ensures UI consistency across updates:

- **Screenshot Comparison**: Pixel-perfect UI verification
- **Responsive Breakpoints**: Visual testing across device sizes
- **Component Isolation**: Individual component visual validation
- **Theme Variations**: Dark mode and high contrast testing
- **Modal States**: Dialog appearance verification

**Breakpoints Tested**:
- Small Mobile: 320×568
- Large Mobile: 414×896
- Small Tablet: 768×1024
- Desktop: 1280×800
- Large Desktop: 1920×1080

### 3. PWA & Offline (`pwa-offline.spec.ts`)

Validates Progressive Web App features:

- **Manifest Validation**: PWA manifest structure and content
- **Service Worker**: Registration and caching functionality
- **Offline Operation**: App functionality without network
- **Cache Management**: Resource caching and retrieval
- **Install Prompts**: PWA installability criteria
- **State Persistence**: Local storage during offline sessions

**Offline Scenarios**:
- Initial app load and caching
- Offline navigation and functionality
- Data persistence across offline sessions
- Network reconnection handling

## Configuration

### Playwright Config (`playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  // Reporting
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/playwright-results.json' }],
    ['junit', { outputFile: 'test-results/playwright-results.xml' }]
  ],
  
  // Global settings
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  
  // Browser projects
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
  ],
  
  // Local dev server
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

## Best Practices

### 1. Test Structure

```typescript
test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=MatchOps')).toBeVisible();
  });

  test('should perform specific action', async ({ page }) => {
    // Test implementation
  });
});
```

### 2. Waiting Strategies

```typescript
// Wait for network idle
await page.waitForLoadState('networkidle');

// Wait for specific elements
await expect(page.locator('text=MatchOps')).toBeVisible({ timeout: 10000 });

// Wait for animations
await page.waitForTimeout(500);
```

### 3. Visual Testing

```typescript
// Hide dynamic content
await page.addStyleTag({
  content: `
    [data-testid="current-time"],
    .timer-display {
      visibility: hidden !important;
    }
  `
});

// Take screenshot
await expect(page).toHaveScreenshot('component-name.png', {
  fullPage: true,
  animations: 'disabled',
});
```

### 4. Offline Testing

```typescript
// Simulate offline
await context.setOffline(true);

// Test offline functionality
await page.reload();
await expect(page.locator('text=MatchOps')).toBeVisible();

// Re-enable network
await context.setOffline(false);
```

## CI/CD Integration

### GitHub Actions

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps

      - name: Run Playwright tests
        run: npm run e2e

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

## Troubleshooting

### Common Issues

#### 1. Browser Installation

**Error**: Host system is missing dependencies
```bash
# Install system dependencies
sudo npx playwright install-deps

# Or manually install required packages
sudo apt-get install libnss3 libasound2 libgbm1 libxss1 libgtk-3-0
```

#### 2. Test Timeouts

**Issue**: Tests timing out waiting for elements
```typescript
// Increase timeout for slow-loading elements
await expect(page.locator('text=MatchOps')).toBeVisible({ timeout: 15000 });

// Or use more specific selectors
await page.waitForSelector('[data-testid="app-loaded"]');
```

#### 3. Canvas Testing

**Issue**: Canvas elements not rendering in tests
```typescript
// Wait for canvas to be ready
const canvas = page.locator('canvas').first();
await expect(canvas).toBeVisible();
await page.waitForTimeout(1000); // Allow rendering time

// Check canvas dimensions
const boundingBox = await canvas.boundingBox();
expect(boundingBox?.width).toBeGreaterThan(0);
```

#### 4. Visual Test Flakiness

**Issue**: Screenshots failing due to dynamic content
```typescript
// Hide dynamic elements
await page.addStyleTag({
  content: `
    .loading-spinner,
    [data-testid="timestamp"],
    .timer-display {
      visibility: hidden !important;
    }
  `
});

// Disable animations
await page.emulateMedia({ reducedMotion: 'reduce' });
```

### Debugging Tests

```bash
# Run specific test with debug
npx playwright test --debug --grep "should load homepage"

# Run with headed browser
npx playwright test --headed

# Generate trace for failed tests
npx playwright test --trace on
npx playwright show-trace trace.zip
```

## Maintenance

### Updating Screenshots

When UI changes, update visual baselines:

```bash
# Update all screenshots
npx playwright test --update-snapshots

# Update specific test screenshots
npx playwright test visual-regression.spec.ts --update-snapshots

# Update for specific browser
npx playwright test --project=chromium --update-snapshots
```

### Performance Monitoring

Monitor test execution times and identify slow tests:

```bash
# Run with detailed timing
npx playwright test --reporter=line --reporter=json

# Analyze results
cat test-results/results.json | jq '.suites[].tests[] | {title: .title, duration: .duration}'
```

### Test Data Management

```typescript
// Clean up after tests
test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});
```

## Advanced Scenarios

### 1. Multi-Tab Testing

```typescript
test('should handle multiple tabs', async ({ browser }) => {
  const context = await browser.newContext();
  const page1 = await context.newPage();
  const page2 = await context.newPage();
  
  await page1.goto('/');
  await page2.goto('/');
  
  // Test cross-tab functionality
});
```

### 2. Authentication Flows

```typescript
test('should maintain session', async ({ page }) => {
  // Set up authenticated state
  await page.evaluate(() => {
    localStorage.setItem('userToken', 'test-token');
  });
  
  await page.goto('/');
  // Test authenticated features
});
```

### 3. Network Conditions

```typescript
test('should handle slow networks', async ({ page, context }) => {
  // Simulate slow network
  await context.route('**/*', route => {
    setTimeout(() => route.continue(), 1000);
  });
  
  await page.goto('/');
  // Test with network delays
});
```

## Report Analysis

### Test Results Structure

```
test-results/
├── playwright-results.json    # Detailed JSON results
├── playwright-results.xml     # JUnit XML for CI
└── playwright-report/         # HTML report
    ├── index.html             # Main report
    └── data/                  # Screenshots, traces
```

### Key Metrics

- **Pass Rate**: Overall test success percentage
- **Duration**: Total execution time per browser
- **Flaky Tests**: Tests with inconsistent results
- **Coverage**: Feature areas tested

The HTML report provides interactive analysis including:
- Test timeline and duration
- Screenshot comparisons for visual tests
- Error details and stack traces
- Network activity and performance metrics

This comprehensive E2E testing setup ensures MatchOps-Local maintains high quality across updates while catching regressions early in the development cycle.