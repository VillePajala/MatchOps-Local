# AGENTS Instructions

This repository uses Node.js 20, Next.js 16 and React 19 with TypeScript. Follow these guidelines when using Codex with this code base.

## Repository Context
- Dual-mode architecture: local (IndexedDB) + cloud (Supabase PostgreSQL). Auth via Supabase email/password. State managed through DataStore abstraction (`src/datastore/factory.ts`).
- Data scale is tiny (hundreds of records). Optimize for responsiveness and reliability, not for enterprise throughput.
- Never suggest heavy SaaS patterns (RBAC, audit logs, JWT, encryption layers). Focus on PWA resiliency, offline UX, and modal/timer correctness instead.

## Project Status (updated 2026-11-20)
- ✅ **Live on Google Play since 2026-06-09**: free, distributed as a cloud-only TWA (sign-in required); the web app keeps local and cloud modes
- ✅ **2026-11 redesign ("Syke Refined") + onboarding v3 live**: basic/full app layouts, Home tabs Pelit/Seura/Kilpailut/Tilastot
- ✅ **Refactoring done**: HomePage.tsx (~96 lines) + page.tsx (~2,270 lines) with hooks in `src/components/HomePage/hooks/`; ~7,700 tests (`npm test` is the source)
- ✅ **Codebase healthy**: Next.js 16 + React 19
- ✅ **Cloud backend complete**: Supabase (PostgreSQL, Auth, Edge Functions), PRs 1-12 merged
- ✅ **Major features**: Personnel, Game Type, Gender, Tournament Series, Cloud Sync all shipped
- **Next**: see `docs/03-active-plans/UNIFIED-ROADMAP.md`

## Allowed Scope
- ✅ **Full speed ahead**: Major features, new game modes, complex functionality all unblocked
- ✅ **Always safe**: Bug fixes, tests, documentation, instrumentation, performance investigations
- 🟡 **Consider**: GameSettingsModal refactoring (low priority, doesn't block work)

## Review Focus
- ✅ Prioritize IndexedDB integrity, PWA/service-worker flows, modal reducer adoption, and UX polish (error boundaries, offline messaging, a11y).
- ✅ Call out rendering issues, memory leaks, stale caches, or modal state races. Verify anti-flash guards stay intact.
- ⛔ Do **not** request enterprise/SaaS patterns (RBAC, audit trails, complex auth), network hardening, or encryption layers—none apply to this single-user PWA.

## Required Commands
- After modifying code, always run `npm run lint`, `npm test`, and for anything non-trivial, `npm run build` (build runs manifest + service-worker generation and catches extra ESLint issues that dev mode misses). Note: `--runInBand` is only needed for debugging test ordering issues; the default config uses `maxWorkers: '50%'` for parallel execution.
- Fix any reported issues before committing.
- If you touch translation files in `public/locales/`, run `npm run generate:i18n-types` before committing.

## Test Discipline
- Jest is configured with `detectOpenHandles` (detectLeaks is disabled due to false positives), console guards, and retry reporting. Any stray `console.warn`/`console.error` fails the suite—fix the root cause instead of muting logs.
- Annotate suites with tags from `CLAUDE.md` (`@critical`, `@integration`, `@edge-case`, `@performance`) so reviewers know the risk level.
- Tests must follow the async pattern: render → `waitFor` initial idle → interactions inside `act`/`userEvent` → `waitFor` assertions. Never rely on arbitrary delays.

## Forbidden Testing Anti-Patterns
- ❌ No `setTimeout`/fixed delays to wait for state—always `waitFor` real conditions.
- ❌ No interactions outside `act()` wrappers or without `await`.
- ❌ Never change Jest config to hide failures (`forceExit`, disabling leak detection, etc.).
- ❌ Console noise is forbidden; the global setup fails on unexpected warnings/errors.

## Build & ESLint Guardrails
- Production builds run additional checks (manifest/service worker generation + stricter ESLint). Always run `npm run build` locally before asking for a review.
- No `require()` in TypeScript/React code (use `import`/`await import`). No `any` types in production code—prefer `unknown` with a type guard.
- Unused parameters should be prefixed with `_`, and console noise must be removed (build fails on stray `console.warn`/`console.error`).

## Code Style
- Place React components inside `src/` and co-locate tests using the `.test.tsx` or `.test.ts` suffix.
- Follow the UI conventions in `docs/05-development/style-guide.md`.
- Use two space indentation and semicolons like the existing code.

## Git Rules
- Do **not** run `git add`, `git commit`, or `git push` unless the user explicitly requests it. Prepare the work, share the diff, and wait for their instruction.
- Keep diffs scoped and mention context in commit messages and PR descriptions.
- Never assume you can merge/push; always wait for explicit approval. Work locally, run the full CI commands, then report status with paths + line references.

## Pull Requests
- The PR description should summarize the changes and mention the results of `npm run lint` and `npm test`.
- Include references to relevant documentation or code lines when explaining changes.

For more context on project architecture and commands see `CLAUDE.md` and `README.md`.
