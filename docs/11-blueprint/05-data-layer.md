# 05. Data Layer — IndexedDB, Storage Adapters, DataStore Implementations

> **Audience**: AI agent building the new app
> **Purpose**: How to implement the DataStore interface against IndexedDB (local) and Supabase (cloud)

---

## Architecture

```
Component → React Query Hook → DataStore Interface
                                       │
                    ┌──────────────────┤
                    │                   │
             LocalDataStore      SupabaseDataStore
                    │                   │
            IndexedDB (idb)      Supabase Client
                                       │
                                  PostgreSQL
```

The factory (`src/datastore/factory.ts`) decides which implementation to return based on the backend mode.

---

## 1. IndexedDB Storage — The `idb` Library

### Why `idb` (Not Raw IndexedDB)

Raw IndexedDB API uses events and callbacks — `idb` wraps it in promises:

```typescript
// Raw IndexedDB (DO NOT USE — ugly and error-prone)
const request = indexedDB.open('mydb', 1);
request.onsuccess = (event) => { /* ... */ };
request.onerror = (event) => { /* ... */ };

// idb (USE THIS — clean promise-based API)
import { openDB } from 'idb';
const db = await openDB('mydb', 1, {
  upgrade(db) {
    db.createObjectStore('exercises');
  },
});
const exercise = await db.get('exercises', id);
```

### Storage Adapter Pattern

MatchOps-Local uses a key-value adapter on top of IndexedDB. For the new app, simplify to direct `idb` usage:

```typescript
// src/utils/storage.ts

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'practice-planner';
const DB_VERSION = 1;
const STORE_NAME = 'data';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(userId?: string): Promise<IDBPDatabase> {
  const dbName = userId ? `${DB_NAME}_user_${userId}` : DB_NAME;
  if (!dbPromise) {
    dbPromise = openDB(dbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

// NOTE: User-scoped databases
// V1: A single global database is fine for local-only mode (one user per device).
// User-scoped databases become necessary when cloud mode enables multiple accounts
// on the same browser. The database name includes the user ID to prevent data
// leakage between accounts: `practice-planner_user_${userId}`
// When switching users, clear the cached dbPromise and open a new database.

export async function getStorageItem<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const value = await db.get(STORE_NAME, key);
  return value ?? null;
}

export async function setStorageItem<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, value, key);
}

export async function removeStorageItem(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, key);
}

export async function getAllKeys(): Promise<string[]> {
  const db = await getDb();
  return db.getAllKeys(STORE_NAME) as Promise<string[]>;
}
```

**Key traps**:
- IndexedDB on mobile Chrome has **transient failures** — reads/writes can fail randomly. React Query's `retry: 3` handles this naturally.
- `openDB` should be called once and cached (the `dbPromise` pattern above).
- IndexedDB is **async** — you cannot use it in render functions or synchronous code.
- In **private/incognito mode**, IndexedDB is restricted. Detect this early and show a user-friendly message.

### User-Scoped Databases

MatchOps-Local uses user-scoped database names (`matchops_user_{userId}`) to prevent data leakage between accounts on the same device. For the new app:

```typescript
export function getUserDatabaseName(userId: string): string {
  return `practice-planner_user_${userId}`;
}
```

This matters in cloud mode where multiple users could sign in on the same browser.

---

## 2. Storage Keys

Use a centralized file for all storage keys:

```typescript
// src/config/storageKeys.ts

export const EXERCISES_KEY = 'exercises';
export const PRACTICE_SESSIONS_KEY = 'practice_sessions';
export const PRACTICE_TEMPLATES_KEY = 'practice_templates';
export const PLAYERS_KEY = 'master_roster';
export const TEAMS_KEY = 'teams_index';
export const TEAM_ROSTERS_KEY = 'team_rosters';
export const SEASONS_KEY = 'seasons_list';
export const PERSONNEL_KEY = 'personnel';
export const APP_SETTINGS_KEY = 'app_settings';
```

---

## 3. LocalDataStore Implementation

### Pattern: One Method at a Time

Each domain store method follows the same pattern:

