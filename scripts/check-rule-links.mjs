#!/usr/bin/env node
/**
 * Verifies the Palloliitto rule links shown in the Säännöt modal.
 *
 * Why this exists: on 2026-09-09 the app was found linking the October 2025
 * futsal rulebook while Palloliitto had replaced it with a February 2026
 * revision under a new asset id. The old file still returned 200, so a coach
 * opening it saw a rulebook that looked entirely normal and was superseded.
 * A reachability check would have passed happily.
 *
 * So this asserts two different things:
 *   1. every URL still resolves (catches ordinary link rot), and
 *   2. every URL with a `listedOn` page is still linked from that page
 *      (catches supersession, which is the failure that actually happened and
 *      the one a human will never notice).
 *
 * Run: node scripts/check-rule-links.mjs
 * Exit 0 = all good, 1 = something needs a human.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(here, '..', 'src', 'config', 'ruleLinks.json');

// Palloliitto's CDN and site both 403 a bare fetch; this is a plain desktop UA,
// not an attempt to look like anything we are not.
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const TIMEOUT_MS = 30000;

/** Exported for the unit test; `fetchImpl` lets it run without a network. */
export async function checkRuleLinks(config, fetchImpl = fetch) {
  const problems = [];
  const notes = [];

  const get = async (url, method = 'GET') => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetchImpl(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': UA },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  // Each listing page is fetched once, however many links point at it.
  const pages = new Map();
  const listingPage = async (url) => {
    if (pages.has(url)) return pages.get(url);
    let html = null;
    try {
      const res = await get(url);
      if (!res.ok) {
        problems.push(`Listing page ${url} returned HTTP ${res.status}, so supersession could not be checked.`);
      } else {
        html = await res.text();
      }
    } catch (err) {
      problems.push(`Listing page ${url} could not be fetched (${err.message}), so supersession could not be checked.`);
    }
    pages.set(url, html);
    return html;
  };

  for (const link of config.links) {
    try {
      const head = await get(link.url, 'HEAD');
      // Some CDNs refuse HEAD but serve GET; only a GET failure is a real problem.
      const res = head.ok ? head : await get(link.url, 'GET');
      if (!res.ok) {
        problems.push(`${link.id}: HTTP ${res.status} for ${link.url}`);
      } else {
        const lastModified = res.headers?.get?.('last-modified');
        if (lastModified) notes.push(`${link.id}: last modified ${lastModified}`);
      }
    } catch (err) {
      problems.push(`${link.id}: request failed for ${link.url} (${err.message})`);
    }

    if (link.listedOn) {
      const html = await listingPage(link.listedOn);
      if (html && !html.includes(link.url)) {
        problems.push(
          `${link.id}: still loads, but ${link.listedOn} no longer links ${link.url}. ` +
            `This is what a superseded edition looks like. Find the current document at ` +
            `${config.indexPage} and update src/config/ruleLinks.json (and the year in its label, if it moved).`,
        );
      }
    }
  }

  return { problems, notes };
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG, 'utf8'));
  const { problems, notes } = await checkRuleLinks(config);

  for (const note of notes) console.log(`  ${note}`);

  if (problems.length === 0) {
    console.log(`\nAll ${config.links.length} rule links are current (last human check: ${config.checkedOn}).`);
    process.exit(0);
  }

  console.error(`\n${problems.length} problem(s) with the rule links:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nFix by editing src/config/ruleLinks.json, then update its checkedOn date.\n');
  process.exit(1);
}

// Run only when invoked directly, so the unit test can import the logic.
// Deliberately no top-level await: Jest compiles this module to CommonJS, where
// top-level await is a syntax error, and the test would fail to load at all.
if (process.argv[1] && process.argv[1].endsWith('check-rule-links.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
