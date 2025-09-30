# Storage Infrastructure Upgrade Overview

Status: Authoritative overview (aligned to current code)

## Current Status
The application currently uses localStorage for data persistence. This works well for the current scope but will be upgraded to IndexedDB for enhanced capacity, performance, and reliability.

## Infrastructure Upgrade Plan
For detailed technical specifications and implementation plan, see:
- **[IndexedDB Infrastructure Plan](./indexeddb-foundation/migration-plan.md)** — Complete infrastructure replacement plan (KV adapter → infrastructure swap → data transfer → optional normalization)

## Key Points
- **Current**: localStorage-based persistence layer
- **Upgrade Goal**: Replace localStorage with IndexedDB as the storage infrastructure
- **Approach**: KV adapter pattern maintains API compatibility while swapping underlying storage
- **Data Handling**: One-time automatic transfer of existing localStorage data to IndexedDB
- **Post-Migration**: After the one-time migration, the app never reads or writes localStorage; all persistence uses IndexedDB only. localStorage is cleared.
- **Future Enhancement**: Normalized IndexedDB schema for advanced querying if dataset growth warrants it
- **Priority**: Infrastructure improvement for better capacity and performance
- **Complexity**: Moderate (infrastructure swap with safety nets)

## Quick Reference
- Storage utilities: `src/utils/localStorage.ts` (will become storage abstraction layer)
- Data managers: `src/utils/masterRosterManager.ts`, `src/utils/savedGames.ts` (APIs remain unchanged)
- Backup system: `src/utils/fullBackup.ts` (enhanced for infrastructure transition)

## Implementation Steps
1. **Phase 0**: Create IndexedDB KV adapter that mimics localStorage API
2. **Phase 1**: Implement infrastructure swap with automatic data transfer from localStorage
3. **Phase 2**: Optional enhancement to normalized IndexedDB schema for advanced features
4. **Post-deployment**: Monitor performance improvements and user experience
