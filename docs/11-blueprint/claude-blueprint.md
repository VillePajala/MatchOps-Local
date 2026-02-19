# CLAUDE.md Blueprint

> **What this is**: A template CLAUDE.md for AI-assisted development of a local-first PWA with Supabase cloud sync.
> **How to use**: Copy this file as `CLAUDE.md` in your project root. Replace all `[PLACEHOLDER]` sections with your project-specific details. Remove sections that don't apply.
> **Source**: Extracted from MatchOps-Local — a production soccer coaching PWA with 4,500+ tests across 226 suites, built entirely with AI-assisted development.

---

## Project Status

**Last Updated**: [DATE]

### Quick Stats
- [ ] **Tests**: [COUNT] passing
- [ ] **Security vulnerabilities**: 0
- [ ] **Stack**: Next.js 16 + React 19 + Supabase
- [ ] **Dual-mode**: Local (IndexedDB) + Cloud (Supabase)
- [ ] **Auth**: Email/password via Supabase Auth

### Quality Bar: Production-Ready (Not MVP)

**Do NOT defer issues with these justifications:**
- "Acceptable for MVP"
- "Can fix later before launch"
- "Good enough for now"

**Instead, use these criteria:**
- "Safe for production with paying users"
- "Handles edge cases gracefully"
- "Follows security best practices"

### Essential Reading
<!-- List the key docs the AI must read before working on each area -->
- **[Blueprint](./docs/11-blueprint/README.md)** — Architecture decisions, build sequence, patterns
- **[UNIFIED-ROADMAP.md](./docs/03-active-plans/UNIFIED-ROADMAP.md)** — Single source of truth for what's next

---

## Development Commands

```bash
npm run dev          # Start development server (Next.js)
npm run build        # Build for production (includes manifest generation)
npm run start        # Start production server
npm run lint         # Run ESLint
npm test             # Run all Jest tests
npm run test:unit    # Run unit tests (CI mode, single worker)
npm run generate:i18n-types  # Generate TypeScript types for translations
```

### Browser Automation (agent-browser)

**Required tool for AI-assisted development.** Use `agent-browser` to visually verify UI changes, test PWA behavior, and validate user flows without manual browser interaction.

```bash
# Installation (one-time)
npm install -g agent-browser

# Core workflow
agent-browser open http://localhost:3000 --ignore-https-errors  # Open dev server
agent-browser snapshot                   # Get compact element tree with refs (@e1, @e2, ...)
agent-browser click @e3                  # Click an element by ref
agent-browser type @e5 "search term"     # Type into an input
agent-browser press Enter                # Press a key
agent-browser screenshot page.png        # Take a screenshot
agent-browser close                      # Close browser session
```

**When to use**:
- After implementing a UI feature — verify it renders correctly
- After CSS/layout changes — screenshot to confirm visual output
- Testing user flows — open page, interact with elements, verify results
- PWA verification — check install prompts, offline page, service worker behavior
- Debugging — snapshot the page to see what the AI agent "sees"

**Key notes**:
- Uses Playwright under the hood — requires `npx playwright install chromium` on first setup
- Compact ref-based output (`@e1`, `@e2`) uses 93% less context than full accessibility trees
- WSL/headless environments need `--ignore-https-errors` flag (set on first `open` after `close`)
- Daemon persists between commands — `close` and re-`open` to change launch flags

---

## Architecture Overview

### Tech Stack
- **Next.js 16** with App Router
- **React 19** with TypeScript (strict mode)
- **Tailwind CSS 4** for styling
- **PWA** with custom service worker
- **Dual-mode data persistence**:
  - **Local**: Browser IndexedDB via `idb` (offline-first, no account required)
  - **Cloud**: Supabase PostgreSQL (cross-device sync, requires auth)
- **Supabase** for cloud backend (Auth, PostgreSQL with RLS, Edge Functions)
- **React Query** for async state management
- **i18next** for internationalization
- **Sentry** for error monitoring (production only)
- **Jest 30 + React Testing Library** for testing

