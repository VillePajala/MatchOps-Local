/**
 * useWarmupPlan Hook Tests
 *
 * Tests for the warmup plan React Query hook:
 * - Query behavior (loading, caching, error handling)
 * - Mutation functions (save, reset to default)
 * - Cache invalidation after mutations
 *
 * @critical - Core warmup plan data management
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useWarmupPlan } from '../useWarmupPlan';
import { queryKeys } from '@/config/queryKeys';
import type { WarmupPlan } from '@/types/warmupPlan';

// Mock the warmup plan utilities
jest.mock('@/utils/warmupPlan', () => ({
  getWarmupPlan: jest.fn(),
  saveWarmupPlan: jest.fn(),
  deleteWarmupPlan: jest.fn(),
  createDefaultWarmupPlan: jest.fn(),
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: {
      language: 'en',
    },
  }),
}));

// Mock ToastProvider
const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

const {
  getWarmupPlan,
  saveWarmupPlan,
  deleteWarmupPlan,
  createDefaultWarmupPlan,
} = jest.requireMock('@/utils/warmupPlan');

// Test fixtures
const mockStoredPlan: WarmupPlan = {
  id: 'user_warmup_plan',
  version: 1,
  lastModified: '2024-01-01T00:00:00.000Z',
  isDefault: false,
  sections: [
    { id: 'sec1', title: 'Custom Section', content: 'Custom content' },
  ],
};

const mockDefaultPlan: WarmupPlan = {
  id: 'user_warmup_plan',
  version: 1,
  lastModified: '2024-01-01T00:00:00.000Z',
  isDefault: true,
  sections: [
    { id: 'sec1', title: 'Default Section', content: 'Default content' },
  ],
};

// Helper to create a fresh QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

// Wrapper component for providing React Query context
const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
  return Wrapper;
};

describe('useWarmupPlan', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockShowToast.mockClear();
    queryClient = createTestQueryClient();
    createDefaultWarmupPlan.mockReturnValue(mockDefaultPlan);
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('query behavior', () => {
    it('returns stored plan when one exists', async () => {
      getWarmupPlan.mockResolvedValue(mockStoredPlan);

      const { result } = renderHook(() => useWarmupPlan(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.plan).toEqual(mockStoredPlan);
      expect(getWarmupPlan).toHaveBeenCalledTimes(1);
    });

    it('returns default plan when no stored plan exists', async () => {
      getWarmupPlan.mockResolvedValue(null);

      const { result } = renderHook(() => useWarmupPlan(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.plan).toEqual(mockDefaultPlan);
      expect(createDefaultWarmupPlan).toHaveBeenCalledTimes(1);
    });

    it('sets isLoading to true while fetching', async () => {
      getWarmupPlan.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockStoredPlan), 100))
      );

      const { result } = renderHook(() => useWarmupPlan(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('returns error when query fails', async () => {
      const testError = new Error('Storage failed');
      getWarmupPlan.mockRejectedValue(testError);

      const { result } = renderHook(() => useWarmupPlan(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(testError);
    });
  });

  describe('savePlan mutation', () => {
    it('saves plan and invalidates query', async () => {
      getWarmupPlan.mockResolvedValue(mockStoredPlan);
      saveWarmupPlan.mockResolvedValue(true);
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useWarmupPlan(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const updatedPlan: WarmupPlan = {
        ...mockStoredPlan,
        sections: [...mockStoredPlan.sections, { id: 'sec2', title: 'New Section', content: '' }],
      };

      await act(async () => {
        await result.current.savePlan(updatedPlan);
      });

      expect(saveWarmupPlan).toHaveBeenCalledWith(updatedPlan);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.warmupPlan });
    });

    it('sets isSaving to true during mutation', async () => {
      getWarmupPlan.mockResolvedValue(mockStoredPlan);
      saveWarmupPlan.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 100))
      );

      const { result } = renderHook(() => useWarmupPlan(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSaving).toBe(false);

      let savePromise: Promise<boolean>;
      act(() => {
        savePromise = result.current.savePlan(mockStoredPlan);
      });

      await waitFor(() => {
        expect(result.current.isSaving).toBe(true);
      });

      await act(async () => {
        await savePromise;
      });

      expect(result.current.isSaving).toBe(false);
    });
  });

  describe('resetToDefault mutation', () => {
    it('deletes plan and invalidates query', async () => {
      getWarmupPlan.mockResolvedValue(mockStoredPlan);
      deleteWarmupPlan.mockResolvedValue(true);
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useWarmupPlan(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.resetToDefault();
      });

      expect(deleteWarmupPlan).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.warmupPlan });
    });

    it('sets isResetting to true during mutation', async () => {
      getWarmupPlan.mockResolvedValue(mockStoredPlan);
      deleteWarmupPlan.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 100))
      );

      const { result } = renderHook(() => useWarmupPlan(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isResetting).toBe(false);

      let resetPromise: Promise<boolean>;
      act(() => {
        resetPromise = result.current.resetToDefault();
      });

      await waitFor(() => {
        expect(result.current.isResetting).toBe(true);
      });

      await act(async () => {
        await resetPromise;
      });

      expect(result.current.isResetting).toBe(false);
    });
  });

  describe('error handling with toasts', () => {
    it('shows toast when save mutation fails', async () => {
      getWarmupPlan.mockResolvedValue(mockStoredPlan);
      saveWarmupPlan.mockRejectedValue(new Error('Save failed'));

      const { result } = renderHook(() => useWarmupPlan(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.savePlan(mockStoredPlan);
        } catch {
          // Expected to throw
        }
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('save'),
        'error'
      );
    });

    it('shows toast when reset mutation fails', async () => {
      getWarmupPlan.mockResolvedValue(mockStoredPlan);
      deleteWarmupPlan.mockRejectedValue(new Error('Reset failed'));

      const { result } = renderHook(() => useWarmupPlan(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.resetToDefault();
        } catch {
          // Expected to throw
        }
      });

      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('reset'),
        'error'
      );
    });
  });
});
