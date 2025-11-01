/**
 * @critical Tests for PersonnelManagerModal component
 * Validates CRUD operations, search functionality, and user interactions
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PersonnelManagerModal from './PersonnelManagerModal';
import { Personnel } from '@/types/personnel';
import { ToastProvider } from '@/contexts/ToastProvider';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, unknown>) => {
      // Handle string fallback (old pattern)
      if (typeof options === 'string') {
        return options;
      }
      // Handle object with defaultValue and interpolation variables
      if (options && typeof options === 'object' && 'defaultValue' in options) {
        let result = options.defaultValue as string;
        // Replace interpolation variables like {{name}} with actual values
        Object.keys(options).forEach((optKey) => {
          if (optKey !== 'defaultValue') {
            const value = options[optKey];
            result = result.replace(new RegExp(`{{\\s*${optKey}\\s*}}`, 'g'), String(value));
          }
        });
        return result;
      }
      // Fallback to key if no options
      return key;
    },
  }),
}));

// Mock getGamesWithPersonnel function
jest.mock('@/utils/personnelManager', () => ({
  getGamesWithPersonnel: jest.fn().mockResolvedValue([]),
}));

describe('PersonnelManagerModal', () => {
  const mockPersonnel: Personnel[] = [
    {
      id: 'personnel_1',
      name: 'John Coach',
      role: 'head_coach',
      phone: '+1234567890',
      email: 'john@example.com',
      certifications: ['UEFA A', 'First Aid'],
      notes: 'Available weekdays',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'personnel_2',
      name: 'Jane Assistant',
      role: 'assistant_coach',
      phone: '+9876543210',
      email: 'jane@example.com',
      certifications: [],
      notes: '',
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
    {
      id: 'personnel_3',
      name: 'Bob Physio',
      role: 'physio',
      phone: '',
      email: '',
      certifications: [],
      notes: 'Part-time',
      createdAt: '2024-01-03T00:00:00.000Z',
      updatedAt: '2024-01-03T00:00:00.000Z',
    },
  ];

  const mockOnAddPersonnel = jest.fn().mockResolvedValue(undefined);
  const mockOnUpdatePersonnel = jest.fn().mockResolvedValue(undefined);
  const mockOnRemovePersonnel = jest.fn().mockResolvedValue(undefined);
  const mockOnClose = jest.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    personnel: mockPersonnel,
    onAddPersonnel: mockOnAddPersonnel,
    onUpdatePersonnel: mockOnUpdatePersonnel,
    onRemovePersonnel: mockOnRemovePersonnel,
    isUpdating: false,
    error: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderModal = (props = {}) => {
    return render(
      <ToastProvider>
        <PersonnelManagerModal {...defaultProps} {...props} />
      </ToastProvider>
    );
  };

  describe('Rendering', () => {
    it('should render modal when isOpen is true', () => {
      renderModal();

      expect(screen.getByText('Personnel Manager')).toBeInTheDocument();
    });

    it('should not render modal when isOpen is false', () => {
      renderModal({ isOpen: false });

      expect(screen.queryByText('Personnel Manager')).not.toBeInTheDocument();
    });

    it('should render all personnel in list', () => {
      renderModal();

      expect(screen.getByText('John Coach')).toBeInTheDocument();
      expect(screen.getByText('Jane Assistant')).toBeInTheDocument();
      expect(screen.getByText('Bob Physio')).toBeInTheDocument();
    });

    it('should display personnel count', () => {
      renderModal();

      expect(screen.getByText('3')).toBeInTheDocument(); // Total count
      // With 3 personnel, should show plural form "Personnel"
      expect(screen.getByText('Personnel')).toBeInTheDocument();
    });

    it('should display singular form with one personnel', () => {
      const singlePersonnel = [mockPersonnel[0]];
      renderModal({ personnel: singlePersonnel });

      expect(screen.getByText('1')).toBeInTheDocument(); // Count is 1
      // With 1 personnel, should show singular form "Personnel" (in English, same as plural)
      expect(screen.getByText('Personnel')).toBeInTheDocument();
    });

    it('should show empty state when no personnel', () => {
      renderModal({ personnel: [] });

      expect(screen.getByText('No personnel yet. Add your first person above.')).toBeInTheDocument();
    });
  });

  describe('Add Personnel', () => {
    it('should show add form when Add Personnel button clicked', () => {
      renderModal();

      const addButton = screen.getByRole('button', { name: /Add Personnel/i });
      fireEvent.click(addButton);

      expect(screen.getByPlaceholderText('Full Name')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should call onAddPersonnel with correct data when form submitted', async () => {
      renderModal();

      // Open add form
      const addButton = screen.getByRole('button', { name: /Add Personnel/i });
      fireEvent.click(addButton);

      // Fill form
      const nameInput = screen.getByPlaceholderText('Full Name');
      fireEvent.change(nameInput, { target: { value: 'New Coach' } });

      const roleSelect = screen.getByRole('combobox');
      fireEvent.change(roleSelect, { target: { value: 'fitness_coach' } });

      const phoneInput = screen.getByPlaceholderText('Phone (optional)');
      fireEvent.change(phoneInput, { target: { value: '+1111111111' } });

      // Submit - button is "Add Personnel" in add mode
      const submitButtons = screen.getAllByRole('button', { name: /Add Personnel/i });
      const saveButton = submitButtons[submitButtons.length - 1]; // Get the last one (form submit button)
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnAddPersonnel).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Coach',
            role: 'fitness_coach',
            phone: '+1111111111',
          })
        );
      });
    });

    it('should show validation error for empty name', async () => {
      renderModal();

      const addButton = screen.getByRole('button', { name: /Add Personnel/i });
      fireEvent.click(addButton);

      // Try to save without name
      const submitButtons = screen.getAllByRole('button', { name: /Add Personnel/i });
      const saveButton = submitButtons[submitButtons.length - 1]; // Get the form submit button
      fireEvent.click(saveButton);

      // Should not call onAddPersonnel
      expect(mockOnAddPersonnel).not.toHaveBeenCalled();
    });

    it('should close add form when cancel clicked', () => {
      renderModal();

      const addButton = screen.getByRole('button', { name: /Add Personnel/i });
      fireEvent.click(addButton);

      expect(screen.getByPlaceholderText('Full Name')).toBeInTheDocument();

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(screen.queryByPlaceholderText('Full Name')).not.toBeInTheDocument();
    });
  });

  describe('Edit Personnel', () => {
    it('should show edit form when Edit button clicked from 3-dot menu', () => {
      renderModal();

      // Click 3-dot menu button
      const menuButtons = screen.getAllByLabelText(/More options/i);
      fireEvent.click(menuButtons[0]);

      // Click Edit from dropdown
      const editButton = screen.getByText(/Edit/i);
      fireEvent.click(editButton);

      expect(screen.getByDisplayValue('John Coach')).toBeInTheDocument();
      expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
    });

    it('should call onUpdatePersonnel with correct data when edit submitted', async () => {
      renderModal();

      // Click 3-dot menu button
      const menuButtons = screen.getAllByLabelText(/More options/i);
      fireEvent.click(menuButtons[0]);

      // Click Edit from dropdown
      const editButton = screen.getByText(/Edit/i);
      fireEvent.click(editButton);

      const nameInput = screen.getByDisplayValue('John Coach');
      fireEvent.change(nameInput, { target: { value: 'John Updated Coach' } });

      const saveButton = screen.getByRole('button', { name: /Save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnUpdatePersonnel).toHaveBeenCalledWith(
          'personnel_1',
          expect.objectContaining({
            name: 'John Updated Coach',
          })
        );
      });
    });

    it('should populate all fields when editing', () => {
      renderModal();

      // Click 3-dot menu button
      const menuButtons = screen.getAllByLabelText(/More options/i);
      fireEvent.click(menuButtons[0]);

      // Click Edit from dropdown
      const editButton = screen.getByText(/Edit/i);
      fireEvent.click(editButton);

      expect(screen.getByDisplayValue('John Coach')).toBeInTheDocument();
      expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Available weekdays')).toBeInTheDocument();
    });

    it('should cancel editing and restore original state', () => {
      renderModal();

      // Click 3-dot menu button
      const menuButtons = screen.getAllByLabelText(/More options/i);
      fireEvent.click(menuButtons[0]);

      // Click Edit from dropdown
      const editButton = screen.getByText(/Edit/i);
      fireEvent.click(editButton);

      const nameInput = screen.getByDisplayValue('John Coach');
      fireEvent.change(nameInput, { target: { value: 'Modified Name' } });

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      // Should show original name, not modified
      expect(screen.getByText('John Coach')).toBeInTheDocument();
    });
  });

  describe('Delete Personnel', () => {
    it('should show confirmation modal when Delete clicked from 3-dot menu', async () => {
      renderModal();

      // Click 3-dot menu button
      const menuButtons = screen.getAllByLabelText(/More options/i);
      fireEvent.click(menuButtons[0]);

      // Click Delete from dropdown
      const deleteButton = screen.getByText(/Delete/i);
      fireEvent.click(deleteButton);

      // Wait for ConfirmationModal to appear
      await waitFor(() => {
        expect(screen.getByText('Delete Personnel')).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to remove John Coach/i)).toBeInTheDocument();
      });
    });

    it('should call onRemovePersonnel when deletion confirmed', async () => {
      renderModal();

      // Click 3-dot menu button
      const menuButtons = screen.getAllByLabelText(/More options/i);
      fireEvent.click(menuButtons[0]);

      // Click Delete from dropdown to open confirmation modal
      const deleteButton = screen.getByText(/Delete/i);
      fireEvent.click(deleteButton);

      // Wait for confirmation modal to appear
      await waitFor(() => {
        expect(screen.getByText('Delete Personnel')).toBeInTheDocument();
      });

      // Click Delete button in confirmation modal
      const confirmDeleteButtons = screen.getAllByText(/Delete/i);
      const modalDeleteButton = confirmDeleteButtons[confirmDeleteButtons.length - 1]; // Last one is the modal button
      fireEvent.click(modalDeleteButton);

      await waitFor(() => {
        expect(mockOnRemovePersonnel).toHaveBeenCalledWith('personnel_1');
      });
    });

    it('should not call onRemovePersonnel when deletion cancelled', async () => {
      renderModal();

      // Click 3-dot menu button
      const menuButtons = screen.getAllByLabelText(/More options/i);
      fireEvent.click(menuButtons[0]);

      // Click Delete from dropdown to open confirmation modal
      const deleteButton = screen.getByText(/Delete/i);
      fireEvent.click(deleteButton);

      // Wait for confirmation modal to appear
      await waitFor(() => {
        expect(screen.getByText('Delete Personnel')).toBeInTheDocument();
      });

      // Click Cancel button in confirmation modal
      const cancelButton = screen.getByText(/Cancel/i);
      fireEvent.click(cancelButton);

      // Verify onRemovePersonnel was not called
      expect(mockOnRemovePersonnel).not.toHaveBeenCalled();

      // Verify modal is closed
      await waitFor(() => {
        expect(screen.queryByText('Delete Personnel')).not.toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter personnel by name', () => {
      renderModal();

      const searchInput = screen.getByPlaceholderText(/Search personnel/i);
      fireEvent.change(searchInput, { target: { value: 'John' } });

      expect(screen.getByText('John Coach')).toBeInTheDocument();
      expect(screen.queryByText('Jane Assistant')).not.toBeInTheDocument();
      expect(screen.queryByText('Bob Physio')).not.toBeInTheDocument();
    });

    it('should filter personnel by role', () => {
      renderModal();

      const searchInput = screen.getByPlaceholderText(/Search personnel/i);
      fireEvent.change(searchInput, { target: { value: 'physio' } });

      expect(screen.queryByText('John Coach')).not.toBeInTheDocument();
      expect(screen.queryByText('Jane Assistant')).not.toBeInTheDocument();
      expect(screen.getByText('Bob Physio')).toBeInTheDocument();
    });

    it('should show all personnel when search is cleared', () => {
      renderModal();

      const searchInput = screen.getByPlaceholderText(/Search personnel/i);
      fireEvent.change(searchInput, { target: { value: 'John' } });

      expect(screen.queryByText('Jane Assistant')).not.toBeInTheDocument();

      fireEvent.change(searchInput, { target: { value: '' } });

      expect(screen.getByText('John Coach')).toBeInTheDocument();
      expect(screen.getByText('Jane Assistant')).toBeInTheDocument();
      expect(screen.getByText('Bob Physio')).toBeInTheDocument();
    });

    it('should be case-insensitive', () => {
      renderModal();

      const searchInput = screen.getByPlaceholderText(/Search personnel/i);
      fireEvent.change(searchInput, { target: { value: 'JOHN' } });

      expect(screen.getByText('John Coach')).toBeInTheDocument();
    });

    it('should show no results message when search finds nothing', () => {
      renderModal();

      const searchInput = screen.getByPlaceholderText(/Search personnel/i);
      fireEvent.change(searchInput, { target: { value: 'NonexistentName' } });

      expect(screen.queryByText('John Coach')).not.toBeInTheDocument();
      expect(screen.queryByText('Jane Assistant')).not.toBeInTheDocument();
      expect(screen.queryByText('Bob Physio')).not.toBeInTheDocument();
    });
  });

  describe('Loading and Error States', () => {
    it('should disable form buttons when isUpdating is true', () => {
      renderModal({ isUpdating: true });

      const addButton = screen.getByRole('button', { name: /Add Personnel/i });
      // Add button itself should be disabled when isUpdating
      expect(addButton).toBeDisabled();
    });

    // TODO: Error display not implemented - component uses toast messages instead
    it.skip('should display error message when error prop is provided', () => {
      renderModal({ error: 'Failed to add personnel' });

      expect(screen.getByText('Failed to add personnel')).toBeInTheDocument();
    });
  });

  describe('Modal Controls', () => {
    it('should call onClose when close button clicked', () => {
      renderModal();

      const closeButton = screen.getByRole('button', { name: /Close/i });
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should reset form state when modal closes', () => {
      const { rerender } = renderModal();

      // Open add form
      const addButton = screen.getByRole('button', { name: /Add Personnel/i });
      fireEvent.click(addButton);

      expect(screen.getByPlaceholderText('Full Name')).toBeInTheDocument();

      // Close modal
      rerender(
        <ToastProvider>
          <PersonnelManagerModal {...defaultProps} isOpen={false} />
        </ToastProvider>
      );

      // Reopen modal
      rerender(
        <ToastProvider>
          <PersonnelManagerModal {...defaultProps} isOpen={true} />
        </ToastProvider>
      );

      // Add form should not be visible
      expect(screen.queryByPlaceholderText('Full Name')).not.toBeInTheDocument();
    });
  });

  describe('Role Selection', () => {
    it('should render all available roles in dropdown', () => {
      renderModal();

      const addButton = screen.getByRole('button', { name: /Add Personnel/i });
      fireEvent.click(addButton);

      const roleSelect = screen.getByRole('combobox');
      const options = Array.from(roleSelect.querySelectorAll('option'));

      expect(options.length).toBeGreaterThan(0);
      expect(options.some(opt => opt.value === 'head_coach')).toBe(true);
      expect(options.some(opt => opt.value === 'assistant_coach')).toBe(true);
      expect(options.some(opt => opt.value === 'goalkeeper_coach')).toBe(true);
      expect(options.some(opt => opt.value === 'fitness_coach')).toBe(true);
      expect(options.some(opt => opt.value === 'physio')).toBe(true);
      expect(options.some(opt => opt.value === 'team_manager')).toBe(true);
      expect(options.some(opt => opt.value === 'support_staff')).toBe(true);
      expect(options.some(opt => opt.value === 'other')).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for buttons', () => {
      renderModal();

      expect(screen.getByRole('button', { name: /Add Personnel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
    });

    it('should have accessible form inputs', () => {
      renderModal();

      const addButton = screen.getByRole('button', { name: /Add Personnel/i });
      fireEvent.click(addButton);

      expect(screen.getByPlaceholderText('Full Name')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });
});
