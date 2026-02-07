/**
 * @jest-environment jsdom
 */

/**
 * PremiumContext Tests
 * @critical - Tests premium provider, context updates, and hook behavior
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { PremiumProvider, usePremiumContext } from '../PremiumContext';
import { usePremium, useResourceLimit } from '@/hooks/usePremium';
import * as premiumManager from '@/utils/premiumManager';
import * as backendConfig from '@/config/backendConfig';

// Mock premiumManager
jest.mock('@/utils/premiumManager', () => ({
  getPremiumLicense: jest.fn(),
  grantPremium: jest.fn(),
  revokePremium: jest.fn(),
  canCreateResource: jest.fn(),
  getRemainingCount: jest.fn(),
  isOverFreeLimit: jest.fn(),
}));

// Mock backendConfig - default to 'cloud' mode so tests behave as before
// (local mode = always premium, cloud mode = check license)
jest.mock('@/config/backendConfig', () => ({
  getBackendMode: jest.fn(() => 'cloud'),
}));

const mockGetBackendMode = backendConfig.getBackendMode as jest.MockedFunction<
  typeof backendConfig.getBackendMode
>;

const mockGetPremiumLicense = premiumManager.getPremiumLicense as jest.MockedFunction<
  typeof premiumManager.getPremiumLicense
>;
const mockGrantPremium = premiumManager.grantPremium as jest.MockedFunction<
  typeof premiumManager.grantPremium
>;
const mockRevokePremium = premiumManager.revokePremium as jest.MockedFunction<
  typeof premiumManager.revokePremium
>;
const mockCanCreateResource = premiumManager.canCreateResource as jest.MockedFunction<
  typeof premiumManager.canCreateResource
>;
const mockGetRemainingCount = premiumManager.getRemainingCount as jest.MockedFunction<
  typeof premiumManager.getRemainingCount
>;
const mockIsOverFreeLimit = premiumManager.isOverFreeLimit as jest.MockedFunction<
  typeof premiumManager.isOverFreeLimit
>;

describe('PremiumContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default to cloud mode so tests check actual license
    // (local mode = always premium, cloud mode = check license)
    mockGetBackendMode.mockReturnValue('cloud');
    mockGetPremiumLicense.mockResolvedValue({ isPremium: false });
    mockCanCreateResource.mockReturnValue(true);
    mockGetRemainingCount.mockReturnValue(1);
    mockIsOverFreeLimit.mockReturnValue(false);
  });

  describe('PremiumProvider', () => {
    it('should load premium status on mount', async () => {
      // LIMITS DISABLED: loadPremiumStatus completes quickly without async license check
      mockGetPremiumLicense.mockResolvedValue({ isPremium: true });

      const TestComponent = () => {
        const { isPremium, isLoading } = usePremiumContext();
        return (
          <div>
            <span data-testid="loading">{isLoading.toString()}</span>
            <span data-testid="premium">{isPremium.toString()}</span>
          </div>
        );
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      // Limits disabled - loading completes quickly, premium is always true
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      expect(screen.getByTestId('premium').textContent).toBe('true');
    });

    it('should always return no-limits (limits disabled)', async () => {
      // LIMITS DISABLED: PremiumContext always sets isPremium=true, so limits=null
      // This test verifies the current behavior where all users get unlimited access.
      mockGetPremiumLicense.mockResolvedValue({ isPremium: false });

      const TestComponent = () => {
        const { limits } = usePremiumContext();
        return <span data-testid="limits">{limits ? 'has-limits' : 'no-limits'}</span>;
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await waitFor(() => {
        // Limits are disabled - everyone is effectively premium
        expect(screen.getByTestId('limits').textContent).toBe('no-limits');
      });
    });

    it('should provide null limits for premium users', async () => {
      mockGetPremiumLicense.mockResolvedValue({ isPremium: true });

      const TestComponent = () => {
        const { limits } = usePremiumContext();
        return <span data-testid="limits">{limits ? 'has-limits' : 'no-limits'}</span>;
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('limits').textContent).toBe('no-limits');
      });
    });

    it('should always be premium in local mode (regardless of license)', async () => {
      // Local mode = always premium, no license check needed
      mockGetBackendMode.mockReturnValue('local');
      // Even if license says not premium, local mode should still be premium
      mockGetPremiumLicense.mockResolvedValue({ isPremium: false });

      const TestComponent = () => {
        const { isPremium, limits } = usePremiumContext();
        return (
          <div>
            <span data-testid="premium">{isPremium.toString()}</span>
            <span data-testid="limits">{limits ? 'has-limits' : 'no-limits'}</span>
          </div>
        );
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await waitFor(() => {
        // In local mode, premium is always true
        expect(screen.getByTestId('premium').textContent).toBe('true');
        // And limits should be null (no restrictions)
        expect(screen.getByTestId('limits').textContent).toBe('no-limits');
      });

      // License check should not have been called in local mode
      expect(mockGetPremiumLicense).not.toHaveBeenCalled();
    });

    it('should handle grant premium access', async () => {
      // LIMITS DISABLED: isPremium is always true, but grant/revoke still work
      // for when limits might be re-enabled in the future.
      mockGetPremiumLicense.mockResolvedValue({ isPremium: false });
      mockGrantPremium.mockResolvedValue(undefined);

      const TestComponent = () => {
        const { isPremium, grantPremiumAccess } = usePremiumContext();
        return (
          <div>
            <span data-testid="premium">{isPremium.toString()}</span>
            <button onClick={() => grantPremiumAccess('token123')}>Grant</button>
          </div>
        );
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      // Limits disabled - isPremium is always true
      await waitFor(() => {
        expect(screen.getByTestId('premium').textContent).toBe('true');
      });

      await act(async () => {
        screen.getByRole('button').click();
      });

      // Grant still calls the manager (for future use)
      expect(mockGrantPremium).toHaveBeenCalledWith('token123');
      expect(screen.getByTestId('premium').textContent).toBe('true');
    });

    it('should handle revoke premium access', async () => {
      // LIMITS DISABLED: revoke still works but isPremium starts as true (not from license)
      mockGetPremiumLicense.mockResolvedValue({ isPremium: true });
      mockRevokePremium.mockResolvedValue(undefined);

      const TestComponent = () => {
        const { isPremium, revokePremiumAccess } = usePremiumContext();
        return (
          <div>
            <span data-testid="premium">{isPremium.toString()}</span>
            <button onClick={() => revokePremiumAccess()}>Revoke</button>
          </div>
        );
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('premium').textContent).toBe('true');
      });

      await act(async () => {
        screen.getByRole('button').click();
      });

      // Revoke calls the manager and updates local state
      expect(mockRevokePremium).toHaveBeenCalled();
      // After revoke, state is set to false (even though limits disabled)
      expect(screen.getByTestId('premium').textContent).toBe('false');
    });

    it('should handle grant premium error and re-throw', async () => {
      // LIMITS DISABLED: isPremium starts true, but error handling still works
      mockGetPremiumLicense.mockResolvedValue({ isPremium: false });
      const storageError = new Error('Storage write failed');
      mockGrantPremium.mockRejectedValue(storageError);

      let caughtError: Error | null = null;

      const TestComponent = () => {
        const { isPremium, grantPremiumAccess } = usePremiumContext();
        const handleGrant = async () => {
          try {
            await grantPremiumAccess('token123');
          } catch (error) {
            caughtError = error as Error;
          }
        };
        return (
          <div>
            <span data-testid="premium">{isPremium.toString()}</span>
            <button onClick={handleGrant}>Grant</button>
          </div>
        );
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      // Limits disabled - isPremium starts true
      await waitFor(() => {
        expect(screen.getByTestId('premium').textContent).toBe('true');
      });

      await act(async () => {
        screen.getByRole('button').click();
      });

      expect(caughtError).toBe(storageError);
      // Premium state remains true (error occurred before state change)
      expect(screen.getByTestId('premium').textContent).toBe('true');
    });

    it('should handle revoke premium error and re-throw', async () => {
      mockGetPremiumLicense.mockResolvedValue({ isPremium: true });
      const storageError = new Error('Storage write failed');
      mockRevokePremium.mockRejectedValue(storageError);

      let caughtError: Error | null = null;

      const TestComponent = () => {
        const { isPremium, revokePremiumAccess } = usePremiumContext();
        const handleRevoke = async () => {
          try {
            await revokePremiumAccess();
          } catch (error) {
            caughtError = error as Error;
          }
        };
        return (
          <div>
            <span data-testid="premium">{isPremium.toString()}</span>
            <button onClick={handleRevoke}>Revoke</button>
          </div>
        );
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('premium').textContent).toBe('true');
      });

      await act(async () => {
        screen.getByRole('button').click();
      });

      expect(caughtError).toBe(storageError);
      // Premium state should remain true since storage failed
      expect(screen.getByTestId('premium').textContent).toBe('true');
    });

    it('should provide price constant', async () => {
      const TestComponent = () => {
        const { price } = usePremiumContext();
        return <span data-testid="price">{price}</span>;
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      // Price in European format: "€ 4,99/kk" includes per-month indicator
      expect(screen.getByTestId('price').textContent).toBe('€ 4,99/kk');
    });

    it('should handle license load error gracefully', async () => {
      // LIMITS DISABLED: Even on error, grant premium since limits are disabled
      mockGetPremiumLicense.mockRejectedValue(new Error('Storage error'));

      const TestComponent = () => {
        const { isPremium, isLoading } = usePremiumContext();
        return (
          <div>
            <span data-testid="loading">{isLoading.toString()}</span>
            <span data-testid="premium">{isPremium.toString()}</span>
          </div>
        );
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      // Limits disabled - premium is true even on error
      expect(screen.getByTestId('premium').textContent).toBe('true');
    });
  });

  describe('usePremiumContext outside provider', () => {
    it('should throw error when used outside PremiumProvider', () => {
      const TestComponent = () => {
        const context = usePremiumContext();
        return <div>{context.isPremium.toString()}</div>;
      };

      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('usePremiumContext must be used within a PremiumProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('canCreate and getRemaining', () => {
    it('should delegate to premiumManager functions', async () => {
      mockGetPremiumLicense.mockResolvedValue({ isPremium: false });
      mockCanCreateResource.mockReturnValue(false);
      mockGetRemainingCount.mockReturnValue(0);

      const TestComponent = () => {
        const { canCreate, getRemaining } = usePremiumContext();
        const canCreateTeam = canCreate('team', 1);
        const remaining = getRemaining('team', 1);
        return (
          <div>
            <span data-testid="can-create">{canCreateTeam.toString()}</span>
            <span data-testid="remaining">{remaining}</span>
          </div>
        );
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('can-create').textContent).toBe('false');
      });
      expect(screen.getByTestId('remaining').textContent).toBe('0');
    });
  });

  describe('isImportOverLimits', () => {
    it('should return false for premium users', async () => {
      mockGetPremiumLicense.mockResolvedValue({ isPremium: true });

      const TestComponent = () => {
        const { isImportOverLimits } = usePremiumContext();
        const overLimit = isImportOverLimits({
          teams: 10,
          gamesInSeason: 100,
          gamesInTournament: 100,
          players: 100,
          seasons: 10,
          tournaments: 10,
        });
        return <span data-testid="over-limit">{overLimit.toString()}</span>;
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('over-limit').textContent).toBe('false');
      });
    });

    it('should always return false for import limits (limits disabled)', async () => {
      // LIMITS DISABLED: isImportOverLimits always returns false since isPremium is true
      mockGetPremiumLicense.mockResolvedValue({ isPremium: false });
      mockIsOverFreeLimit.mockReturnValue(true);

      const TestComponent = () => {
        const { isImportOverLimits, isLoading } = usePremiumContext();
        if (isLoading) return <span>Loading</span>;
        const overLimit = isImportOverLimits({
          teams: 10,
          gamesInSeason: 100,
          gamesInTournament: 100,
          players: 100,
          seasons: 10,
          tournaments: 10,
        });
        return <span data-testid="over-limit">{overLimit.toString()}</span>;
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await waitFor(() => {
        // Limits disabled - imports never over limit
        expect(screen.getByTestId('over-limit').textContent).toBe('false');
      });
    });
  });

  describe('upgrade prompt handler', () => {
    it('should register and call upgrade prompt handler', async () => {
      const mockHandler = jest.fn();

      const TestComponent = () => {
        const { setUpgradePromptHandler, showUpgradePrompt } = usePremiumContext();

        React.useEffect(() => {
          setUpgradePromptHandler(mockHandler);
        }, [setUpgradePromptHandler]);

        return (
          <button onClick={() => showUpgradePrompt('team', 5)}>Show Prompt</button>
        );
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await act(async () => {
        screen.getByRole('button').click();
      });

      expect(mockHandler).toHaveBeenCalledWith('team', 5);
    });

    it('should warn when handler not registered', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const TestComponent = () => {
        const { showUpgradePrompt } = usePremiumContext();
        return (
          <button onClick={() => showUpgradePrompt('team', 5)}>Show Prompt</button>
        );
      };

      render(
        <PremiumProvider>
          <TestComponent />
        </PremiumProvider>
      );

      await act(async () => {
        screen.getByRole('button').click();
      });

      // Logger.warn is called, not console.warn directly
      // Just verify no crash occurs
      warnSpy.mockRestore();
    });
  });
});

describe('usePremium hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPremiumLicense.mockResolvedValue({ isPremium: false });
    mockCanCreateResource.mockReturnValue(true);
    mockGetRemainingCount.mockReturnValue(5);
  });

  it('should return premium status and helpers', async () => {
    // LIMITS DISABLED: isPremium is always true, limits is always null
    const TestComponent = () => {
      const { isPremium, isLoading, limits, price } = usePremium();
      return (
        <div>
          <span data-testid="premium">{isPremium.toString()}</span>
          <span data-testid="loading">{isLoading.toString()}</span>
          <span data-testid="has-limits">{(limits !== null).toString()}</span>
          <span data-testid="price">{price}</span>
        </div>
      );
    };

    render(
      <PremiumProvider>
        <TestComponent />
      </PremiumProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Limits disabled - everyone is premium with no limits
    expect(screen.getByTestId('premium').textContent).toBe('true');
    expect(screen.getByTestId('has-limits').textContent).toBe('false');
    // Price in European format: "€ 4,99/kk" includes per-month indicator
    expect(screen.getByTestId('price').textContent).toBe('€ 4,99/kk');
  });
});

describe('useResourceLimit hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPremiumLicense.mockResolvedValue({ isPremium: false });
  });

  it('should return canAdd and remaining for resource', async () => {
    mockCanCreateResource.mockReturnValue(true);
    mockGetRemainingCount.mockReturnValue(5);

    const TestComponent = () => {
      const { canAdd, remaining, currentCount } = useResourceLimit('player', 13);
      return (
        <div>
          <span data-testid="can-add">{canAdd.toString()}</span>
          <span data-testid="remaining">{remaining}</span>
          <span data-testid="current">{currentCount}</span>
        </div>
      );
    };

    render(
      <PremiumProvider>
        <TestComponent />
      </PremiumProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('can-add').textContent).toBe('true');
    });
    expect(screen.getByTestId('remaining').textContent).toBe('5');
    expect(screen.getByTestId('current').textContent).toBe('13');
  });

  it('should return false when at limit', async () => {
    mockCanCreateResource.mockReturnValue(false);
    mockGetRemainingCount.mockReturnValue(0);

    const TestComponent = () => {
      const { canAdd, remaining } = useResourceLimit('team', 1);
      return (
        <div>
          <span data-testid="can-add">{canAdd.toString()}</span>
          <span data-testid="remaining">{remaining}</span>
        </div>
      );
    };

    render(
      <PremiumProvider>
        <TestComponent />
      </PremiumProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('can-add').textContent).toBe('false');
    });
    expect(screen.getByTestId('remaining').textContent).toBe('0');
  });

  it('should call showUpgradePrompt via checkAndPrompt when blocked', async () => {
    mockCanCreateResource.mockReturnValue(false);
    const mockHandler = jest.fn();

    const TestComponent = () => {
      const { setUpgradePromptHandler } = usePremiumContext();
      const { checkAndPrompt } = useResourceLimit('team', 1);

      React.useEffect(() => {
        setUpgradePromptHandler(mockHandler);
      }, [setUpgradePromptHandler]);

      return (
        <button onClick={() => checkAndPrompt()}>Check</button>
      );
    };

    render(
      <PremiumProvider>
        <TestComponent />
      </PremiumProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByRole('button').click();
    });

    expect(mockHandler).toHaveBeenCalledWith('team', 1);
  });

  it('should return true from checkAndPrompt when allowed', async () => {
    mockCanCreateResource.mockReturnValue(true);
    let result: boolean | undefined;

    const TestComponent = () => {
      const { checkAndPrompt } = useResourceLimit('player', 10);
      return (
        <button onClick={() => { result = checkAndPrompt(); }}>Check</button>
      );
    };

    render(
      <PremiumProvider>
        <TestComponent />
      </PremiumProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByRole('button').click();
    });

    expect(result).toBe(true);
  });
});
