# Personnel Management Feature - Implementation Plan

**Status**: Ready for Implementation
**Complexity**: 2/10 (Small to Medium)
**Estimated Time**: 8-10 hours
**Breaking Changes**: None - Fully backwards compatible
**Dependencies**: Existing patterns (PlayerSelectionSection, masterRosterManager, fullBackup, useRoster)

---

## Overview

Add personnel management (coaches, trainers, managers, physiotherapists, team managers) to MatchOps-Local. This feature allows users to track staff members associated with games, following the same architectural patterns as the existing player roster system.

**Key Features**:
- CRUD operations for personnel (coaches, trainers, etc.)
- Personnel selection during game setup
- Display personnel in game details
- Full internationalization (English/Finnish)
- **Real-time updates** via React Query cache invalidation
- **Backwards compatible** with old games and backups
- **Automatic import/export** integration

---

## Phase 0: Git Branch Setup (5 mins)

### 0.1 Create Feature Branch
```bash
git status                                    # Ensure clean working directory
git checkout -b feat/personnel-management     # Create and switch to feature branch
git branch --show-current                     # Verify branch
```

---

## Phase 1: Type Definitions & Storage (1 hour)

### 1.1 Create Type Definitions

**NEW FILE**: `src/types/personnel.ts`

```typescript
/**
 * Personnel member (coach, trainer, manager, etc.)
 */
export interface Personnel {
  id: string;                          // personnel_<timestamp>_<uuid>
  name: string;                        // Full name
  role: PersonnelRole;                 // Primary role
  phone?: string;                      // Contact number (optional)
  email?: string;                      // Email address (optional)
  certifications?: string[];           // e.g., ["UEFA A License", "First Aid"]
  notes?: string;                      // General notes
  createdAt: string;                   // ISO timestamp
  updatedAt: string;                   // ISO timestamp
}

/**
 * Available personnel roles
 */
export type PersonnelRole =
  | 'head_coach'
  | 'assistant_coach'
  | 'goalkeeper_coach'
  | 'fitness_coach'
  | 'physio'
  | 'team_manager'
  | 'other';

/**
 * Personnel collection stored in IndexedDB
 */
export interface PersonnelCollection {
  [personnelId: string]: Personnel;
}
```

### 1.2 Update Game Types

**MODIFY**: `src/types/game.ts`

Add to `AppState` interface:
```typescript
export interface AppState {
  // ... existing fields ...

  /** Personnel assigned to this game (coaches, trainers, etc.) */
  gamePersonnel?: string[];  // Array of personnel IDs - OPTIONAL for backwards compatibility

  // ... rest of existing fields ...
}
```

**MODIFY**: `src/types/index.ts`

Add export:
```typescript
export * from './personnel';
```

### 1.3 Storage Layer

**MODIFY**: `src/config/storageKeys.ts`

Add new storage key:
```typescript
export const PERSONNEL_KEY = 'soccerPersonnel';
```

**NEW FILE**: `src/utils/personnelManager.ts`

Mirror `masterRosterManager.ts` structure:

