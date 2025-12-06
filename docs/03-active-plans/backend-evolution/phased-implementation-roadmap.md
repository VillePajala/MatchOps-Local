# Phased Implementation Roadmap: Dual-Backend Evolution

**Status**: ⚠️ **SUPERSEDED** - See [REALISTIC-IMPLEMENTATION-PLAN.md](./REALISTIC-IMPLEMENTATION-PLAN.md) for PR-chunked execution plan
**Last Updated**: 2025-10-11 (theoretical design) | 2025-12-06 (superseded notice added)
**Purpose**: Detailed phase-by-phase execution plan for implementing dual-backend architecture
**Related**: [Dual-Backend Architecture](../../02-technical/architecture/dual-backend-architecture.md) | [Migration Strategy](./migration-strategy.md) | [Master Execution Guide](../master-execution-guide.md)

> **December 2025 Update**: This document contains the original **theoretical design** created in October 2025. After deep code analysis in December 2025, a more realistic PR-chunked implementation plan was created. **For actual implementation, use [REALISTIC-IMPLEMENTATION-PLAN.md](./REALISTIC-IMPLEMENTATION-PLAN.md)** which accounts for:
> - Actual storage call patterns (195 calls across 26 files)
> - Hook-level storage coupling that needs to be fixed first
> - More accurate effort estimates (50-72 hours vs theoretical 144-212 hours)

## Overview

This roadmap breaks down the dual-backend implementation into **4 sequential phases** spanning approximately **14-24 weeks**. Each phase is independent and delivers value incrementally, allowing for safe, tested progress without disrupting the current production system.

**Timeline Summary**:
- **Phase 1**: Interfaces & Local Wrapper (4-6 weeks)
- **Phase 2**: Supabase Implementation (6-8 weeks)
- **Phase 3**: Backend Selection & Migration (4-6 weeks)
- **Phase 4**: Play Store Integration (2-4 weeks)
- **Total**: 16-24 weeks (4-6 months)

**Delivery Strategy**:
- One phase per pull request
- Comprehensive testing after each phase
- No breaking changes to existing functionality
- Feature flags for gradual rollout

## Phase 1: Interfaces & Local Wrapper

**Duration**: 4-6 weeks
**Goal**: Introduce new abstraction layer without changing functionality
**Risk Level**: Low (wrapping existing code)

### Objectives

1. ✅ Define `DataStore` and `AuthService` interfaces
2. ✅ Implement `LocalDataStore` (wraps existing storage code)
3. ✅ Implement `LocalAuthService` (no-op implementation)
4. ✅ Update React Query hooks to use DataStore
5. ✅ All tests pass, no functionality changes

### Detailed Tasks

#### Week 1: Interface Design

**Task 1.1**: Create `DataStore` interface (`src/interfaces/DataStore.ts`)
- Define methods for all domain operations (players, teams, seasons, etc.)
- Define supporting types (filter options, errors)
- Document each method with JSDoc
- **Output**: Complete interface definition
- **Estimated Time**: 8-12 hours

**Task 1.2**: Create `AuthService` interface (`src/interfaces/AuthService.ts`)
- Define methods for authentication operations
- Define user, session, auth response types
- Document OAuth flow
- **Output**: Complete interface definition
- **Estimated Time**: 6-8 hours

**Task 1.3**: Code review and refinement
- Review interfaces with team/stakeholders
- Ensure all current operations covered
- Adjust based on feedback
- **Output**: Approved interfaces
- **Estimated Time**: 4-6 hours

#### Week 2-3: LocalDataStore Implementation

**Task 2.1**: Create `LocalDataStore` class (`src/datastore/LocalDataStore.ts`)
- Implement DataStore interface
- Delegate to existing utilities (`masterRoster.ts`, `savedGames.ts`, etc.)
- Add error handling and logging
- **Output**: Working LocalDataStore
- **Estimated Time**: 16-24 hours

**Example Implementation**:
```typescript
export class LocalDataStore implements DataStore {
  async getPlayers(): Promise<Player[]> {
    return getMasterRoster(); // Existing utility
  }

  async createPlayer(player: Omit<Player, 'id'>): Promise<Player> {
    return addPlayerToRoster(player.name, player); // Existing utility
  }

  // ... implement all 50+ methods
}
```

**Task 2.2**: Write unit tests for LocalDataStore
- Test each method independently
- Mock underlying storage utilities
- Verify error handling
- **Output**: 80%+ test coverage
- **Estimated Time**: 12-16 hours

