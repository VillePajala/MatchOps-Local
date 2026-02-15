# 14. Error Handling — Sentry, Error Taxonomy, Retry, Toasts, Sanitization

> **Audience**: AI agent building the new app
> **Purpose**: How to handle errors at every layer — from IndexedDB to Supabase to user-facing messages

---

## Error Flow

```
Storage/Network Error
    │
    ▼
DataStore throws typed error (NotFoundError, NetworkError, etc.)
    │
    ▼
Hook catches → shows toast (user-safe message)
    │
    ▼
Sentry captures (full details, NOT shown to user)
    │
    ▼
Error Boundary catches unhandled React crashes
```

---

## 1. Error Taxonomy

```typescript
// src/interfaces/DataStoreErrors.ts

export type DataStoreErrorCode =
  | 'NOT_INITIALIZED'  // Store not ready
  | 'NOT_FOUND'        // Entity doesn't exist
  | 'ALREADY_EXISTS'   // Uniqueness violation
  | 'VALIDATION_ERROR' // Invalid data
  | 'STORAGE_ERROR'    // IndexedDB failure
  | 'NETWORK_ERROR'    // Supabase unreachable
  | 'AUTH_ERROR'       // Authentication failure
  | 'NOT_SUPPORTED'    // Operation not available in current mode
  | 'CONFLICT'         // Optimistic lock conflict
  | 'UNKNOWN';         // Catch-all

export class DataStoreError extends Error {
  public readonly code: DataStoreErrorCode;
  public readonly cause?: Error;        // Technical details (for Sentry)

  constructor(
    message: string,                    // User-safe message
    code: DataStoreErrorCode,
    cause?: Error
  ) {
    super(message);
    this.name = 'DataStoreError';
    this.code = code;
    this.cause = cause;
  }
}

// Specific subclasses
export class NotFoundError extends DataStoreError {
  constructor(public resourceType: string, public resourceId: string) {
    super(`${resourceType} not found`, 'NOT_FOUND');
  }
}

export class NetworkError extends DataStoreError {
  constructor(message: string, public statusCode?: number, cause?: Error) {
    super(message, 'NETWORK_ERROR', cause);
  }
}

export class ValidationError extends DataStoreError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR');
  }
}
```

---

## 2. Error Message Sanitization

**The `message` field is what the user sees. NEVER include implementation details.**

```typescript
// ❌ BAD: Leaks implementation details
throw new Error('PostgreSQL error: relation "exercises" does not exist');
throw new Error('Supabase error 42P01: undefined_table');
throw new Error(`IndexedDB TransactionInactiveError in store 'exercises'`);

// ✅ GOOD: User-safe messages
throw new StorageError('Unable to save exercise. Please try again.');
throw new NetworkError('Connection error. Please check your internet.');
throw new NotFoundError('Exercise', exerciseId);
```

### Classifying Supabase Errors

```typescript
function classifyAndThrowError(error: unknown, operation: string): never {
  // Network errors (transient)
  if (isTransientError(error)) {
    throw new NetworkError('Connection error. Please try again.');
  }

  // Supabase PostgreSQL errors
  if (typeof error === 'object' && error !== null) {
    const pgError = error as { code?: string; message?: string; status?: number };

    // Auth errors
    if (pgError.status === 401 || pgError.status === 403) {
      throw new AuthError('Please sign in again.', undefined, { code: 'session_expired' });
      // AuthError(message, cause?, errorInfo?)
    }

    // Not found
    if (pgError.code === 'PGRST116') {  // PostgREST: no rows found
      throw new NotFoundError(operation, 'unknown');
    }

    // Unique violation
    if (pgError.code === '23505') {
      throw new AlreadyExistsError(operation, 'unknown');  // (resourceType, resourceId)
    }
  }

  // Unknown: sanitize and throw
  throw new DataStoreError(
    `Unable to ${operation}. Please try again.`,
    'UNKNOWN',
    error  // Full error goes to `cause` for Sentry, NOT to message
  );
}
```

---

## 3. Retry Logic

### Transient Error Detection

