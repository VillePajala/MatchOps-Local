/**
 * Generate changelog.json from the latest git commit
 *
 * This script runs at build time and creates a changelog.json file
 * with the latest commit message as release notes.
 *
 * To provide bilingual notes, use this commit message format:
 * feat: English description here | Finnish description here
 *
 * Or for single-language commits, the same message is used for both.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Get the latest commit message (first line only)
function getLatestCommitMessage() {
  try {
    const message = execSync('git log -1 --pretty=%s', { encoding: 'utf-8' }).trim();
    return message;
  } catch {
    return 'App update';
  }
}

// Get the latest commit date
function getLatestCommitDate() {
  try {
    const date = execSync('git log -1 --pretty=%cs', { encoding: 'utf-8' }).trim();
    return date;
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

// Get short commit hash as version
function getCommitHash() {
  try {
    const hash = execSync('git log -1 --pretty=%h', { encoding: 'utf-8' }).trim();
    return hash;
  } catch {
    return 'unknown';
  }
}

// Parse commit message for bilingual notes
// Format: "type: English message | Finnish message"
// Or just: "type: Message" (same for both languages)
function parseCommitMessage(message) {
  // Remove conventional commit prefix (feat:, fix:, etc.)
  const cleaned = message.replace(/^(feat|fix|chore|docs|style|refactor|test|build|ci|perf|revert)(\(.+\))?:\s*/i, '');

  // Check for bilingual format with |
  if (cleaned.includes(' | ')) {
    const [en, fi] = cleaned.split(' | ').map(s => s.trim());
    return { en, fi };
  }

  // Single language - use for both
  return { en: cleaned, fi: cleaned };
}

// Make the message user-friendly (capitalize first letter, etc.)
function formatNote(note) {
  if (!note) return 'App update';
  // Capitalize first letter
  return note.charAt(0).toUpperCase() + note.slice(1);
}

// Main
const commitMessage = getLatestCommitMessage();
const commitDate = getLatestCommitDate();
const commitHash = getCommitHash();
const notes = parseCommitMessage(commitMessage);

const changelog = {
  version: commitHash,
  date: commitDate,
  notes: {
    en: formatNote(notes.en),
    fi: formatNote(notes.fi)
  }
};

const outputPath = path.join(process.cwd(), 'public', 'changelog.json');
fs.writeFileSync(outputPath, JSON.stringify(changelog, null, 2) + '\n');

console.log(`✓ Generated changelog.json`);
console.log(`  Version: ${changelog.version}`);
console.log(`  Date: ${changelog.date}`);
console.log(`  EN: ${changelog.notes.en}`);
console.log(`  FI: ${changelog.notes.fi}`);
