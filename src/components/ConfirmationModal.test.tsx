import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfirmationModal from './ConfirmationModal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

const defaultProps = {
  isOpen: true,
  title: 'Confirm Action',
  message: 'Are you sure you want to proceed?',
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
};

describe('ConfirmationModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(<ConfirmationModal {...defaultProps} isOpen={false} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders modal with title and message when open', () => {
      render(<ConfirmationModal {...defaultProps} />);
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
    });

    it('renders React node as message', () => {
      const message = (
        <div>
          <span>Custom message</span>
          <strong>with formatting</strong>
        </div>
      );
      render(<ConfirmationModal {...defaultProps} message={message} />);
      expect(screen.getByText('Custom message')).toBeInTheDocument();
      expect(screen.getByText('with formatting')).toBeInTheDocument();
    });

    it('renders default button labels when none provided', () => {
      render(<ConfirmationModal {...defaultProps} />);
      expect(screen.getByRole('button', { name: /Confirm/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('renders custom button labels when provided', () => {
      render(
        <ConfirmationModal
          {...defaultProps}
          confirmLabel="Delete Forever"
          cancelLabel="Keep It"
        />
      );
      expect(screen.getByRole('button', { name: 'Delete Forever' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Keep It' })).toBeInTheDocument();
    });
  });

  describe('Warning Messages', () => {
    it('renders warning message when provided as string', () => {
      render(
        <ConfirmationModal
          {...defaultProps}
          warningMessage="This action cannot be undone!"
        />
      );
      expect(screen.getByText('This action cannot be undone!')).toBeInTheDocument();
    });

    it('renders warning message as React node', () => {
      const warningMessage = (
        <div>
          <span>Warning:</span>
          <strong>Permanent action</strong>
        </div>
      );
      render(<ConfirmationModal {...defaultProps} warningMessage={warningMessage} />);
      expect(screen.getByText('Warning:')).toBeInTheDocument();
      expect(screen.getByText('Permanent action')).toBeInTheDocument();
    });

    it('does not render warning section when warningMessage is not provided', () => {
      const { container } = render(<ConfirmationModal {...defaultProps} />);
      const warningDiv = container.querySelector('.bg-red-900\\/20');
      expect(warningDiv).not.toBeInTheDocument();
    });
  });

  describe('Button Interactions', () => {
    it('calls onConfirm when confirm button clicked', () => {
      const onConfirm = jest.fn();
      render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} />);

      const confirmButton = screen.getByRole('button', { name: /Confirm/i });
      fireEvent.click(confirmButton);

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when cancel button clicked', () => {
      const onCancel = jest.fn();
      render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Loading State', () => {
    it('disables both buttons when isConfirming is true', () => {
      render(<ConfirmationModal {...defaultProps} isConfirming={true} />);

      const confirmButton = screen.getByRole('button', { name: /Processing/i });
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });

      expect(confirmButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
    });

    it('shows "Processing..." text when isConfirming is true', () => {
      render(<ConfirmationModal {...defaultProps} isConfirming={true} />);
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('does not call onConfirm when clicking disabled confirm button', () => {
      const onConfirm = jest.fn();
      render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} isConfirming={true} />);

      const confirmButton = screen.getByRole('button', { name: /Processing/i });
      fireEvent.click(confirmButton);

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('does not call onCancel when clicking disabled cancel button', () => {
      const onCancel = jest.fn();
      render(<ConfirmationModal {...defaultProps} onCancel={onCancel} isConfirming={true} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('Disabled State', () => {
    it('disables confirm button when confirmDisabled is true', () => {
      render(<ConfirmationModal {...defaultProps} confirmDisabled={true} />);

      const confirmButton = screen.getByRole('button', { name: /Confirm/i });
      expect(confirmButton).toBeDisabled();
    });

    it('does not disable cancel button when confirmDisabled is true', () => {
      render(<ConfirmationModal {...defaultProps} confirmDisabled={true} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      expect(cancelButton).not.toBeDisabled();
    });

    it('does not call onConfirm when clicking disabled confirm button', () => {
      const onConfirm = jest.fn();
      render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} confirmDisabled={true} />);

      const confirmButton = screen.getByRole('button', { name: /Confirm/i });
      fireEvent.click(confirmButton);

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Variant Styling', () => {
    it('applies primary button style by default', () => {
      render(<ConfirmationModal {...defaultProps} />);
      const confirmButton = screen.getByRole('button', { name: /Confirm/i });

      // primaryButtonStyle should be applied (check for gradient classes)
      expect(confirmButton.className).toContain('bg-gradient-to-b');
    });

    it('applies danger button style when variant is danger', () => {
      render(<ConfirmationModal {...defaultProps} variant="danger" />);
      const confirmButton = screen.getByRole('button', { name: /Confirm/i });

      // dangerButtonStyle should be applied
      expect(confirmButton.className).toContain('bg-gradient-to-b');
    });

    it('applies primary button style when variant is explicitly set to primary', () => {
      render(<ConfirmationModal {...defaultProps} variant="primary" />);
      const confirmButton = screen.getByRole('button', { name: /Confirm/i });

      expect(confirmButton.className).toContain('bg-gradient-to-b');
    });
  });

  describe('Edge Cases', () => {
    it('handles both isConfirming and confirmDisabled being true', () => {
      render(
        <ConfirmationModal
          {...defaultProps}
          isConfirming={true}
          confirmDisabled={true}
        />
      );

      const confirmButton = screen.getByRole('button', { name: /Processing/i });
      expect(confirmButton).toBeDisabled();
    });

    it('renders with minimal props', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          title="Simple"
          message="OK?"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );

      expect(screen.getByText('Simple')).toBeInTheDocument();
      expect(screen.getByText('OK?')).toBeInTheDocument();
    });

    it('renders with all optional props', () => {
      const warningMessage = 'Warning!';
      render(
        <ConfirmationModal
          {...defaultProps}
          warningMessage={warningMessage}
          confirmLabel="Yes, Delete"
          cancelLabel="No, Keep"
          isConfirming={false}
          confirmDisabled={false}
          variant="danger"
        />
      );

      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByText('Warning!')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Yes, Delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'No, Keep' })).toBeInTheDocument();
    });
  });
});