### Core Architecture

```
Routes → Custom Hooks (useReducer + React Query) → DataStore Interface
                                                      ├── LocalDataStore (IndexedDB)
                                                      └── SupabaseDataStore (PostgreSQL)
```

**Dual-Mode Operation**:
- **Local mode**: Zero setup, all data in IndexedDB, works offline, no account needed
- **Cloud mode**: Supabase backend for cross-device sync, requires authentication
- User chooses mode at first launch; can migrate data between modes

**Key architectural contracts**:
- `DataStore` interface — backend-agnostic data access (split by domain)
- `AuthService` interface — auth abstraction (`LocalAuthService` = no-op, `SupabaseAuthService` = real)
- Factory pattern — `getDataStore()` returns correct implementation based on mode

**State Management Strategy**:
- **React Query**: All asynchronous data (CRUD, loading states, caching, retry)
- **useReducer**: Complex synchronous state with interdependent fields (editors, timers)
- **useState**: Simple local UI state (modal visibility, form fields)

**Logging**: Centralized in `src/utils/logger.ts`. `logger.debug()` is suppressed in production — do NOT flag it as "logging in production".

### Key Files
<!-- Update this list as your project develops -->
```
src/interfaces/DataStore.ts       — Backend-agnostic data access interface
src/datastore/LocalDataStore.ts   — IndexedDB implementation
src/datastore/SupabaseDataStore.ts — Supabase implementation
src/datastore/factory.ts          — Mode-aware singleton factory
src/interfaces/AuthService.ts     — Auth abstraction interface
src/config/backendConfig.ts       — Backend mode detection
src/config/queryKeys.ts           — React Query cache keys
src/types/index.ts                — Core TypeScript interfaces
src/utils/logger.ts               — Centralized logging
src/utils/transientErrors.ts      — Shared transient error patterns
src/utils/retry.ts                — Retry with exponential backoff + jitter
```

---

## Supabase Cloud Backend Rules

> These rules apply when working on the cloud DataStore implementation. They encode hard-won lessons from building and debugging the Supabase integration.

### Before Starting Supabase Work

1. Read the blueprint: `docs/11-blueprint/08-supabase-playbook.md`
2. Understand the schema: `docs/02-technical/database/supabase-schema.md`
3. Ensure tests pass: `npm test`

### Data Transform Rules

#### Rule 1: Empty String ↔ NULL for Optional String Fields

PostgreSQL `NULL` and `''` are different. The app uses `''` for empty optional fields. Transform at the boundary.

```typescript
// App → DB: empty string becomes NULL
fieldName: entity.fieldName === '' ? null : entity.fieldName,

// DB → App: NULL becomes empty string
fieldName: row.field_name ?? '',
```

**Apply to every optional string field** in your schema. Missing this causes subtle bugs where optional fields lose their "empty" state.

#### Rule 2: Legacy Defaults with Nullish Coalescing

```typescript
// Use ?? (not ||) to preserve falsy values (0, false, '')
homeOrAway: entity.homeOrAway ?? 'home',
isActive: entity.isActive ?? true,
```

`||` treats `0`, `false`, and `''` as falsy and replaces them. `??` only replaces `null`/`undefined`.

#### Rule 3: Array Subset Relationships

When entities have related arrays where one is a subset of another, normalize on both read and write:

```typescript
// If selectedItems ⊆ allItems, enforce the relationship:
isSelected: row.is_selected || row.is_active,  // Active implies selected
```

#### Rule 4: Ordered Collections via order_index

Array ordering in the app must map to an explicit `order_index` column in the database:

```typescript
// App → DB: Array index becomes order_index
items: entity.items.map((item, index) => ({ ...item, order_index: index })),

// DB → App: Sort by order_index, then map back
const items = rows.sort((a, b) => a.order_index - b.order_index).map(toAppType);
```

