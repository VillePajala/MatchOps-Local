# MatchOps-Local: System Architecture

**Technical design and architecture decisions for the local-first soccer coaching PWA**

## Architecture Philosophy

MatchOps-Local is built on **local-first principles** with a **progressive enhancement approach**, prioritizing data privacy, performance, and reliability through client-side data management.

### Core Architectural Principles

1. **Local-First Data**: All data operations happen locally with optional sync capabilities
2. **Progressive Enhancement**: Works offline, better online
3. **Single Page Application**: Smooth, native-like user experience
4. **Component-Based Design**: Modular, reusable, and maintainable codebase
5. **Type Safety First**: TypeScript throughout for reliability and maintainability

## High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Environment                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────┐ │
│  │   React UI      │────│  React Query     │────│ Storage │ │
│  │   (Components)  │    │  (State Mgmt)    │    │ Layer   │ │
│  └─────────────────┘    └──────────────────┘    └─────────┘ │
│           │                       │                    │    │
│           ▼                       ▼                    ▼    │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────┐ │
│  │   Next.js       │    │    Hooks &       │    │IndexedDB│ │
│  │   App Router    │    │    Utilities     │    │Adapter  │ │
│  └─────────────────┘    └──────────────────┘    └─────────┘ │
│           │                       │                    │    │
│           ▼                       ▼                    ▼    │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────┐ │
│  │   PWA Shell     │    │   TypeScript     │    │IndexedDB│ │
│  │(Service Worker) │    │   Type System    │    │ KV Store│ │
│  └─────────────────┘    └──────────────────┘    └─────────┘ │
└─────────────────────────────────────────────────────────────┘
```

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
- **Local-Only**: No data transmission to external servers
- **Input Validation**: All user inputs validated and sanitized
- **XSS Protection**: Content Security Policy and input sanitization
- **Storage Security**: localStorage data stays in browser sandbox

### Privacy by Design
- **No Tracking**: Zero analytics or user tracking
- **No External Requests**: Self-contained application
- **Data Ownership**: Users maintain complete control
- **GDPR Compliant**: No personal data collection or processing

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