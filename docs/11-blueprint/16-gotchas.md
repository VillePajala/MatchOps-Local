# 16. Gotchas & Lessons Learned — The Expensive Knowledge

> **Audience**: AI agent building the new app
> **Purpose**: Every trap, bug, and lesson that cost hours to debug in MatchOps-Local. Read these BEFORE building.

---

## React & State Management

### G1: `useState(initialValue)` Only Uses Initial Value Once

```typescript
// ❌ BUG: If `prop` changes, `localValue` stays the same
const [localValue, setLocalValue] = useState(prop);

// ✅ FIX: Sync with useEffect
const [localValue, setLocalValue] = useState(prop);
useEffect(() => { setLocalValue(prop); }, [prop]);
```

This bit us in modal forms that receive props from parent state.

### G2: Unstable Callback References Cause Infinite Loops

```typescript
// ❌ BUG: New function created every render → effect runs every render → infinite loop
useEffect(() => {
  callback(data);
}, [callback]);  // callback is a new reference each render!

// ✅ FIX: Memoize the callback
const stableCallback = useCallback((data) => { /* ... */ }, [dep1, dep2]);
useEffect(() => {
  stableCallback(data);
}, [stableCallback]);
```

Any function passed as a prop or to a hook must be wrapped in `useCallback`. This caused infinite re-renders in at least 3 different hooks during development.

### G3: Debounce Timers Cancelled by Unrelated Re-Renders

If your app has a timer that ticks every second (updating state), and you have a 2-second debounce for saving positions:

```typescript
// ❌ BUG: Timer tick creates new state object → effect re-runs → debounce restarted
useEffect(() => {
  const timer = setTimeout(save, 2000);
  return () => clearTimeout(timer);
}, [stateObject]);  // New object reference every second!

// ✅ FIX: Serialize to string for content-based change detection
const serialized = JSON.stringify(relevantData);
useEffect(() => {
  if (prevRef.current !== null && prevRef.current !== serialized) {
    timer = setTimeout(save, 2000);
  }
  prevRef.current = serialized;
}, [serialized]);
```

This took hours to debug. Player positions were never saving because the timer tick was cancelling the debounce.

### G4: Ref + State Dual Tracking for Callbacks

```typescript
// ❌ BUG: setTimeout callback reads stale state
setTimeout(() => {
  if (enabled) save();  // `enabled` is stale — captured at setTimeout time
}, 2000);

// ✅ FIX: Use ref for always-current value
const enabledRef = useRef(enabled);
useEffect(() => { enabledRef.current = enabled; }, [enabled]);

setTimeout(() => {
  if (enabledRef.current) save();  // Always current
}, 2000);
```

### G5: `useMemo` the Context Value

```typescript
// ❌ BUG: All consumers re-render on every provider render
return <AuthContext.Provider value={{ user, signIn, signOut }}>;

// ✅ FIX: Memoize the value object
const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
return <AuthContext.Provider value={value}>;
```

---

## IndexedDB

### G6: Mobile Chrome Has Transient IndexedDB Failures

IndexedDB reads/writes can fail randomly on mobile Chrome. Not a bug — it's how the browser manages resources.

**Fix**: React Query's `retry: 3` handles this naturally. NEVER reduce retries below 3.

### G7: IndexedDB `readwrite` Transactions Are Serialized

Two concurrent writes to the same store queue automatically. No app-level locking needed.

```typescript
// This is FINE — IndexedDB handles it
await Promise.all([
  setStorageItem('exercises', data1),
  setStorageItem('exercises', data2),
]);
```

### G8: Private/Incognito Mode Disables IndexedDB

PWA installation is impossible in private mode. IndexedDB is restricted or disabled. Detect this early:

```typescript
try {
  const db = await openDB('test', 1, { upgrade(db) { db.createObjectStore('test'); } });
  db.close();
  await deleteDB('test');
} catch {
  showMessage('This app requires a regular browser window (not incognito).');
}
```

