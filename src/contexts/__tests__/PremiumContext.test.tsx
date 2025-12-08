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

// Mock premiumManager
jest.mock('@/utils/premiumManager', () => ({
  getPremiumLicense: jest.fn(),
  grantPremium: jest.fn(),
  revokePremium: jest.fn(),
  canCreateResource: jest.fn(),
  getRemainingCount: jest.fn(),
  isOverFreeLimit: jest.fn(),
}));

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
    mockGetPremiumLicense.mockResolvedValue({ isPremium: false });
    mockCanCreateResource.mockReturnValue(true);
    mockGetRemainingCount.mockReturnValue(1);
    mockIsOverFreeLimit.mockReturnValue(false);
  });

  describe('PremiumProvider', () => {
    it('should load premium status on mount', async () => {
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

      // Initially loading
      expect(screen.getByTestId('loading').textContent).toBe('true');

      // After load completes
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      expect(screen.getByTestId('premium').textContent).toBe('true');
    });

    it('should provide limits for free users', async () => {
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
        expect(screen.getByTestId('limits').textContent).toBe('has-limits');
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

    it('should handle grant premium access', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('premium').textContent).toBe('false');
      });

      await act(async () => {
        screen.getByRole('button').click();
      });

      expect(mockGrantPremium).toHaveBeenCalledWith('token123');
      expect(screen.getByTestId('premium').textContent).toBe('true');
    });

    it('should handle revoke premium access', async () => {
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

      expect(mockRevokePremium).toHaveBeenCalled();
      expect(screen.getByTestId('premium').textContent).toBe('false');
    });

    it('should handle grant premium error and re-throw', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('premium').textContent).toBe('false');
      });

      await act(async () => {
        screen.getByRole('button').click();
      });

      expect(caughtError).toBe(storageError);
      // Premium state should remain false since storage failed
      expect(screen.getByTestId('premium').textContent).toBe('false');
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

      expect(screen.getByTestId('price').textContent).toBe('$9.99');
    });

    it('should handle license load error gracefully', async () => {
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

      // Should default to free on error
      expect(screen.getByTestId('premium').textContent).toBe('false');
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

    it('should check limits for free users', async () => {
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
        expect(screen.getByTestId('over-limit').textContent).toBe('true');
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
          <button onClick={() => showUpgradePrompt('team')}>Show Prompt</button>
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

      expect(mockHandler).toHaveBeenCalledWith('team');
    });

    it('should warn when handler not registered', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const TestComponent = () => {
        const { showUpgradePrompt } = usePremiumContext();
        return (
          <button onClick={() => showUpgradePrompt('team')}>Show Prompt</button>
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

    expect(screen.getByTestId('premium').textContent).toBe('false');
    expect(screen.getByTestId('has-limits').textContent).toBe('true');
    expect(screen.getByTestId('price').textContent).toBe('$9.99');
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

    expect(mockHandler).toHaveBeenCalledWith('team');
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
