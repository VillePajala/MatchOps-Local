# Storage Migration

**Status**: Implemented
**Last Updated**: January 5, 2026

## Overview

Handles migration from localStorage to IndexedDB for improved storage capacity. Designed for small datasets (single-user local-first PWA).

## Key Components

- `migration.ts` - Main migration logic
- `storageFactory.ts` - Storage adapter creation
- `migrationConfig.ts` - Version constants

## Migration Types

### App Data Migration (v1 → v2)
- Creates default team from existing roster
- Migrates player data to team structure
- Preserves all player attributes

### Storage Migration (localStorage → IndexedDB)
- Transfers all data keys to IndexedDB
- Updates storage configuration
- Preserves localStorage as backup

## Version Tracking

```typescript
// Current versions
const CURRENT_DATA_VERSION = 2;        // App data schema
const INDEXEDDB_STORAGE_VERSION = 1;   // Storage backend

// Check functions
isMigrationNeeded(): boolean          // App data migration
isIndexedDbMigrationNeeded(): Promise<boolean>  // Storage migration
```

## Migration Process

### Automatic Migration
Called on app startup via `runMigration()`:
1. Check if app data migration needed
2. Check if IndexedDB migration needed
3. Execute migrations in sequence
4. Update version markers

### Manual Migration
Triggered from Settings UI via `triggerIndexedDbMigration()`:
- Allows user-initiated migration
- Respects `forceMode: 'localStorage'` setting

## Progress Tracking

```typescript
// Set callback for UI updates
setMigrationProgressCallback((progress) => {
  console.log(`${progress.percentage}%: ${progress.message}`);
});

// Get migration status
const status = await getMigrationStatus();
// {
//   currentVersion: 2,
//   targetVersion: 2,
//   migrationNeeded: false,
//   storageMode: 'indexedDB',
//   indexedDbMigrationNeeded: false,
//   migrationState: 'completed'
// }
```

## Data Safety

### localStorage Preserved
After migration, localStorage data is intentionally NOT deleted:
- Automatic backup if IndexedDB corrupts
- Rollback capability for users
- Negligible cost (~50MB duplication)
- No privacy risk (origin-isolated)

### Error Handling
- Migration continues on individual key failures
- Requires 50%+ success rate to complete
- Failed migrations marked in config
- App continues with localStorage on failure

## Storage Configuration

```typescript
interface StorageConfig {
  mode: 'localStorage' | 'indexedDB';
  version: number;
  migrationState: 'pending' | 'in_progress' | 'completed' | 'failed';
  forceMode?: 'localStorage' | 'indexedDB';
}
```

## Concurrency Protection

- Simple boolean lock prevents concurrent migrations
- Migration state tracked in storage config
- Safe for single-user scenario

## Keys Migrated

All app data excluding:
- `migration_*` prefixed keys
- `*backup*` keys

Includes:
- Master roster
- Saved games
- Seasons and tournaments
- Teams and personnel
- App settings