```typescript
import { PERSONNEL_KEY } from '@/config/storageKeys';
import { getStorageItem, setStorageItem } from './storage';
import type { Personnel, PersonnelCollection } from '@/types/personnel';
import logger from '@/utils/logger';
import { withKeyLock } from './storageKeyLock';

/**
 * Get all personnel from storage
 */
export const getAllPersonnel = async (): Promise<Personnel[]> => {
  try {
    const personnelJson = await getStorageItem(PERSONNEL_KEY);
    if (!personnelJson) {
      return [];
    }
    const collection: PersonnelCollection = JSON.parse(personnelJson);
    return Object.values(collection);
  } catch (error) {
    logger.error('Error getting personnel:', error);
    throw error;
  }
};

/**
 * Get personnel collection as object
 */
export const getPersonnelCollection = async (): Promise<PersonnelCollection> => {
  try {
    const personnelJson = await getStorageItem(PERSONNEL_KEY);
    if (!personnelJson) {
      return {};
    }
    return JSON.parse(personnelJson) as PersonnelCollection;
  } catch (error) {
    logger.error('Error getting personnel collection:', error);
    throw error;
  }
};

/**
 * Get single personnel by ID
 */
export const getPersonnelById = async (personnelId: string): Promise<Personnel | null> => {
  try {
    const collection = await getPersonnelCollection();
    return collection[personnelId] || null;
  } catch (error) {
    logger.error('Error getting personnel by ID:', error);
    throw error;
  }
};

/**
 * Add new personnel member
 */
export const addPersonnelMember = async (
  personnelData: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Personnel> => {
  return withKeyLock(PERSONNEL_KEY, async () => {
    try {
      // Generate unique ID
      const timestamp = Date.now();
      let uuid: string;

      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        uuid = crypto.randomUUID().split('-')[0];
      } else {
        uuid = Math.random().toString(16).substring(2, 10);
      }

      const personnelId = `personnel_${timestamp}_${uuid}`;
      const now = new Date().toISOString();

      const newPersonnel: Personnel = {
        ...personnelData,
        id: personnelId,
        createdAt: now,
        updatedAt: now,
      };

      const collection = await getPersonnelCollection();
      collection[personnelId] = newPersonnel;

      await setStorageItem(PERSONNEL_KEY, JSON.stringify(collection));
      logger.log('Personnel member added:', personnelId);

      return newPersonnel;
    } catch (error) {
      logger.error('Error adding personnel member:', error);
      throw error;
    }
  });
};

/**
 * Update existing personnel member
 */
export const updatePersonnelMember = async (
  personnelId: string,
  updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>
): Promise<Personnel | null> => {
  return withKeyLock(PERSONNEL_KEY, async () => {
    try {
      const collection = await getPersonnelCollection();
      const existing = collection[personnelId];

      if (!existing) {
        logger.warn('Personnel member not found for update:', personnelId);
        return null;
      }

      const updated: Personnel = {
        ...existing,
        ...updates,
        id: personnelId, // Ensure ID never changes
        createdAt: existing.createdAt, // Preserve creation time
        updatedAt: new Date().toISOString(),
      };

      collection[personnelId] = updated;
      await setStorageItem(PERSONNEL_KEY, JSON.stringify(collection));
      logger.log('Personnel member updated:', personnelId);

      return updated;
    } catch (error) {
      logger.error('Error updating personnel member:', error);
      throw error;
    }
  });
};

/**
 * Remove personnel member
 */
export const removePersonnelMember = async (personnelId: string): Promise<boolean> => {
  return withKeyLock(PERSONNEL_KEY, async () => {
    try {
      const collection = await getPersonnelCollection();

      if (!collection[personnelId]) {
        logger.warn('Personnel member not found for removal:', personnelId);
        return false;
      }

      delete collection[personnelId];
      await setStorageItem(PERSONNEL_KEY, JSON.stringify(collection));
      logger.log('Personnel member removed:', personnelId);

      return true;
    } catch (error) {
      logger.error('Error removing personnel member:', error);
      throw error;
    }
  });
};

/**
 * Get personnel by role
 */
export const getPersonnelByRole = async (role: Personnel['role']): Promise<Personnel[]> => {
  try {
    const allPersonnel = await getAllPersonnel();
    return allPersonnel.filter(p => p.role === role);
  } catch (error) {
    logger.error('Error getting personnel by role:', error);
    throw error;
  }
};
```

### 1.4 Commit Phase 1

```bash
npm run type-check  # Verify TypeScript compiles
npm run lint        # Verify no linting errors
git add .
git commit -m "feat: add personnel types and storage layer"
```

---

## Phase 2: Backwards Compatibility & Import/Export (1 hour)

### 2.1 Update Backup/Export System

**MODIFY**: `src/utils/fullBackup.ts`

Add `PERSONNEL_KEY` to imports (around line 12):
```typescript
import {
  SAVED_GAMES_KEY,
  APP_SETTINGS_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  MASTER_ROSTER_KEY,
  PLAYER_ADJUSTMENTS_KEY,
  TEAMS_INDEX_KEY,
  TEAM_ROSTERS_KEY,
  PERSONNEL_KEY,  // ADD THIS
} from "@/config/storageKeys";
```

Add to `FullBackupData['localStorage']` interface (around line 27-41):
```typescript
interface FullBackupData {
  meta: {
    schema: number;
    exportedAt: string;
  };
  localStorage: {
    [SAVED_GAMES_KEY]?: SavedGamesCollection | null;
    [APP_SETTINGS_KEY]?: { currentGameId: string | null } | null;
    [SEASONS_LIST_KEY]?: Season[] | null;
    [TOURNAMENTS_LIST_KEY]?: Tournament[] | null;
    [MASTER_ROSTER_KEY]?: Player[] | null;
    [PLAYER_ADJUSTMENTS_KEY]?: PlayerAdjustmentsIndex | null;
    [TEAMS_INDEX_KEY]?: TeamsIndex | null;
    [TEAM_ROSTERS_KEY]?: TeamRostersIndex | null;
    [PERSONNEL_KEY]?: PersonnelCollection | null;  // ADD THIS
  };
}
```

Add import for PersonnelCollection type at top of file:
```typescript
import type { PersonnelCollection } from '@/types/personnel';
```

