import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SeasonDetailsModal from './SeasonDetailsModal';
import { UseMutationResult } from '@tanstack/react-query';
import { Season } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

const mockMutation = () => ({
  mutate: jest.fn((data, options) => {
    // Simulate successful mutation by calling onSuccess with the data (non-null)
    if (options?.onSuccess) {
      options.onSuccess(data);
    }
  }),
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
  mode: 'edit' as const,
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

    expect(updateMutation.mutate).toHaveBeenCalled();
    const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
    expect(firstArg).toMatchObject({
      id: 's1',
      name: 'Updated Season',
      location: 'Main Stadium',
    });
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
    expect(updateMutation.mutate).toHaveBeenCalled();
    const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
    expect(firstArg).toMatchObject({
      periodCount: undefined,
    });
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

  describe('League Selection', () => {
    it('renders league dropdown with Finnish youth leagues', async () => {
      await act(async () => {
        renderWithProviders();
      });

      // Find the league dropdown by label
      const leagueLabel = screen.getByText(i18n.t('seasonDetailsModal.leagueLabel', 'League'));
      expect(leagueLabel).toBeInTheDocument();

      // Check some league options are present
      expect(screen.getByText('Valtakunnallinen SM-sarja')).toBeInTheDocument();
      expect(screen.getByText('Harrastesarja (Palloliitto)')).toBeInTheDocument();
      expect(screen.getByText('Muu (vapaa kuvaus)')).toBeInTheDocument();
    });

    it('shows custom league input when "Muu" is selected', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      // Custom league input should not be visible initially
      expect(screen.queryByPlaceholderText(i18n.t('seasonDetailsModal.customLeaguePlaceholder', 'Enter league name'))).not.toBeInTheDocument();

      // Select "Muu (vapaa kuvaus)" - find select by its label
      const leagueLabel = screen.getByText(i18n.t('seasonDetailsModal.leagueLabel', 'League'));
      const leagueSelect = leagueLabel.parentElement?.querySelector('select') as HTMLSelectElement;
      await user.selectOptions(leagueSelect, 'muu');

      // Custom league input should now be visible
      expect(screen.getByPlaceholderText(i18n.t('seasonDetailsModal.customLeaguePlaceholder', 'Enter league name'))).toBeInTheDocument();
    });

    it('clears custom league name when switching from "Muu" to another league', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      // Find select by its label
      const leagueLabel = screen.getByText(i18n.t('seasonDetailsModal.leagueLabel', 'League'));
      const leagueSelect = leagueLabel.parentElement?.querySelector('select') as HTMLSelectElement;

      // Select "Muu" and enter custom name
      await user.selectOptions(leagueSelect, 'muu');

      const customInput = screen.getByPlaceholderText(i18n.t('seasonDetailsModal.customLeaguePlaceholder', 'Enter league name'));
      await user.type(customInput, 'My Custom League');
      expect(customInput).toHaveValue('My Custom League');

      // Switch to a different league
      await user.selectOptions(leagueSelect, 'sm-sarja');

      // Custom input should be hidden
      expect(screen.queryByPlaceholderText(i18n.t('seasonDetailsModal.customLeaguePlaceholder', 'Enter league name'))).not.toBeInTheDocument();
    });

    it('saves leagueId when league is selected', async () => {
      const updateMutation = mockMutation();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          updateSeasonMutation: updateMutation as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
        });
      });

      // Find select by its label
      const leagueLabel = screen.getByText(i18n.t('seasonDetailsModal.leagueLabel', 'League'));
      const leagueSelect = leagueLabel.parentElement?.querySelector('select') as HTMLSelectElement;

      // Select a league
      await user.selectOptions(leagueSelect, 'sm-sarja');

      // Click save
      const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
      await user.click(saveButton);

      expect(updateMutation.mutate).toHaveBeenCalled();
      const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
      expect(firstArg).toMatchObject({
        leagueId: 'sm-sarja',
        customLeagueName: undefined, // Verify cleanup logic clears custom name
      });
    });

    it('saves customLeagueName when "Muu" is selected', async () => {
      const updateMutation = mockMutation();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          updateSeasonMutation: updateMutation as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
        });
      });

      // Find select by its label
      const leagueLabel = screen.getByText(i18n.t('seasonDetailsModal.leagueLabel', 'League'));
      const leagueSelect = leagueLabel.parentElement?.querySelector('select') as HTMLSelectElement;

      // Select "Muu" and enter custom name
      await user.selectOptions(leagueSelect, 'muu');

      const customInput = screen.getByPlaceholderText(i18n.t('seasonDetailsModal.customLeaguePlaceholder', 'Enter league name'));
      await user.type(customInput, 'Custom Youth League');

      // Click save
      const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
      await user.click(saveButton);

      expect(updateMutation.mutate).toHaveBeenCalled();
      const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
      expect(firstArg).toMatchObject({
        leagueId: 'muu',
        customLeagueName: 'Custom Youth League',
      });
    });

    it('loads existing leagueId when editing season with league', async () => {
      const seasonWithLeague: Season = {
        ...mockSeason,
        leagueId: 'harrastesarja',
      };

      await act(async () => {
        renderWithProviders({ season: seasonWithLeague });
      });

      // Find select by its label and verify value
      const leagueLabel = screen.getByText(i18n.t('seasonDetailsModal.leagueLabel', 'League'));
      const leagueSelect = leagueLabel.parentElement?.querySelector('select') as HTMLSelectElement;
      expect(leagueSelect.value).toBe('harrastesarja');
    });

    it('loads existing customLeagueName when editing season with custom league', async () => {
      const seasonWithCustomLeague: Season = {
        ...mockSeason,
        leagueId: 'muu',
        customLeagueName: 'My Special League',
      };

      await act(async () => {
        renderWithProviders({ season: seasonWithCustomLeague });
      });

      // Find select by its label and verify value is "muu"
      const leagueLabel = screen.getByText(i18n.t('seasonDetailsModal.leagueLabel', 'League'));
      const leagueSelect = leagueLabel.parentElement?.querySelector('select') as HTMLSelectElement;
      expect(leagueSelect.value).toBe('muu');

      // Custom name input should be visible and populated
      const customInput = screen.getByDisplayValue('My Special League');
      expect(customInput).toBeInTheDocument();
    });

    it('shows error when "Muu" is selected but custom name is empty', async () => {
      const updateMutation = mockMutation();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          updateSeasonMutation: updateMutation as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
        });
      });

      // Find and select "Muu" league
      const leagueLabel = screen.getByText(i18n.t('seasonDetailsModal.leagueLabel', 'League'));
      const leagueSelect = leagueLabel.parentElement?.querySelector('select') as HTMLSelectElement;
      await user.selectOptions(leagueSelect, 'muu');

      // Don't enter any custom league name - leave it empty

      // Click save
      const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
      await user.click(saveButton);

      // Should show error and NOT call mutation
      expect(screen.getByText(i18n.t('seasonDetailsModal.errors.customLeagueRequired', 'Please enter a custom league name or select a different league.'))).toBeInTheDocument();
      expect(updateMutation.mutate).not.toHaveBeenCalled();
    });

    it('shows error when custom league name is too short (1 character)', async () => {
      const updateMutation = mockMutation();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          updateSeasonMutation: updateMutation as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
        });
      });

      // Find and select "Muu" league
      const leagueLabel = screen.getByText(i18n.t('seasonDetailsModal.leagueLabel', 'League'));
      const leagueSelect = leagueLabel.parentElement?.querySelector('select') as HTMLSelectElement;
      await user.selectOptions(leagueSelect, 'muu');

      // Enter only 1 character (too short)
      const customInput = screen.getByPlaceholderText(i18n.t('seasonDetailsModal.customLeaguePlaceholder', 'Enter league name'));
      await user.type(customInput, 'A');

      // Click save
      const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
      await user.click(saveButton);

      // Should show error and NOT call mutation
      expect(screen.getByText(i18n.t('seasonDetailsModal.errors.customLeagueTooShort', 'Custom league name must be at least 2 characters.'))).toBeInTheDocument();
      expect(updateMutation.mutate).not.toHaveBeenCalled();
    });

    it('saves successfully when custom league name has exactly 2 characters', async () => {
      const updateMutation = mockMutation();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          updateSeasonMutation: updateMutation as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
        });
      });

      // Find and select "Muu" league
      const leagueLabel = screen.getByText(i18n.t('seasonDetailsModal.leagueLabel', 'League'));
      const leagueSelect = leagueLabel.parentElement?.querySelector('select') as HTMLSelectElement;
      await user.selectOptions(leagueSelect, 'muu');

      // Enter exactly 2 characters (minimum valid length)
      const customInput = screen.getByPlaceholderText(i18n.t('seasonDetailsModal.customLeaguePlaceholder', 'Enter league name'));
      await user.type(customInput, 'AB');

      // Click save
      const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
      await user.click(saveButton);

      // Should succeed - mutation called with the custom league name
      expect(updateMutation.mutate).toHaveBeenCalled();
      const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
      expect(firstArg).toMatchObject({
        leagueId: 'muu',
        customLeagueName: 'AB',
      });
    });
  });

  describe('Game Type Handling', () => {
    it('defaults to soccer game type for new seasons', async () => {
      const addMutation = mockMutation();
      const user = userEvent.setup();

      await act(async () => {
        render(
          <I18nextProvider i18n={i18n}>
            <SeasonDetailsModal
              isOpen={true}
              onClose={jest.fn()}
              mode="create"
              season={undefined}
              addSeasonMutation={addMutation as unknown as UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>}
            />
          </I18nextProvider>
        );
      });

      // Soccer button should be selected by default (has indigo background)
      const soccerButton = screen.getByRole('button', { name: i18n.t('common.gameTypeSoccer', 'Soccer') });
      expect(soccerButton).toHaveClass('bg-indigo-600');

      // Enter required name
      const nameInput = screen.getByPlaceholderText(i18n.t('seasonDetailsModal.namePlaceholder', 'e.g., Kevätkausi 2024'));
      await user.type(nameInput, 'Test Season');

      // Click create (not save - button text is "Create" in create mode)
      const createButton = screen.getByRole('button', { name: i18n.t('common.create', 'Create') });
      await user.click(createButton);

      // Should save with soccer as default
      expect(addMutation.mutate).toHaveBeenCalled();
      const [[firstArg]] = (addMutation.mutate as jest.Mock).mock.calls;
      expect(firstArg).toMatchObject({
        gameType: 'soccer',
      });
    });

    it('saves season with futsal game type when selected', async () => {
      const updateMutation = mockMutation();
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders({
          updateSeasonMutation: updateMutation as unknown as UseMutationResult<Season | null, Error, Season, unknown>,
        });
      });

      // Click futsal button
      const futsalButton = screen.getByRole('button', { name: i18n.t('common.gameTypeFutsal', 'Futsal') });
      await user.click(futsalButton);

      // Futsal button should now be selected
      expect(futsalButton).toHaveClass('bg-indigo-600');

      // Click save
      const saveButton = screen.getByRole('button', { name: i18n.t('common.save', 'Save') });
      await user.click(saveButton);

      // Verify mutation called with gameType: 'futsal'
      expect(updateMutation.mutate).toHaveBeenCalled();
      const [[firstArg]] = (updateMutation.mutate as jest.Mock).mock.calls;
      expect(firstArg).toMatchObject({
        gameType: 'futsal',
      });
    });

    it('loads season with existing futsal gameType and shows futsal selected', async () => {
      const seasonWithFutsal: Season = {
        ...mockSeason,
        gameType: 'futsal',
      };

      await act(async () => {
        renderWithProviders({ season: seasonWithFutsal });
      });

      // Futsal button should be selected (has indigo background)
      const futsalButton = screen.getByRole('button', { name: i18n.t('common.gameTypeFutsal', 'Futsal') });
      expect(futsalButton).toHaveClass('bg-indigo-600');

      // Soccer button should NOT be selected
      const soccerButton = screen.getByRole('button', { name: i18n.t('common.gameTypeSoccer', 'Soccer') });
      expect(soccerButton).not.toHaveClass('bg-indigo-600');
    });

    it('loads season with existing soccer gameType and shows soccer selected', async () => {
      const seasonWithSoccer: Season = {
        ...mockSeason,
        gameType: 'soccer',
      };

      await act(async () => {
        renderWithProviders({ season: seasonWithSoccer });
      });

      // Soccer button should be selected (has indigo background)
      const soccerButton = screen.getByRole('button', { name: i18n.t('common.gameTypeSoccer', 'Soccer') });
      expect(soccerButton).toHaveClass('bg-indigo-600');

      // Futsal button should NOT be selected
      const futsalButton = screen.getByRole('button', { name: i18n.t('common.gameTypeFutsal', 'Futsal') });
      expect(futsalButton).not.toHaveClass('bg-indigo-600');
    });

    it('defaults to soccer when editing season without gameType set', async () => {
      // Season without gameType (legacy data)
      const legacySeason: Season = {
        ...mockSeason,
        gameType: undefined,
      };

      await act(async () => {
        renderWithProviders({ season: legacySeason });
      });

      // Soccer should be selected by default for legacy data
      const soccerButton = screen.getByRole('button', { name: i18n.t('common.gameTypeSoccer', 'Soccer') });
      expect(soccerButton).toHaveClass('bg-indigo-600');
    });

    it('allows switching between soccer and futsal', async () => {
      const user = userEvent.setup();

      await act(async () => {
        renderWithProviders();
      });

      const soccerButton = screen.getByRole('button', { name: i18n.t('common.gameTypeSoccer', 'Soccer') });
      const futsalButton = screen.getByRole('button', { name: i18n.t('common.gameTypeFutsal', 'Futsal') });

      // Initially soccer is selected (default)
      expect(soccerButton).toHaveClass('bg-indigo-600');
      expect(futsalButton).not.toHaveClass('bg-indigo-600');

      // Click futsal
      await user.click(futsalButton);
      expect(futsalButton).toHaveClass('bg-indigo-600');
      expect(soccerButton).not.toHaveClass('bg-indigo-600');

      // Click soccer again
      await user.click(soccerButton);
      expect(soccerButton).toHaveClass('bg-indigo-600');
      expect(futsalButton).not.toHaveClass('bg-indigo-600');
    });
  });
});
