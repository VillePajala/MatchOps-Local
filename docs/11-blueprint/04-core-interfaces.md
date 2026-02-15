# 04. Core Interfaces — The Skeleton That Defines Everything

> **Audience**: AI agent building the new app
> **Purpose**: The TypeScript interfaces that ARE the architecture. Build these first, implement later.

---

## Philosophy

The interfaces define:
1. **What** the app can do (method signatures)
2. **What** data looks like (type definitions)
3. **What** can go wrong (error types)

Every component, hook, and test depends on these. Get them right before writing a single implementation line.

**Key difference from MatchOps-Local**: Split the DataStore by domain instead of one god interface. See [02-decisions.md](./02-decisions.md) §LD2.

---

## 1. Domain Store Interfaces

Each store handles one entity type. Each implementation (Local, Supabase) is ~200-400 lines instead of 2600-4700.

**Implementation note**: Implementations should use a single class implementing all stores (simpler for IndexedDB where one database holds all stores). The domain split is at the TYPE level for code organization, not the implementation level. A `LocalDataStore` class implements `DataStore` (which extends all domain store interfaces) as one class with one IndexedDB database connection. The same applies to `SupabaseDataStore` — one class, one Supabase client.

**Important**: The blueprint proposes NEW method signatures. These intentionally differ from MatchOps-Local (which returns `boolean` or `null` for some operations). The practice planner should use typed errors (`throw NotFoundError`) instead of `null` returns, and `Promise<void>` instead of `Promise<boolean>` for delete operations. This is a deliberate improvement, not an oversight.

### Pattern: Every Store Method

```typescript
interface ExampleStore {
  // READ — always returns typed data, never raw storage
  getAll(): Promise<Example[]>;
  getById(id: string): Promise<Example | null>;

  // WRITE — returns the saved entity (with generated fields like createdAt)
  create(data: Omit<Example, 'id' | 'createdAt' | 'updatedAt'>): Promise<Example>;
  update(id: string, data: Partial<Example>): Promise<Example>;

  // DELETE — void return, throws NotFoundError if missing
  delete(id: string): Promise<void>;

  // UPSERT — for sync/import (create if missing, update if exists)
  upsert(entity: Example): Promise<Example>;
}
```

### PlayerStore

```typescript
// src/interfaces/stores/PlayerStore.ts

import type { Player } from '@/types';

export interface PlayerStore {
  getPlayers(): Promise<Player[]>;
  getPlayerById(id: string): Promise<Player | null>;
  createPlayer(player: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player>;
  deletePlayer(id: string): Promise<void>;
  upsertPlayer(player: Player): Promise<Player>;
}
```

### ExerciseStore

```typescript
// src/interfaces/stores/ExerciseStore.ts

import type { Exercise } from '@/types/exercise';

export interface ExerciseSearchQuery {
  text?: string;              // Search name + description
  category?: ExerciseCategory;
  tags?: string[];
  intensity?: 'low' | 'medium' | 'high';
  ageGroup?: string;
  favoritesOnly?: boolean;
}

export interface ExerciseStore {
  getExercises(): Promise<Exercise[]>;
  getExerciseById(id: string): Promise<Exercise | null>;
  createExercise(exercise: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>): Promise<Exercise>;
  updateExercise(id: string, updates: Partial<Exercise>): Promise<Exercise>;
  deleteExercise(id: string): Promise<void>;
  upsertExercise(exercise: Exercise): Promise<Exercise>;
  searchExercises(query: ExerciseSearchQuery): Promise<Exercise[]>;
  toggleFavorite(id: string): Promise<Exercise>;
}
```

### PracticeStore

```typescript
// src/interfaces/stores/PracticeStore.ts

import type { PracticeSession } from '@/types/practice';

export interface PracticeStore {
  getPracticeSessions(): Promise<PracticeSession[]>;
  getPracticeSessionById(id: string): Promise<PracticeSession | null>;
  getPracticeSessionsByDateRange(startDate: string, endDate: string): Promise<PracticeSession[]>;
  createPracticeSession(session: Omit<PracticeSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<PracticeSession>;
  savePracticeSession(id: string, session: PracticeSession): Promise<PracticeSession>;
  deletePracticeSession(id: string): Promise<void>;
  duplicatePracticeSession(id: string, newDate: string): Promise<PracticeSession>;
}
```

### TemplateStore

```typescript
// src/interfaces/stores/TemplateStore.ts

import type { PracticeTemplate } from '@/types/template';
import type { PracticeSession } from '@/types/practice';

export interface TemplateStore {
  getTemplates(): Promise<PracticeTemplate[]>;
  getTemplateById(id: string): Promise<PracticeTemplate | null>;
  createTemplate(template: Omit<PracticeTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<PracticeTemplate>;
  updateTemplate(id: string, updates: Partial<PracticeTemplate>): Promise<PracticeTemplate>;
  deleteTemplate(id: string): Promise<void>;
  createSessionFromTemplate(templateId: string, date: string, teamId?: string): Promise<PracticeSession>;
}
```

### AttendanceStore

