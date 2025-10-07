# Personnel Feature Implementation Plan

## Overview

This document outlines the complete implementation plan for adding personnel (coaches, trainers, managers, etc.) management to MatchOps-Local. The feature will follow the same architectural patterns as the existing player roster system.

## Executive Summary

**Complexity:** 2/10 (Small to Medium)
**Estimated Time:** 8-10 hours
**Breaking Changes:** None (fully backwards compatible)
**Dependencies:** Existing patterns (PlayerSelectionSection, masterRosterManager)

## Architecture Decision

**Approach:** Separate Personnel Management System (mirror of Master Roster)

**Rationale:**
- Clean separation between players and staff
- Different data models (coaches don't need jersey numbers, positions, stats)
- Reuses proven patterns from player roster system
- Future-proof for coach-specific features

---

## 1. Type Definitions

### File: `src/types/personnel.ts` (NEW)

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
  createdAt?: string;                  // ISO timestamp
  updatedAt?: string;                  // ISO timestamp
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

### File: `src/types/game.ts` (MODIFY)

Add to `AppState` interface:

```typescript
export interface AppState {
  // ... existing fields ...

  /** Personnel assigned to this game (coaches, trainers, etc.) */
  gamePersonnel?: string[];  // Array of personnel IDs

  // ... rest of existing fields ...
}
```

### File: `src/types/index.ts` (MODIFY)

Add export:

```typescript
export * from './personnel';
```

---

## 2. Storage Layer

### File: `src/config/storageKeys.ts` (MODIFY)

Add new storage key:

```typescript
export const PERSONNEL_KEY = 'soccerPersonnel';
```

### File: `src/utils/personnelManager.ts` (NEW)

Create personnel CRUD operations mirroring `masterRosterManager.ts`:

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

---

## 3. React Query Integration

### File: `src/config/queryKeys.ts` (MODIFY)

Add personnel query keys (aligned with current flat key style in this repo):

```typescript
export const queryKeys = {
  // ... existing keys ...

  // Personnel (flat style like masterRoster, seasons, ...)
  personnel: ['personnel'] as const,
  personnelDetail: (id: string) => ['personnel', 'detail', id] as const,
  personnelByRole: (role: string) => ['personnel', 'byRole', role] as const,
};
```

### File: `src/hooks/usePersonnel.ts` (NEW)

Create React Query hooks for personnel:

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
 * Add personnel mutation
 */
export const useAddPersonnel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) =>
      addPersonnelMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personnel });
      logger.log('Personnel added successfully');
    },
    onError: (error) => {
      logger.error('Failed to add personnel:', error);
    },
  });
};

/**
 * Update personnel mutation
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
 * Remove personnel mutation
 */
export const useRemovePersonnel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (personnelId: string) => removePersonnelMember(personnelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personnel });
      logger.log('Personnel removed successfully');
    },
    onError: (error) => {
      logger.error('Failed to remove personnel:', error);
    },
  });
};
```

---

## 4. UI Components

### File: `src/components/PersonnelSelectionSection.tsx` (NEW)

Reusable personnel selector with checkboxes (mirrors `PlayerSelectionSection`):

```typescript
'use client';

import React from 'react';
import { Personnel } from '@/types/personnel';
import { useTranslation } from 'react-i18next';

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

  const getRoleLabel = (role: Personnel['role']): string => {
    const roleMap: Record<Personnel['role'], string> = {
      head_coach: t('personnel.roles.headCoach', 'Head Coach'),
      assistant_coach: t('personnel.roles.assistantCoach', 'Assistant Coach'),
      goalkeeper_coach: t('personnel.roles.goalkeeperCoach', 'Goalkeeper Coach'),
      fitness_coach: t('personnel.roles.fitnessCoach', 'Fitness Coach'),
      physio: t('personnel.roles.physio', 'Physiotherapist'),
      team_manager: t('personnel.roles.teamManager', 'Team Manager'),
      other: t('personnel.roles.other', 'Other'),
    };
    return roleMap[role] || role;
  };

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
                      ({getRoleLabel(person.role)})
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

