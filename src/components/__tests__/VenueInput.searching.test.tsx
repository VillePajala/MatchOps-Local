/**
 * @jest-environment jsdom
 * @critical - the owner reported the field looking inert while Photon thinks.
 * A coach who sees nothing happening keeps typing, which cancels the very
 * request they were waiting for.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import VenueInput from '@/components/VenueInput';
import { searchVenues } from '@/utils/venueSearch';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
jest.mock('@/utils/venueSearch', () => ({
  searchVenues: jest.fn(),
  venueLabel: (s: { name: string }) => s.name,
}));

const mockSearch = searchVenues as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  mockSearch.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
});

const renderInput = (value: string) =>
  render(<VenueInput id="loc" value={value} onChange={jest.fn()} />);

describe('search feedback', () => {
  it('shows a spinner while the lookup is in flight', async () => {
    let release!: (v: unknown[]) => void;
    mockSearch.mockReturnValue(new Promise((res) => { release = res; }));

    renderInput('Kimpisen');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => { release([]); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  /** A field that stays spinning is as misleading as one that never spins. */
  it('stops spinning when the lookup finds nothing', async () => {
    mockSearch.mockResolvedValue([]);

    renderInput('Kimpisen');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stops spinning when results arrive', async () => {
    mockSearch.mockResolvedValue([
      { key: 'k', name: 'Kimpisen kenttä', context: 'Lappeenranta', latitude: 61, longitude: 28 },
    ]);

    renderInput('Kimpisen');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  /**
   * The owner searched a sponsor name ("Mitta-Keittiöt Areena") that OSM does
   * not carry. Silence made that look like a failure rather than an answer.
   */
  it('says so when nothing is found', async () => {
    mockSearch.mockResolvedValue([]);

    renderInput('Mitta-Keittiöt Areena');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(screen.getByText(/No places found/)).toBeInTheDocument();
  });

  it('says nothing about emptiness while still searching', async () => {
    mockSearch.mockReturnValue(new Promise(() => {}));

    renderInput('Mitta-Keittiöt Areena');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(screen.queryByText(/No places found/)).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not claim emptiness once results exist', async () => {
    mockSearch.mockResolvedValue([
      { key: 'k', name: 'Jäähalli Monrepos', context: 'Savonlinna', latitude: 61, longitude: 28 },
    ]);

    renderInput('jäähalli Savonlinna');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(screen.queryByText(/No places found/)).toBeNull();
  });

  /** Too short to search means nothing should appear to be happening. */
  it('does not spin for a query too short to search', async () => {
    renderInput('Ki');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/No places found/)).toBeNull();
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
