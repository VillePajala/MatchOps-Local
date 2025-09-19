# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `npm run dev` - Start development server (Next.js)
- `npm run build` - Build for production (includes manifest generation)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run all Jest tests (executes `jest`)
- `npm run test:unit` - Alias for `npm test`
- `npm run generate:i18n-types` - Generate TypeScript types for translations

### Build Process
The build process includes a custom manifest generation step that runs before Next.js build:
- `node scripts/generate-manifest.mjs` - Generates PWA manifest based on branch
- Manifest configuration varies by branch (master vs development) for different app names and themes

## Architecture Overview

### Tech Stack
- **Next.js 15** with App Router
- **React 19** with TypeScript
- **Tailwind CSS 4** for styling
- **PWA** with custom service worker
- **Browser localStorage** for data persistence
- **React Query** for state management
- **i18next** for internationalization (English/Finnish)

### Core Architecture

**Data Flow**: The app's data layer relies on **React Query** to fetch, cache, and manage server-side state (persisted in localStorage). Asynchronous wrappers in `src/utils/localStorage.ts` are used for direct localStorage access. This approach centralizes data fetching and reduces manual state management.

**PWA Structure**: The app is a full PWA with:
- Custom service worker (`public/sw.js`)
- Dynamic manifest generation based on git branch
- Install prompts and update notifications

**State Management**: 
- **`src/app/page.tsx`**: Acts as the central orchestrator, bringing together different state management strategies.
- **`useReducer` (`useGameSessionReducer.ts`)**: Manages the core game session state, including score, timer, periods, and game metadata. This provides predictable state transitions.
- **`useGameState` hook**: Manages the interactive state of the soccer field, including player positions on the field and drawings.
- **React Query**: Handles all asynchronous data operations, such as fetching and updating the master roster, seasons, tournaments, and saved games.
- **`useState`**: Used for managing local UI state within components (e.g., modal visibility).

**Key Components**:
- `SoccerField` - Interactive drag-and-drop field
- `PlayerBar` - Player roster management
- `ControlBar` - Main app controls
- Various modals for game settings, stats, and management

**Data Persistence**: All data is stored in browser localStorage with async wrappers in `src/utils/localStorage.ts`. Key data includes:
- Player roster (`src/utils/masterRosterManager.ts`)
- Game saves (`src/utils/savedGames.ts`)
- Seasons and tournaments (`src/utils/seasons.ts`, `src/utils/tournaments.ts`)
- App settings (`src/utils/appSettings.ts`)

**Logging**: Centralized logging system with environment-aware behavior:
- `src/utils/logger.ts` - Type-safe logger utility with development/production modes
- Replaces direct `console.*` usage throughout the application
- Comprehensive test coverage in `src/utils/logger.test.ts`
- Integration tests in `src/components/__tests__/logger-integration.test.tsx`

**Error Monitoring**: Sentry integration for production error tracking:
- **Configuration Files**:
  - `src/instrumentation-client.ts` - Client-side Sentry initialization with router tracking
  - `sentry.server.config.ts` - Server-side error capture configuration
  - `sentry.edge.config.ts` - Edge runtime error handling
  - `src/app/global-error.tsx` - Global error boundary with user-friendly UI and Sentry reporting
- **Environment-Aware Setup**:
  - Only initializes in production by default (or when `NEXT_PUBLIC_SENTRY_FORCE_ENABLE=true`)
  - Filters out common browser noise (ResizeObserver, NetworkError)
  - 10% performance trace sampling in production, 100% in development
  - Session replays only captured on errors with privacy protection (masks text, blocks media)
- **Error Handling Guidelines**:
  - Use structured error messages with clear context
  - Avoid logging sensitive data in error messages (passwords, tokens, PII)
  - Test error scenarios with feature flags before production deployment
  - Monitor Sentry dashboard for new error patterns after deployments
- **Expected Error Types**:
  - **Filtered (ignored)**: ResizeObserver errors, generic NetworkError events
  - **Captured**: Application errors, unhandled promises, React error boundaries
  - **Enhanced tracking**: Server-side errors via `onRequestError` hook with route context

**Testing**: Jest with React Testing Library, configured for Next.js with custom setup in `jest.config.js`

## Key Files to Understand

