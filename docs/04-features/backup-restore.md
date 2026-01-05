# Backup & Restore

**Status**: ✅ Implemented
**Last Updated**: January 5, 2026

## Overview

Full backup and restore functionality for all app data. Export complete data to JSON file and restore from backups.

## Key Components

- `BackupRestoreResultsModal.tsx` - Results display after backup/restore
- `fullBackup.ts` - Backup creation and restore logic
- Settings modal integration

## Backup Contents

A full backup includes:
- **Master Roster** - All players
- **Saved Games** - Complete game history
- **Teams** - Team definitions and rosters
- **Seasons** - Season configurations
- **Tournaments** - Tournament configurations
- **Personnel** - Staff members
- **App Settings** - User preferences

## Data Format

```json
{
  "version": "2.0",
  "timestamp": "2026-01-05T12:00:00.000Z",
  "data": {
    "masterRoster": [...],
    "savedGames": {...},
    "teams": {...},
    "seasons": {...},
    "tournaments": {...},
    "personnel": {...},
    "appSettings": {...}
  }
}
```

## User Flow

### Creating Backup
1. Go to Settings → Backup & Restore
2. Click "Create Backup"
3. File downloads as `matchops-backup-YYYY-MM-DD.json`

### Restoring Backup
1. Go to Settings → Backup & Restore
2. Click "Restore from Backup"
3. Select backup file
4. Confirm restore (warning: overwrites current data)
5. App reloads with restored data

## Safety Features

- **Confirmation Required** - Warns before overwriting data
- **Version Check** - Validates backup format
- **Error Handling** - Graceful failure with error messages

## Known Limitation

**Warm-up Plan**: Currently not included in backups. Planned fix in backlog.

## Use Cases

- Device migration
- Data recovery
- Sharing setups between coaches
- Season-end archival
