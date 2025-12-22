/**
 * Tests for usePersonnelManager hook
 * @integration
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePersonnelManager } from '../usePersonnelManager';
import type { Personnel } from '@/types/personnel';

// Mock the personnel manager utilities
jest.mock('@/utils/personnelManager', () => ({
  getAllPersonnel: jest.fn(),
  addPersonnelMember: jest.fn(),
  updatePersonnelMember: jest.fn(),
  removePersonnelMember: jest.fn(),
}));

const {
  getAllPersonnel,
  addPersonnelMember,
  updatePersonnelMember,
  removePersonnelMember,
} = jest.requireMock('@/utils/personnelManager');

// Mock the logger
jest.mock('@/utils/logger', () => {
  const mockLogger = {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    createLogger: jest.fn(() => mockLogger),
  };
});

// Test data fixtures
const mockPersonnel: Personnel[] = [
  {
    id: 'personnel-1',
    name: 'John Coach',
    role: 'head_coach',
    phone: '123-456-7890',
    email: 'john@test.com',
    certifications: ['UEFA A'],
    notes: 'Head coach',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'personnel-2',
    name: 'Jane Assistant',
    role: 'assistant_coach',
    phone: '098-765-4321',
    email: 'jane@test.com',
    certifications: [],
    notes: '',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
];

// Helper to create test wrapper with QueryClient
const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
};

const createTestWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryClientWrapper';
  return Wrapper;
};

describe('usePersonnelManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations - all resolve successfully
    getAllPersonnel.mockResolvedValue(mockPersonnel);
    addPersonnelMember.mockResolvedValue({
      ...mockPersonnel[0],
      id: 'new-personnel',
    });
    updatePersonnelMember.mockResolvedValue(mockPersonnel[0]);
    removePersonnelMember.mockResolvedValue(true);
  });

  describe('initial state', () => {
    /**
     * Tests basic personnel query functionality
     * @critical - Core data fetching
     */
    it('should fetch personnel data', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.personnel).toEqual(mockPersonnel);
      expect(getAllPersonnel).toHaveBeenCalledTimes(1);
    });

    /**
     * Tests empty personnel state
     * @edge-case - No personnel data
     */
    it('should return empty array when no personnel exist', async () => {
      getAllPersonnel.mockResolvedValue([]);
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.personnel).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe('loading state', () => {
    /**
     * Tests loading state during query execution
     * @integration - Verifies React Query state
     */
    it('should have pending status while loading', async () => {
      // Delay the response to observe loading state
      getAllPersonnel.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockPersonnel), 50))
      );

      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      // Initially should be loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.personnel).toEqual(mockPersonnel);
    });
  });

  describe('addPersonnel - success cases', () => {
    /**
     * Tests personnel addition mutation
     * @critical - Mutation + cache update pattern
     */
    it('should add personnel successfully', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const newPersonnelData = {
        name: 'New Coach',
        role: 'head_coach' as const,
        phone: '555-555-5555',
        email: 'new@test.com',
        certifications: ['UEFA B'],
        notes: 'New head coach',
      };

      const expectedResult = {
        ...newPersonnelData,
        id: 'new-personnel',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      addPersonnelMember.mockResolvedValue(expectedResult);

      let addedPersonnel: Personnel | null = null;
      await act(async () => {
        addedPersonnel = await result.current.addPersonnel(newPersonnelData);
      });

      expect(addedPersonnel).toEqual(expectedResult);
      expect(addPersonnelMember).toHaveBeenCalledWith(newPersonnelData);
    });

    /**
     * Tests personnel addition validation failure
     * @edge-case - Validation throws error
     */
    it('should throw when validation fails', async () => {
      const validationError = new Error('Personnel name cannot be empty');
      addPersonnelMember.mockRejectedValue(validationError);
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await expect(
          result.current.addPersonnel({
            name: '',
            role: 'head_coach',
            phone: '',
            email: '',
            certifications: [],
            notes: '',
          })
        ).rejects.toThrow('Personnel name cannot be empty');
      });
    });
  });

  describe('updatePersonnel - success cases', () => {
    /**
     * Tests personnel update mutation
     * @critical - Mutation + cache update pattern
     */
    it('should update personnel successfully', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const updates = { name: 'Updated Name', phone: '999-999-9999' };
      const expectedResult = {
        ...mockPersonnel[0],
        ...updates,
      };

      updatePersonnelMember.mockResolvedValue(expectedResult);

      let updatedPersonnel: Personnel | null = null;
      await act(async () => {
        updatedPersonnel = await result.current.updatePersonnel('personnel-1', updates);
      });

      expect(updatedPersonnel).toEqual(expectedResult);
      expect(updatePersonnelMember).toHaveBeenCalledWith('personnel-1', updates);
    });

    /**
     * Tests update returns null when personnel not found
     * @edge-case - Personnel not found returns null
     */
    it('should return null when personnel not found', async () => {
      updatePersonnelMember.mockResolvedValue(null);
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let updatedPersonnel: Personnel | null = null;
      await act(async () => {
        updatedPersonnel = await result.current.updatePersonnel('non-existent-id', { name: 'New Name' });
      });

      expect(updatedPersonnel).toBeNull();
    });

    /**
     * Tests update validation failure throws error
     * @edge-case - Validation throws error
     */
    it('should throw when update validation fails', async () => {
      const validationError = new Error('Personnel name cannot be empty');
      updatePersonnelMember.mockRejectedValue(validationError);
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await expect(
          result.current.updatePersonnel('personnel-1', { name: '' })
        ).rejects.toThrow('Personnel name cannot be empty');
      });
    });
  });

  describe('removePersonnel - success cases', () => {
    /**
     * Tests personnel removal mutation
     * @critical - Mutation + cache update pattern
     */
    it('should remove personnel successfully', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.removePersonnel('personnel-1');
      });

      expect(removePersonnelMember).toHaveBeenCalledWith('personnel-1');
    });
  });

  describe('interface completeness', () => {
    /**
     * Tests that all required interface members are exposed
     * @integration - API contract verification
     */
    it('should expose all required interface members', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Check all required properties exist
      expect(result.current).toHaveProperty('personnel');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('addPersonnel');
      expect(result.current).toHaveProperty('updatePersonnel');
      expect(result.current).toHaveProperty('removePersonnel');

      // Check types
      expect(Array.isArray(result.current.personnel)).toBe(true);
      expect(typeof result.current.isLoading).toBe('boolean');
      expect(typeof result.current.addPersonnel).toBe('function');
      expect(typeof result.current.updatePersonnel).toBe('function');
      expect(typeof result.current.removePersonnel).toBe('function');
    });

    /**
     * Tests that error is initially null
     * @integration - Error state verification
     */
    it('should have null error initially', async () => {
      const queryClient = createTestQueryClient();
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(() => usePersonnelManager(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });
});
