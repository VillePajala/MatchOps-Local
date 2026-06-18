#!/usr/bin/env node

/**
 * Copy ONLY user-facing documentation from ../docs into pages/docs for the
 * public site.
 *
 * SECURITY: this used to copy the ENTIRE ../docs tree (denylist of just
 * 08-archived), which published internal material to the public site —
 * the roadmap and its security findings (03-active-plans), the database schema
 * and implementation guide (02-technical), deployment/architecture/business docs
 * (05/07), the "how to clone this app" blueprint (11-blueprint), analysis
 * (10-analysis) and a 2.4 MB archive. None of it is linked from the site UI.
 *
 * It is now an ALLOWLIST: nothing is published unless it is explicitly listed
 * below. Add an entry only after confirming the content is safe for the public.
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../../docs');
const targetDir = path.join(__dirname, '../pages/docs');

// Explicit allowlist of PUBLIC, user-facing docs. Top-level entries only.
// Files are copied as-is; directory names are copied recursively.
const ALLOW_FILES = new Set([
  'QUICK_START.md',
  'USER_MANUAL.md',
]);
const ALLOW_DIRS = new Set([
  // (none currently — add a directory here only if every file in it is public)
]);

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  console.log('Cleaning old docs...');
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  console.log('Copying ALLOWLISTED public docs from ../docs to pages/docs...');
  let copied = 0;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isDirectory() && ALLOW_DIRS.has(entry.name)) {
      copyDirRecursive(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
      console.log(`  + ${entry.name}/ (allowlisted dir)`);
      copied++;
    } else if (entry.isFile() && ALLOW_FILES.has(entry.name)) {
      fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
      console.log(`  + ${entry.name}`);
      copied++;
    } else {
      console.log(`  - ${entry.name} (internal — not published)`);
    }
  }

  console.log(`✓ Published ${copied} allowlisted doc entr${copied === 1 ? 'y' : 'ies'}.`);
} catch (error) {
  console.error('Error copying documentation:', error);
  process.exit(1);
}