---

## 3a. Role Label Helper (NEW)

### File: `src/utils/personnelRoles.ts` (NEW)

Provide a tiny helper for consistent role labels and centralized i18n keys:

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

Usage in components:

```typescript
import { getRoleLabelKey } from '@/utils/personnelRoles';
// t(getRoleLabelKey(person.role))
```

### File: `src/components/PersonnelManagerModal.tsx` (NEW)

Main CRUD interface (mirrors `RosterSettingsModal`):

```typescript
'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Personnel, PersonnelRole } from '@/types/personnel';
import {
  HiOutlineXMark,
  HiOutlineCheck,
  HiOutlinePencil,
  HiOutlineTrash,
  HiPlusCircle,
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import logger from '@/utils/logger';

interface PersonnelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  personnel: Personnel[];
  onAddPersonnel: (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdatePersonnel: (personnelId: string, updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>) => Promise<void>;
  onRemovePersonnel: (personnelId: string) => Promise<void>;
  isUpdating?: boolean;
  error?: string | null;
}

const PERSONNEL_ROLES: { value: PersonnelRole; labelKey: string }[] = [
  { value: 'head_coach', labelKey: 'personnel.roles.headCoach' },
  { value: 'assistant_coach', labelKey: 'personnel.roles.assistantCoach' },
  { value: 'goalkeeper_coach', labelKey: 'personnel.roles.goalkeeperCoach' },
  { value: 'fitness_coach', labelKey: 'personnel.roles.fitnessCoach' },
  { value: 'physio', labelKey: 'personnel.roles.physio' },
  { value: 'team_manager', labelKey: 'personnel.roles.teamManager' },
  { value: 'other', labelKey: 'personnel.roles.other' },
];

const PersonnelManagerModal: React.FC<PersonnelManagerModalProps> = ({
  isOpen,
  onClose,
  personnel,
  onAddPersonnel,
  onUpdatePersonnel,
  onRemovePersonnel,
  isUpdating,
  error,
}) => {
  const { t } = useTranslation();
  const [editingPersonnelId, setEditingPersonnelId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>>({
    name: '',
    role: 'head_coach',
    phone: '',
    email: '',
    certifications: [],
    notes: '',
  });

  const [isAddingPersonnel, setIsAddingPersonnel] = useState(false);
  const [newPersonnelData, setNewPersonnelData] = useState<Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>>({
    name: '',
    role: 'head_coach',
    phone: '',
    email: '',
    certifications: [],
    notes: '',
  });

  const [searchText, setSearchText] = useState('');
  const personnelRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEditingPersonnelId(null);
      setIsAddingPersonnel(false);
      setNewPersonnelData({
        name: '',
        role: 'head_coach',
        phone: '',
        email: '',
        certifications: [],
        notes: '',
      });
    }
  }, [isOpen]);

  // Handle start editing
  const handleStartEdit = (personnelId: string) => {
    const personToEdit = personnel.find(p => p.id === personnelId);
    if (!personToEdit) {
      logger.error('Personnel not found for editing:', personnelId);
      return;
    }

    setEditingPersonnelId(personnelId);
    setEditData({
      name: personToEdit.name,
      role: personToEdit.role,
      phone: personToEdit.phone || '',
      email: personToEdit.email || '',
      certifications: personToEdit.certifications || [],
      notes: personToEdit.notes || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingPersonnelId(null);
  };

  const handleSaveEdit = async (personnelId: string) => {
    const trimmedName = editData.name.trim();
    if (!trimmedName) {
      alert(t('personnelManager.nameRequired', 'Personnel name cannot be empty.'));
      return;
    }

    try {
      await onUpdatePersonnel(personnelId, editData);
      setEditingPersonnelId(null);
    } catch (error) {
      logger.error('Error saving personnel:', error);
    }
  };

  const handleRemove = async (personnelId: string) => {
    if (!confirm(t('personnelManager.confirmDelete', 'Are you sure you want to remove this person?'))) {
      return;
    }

    try {
      await onRemovePersonnel(personnelId);
    } catch (error) {
      logger.error('Error removing personnel:', error);
    }
  };

  const handleAddPersonnel = async () => {
    const trimmedName = newPersonnelData.name.trim();
    if (!trimmedName) {
      alert(t('personnelManager.nameRequired', 'Personnel name cannot be empty.'));
      return;
    }

    try {
      await onAddPersonnel(newPersonnelData);
      setIsAddingPersonnel(false);
      setNewPersonnelData({
        name: '',
        role: 'head_coach',
        phone: '',
        email: '',
        certifications: [],
        notes: '',
      });
    } catch (error) {
      logger.error('Error adding personnel:', error);
    }
  };

  // Filter personnel by search
  const filteredPersonnel = personnel.filter(p =>
    p.name.toLowerCase().includes(searchText.toLowerCase()) ||
    p.role.toLowerCase().includes(searchText.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-slate-200">
            {t('personnelManager.title', 'Personnel Manager')}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <HiOutlineXMark className="h-6 w-6" />
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Search and Add button */}
        <div className="p-4 border-b border-slate-700 space-y-3">
          <input
            type="text"
            placeholder={t('personnelManager.searchPlaceholder', 'Search personnel...')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {!isAddingPersonnel && (
            <button
              onClick={() => setIsAddingPersonnel(true)}
              disabled={isUpdating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors disabled:opacity-50"
            >
              <HiPlusCircle className="h-5 w-5" />
              {t('personnelManager.addPersonnel', 'Add Personnel')}
            </button>
          )}
        </div>

        {/* Personnel list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* Add personnel form */}
          {isAddingPersonnel && (
            <div className="bg-slate-900/70 p-4 rounded-lg border border-indigo-500 space-y-3">
              <h3 className="font-semibold text-slate-200">
                {t('personnelManager.addNew', 'Add New Personnel')}
              </h3>

              <input
                type="text"
                placeholder={t('personnelManager.namePlaceholder', 'Full Name')}
                value={newPersonnelData.name}
                onChange={(e) => setNewPersonnelData({ ...newPersonnelData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
              />

              <select
                value={newPersonnelData.role}
                onChange={(e) => setNewPersonnelData({ ...newPersonnelData, role: e.target.value as PersonnelRole })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
              >
                {PERSONNEL_ROLES.map(({ value, labelKey }) => (
                  <option key={value} value={value}>
                    {t(labelKey, value)}
                  </option>
                ))}
              </select>

              <input
                type="tel"
                placeholder={t('personnelManager.phonePlaceholder', 'Phone (optional)')}
                value={newPersonnelData.phone}
                onChange={(e) => setNewPersonnelData({ ...newPersonnelData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
              />

              <input
                type="email"
                placeholder={t('personnelManager.emailPlaceholder', 'Email (optional)')}
                value={newPersonnelData.email}
                onChange={(e) => setNewPersonnelData({ ...newPersonnelData, email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
              />

              <textarea
                placeholder={t('personnelManager.notesPlaceholder', 'Notes (optional)')}
                value={newPersonnelData.notes}
                onChange={(e) => setNewPersonnelData({ ...newPersonnelData, notes: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200 resize-none"
                rows={2}
              />

              <div className="flex gap-2">
                <button
                  onClick={handleAddPersonnel}
                  disabled={isUpdating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                >
                  <HiOutlineCheck className="h-5 w-5" />
                  {t('common.save', 'Save')}
                </button>
                <button
                  onClick={() => setIsAddingPersonnel(false)}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Existing personnel */}
          {filteredPersonnel.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              {searchText
                ? t('personnelManager.noResults', 'No personnel found')
                : t('personnelManager.empty', 'No personnel yet. Add your first person above.')
              }
            </div>
          ) : (
            filteredPersonnel.map((person, index) => (
              <div
                key={person.id}
                ref={(el) => (personnelRefs.current[index] = el)}
                className="bg-slate-900/70 p-4 rounded-lg border border-slate-700"
              >
                {editingPersonnelId === person.id ? (
                  // Edit mode
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
                    />
                    <select
                      value={editData.role}
                      onChange={(e) => setEditData({ ...editData, role: e.target.value as PersonnelRole })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
                    >
                      {PERSONNEL_ROLES.map(({ value, labelKey }) => (
                        <option key={value} value={value}>
                          {t(labelKey, value)}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(person.id)}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
                      >
                        <HiOutlineCheck className="inline h-5 w-5" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded"
                      >
                        <HiOutlineXMark className="inline h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-200">{person.name}</h4>
                      <p className="text-sm text-slate-400">
                        {t(`personnel.roles.${person.role}`, person.role)}
                      </p>
                      {person.phone && (
                        <p className="text-sm text-slate-400 mt-1">{person.phone}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStartEdit(person.id)}
                        className="p-2 text-indigo-400 hover:text-indigo-300"
                      >
                        <HiOutlinePencil className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleRemove(person.id)}
                        className="p-2 text-red-400 hover:text-red-300"
                      >
                        <HiOutlineTrash className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonnelManagerModal;
```

