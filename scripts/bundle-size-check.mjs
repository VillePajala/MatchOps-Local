#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Bundle size monitoring and CI check script
 * Tracks bundle sizes over time and prevents regressions
 */

console.log('📊 Running bundle size analysis and budget verification...\n');

// Configuration
const BUNDLE_HISTORY_FILE = 'bundle-size-history.json';
const MAX_HISTORY_ENTRIES = 50;
const REGRESSION_THRESHOLD = 0.05; // 5% increase triggers warning

/**
 * Get current bundle sizes from build output
 */
function getCurrentBundleSizes() {
  const buildStatsPath = '.next/static';
  
  if (!fs.existsSync(buildStatsPath)) {
    throw new Error('Build output not found. Run npm run build first.');
  }

  const sizes = {};
  
  try {
    // Get JavaScript bundle sizes
    const jsFiles = execSync(`find ${buildStatsPath} -name "*.js" -type f`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    
    let totalJSSize = 0;
    for (const file of jsFiles) {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        totalJSSize += stats.size;
      }
    }
    
    // Get CSS bundle sizes
    const cssFiles = execSync(`find ${buildStatsPath} -name "*.css" -type f`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    
    let totalCSSSize = 0;
    for (const file of cssFiles) {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        totalCSSSize += stats.size;
      }
    }

    sizes.totalJS = totalJSSize;
    sizes.totalCSS = totalCSSSize;
    sizes.total = totalJSSize + totalCSSSize;
    
    return sizes;
  } catch (error) {
    console.error('Error calculating bundle sizes:', error.message);
    return {
      totalJS: 0,
      totalCSS: 0,
      total: 0,
    };
  }
}

/**
 * Load bundle size history
 */
function loadBundleHistory() {
  if (fs.existsSync(BUNDLE_HISTORY_FILE)) {
    try {
      const data = fs.readFileSync(BUNDLE_HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('Failed to load bundle history:', error.message);
    }
  }
  return [];
}

/**
 * Save bundle size history
 */
function saveBundleHistory(history) {
  try {
    // Keep only the most recent entries
    const trimmedHistory = history.slice(-MAX_HISTORY_ENTRIES);
    fs.writeFileSync(BUNDLE_HISTORY_FILE, JSON.stringify(trimmedHistory, null, 2));
  } catch (error) {
    console.warn('Failed to save bundle history:', error.message);
  }
}

/**
 * Analyze size trends and regressions
 */
function analyzeTrends(history, currentSizes) {
  if (history.length === 0) {
    return {
      isRegression: false,
      analysis: 'No historical data available for comparison.',
    };
  }

  const lastEntry = history[history.length - 1];
  const sizeChange = currentSizes.total - lastEntry.sizes.total;
  const percentChange = (sizeChange / lastEntry.sizes.total) * 100;
  
  const isRegression = sizeChange > 0 && Math.abs(percentChange) > (REGRESSION_THRESHOLD * 100);
  const isImprovement = sizeChange < 0 && Math.abs(percentChange) > 1; // 1% improvement threshold
  
  let analysis = '';
  
  if (isRegression) {
    analysis = `🚨 Size regression detected: +${(sizeChange / 1024).toFixed(1)}KB (+${percentChange.toFixed(1)}%)`;
  } else if (isImprovement) {
    analysis = `✅ Size improvement: ${(sizeChange / 1024).toFixed(1)}KB (${percentChange.toFixed(1)}%)`;
  } else if (Math.abs(percentChange) < 1) {
    analysis = `✅ Bundle size stable: ${sizeChange >= 0 ? '+' : ''}${(sizeChange / 1024).toFixed(1)}KB (${percentChange.toFixed(1)}%)`;
  } else {
    analysis = `⚠️  Bundle size change: ${sizeChange >= 0 ? '+' : ''}${(sizeChange / 1024).toFixed(1)}KB (${percentChange.toFixed(1)}%)`;
  }

  return {
    isRegression,
    isImprovement,
    analysis,
    sizeChange,
    percentChange,
    lastSize: lastEntry.sizes.total,
    currentSize: currentSizes.total,
  };
}

/**
 * Format size for display
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Run size-limit check
 */
function runSizeLimitCheck() {
  try {
    console.log('🔍 Running size-limit budget verification...');
    execSync('npx size-limit', { stdio: 'inherit' });
    console.log('✅ All bundle sizes within budget limits\\n');
    return true;
  } catch (error) {
    console.error('❌ Bundle size budget exceeded\\n');
    return false;
  }
}

/**
 * Generate bundle size report
 */
function generateReport(currentSizes, trendAnalysis, history) {
  const report = {
    timestamp: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'unknown',
    branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || 'unknown',
    sizes: currentSizes,
    analysis: trendAnalysis,
    budgetStatus: 'needs-check', // Will be updated after size-limit check
  };

  // Save report for CI systems
  fs.writeFileSync('bundle-size-report.json', JSON.stringify(report, null, 2));
  
  return report;
}

/**
 * Main execution
 */
async function main() {
  try {
    // Get current sizes
    const currentSizes = getCurrentBundleSizes();
    
    console.log('📦 Current Bundle Sizes:');
    console.log(`   JavaScript: ${formatSize(currentSizes.totalJS)}`);
    console.log(`   CSS: ${formatSize(currentSizes.totalCSS)}`);
    console.log(`   Total: ${formatSize(currentSizes.total)}\\n`);

    // Load and analyze history
    const history = loadBundleHistory();
    const trendAnalysis = analyzeTrends(history, currentSizes);
    
    console.log('📈 Size Analysis:');
    console.log(`   ${trendAnalysis.analysis}\\n`);

    // Update history
    const newEntry = {
      timestamp: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local',
      branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || 'local',
      sizes: currentSizes,
    };
    
    history.push(newEntry);
    saveBundleHistory(history);

    // Run size-limit budget check
    const budgetPassed = runSizeLimitCheck();
    
    // Generate comprehensive report
    const report = generateReport(currentSizes, trendAnalysis, history);
    report.budgetStatus = budgetPassed ? 'passed' : 'failed';
    fs.writeFileSync('bundle-size-report.json', JSON.stringify(report, null, 2));

    // CI exit logic
    if (process.env.CI) {
      if (!budgetPassed) {
        console.error('❌ Bundle size budget check failed in CI');
        process.exit(1);
      }
      
      if (trendAnalysis.isRegression && Math.abs(trendAnalysis.percentChange) > 10) {
        console.error('❌ Significant bundle size regression detected (>10%)');
        console.error('   Consider investigating before merging');
        process.exit(1);
      }
    }

    console.log('✅ Bundle size analysis complete');
    console.log(`📊 Report saved to bundle-size-report.json`);
    
  } catch (error) {
    console.error('❌ Bundle size check failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);