/**
 * @critical - this list decides which pushes deploy. Too loose and a real app
 * change never reaches users; too tight and every docs edit prompts every
 * coach to update again.
 */
import { isAppPath, appFiles, resolveRange } from '../vercel-ignore-build.mjs';

describe('isAppPath', () => {
  it.each([
    'src/components/HomeDashboard.tsx',
    'src/app/page.tsx',
    'public/sw.js',
    'public/locales/fi/common.json',
    'package.json',
    'package-lock.json',
    'next.config.ts',
    'vercel.json',
    'tsconfig.json',
    'scripts/generate-manifest.mjs',
    'scripts/generate-changelog.mjs',
    'sentry.server.config.ts',
    '.env.development',
    'tailwind.config.js',
  ])('%s changes the app', (file) => {
    expect(isAppPath(file)).toBe(true);
  });

  it.each([
    'docs/03-active-plans/UNIFIED-ROADMAP.md',
    'README.md',
    'CLAUDE.md',
    'AGENTS.md',
    '.github/workflows/ci.yml',
    '.claude/settings.json',
    'scripts/promo-video/scenes/hero.mjs',
    'scripts/promo-video/assets/Rajdhani-Bold.ttf',
    'scripts/__tests__/vercelIgnoreBuild.test.mjs',
    'scripts/vercel-ignore-build.mjs',
    'scripts/check-rule-links.mjs',
    'src/components/__tests__/ServiceWorkerRegistration.test.tsx',
    'src/utils/homeSummary.test.ts',
    'tests/e2e/onboarding.spec.ts',
    'tests/fixtures/games.ts',
    '__mocks__/fileMock.js',
    'supabase/migrations/052_user_settings_known_venues.sql',
    'supabase/functions/delete-account/index.ts',
    'site/components/Hero.tsx',
    'jest.config.js',
    'jest.config.leaks.js',
    'eslint.config.mjs',
    'eslint/rules/no-foo.js',
    'playwright.config.ts',
    'src/setupTests.mjs',
    'LICENSE',
    '.gitignore',
    'deno.lock',
    'temp/notes.txt',
    'release-notes.json',
  ])('%s does not change the app', (file) => {
    expect(isAppPath(file)).toBe(false);
  });

  /** A test-looking name outside a test folder is still app code. */
  it('does not confuse a component named after tests with a test', () => {
    expect(isAppPath('src/components/TestResultsPanel.tsx')).toBe(true);
    expect(isAppPath('src/utils/contest.ts')).toBe(true);
  });
});

describe('appFiles', () => {
  it('is empty for a docs-and-tooling push', () => {
    expect(appFiles(['docs/a.md', 'scripts/promo-video/run.sh', '.github/workflows/ci.yml'])).toEqual([]);
  });

  it('keeps only the files that deploy', () => {
    expect(appFiles(['docs/a.md', 'src/app/page.tsx', 'release-notes.json'])).toEqual(['src/app/page.tsx']);
  });
});

describe('resolveRange', () => {
  it('uses explicit arguments first', () => {
    expect(resolveRange(['abc', 'def'], { VERCEL_GIT_PREVIOUS_SHA: 'zzz' })).toEqual({ base: 'abc', head: 'def' });
  });

  it('falls back to the parent commit when the last deploy is not in the clone', () => {
    expect(resolveRange([], { VERCEL_GIT_PREVIOUS_SHA: 'not-a-commit-in-this-repo' })).toEqual({ base: 'HEAD^', head: 'HEAD' });
    expect(resolveRange([], {})).toEqual({ base: 'HEAD^', head: 'HEAD' });
  });
});