---

## 5. Integration Points

### File: `src/app/page.tsx` (MODIFY)

Add personnel hooks and pass to modals:

```typescript
// Import personnel hooks
import { usePersonnel, useAddPersonnel, useUpdatePersonnel, useRemovePersonnel } from '@/hooks/usePersonnel';

// Inside component
const { data: personnel = [], isLoading: isLoadingPersonnel } = usePersonnel();
const addPersonnelMutation = useAddPersonnel();
const updatePersonnelMutation = useUpdatePersonnel();
const removePersonnelMutation = useRemovePersonnel();

const [isPersonnelManagerOpen, setIsPersonnelManagerOpen] = useState(false);

// Pass to modals as needed
```

### File: `src/components/NewGameSetupModal.tsx` (MODIFY)

Add personnel selection:

1. Add props:
```typescript
interface NewGameSetupModalProps {
  // ... existing props ...
  personnel: Personnel[];
}
```

2. Add state:
```typescript
const [selectedPersonnelIds, setSelectedPersonnelIds] = useState<string[]>([]);
```

3. Add to form (after player selection):
```typescript
<PersonnelSelectionSection
  availablePersonnel={personnel}
  selectedPersonnelIds={selectedPersonnelIds}
  onSelectedPersonnelChange={setSelectedPersonnelIds}
  title={t('newGameSetup.selectPersonnel', 'Select Game Personnel')}
/>
```

