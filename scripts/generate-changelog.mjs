/**
 * Generate public/changelog.json from the curated release-notes.json.
 *
 * The in-app update banner reads public/changelog.json and shows the `notes`
 * bullets to end users. We DO NOT derive these from git commit messages — those
 * are developer-speak. Instead, edit release-notes.json by hand (newest entry
 * first); this script copies the top entry's bullets into changelog.json.
 *
 * If release-notes.json is missing/empty/malformed, we emit a generic localized
 * fallback so the banner never shows nothing (and never shows commit messages).
 * A CI guard (.github/workflows/release-notes-guard.yml) requires every PR to
 * master to add a fresh entry — every build ships a user-friendly note.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const GENERIC_FALLBACK = {
  en: ['Improvements and bug fixes'],
  fi: ['Parannuksia ja korjauksia'],
};

// Internal build identity (NOT shown to users) — handy for debugging which build
// a changelog.json came from. Falls back gracefully outside a git checkout.
function getCommitHash() {
  try {
    return execSync('git log -1 --pretty=%h', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getCommitDate() {
  try {
    return execSync('git log -1 --pretty=%cs', { encoding: 'utf-8' }).trim();
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

// Read the top (newest) curated release entry, or null if unavailable/invalid.
function getLatestCuratedRelease() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'release-notes.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const releases = Array.isArray(parsed?.releases) ? parsed.releases : [];
    const latest = releases[0];
    if (!latest) return null;

    const clean = (arr) =>
      Array.isArray(arr) ? arr.map((s) => String(s).trim()).filter(Boolean) : [];
    const en = clean(latest.en);
    const fi = clean(latest.fi);

    // Require at least one bullet in each language to count as a real note.
    if (en.length === 0 || fi.length === 0) {
      const missing = [en.length === 0 && 'en', fi.length === 0 && 'fi'].filter(Boolean).join(' + ');
      console.warn(`  ⚠ Top release-notes.json entry is missing ${missing} bullets — falling back to a generic note.`);
      return null;
    }
    return { date: typeof latest.date === 'string' ? latest.date : null, en, fi };
  } catch {
    return null;
  }
}

const curated = getLatestCuratedRelease();
const usingFallback = curated === null;

const changelog = {
  // version is internal-only (not rendered in the banner); kept for debugging.
  version: getCommitHash(),
  date: curated?.date || getCommitDate(),
  notes: usingFallback ? GENERIC_FALLBACK : { en: curated.en, fi: curated.fi },
};

const outputPath = path.join(process.cwd(), 'public', 'changelog.json');
fs.writeFileSync(outputPath, JSON.stringify(changelog, null, 2) + '\n');

console.log('✓ Generated public/changelog.json');
console.log(`  Source: ${usingFallback ? 'GENERIC FALLBACK (no curated note found)' : 'release-notes.json'}`);
console.log(`  Date: ${changelog.date}`);
console.log(`  EN: ${changelog.notes.en.join(' / ')}`);
console.log(`  FI: ${changelog.notes.fi.join(' / ')}`);
if (usingFallback) {
  console.warn('  ⚠ release-notes.json was missing/empty/invalid — emitted a generic note.');
}
