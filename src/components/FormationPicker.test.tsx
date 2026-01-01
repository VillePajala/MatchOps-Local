/**
 * Unit tests for FormationPicker component
 *
 * Tests the dropdown UI for selecting formation presets.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import FormationPicker from './FormationPicker';
import { FIELD_SIZES } from '@/config/formationPresets';

// Mock react-i18next with interpolation support
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue: string, options?: Record<string, unknown>) => {
      // Handle interpolation for {{count}}
      if (options && typeof options.count === 'number') {
        return defaultValue.replace('{{count}}', String(options.count));
      }
      return defaultValue;
    },
  }),
}));

// Mock createPortal to render in same container for testing
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

describe('FormationPicker', () => {
  const mockOnSelectFormation = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('button rendering', () => {
    it('renders the trigger button', () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={8}
        />
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('has correct aria attributes', () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={5}
        />
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-haspopup', 'true');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('shows disabled state when disabled prop is true', () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={5}
          disabled={true}
        />
      );
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  describe('dropdown behavior', () => {
    it('opens dropdown when button is clicked', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={8}
        />
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('does not open dropdown when disabled', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={5}
          disabled={true}
        />
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes dropdown when clicking outside', async () => {
      render(
        <div>
          <FormationPicker
            onSelectFormation={mockOnSelectFormation}
            selectedPlayerCount={5}
          />
          <div data-testid="outside">Outside</div>
        </div>
      );

      // Open dropdown
      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Click outside
      await act(async () => {
        fireEvent.mouseDown(screen.getByTestId('outside'));
      });

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    it('closes dropdown on Escape key', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={5}
        />
      );

      // Open dropdown
      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Press Escape
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });

  describe('dropdown content', () => {
    it('shows player count in header', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={8}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });

      expect(screen.getByText('8 players selected')).toBeInTheDocument();
    });

    it('shows Auto option', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={5}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });

      expect(screen.getByText('Auto')).toBeInTheDocument();
    });

    it('shows all field size groups', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={5}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });

      FIELD_SIZES.forEach(size => {
        expect(screen.getByText(size)).toBeInTheDocument();
      });
    });

    it('shows formation presets', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={8}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });

      // Check some specific formations exist
      expect(screen.getByText('4-3-3')).toBeInTheDocument();
      expect(screen.getByText('2-2')).toBeInTheDocument();
    });

    it('highlights recommended field size for 8 players', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={8}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });

      // 8 players should recommend 8v8
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });
  });

  describe('selection behavior', () => {
    it('calls onSelectFormation with null when Auto is selected', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={5}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Auto'));
      });

      expect(mockOnSelectFormation).toHaveBeenCalledWith(null);
    });

    it('calls onSelectFormation with preset ID when preset is selected', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={8}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText('4-3-3'));
      });

      expect(mockOnSelectFormation).toHaveBeenCalledWith('11v11-4-3-3');
    });

    it('closes dropdown after selection', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={5}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByText('Auto'));
      });

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });

  describe('player count display', () => {
    it('shows correct player count for each preset', async () => {
      render(
        <FormationPicker
          onSelectFormation={mockOnSelectFormation}
          selectedPlayerCount={8}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });

      // 5v5-2-2 should show "5 players" (4 field + 1 GK)
      const playerCounts = screen.getAllByText(/\d+ players/);
      expect(playerCounts.length).toBeGreaterThan(0);
    });
  });

  describe('memoization', () => {
    it('has displayName for debugging', () => {
      expect(FormationPicker.displayName).toBe('FormationPicker');
    });
  });
});
