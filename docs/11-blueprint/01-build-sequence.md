# 01. Build Sequence — Phase-by-Phase Order

> **Audience**: AI agent building the new app
> **Purpose**: What to build first, what depends on what. Follow this order.

---

## Dependency Graph

```
Phase 1: Project Scaffolding
    │
    ▼
Phase 2: Core Types & Interfaces ──────────────────────────────┐
    │                                                           │
    ▼                                                           │
Phase 3: Local DataStore (IndexedDB) ◄──── Types + Interface   │
    │                                                           │
    ▼                                                           │
Phase 4: React Query + Hooks ◄──── DataStore                   │
    │                                                           │
    ▼                                                           │
Phase 5: UI Components + Routes ◄──── Hooks + React Query      │
    │                                                           │
    ▼                                                           │
Phase 6: i18n ◄──── UI Components                              │
    │                                                           │
    ▼                                                           │
Phase 7: Testing Infrastructure ◄──── All of the above         │
    │                                                           │
    ▼                                                           │
Phase 8: PWA Setup ◄──── Working App                           │
    │                                                           │
    ▼                                                           │
Phase 9: Supabase Backend ◄──── Types + Interfaces ────────────┘
    │
    ▼
Phase 10: Auth Layer ◄──── Supabase Client
    │
    ▼
Phase 11: Cloud DataStore ◄──── Auth + Supabase
    │
    ▼
Phase 12: Sync Engine ◄──── Both DataStores
    │
    ▼
Phase 13: Migration Service ◄──── Both DataStores + Auth
    │
    ▼
Phase 14: Error Monitoring (Sentry)
    │
    ▼
Phase 15: Build & Deploy
```

**Key insight**: The local app is fully functional by Phase 8. Cloud features (Phases 9-13) build on top without changing any local-mode code. This is by design.

---

## Phase 1: Project Scaffolding (Day 1)

**Goal**: Running Next.js app with all configs in place.

### Steps
1. `npx create-next-app@latest` with App Router, TypeScript, Tailwind, ESLint
2. Copy config files from [03-configurations.md](./03-configurations.md):
   - `tsconfig.json` — path aliases, strict mode
   - `jest.config.js` — test runner setup
   - `eslint.config.mjs` — linting rules
   - `tailwind.config.js` — theme customization
   - `postcss.config.mjs` — Tailwind 4 plugin