#### Rule 5: Nested Object Flattening

Nested app objects become flat database columns:

```typescript
// App → DB: Flatten
intensity: entity.ratings.intensity,
creativity: entity.ratings.creativity,

// DB → App: Reconstruct
ratings: { intensity: row.intensity, creativity: row.creativity },
```

#### Rule 6: Composite Uniqueness (App-Level)

If your schema uses simple `UNIQUE(user_id, name)` but the app needs more complex uniqueness (e.g., name + type + season), implement composite checks in the DataStore, not the schema.

#### Rule 7: Cascade Deletes for Related Data

When deleting a parent entity, also clean up references in other entities. Document which deletes cascade and which use SET NULL.

#### Rule 8: JSONB Defaults

```typescript
// Use ?? to preserve null but default undefined
jsonField: entity.jsonField ?? [],           // undefined → empty array
nullableJsonField: entity.field ?? null,     // null is a valid value — preserve it
```

#### Rule 9: createEntity() Must Provide All Defaults

Don't rely on database defaults alone. The app layer should explicitly set all default values for consistency between local and cloud modes.

#### Rule 10: CRUD via Full-Save Pattern

For entities with ordered child collections, save the **entire entity** (not incremental updates). This keeps `order_index` contiguous:

```typescript
async removeItem(entityId, itemIndex) {
  const entity = await this.getById(entityId);
  entity.items.splice(itemIndex, 1);       // Reindex in memory
  return this.save(entityId, entity);       // Full save
}
```

#### Rule 11: Cloud Mode is Online-Only

No offline queue for cloud mode. Operations fail with clear error if offline:

```typescript
if (!navigator.onLine) {
  throw new NetworkError('Cannot save while offline. Please check your connection.');
}
```

#### Rule 12: RPC game_id/entity_id Injection

RPC functions that handle child rows must override the parent ID server-side. Never trust the client to send correct parent IDs in child row data.

```sql
-- Force correct parent_id in child rows
jsonb_set(elem, '{parent_id}', to_jsonb(v_parent_id))
```

#### Rule 13: Computed Fields on Read

If some fields can be computed from other data, compute them when reading from the database (not when writing). This matches LocalDataStore behavior.

#### Rule 14: PostgreSQL Handles Concurrency

No app-level locks needed:
- Single operations: PostgreSQL row-level locks
- Multi-table operations: RPC with transactions
- Conflict resolution: Last-write-wins (appropriate for single-user apps)

#### Rule 15: Numbered SQL Migrations

Use plain SQL files with numeric prefixes. **Never rewrite an RPC function when adding a column** — use a separate migration. Rewriting a function in a migration can break the existing RPC signature if the column doesn't exist yet.

#### Rule 16: RPC for Multi-Table Writes

Use PostgreSQL RPC functions (not multiple API calls) for operations that write to multiple tables atomically. One round-trip, full transaction, all-or-nothing.

---

## For Code Reviewers (AI or Human)

### This is a Local-First PWA with Optional Cloud Sync

Architecture context you MUST understand before reviewing:

**Data Scale & Privacy**
- Single-user per account (no multi-tenant, no collaboration)
- Hundreds of records, not millions
- **Local mode**: Data never leaves device
- **Cloud mode**: Data stored in Supabase, protected by RLS policies

**PWA Behavior**
- PWA installation is impossible in private/incognito mode (by design across all browsers)
- IndexedDB restricted/disabled in private mode
- DO NOT flag "missing private mode detection" — PWAs require persistent storage

### DO NOT Suggest These Patterns

**Enterprise/SaaS** (Not Applicable)
- Audit logging, multi-tenant isolation, RBAC, complex API auth, rate limiting, centralized analytics

**Network Security** (Minimal Network Communication)
- Complex API auth (OAuth/JWT rotation), CORS complexity, request signing

**Data Encryption** (Browser Sandboxing Sufficient)
- Client-side encryption, key management, encryption at rest

