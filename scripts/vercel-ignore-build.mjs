/**
 * Decide whether a push needs a deploy.
 *
 * Every deploy stamps a new service worker, and a new service worker means the
 * "update available" banner on every coach's phone. A change to docs, CI,
 * tests or tooling does not change the app they run, so it must not deploy
 * and must not prompt. This is the single list of what counts as "does not
 * touch the app"; Vercel's ignore step and the Release Notes Guard both use
 * it, so a change that deploys always needs a note and a change that does
 * not deploy never does.
 *
 * Vercel convention: exit 0 = SKIP the build, exit 1 = build.
 *   vercel.json: "ignoreCommand": "node scripts/vercel-ignore-build.mjs"
 * CLI: node scripts/vercel-ignore-build.mjs [base] [head]
 *   base defaults to VERCEL_GIT_PREVIOUS_SHA (the last deploy) when that
 *   commit is in the clone, else HEAD^; head defaults to HEAD. When the
 *   range cannot be read at all the answer is "build", never "skip".
 */
import { execFileSync } from 'node:child_process';

/** Path patterns that never change the built app. Anchored, one per line. */
const NOT_APP = [
  /^docs\//,
  /^\.github\//,
  /^\.claude\//,
  /^temp\//,
  /^tests\//,
  /^__mocks__\//,
  /^supabase\//,
  /^site\//,
  /^eslint\//,
  /^scripts\/promo-video\//,
  /^scripts\/__tests__\//,
  /^scripts\/check-rule-links\.mjs$/,
  /^scripts\/vercel-ignore-build\.mjs$/,
  /(^|\/)__tests__\//,
  /\.test\.(ts|tsx|mjs|js)$/,
  /\.md$/,
  /^LICENSE$/,
  /^\.gitignore$/,
  /^deno\.lock$/,
  /^jest\.config(\.[\w-]+)?\.js$/,
  /^eslint\.config\.mjs$/,
  /^playwright\.config\.ts$/,
  /^src\/setupTests\.mjs$/,
  // The note is baked into changelog.json at build time, but a note alone is
  // nothing to prompt for; it rides along with the next real deploy.
  /^release-notes\.json$/,
];

/** True when this path is part of what users run. */
export function isAppPath(file) {
  return !NOT_APP.some((re) => re.test(file));
}

/** The subset of changed files that make a deploy necessary. */
export function appFiles(files) {
  return files.filter(isAppPath);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function commitExists(sha) {
  if (!sha) return false;
  try { git(['cat-file', '-e', `${sha}^{commit}`]); return true; } catch { return false; }
}

/** Files changed between the two commits, or null when git cannot tell. */
export function changedFiles(base, head) {
  try {
    const out = git(['diff', '--name-only', base, head]);
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return null;
  }
}

export function resolveRange(argv, env) {
  const head = argv[1] || 'HEAD';
  let base = argv[0];
  if (!base) {
    const previous = env.VERCEL_GIT_PREVIOUS_SHA;
    base = commitExists(previous) ? previous : 'HEAD^';
  }
  return { base, head };
}

if (process.argv[1] && process.argv[1].endsWith('vercel-ignore-build.mjs')) {
  const { base, head } = resolveRange(process.argv.slice(2), process.env);
  const files = changedFiles(base, head);
  if (files === null) {
    console.log(`cannot diff ${base}..${head} - building to be safe`);
    process.exit(1);
  }
  const app = appFiles(files);
  if (app.length === 0) {
    console.log(`${files.length} file(s) changed in ${base}..${head}, none in the app - skipping the deploy`);
    process.exit(0);
  }
  console.log(`app files changed in ${base}..${head}:\n  ${app.join('\n  ')}`);
  process.exit(1);
}
