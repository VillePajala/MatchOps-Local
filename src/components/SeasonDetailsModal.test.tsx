import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeasonDetailsModal from './SeasonDetailsModal';
import { UseMutationResult } from '@tanstack/react-query';
import { Season } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

const mockMutation = () => ({
  mutate: jest.fn(),
  isPending: false,
});

const mockSeason: Season = {
  id: 's1',
  name: 'Spring Season 2024',
  location: 'Main Stadium',
  ageGroup: 'U10',
  periodCount: 2,
  periodDuration: 20,
  startDate: '2024-03-01',
  endDate: '2024-06-01',
  notes: 'Main season notes',
  color: '#3B82F6',
  badge: '⭐',
  archived: false,
};

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  season: mockSeason,
  updateSeasonMutation: mockMutation() as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
  stats: { games: 15, goals: 42 },
};

const renderWithProviders = (props: Partial<typeof defaultProps> = {}) => {
  return render(
    <I18nextProvider i18n={i18n}>
      <SeasonDetailsModal {...defaultProps} {...props} />
    </I18nextProvider>
  );
};

describe('SeasonDetailsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders season details when open', async () => {
    await act(async () => {
      renderWithProviders();
    });

    expect(screen.getByDisplayValue('Spring Season 2024')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Main Stadium')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Main season notes')).toBeInTheDocument();
  });

  it('displays statistics when provided', async () => {
    await act(async () => {
      renderWithProviders();
    });

    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    renderWithProviders({ isOpen: false });

    expect(screen.queryByDisplayValue('Spring Season 2024')).not.toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders({ onClose });
    });

    const cancelButton = screen.getByRole('button', { name: i18n.t('common.cancel', 'Cancel') });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows editing season name', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    const nameInput = screen.getByDisplayValue('Spring Season 2024');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Season Name');

    expect(screen.getByDisplayValue('Updated Season Name')).toBeInTheDocument();
  });

  it('allows editing all season fields', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    // Edit location
    const locationInput = screen.getByDisplayValue('Main Stadium');
    await user.clear(locationInput);
    await user.type(locationInput, 'New Stadium');

    // Edit age group
    const ageGroupSelect = screen.getByDisplayValue('U10');
    await user.selectOptions(ageGroupSelect, 'U12');

    // Edit period count
    const periodCountInput = screen.getByDisplayValue('2');
    await user.clear(periodCountInput);
    await user.type(periodCountInput, '1');

    // Edit notes
    const notesTextarea = screen.getByDisplayValue('Main season notes');
    await user.clear(notesTextarea);
    await user.type(notesTextarea, 'Updated notes');

    expect(screen.getByDisplayValue('New Stadium')).toBeInTheDocument();
    expect(screen.getByDisplayValue('U12')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Updated notes')).toBeInTheDocument();
  });

  it('saves changes when Save button is clicked', async () => {
    const updateMutation = mockMutation();
    const onClose = jest.fn();
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders({
        updateSeasonMutation: updateMutation as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
        onClose,
      });
    });

    // Edit the name
    const nameInput = screen.getByDisplayValue('Spring Season 2024');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Season');

    // Click save
    const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
    await user.click(saveButton);

    expect(updateMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 's1',
        name: 'Updated Season',
        location: 'Main Stadium',
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables Save button when name is empty', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    const nameInput = screen.getByDisplayValue('Spring Season 2024');
    await user.clear(nameInput);

    const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
    expect(saveButton).toBeDisabled();
  });

  it('handles archived checkbox toggle', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    const archivedCheckbox = screen.getByRole('checkbox', { name: i18n.t('seasonDetailsModal.archivedLabel', 'Archived') });
    expect(archivedCheckbox).not.toBeChecked();

    await user.click(archivedCheckbox);
    expect(archivedCheckbox).toBeChecked();
  });

  it('handles date inputs correctly', async () => {
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders();
    });

    const startDateInput = screen.getByDisplayValue('2024-03-01');
    await user.clear(startDateInput);
    await user.type(startDateInput, '2024-04-01');

    const endDateInput = screen.getByDisplayValue('2024-06-01');
    await user.clear(endDateInput);
    await user.type(endDateInput, '2024-07-01');

    expect(screen.getByDisplayValue('2024-04-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2024-07-01')).toBeInTheDocument();
  });

  it('sanitizes period values when saving', async () => {
    const updateMutation = mockMutation();
    const user = userEvent.setup();

    await act(async () => {
      renderWithProviders({
        updateSeasonMutation: updateMutation as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
      });
    });

    // Set invalid period count (not 1 or 2)
    const periodCountInput = screen.getByDisplayValue('2');
    await user.clear(periodCountInput);
    await user.type(periodCountInput, '3');

    // Click save
    const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
    await user.click(saveButton);

    // Period count should be sanitized to undefined (invalid value)
    expect(updateMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        periodCount: undefined,
      })
    );
  });

  it('does not render when season is null', () => {
    renderWithProviders({ season: undefined });

    expect(screen.queryByDisplayValue('Spring Season 2024')).not.toBeInTheDocument();
  });

  it('initializes form with season data when season changes', async () => {
    const { rerender } = renderWithProviders();

    const newSeason: Season = {
      id: 's2',
      name: 'Winter Season 2024',
      location: 'Ice Arena',
      ageGroup: 'U14',
      periodCount: 1,
      periodDuration: 25,
      archived: true,
    };

    await act(async () => {
      rerender(
        <I18nextProvider i18n={i18n}>
          <SeasonDetailsModal
            {...defaultProps}
            season={newSeason}
          />
        </I18nextProvider>
      );
    });

    expect(screen.getByDisplayValue('Winter Season 2024')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ice Arena')).toBeInTheDocument();
    expect(screen.getByDisplayValue('U14')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('25')).toBeInTheDocument();
  });
});
