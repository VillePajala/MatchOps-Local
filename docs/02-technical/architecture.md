# MatchOps-Local: System Architecture

**Technical design and architecture decisions for the local-first soccer coaching PWA**

## Architecture Philosophy

MatchOps-Local is built on **local-first principles** with a **dual-backend architecture**, prioritizing data privacy, performance, and reliability while offering optional cloud sync for cross-device access.

### Core Architectural Principles

1. **Local-First Data**: Default mode stores all data locally (IndexedDB) — works offline, no account needed
2. **Optional Cloud Sync**: Premium feature via Supabase backend for cross-device access
3. **Backend Abstraction**: DataStore interface allows seamless switching between local and cloud modes
4. **Progressive Enhancement**: Works offline, better online
5. **Single Page Application**: Smooth, native-like user experience
6. **Component-Based Design**: Modular, reusable, and maintainable codebase
7. **Type Safety First**: TypeScript throughout for reliability and maintainability

## High-Level System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Browser Environment                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────────────────┐   │
│  │   React UI      │────│  React Query     │────│   DataStore Factory    │   │
│  │   (Components)  │    │  (State Mgmt)    │    │   (Mode Selection)     │   │
│  └─────────────────┘    └──────────────────┘    └───────────┬────────────┘   │
│           │                       │                         │                 │
│           ▼                       ▼              ┌──────────┴──────────┐      │
│  ┌─────────────────┐    ┌──────────────────┐    │                     │      │
│  │   Next.js       │    │    Hooks &       │    ▼                     ▼      │
│  │   App Router    │    │    Utilities     │  ┌─────────────┐  ┌───────────┐ │
│  └─────────────────┘    └──────────────────┘  │LocalDataStore│  │Supabase   │ │
│           │                       │           │ (IndexedDB)  │  │DataStore  │ │
│           ▼                       ▼           └──────┬──────┘  └─────┬─────┘ │
│  ┌─────────────────┐    ┌──────────────────┐        │                │       │
│  │   PWA Shell     │    │   TypeScript     │        ▼                ▼       │
│  │(Service Worker) │    │   Type System    │  ┌───────────┐  ┌─────────────┐ │
│  └─────────────────┘    └──────────────────┘  │ IndexedDB │  │  Supabase   │ │
│                                               │ KV Store  │  │ PostgreSQL  │ │
│                                               └───────────┘  └──────┬──────┘ │
└──────────────────────────────────────────────────────────────────────┼───────┘
                                                                       │
                                                                       ▼
                                                            ┌──────────────────┐
                                                            │  Supabase Cloud  │
                                                            │  - PostgreSQL    │
                                                            │  - Auth          │
                                                            │  - Edge Functions│
                                                            │  - RLS Policies  │
                                                            └──────────────────┘
