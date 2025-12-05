import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import ImportResultsModal from './ImportResultsModal';

const renderWithI18n = (component: React.ReactElement) => {
  return render(<I18nextProvider i18n={i18n}>{component}</I18nextProvider>);
};

const mockImportResult = {
  successful: 5,
  skipped: 2,
  failed: [
    { gameId: 'game_123', error: 'Invalid data format' },
    { gameId: 'game_456', error: 'Missing required fields' }
  ],
  warnings: ['Some players were not found in roster', 'Tournament data incomplete']
};

describe('ImportResultsModal', () => {
  beforeEach(() => {
    // Mock i18n translations
     
    (jest.spyOn(i18n, 't') as any).mockImplementation((key: string, options?: any) => {
      const translations: Record<string, string> = {
        'importResults.title': 'Import Results',
        'importResults.importing': 'Importing Games',
        'importResults.processing': 'Processing games, please wait...',
        'importResults.summary': 'Import Summary',
        'importResults.successful': 'Successful',
        'importResults.skipped': 'Skipped',
        'importResults.failed': 'Failed',
        'importResults.successRate': 'Success Rate',
        'importResults.warnings': 'Warnings',
        'importResults.failedImports': 'Failed Imports',
        'importResults.successMessage': `Successfully imported ${options?.count || 0} games. ${options?.skipped || 0} games were skipped as they already exist.`,
        'importResults.noResults': 'No import results available.',
        'common.processing': 'Processing...',
        'common.close': 'Close',
        'common.doneButton': 'Done'
      };
      return translations[key] || key;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    renderWithI18n(
      <ImportResultsModal
        isOpen={false}
        onClose={() => {}}
        importResult={mockImportResult}
      />
    );
    
    expect(screen.queryByText('Import Results')).not.toBeInTheDocument();
  });

  it('renders loading state when importing', () => {
    renderWithI18n(
      <ImportResultsModal
        isOpen={true}
        onClose={() => {}}
        importResult={null}
        isImporting={true}
      />
    );
    
    expect(screen.getByText('Importing Games')).toBeInTheDocument();
    expect(screen.getByText('Processing games, please wait...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
  });

  it('renders import results when completed', () => {
    renderWithI18n(
      <ImportResultsModal
        isOpen={true}
        onClose={() => {}}
        importResult={mockImportResult}
      />
    );
    
    expect(screen.getByText('Import Results')).toBeInTheDocument();
    expect(screen.getByText('Import Summary')).toBeInTheDocument();
    
    // Check statistics
    expect(screen.getByText('5')).toBeInTheDocument(); // successful
    expect(screen.getAllByText('2')).toHaveLength(2); // skipped and failed both show 2
    expect(screen.getByText('56%')).toBeInTheDocument(); // success rate (5/9 * 100)
    
    // Check labels
    expect(screen.getByText('Successful')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('displays warnings when present', () => {
    renderWithI18n(
      <ImportResultsModal
        isOpen={true}
        onClose={() => {}}
        importResult={mockImportResult}
      />
    );
    
    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.getByText('• Some players were not found in roster')).toBeInTheDocument();
    expect(screen.getByText('• Tournament data incomplete')).toBeInTheDocument();
  });

  it('displays failed imports when present', () => {
    renderWithI18n(
      <ImportResultsModal
        isOpen={true}
        onClose={() => {}}
        importResult={mockImportResult}
      />
    );
    
    expect(screen.getByText('Failed Imports (2)')).toBeInTheDocument();
    expect(screen.getByText('game_123')).toBeInTheDocument();
    expect(screen.getByText('Invalid data format')).toBeInTheDocument();
    expect(screen.getByText('game_456')).toBeInTheDocument();
    expect(screen.getByText('Missing required fields')).toBeInTheDocument();
  });

  it('displays success message for perfect import', () => {
    const perfectResult = {
      successful: 3,
      skipped: 1,
      failed: [],
      warnings: []
    };

    renderWithI18n(
      <ImportResultsModal
        isOpen={true}
        onClose={() => {}}
        importResult={perfectResult}
      />
    );
    
    expect(screen.getByText('Successfully imported 3 games. 1 games were skipped as they already exist.')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onCloseMock = jest.fn();

    renderWithI18n(
      <ImportResultsModal
        isOpen={true}
        onClose={onCloseMock}
        importResult={mockImportResult}
      />
    );

    fireEvent.click(screen.getByText('Done'));

    await waitFor(() => {
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onCloseMock = jest.fn();
    
    renderWithI18n(
      <ImportResultsModal
        isOpen={true}
        onClose={onCloseMock}
        importResult={mockImportResult}
      />
    );
    
    // Click the backdrop (the modal container with backdrop click handler)
    const backdrop = screen.getByRole('dialog').parentElement;
    if (backdrop) {
      fireEvent.click(backdrop);
    }
    
    await waitFor(() => {
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  it('renders no results message when importResult is null', () => {
    renderWithI18n(
      <ImportResultsModal
        isOpen={true}
        onClose={() => {}}
        importResult={null}
      />
    );
    
    expect(screen.getByText('No import results available.')).toBeInTheDocument();
  });

  it('calculates correct success rate', () => {
    const customResult = {
      successful: 7,
      skipped: 1,
      failed: [{ gameId: 'test', error: 'test error' }],
      warnings: []
    };
    
    renderWithI18n(
      <ImportResultsModal
        isOpen={true}
        onClose={() => {}}
        importResult={customResult}
      />
    );
    
    // 7 successful out of 9 total = 78% (rounded)
    expect(screen.getByText('78%')).toBeInTheDocument();
  });
});