```typescript
// src/interfaces/stores/AttendanceStore.ts

import type { AttendanceRecord } from '@/types/practice';

export interface AttendanceStats {
  playerId: string;
  totalSessions: number;
  present: number;
  absent: number;
  late: number;
  attendanceRate: number;  // 0-100 percentage
}

export interface AttendanceStore {
  getAttendance(sessionId: string): Promise<AttendanceRecord[]>;
  saveAttendance(sessionId: string, records: AttendanceRecord[]): Promise<void>;
  getPlayerAttendanceStats(playerId: string, seasonId?: string): Promise<AttendanceStats>;
  getTeamAttendanceStats(teamId: string, seasonId?: string): Promise<AttendanceStats[]>;
}
```

### Shared Entity Stores

```typescript
// TeamStore, SeasonStore, PersonnelStore, SettingsStore
// Same pattern as MatchOps-Local — copy directly

export interface TeamStore {
  getTeams(): Promise<Team[]>;
  getTeamById(id: string): Promise<Team | null>;
  createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team>;
  updateTeam(id: string, updates: Partial<Team>): Promise<Team>;
  deleteTeam(id: string): Promise<void>;
  getTeamRoster(teamId: string): Promise<Player[]>;
  setTeamRoster(teamId: string, playerIds: string[]): Promise<void>;
}

// ... SeasonStore, PersonnelStore follow same pattern

export interface SettingsStore {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  updateSettings(updates: Partial<AppSettings>): Promise<void>;
}
```

### DataStore Composition Root

```typescript
// src/interfaces/DataStore.ts

import type { PlayerStore } from './stores/PlayerStore';
import type { ExerciseStore } from './stores/ExerciseStore';
import type { PracticeStore } from './stores/PracticeStore';
import type { TemplateStore } from './stores/TemplateStore';
import type { AttendanceStore } from './stores/AttendanceStore';
import type { TeamStore } from './stores/TeamStore';
import type { SeasonStore } from './stores/SeasonStore';
import type { PersonnelStore } from './stores/PersonnelStore';
import type { SettingsStore } from './stores/SettingsStore';

/**
 * DataStore — the unified data access interface.
 *
 * Extends all domain stores. Implementations can compose domain store
 * implementations or implement everything in one class.
 *
 * Usage:
 *   const store = getDataStore();
 *   const exercises = await store.getExercises();
 */
export interface DataStore extends
  PlayerStore,
  ExerciseStore,
  PracticeStore,
  TemplateStore,
  AttendanceStore,
  TeamStore,
  SeasonStore,
  PersonnelStore,
  SettingsStore {

  /** Initialize the store (open DB connections, etc.) */
  initialize(): Promise<void>;

  /** Close the store (release connections) */
  close(): Promise<void>;

  /** Check if store is ready */
  isInitialized(): boolean;

  /** Backend name for display */
  getBackendName(): string;

  /** Clear all user data (for account deletion, mode switching) */
  clearAllUserData(): Promise<void>;
}
```

---

## 2. Error Types

```typescript
// src/interfaces/DataStoreErrors.ts

export type DataStoreErrorCode =
  | 'NOT_INITIALIZED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'VALIDATION_ERROR'
  | 'STORAGE_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'NOT_SUPPORTED'
  | 'CONFLICT'
  | 'UNKNOWN';

export class DataStoreError extends Error {
  public readonly code: DataStoreErrorCode;
  public readonly cause?: Error;

  constructor(message: string, code: DataStoreErrorCode, cause?: Error) {
    super(message);
    this.name = 'DataStoreError';
    this.code = code;
    this.cause = cause;
  }
}

// Specific error classes — constructor signatures match MatchOps-Local's DataStoreErrors.ts
export class NotFoundError extends DataStoreError {
  constructor(public resourceType: string, public resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`, 'NOT_FOUND');
  }
}

export class AlreadyExistsError extends DataStoreError {
  constructor(public resourceType: string, public resourceId: string) {
    super(`${resourceType} already exists: ${resourceId}`, 'ALREADY_EXISTS');
  }
}

export class ValidationError extends DataStoreError {
  constructor(message: string, public field?: string, public value?: unknown) {
    super(message, 'VALIDATION_ERROR');
  }
}

export class StorageError extends DataStoreError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_ERROR', cause);
  }
}

export class NetworkError extends DataStoreError {
  constructor(message: string, public statusCode?: number, cause?: Error) {
    super(message, 'NETWORK_ERROR', cause);
  }
}

export class AuthError extends DataStoreError {
  // Takes (message, cause?, errorInfo?) — NOT (message, errorCode)
  constructor(message: string, cause?: Error, errorInfo?: AuthErrorInfo) {
    super(message, 'AUTH_ERROR', cause);
  }
}