**Task 2.3**: Create LocalAuthService (`src/auth/LocalAuthService.ts`)
- Implement AuthService interface with no-ops
- Return anonymous user for getCurrentUser()
- **Output**: Working LocalAuthService
- **Estimated Time**: 4-6 hours

#### Week 4-5: React Query Integration

**Task 3.1**: Create service factory (`src/utils/datastore.ts`)
```typescript
export async function getDataStore(): Promise<DataStore> {
  return new LocalDataStore(); // Always local in Phase 1
}

export function getAuthService(): AuthService {
  return new LocalAuthService();
}
```
- **Output**: Service initialization
- **Estimated Time**: 4-6 hours

**Task 3.2**: Update React Query hooks
- `useRoster()` → use `dataStore.getPlayers()`
- `useSeasons()` → use `dataStore.getSeasons()`
- `useGames()` → use `dataStore.getGames()`
- ... update all hooks
- **Output**: All hooks use DataStore
- **Estimated Time**: 16-24 hours

**Task 3.3**: Remove direct storage calls from components
- Search for `getStorageItem`, `setStorageItem`
- Replace with hook calls
- **Output**: Components use only hooks
- **Estimated Time**: 8-12 hours

#### Week 6: Testing & Documentation

**Task 4.1**: Integration tests
- End-to-end tests with LocalDataStore
- Verify all workflows (create game, save, load)
- **Output**: Green test suite
- **Estimated Time**: 12-16 hours

**Task 4.2**: Update documentation
- Document new architecture in CLAUDE.md
- Update README if needed
- **Output**: Updated docs
- **Estimated Time**: 4-6 hours

**Task 4.3**: Code review and refinement
- Address feedback
- Fix any issues found
- **Output**: PR-ready code
- **Estimated Time**: 8-12 hours

### Phase 1 Deliverables

- ✅ DataStore and AuthService interfaces defined
- ✅ LocalDataStore wrapping existing code
- ✅ LocalAuthService (no-op)
- ✅ All React Query hooks using DataStore
- ✅ 100% test pass rate
- ✅ No functionality changes (backward compatible)

### Phase 1 Acceptance Criteria

- [ ] All existing tests pass
- [ ] New unit tests for LocalDataStore pass
- [ ] Integration tests pass
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] Manual testing: app works identically to before
- [ ] Code review approved

---

## Phase 2: Supabase Implementation

**Duration**: 6-8 weeks
**Goal**: Implement cloud backend (not yet user-facing)
**Risk Level**: Medium (new backend, isolated)

### Prerequisites

- Phase 1 complete and merged
- Supabase project created
- Test database available

### Objectives

1. ✅ Set up Supabase project and database
2. ✅ Implement `SupabaseDataStore`
3. ✅ Implement `SupabaseAuthService`
4. ✅ Test cloud backend in isolation
5. ✅ No changes to user-facing code

### Detailed Tasks

#### Week 1: Supabase Setup

**Task 1.1**: Create Supabase project
- Sign up for Supabase account
- Create new project (dev/staging)
- Note connection details (URL, anon key)
- **Output**: Supabase project ready
- **Estimated Time**: 2-4 hours

**Task 1.2**: Create database schema
- Run SQL migrations from [Supabase Schema](../../02-technical/database/supabase-schema.md)
- Create all tables (players, teams, games, etc.)
- Set up Row Level Security policies
- **Output**: Database schema deployed
- **Estimated Time**: 8-12 hours

**Task 1.3**: Configure Supabase Auth
- Enable email/password authentication
- Configure OAuth providers (optional)
- Set redirect URLs
- **Output**: Auth configured
- **Estimated Time**: 4-6 hours

#### Week 2-4: SupabaseDataStore Implementation

**Task 2.1**: Implement basic CRUD operations
- getPlayers, createPlayer, updatePlayer, deletePlayer
- getSeasons, createSeason, updateSeason, deleteSeason
- getTournaments, createTournament, updateTournament, deleteTournament
- **Output**: Basic entity operations working
- **Estimated Time**: 24-32 hours

**Task 2.2**: Implement game operations (complex)
- createGame → insert into 5 tables (games, game_players, game_events, etc.)
- getGameById → join 5 tables, reconstruct AppState
- updateGame → update multiple tables
- **Output**: Game operations working
- **Estimated Time**: 32-40 hours

**Task 2.3**: Implement filtering and queries
- getGames with filter options (seasonId, tournamentId, date range)
- getPlayerStats (aggregate queries)
- countGamesForSeason, countGamesForTournament
- **Output**: Query methods working
- **Estimated Time**: 16-24 hours

