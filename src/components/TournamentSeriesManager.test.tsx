import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TournamentSeriesManager from './TournamentSeriesManager';
import { TournamentSeries } from '@/types';

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback,
  }),
}));

// Mock crypto.randomUUID for deterministic tests
const mockRandomUUID = jest.fn(() => 'test-uuid-1234');
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: mockRandomUUID },
});

describe('TournamentSeriesManager', () => {
  const mockOnSeriesChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRandomUUID.mockReturnValue('test-uuid-1234');
  });

  it('renders empty state with add button', () => {
    render(
      <TournamentSeriesManager
        series={[]}
        onSeriesChange={mockOnSeriesChange}
      />
    );

    expect(screen.getByText('Series (Competition Levels)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add series/i })).toBeInTheDocument();
  });

  it('displays existing series as chips', () => {
    const series: TournamentSeries[] = [
      { id: 's1', level: 'Elite' },
      { id: 's2', level: 'Kilpa' },
    ];

    render(
      <TournamentSeriesManager
        series={series}
        onSeriesChange={mockOnSeriesChange}
      />
    );

    expect(screen.getByText('Elite')).toBeInTheDocument();
    expect(screen.getByText('Kilpa')).toBeInTheDocument();
  });

  it('allows removing a series', async () => {
    const series: TournamentSeries[] = [
      { id: 's1', level: 'Elite' },
      { id: 's2', level: 'Kilpa' },
    ];

    render(
      <TournamentSeriesManager
        series={series}
        onSeriesChange={mockOnSeriesChange}
      />
    );

    const removeButtons = screen.getAllByRole('button', { name: /remove series/i });
    fireEvent.click(removeButtons[0]);

    expect(mockOnSeriesChange).toHaveBeenCalledWith([{ id: 's2', level: 'Kilpa' }]);
  });

  it('shows add series UI when clicking add button', async () => {
    render(
      <TournamentSeriesManager
        series={[]}
        onSeriesChange={mockOnSeriesChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add series/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /select level/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /confirm add series/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('allows adding a new series', async () => {
    render(
      <TournamentSeriesManager
        series={[]}
        onSeriesChange={mockOnSeriesChange}
      />
    );

    // Click add button
    fireEvent.click(screen.getByRole('button', { name: /add series/i }));

    // Select a level
    const select = screen.getByRole('combobox', { name: /select level/i });
    fireEvent.change(select, { target: { value: 'Elite' } });

    // Confirm add
    fireEvent.click(screen.getByRole('button', { name: /confirm add series/i }));

    await waitFor(() => {
      expect(mockOnSeriesChange).toHaveBeenCalled();
    });

    const call = mockOnSeriesChange.mock.calls[0][0];
    expect(call).toHaveLength(1);
    expect(call[0].level).toBe('Elite');
    expect(call[0].id).toContain('series_');
  });

  it('cancels adding series when cancel is clicked', async () => {
    render(
      <TournamentSeriesManager
        series={[]}
        onSeriesChange={mockOnSeriesChange}
      />
    );

    // Click add button
    fireEvent.click(screen.getByRole('button', { name: /add series/i }));

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add series/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(mockOnSeriesChange).not.toHaveBeenCalled();
  });

  it('disables add button when all levels are used', () => {
    // All 4 levels used (Elite, Kilpa, Haaste, Harraste)
    const series: TournamentSeries[] = [
      { id: 's1', level: 'Elite' },
      { id: 's2', level: 'Kilpa' },
      { id: 's3', level: 'Haaste' },
      { id: 's4', level: 'Harraste' },
    ];

    render(
      <TournamentSeriesManager
        series={series}
        onSeriesChange={mockOnSeriesChange}
      />
    );

    expect(screen.getByRole('button', { name: /add series/i })).toBeDisabled();
  });

  it('disables already-used levels in dropdown', async () => {
    const series: TournamentSeries[] = [
      { id: 's1', level: 'Elite' },
    ];

    render(
      <TournamentSeriesManager
        series={series}
        onSeriesChange={mockOnSeriesChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add series/i }));

    const select = screen.getByRole('combobox', { name: /select level/i });
    const eliteOption = select.querySelector('option[value="Elite"]') as HTMLOptionElement;

    expect(eliteOption).toBeDisabled();
  });

  it('disables confirm button when no level selected', async () => {
    render(
      <TournamentSeriesManager
        series={[]}
        onSeriesChange={mockOnSeriesChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add series/i }));

    expect(screen.getByRole('button', { name: /confirm add series/i })).toBeDisabled();
  });
});
