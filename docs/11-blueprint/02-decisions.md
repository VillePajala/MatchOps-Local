# 02. Architecture Decision Log

> **Audience**: AI agent building the new app
> **Purpose**: Every major technology and architecture decision with WHY it was made. Follow these decisions unless you have a strong, documented reason to deviate.

---

## How to Read This Document

Each decision follows this format:
- **Decision**: What was chosen
- **Why**: The reasoning (THIS IS THE IMPORTANT PART — understand it)
- **Alternatives considered**: What was rejected and why
- **Implication for new app**: Whether to follow the same decision or deviate

---

## Framework & Runtime

### D1: Next.js with App Router

**Decision**: Next.js (App Router, not Pages Router)
**Why**:
- App Router is the future of Next.js — Pages Router is legacy
- Server components for metadata, SEO pages (privacy policy, terms)
- Built-in TypeScript support, no separate build config
- File-based routing (even though MatchOps-Local uses mostly one route)
- Built-in image optimization, font loading, metadata API
- Vercel deployment is zero-config

**Alternatives considered**:
- Vite + React: Lighter, but no SSR/SSG for SEO pages, no built-in API routes
- Remix: Good alternative, but smaller ecosystem, fewer deployment targets
- Plain React (CRA): Dead project, no longer maintained

**Implication for new app**: **Follow this decision.** Use Next.js App Router. The new app should actually USE multiple routes (unlike MatchOps which crams everything into one page — see D8).

### D2: React 19

**Decision**: React 19 (latest stable)
**Why**:
- Concurrent features (transitions, suspense) improve UX
- `use` hook for promises
- Improved `act()` behavior in tests
- Server Components support

**Implication for new app**: **Follow. Use latest React.**

### D3: TypeScript (Strict Mode)

**Decision**: TypeScript with strict mode enabled
**Why**:
- Catches type errors at compile time, not runtime
- Self-documenting code via interfaces
- Essential for AI agents — types provide the "shape" of the codebase
- Strict mode prevents null reference errors, implicit any

**Implication for new app**: **Follow. Non-negotiable.**

---

## Styling

### D4: Tailwind CSS 4

**Decision**: Tailwind CSS (utility-first, no CSS modules, no styled-components)
**Why**:
- Zero runtime overhead (compile-time only)
- No naming decisions (no `.card-header-active` bikeshedding)
- Responsive design via utilities (`sm:`, `md:`, `lg:`)
- Dark mode support via `dark:` prefix
- Small bundle size — only used utilities are included
- Excellent DX with IntelliSense

**Alternatives considered**:
- CSS Modules: More isolation, but more files, more naming
- styled-components: Runtime overhead, SSR complexity
- Emotion: Same issues as styled-components
- Plain CSS: No utility classes, verbose

**Implication for new app**: **Follow this decision.**

---

## Data Persistence

### D5: IndexedDB for Local Storage (via `idb` library)

**Decision**: IndexedDB as the primary local storage, accessed through the `idb` library
**Why**:
- localStorage has 5-10MB limit — insufficient for 100+ games with embedded events
- IndexedDB has 50MB+ quota (typically much more)
- Structured data with indexes for querying
- Transactional — prevents partial writes
- `idb` library wraps the ugly IndexedDB API in promises

**Alternatives considered**:
- localStorage: 5MB limit, synchronous (blocks UI), string-only
- SQLite (via WASM): Good option, but heavier, more complex setup
- OPFS (Origin Private File System): Too new, limited browser support
- Dexie.js: Also good IndexedDB wrapper, but `idb` is lighter and sufficient

**Key lesson learned**: IndexedDB on mobile (especially Chrome Android) has transient failures. You MUST have retry logic. React Query's built-in `retry: 3` handles this naturally.

**Implication for new app**: **Follow this decision.** Use `idb` library. Keep retry logic.

### D6: Dual-Mode Architecture (Local + Cloud)

**Decision**: The app works in two modes:
1. **Local mode**: All data in IndexedDB, no account needed, fully offline
2. **Cloud mode**: Data in Supabase PostgreSQL, requires authentication

**Why**:
- Lowers barrier to entry (no signup required to start using)
- Works offline out of the box
- Cloud sync is opt-in for users who want cross-device access
- Prevents vendor lock-in (users always have local data)

**Alternatives considered**:
- Cloud-only: Simpler, but requires account creation upfront, fails offline
- Local-only: No cross-device sync, no backup
- Local-first with automatic sync: More complex, conflict resolution headaches