```

### Dual-Mode Architecture

The app supports two operating modes, selectable at first launch:

| Aspect | Local Mode | Cloud Mode |
|--------|------------|------------|
| **Data Storage** | IndexedDB (browser) | Supabase PostgreSQL |
| **Authentication** | None required | Email/password via Supabase Auth |
| **Offline Support** | Full functionality | Read cached data; writes fail with clear error |
| **Cross-Device** | No | Yes (real-time sync) |
| **Cost** | Free | €4.99/month subscription |
| **Privacy** | Data never leaves device | Data in Supabase (EU region), RLS-protected |

**Key Implementation Details:**
- **DataStore Interface**: `src/interfaces/DataStore.ts` — 60+ methods for all data operations
- **LocalDataStore**: `src/datastore/LocalDataStore.ts` — IndexedDB implementation
- **SupabaseDataStore**: `src/datastore/SupabaseDataStore.ts` — Supabase/PostgreSQL implementation
- **Factory**: `src/datastore/factory.ts` — Mode-aware singleton that returns the correct implementation
- **Migration Service**: Bidirectional data transfer between local and cloud modes

See **[Dual-Backend Architecture](./architecture/dual-backend-architecture.md)** for design details.
See **[Auth/Data/Sync Runtime Architecture](./architecture/auth-data-sync-architecture.md)** for implementation details, debugging guide, and known issues.

## Technology Stack & Rationale

### Frontend Framework: Next.js 16 with App Router
**Why Next.js?**
- **Performance**: Built-in optimizations for bundle size and loading
- **PWA Support**: Excellent service worker and manifest integration
- **TypeScript Integration**: First-class TypeScript support
- **Developer Experience**: Hot reload, error boundaries, debugging tools
- **Future-Proof**: Active development and community support

**Why App Router?**
- **Modern Architecture**: Latest Next.js paradigm for better performance
- **Streaming**: Progressive loading for better perceived performance  
- **Server Components**: Future extensibility if server features needed

### State Management: React Query + IndexedDB
**Why React Query?**
- **Async State Management**: Perfect for IndexedDB operations
- **Caching Strategy**: Intelligent data caching and invalidation
- **Background Updates**: Automatic data refresh and synchronization
- **Error Handling**: Robust error boundaries and retry logic

**Why IndexedDB?**
- **Local-First**: Data stays on device, zero external dependencies
- **Performance**: Instant data access without network overhead
- **Privacy**: Complete data control, no external data transmission
- **Scalability**: 50MB+ storage quota vs 5-10MB localStorage limit
- **Data Structure**: Supports complex objects and efficient queries

### UI Framework: React 19.2 with TypeScript
**Why React 19.2?**
- **Concurrent Features**: Better performance with concurrent rendering
- **Suspense**: Elegant loading states and progressive enhancement
- **Modern Hooks**: Advanced state management capabilities
- **Developer Tools**: Excellent debugging and profiling support

**Why TypeScript?**
- **Type Safety**: Catch errors at compile time, not runtime
- **Developer Experience**: IntelliSense, refactoring support
- **Documentation**: Types serve as living documentation
- **Maintainability**: Easier to maintain and extend complex codebase

### Styling: Tailwind CSS 4
**Why Tailwind CSS?**
- **Utility-First**: Rapid development with consistent design system
- **Performance**: Purged CSS for minimal bundle size
- **Responsiveness**: Mobile-first responsive design system
- **Customization**: Easily themed for different organizations

## Data Architecture

### IndexedDB Storage Schema

```typescript
// Core Data Entities stored in IndexedDB key-value store
interface StorageSchema {
  // Player and Team Data
  masterRoster: Player[]           // Central player database
  teams: Team[]                   // Team definitions
  teamRosters: TeamRoster[]       // Player assignments to teams

  // Game and Season Data
  savedSoccerGames: SavedGame[]   // Individual game states
  seasons_list: Season[]          // Season definitions
  tournaments_list: Tournament[]  // Tournament structures

  // Application State
  appSettings: AppSettings        // User preferences and config
  timerState: TimerState         // Game timer persistence

  // Analytics and History
  playerAdjustments: PlayerAdjustment[]  // Performance tracking
  gameHistory: GameEvent[]        // Historical game events

  // Migration Control
  storage_config: StorageConfig   // Storage mode and version
}
```

### Data Flow Architecture

```
User Interaction → React Component → Custom Hook → React Query → Utility Function → IndexedDB
                                                              ↓
                                         Component Re-render ← Query Cache Update ← Data Validation
```

### Key Storage Strategies

1. **Atomic Operations**: All IndexedDB operations use transactions for atomicity
2. **Data Validation**: Schema validation on read/write operations
3. **Migration Support**: Automatic migration from localStorage to IndexedDB
4. **Backup Integration**: Built-in export/import for data portability
5. **Error Recovery**: Graceful handling of corrupted data with fallback mechanisms
6. **Performance**: Batch operations and efficient querying for large datasets

## Component Architecture

### Hierarchical Component Structure

```
App (Next.js App Router)
├── Layout Components
│   ├── HomePage (Main orchestrator)
│   ├── ControlBar (Action controls)
│   └── GameInfoBar (Status display)
├── Feature Components
│   ├── SoccerField (Interactive field)
│   ├── PlayerBar (Roster management)
│   └── Various Modals (Settings, stats, etc.)
├── Shared Components
│   ├── UI Elements (Buttons, inputs)
│   ├── Form Components (Validation)
│   └── Data Display (Tables, charts)
└── Utility Components
    ├── ErrorBoundary (Error handling)
    ├── I18nInitializer (Internationalization)
    └── ClientWrapper (Hydration)