**Task 2.4**: Implement import/export
- exportAllData → query all tables
- importData → batch inserts with transactions
- Handle conflict resolution (overwrite vs skip)
- **Output**: Import/export working
- **Estimated Time**: 16-24 hours

#### Week 5-6: SupabaseAuthService Implementation

**Task 3.1**: Implement authentication methods
- signUp, signIn, signOut
- getCurrentUser, getSession
- **Output**: Basic auth working
- **Estimated Time**: 12-16 hours

**Task 3.2**: Implement session management
- refreshSession (automatic token refresh)
- onAuthStateChange (listeners)
- getAccessToken (for API calls)
- **Output**: Session management working
- **Estimated Time**: 8-12 hours

**Task 3.3**: Implement password management
- resetPassword, updatePassword
- **Output**: Password ops working
- **Estimated Time**: 6-8 hours

#### Week 7-8: Testing & Documentation

**Task 4.1**: Unit tests for SupabaseDataStore
- Mock Supabase client
- Test each method independently
- Verify transformations (DB row ↔ AppState)
- **Output**: 80%+ test coverage
- **Estimated Time**: 24-32 hours

**Task 4.2**: Integration tests with test database
- End-to-end tests (sign up → create data → query)
- Test RLS (verify user isolation)
- Test multi-device simulation (two sessions)
- **Output**: Green integration tests
- **Estimated Time**: 16-24 hours

**Task 4.3**: Performance testing
- Benchmark query times
- Test with realistic dataset (100 games)
- Optimize slow queries
- **Output**: Performance report
- **Estimated Time**: 8-12 hours

**Task 4.4**: Documentation
- Document Supabase setup process
- Document RLS policies
- Document environment variables
- **Output**: Supabase docs complete
- **Estimated Time**: 6-8 hours

### Phase 2 Deliverables

- ✅ Supabase project with complete schema
- ✅ SupabaseDataStore fully implemented
- ✅ SupabaseAuthService fully implemented
- ✅ Comprehensive test coverage
- ✅ Performance benchmarks
- ✅ No changes to user-facing app (backend isolated)

### Phase 2 Acceptance Criteria

- [ ] All SupabaseDataStore methods implemented
- [ ] All SupabaseAuthService methods implemented
- [ ] Unit tests pass (80%+ coverage)
- [ ] Integration tests pass (with test database)
- [ ] RLS policies verified (users can't access other users' data)
- [ ] Performance acceptable (<500ms for typical queries)
- [ ] Documentation complete

---

## Phase 3: Backend Selection & Migration

**Duration**: 4-6 weeks
**Goal**: Enable users to choose backend and migrate data
**Risk Level**: High (user-facing changes, data migration)

### Prerequisites

- Phase 1 and 2 complete
- Production Supabase project ready
- Migration strategy reviewed

### Objectives

1. ✅ Add backend selection UI
2. ✅ Implement migration tool
3. ✅ Add auth UI (sign up, sign in)
4. ✅ Test migration flow end-to-end
5. ✅ Deploy to production

### Detailed Tasks

#### Week 1-2: Backend Selection

**Task 1.1**: Update service factory
```typescript
export async function getDataStore(): Promise<DataStore> {
  const authService = getAuthService();
  const mode = authService.getMode(); // 'local' | 'cloud'

  if (mode === 'local') {
    return new LocalDataStore();
  } else {
    const supabase = await authService.getSupabaseClient();
    return new SupabaseDataStore(supabase);
  }
}

export function getAuthService(): AuthService {
  const mode = localStorage.getItem('auth-mode') ?? 'local';

  if (mode === 'local') {
    return new LocalAuthService();
  } else {
    return new SupabaseAuthService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
}
```
- **Output**: Dynamic backend selection
- **Estimated Time**: 6-8 hours

**Task 1.2**: Add mode selection in settings
- Settings modal: "Choose Backend" section
- Radio buttons: Local Mode / Cloud Mode
- Show benefits of each mode
- Disable cloud mode if not signed in
- **Output**: Mode selection UI
- **Estimated Time**: 8-12 hours

**Task 1.3**: Add mode indicator
- Show current mode in UI (e.g., status bar)
- Visual indicator: "Local Mode" or "Cloud Mode (synced)"
- **Output**: Mode visibility
- **Estimated Time**: 4-6 hours

#### Week 2-3: Authentication UI