4. Pass to onStart callback:
```typescript
onStart(
  // ... existing params ...
  selectedPersonnelIds
);
```

### File: `src/components/ControlBar.tsx` (MODIFY)

Add "Personnel Manager" button (similar to roster manager):

```typescript
<button
  onClick={() => setIsPersonnelManagerOpen(true)}
  className="..."
  title={t('controlBar.personnelManager', 'Personnel Manager')}
>
  <HiUserGroup className="h-5 w-5" />
</button>
```

---

## 6. Internationalization (i18n)

### File: `public/locales/en/translation.json` (MODIFY)

Add translations:

```json
{
  "personnel": {
    "title": "Personnel",
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

### File: `public/locales/fi/translation.json` (MODIFY)

Add Finnish translations (similar structure).

---

## 7. Testing Strategy

### File: `src/utils/personnelManager.test.ts` (NEW)

Mirror tests from `masterRosterManager.test.ts`:

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

  describe('addPersonnelMember', () => {
    it('should add a new personnel member', async () => {
      const newPerson = await addPersonnelMember({
        name: 'John Coach',
        role: 'head_coach',
        phone: '123-456-7890',
      });

      expect(newPerson.id).toMatch(/^personnel_\d+_[a-f0-9]+$/);
      expect(newPerson.name).toBe('John Coach');
      expect(newPerson.role).toBe('head_coach');
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
    it('should update personnel data', async () => {
      const person = await addPersonnelMember({ name: 'Coach', role: 'head_coach' });
      const updated = await updatePersonnelMember(person.id, { phone: '999-888-7777' });

      expect(updated?.phone).toBe('999-888-7777');
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

### File: `src/components/PersonnelManagerModal.test.tsx` (NEW)

Component tests mirroring `RosterSettingsModal.test.tsx`.

### File: `src/components/PersonnelSelectionSection.test.tsx` (NEW)

Component tests mirroring `PlayerSelectionSection.test.tsx`.

---

## 8. Migration & Backwards Compatibility

**No migration needed!** The feature is fully backwards compatible:

- Old games without `gamePersonnel` field: Will display as "No personnel" (empty array)
- Schema validation: Optional field, defaults to `undefined` or `[]`
- Storage: Existing games unchanged, new games include personnel IDs

**Optional: Migration helper** (if you want to set empty arrays explicitly):

```typescript
// In src/utils/migration.ts
export const migrateGamesForPersonnel = async (): Promise<void> => {
  const games = await getSavedGames();
  let modified = false;

  for (const [gameId, game] of Object.entries(games)) {
    if (game.gamePersonnel === undefined) {
      game.gamePersonnel = [];
      modified = true;
    }
  }

  if (modified) {
    await saveGames(games);
    logger.log('Migrated games for personnel feature');
  }
};
```

---

## 9. Implementation Checklist

### Phase 1: Foundation (1 hour)
- [ ] Create `src/types/personnel.ts` with Personnel interface
- [ ] Update `src/types/game.ts` with `gamePersonnel` field
- [ ] Update `src/types/index.ts` to export personnel types
- [ ] Add `PERSONNEL_KEY` to `src/config/storageKeys.ts`
- [ ] Create `src/utils/personnelManager.ts` with CRUD operations
- [ ] Add personnel query keys to `src/config/queryKeys.ts`
- [ ] Create `src/hooks/usePersonnel.ts` with React Query hooks
- [ ] Write tests for `personnelManager.ts`

### Phase 2: UI Components (3-4 hours)
- [ ] Create `PersonnelSelectionSection.tsx` (checkbox selector)
- [ ] Create `PersonnelManagerModal.tsx` (main CRUD UI)
- [ ] Write tests for both components
- [ ] Add i18n translations (English + Finnish) — see "i18n Keys" section

### Phase 3: Integration (1-2 hours)
- [ ] Update `src/app/page.tsx` to include personnel hooks
- [ ] Update `NewGameSetupModal.tsx` to include personnel selection
- [ ] Update `GameSettingsModal.tsx` to show/edit game personnel
- [ ] Add Personnel Manager button to `ControlBar.tsx`
- [ ] Connect all mutation callbacks

### Phase 4: Display & Polish (1-2 hours)
- [ ] Add personnel display to game summary/stats views
- [ ] Add personnel info to game details modal
- [ ] Test all flows end-to-end
- [ ] Fix any styling inconsistencies
- [ ] Verify responsive design on mobile

### Phase 5: Testing & Documentation (1 hour)
- [ ] Run full test suite (`npm test`)
- [ ] Test in production build (`npm run build`)
- [ ] Manual testing: Add → Select → Display → Edit → Delete
- [ ] Test backwards compatibility with old games
- [ ] Update user documentation (if applicable)

---

## 10. Future Enhancements (Optional)

These can be added later without breaking changes:

1. **Personnel Stats**
   - Track which games each person attended
   - Show attendance rate per personnel

2. **Certifications Management**
   - Rich certifications UI (add/remove, expiry dates)
   - Reminders for expiring certifications

3. **Personnel Photos**
   - Avatar/photo uploads
   - Display in selection UI

4. **Multi-Team Personnel**
   - Assign personnel to specific teams
   - Filter by team when selecting

5. **Contact Integration**
   - Quick dial/email buttons
   - Emergency contact fields

6. **Scheduling**
   - Availability tracking
   - Auto-suggest based on schedule

---

## 11. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate Personnel System | Clean separation, different data model, reusable patterns |
| Store IDs in AppState | Minimal storage, allows personnel updates without game updates |
| Checkbox Selection | Consistent UX with player selection, familiar to users |
| Optional Fields | Backwards compatible, gradual adoption |
| Role-Based System | Flexibility for various staff types, future filtering |
| No Team Association (yet) | Keep it simple initially, can add later |

---

## 12. File Structure Summary

```
src/
├── types/
│   ├── personnel.ts (NEW)
│   ├── game.ts (MODIFY - add gamePersonnel field)
│   └── index.ts (MODIFY - export personnel)
├── utils/
│   ├── personnelManager.ts (NEW)
│   ├── personnelRoles.ts (NEW)
│   └── personnelManager.test.ts (NEW)
├── hooks/
│   └── usePersonnel.ts (NEW)
├── components/
│   ├── PersonnelSelectionSection.tsx (NEW)
│   ├── PersonnelSelectionSection.test.tsx (NEW)
│   ├── PersonnelManagerModal.tsx (NEW)
│   ├── PersonnelManagerModal.test.tsx (NEW)
│   ├── GameStatsModal.tsx (MODIFY - show personnel in details)
│   ├── NewGameSetupModal.tsx (MODIFY - add personnel selection)
│   ├── GameSettingsModal.tsx (MODIFY - show personnel)
│   └── ControlBar.tsx (MODIFY - add button)
├── config/
│   ├── storageKeys.ts (MODIFY - add PERSONNEL_KEY)
│   └── queryKeys.ts (MODIFY - add personnel keys)
└── app/
    └── page.tsx (MODIFY - add personnel hooks)

