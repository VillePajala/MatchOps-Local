/**
 * @critical Tests for personnel management utilities
 * Validates CRUD operations, data integrity, and concurrent access handling
 */

import {
  getAllPersonnel,
  getPersonnelCollection,
  getPersonnelById,
  addPersonnelMember,
  updatePersonnelMember,
  removePersonnelMember,
  getPersonnelByRole,
} from './personnelManager';
import { Personnel, PersonnelRole } from '@/types/personnel';
import logger from '@/utils/logger';

// Auto-mock the storage module
jest.mock('./storage');

// Import clearMockStore AFTER mocking
// @ts-expect-error - clearMockStore is added by the mock
import { clearMockStore } from './storage';

// Mock storageKeyLock with proper serialization
jest.mock('./storageKeyLock', () => {
   
  const lockQueues = new Map<string, Promise<any>>();

  return {
    withKeyLock: jest.fn(async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
      // Get or create queue for this key
      const currentLock = lockQueues.get(key) || Promise.resolve();

      // Create new promise that waits for previous operation
      const newLock = currentLock.then(() => fn()).catch(() => fn());
      lockQueues.set(key, newLock);

      try {
        return await newLock;
      } finally {
        // Clean up if this was the last operation
        if (lockQueues.get(key) === newLock) {
          lockQueues.delete(key);
        }
      }
    }),
  };
});