3. Set up directory structure:

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout (fonts, metadata, providers)
│   ├── page.tsx            # Dashboard/home
│   ├── practice/
│   │   ├── page.tsx        # Practice list
│   │   └── [id]/page.tsx   # Practice editor
│   ├── exercises/
│   │   ├── page.tsx        # Exercise library
│   │   └── [id]/page.tsx   # Exercise detail
│   ├── calendar/page.tsx   # Training calendar
│   ├── roster/page.tsx     # Player management
│   └── settings/page.tsx   # App settings
├── features/               # Feature-based modules
│   ├── practice/           # Practice session feature
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   ├── exercise-library/   # Exercise management
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   ├── field-diagram/      # Interactive canvas
│   │   ├── components/
│   │   └── hooks/
│   ├── attendance/
│   ├── roster/
│   └── settings/
├── interfaces/             # DataStore, AuthService contracts
├── datastore/              # Backend implementations
├── auth/                   # Auth implementations
├── contexts/               # React contexts
├── config/                 # App configuration
├── types/                  # TypeScript type definitions
├── utils/                  # Shared utilities
├── styles/                 # Global styles
└── test-utils/             # Test helpers
```

4. Install dependencies from [03-configurations.md](./03-configurations.md)
5. Set up `.env.local` from `.env.example`
6. Verify: `npm run dev` shows default page, `npm run lint` passes

### Deliverables
- [ ] Running Next.js app at localhost:3000
- [ ] All config files in place
- [ ] Directory structure created
- [ ] Lint + type-check pass

---

## Phase 2: Core Types & Interfaces (Day 1-2)

**Goal**: Define the data model and backend contracts. Everything else plugs into these.

### Steps
1. Define domain types (see [17-data-model-sketch.md](./17-data-model-sketch.md)):
   - `src/types/practice.ts` — PracticeSession, PracticeBlock, AttendanceRecord
   - `src/types/exercise.ts` — Exercise, FieldDiagram, ExerciseVariation
   - `src/types/template.ts` — PracticeTemplate, TemplateBlock
   - `src/types/index.ts` — Player, Team, Season, re-exports
   - `src/types/settings.ts` — AppSettings + defaults
   - `src/types/personnel.ts` — Personnel types

2. Define DataStore interfaces (split by domain):
   - `src/interfaces/stores/PlayerStore.ts`
   - `src/interfaces/stores/ExerciseStore.ts`
   - `src/interfaces/stores/PracticeStore.ts`
   - `src/interfaces/stores/TemplateStore.ts`
   - `src/interfaces/stores/AttendanceStore.ts`
   - `src/interfaces/stores/TeamStore.ts`
   - `src/interfaces/stores/SeasonStore.ts`
   - `src/interfaces/stores/SettingsStore.ts`
   - `src/interfaces/DataStore.ts` — composition root (extends all stores)

3. Define error types:
   - `src/interfaces/DataStoreErrors.ts` — typed error classes

4. Define AuthService interface:
   - `src/interfaces/AuthService.ts`
   - `src/interfaces/AuthTypes.ts`

### Deliverables
- [ ] All domain types defined with full TypeScript interfaces
- [ ] DataStore interface (split by domain) defined
- [ ] AuthService interface defined
- [ ] Error types defined
- [ ] Type-check passes

---

## Phase 3: Local DataStore — IndexedDB (Day 2-4)

**Goal**: Working data persistence with IndexedDB. The app can save and load data.

### Steps
1. Set up IndexedDB adapter:
   - `src/utils/storage.ts` — get/set/remove with `idb` library
   - `src/utils/idGenerator.ts` — UUID generation
   - `src/utils/logger.ts` — centralized logging

2. Implement domain stores (LocalDataStore):
   - `src/datastore/local/LocalPlayerStore.ts`
   - `src/datastore/local/LocalExerciseStore.ts`
   - `src/datastore/local/LocalPracticeStore.ts`
   - `src/datastore/local/LocalTemplateStore.ts`
   - `src/datastore/local/LocalAttendanceStore.ts`
   - `src/datastore/local/LocalSettingsStore.ts`
   - etc.

3. Create composition root:
   - `src/datastore/LocalDataStore.ts` — combines all local stores

4. Create factory:
   - `src/datastore/factory.ts` — singleton access via `getDataStore()`

5. Write tests for each store (with `fake-indexeddb`)

### Deliverables
- [ ] All domain stores implemented against IndexedDB
- [ ] Factory returns correct store instance
- [ ] Tests pass for all CRUD operations
- [ ] Data persists across page reloads (manual test)

---

## Phase 4: React Query + Hooks (Day 4-6)

**Goal**: Hooks that provide data to components with caching, loading states, and mutations.

### Steps
1. Set up React Query:
   - `src/app/QueryProvider.tsx` — QueryClientProvider with config
   - `src/config/queryKeys.ts` — cache key constants

2. Create data hooks (one per entity):
   - `src/features/roster/hooks/useRoster.ts` — players CRUD
   - `src/features/exercise-library/hooks/useExercises.ts` — exercises CRUD
   - `src/features/practice/hooks/usePracticeSessions.ts` — practices CRUD
   - `src/features/practice/hooks/usePracticeEditor.ts` — single practice editing
   - `src/features/attendance/hooks/useAttendance.ts` — attendance tracking
   - etc.

3. Create state hooks (for synchronous state):
   - `src/features/practice/hooks/usePracticeBlockReducer.ts` — block ordering, timing
   - `src/features/practice/hooks/usePracticeHistory.ts` — undo/redo for block edits

4. Wire QueryProvider into layout:
   - `src/app/layout.tsx` — wrap with QueryProvider

### Deliverables
- [ ] QueryProvider configured
- [ ] Data hooks for all entities
- [ ] Loading/error states work
- [ ] Cache invalidation works (create → list updates)

---

## Phase 5: UI Components + Routes (Day 6-12)

**Goal**: Working UI for all features using local data.

### Steps
1. Build shared components:
   - Navigation (sidebar or tab bar)
   - Confirmation dialogs
   - Form patterns (inputs, selects, text areas)
   - Loading/error states

2. Build feature routes (one at a time):
   - **Dashboard** (`/`) — recent practices, quick actions
   - **Exercise Library** (`/exercises`) — browse, search, filter, create
   - **Exercise Editor** (`/exercises/[id]`) — edit exercise + field diagram
   - **Practice Editor** (`/practice/[id]`) — build practice plan from blocks
   - **Practice List** (`/practice`) — view past/upcoming practices
   - **Roster** (`/roster`) — player management
   - **Calendar** (`/calendar`) — month/week view of practices
   - **Settings** (`/settings`) — app configuration

3. Build the interactive field diagram editor:
   - Canvas component for field rendering
   - Player markers (drag/place)
   - Equipment markers (cones, goals)
   - Movement arrows
   - This is the most complex UI component — allocate extra time

### Deliverables
- [ ] All routes render with real data
- [ ] CRUD operations work for all entities
- [ ] Field diagram editor works
- [ ] Practice editor with block timeline works
- [ ] Responsive on mobile

---

## Phase 6: Internationalization (Day 12-13)

**Goal**: App supports multiple languages.

### Steps
1. Set up i18next (see [12-i18n.md](./12-i18n.md)):
   - `src/i18n.ts` — i18next initialization
   - `src/components/I18nInitializer.tsx` — client-side init
   - `public/locales/en/common.json` — English translations
   - `public/locales/fi/common.json` — Finnish translations (or your languages)

2. Extract all hardcoded strings to translation keys
3. Generate TypeScript types: `npm run generate:i18n-types`

### Deliverables
- [ ] Language switching works
- [ ] All user-visible strings translated
- [ ] Type-safe translation keys

---

## Phase 7: Testing (Day 13-15)

**Goal**: Comprehensive test coverage. Set up patterns for ongoing testing.

### Steps
1. Set up test infrastructure (see [13-testing-playbook.md](./13-testing-playbook.md)):
   - `src/setupTests.mjs` — global mocks, console suppression
   - `tests/fixtures/` — factory functions for test data
   - `tests/utils/` — test helpers

2. Write tests (priority order):
   - DataStore unit tests (highest priority — data integrity)
   - Hook tests (business logic)
   - Component tests (user interactions)
   - Integration tests (full workflows)

### Deliverables
- [ ] Test infrastructure set up
- [ ] DataStore tests: 100% method coverage
- [ ] Hook tests: all business logic covered
- [ ] Component tests: critical interactions covered
- [ ] All tests pass, zero flaky tests

---

## Phase 8: PWA Setup (Day 15-16)

**Goal**: App installable on mobile/desktop, works offline.

### Steps
1. Create service worker: `public/sw.js` (see [10-pwa-playbook.md](./10-pwa-playbook.md))
2. Create manifest: `scripts/generate-manifest.mjs`
3. Create offline page: `public/offline.html`
4. Create install prompt: `src/components/InstallPrompt.tsx`
5. Create update banner: `src/components/UpdateBanner.tsx`
6. Register SW: `src/components/ServiceWorkerRegistration.tsx`

### Deliverables
- [ ] App installable from browser
- [ ] Offline page shows when network unavailable
- [ ] Update notification when new version deployed
- [ ] Icons and splash screens configured

---

## Phase 9: Supabase Backend (Day 16-19)

**Goal**: Cloud database ready for data storage.

### Steps
1. Create Supabase project (staging + production)
2. Write schema migration: `supabase/migrations/000_schema.sql`
3. Write RPC functions: `supabase/migrations/001_rpc_functions.sql`
4. Write RLS policies: `supabase/migrations/002_rls_policies.sql`
5. Create Edge Functions (if needed):
   - `supabase/functions/delete-account/` — GDPR account deletion
6. Apply migrations to staging
7. Set up Supabase client:
   - `src/datastore/supabase/client.ts` — singleton with timeout

### Deliverables
- [ ] Schema deployed to staging
- [ ] RLS policies active
- [ ] Client singleton configured
- [ ] Can read/write data from staging (manual test)

---

## Phase 10: Auth Layer (Day 19-21)

**Goal**: Users can sign up, log in, and manage their account.

### Steps
1. Implement SupabaseAuthService:
   - `src/auth/SupabaseAuthService.ts`
2. Implement LocalAuthService (no-op):
   - `src/auth/LocalAuthService.ts`
3. Create AuthProvider context:
   - `src/contexts/AuthProvider.tsx`
4. Create auth UI:
   - Login/signup forms
   - Password reset flow
5. Wire auth into layout

### Deliverables
- [ ] Sign up with email/password works
- [ ] Login/logout works
- [ ] Password reset works
- [ ] Session persists across page reloads
- [ ] Auth state available to all components via context

---

## Phase 11: Cloud DataStore (Day 21-24)

**Goal**: Supabase implementation of the DataStore interface.

### Steps
1. Implement domain stores (SupabaseDataStore):
   - Same interface as local stores, but writes to PostgreSQL
   - Transform rules: app types ↔ database columns
2. Update factory to return SupabaseDataStore in cloud mode
3. Create backend config:
   - `src/config/backendConfig.ts` — mode detection, switching
4. Test with staging Supabase

### Deliverables
- [ ] All CRUD operations work against Supabase
- [ ] Transform rules correct (null ↔ empty string, etc.)
- [ ] Mode switching works (local ↔ cloud)
- [ ] Local mode unaffected by cloud code

---

## Phase 12: Sync Engine (Day 24-26)

**Goal**: Local-first operation with background cloud sync.

### Steps (OPTIONAL — only if local-first cloud sync needed)
1. Create SyncQueue (IndexedDB-backed operation queue)
2. Create SyncEngine (orchestration, retry, conflict resolution)
3. Create SyncedDataStore (writes local + queues for cloud)
4. Wire into factory for cloud mode

### Deliverables
- [ ] Writes go to local immediately
- [ ] Background sync to cloud
- [ ] Conflict resolution works
- [ ] Network errors handled gracefully

---

## Phase 13: Migration Service (Day 26-27)

**Goal**: Users can move data between local and cloud modes.

### Steps
1. Create migration service: local → cloud transfer
2. Create reverse migration: cloud → local transfer
3. Create migration UI (wizard/modal)

### Deliverables
- [ ] Local → cloud migration works
- [ ] Cloud → local migration works
- [ ] Progress feedback during migration
- [ ] Data integrity verified after migration

---

## Phase 14: Error Monitoring (Day 27-28)

**Goal**: Production errors reported automatically.

### Steps (see [14-error-handling.md](./14-error-handling.md))
1. Set up Sentry: `src/instrumentation-client.ts`
2. Create error boundary: `src/components/ErrorBoundary.tsx`
3. Create global error page: `src/app/global-error.tsx`
4. Configure source map uploads

### Deliverables
- [ ] Errors reported to Sentry in production
- [ ] Error boundary catches React crashes
- [ ] Source maps uploaded for readable stack traces

---

## Phase 15: Build & Deploy (Day 28-29)

**Goal**: App deployed to production.

### Steps (see [15-build-and-deploy.md](./15-build-and-deploy.md))
1. Configure Vercel project
2. Set environment variables
3. Deploy to preview → test
4. Deploy to production

### Deliverables
- [ ] Preview deployment works
- [ ] Production deployment works
- [ ] Environment variables configured per environment
- [ ] Build passes with zero warnings

---

## Timeline Summary

| Phase | Days | Status After |
|-------|------|-------------|
| 1-2 | 1-2 | Scaffolding + types ready |
| 3-4 | 2-6 | Local data layer working |
| 5-6 | 6-13 | Full local app with UI |
| 7-8 | 13-16 | Tested + installable PWA |
| 9-13 | 16-27 | Cloud backend + sync |
| 14-15 | 27-29 | Monitored + deployed |

**The local-only app is usable by Day 16.** Cloud features add ~11 more days.
