import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonnelDetailsModal from './PersonnelDetailsModal';
import { Personnel } from '@/types/personnel';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

const mockPersonnel: Personnel = {
  id: 'per1',
  name: 'John Coach',
  role: 'head_coach',
  phone: '+1234567890',
  email: 'john@example.com',
  certifications: ['UEFA A License', 'First Aid Certificate'],
  notes: 'Experienced coach',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  mode: 'edit' as const,
  personnel: mockPersonnel,
  onUpdatePersonnel: jest.fn().mockResolvedValue(undefined),
  isUpdating: false,
};

const renderWithProviders = (props: Partial<typeof defaultProps> = {}) => {
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
          onAddPersonnel: jest.fn().mockResolvedValue(undefined),
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
      expect(screen.getByPlaceholderText(/One per line/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Additional notes')).toBeInTheDocument();
    });

    it('renders role select with all options', async () => {
      await act(async () => {
        renderWithProviders();
      });

      const roleSelect = screen.getByRole('combobox');
      expect(roleSelect).toBeInTheDocument();
      expect(roleSelect.tagName).toBe('SELECT');

      const options = (roleSelect as HTMLSelectElement).options;
      expect(options.length).toBe(8);
    });

    it('renders certifications as newline-separated text', async () => {
      await act(async () => {
        renderWithProviders();
      });

      const certificationsTextarea = screen.getByPlaceholderText(/One per line/i) as HTMLTextAreaElement;
      expect(certificationsTextarea.value).toBe('UEFA A License\nFirst Aid Certificate');
    });

    it('renders empty certifications as empty textarea', async () => {
      const personnelNoCerts = { ...mockPersonnel, certifications: undefined };

      await act(async () => {
        renderWithProviders({ personnel: personnelNoCerts });
      });

      const certificationsTextarea = screen.getByPlaceholderText(/One per line/i) as HTMLTextAreaElement;
      expect(certificationsTextarea.value).toBe('');
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

      const roleSelect = screen.getByRole('combobox');
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

    it('allows editing certifications', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const certificationsTextarea = screen.getByPlaceholderText(/One per line/i);
      await user.clear(certificationsTextarea);
      await user.type(certificationsTextarea, 'New Cert 1{enter}New Cert 2{enter}New Cert 3');

      expect(certificationsTextarea).toHaveValue('New Cert 1\nNew Cert 2\nNew Cert 3');
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

  describe('Save Functionality', () => {
    it('saves changes when Save button is clicked', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(undefined);
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
      const onUpdatePersonnel = jest.fn().mockResolvedValue(undefined);
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

      const roleSelect = screen.getByRole('combobox');
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

    it('parses certifications from textarea correctly', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      const certificationsTextarea = screen.getByPlaceholderText(/One per line/i);
      await user.clear(certificationsTextarea);
      await user.type(certificationsTextarea, 'Cert A\nCert B\nCert C');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePersonnel).toHaveBeenCalledWith('per1', {
        certifications: ['Cert A', 'Cert B', 'Cert C'],
      });
    });

    it('filters out empty lines from certifications', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      const certificationsTextarea = screen.getByPlaceholderText(/One per line/i);
      await user.clear(certificationsTextarea);
      await user.type(certificationsTextarea, 'Cert A\n\n\nCert B\n  \nCert C');

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePersonnel).toHaveBeenCalledWith('per1', {
        certifications: ['Cert A', 'Cert B', 'Cert C'],
      });
    });

    it('sets certifications to undefined when textarea is empty', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          onUpdatePersonnel,
          onClose,
        });
      });

      const certificationsTextarea = screen.getByPlaceholderText(/One per line/i);
      await user.clear(certificationsTextarea);

      const saveButton = screen.getByRole('button', { name: /Save/i });
      await user.click(saveButton);

      expect(onUpdatePersonnel).toHaveBeenCalledWith('per1', {
        certifications: undefined,
      });
    });

    it('does not call onUpdatePersonnel when no changes are made', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(undefined);
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

    it('creates personnel when in create mode', async () => {
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
      await user.type(nameInput, 'New Personnel');

      const roleSelect = screen.getByRole('combobox');
      await user.selectOptions(roleSelect, 'team_manager');

      const phoneInput = screen.getByPlaceholderText('Phone number');
      await user.type(phoneInput, '+9999999999');

      const emailInput = screen.getByPlaceholderText('Email address');
      await user.type(emailInput, 'new@example.com');

      const certificationsTextarea = screen.getByPlaceholderText(/One per line/i);
      await user.type(certificationsTextarea, 'License 1\nLicense 2');

      const notesTextarea = screen.getByPlaceholderText('Additional notes');
      await user.type(notesTextarea, 'New hire');

      const addButton = screen.getByRole('button', { name: /Add/i });
      await user.click(addButton);

      expect(onAddPersonnel).toHaveBeenCalledWith({
        name: 'New Personnel',
        role: 'team_manager',
        phone: '+9999999999',
        email: 'new@example.com',
        certifications: ['License 1', 'License 2'],
        notes: 'New hire',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('trims whitespace from inputs when saving', async () => {
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
      await user.type(nameInput, '  Spaced Name  ');

      const phoneInput = screen.getByPlaceholderText('Phone number');
      await user.type(phoneInput, '  +1234567890  ');

      const addButton = screen.getByRole('button', { name: /Add/i });
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

      const addButton = screen.getByRole('button', { name: /Add/i });
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
          onAddPersonnel: jest.fn().mockResolvedValue(undefined),
          onUpdatePersonnel: undefined,
        });
      });

      const addButton = screen.getByRole('button', { name: /Add/i });
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

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose without saving changes when cancelled', async () => {
      const onUpdatePersonnel = jest.fn().mockResolvedValue(undefined);
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

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

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

      const addButton = screen.getByRole('button', { name: /Add/i });
      await user.click(addButton);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save personnel:', expect.any(Error));
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
        onAddPersonnel: jest.fn().mockResolvedValue(undefined),
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

      const certTextarea = screen.getByPlaceholderText(/One per line/i) as HTMLTextAreaElement;
      expect(certTextarea.value).toBe('UEFA A License\nFirst Aid Certificate');

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

      const certificationsTextarea = screen.getByPlaceholderText(/One per line/i) as HTMLTextAreaElement;
      expect(certificationsTextarea.value).toBe('');
    });
  });
});