export class ConflictError extends DataStoreError {
  constructor(public resourceType: string, public resourceId: string, message?: string) {
    super(message || `Conflict detected for ${resourceType}: ${resourceId}`, 'CONFLICT');
  }
}
```

**Why typed errors matter**:
```typescript
try {
  await store.createExercise(exercise);
} catch (error) {
  if (error instanceof AlreadyExistsError) {
    // AlreadyExistsError(resourceType, resourceId)
    showToast(`${error.resourceType} already exists`, 'error');
  } else if (error instanceof NetworkError) {
    showToast('Network error — please try again', 'error');
  } else if (error instanceof ValidationError) {
    // ValidationError(message, field?, value?)
    showToast(`Invalid ${error.field}: ${error.message}`, 'error');
  }
}
```

---

## 3. AuthService Interface

```typescript
// src/interfaces/AuthService.ts

import type { User, Session, AuthResult, AuthStateCallback } from './AuthTypes';

export interface AuthService {
  // Lifecycle
  initialize(): Promise<void>;
  getMode(): 'local' | 'cloud';

  // User state
  getCurrentUser(): Promise<User | null>;
  isAuthenticated(): boolean;  // Synchronous check against cached state — never async

  // Authentication
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;

  // Session management
  getSession(): Promise<Session | null>;
  refreshSession(): Promise<Session | null>;
  onAuthStateChange(callback: AuthStateCallback): () => void;  // Returns unsubscribe

  // Account management
  deleteAccount(): Promise<void>;
}
```

**Production methods to add**: The blueprint shows a minimal AuthService. For production, add these methods:
- **Supabase Auth features**: `verifySignUpOtp(email, token)`, `resendSignUpConfirmation(email)`, `verifyPasswordResetOtp(email, token)` — these handle the OTP-based email verification and password reset flows that Supabase Auth requires.
- **GDPR consent**: `recordConsent(policyVersion, metadata?)`, `hasConsentedToVersion(policyVersion)`, `getLatestConsent()` — domain-specific methods for recording and checking Terms of Service / Privacy Policy consent. Required for GDPR compliance with paid subscriptions.

### Auth Types

```typescript
// src/interfaces/AuthTypes.ts

export interface User {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

export interface AuthResult {
  user: User | null;
  session: Session | null;
  confirmationRequired: boolean;  // Email verification needed
}

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_taken'
  | 'weak_password'
  | 'invalid_email'
  | 'email_not_confirmed'
  | 'session_expired'
  | 'network_error'
  | 'rate_limited'
  | 'unknown';

export type AuthState = 'signed_in' | 'signed_out' | 'token_refreshed';
export type AuthStateCallback = (state: AuthState, session: Session | null) => void;

/** Pseudo-user for local mode (no real auth) */
export const LOCAL_USER: User = Object.freeze({
  id: 'local-user',
  email: null,
  isAnonymous: false,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});
```

---

## 4. Supporting Types

### DataStore Configuration

```typescript
// src/interfaces/DataStoreTypes.ts

export type DataStoreMode = 'local' | 'cloud';

export interface DataStoreConfig {
  mode: DataStoreMode;
  debug?: boolean;
}

export interface ConnectionStatus {
  connected: boolean;
  backend: DataStoreMode;
  message?: string;
}
```

### React Query Keys

```typescript
// src/config/queryKeys.ts

export const QUERY_KEYS = {
  exercises: ['exercises'] as const,
  exercise: (id: string) => ['exercises', id] as const,
  practiceSessions: ['practiceSessions'] as const,
  practiceSession: (id: string) => ['practiceSessions', id] as const,
  templates: ['templates'] as const,
  players: ['players'] as const,
  teams: ['teams'] as const,
  teamRoster: (teamId: string) => ['teamRoster', teamId] as const,
  seasons: ['seasons'] as const,
  personnel: ['personnel'] as const,
  settings: ['settings'] as const,
  attendance: (sessionId: string) => ['attendance', sessionId] as const,
  attendanceStats: (playerId: string) => ['attendanceStats', playerId] as const,
} as const;
```

---

## 5. Validation Utilities

```typescript
// src/datastore/validation.ts

import { ValidationError } from '@/interfaces/DataStoreErrors';

/** Validate required fields for a practice session */
export function validatePracticeSession(session: Partial<PracticeSession>): void {
  if (!session.title?.trim()) {
    throw new ValidationError('Title is required', 'VALIDATION_ERROR');
  }
  if (!session.date?.trim()) {
    throw new ValidationError('Date is required', 'VALIDATION_ERROR');
  }
  // Add field-specific validations
}

/** Normalize optional string: trim whitespace, convert empty to undefined */
export function normalizeOptionalString(value: string | undefined | null): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
```

---

## Traps

1. **Don't make interfaces too specific**: The interface should describe WHAT, not HOW. Don't leak IndexedDB or Supabase concepts into the interface.

2. **All methods are async**: Even if the local implementation is synchronous (reading from memory cache), keep the interface `Promise`-based. The Supabase implementation will always be async.

3. **Return full entities, not IDs**: After `create()` or `update()`, return the complete entity including generated fields (`id`, `createdAt`, `updatedAt`). The caller needs this for cache updates.

4. **Error messages must be user-safe**: Never include implementation details (table names, SQL errors, stack traces) in error messages. The error class carries the details; the `message` is what the user sees.

5. **`upsert()` methods exist for sync**: The sync engine needs create-or-update semantics. These bypass uniqueness checks differently than `create()`.
