# AGENTS Instructions

This repository uses Node.js 20, Next.js 15 and React 19 with TypeScript. Follow these guidelines when using Codex with this code base.

## Repository Context
- Local-first PWA for a single soccer coach. No backend, no multi-tenant, no auth flows. All state lives in IndexedDB via `src/utils/storage.ts`.
- Data scale is tiny (hundreds of records). Optimize for responsiveness and reliability, not for enterprise throughput.
- Never suggest heavy SaaS patterns (RBAC, audit logs, JWT, encryption layers). Focus on PWA resiliency, offline UX, and modal/timer correctness instead.

## Critical Fixes First
- Before touching any substantial feature work, review the blockers called out in `docs/CRITICAL_FIXES_REQUIRED.md` and confirm P0/P1 tasks on `docs/CRITICAL_FIXES_TRACKER.md` are in progress or complete.
- If a task qualifies as a **major feature** and the critical fixes are not done, stop and prioritize the refactors (HomePage, GameSettingsModal, modal reducer, etc.) or ask the user for guidance.
- Current high-priority items (from `CLAUDE.md`): HomePage still ~2,500 lines, GameSettingsModal ~2,000 lines, modal reducer rollout, silent error handling, and render performance. Keep every change scoped toward these.

## Allowed Scope
- ✅ Safe tasks: refactors, bug fixes, tests, documentation, instrumentation, performance investigations.
- ⛔ Forbidden until the critical debts above are resolved: new game modes, large new components, multi-day feature work, anything that balloons HomePage further.

## Review Focus
- ✅ Prioritize IndexedDB integrity, PWA/service-worker flows, modal reducer adoption, and UX polish (error boundaries, offline messaging, a11y).
- ✅ Call out rendering issues, memory leaks, stale caches, or modal state races. Verify anti-flash guards stay intact.
- ⛔ Do **not** request enterprise/SaaS patterns (RBAC, audit trails, complex auth), network hardening, or encryption layers—none apply to this single-user PWA.

## Required Commands
- After modifying code, always run `npm run lint`, `npm run test -- --runInBand`, and for anything non-trivial, `npm run build` (build runs manifest + service-worker generation and catches extra ESLint issues that dev mode misses).
- Fix any reported issues before committing.
- If you touch translation files in `public/locales/`, run `npm run generate:i18n-types` before committing.

## Test Discipline
- Jest is configured with `detectLeaks`, `detectOpenHandles`, console guards, and retry reporting. Any stray `console.warn`/`console.error` fails the suite—fix the root cause instead of muting logs.
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
- Follow the UI conventions in `.docs/STYLE_GUIDE.md`.
- Use two space indentation and semicolons like the existing code.

## Git Rules
- Do **not** run `git add`, `git commit`, or `git push` unless the user explicitly requests it. Prepare the work, share the diff, and wait for their instruction.
- Branches are usually short-lived `micro/...` steps tied to Layer 2 refactors. Keep diffs scoped to a single step and mention the layer/step number in commit messages and PR descriptions.
- Never assume you can merge/push; always wait for explicit approval. Work locally, run the full CI commands, then report status with paths + line references.

## Pull Requests
- The PR description should summarize the changes and mention the results of `npm run lint` and `npm test`.
- Include references to relevant documentation or code lines when explaining changes.

For more context on project architecture and commands see `CLAUDE.md` and `README.md`.
Consult `MANUAL_TESTING.md` for a checklist of key workflows to verify after updates.