Add `PERSONNEL_KEY` to `keysToBackup` array (around line 53-62):
```typescript
const keysToBackup = [
  SAVED_GAMES_KEY,
  APP_SETTINGS_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  MASTER_ROSTER_KEY,
  PLAYER_ADJUSTMENTS_KEY,
  TEAMS_INDEX_KEY,
  TEAM_ROSTERS_KEY,
  PERSONNEL_KEY,  // ADD THIS
];
```

**Result**:
- ✅ Export automatically includes personnel data
- ✅ Import automatically restores personnel data
- ✅ Old backups without personnel work fine (null handling already exists in code)

### 2.2 Backwards Compatibility Testing Scenarios

Document test scenarios (no code changes needed):

**Test Scenario 1**: Old game data without `gamePersonnel` field
- Should display correctly with no personnel
- Should not throw errors
- Should allow editing and saving
- Implementation: `gamePersonnel` is optional (`?`), so `undefined` is safe

**Test Scenario 2**: Old backup files without `PERSONNEL_KEY`
- Should import successfully
- Should create empty personnel collection
- Should not affect other data
- Implementation: Backup import loop already handles missing keys gracefully

**Test Scenario 3**: New games with personnel
- Should store personnel IDs correctly
- Should export/import correctly
- Should display personnel names and roles

### 2.3 Commit Phase 2

```bash
npm run type-check
npm run lint
# Test with old backup file manually if available
git commit -am "feat: add personnel to backup/restore system with backwards compatibility"
```

---

## Phase 3: React Query Integration with Real-Time Updates (1 hour)

### 3.1 Query Keys

**MODIFY**: `src/config/queryKeys.ts`

Add personnel query keys:
```typescript
export const queryKeys = {
  // ... existing keys ...

  // Personnel (flat style like masterRoster, seasons, etc.)
  personnel: ['personnel'] as const,
  personnelDetail: (id: string) => ['personnel', 'detail', id] as const,
  personnelByRole: (role: string) => ['personnel', 'byRole', role] as const,
};
```

### 3.2 Hooks with Cache Invalidation

**NEW FILE**: `src/hooks/usePersonnel.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import {
  getAllPersonnel,
  getPersonnelById,
  addPersonnelMember,
  updatePersonnelMember,
  removePersonnelMember,
  getPersonnelByRole,
} from '@/utils/personnelManager';
import type { Personnel } from '@/types/personnel';
import logger from '@/utils/logger';

/**
 * Get all personnel
 */
export const usePersonnel = () => {
  return useQuery({
    queryKey: queryKeys.personnel,
    queryFn: getAllPersonnel,
  });
};

/**
 * Get single personnel by ID
 */
export const usePersonnelById = (personnelId: string | null) => {
  return useQuery({
    queryKey: queryKeys.personnelDetail(personnelId || ''),
    queryFn: () => personnelId ? getPersonnelById(personnelId) : null,
    enabled: !!personnelId,
  });
};

/**
 * Get personnel by role
 */
export const usePersonnelByRole = (role: Personnel['role']) => {
  return useQuery({
    queryKey: queryKeys.personnelByRole(role),
    queryFn: () => getPersonnelByRole(role),
  });
};

/**
 * Add personnel mutation with cache invalidation
 */
export const useAddPersonnel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) =>
      addPersonnelMember(data),
    onSuccess: () => {
      // Invalidate cache - triggers automatic refetch in all components using usePersonnel()
      queryClient.invalidateQueries({ queryKey: queryKeys.personnel });
      logger.log('Personnel added successfully');
    },
    onError: (error) => {
      logger.error('Failed to add personnel:', error);
    },
  });
};

/**
 * Update personnel mutation with cache invalidation
 */
export const useUpdatePersonnel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      personnelId,
      updates
    }: {
      personnelId: string;
      updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>
    }) => updatePersonnelMember(personnelId, updates),
    onSuccess: (_, variables) => {
      // Invalidate both list and detail caches
      queryClient.invalidateQueries({ queryKey: queryKeys.personnel });
      queryClient.invalidateQueries({ queryKey: queryKeys.personnelDetail(variables.personnelId) });
      logger.log('Personnel updated successfully');
    },
    onError: (error) => {
      logger.error('Failed to update personnel:', error);
    },
  });
};

/**
 * Remove personnel mutation with cache invalidation
 */
export const useRemovePersonnel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personnelId: string) => removePersonnelMember(personnelId),
    onSuccess: () => {
      // Invalidate cache - triggers automatic refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.personnel });
      logger.log('Personnel removed successfully');
    },
    onError: (error) => {
      logger.error('Failed to remove personnel:', error);
    },
  });
};
```

