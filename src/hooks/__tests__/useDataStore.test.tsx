/**
 * Tests for useDataStore hook.
 *
 * Tests user-scoped storage behavior:
 * - Returns userId when cloud available and authenticated
 * - Returns undefined userId when cloud not available
 * - Returns undefined userId when not authenticated
 * - getStore calls getDataStore with correct userId
 */

import { renderHook, act } from '@testing-library/react';
import { useDataStore } from '../useDataStore';

// Mock dependencies
jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/config/backendConfig', () => ({
  isCloudAvailable: jest.fn(),
}));

jest.mock('@/datastore/factory', () => ({
  getDataStore: jest.fn(),
}));

import { useAuth } from '@/contexts/AuthProvider';
import { isCloudAvailable } from '@/config/backendConfig';
import { getDataStore } from '@/datastore/factory';

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockIsCloudAvailable = isCloudAvailable as jest.MockedFunction<typeof isCloudAvailable>;
const mockGetDataStore = getDataStore as jest.MockedFunction<typeof getDataStore>;

describe('useDataStore', () => {
  const mockDataStore = {
    getTeams: jest.fn(),
    getPlayers: jest.fn(),
    // Add other methods as needed for tests
  };

  const mockUser = {
    id: 'user-123-abc',
    email: 'test@example.com',
    isAnonymous: false,
  };

  const mockAuthContextBase = {
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: false,
    mode: 'local' as const,
    needsReConsent: false,
    initTimedOut: false,
    isSigningOut: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    resetPassword: jest.fn(),
    recordConsent: jest.fn(),
    acceptReConsent: jest.fn(),
    deleteAccount: jest.fn(),
    retryAuthInit: jest.fn(),
    marketingConsent: null,
    showMarketingPrompt: false,
    setMarketingConsent: jest.fn(),
    dismissMarketingPrompt: jest.fn(),
    verifySignUpOtp: jest.fn(),
    resendSignUpConfirmation: jest.fn(),
    verifyPasswordResetOtp: jest.fn(),
    updatePassword: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDataStore.mockResolvedValue(mockDataStore as unknown as ReturnType<typeof getDataStore> extends Promise<infer T> ? T : never);
  });

  describe('userId behavior', () => {
    it('should return userId when cloud is available and user is authenticated', () => {
      mockIsCloudAvailable.mockReturnValue(true);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: mockUser,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useDataStore());

      expect(result.current.userId).toBe('user-123-abc');
      expect(result.current.isUserScoped).toBe(true);
    });

    it('should return undefined userId when cloud is not available', () => {
      mockIsCloudAvailable.mockReturnValue(false);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: mockUser,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useDataStore());

      expect(result.current.userId).toBeUndefined();
      expect(result.current.isUserScoped).toBe(false);
    });

    it('should return undefined userId when user is not authenticated', () => {
      mockIsCloudAvailable.mockReturnValue(true);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: null,
        isAuthenticated: false,
      });

      const { result } = renderHook(() => useDataStore());

      expect(result.current.userId).toBeUndefined();
      expect(result.current.isUserScoped).toBe(false);
    });

    it('should return undefined userId when cloud is not available and user is not authenticated', () => {
      mockIsCloudAvailable.mockReturnValue(false);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: null,
        isAuthenticated: false,
      });

      const { result } = renderHook(() => useDataStore());

      expect(result.current.userId).toBeUndefined();
      expect(result.current.isUserScoped).toBe(false);
    });
  });

  describe('getStore behavior', () => {
    it('should call getDataStore with userId when cloud available and authenticated', async () => {
      mockIsCloudAvailable.mockReturnValue(true);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: mockUser,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useDataStore());

      await act(async () => {
        await result.current.getStore();
      });

      expect(mockGetDataStore).toHaveBeenCalledWith('user-123-abc');
    });

    it('should call getDataStore with undefined when cloud not available', async () => {
      mockIsCloudAvailable.mockReturnValue(false);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: mockUser,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useDataStore());

      await act(async () => {
        await result.current.getStore();
      });

      expect(mockGetDataStore).toHaveBeenCalledWith(undefined);
    });

    it('should call getDataStore with undefined when not authenticated', async () => {
      mockIsCloudAvailable.mockReturnValue(true);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: null,
        isAuthenticated: false,
      });

      const { result } = renderHook(() => useDataStore());

      await act(async () => {
        await result.current.getStore();
      });

      expect(mockGetDataStore).toHaveBeenCalledWith(undefined);
    });

    it('should return the DataStore instance from getDataStore', async () => {
      mockIsCloudAvailable.mockReturnValue(true);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: mockUser,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useDataStore());

      let store: unknown;
      await act(async () => {
        store = await result.current.getStore();
      });

      expect(store).toBe(mockDataStore);
    });
  });

  describe('memoization', () => {
    it('should memoize getStore function when userId does not change', () => {
      mockIsCloudAvailable.mockReturnValue(true);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: mockUser,
        isAuthenticated: true,
      });

      const { result, rerender } = renderHook(() => useDataStore());

      const firstGetStore = result.current.getStore;
      rerender();
      const secondGetStore = result.current.getStore;

      expect(firstGetStore).toBe(secondGetStore);
    });

    it('should update getStore function when userId changes', async () => {
      mockIsCloudAvailable.mockReturnValue(true);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: mockUser,
        isAuthenticated: true,
      });

      const { result, rerender } = renderHook(() => useDataStore());

      const firstGetStore = result.current.getStore;

      // Change to different user
      const newUser = { id: 'user-456-def', email: 'other@example.com', isAnonymous: false };
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: newUser,
        isAuthenticated: true,
      });

      rerender();

      const secondGetStore = result.current.getStore;

      // getStore should be a new function since userId changed
      expect(firstGetStore).not.toBe(secondGetStore);

      // And it should call getDataStore with the new userId
      await act(async () => {
        await result.current.getStore();
      });

      expect(mockGetDataStore).toHaveBeenCalledWith('user-456-def');
    });

    it('should update userId when user signs in', () => {
      mockIsCloudAvailable.mockReturnValue(true);

      // Start not authenticated
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: null,
        isAuthenticated: false,
      });

      const { result, rerender } = renderHook(() => useDataStore());

      expect(result.current.userId).toBeUndefined();
      expect(result.current.isUserScoped).toBe(false);

      // User signs in
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: mockUser,
        isAuthenticated: true,
      });

      rerender();

      expect(result.current.userId).toBe('user-123-abc');
      expect(result.current.isUserScoped).toBe(true);
    });

    it('should update userId when user signs out', () => {
      mockIsCloudAvailable.mockReturnValue(true);

      // Start authenticated
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: mockUser,
        isAuthenticated: true,
      });

      const { result, rerender } = renderHook(() => useDataStore());

      expect(result.current.userId).toBe('user-123-abc');
      expect(result.current.isUserScoped).toBe(true);

      // User signs out
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: null,
        isAuthenticated: false,
      });

      rerender();

      expect(result.current.userId).toBeUndefined();
      expect(result.current.isUserScoped).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle user with empty string id', () => {
      mockIsCloudAvailable.mockReturnValue(true);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: { id: '', email: 'test@example.com', isAnonymous: false },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useDataStore());

      // Empty string is falsy, should result in undefined
      expect(result.current.userId).toBeUndefined();
      expect(result.current.isUserScoped).toBe(false);
    });

    it('should handle concurrent getStore calls', async () => {
      mockIsCloudAvailable.mockReturnValue(true);
      mockUseAuth.mockReturnValue({
        ...mockAuthContextBase,
        user: mockUser,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useDataStore());

      // Make multiple concurrent calls
      await act(async () => {
        await Promise.all([
          result.current.getStore(),
          result.current.getStore(),
          result.current.getStore(),
        ]);
      });

      // Each call should pass the same userId
      expect(mockGetDataStore).toHaveBeenCalledTimes(3);
      expect(mockGetDataStore).toHaveBeenCalledWith('user-123-abc');
    });
  });
});