### G9: `openDB` Should Be Called Once and Cached

```typescript
// ❌ BUG: Opens new connection on every call
async function getData() {
  const db = await openDB('mydb', 1, { ... });
  return db.get('store', key);
}

// ✅ FIX: Cache the promise
let dbPromise: Promise<IDBPDatabase> | null = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB('mydb', 1, { ... });
  }
  return dbPromise;
}
```

---

## Supabase

### G10: Empty String ↔ NULL Transform

PostgreSQL `NULL` and `''` are different. App uses `''` for optional string fields. Must transform:

```typescript
// App → DB: empty string becomes NULL
seasonId: game.seasonId === '' ? null : game.seasonId,

// DB → App: NULL becomes empty string
seasonId: row.season_id ?? '',
```

Missing this transform caused subtle bugs where optional fields lost their "empty" state.

### G11: JSONB Type Mismatch

Supabase codegen produces `Json` type. App types use specific interfaces. Must double-cast:

```typescript
equipment: exercise.equipment as unknown as Json,          // Write
equipment: (row.equipment as unknown as EquipmentItem[]) ?? [],  // Read
```

### G12: Unknown Auth Events Must NOT Default to `signed_out`

```typescript
// ❌ BUG: New Supabase events cause login loops
default:
  return 'signed_out';  // Unknown event → sign out → user logs back in → event fires → loop

// ✅ FIX: Default to signed_in and log
default:
  logger.warn(`Unknown auth event: ${event}`);
  return 'signed_in';
```

### G13: RPC Must Validate `auth.uid()` in SECURITY DEFINER Functions

SECURITY DEFINER bypasses RLS. The function runs as the creator, not the caller. You MUST validate ownership:

```sql
-- ✅ Always check
IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_id AND user_id = auth.uid()) THEN
  RAISE EXCEPTION 'Not found or not owned';
END IF;
```

### G14: Never Rewrite RPC When Adding Columns

```
-- ❌ This fails if column doesn't exist yet
Migration A: ALTER TABLE + DROP/CREATE FUNCTION (references new column)

-- ✅ Separate migrations
Migration A: ALTER TABLE ADD COLUMN new_field text;
Migration B: DROP/CREATE FUNCTION (now column exists)
```

---

## PWA

### G15: Don't Call `skipWaiting()` on Install

```javascript
// ❌ BUG: Activates new SW mid-session, breaking in-progress work
self.addEventListener('install', () => {
  self.skipWaiting();  // DANGEROUS
});

// ✅ FIX: Wait for user to click update button
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();  // Only when user agrees
  }
});
```

### G16: Cache Name Must Change on Every Deploy

```javascript
// ❌ BUG: Users get stale assets forever
const CACHE_NAME = 'my-app-cache';

// ✅ FIX: Include build timestamp
const CACHE_NAME = 'my-app-2026-02-14T12-00-00';
```

### G17: iOS Has No `beforeinstallprompt`

iOS Safari doesn't fire the install prompt event. Users must install via Share → "Add to Home Screen". Consider showing manual instructions for iOS users.

---

## Testing

### G18: Never Use `forceExit` in Jest

```javascript
// ❌ Masks resource leaks
forceExit: true,

// ✅ Find and fix the leak
detectOpenHandles: true,
```

### G19: React Query `retry: false` in Tests

```typescript
// ❌ Tests wait 30+ seconds for expected errors to retry
const queryClient = new QueryClient();

// ✅ Disable retries in test
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
```

### G20: Never Use `setTimeout` to Wait in Tests

```typescript
// ❌ FLAKY: Race condition
await new Promise(resolve => setTimeout(resolve, 100));

// ✅ RELIABLE: Wait for condition
await waitFor(() => {
  expect(screen.getByText('Done')).toBeInTheDocument();
});
```

---

## Performance

### G21: Dynamic Import for Heavy Dependencies