**Over-Engineering**
- Heavy schema validation (Zod/Yup) for self-generated data
- Complex caching or query optimization for hundreds of records
- CDN, edge caching, horizontal scaling

### DO Focus On These Areas

- **IndexedDB edge cases**: Quota, corruption, private mode, mobile transient failures
- **Data integrity**: Corruption recovery, backup/restore, migration patterns
- **Performance**: Memory leaks, efficient IndexedDB transactions, bundle size
- **User experience**: Offline-first patterns, helpful error messages, loading states
- **PWA best practices**: Service Worker lifecycle, install prompts, offline capability
- **Browser compatibility**: Cross-browser PWA behavior

---

## Opportunistic Refactoring Policy

**Large files are acceptable when they represent complex features.** Don't refactor for line count alone.

### When to Extract Components

Extract when you're **already touching the file** for a feature — not as standalone cleanup.

### When NOT to Refactor

- Don't refactor in isolation (no standalone "cleanup" PRs)
- Don't "fix" eslint-disables that have explanatory comments
- Don't split working code that has no bugs

### When Adding New eslint-disables

1. First try to fix the underlying issue
2. If disable is truly necessary, add a detailed comment explaining WHY
3. Follow patterns already established in the codebase

---

## Testing Rules and Principles

### Test-First Verification for Deletion/Refactoring

When **deleting or refactoring code** (not creating new features):

1. **Before ANY deletion**: Run full test suite, record baseline
2. **After EACH deletion block**: Run tests immediately
3. **If tests fail**: The deleted code was still needed — restore and investigate
4. **If tests pass**: Safe to continue

### Critical Testing Guidelines

**NEVER SKIP TESTS** unless explicitly requested. Tests catch regressions and ensure quality.

**Test fixes must make the project more robust, not mask issues:**
- Fix underlying problems, don't just make tests pass
- Ensure mocks accurately represent real behavior
- Don't weaken assertions or remove coverage

### Anti-Patterns That Must Never Appear

**1. Fixed Timeouts (FORBIDDEN)**
```typescript
// FORBIDDEN — flaky and unreliable
await new Promise(resolve => setTimeout(resolve, 100));

// REQUIRED — wait for actual conditions
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

**2. Missing act() Wrappers (FORBIDDEN)**
```typescript
// FORBIDDEN — state updates not wrapped
fireEvent.click(button);
expect(result).toBe(true);

// REQUIRED — proper React state handling
await act(async () => {
  fireEvent.click(button);
});
await waitFor(() => expect(result).toBe(true));
```

**3. Issue-Masking Configuration**
```typescript
// FORBIDDEN — these hide real issues
forceExit: true           // Masks resource leaks — never use

// REQUIRED configuration
detectOpenHandles: true   // Always enabled — catches resource leaks
detectLeaks: false        // Disabled: high false-positive rate
forceExit: false          // Never force exit — fix issues properly
```

**4. Console Noise Tolerance (FORBIDDEN)**
Tests should auto-fail on unexpected console warnings/errors. Use an allowlist for known patterns.

### Required Jest Configuration

```javascript
{
  detectOpenHandles: true,  // Catches resources preventing Node exit
  detectLeaks: false,       // Disabled due to false positives
  forceExit: false,         // Never force exit
  testTimeout: 30000,       // 30 seconds (IndexedDB can be slow)
  maxWorkers: process.env.CI ? 2 : '50%',
  slowTestThreshold: 5,     // Warn about tests > 5s
}
```

**Key gotcha**: Jest 30 uses `--testPathPatterns` (plural), NOT `--testPathPattern`. This changed in Jest 30 and causes silent failures if wrong.

### Test Isolation Pattern

```typescript
beforeEach(async () => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  clearMockStore();
  localStorage.clear();
});

