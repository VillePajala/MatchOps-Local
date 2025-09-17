# Storage Migration Overview

Status: Authoritative overview (aligned to current code)

## Current Status
The application currently uses localStorage for data persistence. This works well for the current scope but may need migration to IndexedDB for enhanced functionality.

## Migration Plan
For detailed technical specifications and implementation plan, see:
- **[IndexedDB Migration Plan](../specs/INDEXEDDB_MIGRATION_PLAN.md)** — Updated, phased plan aligned with current code (KV shim → KV copy/flip → optional normalization)

## Key Points
- **Current**: localStorage-based persistence
- **Near-term**: Optional IndexedDB KV adapter to improve robustness without broad refactor
- **Future**: Normalized IndexedDB schema if dataset growth warrants it
- **Priority**: Not required for current production deployment
- **Complexity**: Moderate (KV phases), higher for normalization

## Quick Reference
- Storage utilities: `src/utils/localStorage.ts`
- Data managers: `src/utils/masterRosterManager.ts`, `src/utils/savedGames.ts`
- Backup system: `src/utils/fullBackup.ts`

## Next Steps
1. Continue with localStorage for production launch
2. If/when needed, implement Phase 0 + Phase 1 from the plan (KV adapter + one-time KV migration)
3. Evaluate data volume and querying needs before proceeding to normalization (Phase 2)
