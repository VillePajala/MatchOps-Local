# Phase 1: Storage Service Implementation Guide

**⚠️ DOCUMENT SUPERSEDED ⚠️**

**This document describes over-engineered solutions that are unnecessary.**

**👉 USE THIS INSTEAD: [DOCUMENTATION_AUDIT_RESULTS.md](./DOCUMENTATION_AUDIT_RESULTS.md) (2-4 hour fix)**

---

[← Corrected Plan](./DOCUMENTATION_AUDIT_RESULTS.md) | [Original Storage Plan](./STORAGE_INTEGRATION_PLAN.md) | [Phase 2 Original →](./PHASE2_UTILITY_REFACTOR.md)

## ~~Overview~~ (ORIGINAL - SUPERSEDED)
This document provides detailed implementation steps for creating the storage service layer that will be used by all data utilities.

## File Structure
```
src/utils/storage/
├── index.ts              # Public API exports
├── storageService.ts     # Core service implementation
├── types.ts             # TypeScript interfaces
└── __tests__/
    └── storageService.test.ts
```

## Implementation Steps

### Step 1: Create Storage Service Types
**File:** `src/utils/storage/types.ts`

```typescript
export interface StorageOperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

export interface StorageServiceConfig {
  retryAttempts?: number;
  retryDelay?: number;
  cacheEnabled?: boolean;
}

export type StorageEventType = 'read' | 'write' | 'delete' | 'clear' | 'error';

export interface StorageEvent {
  type: StorageEventType;
  key?: string;
  timestamp: number;
  duration?: number;
  error?: Error;
}
```

### Step 2: Implement Core Storage Service
**File:** `src/utils/storage/storageService.ts`

```typescript
import { storageFactory } from '../storageFactory';
import { StorageAdapter } from '../storageAdapter';
import { createLogger } from '../logger';
import type { StorageServiceConfig, StorageEvent, StorageOperationResult } from './types';

class StorageService {
  private adapter: StorageAdapter | null = null;
  private initPromise: Promise<StorageAdapter> | null = null;
  private readonly logger = createLogger('StorageService');
  private readonly config: StorageServiceConfig;
  private eventListeners: ((event: StorageEvent) => void)[] = [];

  constructor(config: StorageServiceConfig = {}) {
    this.config = {
      retryAttempts: 3,
      retryDelay: 100,
      cacheEnabled: false,
      ...config
    };
  }

  /**
   * Get or initialize the storage adapter
   */
  private async getAdapter(): Promise<StorageAdapter> {
    if (this.adapter) {
      return this.adapter;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeAdapter();
    return this.initPromise;
  }

  /**
   * Initialize the storage adapter with retry logic
   */
  private async initializeAdapter(): Promise<StorageAdapter> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts!; attempt++) {
      try {
        this.logger.debug(`Initializing storage adapter (attempt ${attempt}/${this.config.retryAttempts})`);
        this.adapter = await storageFactory.getAdapter();
        this.logger.info(`Storage adapter initialized: ${this.adapter.getBackendName()}`);
        return this.adapter;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Failed to initialize adapter (attempt ${attempt}):`, error);

        if (attempt < this.config.retryAttempts!) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay! * attempt));
        }
      }
    }

    this.initPromise = null;
    throw lastError || new Error('Failed to initialize storage adapter');
  }

  /**
   * Get item from storage with timing and error handling
   */
  async getItem(key: string): Promise<string | null> {
    const startTime = performance.now();

    try {
      const adapter = await this.getAdapter();
      const value = await adapter.getItem(key);

      this.emitEvent({
        type: 'read',
        key,
        timestamp: Date.now(),
        duration: performance.now() - startTime
      });

      return value;
    } catch (error) {
      this.logger.error(`Failed to get item "${key}":`, error);

      this.emitEvent({
        type: 'error',
        key,
        timestamp: Date.now(),
        duration: performance.now() - startTime,
        error: error as Error
      });

      throw error;
    }
  }

  /**
   * Set item in storage with timing and error handling
   */
  async setItem(key: string, value: string): Promise<void> {
    const startTime = performance.now();

    try {
      const adapter = await this.getAdapter();
      await adapter.setItem(key, value);

      this.emitEvent({
        type: 'write',
        key,
        timestamp: Date.now(),
        duration: performance.now() - startTime
      });
    } catch (error) {
      this.logger.error(`Failed to set item "${key}":`, error);

      this.emitEvent({
        type: 'error',
        key,
        timestamp: Date.now(),
        duration: performance.now() - startTime,
        error: error as Error
      });

      throw error;
    }
  }

  /**
   * Remove item from storage
   */
  async removeItem(key: string): Promise<void> {
    const startTime = performance.now();

    try {
      const adapter = await this.getAdapter();
      await adapter.removeItem(key);

      this.emitEvent({
        type: 'delete',
        key,
        timestamp: Date.now(),
        duration: performance.now() - startTime
      });
    } catch (error) {
      this.logger.error(`Failed to remove item "${key}":`, error);

      this.emitEvent({
        type: 'error',
        key,
        timestamp: Date.now(),
        duration: performance.now() - startTime,
        error: error as Error
      });

      throw error;
    }
  }

  /**
   * Clear all storage
   */
  async clear(): Promise<void> {
    const startTime = performance.now();

    try {
      const adapter = await this.getAdapter();
      await adapter.clear();

      this.emitEvent({
        type: 'clear',
        timestamp: Date.now(),
        duration: performance.now() - startTime
      });
    } catch (error) {
      this.logger.error('Failed to clear storage:', error);

      this.emitEvent({
        type: 'error',
        timestamp: Date.now(),
        duration: performance.now() - startTime,
        error: error as Error
      });

      throw error;
    }
  }

  /**
   * Get all keys from storage
   */
  async getKeys(): Promise<string[]> {
    const adapter = await this.getAdapter();
    return adapter.getKeys();
  }

  /**
   * Get storage backend name
   */
  async getBackendName(): Promise<string> {
    const adapter = await this.getAdapter();
    return adapter.getBackendName();
  }

  /**
   * Perform operation with fallback to localStorage
   */
  async withFallback<T>(
    operation: () => Promise<T>,
    fallback: () => T
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logger.warn('Operation failed, using fallback:', error);
      return fallback();
    }
  }

  /**
   * Batch operations for better performance
   */
  async batch(operations: Array<() => Promise<void>>): Promise<void[]> {
    return Promise.all(operations.map(op => op()));
  }

  /**
   * Add event listener
   */
  addEventListener(listener: (event: StorageEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: StorageEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Emit storage event
   */
  private emitEvent(event: StorageEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        this.logger.error('Error in event listener:', error);
      }
    });
  }

  /**
   * Reset service (mainly for testing)
   */
  async reset(): Promise<void> {
    this.adapter = null;
    this.initPromise = null;
    this.eventListeners = [];
  }
}