### 3.3 Real-Time Updates Pattern

**How it works** (mirrors `useRoster.ts`):
1. Component calls mutation (e.g., `addPersonnelMutation.mutate(data)`)
2. Storage operation completes
3. On success: `queryClient.invalidateQueries({ queryKey: queryKeys.personnel })`
4. React Query automatically refetches data
5. ALL components using `usePersonnel()` get fresh data instantly

### 3.4 Commit Phase 3

```bash
npm run type-check
npm run lint
git commit -am "feat: add React Query hooks for personnel with real-time updates"
```

---

## Phase 4: UI Components (3-4 hours)

### 4.1 Role Label Helper

**NEW FILE**: `src/utils/personnelRoles.ts`

```typescript
export const PERSONNEL_ROLE_LABEL_KEYS = {
  head_coach: 'personnel.roles.headCoach',
  assistant_coach: 'personnel.roles.assistantCoach',
  goalkeeper_coach: 'personnel.roles.goalkeeperCoach',
  fitness_coach: 'personnel.roles.fitnessCoach',
  physio: 'personnel.roles.physio',
  team_manager: 'personnel.roles.teamManager',
  other: 'personnel.roles.other',
} as const;

export type PersonnelRoleKey = keyof typeof PERSONNEL_ROLE_LABEL_KEYS;

export function getRoleLabelKey(role: PersonnelRoleKey): string {
  return PERSONNEL_ROLE_LABEL_KEYS[role];
}
```

### 4.2 Personnel Selection Component

**NEW FILE**: `src/components/PersonnelSelectionSection.tsx`

Mirror `PlayerSelectionSection.tsx` structure:

```typescript
'use client';

import React from 'react';
import { Personnel } from '@/types/personnel';
import { useTranslation } from 'react-i18next';
import { getRoleLabelKey } from '@/utils/personnelRoles';

export interface PersonnelSelectionSectionProps {
  availablePersonnel: Personnel[];
  selectedPersonnelIds: string[];
  onSelectedPersonnelChange: (ids: string[]) => void;
  title: string;
  disabled?: boolean;
}

const PersonnelSelectionSection: React.FC<PersonnelSelectionSectionProps> = ({
  availablePersonnel,
  selectedPersonnelIds,
  onSelectedPersonnelChange,
  title,
  disabled,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
        <div className="text-sm text-slate-400">
          <span className="text-yellow-400 font-semibold">{selectedPersonnelIds.length}</span>
          {' / '}
          <span className="text-yellow-400 font-semibold">{availablePersonnel.length}</span>
          {' '}
          {t('personnel.selected', 'selected')}
        </div>
      </div>

      {availablePersonnel.length > 0 ? (
        <>
          <div className="flex items-center py-2 px-1 border-b border-slate-700/50">
            <label className="flex items-center text-sm text-slate-300 hover:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                disabled={disabled}
                checked={availablePersonnel.length === selectedPersonnelIds.length}
                onChange={() => {
                  if (selectedPersonnelIds.length === availablePersonnel.length) {
                    onSelectedPersonnelChange([]);
                  } else {
                    onSelectedPersonnelChange(availablePersonnel.map((p) => p.id));
                  }
                }}
                className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-700 border-slate-500 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
              />
              <span className="ml-2">{t('personnel.selectAll', 'Select All')}</span>
            </label>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {availablePersonnel.map((person) => (
              <div
                key={person.id}
                className="flex items-center py-1.5 px-1 rounded hover:bg-slate-800/40 transition-colors"
              >
                <label className="flex items-center flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selectedPersonnelIds.includes(person.id)}
                    onChange={() => {
                      if (selectedPersonnelIds.includes(person.id)) {
                        onSelectedPersonnelChange(
                          selectedPersonnelIds.filter((id) => id !== person.id)
                        );
                      } else {
                        onSelectedPersonnelChange([...selectedPersonnelIds, person.id]);
                      }
                    }}
                    className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-700 border-slate-500 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
                  />
                  <div className="ml-2">
                    <span className="text-slate-200">{person.name}</span>
                    <span className="text-slate-400 text-sm ml-2">
                      ({t(getRoleLabelKey(person.role), person.role)})
                    </span>
                  </div>
                </label>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-4 text-slate-400">
          {t('personnel.noPersonnel', 'No personnel available. Add personnel in Personnel Manager.')}
        </div>
      )}
    </div>
  );
};

export default PersonnelSelectionSection;
```

### 4.3 Personnel Manager Modal

**NEW FILE**: `src/components/PersonnelManagerModal.tsx`