describe('Personnel Manager Utilities', () => {
  beforeEach(() => {
    clearMockStore();
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearMockStore();
  });

  const createTestPersonnel = (
    name: string,
    role: PersonnelRole,
    overrides?: Partial<Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>>
  ): Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'> => ({
    name,
    role,
    phone: '',
    email: '',
    certifications: [],
    notes: '',
    ...overrides,
  });

  describe('getAllPersonnel', () => {
    it('should return empty array when no personnel exists', async () => {
      const personnel = await getAllPersonnel();
      expect(personnel).toEqual([]);
    });

    it('should return all personnel as array', async () => {
      await addPersonnelMember(createTestPersonnel('John Coach', 'head_coach'));
      await addPersonnelMember(createTestPersonnel('Jane Assistant', 'assistant_coach'));

      const personnel = await getAllPersonnel();
      expect(personnel).toHaveLength(2);
      // Verify both are in the array (order may vary due to sorting)
      const names = personnel.map(p => p.name);
      expect(names).toContain('John Coach');
      expect(names).toContain('Jane Assistant');
    });

    it('should sort personnel by creation date (newest first)', async () => {
      const first = await addPersonnelMember(createTestPersonnel('First', 'head_coach'));
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
      const second = await addPersonnelMember(createTestPersonnel('Second', 'assistant_coach'));

      const personnel = await getAllPersonnel();
      // Newest should come first
      const firstIndex = personnel.findIndex(p => p.id === first!.id);
      const secondIndex = personnel.findIndex(p => p.id === second!.id);
      expect(secondIndex).toBeLessThan(firstIndex);
    });
  });

  describe('getPersonnelCollection', () => {
    it('should return empty object when no personnel exists', async () => {
      const collection = await getPersonnelCollection();
      expect(collection).toEqual({});
    });

    it('should return personnel collection indexed by ID', async () => {
      const member1 = await addPersonnelMember(createTestPersonnel('Coach A', 'head_coach'));
      const member2 = await addPersonnelMember(createTestPersonnel('Coach B', 'assistant_coach'));

      const collection = await getPersonnelCollection();
      expect(Object.keys(collection)).toHaveLength(2);
      expect(collection[member1!.id]).toBeDefined();
      expect(collection[member2!.id]).toBeDefined();
      expect(collection[member1!.id].name).toBe('Coach A');
    });
  });

  describe('getPersonnelById', () => {
    it('should return null for non-existent ID', async () => {
      const result = await getPersonnelById('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return personnel member by ID', async () => {
      const member = await addPersonnelMember(createTestPersonnel('Test Coach', 'head_coach'));

      const result = await getPersonnelById(member!.id);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Coach');
      expect(result?.role).toBe('head_coach');
    });
  });

  describe('addPersonnelMember', () => {
    it('should add personnel member with auto-generated ID', async () => {
      const data = createTestPersonnel('New Coach', 'fitness_coach');
      const member = await addPersonnelMember(data);

      expect(member!.id).toMatch(/^personnel_\d+_[a-z0-9]+$/);
      expect(member!.name).toBe('New Coach');
      expect(member!.role).toBe('fitness_coach');
      expect(member!.createdAt).toBeDefined();
      expect(member!.updatedAt).toBeDefined();
    });

    it('should add personnel with all optional fields', async () => {
      const data = createTestPersonnel('Full Profile', 'physio', {
        phone: '+1234567890',
        email: 'coach@example.com',
        certifications: ['First Aid', 'CPR'],
        notes: 'Available weekends',
      });

      const member = await addPersonnelMember(data);
      expect(member!.phone).toBe('+1234567890');
      expect(member!.email).toBe('coach@example.com');
      expect(member!.certifications).toEqual(['First Aid', 'CPR']);
      expect(member!.notes).toBe('Available weekends');
    });

    it('should persist personnel to storage', async () => {
      const member = await addPersonnelMember(createTestPersonnel('Persistent', 'head_coach'));

      // Verify persistence by fetching again
      const fetched = await getPersonnelById(member!.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe('Persistent');
    });

    it('should handle concurrent additions without data loss', async () => {
      const members = [
        createTestPersonnel('Coach 1', 'head_coach'),
        createTestPersonnel('Coach 2', 'assistant_coach'),
        createTestPersonnel('Coach 3', 'goalkeeper_coach'),
        createTestPersonnel('Coach 4', 'fitness_coach'),
        createTestPersonnel('Coach 5', 'physio'),
      ];

      // Add all concurrently
      const results = await Promise.all(
        members.map(member => addPersonnelMember(member))
      );

      expect(results).toHaveLength(5);

      // Verify all were added
      const allPersonnel = await getAllPersonnel();
      expect(allPersonnel).toHaveLength(5);

      // Verify unique IDs
      const ids = allPersonnel.map(p => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('updatePersonnelMember', () => {
    it('should return null for non-existent ID', async () => {
      // Mock logger.warn to suppress expected warning
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const result = await updatePersonnelMember('non-existent', { name: 'New Name' });
      expect(result).toBeNull();
      warnSpy.mockRestore();
    });

    it('should update personnel member fields', async () => {
      const member = await addPersonnelMember(createTestPersonnel('Original Name', 'head_coach'));

      // Wait 10ms to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await updatePersonnelMember(member!.id, {
        name: 'Updated Name',
        role: 'assistant_coach',
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.role).toBe('assistant_coach');
      expect(updated?.updatedAt).not.toBe(member!.updatedAt); // Should have new timestamp
    });

    it('should update optional fields', async () => {
      const member = await addPersonnelMember(createTestPersonnel('Test', 'physio'));

      const updated = await updatePersonnelMember(member!.id, {
        phone: '+9876543210',
        email: 'updated@example.com',
        notes: 'New notes',
      });

      expect(updated?.phone).toBe('+9876543210');
      expect(updated?.email).toBe('updated@example.com');
      expect(updated?.notes).toBe('New notes');
    });

    it('should not modify createdAt timestamp', async () => {
      const member = await addPersonnelMember(createTestPersonnel('Test', 'head_coach'));
      const originalCreatedAt = member!.createdAt;

      await updatePersonnelMember(member!.id, { name: 'Updated' });

      const fetched = await getPersonnelById(member!.id);
      expect(fetched?.createdAt).toBe(originalCreatedAt);
    });

    it('should handle partial updates', async () => {
      const member = await addPersonnelMember(createTestPersonnel('Test', 'head_coach', {
        phone: 'Original Phone',
        email: 'original@example.com',
      }));

      await updatePersonnelMember(member!.id, { phone: 'New Phone' });

      const updated = await getPersonnelById(member!.id);
      expect(updated?.phone).toBe('New Phone');
      expect(updated?.email).toBe('original@example.com'); // Should remain unchanged
    });
  });

  describe('removePersonnelMember', () => {
    it('should return false for non-existent ID', async () => {
      // Mock logger.warn to suppress expected warning
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const result = await removePersonnelMember('non-existent');
      expect(result).toBe(false);
      warnSpy.mockRestore();
    });

    it('should remove personnel member', async () => {
      const member = await addPersonnelMember(createTestPersonnel('To Remove', 'head_coach'));

      const removed = await removePersonnelMember(member!.id);
      expect(removed).toBe(true);

      // Verify removal
      const fetched = await getPersonnelById(member!.id);
      expect(fetched).toBeNull();
    });

    it('should not affect other personnel members', async () => {
      const member1 = await addPersonnelMember(createTestPersonnel('Keep', 'head_coach'));
      const member2 = await addPersonnelMember(createTestPersonnel('Remove', 'assistant_coach'));

      await removePersonnelMember(member2!.id);

      const allPersonnel = await getAllPersonnel();
      expect(allPersonnel).toHaveLength(1);
      expect(allPersonnel[0].id).toBe(member1!.id);
    });
  });

  describe('getPersonnelByRole', () => {
    it('should return empty array for role with no members', async () => {
      await addPersonnelMember(createTestPersonnel('Head Coach 1', 'head_coach'));
      await addPersonnelMember(createTestPersonnel('Assistant 1', 'assistant_coach'));
      await addPersonnelMember(createTestPersonnel('Head Coach 2', 'head_coach'));
      await addPersonnelMember(createTestPersonnel('Physio 1', 'physio'));

      const result = await getPersonnelByRole('team_manager');
      expect(result).toEqual([]);
    });

    it('should filter personnel by role', async () => {
      await addPersonnelMember(createTestPersonnel('Head Coach 1', 'head_coach'));
      await addPersonnelMember(createTestPersonnel('Assistant 1', 'assistant_coach'));
      await addPersonnelMember(createTestPersonnel('Head Coach 2', 'head_coach'));
      await addPersonnelMember(createTestPersonnel('Physio 1', 'physio'));

      const headCoaches = await getPersonnelByRole('head_coach');
      expect(headCoaches).toHaveLength(2);
      expect(headCoaches.every(p => p.role === 'head_coach')).toBe(true);
    });

    it('should return single member for unique role', async () => {
      await addPersonnelMember(createTestPersonnel('Head Coach 1', 'head_coach'));
      await addPersonnelMember(createTestPersonnel('Assistant 1', 'assistant_coach'));
      await addPersonnelMember(createTestPersonnel('Head Coach 2', 'head_coach'));
      await addPersonnelMember(createTestPersonnel('Physio 1', 'physio'));

      const physios = await getPersonnelByRole('physio');
      expect(physios).toHaveLength(1);
      expect(physios[0].name).toBe('Physio 1');
    });
  });

  describe('Data Integrity and Edge Cases', () => {
    it('should handle empty string values correctly', async () => {
      const member = await addPersonnelMember(createTestPersonnel('Test', 'head_coach', {
        phone: '',
        email: '',
        notes: '',
      }));

      expect(member!.phone).toBe('');
      expect(member!.email).toBe('');
      expect(member!.notes).toBe('');
    });

    it('should handle empty certifications array', async () => {
      const member = await addPersonnelMember(createTestPersonnel('Test', 'head_coach', {
        certifications: [],
      }));

      expect(member!.certifications).toEqual([]);
    });

    it('should maintain data integrity under high concurrency', async () => {
      const operationCount = 20;

      // Create many concurrent add operations
      const addOperations = Array.from({ length: operationCount }, (_, i) =>
        addPersonnelMember(createTestPersonnel(`Concurrent ${i}`, 'head_coach'))
      );

      await Promise.all(addOperations);

      const allPersonnel = await getAllPersonnel();

      // Should have exactly the number we added
      expect(allPersonnel).toHaveLength(operationCount);

      // All should have unique IDs
      const ids = allPersonnel.map(p => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(operationCount);
    });

    it('should handle concurrent read/write operations safely', async () => {
      const member = await addPersonnelMember(createTestPersonnel('Initial', 'head_coach'));

      // Start concurrent operations: reads and writes
      const operations = [
        getPersonnelById(member!.id),
        updatePersonnelMember(member!.id, { name: 'Update 1' }),
        getPersonnelById(member!.id),
        updatePersonnelMember(member!.id, { name: 'Update 2' }),
        getAllPersonnel(),
      ];

      const results = await Promise.all(operations);

      // Final state should be Update 2 (last write wins)
      const final = await getPersonnelById(member!.id);
      expect(final?.name).toBe('Update 2');

      // All read operations should have returned valid data
      expect(results[0]).not.toBeNull();
      expect(results[2]).not.toBeNull();
      expect(Array.isArray(results[4])).toBe(true);
    });
  });

  describe('All Personnel Roles', () => {
    const roles: PersonnelRole[] = [
      'head_coach',
      'assistant_coach',
      'goalkeeper_coach',
      'fitness_coach',
      'physio',
      'team_manager',
      'support_staff',
      'other',
    ];

    it('should handle all defined personnel roles', async () => {
      for (const role of roles) {
        const member = await addPersonnelMember(createTestPersonnel(`${role} Test`, role));
        expect(member!.role).toBe(role);
      }

      const allPersonnel = await getAllPersonnel();
      expect(allPersonnel).toHaveLength(roles.length);
    });
  });
});
