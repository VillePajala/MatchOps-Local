#!/usr/bin/env node

import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Simple bundle size analysis script
 * Checks if bundle size has grown significantly
 */

const BUILD_DIR = '.next';
const MAX_BUNDLE_SIZE = 5 * 1024 * 1024; // 5MB warning threshold

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function analyzeBundleSize() {
  if (!existsSync(BUILD_DIR)) {
    console.log('❌ Build directory not found');
    process.exit(1);
  }

  // Get directory size
  const { execSync } = await import('child_process');
  
  try {
    const sizeOutput = execSync(`du -sb ${BUILD_DIR}`, { encoding: 'utf8' });
    const totalSize = parseInt(sizeOutput.split('\t')[0]);
    
    console.log(`📦 Build Size Analysis:`);
    console.log(`   Total build size: ${formatBytes(totalSize)}`);
    
    if (totalSize > MAX_BUNDLE_SIZE) {
      console.log(`⚠️  Bundle size exceeds ${formatBytes(MAX_BUNDLE_SIZE)} threshold`);
      console.log(`   Consider optimizing bundle size`);
    } else {
      console.log(`✅ Bundle size is within acceptable limits`);
    }
    
    // Check for large chunks
    const chunksPath = join(BUILD_DIR, 'static/chunks');
    if (existsSync(chunksPath)) {
      const chunksOutput = execSync(`find ${chunksPath} -name "*.js" -type f -exec ls -la {} \\; | sort -k5 -nr | head -5`, { encoding: 'utf8' });
      console.log(`\n📊 Largest JavaScript chunks:`);
      console.log(chunksOutput);
    }
    
  } catch (error) {
    console.error('Error analyzing bundle size:', error.message);
    process.exit(1);
  }
}

await analyzeBundleSize();