Mirror `RosterSettingsModal.tsx` structure (full implementation with add/edit/delete, search, inline editing).

See the original plan document `docs/03-active-plans/personnel-feature-plan.md` lines 569-941 for complete implementation.

Key features:
- Add/edit/delete operations
- Search by name or role
- Inline editing mode
- Form fields: name*, role*, phone, email, notes
- Confirmation dialogs
- Same styling as RosterSettingsModal

### 4.4 Commit Phase 4

```bash
npm run type-check
npm run lint
git commit -am "feat: add personnel UI components with real-time updates"
```

---

## Phase 5: Integration Points (1-2 hours)

### 5.1 Main App Integration

**MODIFY**: `src/app/page.tsx`

Add imports:
```typescript
import { usePersonnel, useAddPersonnel, useUpdatePersonnel, useRemovePersonnel } from '@/hooks/usePersonnel';
import PersonnelManagerModal from '@/components/PersonnelManagerModal';
```

Add state and hooks inside component:
```typescript
// Personnel data and mutations
const { data: personnel = [] } = usePersonnel();
const addPersonnelMutation = useAddPersonnel();
const updatePersonnelMutation = useUpdatePersonnel();
const removePersonnelMutation = useRemovePersonnel();

// Personnel modal state
const [isPersonnelManagerOpen, setIsPersonnelManagerOpen] = useState(false);
```

Add modal render:
```typescript
{/* Personnel Manager Modal */}
<PersonnelManagerModal
  isOpen={isPersonnelManagerOpen}
  onClose={() => setIsPersonnelManagerOpen(false)}
  personnel={personnel}
  onAddPersonnel={(data) => addPersonnelMutation.mutateAsync(data)}
  onUpdatePersonnel={(id, updates) => updatePersonnelMutation.mutateAsync({ personnelId: id, updates })}
  onRemovePersonnel={(id) => removePersonnelMutation.mutateAsync(id)}
  isUpdating={addPersonnelMutation.isPending || updatePersonnelMutation.isPending || removePersonnelMutation.isPending}
  error={addPersonnelMutation.error?.message || updatePersonnelMutation.error?.message || removePersonnelMutation.error?.message || null}
/>
```

### 5.2 New Game Setup Integration

**MODIFY**: `src/components/NewGameSetupModal.tsx`

Add props:
```typescript
interface NewGameSetupModalProps {
  // ... existing props ...
  personnel: Personnel[];
}
```

Add state:
```typescript
const [selectedPersonnelIds, setSelectedPersonnelIds] = useState<string[]>([]);
```

Reset state when modal opens (in useEffect):
```typescript
useEffect(() => {
  if (isOpen) {
    // ... existing resets ...
    setSelectedPersonnelIds([]);
  }
}, [isOpen]);
```

Render PersonnelSelectionSection after player selection (around line 860):
```typescript
{/* Personnel Selection Section */}
<PersonnelSelectionSection
  availablePersonnel={personnel}
  selectedPersonnelIds={selectedPersonnelIds}
  onSelectedPersonnelChange={setSelectedPersonnelIds}
  title={t('newGameSetup.selectPersonnel', 'Select Game Personnel')}
/>
```

Update onStart callback signature to include personnel:
```typescript
onStart(
  // ... existing params ...
  selectedPersonnelIds  // Add this
);
```

### 5.3 Control Bar Integration

**MODIFY**: `src/components/ControlBar.tsx`

Add import:
```typescript
import { HiUserGroup } from 'react-icons/hi2';
```

Add button near Roster Manager button:
```typescript
<button
  onClick={() => setIsPersonnelManagerOpen(true)}
  className="..."
  title={t('controlBar.personnelManager', 'Personnel Manager')}
>
  <HiUserGroup className="h-5 w-5" />
</button>
```

### 5.4 Game Display (Optional)

**MODIFY**: `src/components/GameStatsModal.tsx`

Add personnel section to game details:
```typescript
{/* Personnel Section */}
{gamePersonnel && gamePersonnel.length > 0 && (
  <div className="mb-4">
    <h4 className="text-sm font-semibold text-slate-300 mb-2">
      {t('gameStats.personnel', 'Game Personnel')}
    </h4>
    <div className="space-y-1">
      {gamePersonnel.map((personnelId) => {
        const person = personnel.find(p => p.id === personnelId);
        if (!person) return null; // Gracefully handle deleted personnel
        return (
          <div key={personnelId} className="text-sm text-slate-400">
            {person.name} - {t(getRoleLabelKey(person.role), person.role)}
          </div>
        );
      })}
    </div>
  </div>
)}
```

### 5.5 Commit Phase 5