**Task 2.1**: Create sign up screen
- Email + password form
- Validation (email format, password strength)
- Error handling (email already exists, etc.)
- **Output**: Sign up screen
- **Estimated Time**: 12-16 hours

**Task 2.2**: Create sign in screen
- Email + password form
- "Forgot password?" link
- Error handling (invalid credentials)
- **Output**: Sign in screen
- **Estimated Time**: 8-12 hours

**Task 2.3**: Add authentication routes
- `/auth/sign-up`
- `/auth/sign-in`
- `/auth/sign-out`
- `/auth/reset-password`
- **Output**: Auth routes
- **Estimated Time**: 6-8 hours

**Task 2.4**: Protected routes
- Wrap app in authentication check
- Redirect to sign in if cloud mode + not authenticated
- **Output**: Protected routes
- **Estimated Time**: 6-8 hours

#### Week 3-4: Migration Tool

**Task 3.1**: Create migration service (`src/services/MigrationService.ts`)
```typescript
export class MigrationService {
  async migrate(
    from: DataStore,
    to: DataStore
  ): Promise<MigrationResult> {
    // 1. Export from source
    const exported = await from.exportAllData();

    // 2. Validate export
    const validation = this.validate(exported);
    if (!validation.valid) throw new Error('Invalid export');

    // 3. Transform (if needed)
    const transformed = this.transform(exported);

    // 4. Upload to target
    const result = await to.importData(transformed);

    // 5. Verify
    const verification = await this.verify(exported, to);

    return { result, verification };
  }
}
```
- **Output**: Migration service
- **Estimated Time**: 16-24 hours

**Task 3.2**: Create migration UI
- Modal: "Migrate to Cloud"
- Show data counts (players, games, etc.)
- Progress bar during migration
- Success/failure message
- **Output**: Migration UI
- **Estimated Time**: 12-16 hours

**Task 3.3**: Add migration button
- Settings modal: "Migrate to Cloud" button
- Only show if in local mode + signed in
- **Output**: Migration entry point
- **Estimated Time**: 4-6 hours

#### Week 5-6: Testing & Deployment

**Task 4.1**: End-to-end testing
- Scenario 1: Local user → sign up → migrate → cloud user
- Scenario 2: Cloud user → create data → sign out → sign in
- Scenario 3: Migration failure → retry
- **Output**: Tested migration flow
- **Estimated Time**: 16-24 hours

**Task 4.2**: Deploy to production
- Set up production Supabase project
- Configure environment variables
- Deploy to Vercel/hosting
- **Output**: Live in production
- **Estimated Time**: 8-12 hours

**Task 4.3**: Monitor and fix issues
- Set up Sentry for error tracking
- Monitor migration success rate
- Fix any issues found
- **Output**: Stable production
- **Estimated Time**: Ongoing

### Phase 3 Deliverables

- ✅ Users can choose between local and cloud mode
- ✅ Full authentication UI (sign up, sign in, sign out)
- ✅ Working migration tool with progress indicator
- ✅ Deployed to production
- ✅ Monitoring in place

### Phase 3 Acceptance Criteria

- [ ] Users can sign up for cloud accounts
- [ ] Users can sign in/out successfully
- [ ] Migration completes successfully (verified with test users)
- [ ] Count verification passes (local count = cloud count)
- [ ] No data loss during migration
- [ ] Error handling works (network failures, etc.)
- [ ] Production deployment successful
- [ ] Sentry capturing errors

---

## Phase 4: Play Store Integration

**Duration**: 2-4 weeks
**Goal**: Monetize cloud mode via in-app purchase
**Risk Level**: Low (additive feature)

### Prerequisites

- Phase 3 complete and stable
- Play Store billing account set up

### Objectives

1. ✅ Integrate Play Store billing API
2. ✅ Implement feature gating (free vs premium)
3. ✅ Add paywall UI
4. ✅ Test purchase flow
5. ✅ Deploy updated app

### Detailed Tasks

#### Week 1: Billing Integration

**Task 1.1**: Set up Play Store billing
- Create in-app product ("Premium Upgrade", $9.99-19.99)
- Configure product details
- Test with test account
- **Output**: Product configured
- **Estimated Time**: 4-6 hours

**Task 1.2**: Integrate billing client
```typescript
// Using @google-play/billing or similar
export class BillingService {
  async checkPremiumStatus(): Promise<boolean> {
    const purchases = await billingClient.queryPurchases();
    return purchases.some(p => p.productId === 'premium_upgrade');
  }

  async purchasePremium(): Promise<void> {
    await billingClient.launchBillingFlow('premium_upgrade');
  }
}
```
- **Output**: Billing service
- **Estimated Time**: 12-16 hours

