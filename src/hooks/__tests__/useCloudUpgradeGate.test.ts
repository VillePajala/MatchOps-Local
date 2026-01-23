/**
 * Tests for useCloudUpgradeGate hook
 *
 * @module hooks/__tests__/useCloudUpgradeGate
 */

import { renderHook, act } from '@testing-library/react';
import { useCloudUpgradeGate } from '../useCloudUpgradeGate';
import * as usePremiumModule from '../usePremium';

// Mock usePremium hook
jest.mock('../usePremium');

const mockUsePremium = usePremiumModule.usePremium as jest.MockedFunction<typeof usePremiumModule.usePremium>;

// Helper to create a mock usePremium return value
const createMockPremiumReturn = (isPremium: boolean) => ({
  isPremium,
  isLoading: false,
  limits: isPremium ? null : {
    maxTeams: 1,
    maxGamesPerSeason: 10,
    maxGamesPerTournament: 10,
    maxPlayers: 18,
    maxSeasons: 1,
    maxTournaments: 1,
  } as const,
  price: '$4.99/month',
  canCreate: jest.fn().mockReturnValue(isPremium),
  getRemaining: jest.fn().mockReturnValue(isPremium ? Infinity : 0),
  showUpgradePrompt: jest.fn(),
  grantPremiumAccess: jest.fn(),
  revokePremiumAccess: jest.fn(),
  refreshPremiumStatus: jest.fn(),
});

describe('useCloudUpgradeGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when user is premium', () => {
    beforeEach(() => {
      mockUsePremium.mockReturnValue(createMockPremiumReturn(true));
    });

    it('executes action immediately without showing modal', () => {
      const { result } = renderHook(() => useCloudUpgradeGate());
      const mockAction = jest.fn();

      act(() => {
        result.current.gateCloudAction(mockAction);
      });

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(result.current.showModal).toBe(false);
    });

    it('does not store pending action', () => {
      const { result } = renderHook(() => useCloudUpgradeGate());
      const mockAction = jest.fn();

      act(() => {
        result.current.gateCloudAction(mockAction);
      });

      // handleUpgradeSuccess should not call action again
      act(() => {
        result.current.handleUpgradeSuccess();
      });

      expect(mockAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('when user is not premium', () => {
    beforeEach(() => {
      mockUsePremium.mockReturnValue(createMockPremiumReturn(false));
    });

    it('shows modal and does not execute action immediately', () => {
      const { result } = renderHook(() => useCloudUpgradeGate());
      const mockAction = jest.fn();

      act(() => {
        result.current.gateCloudAction(mockAction);
      });

      expect(mockAction).not.toHaveBeenCalled();
      expect(result.current.showModal).toBe(true);
    });

    it('executes pending action on handleUpgradeSuccess', () => {
      const { result } = renderHook(() => useCloudUpgradeGate());
      const mockAction = jest.fn();

      act(() => {
        result.current.gateCloudAction(mockAction);
      });

      expect(mockAction).not.toHaveBeenCalled();

      act(() => {
        result.current.handleUpgradeSuccess();
      });

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(result.current.showModal).toBe(false);
    });

    it('clears pending action on handleCancel', () => {
      const { result } = renderHook(() => useCloudUpgradeGate());
      const mockAction = jest.fn();

      act(() => {
        result.current.gateCloudAction(mockAction);
      });

      expect(result.current.showModal).toBe(true);

      act(() => {
        result.current.handleCancel();
      });

      expect(mockAction).not.toHaveBeenCalled();
      expect(result.current.showModal).toBe(false);

      // handleUpgradeSuccess after cancel should not execute the action
      act(() => {
        result.current.handleUpgradeSuccess();
      });

      expect(mockAction).not.toHaveBeenCalled();
    });

    it('replaces pending action when gateCloudAction called twice', () => {
      const { result } = renderHook(() => useCloudUpgradeGate());
      const firstAction = jest.fn();
      const secondAction = jest.fn();

      act(() => {
        result.current.gateCloudAction(firstAction);
      });

      act(() => {
        result.current.gateCloudAction(secondAction);
      });

      act(() => {
        result.current.handleUpgradeSuccess();
      });

      expect(firstAction).not.toHaveBeenCalled();
      expect(secondAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('when premium status changes', () => {
    it('updates behavior when premium status changes', () => {
      // Start as non-premium
      mockUsePremium.mockReturnValue(createMockPremiumReturn(false));

      const { result, rerender } = renderHook(() => useCloudUpgradeGate());
      const mockAction = jest.fn();

      act(() => {
        result.current.gateCloudAction(mockAction);
      });

      expect(mockAction).not.toHaveBeenCalled();
      expect(result.current.showModal).toBe(true);

      // Close modal
      act(() => {
        result.current.handleCancel();
      });

      // Now user becomes premium
      mockUsePremium.mockReturnValue(createMockPremiumReturn(true));

      rerender();

      // New action should execute immediately
      const newAction = jest.fn();
      act(() => {
        result.current.gateCloudAction(newAction);
      });

      expect(newAction).toHaveBeenCalledTimes(1);
      expect(result.current.showModal).toBe(false);
    });
  });
});