- `src/app/page.tsx` - The main component that orchestrates the entire application, integrating hooks, reducers, and data fetching.
- `src/hooks/useGameSessionReducer.ts` - The reducer managing core game logic (timer, score, status). Crucial for understanding state transitions.
- `src/hooks/useGameState.ts` - The hook for managing interactive state on the soccer field (player positions, drawings).
- `src/utils/masterRosterManager.ts` - Handles all CRUD operations for the master player list, interacting with localStorage.
- `src/config/queryKeys.ts` - Defines the keys used for caching and invalidating data with React Query.
- `src/types/index.ts` - Core TypeScript interfaces (Player, Season, Tournament, AppState).
- `src/utils/localStorage.ts` - Async localStorage wrapper utilities.
- `src/utils/logger.ts` - Centralized logging utility with type safety and environment awareness.

## Development Notes

### Data Storage
All data is stored in browser localStorage. The app includes backup/restore functionality through `src/utils/fullBackup.ts`.

### Internationalization
The app supports English and Finnish with i18next. All translation files now live in `public/locales/`.

### PWA Features
The app includes install prompts, update notifications, and works offline. The service worker is updated during build to trigger cache updates.

### Testing Strategy
- Unit tests cover utilities and components and are co-located with source files using the `.test.tsx` suffix
- The Jest configuration excludes Playwright specs located in the `/tests/` directory
- Integration tests for Sentry error reporting in `src/__tests__/integration/`
- Performance tests for bundle size validation in `src/__tests__/performance/`
- Security tests for environment validation in `src/__tests__/security/`

## Testing Rules and Principles

### Critical Testing Guidelines

**NEVER SKIP TESTS** unless explicitly requested by the user. Tests exist to catch regressions and ensure code quality.

**Test fixes must make the project more robust, not mask real issues:**
- Fix the underlying problem, don't just make tests pass
- Ensure mocks accurately represent real behavior
- Don't weaken assertions to avoid failures
- Don't remove test coverage without good reason

**When fixing failing tests:**
1. **Understand why the test is failing** - Is it a legitimate issue or a test problem?
2. **Fix the root cause** - Address the actual problem, not just the test symptom
3. **Improve robustness** - Make tests and code more reliable, not more permissive
4. **Maintain coverage** - Don't reduce test coverage to fix failures
5. **Document changes** - Explain why changes were necessary

**Acceptable test modifications:**
- Updating test expectations to match corrected application behavior
- Improving test reliability and reducing flakiness
- Adding better error handling or edge case coverage
- Fixing incorrect mocks to better represent real dependencies

**Unacceptable test modifications:**
- Skipping tests to avoid dealing with failures
- Weakening assertions to prevent failures
- Removing tests without replacement
- Making tests pass by ignoring real issues
- Using overly permissive mocks that hide problems

**Before skipping any test:**
- Investigate the root cause thoroughly
- Consider if the test reveals a real issue
- Explore proper fixes before considering removal
- Document why skipping is necessary if unavoidable
- Create a plan to restore the test

## Git and Version Control Rules

### Critical Git Guidelines

**NEVER COMMIT OR PUSH** unless explicitly requested by the user.

**Always wait for explicit permission before:**
- Running `git add`
- Running `git commit`
- Running `git push`
- Creating or modifying branches
- Making any git operations that change repository state

**The user controls when changes are committed:**
- Complete your work and verify it functions correctly
- Inform the user when work is ready for commit
- Wait for their explicit instruction to commit/push
- Let them review changes before they go into version control

**Exception:** Only commit/push immediately if the user specifically requests it in their message (e.g., "fix this and commit it", "push this change").

## Environment Variables

### Required Production Environment Variables
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry Data Source Name for error reporting (client-side)
- `SENTRY_AUTH_TOKEN` - Sentry authentication token for build-time source map uploads (server-side)

### Optional Environment Variables
- `NEXT_PUBLIC_SENTRY_FORCE_ENABLE` - Force enable Sentry in development mode (default: false)
- `SENTRY_ORG` - Sentry organization name for build configuration
- `SENTRY_PROJECT` - Sentry project name for build configuration
- `ANALYZE` - Set to `true` to enable bundle analysis during build

### Security Configuration
- All client-side environment variables (prefixed with `NEXT_PUBLIC_`) are validated for secret exposure
- Server-side secrets should never use the `NEXT_PUBLIC_` prefix
- Environment validation runs automatically during build and startup
- CSP violations are automatically reported to `/api/csp-report` endpoint
- Always investigate throughly and after implemeting anything (feature/fix), always review what you have done throughly and professionally to find the most perfect solution to everything. We do not want quick and dirty implementation unless explicitly asked so
- always be prfessional and factual. Do not try to overly please me and defend quality and best bractises even if that would mean disagreeing with my a bit