**Implication for new app**: **Follow this decision.** The dual-mode pattern is a strong differentiator.

### D7: DataStore Abstraction Interface

**Decision**: A TypeScript interface (`DataStore`) that both `LocalDataStore` and `SupabaseDataStore` implement. A factory function returns the correct implementation based on the current mode.

**Why**:
- All business logic is backend-agnostic
- Easy to test (mock the interface)
- Can add new backends (e.g., SQLite) without changing UI
- Mode switching is transparent to components

**What to do differently**: In MatchOps-Local, the DataStore interface is a **god interface** with ~40 methods. This was a mistake. **Split it into domain-specific store interfaces** (see `17-data-model-sketch.md`). The composition root can still be a single `DataStore` type that extends all domain stores.

**Implication for new app**: **Follow the pattern, but split by domain.**

---

## State Management

### D8: Single-Page Orchestrator (MatchOps-Local) → Multi-Route (New App)

**Decision in MatchOps-Local**: Everything runs on a single route (`page.tsx`), with a single orchestrator component that manages all state via hooks.

**Why it was done this way**:
- The game tracker is inherently a single-screen app (field + controls)
- All state is interconnected (timer affects score, score affects events, events affect field)
- Avoids state serialization/deserialization between routes

**Why to do it differently in the new app**:
- Practice planning has distinct screens (exercise library, practice editor, calendar, roster)
- These screens don't share real-time state (unlike a game timer)
- Multi-route reduces initial bundle size
- Easier to reason about — each route is self-contained

**Implication for new app**: **DEVIATE. Use proper Next.js routes:**
```
src/app/
├── page.tsx              — Dashboard / home
├── practice/
│   ├── page.tsx          — Practice list
│   └── [id]/page.tsx     — Practice editor
├── exercises/
│   ├── page.tsx          — Exercise library
│   └── [id]/page.tsx     — Exercise detail/editor
├── calendar/page.tsx     — Training calendar
├── roster/page.tsx       — Player management
└── settings/page.tsx     — App settings
```

### D9: React Query for Async Data

**Decision**: React Query (TanStack Query) for all asynchronous data fetching, caching, and mutation
**Why**:
- Automatic caching with stale-while-revalidate
- Built-in retry logic (critical for IndexedDB mobile flakiness)
- Loading/error states for free
- Optimistic updates
- Query invalidation handles cache consistency
- `queryClient.invalidateQueries()` is far simpler than manual cache management

**Alternatives considered**:
- Redux Toolkit Query: Good, but heavier, requires Redux ecosystem
- SWR: Similar to React Query but fewer features (no mutations, no optimistic updates)
- Zustand: Good for synchronous state, but doesn't handle async data lifecycle
- Manual useState + useEffect: Reinventing the wheel, no caching, no retry

**Key configuration lesson**: Do NOT reduce React Query's default `retry: 3`. IndexedDB on mobile Chrome has transient failures that need multiple retries. Attempted optimization (fewer retries, longer staleTime) caused mobile loading failures.

**Implication for new app**: **Follow this decision exactly.**

### D10: useReducer for Complex Synchronous State

**Decision**: `useReducer` for state that must update synchronously and has many interdependent fields (like game score + timer + period tracking)

**Why**:
- Synchronous updates (unlike React Query which is async)
- Single dispatch updates multiple related fields atomically
- Action types document all possible state transitions
- Easy to add undo/redo wrapper (see D11)
- Predictable: same action + same state = same result

**When NOT to use useReducer**: If the data is fetched from storage (async) and doesn't need synchronous multi-field updates, use React Query instead.

**Implication for new app**: The practice editor likely needs a reducer for the block timeline (reordering, adding, removing blocks is a synchronous multi-step operation). But exercise library browsing should use React Query.

### D11: Undo/Redo via History Wrapper

**Decision**: Wrap `useReducer` with a history hook (`useGameSessionWithHistory`) that captures state snapshots before each action

**Why**:
- Users expect undo/redo in editors
- Implemented as a wrapper, not baked into the reducer — separation of concerns
- Fixed-size history buffer (150 entries) prevents memory issues

**Implication for new app**: **Follow this pattern** for the practice editor. Undo/redo is essential for drag-and-drop timeline editing.

---

## Authentication

### D12: Supabase Auth (Email/Password)

**Decision**: Supabase Auth with email/password only (no social providers)
**Why**:
- Supabase Auth is free, built-in, zero additional infrastructure
- Email/password is simplest for initial launch
- Row-Level Security (RLS) integrates natively with Supabase Auth
- Social providers can be added later without changing architecture

