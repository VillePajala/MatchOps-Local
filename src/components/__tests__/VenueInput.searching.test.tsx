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

/**
 * The spinner, named rather than guessed at. Both the spinner and the "nothing
 * found" message are live regions - they have to be, or a screen reader learns
 * about neither - so role alone matches both and would let a spinner assertion
 * pass on the wrong element.
 */
const spinner = () => screen.queryByRole('status', { name: /searching/i });

describe('search feedback', () => {
  it('shows a spinner while the lookup is in flight', async () => {
    let release!: (v: unknown[]) => void;
    mockSearch.mockReturnValue(new Promise((res) => { release = res; }));

    renderInput('Kimpisen');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(spinner()).toBeInTheDocument();

    await act(async () => { release([]); });
    expect(spinner()).toBeNull();
  });

  /** A field that stays spinning is as misleading as one that never spins. */
  it('stops spinning when the lookup finds nothing', async () => {
    mockSearch.mockResolvedValue([]);

    renderInput('Kimpisen');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(spinner()).toBeNull();
  });

  it('stops spinning when results arrive', async () => {
    mockSearch.mockResolvedValue([
      { key: 'k', name: 'Kimpisen kenttä', context: 'Lappeenranta', town: null, address: null, latitude: 61, longitude: 28 },
    ]);

    renderInput('Kimpisen');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(spinner()).toBeNull();
  });

  /**
   * Arriving results no longer open the list on their own. A field can be
   * filled without the coach touching it - a competition prefills its own
   * location - and popping a dropdown over a form nobody is typing in is
   * wrong. Focus and typing open it; picking, Escape and a tap outside close
   * it.
   */
  it('does not open the list over a field the coach has not touched', async () => {
    mockSearch.mockResolvedValue([
      { key: 'k', name: 'Kimpisen kenttä', context: 'Lappeenranta', town: null, address: null, latitude: 61, longitude: 28 },
    ]);

    renderInput('Kimpisen');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens the list once the field is focused', async () => {
    mockSearch.mockResolvedValue([
      { key: 'k', name: 'Kimpisen kenttä', context: 'Lappeenranta', town: null, address: null, latitude: 61, longitude: 28 },
    ]);

    renderInput('Kimpisen');
    await act(async () => { jest.advanceTimersByTime(400); });
    await act(async () => { screen.getByRole('combobox').focus(); });

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

    expect(screen.getByText(/No place of that name/)).toBeInTheDocument();
  });

  it('says nothing about emptiness while still searching', async () => {
    mockSearch.mockReturnValue(new Promise(() => {}));

    renderInput('Mitta-Keittiöt Areena');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(screen.queryByText(/No place of that name/)).toBeNull();
    expect(spinner()).toBeInTheDocument();
  });

  it('does not claim emptiness once results exist', async () => {
    mockSearch.mockResolvedValue([
      { key: 'k', name: 'Jäähalli Monrepos', context: 'Savonlinna', latitude: 61, longitude: 28 },
    ]);

    renderInput('jäähalli Savonlinna');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(screen.queryByText(/No place of that name/)).toBeNull();
  });

  /** Too short to search means nothing should appear to be happening. */
  it('does not spin for a query too short to search', async () => {
    renderInput('Ki');
    await act(async () => { jest.advanceTimersByTime(400); });

    expect(spinner()).toBeNull();
    expect(screen.queryByText(/No place of that name/)).toBeNull();
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
