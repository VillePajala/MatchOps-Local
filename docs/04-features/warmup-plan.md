# Warm-up Plan

**Status**: ✅ Implemented
**Last Updated**: January 5, 2026

## Overview

The Warm-up Plan feature provides a customizable pre-match routine template. Coaches can create, edit, and organize warm-up sections to follow during game preparation.

## Key Components

- `useWarmupPlan.ts` - Hook for warm-up plan state management
- `warmupPlan.ts` - Storage utilities
- Settings modal integration for editing

## Data Model

```typescript
interface WarmupPlanSection {
  id: string;       // Unique section ID
  title: string;    // Section heading
  content: string;  // Free-form text content
}

interface WarmupPlan {
  id: string;              // Plan ID (single plan per user)
  version: number;         // Schema version for migrations
  lastModified: string;    // ISO timestamp
  isDefault: boolean;      // True if unmodified default
  sections: WarmupPlanSection[];  // Ordered sections
}
```

## Default Sections

The default warm-up plan includes:
1. **Arrival & Setup** - Equipment check, field preparation
2. **Individual Warm-up** - Light jogging, dynamic stretches
3. **Ball Work** - Passing drills, ball control
4. **Team Activities** - Small-sided games, tactical exercises
5. **Final Preparation** - Team talk, formation review

## User Flow

1. Access Warm-up Plan from Settings
2. View current sections in order
3. Edit section titles and content
4. Add new sections or remove existing ones
5. Reorder sections via drag-and-drop
6. Reset to default if needed

## Storage

- Single plan stored per user in IndexedDB
- Uses DataStore interface (`getWarmupPlan`, `saveWarmupPlan`)
- Schema versioned for future migrations

## Customization

Coaches can:
- Modify any section's title and content
- Add custom sections (unlimited)
- Remove sections
- Reorder sections
- Reset to default template

## Translations

Fully internationalized (EN/FI):
- Default section titles and content
- UI labels and instructions
- Action buttons

## Known Limitation

**Backup gap**: Warm-up plans are not currently included in full backups. See UNIFIED-ROADMAP.md backlog for planned fix.