```typescript
// src/utils/transientErrors.ts

export const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export const TRANSIENT_ERROR_PATTERNS = [
  'fetch failed',
  'network error',
  'load failed',
  'networkerror',
  'failed to fetch',
  'signal is aborted',         // Chrome Mobile Android AbortError
  'the operation was aborted',
  'aborted without reason',
];

export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (TRANSIENT_ERROR_PATTERNS.some(p => message.includes(p))) return true;
  }

  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    if (TRANSIENT_STATUS_CODES.has(status)) return true;
  }

  return false;
}
```

### withRetry Utility

```typescript
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientError(error) || attempt === maxRetries) {
        throw error;
      }
      const delay = Math.min(baseDelay * Math.pow(2, attempt), 30_000);
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  throw new Error('Unreachable');  // TypeScript needs this
}
```

---

## 4. Toast System

```tsx
// src/contexts/ToastProvider.tsx

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    // Generate id BEFORE setToasts so setTimeout can reference it
    const id = generateId();

    // Dedup: skip if identical message+type already visible
    setToasts(prev => {
      if (prev.some(t => t.message === message && t.type === type)) return prev;

      const next = [...prev, { id, message, type }];
      return next.length > 5 ? next.slice(-5) : next;  // Cap at 5
    });

    // Auto-dismiss: errors 5s, others 3s
    const duration = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={toastStyles[toast.type]}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
```

**Key patterns**:
- **Dedup by content** — prevents toast spam during rapid errors
- **Cap at 5** — prevents toast accumulation when many operations fail
- **Longer duration for errors** — users need time to read error messages
- **`useMemo` on `showToast`** — prevents unnecessary re-renders of consumers

---

## 5. Sentry Integration

```typescript
// src/instrumentation-client.ts

import * as Sentry from '@sentry/nextjs';

const isProduction = process.env.NODE_ENV === 'production';
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (isProduction && dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,   // 10% of transactions
    replaysOnErrorSampleRate: 1.0,  // 100% replays on errors
    replaysSessionSampleRate: 0,    // No session replays

    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,      // Privacy: mask all text
        blockAllMedia: true,    // Privacy: block media
      }),
    ],

    // Filter browser noise
    beforeSend(event) {
      const message = event.exception?.values?.[0]?.value || '';

      // Filter common browser noise
      const ignorePatterns = [
        'ResizeObserver loop',
        'Non-Error promise rejection',
        'ChunkLoadError',
      ];
      if (ignorePatterns.some(p => message.includes(p))) return null;

      // Scrub auth URLs
      if (event.request?.url) {
        event.request.url = scrubUrl(event.request.url);
      }

      return event;
    },
  });
}
```

**Key patterns**:
- **Production only** — don't send dev errors to Sentry
- **10% trace sampling** — balances cost vs visibility
- **100% error replays** — see exactly what the user did before the crash
- **Privacy masking** — mask text and block media in replays
- **Filter noise** — ResizeObserver errors are browser bugs, not app bugs

---

## 6. Error Boundary

```tsx
// src/app/global-error.tsx

'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <h2>Something went wrong</h2>
          <p>The error has been reported automatically.</p>
          <button onClick={reset}>Try again</button>
        </div>
      </body>
    </html>
  );
}
```

---

## Traps

1. **Never expose implementation details in error messages**: "PostgreSQL error 42P01" means nothing to users. "Unable to save" is enough.

2. **`cause` field for technical details**: Use `new DataStoreError('User message', code, technicalError)`. Sentry captures `cause`; the user only sees `message`.

3. **Chrome Mobile Android AbortError**: The browser cancels fetch requests with "signal is aborted without reason". This is transient — retry it. Include abort patterns in `TRANSIENT_ERROR_PATTERNS`.

4. **Toast dedup prevents spam**: Without dedup, a network outage triggers dozens of identical "Connection error" toasts.

5. **`logger.debug()` is suppressed in production**: Don't flag it as "logging in production". It's intentional — debug logs only appear in development.

6. **Sentry filter should be narrow**: Filtering too broadly hides real errors. Only filter known browser noise patterns.