```typescript
// ❌ Loads Supabase SDK even in local mode
import { SupabaseDataStore } from './SupabaseDataStore';

// ✅ Dynamic import — only loads when needed
const { SupabaseDataStore } = await import('./SupabaseDataStore');
```

Apply this to:
- Supabase SDK (~30KB) — only in cloud mode
- xlsx library — only when exporting
- Heavy modals — only when opened

### G22: Memoize Return Values from Custom Hooks

```typescript
// ❌ New object on every render → consumers re-render
return { exercises, isLoading, createExercise };

// ✅ Stable reference
return useMemo(
  () => ({ exercises, isLoading, createExercise }),
  [exercises, isLoading, createExercise]
);
```

> **This applies to EVERY custom hook that returns an object.** In MatchOps-Local, this was missed in 8+ hooks across multiple review rounds (rounds 3, 4, 5, and 11) and required a full audit to fix. Treat `useMemo` on hook return values as mandatory, not optional. Every time you write `return { ... }` at the end of a custom hook, wrap it in `useMemo`.

### G23: History Size Cap for Undo/Redo

```typescript
// ❌ Unbounded memory growth on long sessions
history.push(newState);

// ✅ Cap at reasonable size
const MAX_HISTORY = 150;  // ~1.5-7.5MB
if (history.length > MAX_HISTORY) {
  history = history.slice(history.length - MAX_HISTORY);
}
```

---

## Error Handling

### G24: `logger.debug()` Is NOT "Logging in Production"

```typescript
logger.debug('Something happened');
// This is SUPPRESSED in production. Don't flag it as a security issue.
```

### G25: Chrome Mobile Android AbortError

Chrome on Android cancels fetch requests with "signal is aborted without reason". This is transient — include abort patterns in retry logic:

```typescript
const TRANSIENT_ERROR_PATTERNS = [
  // ... other patterns ...
  'aborterror',           // The error name itself (lowercased for comparison)
  'signal is aborted',   // The error message
];
```

### G26: Toast Dedup Prevents Spam

Without dedup, a network outage triggers dozens of identical error toasts:

```typescript
showToast = (message, type) => {
  setToasts(prev => {
    if (prev.some(t => t.message === message && t.type === type)) return prev;
    // ...
  });
};
```

---

## General

### G27: Language Preference in localStorage, NOT DataStore

i18n initializes before auth. Using DataStore for language preference causes race conditions because DataStore needs the user ID, which isn't available until auth resolves.

### G28: Auth is Independent of Data Mode

A user can be authenticated (via Supabase) while using local storage mode. Don't couple auth and data mode.

### G29: `ON DELETE CASCADE` Is Intentional but Dangerous

Deleting a Supabase auth user cascades to ALL their data (via FK to `auth.users`). This is correct for GDPR account deletion. But be careful with other entity deletions — use `ON DELETE SET NULL` for optional references.

### G30: Subscription Bypass Is Intentional

If you see `return true` in subscription checks, it's intentional — free sync for all users until monetization is decided. Don't "fix" it.

### G31: Never Show Raw Error Messages to Users

Error messages from Supabase, IndexedDB, or catch blocks contain implementation details (table names, RLS policy violations, SQL state codes). Always classify and present user-safe messages:

```typescript
// ❌ BUG: User sees "relation 'exercises' violates row-level security"
showToast(error.message, 'error');

// ✅ FIX: Classify and present safe message
if (error instanceof NetworkError) showToast('Connection failed. Please try again.', 'error');
else if (error instanceof AuthError) showToast('Please sign in again.', 'error');
else showToast('Something went wrong. Please try again.', 'error');
```

In MatchOps-Local, error sanitization is centralized in `classifyAndThrowError()` which maps raw Supabase/Postgres errors to typed error classes (`NetworkError`, `AuthError`, `StorageError`, `ValidationError`). Each error class has a user-safe `message` field. Components should never display `error.message` from raw catch blocks.