// Export singleton instance
export const storage = new StorageService();
```

### Step 3: Create Public API
**File:** `src/utils/storage/index.ts`

```typescript
import { storage } from './storageService';

// Export the service
export { storage };

// Export types
export * from './types';

/**
 * Helper functions that match the current localStorage API
 * These make migration easier by maintaining similar function signatures
 */

export const getStorageItem = async (key: string): Promise<string | null> => {
  return storage.getItem(key);
};

export const setStorageItem = async (key: string, value: string): Promise<void> => {
  return storage.setItem(key, value);
};

export const removeStorageItem = async (key: string): Promise<void> => {
  return storage.removeItem(key);
};

export const clearStorage = async (): Promise<void> => {
  return storage.clear();
};

export const getAllStorageKeys = async (): Promise<string[]> => {
  return storage.getKeys();
};

/**
 * Utility function for debugging - logs current storage backend
 */
export const verifyStorageBackend = async (): Promise<string> => {
  const backend = await storage.getBackendName();
  console.log(`[Storage] Current backend: ${backend}`);
  return backend;
};

/**
 * Migration helper - reads from localStorage if not found in primary storage
 */
export const getItemWithMigration = async (key: string): Promise<string | null> => {
  // Try primary storage first
  let value = await storage.getItem(key);

  // If not found and we're in a browser, check localStorage
  if (!value && typeof window !== 'undefined' && window.localStorage) {
    try {
      value = window.localStorage.getItem(key);

      // If found in localStorage, migrate it
      if (value) {
        await storage.setItem(key, value);
        // Optionally remove from localStorage after successful migration
        // window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('[Storage] Failed to migrate from localStorage:', error);
    }
  }

  return value;
};
```

### Step 4: Create Tests
**File:** `src/utils/storage/__tests__/storageService.test.ts`

```typescript
import { storage } from '../storageService';
import { storageFactory } from '../../storageFactory';

jest.mock('../../storageFactory');

describe('StorageService', () => {
  const mockAdapter = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    getKeys: jest.fn(),
    getBackendName: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (storageFactory.getAdapter as jest.Mock).mockResolvedValue(mockAdapter);
    storage.reset();
  });

  describe('Basic Operations', () => {
    it('should get item from storage', async () => {
      mockAdapter.getItem.mockResolvedValue('test-value');

      const value = await storage.getItem('test-key');

      expect(value).toBe('test-value');
      expect(mockAdapter.getItem).toHaveBeenCalledWith('test-key');
    });

    it('should set item in storage', async () => {
      await storage.setItem('test-key', 'test-value');

      expect(mockAdapter.setItem).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should remove item from storage', async () => {
      await storage.removeItem('test-key');

      expect(mockAdapter.removeItem).toHaveBeenCalledWith('test-key');
    });

    it('should clear storage', async () => {
      await storage.clear();

      expect(mockAdapter.clear).toHaveBeenCalled();
    });

    it('should get all keys', async () => {
      mockAdapter.getKeys.mockResolvedValue(['key1', 'key2']);

      const keys = await storage.getKeys();

      expect(keys).toEqual(['key1', 'key2']);
    });
  });

  describe('Adapter Initialization', () => {
    it('should initialize adapter only once', async () => {
      await Promise.all([
        storage.getItem('key1'),
        storage.getItem('key2'),
        storage.getItem('key3')
      ]);

      expect(storageFactory.getAdapter).toHaveBeenCalledTimes(1);
    });

    it('should retry on initialization failure', async () => {
      (storageFactory.getAdapter as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(mockAdapter);

      await storage.getItem('test-key');

      expect(storageFactory.getAdapter).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when adapter fails', async () => {
      mockAdapter.getItem.mockRejectedValue(new Error('Storage error'));

      await expect(storage.getItem('test-key')).rejects.toThrow('Storage error');
    });

    it('should handle initialization failure', async () => {
      (storageFactory.getAdapter as jest.Mock).mockRejectedValue(new Error('Init failed'));

      await expect(storage.getItem('test-key')).rejects.toThrow();
    });
  });

  describe('Event System', () => {
    it('should emit events on operations', async () => {
      const listener = jest.fn();
      storage.addEventListener(listener);

      await storage.setItem('test-key', 'test-value');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'write',
          key: 'test-key'
        })
      );
    });

    it('should handle errors in event listeners', async () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      storage.addEventListener(errorListener);

      // Should not throw even if listener fails
      await expect(storage.setItem('test-key', 'test-value')).resolves.not.toThrow();
    });
  });
});
```

## Testing Strategy

### Unit Tests
1. Test each storage operation independently
2. Verify error handling and retries
3. Test event emission
4. Verify adapter initialization

### Integration Tests
1. Test with actual storage factory
2. Verify IndexedDB operations
3. Test fallback scenarios
4. Verify migration helpers

### Performance Tests
1. Measure operation latency
2. Test batch operations
3. Verify no memory leaks
4. Test under storage pressure

## Migration Path

### Step 1: Deploy Storage Service
- Add new storage service alongside existing code
- No breaking changes initially

### Step 2: Add Feature Flag
```typescript
const USE_NEW_STORAGE = process.env.NEXT_PUBLIC_USE_NEW_STORAGE === 'true';