```

### State Management Pattern

```typescript
// Custom Hook Pattern for Data Operations
const usePlayerManagement = () => {
  const { data: players, mutate } = useQuery({
    queryKey: ['masterRoster'],
    queryFn: getMasterRoster,
  });
  
  const addPlayer = useMutation({
    mutationFn: addPlayerToRoster,
    onSuccess: () => {
      queryClient.invalidateQueries(['masterRoster']);
    },
  });
  
  return { players, addPlayer, ... };
};
```

## Progressive Web App (PWA) Architecture

### Service Worker Strategy
- **Cache-First**: Static assets cached for offline access
- **Network-First**: Dynamic content with fallback to cache
- **Background Sync**: Queue operations during offline periods
- **Update Management**: Automatic updates with user notification

### Offline-First Design
1. **Core Functionality**: All features work without internet
2. **Data Persistence**: localStorage survives browser restarts
3. **Asset Caching**: UI resources cached for offline use
4. **Progressive Enhancement**: Optional features require connectivity

### Installation & Updates
- **Installable**: Meets PWA installability criteria
- **Native Feel**: Full-screen mode, appropriate icons
- **Update Notifications**: In-app notifications for new versions
- **Background Updates**: Automatic service worker updates

## Match Clock Architecture

The match clock is the core of match day. This section states the rules it must always keep. They come from the 2026-11 timer review, items 4.20–4.36, and every rule is enforced in code and covered by tests.

### Where the clock lives

| Piece | Role |
|---|---|
| `useGameSessionReducer` | The clock state: `timeElapsedInSeconds`, `currentPeriod`, `gameStatus` (`notStarted` / `inProgress` / `periodEnd` / `gameEnd`), `isTimerRunning`, sub tracking. |
| `usePrecisionTimer` | While the clock runs, measures elapsed time from a `performance.now()` origin, plus a wall-clock (`Date.now()`) origin that snaps a stalled clock forward. |
| `useGameTimer` | Start / pause / reset / End period, period-end detection on each tick, the back-from-background re-sync, and the "match is live" signals. |
| `timerAnchor` (localStorage) | The durable recovery record: one per game, written **synchronously**, so it survives the OS freezing or killing the WebView. |
| `timerStateManager` (IndexedDB) | A secondary record, written on hide only, as a fallback behind the anchor. |
| `useGamePersistence` + `useAutoSave` | Saving the game record (clock included) on discrete changes, on hide and when leaving a running match. |

### Rules (invariants)

1. **One source of truth while running.** The precision timer drives the clock, and the reducer mirrors it once a second. While stopped, the reducer's `timeElapsedInSeconds` is the truth.
2. **Running implies in play.** `isTimerRunning === true` only with `gameStatus === 'inProgress'`. No action, including undo and load, may leave a running flag outside play.
3. **The boundary is a break, never a startable clock.** A stopped clock at or past `currentPeriod × periodDurationMinutes × 60` is `periodEnd`, or `gameEnd` on the last period. This holds whether the clock got there by a tick, a pause, a reload or a length edit (`boundaryStop`).
4. **Periods start at their nominal time.** Period *n* starts at (n − 1) × length, the football convention. *End period* moves the clock to the period end for the same reason.
5. **The clock only moves forward,** except on an explicit Reset. Re-syncs never go below the time at hide, and a backward wall-clock step never rewinds the match.
6. **Undo never moves match time.** Undo/redo never restores the clock, the period or the match status. Clock transitions are not undo steps; they update the current history entry in place. Sub tracking is restored only from an entry in the same half.
7. **One anchor per running game.** An anchor exists for game G exactly while G's clock runs. It is written synchronously at start, on every visible tick and on hide. It is removed only by G's own pause, period end, reset, End period or deletion; never by reading it, and never by opening another game. Anchors older than 6 h are ignored.
8. **Recovery never auto-advances a period.** A boot that recovers a running clock still mid-period resumes it. One that reached the period end loads the break and **saves** it. The next period always needs a tap.
9. **A live match is never reloaded behind the coach's back.** Live means running, paused, or at a break. The return-from-background refresh never unmounts it, and the long-background force-reload is suppressed for it.
10. **Every stop is saved before anything can lose it.** That covers pause, period end, End period, reset and a stop decided at boot. Pending edits and a running clock are saved on hide, `pagehide` and leaving the match. Transient save failures are retried.
11. **A loaded game never auto-starts,** except to continue a clock its anchor proves was running and that is still mid-period. A paused game reloads paused.
12. **Derived numbers come from the clock.** Total game duration and minutes played use `timeElapsedInSeconds`, not the sub-interval log.

### Lifecycle paths and where they are tested

| Path | Behaviour | Tests |
|---|---|---|
| Lock / background < 30 s | Re-synced to wall-clock on return, keeping fractions | `useGameTimer.test` (visibility), `usePrecisionTimer.reanchor.test` |
| Return after > 30 s | Refreshed in place; the match stays mounted | Browser check (#957) |
| Away > 5 min while live | No force reload | `useAppResume.test` |
| App killed mid-period | Boot resumes from the anchor | `useGameOrchestration.timerRestore.test` (scenario bench) |
| Killed through the period end | Opens at the break, saved | bench "4.26" scenarios |
| Two remounts in a row | Both recover (the anchor is not consumed on read) | bench "4.22" |
| Another game opened mid-match | The running game keeps its anchor and is saved on leaving | bench "4.22/4.29" |
| Boot before data settles | Waits for the refetch, opens the persisted game | bench "4.32" |
| Undo at any phase | Clock, period and status untouched | `useGameSessionCoordination.test`, `useGameSessionWithHistory.behaviour.test` |

When you change the clock, add the coach-level story to the scenario bench in `useGameOrchestration.timerRestore.test.tsx`. If the change can't be tested there, test it in the hook that owns that path.

## Performance Architecture

### Loading Strategy
1. **Code Splitting**: Dynamic imports for large components
2. **Lazy Loading**: Components loaded on demand
3. **Asset Optimization**: Images and resources optimized
4. **Critical Path**: Minimize blocking resources

### Runtime Performance
- **React Optimization**: Memoization and optimization hooks
- **Storage Optimization**: Efficient localStorage access patterns
- **Memory Management**: Proper cleanup and garbage collection
- **Battery Efficiency**: Minimize background processing

## Security & Privacy Architecture

### Data Protection

**Local Mode:**
- **Local-Only**: No data transmission to external servers
- **Input Validation**: All user inputs validated and sanitized
- **XSS Protection**: Content Security Policy and input sanitization
- **Storage Security**: IndexedDB data stays in browser sandbox

**Cloud Mode:**
- **Authentication**: Email/password via Supabase Auth with JWT tokens
- **Authorization**: Row-Level Security (RLS) policies ensure users only access their own data
- **Encryption**: TLS for data in transit; Supabase encrypts data at rest
- **Edge Functions**: JWT verification for subscription and account management

### Privacy by Design
- **Local mode**: Data never leaves device, no tracking
- **Cloud mode**: Data stored in Supabase (EU region), GDPR compliant
- **No behavioral tracking**: Feature usage, user patterns NOT collected
- **Data portability**: Export/import for data ownership

See **[Security Guidelines](./security.md)** for complete security documentation.

## Scalability & Maintenance

### Code Organization
- **Modular Design**: Clear separation of concerns
- **Type Safety**: Comprehensive TypeScript coverage  
- **Testing Strategy**: Unit, integration, and E2E tests
- **Documentation**: Inline docs and architectural documentation

### Extensibility
- **Plugin Architecture**: Extensible through custom hooks
- **Theme System**: Customizable appearance and branding
- **Configuration**: Environment-based configuration
- **API Ready**: Structured for future API integration

### Maintenance Strategy
- **Automated Testing**: Comprehensive test coverage
- **Code Quality**: ESLint, Prettier, type checking
- **Dependency Management**: Regular updates and security patches
- **Performance Monitoring**: Client-side performance tracking

This architecture enables MatchOps-Local to deliver professional-grade functionality while maintaining the simplicity and privacy benefits of local-first design.