```typescript
// Example: ExerciseStore methods in LocalDataStore

async getExercises(): Promise<Exercise[]> {
  this.ensureInitialized();  // Throws NotInitializedError if not ready

  const raw = await getStorageItem<Record<string, Exercise>>(EXERCISES_KEY);
  if (!raw) return [];

  return Object.values(raw);
}

async getExerciseById(id: string): Promise<Exercise | null> {
  this.ensureInitialized();

  const exercises = await getStorageItem<Record<string, Exercise>>(EXERCISES_KEY);
  return exercises?.[id] ?? null;
}

async createExercise(data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>): Promise<Exercise> {
  this.ensureInitialized();

  // Validate
  if (!data.name?.trim()) {
    throw new ValidationError('Exercise name is required', 'VALIDATION_ERROR');
  }

  // Check uniqueness
  const existing = await this.getExercises();
  const nameExists = existing.some(
    e => normalizeNameForCompare(e.name) === normalizeNameForCompare(data.name)
  );
  if (nameExists) {
    throw new AlreadyExistsError('Exercise with this name already exists', 'ALREADY_EXISTS');
  }

  // Create
  const now = new Date().toISOString();
  const exercise: Exercise = {
    ...data,
    id: generateId('exercise'),
    name: normalizeName(data.name),
    createdAt: now,
    updatedAt: now,
  };

  // Persist
  const exercises = await getStorageItem<Record<string, Exercise>>(EXERCISES_KEY) ?? {};
  exercises[exercise.id] = exercise;
  await setStorageItem(EXERCISES_KEY, exercises);

  return exercise;
}

async deleteExercise(id: string): Promise<void> {
  this.ensureInitialized();

  const exercises = await getStorageItem<Record<string, Exercise>>(EXERCISES_KEY) ?? {};
  if (!exercises[id]) {
    throw new NotFoundError('Exercise not found', 'NOT_FOUND');
  }

  delete exercises[id];
  await setStorageItem(EXERCISES_KEY, exercises);
}
```

### ID Generation

```typescript
// src/utils/idGenerator.ts

export function generateId(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}
// Output: "exercise_1707912345678_a3f8k2"
```

### Name Normalization

```typescript
// src/utils/normalization.ts

/** Normalize for display (trim, collapse whitespace) */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Normalize for comparison (lowercase, no extra spaces) */
export function normalizeNameForCompare(name: string): string {
  return normalizeName(name).toLowerCase();
}
```

---

## 4. Factory Pattern

```typescript
// src/datastore/factory.ts

import type { DataStore } from '@/interfaces/DataStore';
import { getBackendMode } from '@/config/backendConfig';

let instance: DataStore | null = null;

export async function getDataStore(): Promise<DataStore> {
  if (instance) return instance;

  const mode = getBackendMode();

  if (mode === 'cloud') {
    // Dynamic import — don't pull Supabase into local-mode bundle
    const { SupabaseDataStore } = await import('./SupabaseDataStore');
    instance = new SupabaseDataStore();
  } else {
    const { LocalDataStore } = await import('./LocalDataStore');
    instance = new LocalDataStore();
  }

  await instance.initialize();
  return instance;
}

/** Reset singleton (for mode switching, testing) */
export function resetDataStore(): void {
  instance = null;
}
```

**Key patterns from MatchOps-Local**:
- **Dynamic import** for SupabaseDataStore — prevents pulling `@supabase/supabase-js` into the local-mode bundle (saves ~30KB).
- **Singleton** — only one DataStore instance active at a time.
- **Reset** — needed for mode switching (local ↔ cloud) and test isolation.

> **Production Complexity Warning**: The factory above works for V1 local-only mode. The real `factory.ts` in MatchOps-Local is 1100+ lines because cloud mode introduces significant complexity:
>
> - **Race condition protection**: Multiple callers may request `getDataStore()` simultaneously during app startup. The factory must serialize initialization, not just cache the result.
> - **User-scoped database switching**: When a different user signs in, the factory must tear down the current DataStore and create a new one scoped to the new user's data.
> - **SyncedDataStore for cloud mode**: Cloud mode does not use `SupabaseDataStore` directly. Instead, the factory creates a `SyncedDataStore` that wraps both `LocalDataStore` and `SupabaseDataStore` for local-first writes with background sync.
> - **Background cloud setup with retry**: The cloud store (Supabase connection, auth session) initializes asynchronously after the local store is ready. This uses retry logic (3 attempts with increasing delays) so the user is never blocked.
> - **Reset-in-progress guards**: Mode switching and sign-out must not race with ongoing initialization or sync operations.
>
> For V1 local-only, the simple factory above is correct. When you add cloud mode, expect the factory to grow substantially.

---

## 5. Backend Config

```typescript
// src/config/backendConfig.ts

export type BackendMode = 'local' | 'cloud';

/** Runtime override stored in localStorage (survives page reload) */
const OVERRIDE_KEY = 'practice_planner_backend_mode';

export function getBackendMode(): BackendMode {
  // 1. Check runtime override (set by user switching modes)
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem(OVERRIDE_KEY);
    if (override === 'local' || override === 'cloud') return override;
  }

  // 2. Check environment variable
  const envMode = process.env.NEXT_PUBLIC_BACKEND_MODE;
  if (envMode === 'cloud') return 'cloud';

  // 3. Default to local
  return 'local';
}

export function isCloudAvailable(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function enableCloudMode(): boolean {
  // Returns false if Supabase environment variables are not configured
  if (!isCloudAvailable()) return false;
  localStorage.setItem(OVERRIDE_KEY, 'cloud');
  return true;
}

export interface ModeSwitchResult {
  success: boolean;
  reason?: string;
  message?: string;
}

export function disableCloudMode(): ModeSwitchResult {
  // Returns a result object because switching away from cloud mode
  // may need to handle pending sync operations, active sessions, etc.
  try {
    localStorage.setItem(OVERRIDE_KEY, 'local');
    return { success: true };
  } catch {
    return { success: false, reason: 'STORAGE_ERROR', message: 'Failed to update mode preference' };
  }
}
```

