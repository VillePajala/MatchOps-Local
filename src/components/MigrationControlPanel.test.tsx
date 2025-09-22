/**
 * Tests for MigrationControlPanel Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MigrationControlPanel } from './MigrationControlPanel';
import { MigrationControl, MigrationEstimation } from '@/types/migrationControl';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key
  })
}));

describe('MigrationControlPanel', () => {
  const mockOnPause = jest.fn();
  const mockOnResume = jest.fn();
  const mockOnCancel = jest.fn();

  const defaultControl: MigrationControl = {
    canPause: true,
    canCancel: true,
    canResume: false,
    isPaused: false,
    isCancelling: false
  };

  const defaultProps = {
    control: defaultControl,
    onPause: mockOnPause,
    onResume: mockOnResume,
    onCancel: mockOnCancel
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render pause and cancel buttons when migration is active', () => {
      render(<MigrationControlPanel {...defaultProps} />);

      expect(screen.getByText('Pause')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.queryByText('Resume')).not.toBeInTheDocument();
    });

    it('should render resume button when migration is paused', () => {
      const pausedControl = {
        ...defaultControl,
        isPaused: true,
        canResume: true,
        canPause: false
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          control={pausedControl}
        />
      );

      expect(screen.getByText('Resume')).toBeInTheDocument();
      expect(screen.queryByText('Pause')).not.toBeInTheDocument();
    });

    it('should show cancelling state when cancelling', () => {
      const cancellingControl = {
        ...defaultControl,
        isCancelling: true,
        canCancel: false
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          control={cancellingControl}
        />
      );

      expect(screen.getByText('Cancelling...')).toBeInTheDocument();
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });

    it('should not render buttons when not allowed', () => {
      const restrictedControl = {
        ...defaultControl,
        canPause: false,
        canCancel: false
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          control={restrictedControl}
        />
      );

      expect(screen.queryByText('Pause')).not.toBeInTheDocument();
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });
  });

  describe('estimation display', () => {
    const mockEstimation: MigrationEstimation = {
      totalDataSize: 1048576, // 1MB
      estimatedCompressedSize: 943718, // ~900KB
      estimatedDuration: 5000, // 5 seconds
      estimatedCompletionTime: new Date(),
      averageItemProcessingTime: 50,
      estimatedThroughput: 209715, // ~200KB/s
      confidenceLevel: 'high',
      sampleSize: 10,
      memoryAvailable: true,
      warnings: []
    };

    it('should display estimation when provided', () => {
      render(
        <MigrationControlPanel
          {...defaultProps}
          estimation={mockEstimation}
        />
      );

      expect(screen.getByText('Migration Estimation')).toBeInTheDocument();
      expect(screen.getByText('5s')).toBeInTheDocument(); // Duration
      expect(screen.getByText('1.0 MB')).toBeInTheDocument(); // Data size
      expect(screen.getByText('high')).toBeInTheDocument(); // Confidence
      expect(screen.getByText('204.8 KB/s')).toBeInTheDocument(); // Throughput
    });

    it('should not display estimation in preview mode', () => {
      render(
        <MigrationControlPanel
          {...defaultProps}
          estimation={mockEstimation}
          isPreviewMode={true}
        />
      );

      expect(screen.queryByText('Migration Estimation')).not.toBeInTheDocument();
    });

    it('should format different size units correctly', () => {
      const smallEstimation = {
        ...mockEstimation,
        totalDataSize: 512, // bytes
        estimatedThroughput: 1024 // bytes/s
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          estimation={smallEstimation}
        />
      );

      expect(screen.getByText('512 B')).toBeInTheDocument();
      expect(screen.getByText('1.0 KB/s')).toBeInTheDocument();
    });

    it('should format different duration units correctly', () => {
      const longEstimation = {
        ...mockEstimation,
        estimatedDuration: 125000 // 2m 5s
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          estimation={longEstimation}
        />
      );

      expect(screen.getByText('2m 5s')).toBeInTheDocument();
    });

    it('should show different confidence levels with appropriate styling', () => {
      const mediumConfidenceEstimation = {
        ...mockEstimation,
        confidenceLevel: 'medium' as const
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          estimation={mediumConfidenceEstimation}
        />
      );

      const confidenceElement = screen.getByText('medium');
      expect(confidenceElement).toHaveClass('text-yellow-600');
    });
  });

  describe('user interactions', () => {
    it('should call onPause when pause button is clicked', () => {
      render(<MigrationControlPanel {...defaultProps} />);

      const pauseButton = screen.getByText('Pause');
      fireEvent.click(pauseButton);

      expect(mockOnPause).toHaveBeenCalledTimes(1);
    });

    it('should call onResume when resume button is clicked', () => {
      const pausedControl = {
        ...defaultControl,
        isPaused: true,
        canResume: true,
        canPause: false
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          control={pausedControl}
        />
      );

      const resumeButton = screen.getByText('Resume');
      fireEvent.click(resumeButton);

      expect(mockOnResume).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when cancel button is clicked', () => {
      render(<MigrationControlPanel {...defaultProps} />);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('status messages', () => {
    it('should show paused status message when paused', () => {
      const pausedControl = {
        ...defaultControl,
        isPaused: true
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          control={pausedControl}
        />
      );

      expect(screen.getByText('Migration paused. Click Resume to continue.')).toBeInTheDocument();
    });

    it('should show resumable status message when resume data exists', () => {
      const resumableControl = {
        ...defaultControl,
        resumeData: {
          itemsProcessed: 75,
          totalItems: 100,
          lastProcessedKey: 'key75',
          processedKeys: [],
          remainingKeys: [],
          bytesProcessed: 7500,
          totalBytes: 10000,
          checkpointId: 'checkpoint_123',
          checkpointTimestamp: Date.now(),
          sessionId: 'session_123',
          startTime: Date.now() - 10000,
          pauseTime: Date.now() - 5000
        }
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          control={resumableControl}
        />
      );

      expect(screen.getByText(/75% complete/)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels for buttons', () => {
      render(<MigrationControlPanel {...defaultProps} />);

      const pauseButton = screen.getByLabelText('Pause Migration');
      const cancelButton = screen.getByLabelText('Cancel Migration');

      expect(pauseButton).toBeInTheDocument();
      expect(cancelButton).toBeInTheDocument();
    });

    it('should have proper ARIA label for resume button', () => {
      const pausedControl = {
        ...defaultControl,
        isPaused: true,
        canResume: true,
        canPause: false
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          control={pausedControl}
        />
      );

      const resumeButton = screen.getByLabelText('Resume Migration');
      expect(resumeButton).toBeInTheDocument();
    });
  });

  describe('visual states', () => {
    it('should apply correct CSS classes for button states', () => {
      render(<MigrationControlPanel {...defaultProps} />);

      const pauseButton = screen.getByText('Pause');
      const cancelButton = screen.getByText('Cancel');

      expect(pauseButton).toHaveClass('bg-yellow-500', 'hover:bg-yellow-600');
      expect(cancelButton).toHaveClass('bg-red-500', 'hover:bg-red-600');
    });

    it('should show loading spinner for cancelling state', () => {
      const cancellingControl = {
        ...defaultControl,
        isCancelling: true,
        canCancel: false
      };

      render(
        <MigrationControlPanel
          {...defaultProps}
          control={cancellingControl}
        />
      );

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });
});