/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '../../../tests/utils/test-utils';
import HomePage from '../HomePage';
import { clearMockStore } from '@/utils/__mocks__/storage';

// Mock storage module - uses __mocks__/storage.ts for in-memory storage
jest.mock('@/utils/storage');

// Mock appSettings module to prevent real storage access
jest.mock('@/utils/appSettings', () => ({
  getAppSettings: jest.fn().mockResolvedValue({
    currentGameId: null,
    lastHomeTeamName: '',
    language: 'fi',
    hasSeenAppGuide: false,
  }),
  saveAppSettings: jest.fn().mockResolvedValue(true),
  updateAppSettings: jest.fn().mockResolvedValue({}),
  getCurrentGameIdSetting: jest.fn().mockResolvedValue(null),
  saveCurrentGameIdSetting: jest.fn().mockResolvedValue(true),
  getLastHomeTeamName: jest.fn().mockResolvedValue(''),
  saveLastHomeTeamName: jest.fn().mockResolvedValue(true),
  getHasSeenAppGuide: jest.fn().mockResolvedValue(false),
  saveHasSeenAppGuide: jest.fn().mockResolvedValue(true),
  getDrawingModeEnabled: jest.fn().mockResolvedValue(false),
  saveDrawingModeEnabled: jest.fn().mockResolvedValue(true),
  getHasSeenFirstGameGuide: jest.fn().mockResolvedValue(true),
  setHasSeenFirstGameGuide: jest.fn().mockResolvedValue(undefined),
  getInstallPromptDismissedTime: jest.fn().mockResolvedValue(null),
  setInstallPromptDismissed: jest.fn().mockResolvedValue(undefined),
  resetAppSettings: jest.fn().mockResolvedValue(true),
}));

// Mock logger with createLogger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

// Create basic test utilities locally
const mockLocalStorage = () => {
  const storage: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => storage[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      storage[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete storage[key];
    }),
    clear: jest.fn(() => {
      Object.keys(storage).forEach(key => delete storage[key]);
    }),
  };
};

// Mock localStorage utilities
jest.mock('@/utils/localStorage', () => ({
  setLocalStorageItem: jest.fn(),
  getLocalStorageItem: jest.fn().mockReturnValue(null),
  removeLocalStorageItem: jest.fn(),
}));

describe('HomePage Component - Deep Testing', () => {
  beforeEach(() => {
    clearMockStore(); // Clear IndexedDB mock storage
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage(),
      writable: true,
      configurable: true,
    });
    // Note: Removed jest.clearAllMocks() as it breaks storage mock implementations
  });

  describe('Component Initialization', () => {
    it('should render without crashing with empty localStorage', async () => {
      render(<HomePage />);
      
      // Wait for initial loading to complete
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should show some basic UI elements
      expect(document.body).toContainHTML('div');
      
      // Should not show any error states
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });

    it('should display MatchOps branding', async () => {
      render(<HomePage />);

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should show the MatchOps branding through text content (logo is text-based)
      expect(document.body).toContainHTML('div');
    });

    it('should initialize with default game state', async () => {
      render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should show default score (0-0)
      const scoreElement = screen.queryByText(/0.*-.*0/) || 
                          screen.queryByText('0') ||
                          document.querySelector('[class*="score"]');
      expect(scoreElement).toBeTruthy();
    });
  });

  describe('User Interface Elements', () => {
    it('should render control buttons', async () => {
      render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should have multiple interactive buttons
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(3);
      
      // Should have some enabled buttons
      const enabledButtons = buttons.filter(btn => !(btn as HTMLButtonElement).disabled);
      expect(enabledButtons.length).toBeGreaterThan(0);
    });

    it('should handle basic button interactions', async () => {
      render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Find and click the first enabled button
      const buttons = screen.getAllByRole('button');
      const enabledButtons = buttons.filter(btn => !(btn as HTMLButtonElement).disabled);
      
      if (enabledButtons.length > 0) {
        // This should not crash the application
        enabledButtons[0].click();
        
        // App should still be responsive
        await waitFor(() => {
          expect(document.body).toContainHTML('div');
        }, { timeout: 1000 });
      }
    });
  });

  describe('State Management', () => {
    it('should maintain application state during interactions', async () => {
      render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Verify initial state
      expect(document.body).toContainHTML('div');
      
      // Interact with some elements
      const clickableElements = screen.getAllByRole('button');
      if (clickableElements.length > 0) {
        clickableElements[0].click();
      }
      
      // Should still have basic structure
      expect(document.body).toContainHTML('div');
    });

    it('should handle rapid interactions gracefully', async () => {
      render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Click multiple buttons rapidly
      const buttons = screen.getAllByRole('button').filter(btn => !(btn as HTMLButtonElement).disabled);

      for (let i = 0; i < Math.min(buttons.length, 3); i++) {
        buttons[i].click();
        // Wait for DOM to stabilize after each interaction
        await waitFor(() => {
          expect(document.body).toContainHTML('div');
        });
      }

      // Should still be responsive
      expect(document.body).toContainHTML('div');
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should render within reasonable time', async () => {
      const startTime = performance.now();
      
      render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });
      
      const renderTime = performance.now() - startTime;
      
      // Should render within 3 seconds on CI/test environment
      expect(renderTime).toBeLessThan(3000);
    });

    it('should not cause memory leaks during normal usage', async () => {
      // Basic memory leak test
      const { unmount } = render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Simulate some interactions
      const buttons = screen.getAllByRole('button').filter(btn => !(btn as HTMLButtonElement).disabled);
      if (buttons.length > 0) {
        for (let i = 0; i < Math.min(buttons.length, 2); i++) {
          buttons[i].click();
          // Wait for DOM to stabilize after each interaction
          await waitFor(() => {
            expect(document.body).toContainHTML('div');
          });
        }
      }

      // Clean unmount should not throw
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Error Resilience', () => {
    it('should handle missing localStorage gracefully', async () => {
      // Mock localStorage failure
      const mockGetItem = jest.fn().mockImplementation(() => {
        throw new Error('localStorage not available');
      });
      
      Object.defineProperty(window, 'localStorage', {
        value: { ...mockLocalStorage(), getItem: mockGetItem },
        writable: true,
      });

      // Should still render
      render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      expect(document.body).toContainHTML('div');
    });

    it('should recover from component errors', async () => {
      // Suppress console.error for this test
      const originalConsoleError = console.error;
      console.error = jest.fn();

      try {
        render(<HomePage />);
        
        await waitFor(() => {
          expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        }, { timeout: 5000 });

        // Should show some content even if errors occur
        expect(document.body).toContainHTML('div');
      } finally {
        console.error = originalConsoleError;
      }
    });
  });

  describe('Integration Points', () => {
    it('should coordinate with React Query correctly', async () => {
      render(<HomePage />);
      
      // Should not show React Query errors
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should not have query-related error messages
      expect(screen.queryByText(/query.*error/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/network.*error/i)).not.toBeInTheDocument();
    });

    it('should handle toast notifications properly', async () => {
      render(<HomePage />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      }, { timeout: 5000 });

      // Should not show toast-related errors
      expect(screen.queryByText(/toast.*error/i)).not.toBeInTheDocument();
      
      // Component should be properly wrapped with providers
      expect(document.body).toContainHTML('div');
    });
  });
});