**Alternatives considered**:
- Firebase Auth: Would require Firebase for auth + Supabase for data = unnecessary split
- Auth0: Additional service, cost, complexity
- NextAuth.js: Good for SSR apps, but this is a client-side PWA
- Custom JWT: Security risk, maintenance burden

**Implication for new app**: **Follow this decision.** Same Supabase project can host both apps if desired.

### D13: AuthService Abstraction

**Decision**: An `AuthService` interface with `LocalAuthService` (no-op) and `SupabaseAuthService` implementations
**Why**:
- Local mode has no auth — `LocalAuthService` returns dummy user
- Cloud mode needs real auth — `SupabaseAuthService` handles it
- Components don't care which mode — they just call `authService.getUser()`

**Implication for new app**: **Copy this pattern exactly.**

---

## Cloud Backend

### D14: Supabase (Not Firebase, Not Custom)

**Decision**: Supabase for cloud backend (PostgreSQL + Auth + Edge Functions)
**Why**:
- Open source — no vendor lock-in (can self-host if needed)
- PostgreSQL — real relational database with proper joins, constraints, transactions
- Row-Level Security — security at the database level, not app level
- Edge Functions — Deno-based serverless functions
- Generous free tier for small-scale apps
- Realtime subscriptions available if needed later

**Alternatives considered**:
- Firebase: NoSQL (Firestore) is painful for relational data, vendor lock-in
- PlanetScale: MySQL, no built-in auth
- Custom backend (Express/Fastify): Full control, but massive maintenance burden
- Appwrite: Good alternative, but smaller ecosystem

**Implication for new app**: **Follow this decision.**

### D15: RPC for Multi-Table Writes

**Decision**: Use PostgreSQL RPC functions (not multiple API calls) for operations that write to multiple tables atomically

**Why**:
- Saves a game = write to `games` + `game_players` + `game_events` + `game_assessments` + `tactical_data` — that's 5 tables
- Individual API calls: 5 round-trips, risk of partial failure
- RPC: 1 round-trip, full transaction, all-or-nothing

**Implication for new app**: **Follow this decision.** Saving a practice session = write to `practice_sessions` + `practice_blocks` + `attendance` — same pattern.

### D16: Numbered SQL Migrations

**Decision**: Plain SQL migration files with numeric prefixes (`000_schema.sql`, `001_rpc_functions.sql`, ...)
**Why**:
- Version-controlled schema changes
- Can be applied to staging and production independently
- Reviewable in PRs
- No ORM magic — you see exactly what SQL runs

**Key lesson**: NEVER rewrite an RPC function when adding a column — use a separate migration. Rewriting a function in a migration can break the existing RPC signature.

**Implication for new app**: **Follow this decision.**

---

## PWA

### D17: Custom Service Worker (Not Workbox)

**Decision**: Hand-written service worker (`public/sw.js`) with explicit cache strategies
**Why**:
- Full control over caching behavior
- Simple enough for this app (not thousands of routes)
- Workbox adds complexity and dependency for minimal benefit at this scale
- Can handle offline page, update notifications, cache versioning

**Alternatives considered**:
- Workbox: More features, but overkill for single-page app
- next-pwa: Abandoned/unmaintained for App Router
- Serwist: Good Next.js PWA library, but custom SW gives more control

**Implication for new app**: **Follow this decision.** Copy the service worker pattern.

### D18: Dynamic Manifest Generation

**Decision**: Build-time script generates `manifest.json` based on environment/branch
**Why**:
- Different app names for dev/staging/production
- Different theme colors per environment (visual distinction)
- Automated — no manual manifest editing

**Implication for new app**: **Follow this decision.**

---

## Testing

### D19: Jest (Not Vitest)

**Decision**: Jest 30 with React Testing Library
**Why**:
- Mature, well-documented, huge ecosystem
- Built-in mocking, timers, snapshots
- React Testing Library encourages testing user behavior, not implementation
- Next.js has built-in Jest support

**Alternatives considered**:
- Vitest: Faster, native ESM, but Next.js integration is less mature
- Playwright/Cypress for unit tests: Wrong tool — these are E2E tools

**Key gotcha**: Jest 30 uses `--testPathPatterns` (plural), NOT `--testPathPattern`. This changed in Jest 30 and will cause silent failures if wrong.

**Implication for new app**: **Follow this decision.** Vitest is a reasonable alternative if Next.js support improves, but Jest is the safe choice.

