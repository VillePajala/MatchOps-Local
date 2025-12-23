import React from 'react';
import { render, screen, act, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonnelDetailsModal from './PersonnelDetailsModal';
import { Personnel } from '@/types/personnel';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { AlreadyExistsError, ValidationError } from '@/interfaces/DataStoreErrors';

type PersonnelDetailsModalProps = React.ComponentProps<typeof PersonnelDetailsModal>;

const mockPersonnel: Personnel = {
  id: 'per1',
  name: 'John Coach',
  role: 'head_coach',
  phone: '+1234567890',
  email: 'john@example.com',
  certifications: ['UEFA C', 'UEFA B'],
  notes: 'Experienced coach',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const defaultProps: PersonnelDetailsModalProps = {
  isOpen: true,
  onClose: jest.fn(),
  mode: 'edit',
  personnel: mockPersonnel,
  onUpdatePersonnel: jest.fn().mockResolvedValue(mockPersonnel),
  isUpdating: false,
};

const renderWithProviders = (props: Partial<PersonnelDetailsModalProps> = {}) => {
  return render(
    <I18nextProvider i18n={i18n}>
      <PersonnelDetailsModal {...defaultProps} {...props} />
    </I18nextProvider>
  );
};

describe('PersonnelDetailsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders personnel details when open in edit mode', async () => {
      await act(async () => {
        renderWithProviders();
      });

      expect(screen.getByDisplayValue('John Coach')).toBeInTheDocument();
      expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Experienced coach')).toBeInTheDocument();
    });

    it('renders create form when in create mode', async () => {
      await act(async () => {
        renderWithProviders({
          mode: 'create',
          personnel: undefined,
          onAddPersonnel: jest.fn().mockResolvedValue(mockPersonnel),
          onUpdatePersonnel: undefined,
        });
      });

      expect(screen.getByText('Add Personnel')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter name')).toHaveValue('');
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders({ isOpen: false });

      expect(screen.queryByDisplayValue('John Coach')).not.toBeInTheDocument();
    });

    it('renders all form fields', async () => {
      await act(async () => {
        renderWithProviders();
      });

      expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument();
      // Role select - check by finding a select element with role options
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText('Phone number')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
      // Certifications section with dropdown
      expect(screen.getByText('Certifications')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Additional notes')).toBeInTheDocument();
    });

    it('renders role select with all options', async () => {
      await act(async () => {
        renderWithProviders();
      });

      // Get the role select (first combobox)
      const roleSelect = screen.getAllByRole('combobox')[0];
      expect(roleSelect).toBeInTheDocument();
      expect(roleSelect.tagName).toBe('SELECT');

      const options = (roleSelect as HTMLSelectElement).options;
      expect(options.length).toBe(8);
    });

    it('renders certifications as chips', async () => {
      await act(async () => {
        renderWithProviders();
      });

      // Certifications should be displayed as chips
      expect(screen.getByText('UEFA C')).toBeInTheDocument();
      expect(screen.getByText('UEFA B')).toBeInTheDocument();
    });

    it('renders no certification chips when certifications is empty', async () => {
      const personnelNoCerts = { ...mockPersonnel, certifications: undefined };

      await act(async () => {
        renderWithProviders({ personnel: personnelNoCerts });
      });

      // Should not find any certification chips
      expect(screen.queryByText('UEFA C')).not.toBeInTheDocument();
      expect(screen.queryByText('UEFA B')).not.toBeInTheDocument();
      // But should show the Add Certification button
      expect(screen.getByRole('button', { name: /Add Certification/i })).toBeInTheDocument();
    });
  });

  describe('Form Interaction', () => {
    it('allows editing personnel name', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const nameInput = screen.getByDisplayValue('John Coach');
      await user.clear(nameInput);
      await user.type(nameInput, 'Jane Coach');

      expect(screen.getByDisplayValue('Jane Coach')).toBeInTheDocument();
    });

    it('allows changing role', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const roleSelect = screen.getAllByRole('combobox')[0];
      await user.selectOptions(roleSelect, 'assistant_coach');

      expect((roleSelect as HTMLSelectElement).value).toBe('assistant_coach');
    });

    it('allows editing phone', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const phoneInput = screen.getByDisplayValue('+1234567890');
      await user.clear(phoneInput);
      await user.type(phoneInput, '+9876543210');

      expect(screen.getByDisplayValue('+9876543210')).toBeInTheDocument();
    });

    it('allows editing email', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const emailInput = screen.getByDisplayValue('john@example.com');
      await user.clear(emailInput);
      await user.type(emailInput, 'jane@example.com');

      expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument();
    });

    it('allows adding certification via dropdown', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      // Click "Add Certification" button
      const addCertButton = screen.getByRole('button', { name: /Add Certification/i });
      await user.click(addCertButton);

      // Select a certification from dropdown
      const certSelect = screen.getByRole('combobox', { name: /Select certification/i });
      await user.selectOptions(certSelect, 'UEFA A + VAT');

      // Click Add button
      const confirmAddButton = screen.getAllByRole('button', { name: /^Add$/i })[0];
      await user.click(confirmAddButton);

      // Verify chip appears
      expect(screen.getByText('UEFA A + VAT')).toBeInTheDocument();
    });

    it('allows removing certification via × button', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      // Find the remove button for UEFA C
      const uefaCChip = screen.getByText('UEFA C').closest('div');
      const removeButton = within(uefaCChip!).getByRole('button');
      await user.click(removeButton);

      // Verify chip is removed
      expect(screen.queryByText('UEFA C')).not.toBeInTheDocument();
      // Other certification should still be there
      expect(screen.getByText('UEFA B')).toBeInTheDocument();
    });

    it('allows editing notes', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const notesTextarea = screen.getByDisplayValue('Experienced coach');
      await user.clear(notesTextarea);
      await user.type(notesTextarea, 'Updated notes');

      expect(screen.getByDisplayValue('Updated notes')).toBeInTheDocument();
    });
  });

  describe('Certification Dropdown Behavior', () => {
    it('filters out already selected certifications from dropdown', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      // Click "Add Certification" button
      const addCertButton = screen.getByRole('button', { name: /Add Certification/i });
      await user.click(addCertButton);

      // Get the dropdown
      const certSelect = screen.getByRole('combobox', { name: /Select certification/i });
      const options = Array.from((certSelect as HTMLSelectElement).options);
      const optionValues = options.map(opt => opt.value);

      // UEFA C and UEFA B should not be in the dropdown (already selected)
      expect(optionValues).not.toContain('UEFA C');
      expect(optionValues).not.toContain('UEFA B');
      // Other certifications should be available
      expect(optionValues).toContain('UEFA A + VAT');
      expect(optionValues).toContain('UEFA PRO');
    });

    it('disables Add Certification button when all certifications selected', async () => {
      // Create personnel with all certifications
      const { CERTIFICATIONS } = await import('@/config/gameOptions');
      const personnelAllCerts = {
        ...mockPersonnel,
        certifications: [...CERTIFICATIONS]
      };

      await act(async () => {
        renderWithProviders({ personnel: personnelAllCerts });
      });

      const addCertButton = screen.getByRole('button', { name: /Add Certification/i });
      expect(addCertButton).toBeDisabled();
    });

    it('allows canceling certification add', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      // Click "Add Certification" button
      const addCertButton = screen.getByRole('button', { name: /Add Certification/i });
      await user.click(addCertButton);

      // Dropdown should be visible
      expect(screen.getByRole('combobox', { name: /Select certification/i })).toBeInTheDocument();

      // Click Cancel in the certification dropdown (first Cancel button, modal footer is second)
      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      // The CertificationManager Cancel button is the first one in DOM order
      await user.click(cancelButtons[0]);

      // Dropdown should be hidden, Add Certification button should be visible
      expect(screen.queryByRole('combobox', { name: /Select certification/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add Certification/i })).toBeInTheDocument();
    });
  });

  describe('Save Functionality', () => {
    it('saves changes when Save button is clicked', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(mockPersonnel);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      const nameInput = screen.getByDisplayValue('John Coach');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Coach');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePersonnel).toHaveBeenCalledWith('per1', {
        name: 'Updated Coach',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('saves multiple field changes', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(mockPersonnel);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      const nameInput = screen.getByDisplayValue('John Coach');
      await user.clear(nameInput);
      await user.type(nameInput, 'New Coach');

      const roleSelect = screen.getAllByRole('combobox')[0];
      await user.selectOptions(roleSelect, 'physio');

      const phoneInput = screen.getByDisplayValue('+1234567890');
      await user.clear(phoneInput);
      await user.type(phoneInput, '+1111111111');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePersonnel).toHaveBeenCalledWith('per1', {
        name: 'New Coach',
        role: 'physio',
        phone: '+1111111111',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('saves added certifications correctly', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(mockPersonnel);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      // Add a new certification
      const addCertButton = screen.getByRole('button', { name: /Add Certification/i });
      await user.click(addCertButton);

      const certSelect = screen.getByRole('combobox', { name: /Select certification/i });
      await user.selectOptions(certSelect, 'UEFA PRO');

      const confirmAddButton = screen.getAllByRole('button', { name: /^Add$/i })[0];
      await user.click(confirmAddButton);

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePersonnel).toHaveBeenCalledWith('per1', {
        certifications: ['UEFA C', 'UEFA B', 'UEFA PRO'],
      });
    });

    it('saves removed certifications correctly', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(mockPersonnel);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      // Remove UEFA C
      const uefaCChip = screen.getByText('UEFA C').closest('div');
      const removeButton = within(uefaCChip!).getByRole('button');
      await user.click(removeButton);

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePersonnel).toHaveBeenCalledWith('per1', {
        certifications: ['UEFA B'],
      });
    });

    it('sets certifications to undefined when all removed', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(mockPersonnel);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      // Remove all certifications
      const uefaCChip = screen.getByText('UEFA C').closest('div');
      await user.click(within(uefaCChip!).getByRole('button'));

      const uefaBChip = screen.getByText('UEFA B').closest('div');
      await user.click(within(uefaBChip!).getByRole('button'));

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePersonnel).toHaveBeenCalledWith('per1', {
        certifications: undefined,
      });
    });

    it('does not call onUpdatePersonnel when no changes are made', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(mockPersonnel);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePersonnel).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('creates personnel with certifications when in create mode', async () => {
      const onAddPersonnel = jest.fn().mockResolvedValue(mockPersonnel);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          personnel: undefined,
          onAddPersonnel,
          onUpdatePersonnel: undefined,
          onClose,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter name');
      await user.type(nameInput, 'New Personnel');

      const roleSelect = screen.getAllByRole('combobox')[0];
      await user.selectOptions(roleSelect, 'team_manager');

      const phoneInput = screen.getByPlaceholderText('Phone number');
      await user.type(phoneInput, '+9999999999');

      const emailInput = screen.getByPlaceholderText('Email address');
      await user.type(emailInput, 'new@example.com');

      // Add certifications via dropdown
      const addCertButton = screen.getByRole('button', { name: /Add Certification/i });
      await user.click(addCertButton);
      const certSelect = screen.getByRole('combobox', { name: /Select certification/i });
      await user.selectOptions(certSelect, 'UEFA C');
      const confirmAddButton = screen.getAllByRole('button', { name: /^Add$/i })[0];
      await user.click(confirmAddButton);

      // Add another certification
      await user.click(screen.getByRole('button', { name: /Add Certification/i }));
      const certSelect2 = screen.getByRole('combobox', { name: /Select certification/i });
      await user.selectOptions(certSelect2, 'UEFA B');
      await user.click(screen.getAllByRole('button', { name: /^Add$/i })[0]);

      const notesTextarea = screen.getByPlaceholderText('Additional notes');
      await user.type(notesTextarea, 'New hire');

      const addButton = screen.getByRole('button', { name: /^Add$/i });
      await user.click(addButton);

      expect(onAddPersonnel).toHaveBeenCalledWith({
        name: 'New Personnel',
        role: 'team_manager',
        phone: '+9999999999',
        email: 'new@example.com',
        certifications: ['UEFA C', 'UEFA B'],
        notes: 'New hire',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('trims whitespace from inputs when saving', async () => {
      const onAddPersonnel = jest.fn().mockResolvedValue(mockPersonnel);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          personnel: undefined,
          onAddPersonnel,
          onUpdatePersonnel: undefined,
          onClose,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter name');
      await user.type(nameInput, '  Spaced Name  ');

      const phoneInput = screen.getByPlaceholderText('Phone number');
      await user.type(phoneInput, '  +1234567890  ');

      const addButton = screen.getByRole('button', { name: /^Add$/i });
      await user.click(addButton);

      expect(onAddPersonnel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Spaced Name',
          phone: '+1234567890',
        })
      );
    });

    it('omits optional fields when empty in create mode', async () => {
      const onAddPersonnel = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          personnel: undefined,
          onAddPersonnel,
          onUpdatePersonnel: undefined,
          onClose,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter name');
      await user.type(nameInput, 'Minimal Personnel');

      const addButton = screen.getByRole('button', { name: /^Add$/i });
      await user.click(addButton);

      expect(onAddPersonnel).toHaveBeenCalledWith({
        name: 'Minimal Personnel',
        role: 'head_coach',
        phone: undefined,
        email: undefined,
        certifications: undefined,
        notes: undefined,
      });
    });
  });

  describe('Validation', () => {
    it('disables Save button when name is empty', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const nameInput = screen.getByDisplayValue('John Coach');
      await user.clear(nameInput);

      const saveButton = screen.getByRole('button', { name: /Save/i });
      expect(saveButton).toBeDisabled();
    });

    it('disables Add button when name is empty in create mode', async () => {
      await act(async () => {
        renderWithProviders({
          mode: 'create',
          personnel: undefined,
          onAddPersonnel: jest.fn().mockResolvedValue(mockPersonnel),
          onUpdatePersonnel: undefined,
        });
      });

      const addButton = screen.getByRole('button', { name: /^Add$/i });
      expect(addButton).toBeDisabled();
    });

    it('disables Save button when isUpdating is true', async () => {
      await act(async () => {
        renderWithProviders({
          isUpdating: true,
        });
      });

      const saveButton = screen.getByRole('button', { name: /Saving.../i });
      expect(saveButton).toBeDisabled();
    });

    it('enables Save button when name is whitespace-only then valid', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const nameInput = screen.getByDisplayValue('John Coach');
      await user.clear(nameInput);
      await user.type(nameInput, '   ');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      expect(saveButton).toBeDisabled();

      await user.clear(nameInput);
      await user.type(nameInput, 'Valid Name');

      expect(saveButton).toBeEnabled();
    });
  });

  describe('Cancel Functionality', () => {
    it('calls onClose when Cancel button is clicked', async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({ onClose });
      });

      // Get the Cancel button in the footer (not the one in certification dropdown)
      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      const footerCancelButton = cancelButtons[cancelButtons.length - 1];
      await user.click(footerCancelButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose without saving changes when cancelled', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(mockPersonnel);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      const nameInput = screen.getByDisplayValue('John Coach');
      await user.clear(nameInput);
      await user.type(nameInput, 'Changed Name');

      const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
      const footerCancelButton = cancelButtons[cancelButtons.length - 1];
      await user.click(footerCancelButton);

      expect(onUpdatePersonnel).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('handles async update error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const onUpdatePersonnel = jest.fn().mockRejectedValue(new Error('Update failed'));
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
        });
      });

      const nameInput = screen.getByDisplayValue('John Coach');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save personnel:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });

    it('does not close modal when update fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const onUpdatePersonnel = jest.fn().mockRejectedValue(new Error('Update failed'));
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      const nameInput = screen.getByDisplayValue('John Coach');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      // Wait for error to be logged
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onClose).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('handles async create error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const onAddPersonnel = jest.fn().mockRejectedValue(new Error('Create failed'));
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          personnel: undefined,
          onAddPersonnel,
          onUpdatePersonnel: undefined,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter name');
      await user.type(nameInput, 'New Personnel');

      const addButton = screen.getByRole('button', { name: /^Add$/i });
      await user.click(addButton);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save personnel:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });

    /**
     * @critical - Verifies AlreadyExistsError shows duplicate name message
     */
    it('shows duplicate name error message for AlreadyExistsError', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const onAddPersonnel = jest.fn().mockRejectedValue(
        new AlreadyExistsError('Personnel', 'John Doe')
      );
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          personnel: undefined,
          onAddPersonnel,
          onUpdatePersonnel: undefined,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter name');
      await user.type(nameInput, 'John Doe');

      const addButton = screen.getByRole('button', { name: /^Add$/i });
      await user.click(addButton);

      // Wait for error message to appear
      await waitFor(() => {
        expect(screen.getByText(/already exists/i)).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });

    /**
     * @critical - Verifies ValidationError shows validation failed message
     */
    it('shows validation error message for ValidationError', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const onAddPersonnel = jest.fn().mockRejectedValue(
        new ValidationError('Personnel name cannot be empty', 'name', '')
      );
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          mode: 'create',
          personnel: undefined,
          onAddPersonnel,
          onUpdatePersonnel: undefined,
        });
      });

      const nameInput = screen.getByPlaceholderText('Enter name');
      await user.type(nameInput, 'Test');

      const addButton = screen.getByRole('button', { name: /^Add$/i });
      await user.click(addButton);

      // Wait for error message to appear
      await waitFor(() => {
        expect(screen.getByText(/Invalid input|check the form/i)).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Form Reset', () => {
    it('resets form when switching from edit to create mode', async () => {
      const { rerender } = renderWithProviders();

      expect(screen.getByDisplayValue('John Coach')).toBeInTheDocument();

      await act(async () => {
        rerender(
          <I18nextProvider i18n={i18n}>
            <PersonnelDetailsModal
              {...defaultProps}
              mode="create"
              personnel={undefined}
              onAddPersonnel={jest.fn().mockResolvedValue(undefined)}
              onUpdatePersonnel={undefined}
            />
          </I18nextProvider>
        );
      });

      expect(screen.getByPlaceholderText('Enter name')).toHaveValue('');
      expect(screen.getByPlaceholderText('Phone number')).toHaveValue('');
      expect(screen.getByPlaceholderText('Email address')).toHaveValue('');
    });

    it('loads personnel data when switching to edit mode', async () => {
      const { rerender } = renderWithProviders({
        mode: 'create',
        personnel: undefined,
        onAddPersonnel: jest.fn().mockResolvedValue(mockPersonnel),
        onUpdatePersonnel: undefined,
      });

      expect(screen.getByPlaceholderText('Enter name')).toHaveValue('');

      await act(async () => {
        rerender(
          <I18nextProvider i18n={i18n}>
            <PersonnelDetailsModal {...defaultProps} />
          </I18nextProvider>
        );
      });

      expect(screen.getByDisplayValue('John Coach')).toBeInTheDocument();
      expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
    });

    it('resets certifications when switching modes', async () => {
      const { rerender } = renderWithProviders();

      // Check certifications are displayed as chips
      expect(screen.getByText('UEFA C')).toBeInTheDocument();
      expect(screen.getByText('UEFA B')).toBeInTheDocument();

      await act(async () => {
        rerender(
          <I18nextProvider i18n={i18n}>
            <PersonnelDetailsModal
              {...defaultProps}
              mode="create"
              personnel={undefined}
              onAddPersonnel={jest.fn().mockResolvedValue(undefined)}
              onUpdatePersonnel={undefined}
            />
          </I18nextProvider>
        );
      });

      // No certification chips should be present
      expect(screen.queryByText('UEFA C')).not.toBeInTheDocument();
      expect(screen.queryByText('UEFA B')).not.toBeInTheDocument();
    });
  });
});