public/locales/
├── en/translation.json (MODIFY)
└── fi/translation.json (MODIFY)

docs/
└── PERSONNEL_FEATURE_IMPLEMENTATION_PLAN.md (THIS FILE)
```

---

## 13. Success Criteria

✅ **Feature is complete when:**

1. User can add/edit/delete personnel in Personnel Manager modal
2. User can select personnel when creating a new game
3. Selected personnel appear in game details/summary
4. All tests pass (`npm test`)
5. Production build succeeds (`npm run build`)
6. Legacy games display correctly (no personnel shown)
7. i18n works for both English and Finnish
8. No console errors or warnings
9. Responsive design works on mobile and desktop
10. Code follows existing patterns (matches player roster system)

---

## 14. i18n Keys (NEW)

Add the following keys to both `public/locales/en/translation.json` and `public/locales/fi/translation.json`:

- `personnel.selected`: "selected"
- `personnel.noPersonnel`: "No personnel available. Add personnel in Personnel Manager."
- `personnel.selectAll`: "Select All"
- `personnel.roles.headCoach`: "Head Coach"
- `personnel.roles.assistantCoach`: "Assistant Coach"
- `personnel.roles.goalkeeperCoach`: "Goalkeeper Coach"
- `personnel.roles.fitnessCoach`: "Fitness Coach"
- `personnel.roles.physio`: "Physio"
- `personnel.roles.teamManager`: "Team Manager"
- `personnel.roles.other`: "Other"
- `personnelManager.nameRequired`: "Personnel name cannot be empty."
- `personnelManager.confirmDelete`: "Are you sure you want to remove this person?"

Integration: prefer retrieving label keys via `getRoleLabelKey(role)` and passing to `t(...)`.

---

## Questions or Clarifications?

- Should personnel be team-specific or global?
  - **Current plan: Global** (can filter later if needed)

- Should we track personnel attendance/stats?
  - **Current plan: No** (can add later)

- Should we allow multiple personnel with same role?
  - **Current plan: Yes** (no restrictions)

---

**Last Updated:** 2025-10-06
**Status:** Ready for Implementation
**Complexity:** 2/10
**Estimated Time:** 8-10 hours