### D20: Test Fixture Factories (Not Inline Data)

**Decision**: Centralized fixture factories in `tests/fixtures/` that generate typed test data
**Why**:
- DRY — no scattered inline `{ id: '123', name: 'Test' }` objects
- Type-safe — factories return proper TypeScript types
- Deterministic — no random data, reproducible tests
- Customizable — override specific fields: `createPlayer({ name: 'Custom' })`

**Implication for new app**: **Follow this decision.** Create fixture factories from day 1.

---

## Error Handling

### D21: Sentry for Production Error Monitoring

**Decision**: Sentry SDK for client-side, server-side, and edge error reporting
**Why**:
- Automatic error grouping, stack traces, breadcrumbs
- Session replay for debugging user issues
- Performance monitoring (traces)
- Free tier sufficient for small apps

**Implication for new app**: **Follow this decision.**

### D22: Error Taxonomy (Typed Error Classes)

**Decision**: Custom error classes (`NetworkError`, `StorageError`, `AuthError`, `ValidationError`) instead of generic `Error`
**Why**:
- Different errors need different handling (retry network errors, don't retry validation errors)
- User-facing messages differ by error type
- Sentry grouping is better with typed errors
- catch blocks can be specific: `catch (e) { if (e instanceof NetworkError) ... }`

**Implication for new app**: **Copy the error taxonomy exactly.**

### D23: Retry with Exponential Backoff + Jitter

**Decision**: Network operations use retry with exponential backoff and random jitter
**Why**:
- Transient network failures are common on mobile
- Backoff prevents thundering herd on server recovery
- Jitter prevents synchronized retry storms
- Configurable per-operation (auth: fewer retries, data sync: more retries)

**Implication for new app**: **Copy `retry.ts` and `transientErrors.ts` exactly.**

---

## Internationalization

### D24: i18next (Not react-intl, Not next-intl)

**Decision**: i18next with react-i18next for client-side translations
**Why**:
- Most popular i18n library for React
- Namespace support (split translations by feature)
- Interpolation, pluralization, context
- TypeScript type generation for translation keys
- Works in PWA/client-only mode (no server-side needed)

**Alternatives considered**:
- next-intl: Good for SSR, but this is a client-side PWA
- react-intl (FormatJS): Good, but smaller ecosystem
- DIY: Never do this

**Implication for new app**: **Follow this decision.**

---

## Deployment

### D25: Vercel

**Decision**: Vercel for hosting and deployment
**Why**:
- Zero-config Next.js deployment (same company)
- Automatic preview deployments for PRs
- Edge functions, CDN, SSL — all included
- Free tier sufficient for small apps
- Environment variable management per branch

**Implication for new app**: **Follow this decision.**

---

## What to Do Differently (Lessons Learned)

### LD1: Feature-Based Directory Structure

**MatchOps did**: Flat `src/components/` with 100+ files
**New app should**: Feature-based directories (see `01-build-sequence.md`)
**Why**: Finding components in a flat list of 100+ is painful. Feature grouping makes navigation natural.

### LD2: Split DataStore by Domain

**MatchOps did**: Single `DataStore` interface with ~40 methods
**New app should**: Domain-specific store interfaces composed into one type
**Why**: Monolithic implementations (2600-4700 lines) are hard to navigate and test.

### LD3: Use Proper Routes

**MatchOps did**: Single-page orchestrator (`page.tsx` = 1240 lines)
**New app should**: Next.js file-based routes per feature
**Why**: Practice planning has distinct screens; they don't share real-time state.

### LD4: Simpler Storage Adapter Layer

**MatchOps did**: 6 layers of storage abstraction (storage.ts → storageAdapter → storageFactory → indexedDbKvAdapter → etc.)
**New app should**: `idb` library used directly in store implementations, one thin adapter if needed
**Why**: Layers accumulated organically during migration from localStorage. A fresh start doesn't need them.

### LD5: Smaller Hooks

**MatchOps did**: `useGameOrchestration` with 17+ dependencies
**New app should**: Route-level hooks with <8 dependencies each
**Why**: Route-based architecture naturally prevents mega-hooks since state is scoped to routes.

### LD6: Modal System

**MatchOps did**: 40+ modal components with central `ModalProvider` + `modalReducer`
**New app should**: Feature-owned modals using `@headlessui/react` Dialog directly. Generic `ConfirmDialog` and `FormDialog` patterns, not a central registry.
**Why**: Central modal registry adds complexity. Features should own their UI.
