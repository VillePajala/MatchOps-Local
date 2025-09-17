# Storage Migration Overview

## Current Status
The application currently uses localStorage for data persistence. This works well for the current scope but may need migration to IndexedDB for enhanced functionality.

## Migration Plan
For detailed technical specifications and implementation plan, see:
- **[IndexedDB Migration Plan](../specs/INDEXEDDB_MIGRATION_PLAN.md)** - Comprehensive technical specification (1,400+ lines)

## Key Points
- **Current**: localStorage-based persistence
- **Future**: Potential IndexedDB migration for better performance and features
- **Priority**: Not required for current production deployment
- **Complexity**: Significant - requires careful planning and testing

## Quick Reference
- Storage utilities: `src/utils/localStorage.ts`
- Data managers: `src/utils/masterRosterManager.ts`, `src/utils/savedGames.ts`
- Backup system: `src/utils/fullBackup.ts`

## Next Steps
1. Continue with localStorage for production launch
2. Evaluate user feedback and performance metrics
3. Consider IndexedDB migration if needed based on usage patterns