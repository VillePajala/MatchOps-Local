#!/usr/bin/env node

/**
 * Copy documentation from parent ../docs to pages/docs
 * Excludes: 08-archived, .git directories
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../../docs');
const targetDir = path.join(__dirname, '../pages/docs');

// Directories to exclude
const excludeDirs = ['08-archived', '.git'];

/**
 * Recursively copy directory with exclusions
 */
function copyDirRecursive(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Skip excluded directories
      if (excludeDirs.includes(entry.name)) {
        console.log(`Skipping excluded directory: ${entry.name}`);
        continue;
      }
      // Recursively copy directory
      copyDirRecursive(srcPath, destPath);
    } else {
      // Copy file
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Main execution
try {
  console.log('Cleaning old docs...');
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  console.log('Copying documentation from ../docs to pages/docs...');
  copyDirRecursive(sourceDir, targetDir);

  console.log('✓ Documentation copied successfully!');
} catch (error) {
  console.error('Error copying documentation:', error);
  process.exit(1);
}