```bash
npm run type-check
npm run lint
git commit -am "feat: integrate personnel management with real-time data flow"
```

---

## Phase 6: Internationalization (30 mins)

### 6.1 English Translations

**MODIFY**: `public/locales/en/common.json`

Add keys:
```json
{
  "personnel": {
    "selected": "selected",
    "selectAll": "Select All",
    "noPersonnel": "No personnel available. Add personnel in Personnel Manager.",
    "roles": {
      "headCoach": "Head Coach",
      "assistantCoach": "Assistant Coach",
      "goalkeeperCoach": "Goalkeeper Coach",
      "fitnessCoach": "Fitness Coach",
      "physio": "Physiotherapist",
      "teamManager": "Team Manager",
      "other": "Other"
    }
  },
  "personnelManager": {
    "title": "Personnel Manager",
    "addPersonnel": "Add Personnel",
    "addNew": "Add New Personnel",
    "searchPlaceholder": "Search personnel...",
    "namePlaceholder": "Full Name",
    "phonePlaceholder": "Phone (optional)",
    "emailPlaceholder": "Email (optional)",
    "notesPlaceholder": "Notes (optional)",
    "nameRequired": "Personnel name cannot be empty.",
    "confirmDelete": "Are you sure you want to remove this person?",
    "noResults": "No personnel found",
    "empty": "No personnel yet. Add your first person above."
  },
  "newGameSetup": {
    "selectPersonnel": "Select Game Personnel"
  },
  "controlBar": {
    "personnelManager": "Personnel Manager"
  }
}
```

### 6.2 Finnish Translations

**MODIFY**: `public/locales/fi/common.json`

Add keys:
```json
{
  "personnel": {
    "selected": "valittu",
    "selectAll": "Valitse kaikki",
    "noPersonnel": "Ei henkilöstöä saatavilla. Lisää henkilöstöä henkilöstöhallinnassa.",
    "roles": {
      "headCoach": "Päävalmentaja",
      "assistantCoach": "Apulaisvalmentaja",
      "goalkeeperCoach": "Maalivahtivalmentaja",
      "fitnessCoach": "Fysiikkavalmentaja",
      "physio": "Fysioterapeutti",
      "teamManager": "Joukkueenjohtaja",
      "other": "Muu"
    }
  },
  "personnelManager": {
    "title": "Henkilöstöhallinta",
    "addPersonnel": "Lisää henkilö",
    "addNew": "Lisää uusi henkilö",
    "searchPlaceholder": "Hae henkilöstöä...",
    "namePlaceholder": "Koko nimi",
    "phonePlaceholder": "Puhelin (valinnainen)",
    "emailPlaceholder": "Sähköposti (valinnainen)",
    "notesPlaceholder": "Muistiinpanot (valinnainen)",
    "nameRequired": "Henkilön nimi ei voi olla tyhjä.",
    "confirmDelete": "Haluatko varmasti poistaa tämän henkilön?",
    "noResults": "Henkilöstöä ei löytynyt",
    "empty": "Ei vielä henkilöstöä. Lisää ensimmäinen henkilö yllä."
  },
  "newGameSetup": {
    "selectPersonnel": "Valitse pelin henkilöstö"
  },
  "controlBar": {
    "personnelManager": "Henkilöstöhallinta"
  }
}
```

### 6.3 Commit Phase 6

```bash
npm run lint
git commit -am "i18n: add EN/FI translations for personnel feature"
```

---

## Phase 7: Testing (1-2 hours)

### 7.1 Unit Tests

**NEW FILE**: `src/utils/personnelManager.test.ts`

