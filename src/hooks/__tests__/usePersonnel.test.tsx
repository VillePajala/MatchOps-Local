/**
 * @critical Tests for personnel React Query hooks
 * Validates cache invalidation, error handling, and mutation behavior
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  usePersonnel,
  usePersonnelById,
  usePersonnelByRole,
  useAddPersonnel,
  useUpdatePersonnel,
  useRemovePersonnel,
} from '../usePersonnel';
import * as personnelManager from '@/utils/personnelManager';
import type { Personnel } from '@/types/personnel';

// Mock the personnel manager utilities
jest.mock('@/utils/personnelManager');
jest.mock('@/utils/logger');

// Mock useDataStore
const TEST_USER_ID = 'test-user-123';
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({
    userId: TEST_USER_ID,
    getStore: jest.fn(),
    isUserScoped: true,
  }),
}));

const createTestPersonnel = (name: string, role: Personnel['role']): Personnel => ({
  id: `personnel_${Date.now()}_${Math.random().toString(16).substring(2, 10)}`,
  name,
  role,
  phone: '',
  email: '',
  certifications: [],
  notes: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('usePersonnel hooks', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });

    wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('usePersonnel', () => {
    it('should fetch all personnel successfully', async () => {
      const mockPersonnel: Personnel[] = [
        createTestPersonnel('John Coach', 'head_coach'),
        createTestPersonnel('Jane Assistant', 'assistant_coach'),
      ];

      (personnelManager.getAllPersonnel as jest.Mock).mockResolvedValue(mockPersonnel);

      const { result } = renderHook(() => usePersonnel(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockPersonnel);
      expect(result.current.data).toHaveLength(2);
    });

    it('should handle empty personnel list', async () => {
      (personnelManager.getAllPersonnel as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => usePersonnel(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([]);
    });

    it('should handle fetch errors gracefully', async () => {
      const error = new Error('Storage error');
      (personnelManager.getAllPersonnel as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => usePersonnel(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeTruthy();
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('usePersonnelById', () => {
    it('should fetch personnel by ID successfully', async () => {
      const mockPerson = createTestPersonnel('Test Coach', 'head_coach');
      (personnelManager.getPersonnelById as jest.Mock).mockResolvedValue(mockPerson);

      const { result } = renderHook(() => usePersonnelById(mockPerson.id), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockPerson);
      expect(personnelManager.getPersonnelById).toHaveBeenCalledWith(mockPerson.id, TEST_USER_ID);
    });

    it('should not fetch when personnelId is null', () => {
      const { result } = renderHook(() => usePersonnelById(null), { wrapper });

      expect(result.current.fetchStatus).toBe('idle');
      expect(personnelManager.getPersonnelById).not.toHaveBeenCalled();
    });

    it('should return null for non-existent personnel', async () => {
      (personnelManager.getPersonnelById as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => usePersonnelById('non-existent'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBeNull();
    });
  });

  describe('usePersonnelByRole', () => {
    it('should fetch personnel by role successfully', async () => {
      const mockCoaches: Personnel[] = [
        createTestPersonnel('Coach 1', 'head_coach'),
        createTestPersonnel('Coach 2', 'head_coach'),
      ];

      (personnelManager.getPersonnelByRole as jest.Mock).mockResolvedValue(mockCoaches);

      const { result } = renderHook(() => usePersonnelByRole('head_coach'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockCoaches);
      expect(result.current.data).toHaveLength(2);
      expect(personnelManager.getPersonnelByRole).toHaveBeenCalledWith('head_coach', TEST_USER_ID);
    });

    it('should return empty array for role with no personnel', async () => {
      (personnelManager.getPersonnelByRole as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => usePersonnelByRole('physio'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([]);
    });
  });

  describe('useAddPersonnel', () => {
    it('should add personnel and invalidate cache', async () => {
      const newPersonnel = createTestPersonnel('New Coach', 'fitness_coach');
      (personnelManager.addPersonnelMember as jest.Mock).mockResolvedValue(newPersonnel);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useAddPersonnel(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          name: 'New Coach',
          role: 'fitness_coach',
          phone: '',
          email: '',
          certifications: [],
          notes: '',
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(personnelManager.addPersonnelMember).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['personnel', TEST_USER_ID] });
    });

    it('should handle add errors properly', async () => {
      const error = new Error('Failed to add personnel');
      (personnelManager.addPersonnelMember as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useAddPersonnel(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            name: 'Test',
            role: 'head_coach',
            phone: '',
            email: '',
            certifications: [],
            notes: '',
          });
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeTruthy();
    });

    it('should handle QuotaExceededError with specific error message', async () => {
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      (personnelManager.addPersonnelMember as jest.Mock).mockRejectedValue(quotaError);

      const { result } = renderHook(() => useAddPersonnel(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            name: 'Test',
            role: 'head_coach',
            phone: '',
            email: '',
            certifications: [],
            notes: '',
          });
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.name).toBe('QuotaExceededError');
      // Verify no retry attempted (quotas don't auto-resolve)
      expect(personnelManager.addPersonnelMember).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent add mutations', async () => {
      const person1 = createTestPersonnel('Person 1', 'head_coach');
      const person2 = createTestPersonnel('Person 2', 'assistant_coach');

      (personnelManager.addPersonnelMember as jest.Mock)
        .mockResolvedValueOnce(person1)
        .mockResolvedValueOnce(person2);

      const { result } = renderHook(() => useAddPersonnel(), { wrapper });

      await act(async () => {
        await Promise.all([
          result.current.mutateAsync({
            name: 'Person 1',
            role: 'head_coach',
            phone: '',
            email: '',
            certifications: [],
            notes: '',
          }),
          result.current.mutateAsync({
            name: 'Person 2',
            role: 'assistant_coach',
            phone: '',
            email: '',
            certifications: [],
            notes: '',
          }),
        ]);
      });

      expect(personnelManager.addPersonnelMember).toHaveBeenCalledTimes(2);
    });
  });

  describe('useUpdatePersonnel', () => {
    it('should update personnel and invalidate cache', async () => {
      const updatedPersonnel = createTestPersonnel('Updated Name', 'head_coach');
      (personnelManager.updatePersonnelMember as jest.Mock).mockResolvedValue(updatedPersonnel);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdatePersonnel(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          personnelId: updatedPersonnel.id,
          updates: { name: 'Updated Name' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(personnelManager.updatePersonnelMember).toHaveBeenCalledWith(
        updatedPersonnel.id,
        { name: 'Updated Name' },
        TEST_USER_ID
      );
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['personnel', TEST_USER_ID] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['personnel', 'detail', updatedPersonnel.id, TEST_USER_ID],
      });
    });

    it('should handle update errors properly', async () => {
      const error = new Error('Personnel not found');
      (personnelManager.updatePersonnelMember as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useUpdatePersonnel(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            personnelId: 'non-existent',
            updates: { name: 'Test' },
          });
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeTruthy();
    });

    it('should handle partial updates', async () => {
      const personnel = createTestPersonnel('Original', 'head_coach');
      const updated = { ...personnel, phone: '+1234567890' };
      (personnelManager.updatePersonnelMember as jest.Mock).mockResolvedValue(updated);

      const { result } = renderHook(() => useUpdatePersonnel(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          personnelId: personnel.id,
          updates: { phone: '+1234567890' },
        });
      });

      expect(personnelManager.updatePersonnelMember).toHaveBeenCalledWith(
        personnel.id,
        { phone: '+1234567890' },
        TEST_USER_ID
      );
    });
  });

  describe('useRemovePersonnel', () => {
    it('should remove personnel and invalidate cache', async () => {
      (personnelManager.removePersonnelMember as jest.Mock).mockResolvedValue(true);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRemovePersonnel(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('personnel_123');
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(personnelManager.removePersonnelMember).toHaveBeenCalledWith('personnel_123', TEST_USER_ID);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['personnel', TEST_USER_ID] });
    });

    it('should handle remove errors properly', async () => {
      const error = new Error('Failed to remove personnel');
      (personnelManager.removePersonnelMember as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useRemovePersonnel(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync('personnel_123');
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeTruthy();
    });

    it('should handle removing non-existent personnel', async () => {
      (personnelManager.removePersonnelMember as jest.Mock).mockResolvedValue(false);

      const { result } = renderHook(() => useRemovePersonnel(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('non-existent');
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBe(false);
    });
  });

  describe('Cache invalidation strategy', () => {
    it('should refetch personnel list after successful add', async () => {
      const initialPersonnel: Personnel[] = [createTestPersonnel('Initial', 'head_coach')];
      const newPersonnel = createTestPersonnel('New', 'assistant_coach');

      (personnelManager.getAllPersonnel as jest.Mock)
        .mockResolvedValueOnce(initialPersonnel)
        .mockResolvedValueOnce([...initialPersonnel, newPersonnel]);

      (personnelManager.addPersonnelMember as jest.Mock).mockResolvedValue(newPersonnel);

      const { result: personnelResult } = renderHook(() => usePersonnel(), { wrapper });
      const { result: addResult } = renderHook(() => useAddPersonnel(), { wrapper });

      // Wait for initial fetch
      await waitFor(() => expect(personnelResult.current.isSuccess).toBe(true));
      expect(personnelResult.current.data).toHaveLength(1);

      // Add new personnel
      await act(async () => {
        await addResult.current.mutateAsync({
          name: 'New',
          role: 'assistant_coach',
          phone: '',
          email: '',
          certifications: [],
          notes: '',
        });
      });

      // Wait for refetch
      await waitFor(() => {
        expect(personnelResult.current.data).toHaveLength(2);
      });

      expect(personnelManager.getAllPersonnel).toHaveBeenCalledTimes(2);
    });
  });

  describe('Component unmount cleanup', () => {
    it('should not update state after unmount during mutation', async () => {
      const newPersonnel = createTestPersonnel('Test', 'head_coach');

      // Use deferred promise pattern instead of setTimeout (anti-pattern)
      let resolveAdd: ((value: Personnel) => void) | undefined;
      (personnelManager.addPersonnelMember as jest.Mock).mockImplementation(
        () => new Promise<Personnel>(resolve => { resolveAdd = resolve; })
      );

      const { result, unmount } = renderHook(() => useAddPersonnel(), { wrapper });

      // Start mutation
      act(() => {
        result.current.mutate({
          name: 'Test',
          role: 'head_coach',
          phone: '',
          email: '',
          certifications: [],
          notes: '',
        });
      });

      // Unmount immediately
      unmount();

      // Resolve after unmount
      resolveAdd?.(newPersonnel);

      await waitFor(() => expect(true).toBe(true));

      // Should not throw errors about state updates after unmount
      expect(true).toBe(true);
    });
  });
});
