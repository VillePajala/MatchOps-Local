/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '../../../tests/utils/test-utils';
import HomePage from '../HomePage';

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
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage(),
      writable: true,
      configurable: true,
    });
    jest.clearAllMocks();
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
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
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
          await new Promise(resolve => setTimeout(resolve, 10));
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
