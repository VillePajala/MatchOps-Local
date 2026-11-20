# Feature Specifications

This directory contains detailed specifications for individual features and system architecture.

## Core Features

### Game Management
- **[game-type-support.md](./game-type-support.md)** - Soccer and futsal game type labeling
- **[goal-log.md](./goal-log.md)** - Goal event logging with scorer/assist attribution
- **[timer-wake-lock.md](./timer-wake-lock.md)** - Precision game timer with screen wake lock
- **[undo-redo.md](./undo-redo.md)** - Undo/redo for game actions and tactical board

### Team & Player Management
- **[team-management.md](./team-management.md)** - Multi-team support and team organization
- **[master-roster-management.md](./master-roster-management.md)** - Central player roster system
- **[player-assessment.md](./player-assessment.md)** - Template-based player ratings (10 metrics by default)
- **[personnel-management.md](./personnel-management.md)** - Staff and personnel tracking

### Organization
- **[seasons-tournaments.md](./seasons-tournaments.md)** - Season and tournament organization
- **[warmup-plan.md](./warmup-plan.md)** - Customizable pre-match warmup routines
- **[rules-directory.md](./rules-directory.md)** - FIFA and futsal rules reference

### Data Management
- **[backup-restore.md](./backup-restore.md)** - Full backup and restore functionality
- **[game-import.md](./game-import.md)** - Import games from JSON exports
- **[external-matches.md](./external-matches.md)** - Player stat adjustments for games played outside the app

### User Experience
The older start-screen, first-game overlay, help-modal, roster-guard and native-alert specs were archived on 2026-11-20 to [`../08-archived/completed-features/`](../08-archived/completed-features/) - they described UI replaced by the 2026-11 redesign and onboarding v3.

### Tactical Features
- **[tactics-field-variations.md](./tactics-field-variations.md)** - Tactics view field layouts

## Architecture Features

System-level features that handle data integrity and PWA behavior:

- **[auto-save.md](./auto-save.md)** - Tiered auto-save with debouncing
- **[app-resume.md](./app-resume.md)** - Mobile app background recovery
- **[storage-migration.md](./storage-migration.md)** - localStorage to IndexedDB migration
- **[pwa-updates.md](./pwa-updates.md)** - PWA update detection and management
- **[sync-system.md](./sync-system.md)** - Local-first cloud sync (SyncQueue/SyncEngine)

## Platform Integration

- **[play-billing-implementation.md](./play-billing-implementation.md)** - Google Play billing (parked - the app is free)

## Document Structure

Each document provides:
- Feature overview and status
- Key components and files
- Implementation details
- User flows and behavior