afterEach(async () => {
  cleanup();
  await act(async () => {});  // Allow pending updates to complete
});
```

### Async Testing Pattern

```typescript
test('user interaction', async () => {
  render(<Component />);

  // Wait for initial render
  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  // Wrap interactions in act()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  });

  // Wait for state updates
  await waitFor(() => {
    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
```

### Test Fixture Factories (Not Inline Data)

Use centralized fixture factories in `tests/fixtures/`:
```typescript
// Use centralized fixtures
import { TestFixtures } from '../fixtures';
const entity = TestFixtures.entities.default({ name: 'Custom Name' });
```

**Principles**: Deterministic (no random data), override-friendly, realistic defaults, full TypeScript support.

### Test Documentation Standards

Use JSDoc comments with tags:
- `@critical` — Core user workflows (never skip/weaken)
- `@integration` — Component interactions
- `@edge-case` — Boundary conditions and error scenarios
- `@performance` — Performance requirements

### Quality Metrics

- **Pass rate**: 100% (no failing tests in main/master)
- **Flakiness**: 0% (consistent passes)
- **Resource leaks**: 0 (detectOpenHandles catches all)
- **Console warnings**: 0 (auto-fail on unexpected output)
- **Coverage thresholds**: 60% lines, 55% functions, 45% branches (enforced in jest.config.js)

---

## Git, Tests, and CI Rules

### Critical: User Controls All Operations

**NEVER run these operations automatically:**
- `git add`, `git commit`, `git push`
- `npm test`, `npm run build`, `npm run lint`
- Creating branches or pull requests
- Any CI/verification commands

**Always wait for explicit user command.** Do not assume, do not infer, do not "help" by running these proactively.

**Correct workflow:**
1. Make code changes
2. Stop and report: "Changes complete. Ready for your command."
3. Wait for user to say "commit", "push", "run tests", etc.
4. Only then execute the specific command requested

**When uncertain, ASK.** Never assume the user wants you to commit, push, or run tests.

### Review Process

**User reviews and approves every PR — twice:**

1. **Before CREATING the PR**: User says "review changes"
   - Perform senior engineer code review of all changes
   - Check code quality, patterns, consistency
   - Verify acceptance criteria met, tests adequate
   - Look for security issues, edge cases, potential bugs
   - Verify data transform rules (see Supabase section)
   - **DO NOT create the PR until user explicitly approves**

2. **Before MERGING the PR**: User reviews on GitHub and approves
   - **DO NOT merge until user explicitly says to merge**

---

## Vercel Build & ESLint Rules

### Critical Build Guidelines

Code that works in dev may fail in Vercel due to stricter ESLint, different TypeScript settings, and aggressive static analysis. **Always test production build before pushing.**

### Common ESLint/TypeScript Issues

**1. No require() imports**
```typescript
// FORBIDDEN
const fs = require('fs');

// CORRECT
import fs from 'fs';
```

**2. No explicit `any`**
```typescript
// FORBIDDEN
delete (window as any).location;

// CORRECT
delete (window as unknown as { location: unknown }).location;
```

Test files can use limited `any` for mocks (doesn't fail build). Production code: ZERO `any` usage.

**3. No unused variables**
```typescript
// Will fail build
function handler(event, hint) { return event; }

// CORRECT — prefix unused params with underscore
function handler(event, _hint) { return event; }
```

### Prevention Checklist

Before committing:
1. `npm run build` must pass without errors
2. `npm run lint` must pass without errors
3. No `any` types (use `unknown` + type assertions)
4. No `require()` imports (use ES6 imports)
5. No unused variables/parameters
6. Proper type annotations for complex objects

---

## CI/CD Pipeline

### Automated Checks (GitHub Actions)

Every push and PR triggers parallel CI checks. All must pass before merge.

```
Push/PR triggers:
├── ci.yml ──────────── Lint + Type Check + Full Tests + Build + Security Scan
├── test-guards.yml ─── Critical tests + Smoke + Performance + A11y + Build verify
├── claude-code-review.yml ─── AI code review on PRs (Claude Code Action)
├── full-test-suite.yml ────── Comprehensive tests (master push only)
└── update-test-badge.yml ──── Auto-update README test count badge
```

**Key design decisions**:
- **Parallel jobs**: All CI checks run simultaneously for fast feedback
- **Summary gate**: A single `all-checks` job aggregates results — this is the required status check in branch protection
- **Tiered test strategy**: Critical/smoke tests run on every PR; full suite + E2E are opt-in via commit tags (`[full-test]`, `[e2e]`)
- **AI review**: Claude Code Action automatically reviews PRs for quality, bugs, security
- **`--maxWorkers=2`** in CI: CI runners have limited CPU — too many Jest workers causes OOM

### Automatic Deployment (Vercel)

Vercel handles deployment automatically — no GitHub Actions workflow needed:
- **PR push** → Preview deployment (unique URL posted as PR comment)
- **Merge to master** → Production deployment
- Build command: `npm run build` (includes manifest + changelog generation)
- Environment variables set per environment in Vercel dashboard

### Branch Protection

Required for `master`:
- Status checks must pass (`All CI Checks Passed` gate)
- Branches must be up to date
- PR review required (at least 1 approval)

See `docs/11-blueprint/15-build-and-deploy.md` (Section 7) for complete workflow YAML files.

---

## Environment Variables

### Cloud Backend
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key

### Error Reporting
- `NEXT_PUBLIC_SENTRY_DSN` — Sentry DSN (client-side)
- `SENTRY_AUTH_TOKEN` — Sentry auth for source map uploads (server-side)

### Optional
- `NEXT_PUBLIC_SENTRY_FORCE_ENABLE` — Force Sentry in dev (default: false)
- `SENTRY_ORG` — Sentry organization name
- `SENTRY_PROJECT` — Sentry project name
- `ANALYZE` — Enable bundle analysis during build

### Security
- Client-side vars (`NEXT_PUBLIC_*`) validated for secret exposure
- Server-side secrets never use `NEXT_PUBLIC_` prefix
- Environment validation runs automatically during build/startup

---

## Code Quality Principles

- Always investigate thoroughly before implementing
- Review all changes professionally for optimal solutions
- Avoid quick/dirty implementations unless explicitly requested
- Be professional and factual
- Defend quality and best practices even if it means disagreeing
- Ensure `npm run lint` passes before commits and pushes
- Do not run tests, build, or anything unless specifically asked

---

## React & State Management Gotchas

These patterns caused real bugs during development. Internalize them.

### useState Only Uses Initial Value Once

```typescript
// BUG: If `prop` changes, `localValue` stays the same
const [localValue, setLocalValue] = useState(prop);

// FIX: Sync with useEffect
const [localValue, setLocalValue] = useState(prop);
useEffect(() => { setLocalValue(prop); }, [prop]);
```

### Unstable Callback References Cause Infinite Loops

Any function passed as a prop or to a hook must be wrapped in `useCallback`. Unstable references in effect dependency arrays cause infinite re-renders.

### Memoize Return Values from Custom Hooks (MANDATORY)

```typescript
// BUG: New object on every render, all consumers re-render
return { data, isLoading, create };

// FIX: Stable reference
return useMemo(() => ({ data, isLoading, create }), [data, isLoading, create]);
```

**This applies to EVERY custom hook that returns an object.** Treat `useMemo` on hook return values as mandatory, not optional.

### Memoize Context Provider Values

```typescript
// BUG: All consumers re-render on every provider render
return <MyContext.Provider value={{ user, signIn, signOut }}>

// FIX: Memoize the value object
const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
return <MyContext.Provider value={value}>
```

### Ref + State Dual Tracking for Stale Closures

```typescript
// BUG: setTimeout/setInterval callback reads stale state
setTimeout(() => { if (enabled) save(); }, 2000);

// FIX: Use ref for always-current value
const enabledRef = useRef(enabled);
useEffect(() => { enabledRef.current = enabled; }, [enabled]);
setTimeout(() => { if (enabledRef.current) save(); }, 2000);
```

### Debounce Timers Cancelled by Unrelated Re-Renders

If your app has frequent state updates (e.g., a ticking timer), debounced effects will be cancelled on every re-render. Use content-based change detection (serialize to string) instead of object references in effect dependencies.

---

## Error Handling Principles

### Error Taxonomy — Use Typed Error Classes

Define specific error classes (`NetworkError`, `StorageError`, `AuthError`, `ValidationError`) instead of generic `Error`. Different errors need different handling (retry network errors, don't retry validation errors).

### Error Message Sanitization

The `message` field is what the user sees. NEVER include implementation details.

```typescript
// BAD: Leaks implementation details
throw new Error('PostgreSQL error: relation "exercises" does not exist');

// GOOD: User-safe message
throw new StorageError('Unable to save. Please try again.');
```

Put technical details in the `cause` field for Sentry, not in `message`.

### Retry with Exponential Backoff + Jitter

Network operations use retry with exponential backoff and random jitter. Include Chrome Mobile Android's AbortError ("signal is aborted without reason") in transient error patterns.

### Toast Dedup Prevents Spam

Without dedup, a network outage triggers dozens of identical error toasts. Skip if identical message+type is already visible. Cap visible toasts at 5.

### Dynamic Imports for Heavy Dependencies

```typescript
// BAD: Loads Supabase SDK even in local mode
import { SupabaseDataStore } from './SupabaseDataStore';

// GOOD: Only loads when needed
const { SupabaseDataStore } = await import('./SupabaseDataStore');
```

Apply to: Supabase SDK (only in cloud mode), heavy export libraries (only when exporting), complex modals (only when opened).

---

## PWA Gotchas

- **Don't call `skipWaiting()` on install** — activates new SW mid-session, breaking in-progress work. Wait for user to click "Update" button.
- **Cache name must change on every deploy** — include build timestamp or version hash.
- **iOS has no `beforeinstallprompt`** — users must install via Share menu. Show manual instructions.
- **Private/incognito mode disables IndexedDB** — detect early and show clear message.

---

## IndexedDB Gotchas

- **Mobile Chrome has transient IndexedDB failures** — React Query's `retry: 3` handles this. NEVER reduce retries below 3.
- **`readwrite` transactions are serialized** — no app-level locking needed for concurrent writes to the same store.
- **`openDB` should be called once and cached** — don't open a new connection on every call. Cache the promise.

---

## Blueprint Reference

This CLAUDE.md works in tandem with the blueprint documentation. For detailed implementation guidance, see:

| Topic | Blueprint File |
|-------|---------------|
| Build order & phases | `docs/11-blueprint/01-build-sequence.md` |
| Architecture decisions | `docs/11-blueprint/02-decisions.md` |
| Config files (copy-paste) | `docs/11-blueprint/03-configurations.md` |
| Core interfaces | `docs/11-blueprint/04-core-interfaces.md` |
| Data layer (IndexedDB) | `docs/11-blueprint/05-data-layer.md` |
| State & hooks | `docs/11-blueprint/06-state-and-hooks.md` |
| Auth & providers | `docs/11-blueprint/07-auth-and-providers.md` |
| Supabase playbook | `docs/11-blueprint/08-supabase-playbook.md` |
| Sync engine | `docs/11-blueprint/09-sync-engine.md` |
| PWA playbook | `docs/11-blueprint/10-pwa-playbook.md` |
| UI patterns | `docs/11-blueprint/11-ui-patterns.md` |
| Internationalization | `docs/11-blueprint/12-i18n.md` |
| Testing playbook | `docs/11-blueprint/13-testing-playbook.md` |
| Error handling | `docs/11-blueprint/14-error-handling.md` |
| Build & deploy | `docs/11-blueprint/15-build-and-deploy.md` |
| Gotchas & lessons | `docs/11-blueprint/16-gotchas.md` |
