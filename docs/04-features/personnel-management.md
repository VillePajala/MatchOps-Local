# Personnel Management

**Status**: ✅ Implemented
**Last Updated**: January 5, 2026

## Overview

Personnel Management allows coaches to track team staff members (assistant coaches, trainers, physios, managers) and associate them with games.

## Key Components

- `PersonnelManagerModal.tsx` - Main personnel list and management
- `PersonnelDetailsModal.tsx` - Add/edit individual personnel
- `PersonnelSelectionSection.tsx` - Select personnel for games
- `personnelManager.ts` - Storage utilities
- `usePersonnel.ts`, `usePersonnelManager.ts` - Hooks

## Data Model

```typescript
interface Personnel {
  id: string;                // personnel_<timestamp>_<uuid>
  name: string;              // Full name
  role: PersonnelRole;       // Primary role
  phone?: string;            // Contact number
  email?: string;            // Email address
  certifications?: string[]; // e.g., "UEFA A License"
  notes?: string;            // General notes
  createdAt: string;         // ISO timestamp
  updatedAt: string;         // ISO timestamp
}

type PersonnelRole =
  | 'head_coach'
  | 'assistant_coach'
  | 'goalkeeper_coach'
  | 'fitness_coach'
  | 'physio'
  | 'team_manager'
  | 'support_staff'
  | 'other';
```

## Available Roles

| Role | Description |
|------|-------------|
| Head Coach | Primary team coach |
| Assistant Coach | Supporting coaching staff |
| Goalkeeper Coach | Specialized goalkeeper trainer |
| Fitness Coach | Physical conditioning specialist |
| Physio | Physiotherapist / medical staff |
| Team Manager | Administrative/logistics manager |
| Support Staff | General support personnel |
| Other | Custom roles |

## Features

- **CRUD Operations**: Create, read, update, delete personnel
- **Contact Info**: Optional phone and email storage
- **Certifications**: Track coaching licenses and qualifications
- **Game Association**: Select personnel present at each game
- **Search/Filter**: Find personnel by name or role

## User Flow

1. Access Personnel Manager from main menu
2. Add new personnel with role and contact info
3. When setting up a game, select attending personnel
4. Personnel included in game records and exports

## Storage

- Personnel stored globally (not team-specific)
- Uses DataStore interface for IndexedDB access
- Included in full backups

## Translations

Fully internationalized (EN/FI):
- All role names
- Form labels
- Instructions

## Backward Compatibility

- Games without personnel field work seamlessly
- Optional field - not required for any functionality
