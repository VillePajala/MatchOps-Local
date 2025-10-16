import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FieldToolsPanel from './FieldToolsPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  onUndo: jest.fn(),
  onRedo: jest.fn(),
  canUndo: true,
  canRedo: true,
  isTacticsBoardView: false,
  onToggleTacticsBoard: jest.fn(),
  onPlaceAllPlayers: jest.fn(),
  onAddOpponent: jest.fn(),
  onAddHomeDisc: jest.fn(),
  onAddOpponentDisc: jest.fn(),
  onClearDrawings: jest.fn(),
  onResetField: jest.fn(),
};

describe('FieldToolsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(<FieldToolsPanel {...defaultProps} isOpen={false} />);
      expect(container.querySelector('.fixed.bottom-20')).not.toBeInTheDocument();
    });

    it('renders panel with header when open', () => {
      render(<FieldToolsPanel {...defaultProps} />);
      expect(screen.getByText('Field Tools')).toBeInTheDocument();
    });

    it('renders backdrop when open', () => {
      const { container } = render(<FieldToolsPanel {...defaultProps} />);
      const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/30');
      expect(backdrop).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(<FieldToolsPanel {...defaultProps} />);
      const closeButton = screen.getByLabelText('Close');
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('Close Functionality', () => {
    it('calls onClose when close button clicked', () => {
      const onClose = jest.fn();
      render(<FieldToolsPanel {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByLabelText('Close');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop clicked', () => {
      const onClose = jest.fn();
      const { container } = render(<FieldToolsPanel {...defaultProps} onClose={onClose} />);

      const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/30');
      fireEvent.click(backdrop!);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking outside panel after delay', async () => {
      const onClose = jest.fn();
      render(<FieldToolsPanel {...defaultProps} onClose={onClose} />);

      // Fast-forward past the 100ms delay
      jest.advanceTimersByTime(150);

      // Simulate click outside (on document body)
      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('does not call onClose when clicking inside panel', () => {
      const onClose = jest.fn();
      render(<FieldToolsPanel {...defaultProps} onClose={onClose} />);

      jest.advanceTimersByTime(150);

      const panel = screen.getByText('Field Tools').closest('.fixed.bottom-20');
      fireEvent.mouseDown(panel!);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Undo/Redo Buttons', () => {
    it('renders undo button', () => {
      render(<FieldToolsPanel {...defaultProps} />);
      expect(screen.getByTitle('Undo')).toBeInTheDocument();
    });

    it('renders redo button', () => {
      render(<FieldToolsPanel {...defaultProps} />);
      expect(screen.getByTitle('Redo')).toBeInTheDocument();
    });

    it('calls onUndo when undo button clicked', () => {
      const onUndo = jest.fn();
      render(<FieldToolsPanel {...defaultProps} onUndo={onUndo} />);

      fireEvent.click(screen.getByTitle('Undo'));
      expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it('calls onRedo when redo button clicked', () => {
      const onRedo = jest.fn();
      render(<FieldToolsPanel {...defaultProps} onRedo={onRedo} />);

      fireEvent.click(screen.getByTitle('Redo'));
      expect(onRedo).toHaveBeenCalledTimes(1);
    });

    it('disables undo button when canUndo is false', () => {
      render(<FieldToolsPanel {...defaultProps} canUndo={false} />);
      expect(screen.getByTitle('Undo')).toBeDisabled();
    });

    it('disables redo button when canRedo is false', () => {
      render(<FieldToolsPanel {...defaultProps} canRedo={false} />);
      expect(screen.getByTitle('Redo')).toBeDisabled();
    });

    it('does not call onUndo when disabled undo button clicked', () => {
      const onUndo = jest.fn();
      render(<FieldToolsPanel {...defaultProps} onUndo={onUndo} canUndo={false} />);

      fireEvent.click(screen.getByTitle('Undo'));
      expect(onUndo).not.toHaveBeenCalled();
    });

    it('does not call onRedo when disabled redo button clicked', () => {
      const onRedo = jest.fn();
      render(<FieldToolsPanel {...defaultProps} onRedo={onRedo} canRedo={false} />);

      fireEvent.click(screen.getByTitle('Redo'));
      expect(onRedo).not.toHaveBeenCalled();
    });
  });

  describe('Tactics Toggle', () => {
    it('renders tactics button', () => {
      render(<FieldToolsPanel {...defaultProps} />);
      expect(screen.getByText('Tactics')).toBeInTheDocument();
    });

    it('calls onToggleTacticsBoard when tactics button clicked', () => {
      const onToggleTacticsBoard = jest.fn();
      render(<FieldToolsPanel {...defaultProps} onToggleTacticsBoard={onToggleTacticsBoard} />);

      fireEvent.click(screen.getByText('Tactics'));
      expect(onToggleTacticsBoard).toHaveBeenCalledTimes(1);
    });

    it('applies active styling when isTacticsBoardView is true', () => {
      render(<FieldToolsPanel {...defaultProps} isTacticsBoardView={true} />);
      const tacticsButton = screen.getByText('Tactics').closest('button');
      expect(tacticsButton?.className).toContain('bg-indigo-600');
    });

    it('applies inactive styling when isTacticsBoardView is false', () => {
      render(<FieldToolsPanel {...defaultProps} isTacticsBoardView={false} />);
      const tacticsButton = screen.getByText('Tactics').closest('button');
      expect(tacticsButton?.className).toContain('bg-slate-700');
    });
  });

  describe('Normal Mode Buttons', () => {
    beforeEach(() => {
      // Render in normal mode (not tactics)
    });

    it('shows "Place All" button in normal mode', () => {
      render(<FieldToolsPanel {...defaultProps} isTacticsBoardView={false} />);
      expect(screen.getByText('Place All')).toBeInTheDocument();
    });

    it('calls onPlaceAllPlayers when "Place All" clicked', () => {
      const onPlaceAllPlayers = jest.fn();
      render(<FieldToolsPanel {...defaultProps} isTacticsBoardView={false} onPlaceAllPlayers={onPlaceAllPlayers} />);

      fireEvent.click(screen.getByText('Place All'));
      expect(onPlaceAllPlayers).toHaveBeenCalledTimes(1);
    });

    it('calls onAddOpponent when "Add Opp" clicked in normal mode', () => {
      const onAddOpponent = jest.fn();
      render(<FieldToolsPanel {...defaultProps} isTacticsBoardView={false} onAddOpponent={onAddOpponent} />);

      fireEvent.click(screen.getByText('Add Opp'));
      expect(onAddOpponent).toHaveBeenCalledTimes(1);
    });
  });

  describe('Tactics Mode Buttons', () => {
    it('shows "Add Home" button in tactics mode', () => {
      render(<FieldToolsPanel {...defaultProps} isTacticsBoardView={true} />);
      expect(screen.getByText('Add Home')).toBeInTheDocument();
    });

    it('does not show "Place All" button in tactics mode', () => {
      render(<FieldToolsPanel {...defaultProps} isTacticsBoardView={true} />);
      expect(screen.queryByText('Place All')).not.toBeInTheDocument();
    });

    it('calls onAddHomeDisc when "Add Home" clicked in tactics mode', () => {
      const onAddHomeDisc = jest.fn();
      render(<FieldToolsPanel {...defaultProps} isTacticsBoardView={true} onAddHomeDisc={onAddHomeDisc} />);

      fireEvent.click(screen.getByText('Add Home'));
      expect(onAddHomeDisc).toHaveBeenCalledTimes(1);
    });

    it('calls onAddOpponentDisc when "Add Opp" clicked in tactics mode', () => {
      const onAddOpponentDisc = jest.fn();
      render(<FieldToolsPanel {...defaultProps} isTacticsBoardView={true} onAddOpponentDisc={onAddOpponentDisc} />);

      fireEvent.click(screen.getByText('Add Opp'));
      expect(onAddOpponentDisc).toHaveBeenCalledTimes(1);
    });
  });

  describe('Clear and Reset Buttons', () => {
    it('renders clear drawings button', () => {
      render(<FieldToolsPanel {...defaultProps} />);
      expect(screen.getByText('Clear')).toBeInTheDocument();
    });

    it('renders reset field button', () => {
      render(<FieldToolsPanel {...defaultProps} />);
      expect(screen.getByText('Reset')).toBeInTheDocument();
    });

    it('calls onClearDrawings when clear button clicked', () => {
      const onClearDrawings = jest.fn();
      render(<FieldToolsPanel {...defaultProps} onClearDrawings={onClearDrawings} />);

      fireEvent.click(screen.getByText('Clear'));
      expect(onClearDrawings).toHaveBeenCalledTimes(1);
    });

    it('calls onResetField when reset button clicked', () => {
      const onResetField = jest.fn();
      render(<FieldToolsPanel {...defaultProps} onResetField={onResetField} />);

      fireEvent.click(screen.getByText('Reset'));
      expect(onResetField).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid open/close cycles', () => {
      const onClose = jest.fn();
      const { rerender } = render(<FieldToolsPanel {...defaultProps} isOpen={false} onClose={onClose} />);

      rerender(<FieldToolsPanel {...defaultProps} isOpen={true} onClose={onClose} />);
      rerender(<FieldToolsPanel {...defaultProps} isOpen={false} onClose={onClose} />);
      rerender(<FieldToolsPanel {...defaultProps} isOpen={true} onClose={onClose} />);

      // Should not crash or throw errors
      expect(screen.getByText('Field Tools')).toBeInTheDocument();
    });

    it('handles all buttons disabled state', () => {
      render(<FieldToolsPanel {...defaultProps} canUndo={false} canRedo={false} />);

      expect(screen.getByTitle('Undo')).toBeDisabled();
      expect(screen.getByTitle('Redo')).toBeDisabled();
      // Other buttons should still be enabled
      expect(screen.getByText('Tactics').closest('button')).not.toBeDisabled();
    });

    it('renders all tools in grid layout', () => {
      const { container } = render(<FieldToolsPanel {...defaultProps} />);
      const grid = container.querySelector('.grid.grid-cols-3');
      expect(grid).toBeInTheDocument();
    });
  });
});