export const getItem = USE_NEW_STORAGE
  ? getStorageItem
  : getLocalStorageItem;
```

### Step 3: Gradual Migration
- Convert one utility at a time
- Test thoroughly after each conversion
- Monitor for issues

### Step 4: Remove Old Code
- Once all utilities migrated
- Remove direct localStorage usage
- Clean up feature flags

## Common Issues & Solutions

### Issue: Async/Await in React Components
**Problem:** Components may not handle async storage operations properly

**Solution:**
```typescript
// Use React Query or useEffect
useEffect(() => {
  const loadData = async () => {
    const data = await storage.getItem('key');
    setData(data);
  };
  loadData();
}, []);
```

### Issue: Synchronous Code Expectations
**Problem:** Existing code expects synchronous storage operations

**Solution:**
```typescript
// Create wrapper with default values
const getSetting = async (key: string, defaultValue: string) => {
  try {
    return await storage.getItem(key) || defaultValue;
  } catch {
    return defaultValue;
  }
};
```

### Issue: Error Handling
**Problem:** Need graceful degradation if storage fails

**Solution:**
```typescript
// Use withFallback method
const value = await storage.withFallback(
  () => storage.getItem('key'),
  () => localStorage.getItem('key')
);
```

## Success Metrics

### Technical Metrics
- [ ] All storage operations use new service
- [ ] Zero direct localStorage calls
- [ ] 100% test coverage
- [ ] < 100ms operation latency

### Functional Metrics
- [ ] No data loss during migration
- [ ] All features working correctly
- [ ] Import/export functioning
- [ ] Performance improved or maintained

## Next Steps

1. **Review & Approval** - Get team consensus on approach
2. **Implementation** - Build storage service
3. **Testing** - Comprehensive test suite
4. **Documentation** - Update developer docs
5. **Rollout** - Gradual deployment with monitoring

---

## Related Documentation

- **[← Back to Storage Integration Plan](./STORAGE_INTEGRATION_PLAN.md)**
- **[Phase 2: Utility Refactoring →](./PHASE2_UTILITY_REFACTOR.md)**
- **[Master Execution Guide](../MASTER_EXECUTION_GUIDE.md)**