```typescript
import {
  getAllPersonnel,
  addPersonnelMember,
  updatePersonnelMember,
  removePersonnelMember,
  getPersonnelByRole,
} from './personnelManager';
import { clearStorageItem } from './storage';
import { PERSONNEL_KEY } from '@/config/storageKeys';

describe('Personnel Manager', () => {
  beforeEach(async () => {
    await clearStorageItem(PERSONNEL_KEY);
  });

  /**
   * Tests personnel CRUD operations
   * @critical
   */
  describe('addPersonnelMember', () => {
    it('should add a new personnel member with correct ID format', async () => {
      const newPerson = await addPersonnelMember({
        name: 'John Coach',
        role: 'head_coach',
        phone: '123-456-7890',
      });

      expect(newPerson.id).toMatch(/^personnel_\d+_[a-f0-9]+$/);
      expect(newPerson.name).toBe('John Coach');
      expect(newPerson.role).toBe('head_coach');
      expect(newPerson.createdAt).toBeTruthy();
      expect(newPerson.updatedAt).toBeTruthy();
    });
  });

  describe('getAllPersonnel', () => {
    it('should return all personnel', async () => {
      await addPersonnelMember({ name: 'Coach 1', role: 'head_coach' });
      await addPersonnelMember({ name: 'Coach 2', role: 'assistant_coach' });

      const all = await getAllPersonnel();
      expect(all.length).toBe(2);
    });
  });

  describe('updatePersonnelMember', () => {
    it('should update personnel data and preserve createdAt', async () => {
      const person = await addPersonnelMember({ name: 'Coach', role: 'head_coach' });
      const originalCreatedAt = person.createdAt;

      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure time difference

      const updated = await updatePersonnelMember(person.id, { phone: '999-888-7777' });

      expect(updated?.phone).toBe('999-888-7777');
      expect(updated?.createdAt).toBe(originalCreatedAt);
      expect(updated?.updatedAt).not.toBe(person.updatedAt);
    });
  });

  describe('removePersonnelMember', () => {
    it('should remove personnel', async () => {
      const person = await addPersonnelMember({ name: 'Coach', role: 'head_coach' });
      const removed = await removePersonnelMember(person.id);

      expect(removed).toBe(true);
      const all = await getAllPersonnel();
      expect(all.length).toBe(0);
    });
  });

  describe('getPersonnelByRole', () => {
    it('should filter by role', async () => {
      await addPersonnelMember({ name: 'Head', role: 'head_coach' });
      await addPersonnelMember({ name: 'Assistant', role: 'assistant_coach' });

      const headCoaches = await getPersonnelByRole('head_coach');
      expect(headCoaches.length).toBe(1);
      expect(headCoaches[0].name).toBe('Head');
    });
  });
});
```

### 7.2 Component Tests

**NEW FILE**: `src/components/PersonnelManagerModal.test.tsx`
**NEW FILE**: `src/components/PersonnelSelectionSection.test.tsx`

Test add/edit/delete flows, search, validation, checkbox interactions.

### 7.3 Backwards Compatibility Tests

**NEW FILE**: `src/utils/personnelBackwardsCompatibility.test.ts`

Test old game data, old backups, mixed data scenarios.

### 7.4 Commit Phase 7

```bash
npm test  # Ensure all tests pass
git commit -am "test: add comprehensive tests for personnel feature"
```

---

## Phase 8: CI Validation & Final Polish (1 hour)

### 8.1 Pre-CI Checks

```bash
npm run type-check  # TypeScript compilation
npm run lint        # ESLint validation
npm test            # All tests pass
npm run build       # Production build succeeds
```

### 8.2 Manual Testing Checklist

- [ ] Add personnel: Create coach with all fields
- [ ] Edit personnel: Modify name, role, phone → verify updates appear immediately
- [ ] Delete personnel: Remove with confirmation → verify disappears everywhere
- [ ] Multi-modal test: Add in manager → close → open game setup → verify appears
- [ ] Search: Filter by name and role
- [ ] Select in game: Choose personnel for new game
- [ ] Export/import: Test with personnel data
- [ ] Old data: Import old backup without personnel
- [ ] i18n: Switch to Finnish, verify translations
- [ ] Responsive: Test on mobile viewport
- [ ] Console: No errors or warnings

### 8.3 Commit and Push

```bash
git commit -am "fix: address final issues from manual testing"
git push -u origin feat/personnel-management
```

---

## Phase 9: CI Pipeline & PR (30 mins)

### 9.1 Monitor CI

Watch GitHub Actions workflow. Ensure:
- ✅ TypeScript compilation
- ✅ ESLint validation
- ✅ Jest tests
- ✅ Production build

### 9.2 Fix CI Failures (if any)

Common issues:
- Missing imports
- TypeScript `any` usage (use `unknown`)
- Unused variables (prefix with `_`)

### 9.3 Create Pull Request

```bash
gh pr create --title "feat: add personnel management system with real-time updates"
```

