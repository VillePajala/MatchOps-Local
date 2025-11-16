# AGENTS Instructions

This repository uses Node.js 20, Next.js 15 and React 19 with TypeScript. Follow these guidelines when using Codex with this code base.

## Critical Fixes First
- Before touching any substantial feature work, review the blockers called out in `docs/CRITICAL_FIXES_REQUIRED.md` and confirm P0/P1 tasks on `docs/CRITICAL_FIXES_TRACKER.md` are in progress or complete.
- If a task qualifies as a **major feature** and the critical fixes are not done, stop and prioritize the refactors (HomePage, GameSettingsModal, modal reducer, etc.) or ask the user for guidance.

## Allowed Scope
- ✅ Safe tasks: refactors, bug fixes, tests, documentation, instrumentation, performance investigations.
- ⛔ Forbidden until the critical debts above are resolved: new game modes, large new components, multi-day feature work, anything that balloons HomePage further.

## Required Commands
- After modifying code, always run `npm run lint`, `npm run test -- --runInBand`, and for anything non-trivial, `npm run build` (build runs manifest + service-worker generation and catches extra ESLint issues that dev mode misses).
- Fix any reported issues before committing.
- If you touch translation files in `public/locales/`, run `npm run generate:i18n-types` before committing.

## Test Discipline
- Jest is configured with `detectLeaks`, `detectOpenHandles`, and console guards (see `CLAUDE.md`). Tests that log unexpected output will fail—clean up every warning rather than silencing it.
- Avoid `setTimeout`-style flakiness. Wrap async UI events in `act`/`waitFor` and keep console noise at zero (the CI job fails on stray logs/warns).

## Code Style
- Place React components inside `src/` and co-locate tests using the `.test.tsx` or `.test.ts` suffix.
- Follow the UI conventions in `.docs/STYLE_GUIDE.md`.
- Use two space indentation and semicolons like the existing code.

## Git Rules
- Do **not** run `git add`, `git commit`, or `git push` unless the user explicitly requests it. Prepare the work, share the diff, and wait for their instruction.
- Branches are usually short-lived `micro/...` steps tied to Layer 2 refactors. Keep diffs scoped to a single step and mention the layer/step number in commit messages and PR descriptions.

## Pull Requests
- The PR description should summarize the changes and mention the results of `npm run lint` and `npm test`.
- Include references to relevant documentation or code lines when explaining changes.

*(CI trigger placeholder – no functional impact.)*

For more context on project architecture and commands see `CLAUDE.md` and `README.md`.
Consult `MANUAL_TESTING.md` for a checklist of key workflows to verify after updates.