**Task 1.3**: Cache license status locally
- Store purchase status in localStorage
- Verify periodically (once per day)
- Works offline after initial verification
- **Output**: Offline license support
- **Estimated Time**: 6-8 hours

#### Week 2: Feature Gating

**Task 2.1**: Implement feature checks
```typescript
export function usePremiumFeatures() {
  const billing = useBillingService();
  return {
    canUseCloudMode: billing.isPremium,
    canExportBackup: true, // Always free
    canImportBackup: billing.isPremium,
  };
}
```
- **Output**: Feature gating hooks
- **Estimated Time**: 6-8 hours

**Task 2.2**: Add premium checks to cloud mode
- Disable "Switch to Cloud Mode" if not premium
- Show upgrade prompt
- **Output**: Gated cloud mode
- **Estimated Time**: 6-8 hours

**Task 2.3**: Add paywall UI
- Modal: "Upgrade to Premium"
- Benefits: multi-device sync, cloud backup
- Purchase button
- **Output**: Paywall modal
- **Estimated Time**: 8-12 hours

#### Week 3-4: Testing & Deployment

**Task 3.1**: Test purchase flow
- Test purchase with test account
- Verify premium unlocked
- Test restore purchases
- **Output**: Verified purchase flow
- **Estimated Time**: 8-12 hours

**Task 3.2**: Test edge cases
- Purchase while offline → sync when online
- Refund handling
- Multiple devices with same account
- **Output**: Edge cases handled
- **Estimated Time**: 8-12 hours

**Task 3.3**: Deploy to Play Store
- Update app manifest
- Build signed APK/AAB
- Submit for review
- **Output**: App published
- **Estimated Time**: 4-6 hours

### Phase 4 Deliverables

- ✅ Play Store billing integrated
- ✅ Premium features gated
- ✅ Paywall UI
- ✅ Tested purchase flow
- ✅ App published to Play Store

### Phase 4 Acceptance Criteria

- [ ] Users can purchase premium upgrade
- [ ] Premium status persists across sessions
- [ ] Cloud mode only accessible to premium users
- [ ] License verified offline (cached)
- [ ] Restore purchases works
- [ ] App approved by Play Store

---

## Risk Management

### Technical Risks

**Risk 1: Data Loss During Migration**
- **Mitigation**: Comprehensive validation + verification
- **Fallback**: Keep local data as backup
- **Rollback**: Allow user to revert to local mode

**Risk 2: Supabase Quota Exceeded**
- **Mitigation**: Monitor usage, optimize queries
- **Fallback**: Implement pagination, lazy loading
- **Contingency**: Upgrade to Pro tier

**Risk 3: Network Failures During Upload**
- **Mitigation**: Retry logic with exponential backoff
- **Fallback**: Resume from last checkpoint
- **UI**: Clear error messages, retry button

**Risk 4: Poor Cloud Performance**
- **Mitigation**: Aggressive caching (React Query)
- **Optimization**: Batch operations, selective loading
- **Monitoring**: Performance tracking via Sentry

### Business Risks

**Risk 1: Low Premium Conversion Rate**
- **Mitigation**: Clear value proposition, free trial
- **Pricing**: Optimize pricing based on user feedback
- **Alternative**: Subscription model ($2.99/month)

**Risk 2: Support Burden**
- **Mitigation**: Comprehensive documentation
- **Self-Service**: FAQ, troubleshooting guide
- **Monitoring**: Sentry alerts for common issues

## Success Metrics

### Phase 1 Metrics
- ✅ 100% test pass rate
- ✅ Zero functionality regressions
- ✅ Code review approval

### Phase 2 Metrics
- ✅ 80%+ test coverage for Supabase code
- ✅ Query performance <500ms (95th percentile)
- ✅ RLS verified (zero cross-user data leaks)

### Phase 3 Metrics
- ✅ 90%+ migration success rate
- ✅ Zero data loss (verified with sample users)
- ✅ <1% error rate in production

### Phase 4 Metrics
- ✅ 5-15% premium conversion rate (target)
- ✅ Purchase flow completion: >80%
- ✅ Play Store rating: 4.0+ stars

---

**Next Steps**:
1. Review this roadmap with stakeholders
2. Allocate team resources for Phase 1
3. Create GitHub issues for Phase 1 tasks
4. Begin implementation
5. Link to [Master Execution Guide](../master-execution-guide.md) for integration with overall project roadmap
