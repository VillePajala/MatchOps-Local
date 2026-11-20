# Warm-up Plan

**Status**: ✅ Implemented
**Last Updated**: January 5, 2026

## Overview

The Warm-up Plan feature provides a customizable pre-match routine template. Coaches can create, edit, and organize warm-up sections to follow during game preparation.

## Key Components

- `useWarmupPlan.ts` - Hook for warm-up plan state management
- `warmupPlan.ts` - Storage utilities and default template
- `TrainingResourcesModal.tsx` - View/edit UI (opened from Home > Seura > Coaching "Warmup Plan" row, or the match menu)

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

The default warm-up plan (`createDefaultWarmupPlan` in `src/utils/warmupPlan.ts`, texts from `warmup.*` translation keys) includes:
1. **30 min / Gathering** - Positive atmosphere, the day's agenda
2. **20 min / Warm-up** - Raise body temperature, tune minds for the game
3. **10 min / Ball Work** - Partner + ball work, goalkeeper warm-up
4. **2 min / Bench Area**
5. **During the Game** - Guidance for the bench during play

## User Flow

1. Open the Warm-up Plan from Home (Seura tab > Coaching) or the match menu
2. View current sections in order
3. Edit section titles and content
4. Add new sections or remove existing ones
5. Reorder sections with the up/down arrow buttons
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

## Backup Support

Warm-up plans are included in full backups via `fullBackup.ts`. Both export and import operations handle warmup plan data alongside all other user data.