**PR Body**:
```markdown
## Summary
- Add personnel management (coaches, trainers, managers, etc.)
- CRUD operations with React Query and real-time cache updates
- Personnel selection in new game setup
- Full i18n support (EN/FI)
- **Real-time updates across all components**
- **Backwards compatible** - old games and backups work seamlessly

## Changes
### Type System
- New types: `Personnel`, `PersonnelRole`, `PersonnelCollection`
- Added optional `gamePersonnel?: string[]` field to `AppState`

### Storage & Data
- Storage layer: `personnelManager.ts` with CRUD operations
- Added `PERSONNEL_KEY` to backup/restore system
- Backwards compatible with old backups

### React Query with Real-Time Updates
- Hooks: `usePersonnel`, `useAddPersonnel`, `useUpdatePersonnel`, `useRemovePersonnel`
- Cache invalidation on all mutations
- **All components automatically receive fresh data when personnel changes**

### UI Components
- `PersonnelSelectionSection`: Checkbox selection
- `PersonnelManagerModal`: Full CRUD interface
- Control Bar: "Personnel Manager" button

### i18n
- 40+ translation keys for EN/FI
- Role labels: Head Coach, Assistant Coach, etc.

### Testing
- Unit tests: `personnelManager.test.ts`
- Component tests: Manager modal, selection section
- Backwards compatibility tests
- All tests pass with proper cleanup

## Test Plan
- [x] Add/edit/delete personnel member
- [x] **Real-time updates across components**
- [x] Search personnel by name and role
- [x] Select personnel in new game setup
- [x] Export/import with personnel
- [x] **Import old backup without personnel (backwards compat)**
- [x] i18n works for EN/FI
- [x] All tests pass locally and in CI

## Backwards Compatibility ✅
- Old games without `gamePersonnel` field work correctly
- Old backups without `PERSONNEL_KEY` import successfully
- No migration needed - fully additive feature

## Breaking Changes
**None** - Fully backwards compatible

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### 9.4 Merge and Cleanup

Once approved:
```bash
# Merge via GitHub UI
git checkout master
git pull
git branch -d feat/personnel-management
git push origin --delete feat/personnel-management
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate Personnel System | Clean separation from player roster, different data model |
| Store IDs in AppState | Minimal storage, allows personnel updates without game updates |
| Optional gamePersonnel Field | Backwards compatible, old games work without modification |
| React Query Cache Invalidation | Real-time updates across all components (mirrors useRoster) |
| Checkbox Selection | Consistent UX with player selection |
| Optional Contact Fields | Phone/email/notes optional for flexibility |
| Role-Based System | Flexible for various staff types, future filtering |
| No Team Association (Initially) | Keep it simple, can add later |
| Include in Backup/Restore | Automatic export/import |

---

## Real-Time Updates Architecture

### Pattern (Mirrors useRoster.ts)

1. **Local State**: Component maintains local state for immediate UI feedback
2. **Optimistic Update**: Update local state immediately
3. **Storage Call**: Call storage utility (e.g., `addPersonnelMember()`)
4. **Cache Invalidation**: On success: `await queryClient.invalidateQueries({ queryKey: queryKeys.personnel })`
5. **Automatic Refresh**: All components using `usePersonnel()` automatically refetch and update
6. **Error Rollback**: On error, rollback local state

### Benefits

- ✅ Instant UI feedback (optimistic updates)
- ✅ All components stay in sync automatically
- ✅ No manual prop drilling needed
- ✅ Works across modal boundaries
- ✅ Consistent with existing roster pattern

---

## Backwards Compatibility Strategy

### Old Game Data
- `gamePersonnel` field is optional (`?`)
- Old games without this field: `undefined` (safe, no errors)
- Display logic: `gamePersonnel?.length ? showPersonnel : showEmpty`
- Editing old games: field gets added when saved with personnel

### Old Backup Files
- `PERSONNEL_KEY` added to backup system alongside existing keys
- Import logic: Already handles missing keys gracefully
- Old backups: `PERSONNEL_KEY` will be `undefined`, creates empty collection
- No migration needed: Storage layer handles empty collections

### Export/Import Flow
1. **Export**: Always includes `PERSONNEL_KEY` (may be empty collection)
2. **Import Old**: Missing `PERSONNEL_KEY` → creates empty personnel collection
3. **Import New**: Has `PERSONNEL_KEY` → restores personnel data

---

## Success Criteria

✅ User can add/edit/delete personnel in Personnel Manager
✅ **Changes reflect immediately in all components (real-time)**
✅ User can select personnel when creating new game
✅ Selected personnel stored in game data
✅ Personnel displayed in game details
✅ Export includes personnel data
✅ Import restores personnel data
✅ **Old games without personnel field work correctly**
✅ **Old backups without personnel import successfully**
✅ All tests pass (local + CI, no memory leaks)
✅ Production build succeeds
✅ i18n works for EN/FI
✅ No console errors or warnings
✅ Responsive on mobile/desktop
✅ Code follows existing patterns
✅ React Query cache invalidation works
✅ PR created and merged to master

---

## Estimated Effort

- **Complexity**: 2/10 (Small to Medium)
- **Time**: 8-10 hours
- **Breaking Changes**: None
- **Dependencies**: Existing patterns (PlayerSelectionSection, masterRosterManager, fullBackup, useRoster)

---

**Status**: Ready for Implementation
**Last Updated**: 2025-01-09