---

## 6. SupabaseDataStore — Transform Patterns

The Supabase implementation transforms between app types (camelCase) and database columns (snake_case).

### Forward Transform (App → DB)

```typescript
private exerciseToRow(exercise: Exercise, userId: string): ExerciseInsert {
  return {
    id: exercise.id,
    user_id: userId,
    name: exercise.name,
    description: exercise.description || '',
    category: exercise.category,
    subcategory: exercise.subcategory ?? null,     // '' → null
    tags: exercise.tags ?? [],
    duration_minutes: exercise.durationMinutes,
    intensity: exercise.intensity,
    player_count_min: exercise.playerCountMin,
    player_count_max: exercise.playerCountMax,
    age_group_suitability: exercise.ageGroupSuitability ?? [],
    coaching_points: exercise.coachingPoints ?? [],
    equipment: exercise.equipment as unknown as Json,      // JSONB
    variations: exercise.variations as unknown as Json,     // JSONB
    progressions: exercise.progressions ?? [],
    field_setup: exercise.fieldSetup as unknown as Json,    // JSONB
    is_favorite: exercise.isFavorite ?? false,
    source: exercise.source ?? 'user',
    created_at: exercise.createdAt,
    updated_at: exercise.updatedAt,
  };
}
```

### Reverse Transform (DB → App)

```typescript
private rowToExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category as ExerciseCategory,
    subcategory: row.subcategory ?? undefined,
    tags: (row.tags as string[]) ?? [],
    durationMinutes: row.duration_minutes,
    intensity: row.intensity as Exercise['intensity'],
    playerCountMin: row.player_count_min ?? 1,
    playerCountMax: row.player_count_max ?? 0,
    ageGroupSuitability: (row.age_group_suitability as string[]) ?? [],
    coachingPoints: (row.coaching_points as string[]) ?? [],
    equipment: (row.equipment as unknown as EquipmentItem[]) ?? [],
    variations: (row.variations as unknown as ExerciseVariation[]) ?? [],
    progressions: (row.progressions as string[]) ?? [],
    fieldSetup: (row.field_setup as unknown as FieldDiagram) ?? defaultFieldDiagram(),
    isFavorite: row.is_favorite ?? false,
    source: (row.source as Exercise['source']) ?? 'user',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}
```

### Key Transform Rules

| Pattern | App → DB | DB → App |
|---------|----------|----------|
| Empty string optional fields | `value === '' ? null : value` | `value ?? ''` |
| JSONB arrays | `value ?? []` | `(value as Type[]) ?? []` |
| JSONB objects | `value as unknown as Json` | `value as unknown as AppType` |
| Boolean defaults | `value ?? false` | `value ?? false` |
| Timestamps | Pass through | Pass through |
| Enum strings | Pass through (validate on read) | Cast with type assertion |

---

## 7. Supabase Error Handling

```typescript
// src/datastore/supabase/retry.ts

import { isTransientError } from '@/utils/transientErrors';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransientError(error) || attempt === config.maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        config.maxDelayMs
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

### Transient Error Detection

```typescript
// src/utils/transientErrors.ts

const TRANSIENT_STATUS_CODES = [408, 429, 500, 502, 503, 504];

const TRANSIENT_ERROR_PATTERNS = [
  'fetch failed',
  'network error',
  'load failed',
  'networkerror',
  'failed to fetch',
  'signal is aborted',        // Chrome Mobile Android AbortError
  'the operation was aborted',
  'aborted without reason',
];

export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (TRANSIENT_ERROR_PATTERNS.some(p => message.includes(p))) return true;
  }

  // Check HTTP status codes
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    if (TRANSIENT_STATUS_CODES.includes(status)) return true;
  }

  return false;
}
```

---

## Traps

1. **IndexedDB `readwrite` transactions are serialized** — two concurrent writes to the same store will queue automatically. No need for app-level locks.

2. **`getStorageItem` can return `null` on first ever access** — always default: `const exercises = await getStorageItem(...) ?? {}`.

3. **JSONB casts in Supabase** — the Supabase codegen types use `Json` which doesn't match your app types. Use `as unknown as Json` for writes and `as unknown as AppType` for reads.

4. **Empty string vs NULL** — PostgreSQL doesn't distinguish between `''` and `''`, but it does distinguish `''` from `NULL`. Decide which fields use empty string (app side) and transform to NULL for the database.

5. **`Date` objects** — IndexedDB can store Date objects natively, but JSON serialization converts them to strings. Be consistent: store ISO strings everywhere.

6. **Dynamic imports for code splitting** — the SupabaseDataStore import should be dynamic (`await import(...)`) so the Supabase SDK isn't included in the local-mode bundle.
