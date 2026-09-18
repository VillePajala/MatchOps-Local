/**
 * @jest-environment jsdom
 * @critical - the answer to "does the app remember the place". A venue the map
 * can never find is typed and pinned once; every match after that must offer
 * it back from the coach's own name for it, with the pin still attached.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VenueInput from '@/components/VenueInput';
import { searchVenues } from '@/utils/venueSearch';
import type { KnownVenue } from '@/utils/venueBook';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
jest.mock('@/utils/venueSearch', () => {
  const actual = jest.requireActual('@/utils/venueSearch');
  return { ...actual, searchVenues: jest.fn() };
});

const mockSearch = searchVenues as jest.Mock;

const areena: KnownVenue = {
  name: 'Mitta-Keittiöt Areena',
  latitude: 61.87,
  longitude: 28.88,
  address: 'Pihlajavedentie 1, Savonlinna',
  timesUsed: 8,
  lastUsed: '2026-09-15',
};
const kimpinen: KnownVenue = {
  name: 'Kimpisen kenttä',
  timesUsed: 2,
  lastUsed: '2026-09-01',
};

beforeEach(() => mockSearch.mockReset().mockResolvedValue([]));

const Host = ({ onChange, venues }: { onChange: jest.Mock; venues: KnownVenue[] }) => {
  const [venue, setVenue] = React.useState<{
    name: string; latitude?: number; longitude?: number; address?: string;
  }>({ name: '' });
  return (
    <VenueInput
      id="loc"
      value={venue.name}
      latitude={venue.latitude}
      longitude={venue.longitude}
      address={venue.address}
      hasCoordinates={venue.latitude !== undefined}
      knownVenues={venues}
      onChange={(v) => { onChange(v); setVenue(v); }}
    />
  );
};

const setup = (venues: KnownVenue[] = [areena, kimpinen]) => {
  const onChange = jest.fn();
  render(<Host onChange={onChange} venues={venues} />);
  return { onChange, field: screen.getByRole('combobox') };
};

/** Let the debounced map search settle, so it cannot race an assertion. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 350)); });

describe('venues the coach has already used', () => {
  /**
   * THE ASK. "Set the place once, and next time it suggests the right one even
   * if you only write Mitta-Keittiöt Areena" - a name OSM does not carry.
   */
  it('offers a venue the map could never find, from its own name', async () => {
    const { field } = setup();

    await userEvent.type(field, 'Mitta');

    expect(screen.getByText('Mitta-Keittiöt Areena')).toBeInTheDocument();
    expect(screen.getByText('Pihlajavedentie 1, Savonlinna')).toBeInTheDocument();
  });

  it('brings the pin with it, so the car button works without another search', async () => {
    const { onChange, field } = setup();

    await userEvent.type(field, 'Mitta');
    await userEvent.click(screen.getByText('Mitta-Keittiöt Areena'));

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'Mitta-Keittiöt Areena',
      latitude: 61.87,
      longitude: 28.88,
      address: 'Pihlajavedentie 1, Savonlinna',
    });
  });

  /** Local, so it beats the debounce entirely - no waiting, no network. */
  it('appears on the first character, without waiting for the map', async () => {
    const { field } = setup();

    await userEvent.type(field, 'M');

    expect(screen.getByText('Mitta-Keittiöt Areena')).toBeInTheDocument();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  /** After the first match at a pitch there should be nothing left to type. */
  it('offers the recent venues as soon as the empty field is focused', async () => {
    const { field } = setup();

    await userEvent.click(field);

    expect(screen.getByText('Mitta-Keittiöt Areena')).toBeInTheDocument();
    expect(screen.getByText('Kimpisen kenttä')).toBeInTheDocument();
  });

  it('carries a venue that never had a pin, without inventing one', async () => {
    const { onChange, field } = setup();

    await userEvent.type(field, 'Kimp');
    await userEvent.click(screen.getByText('Kimpisen kenttä'));

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'Kimpisen kenttä',
      latitude: undefined,
      longitude: undefined,
      address: undefined,
    });
  });
});

describe('alongside the map', () => {
  const mapHit = {
    key: 'k', name: 'Kisapuisto', context: 'Lappeenranta', town: 'Lappeenranta',
    address: null, latitude: 61.05, longitude: 28.18,
  };

  it('shows the coach s own venues above places from the map', async () => {
    mockSearch.mockResolvedValue([mapHit]);
    const { field } = setup();

    await userEvent.type(field, 'Kimp');
    await settle();

    expect(screen.getByText('Your venues')).toBeInTheDocument();
    expect(screen.getByText('From the map')).toBeInTheDocument();
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options[0]).toContain('Kimpisen kenttä');
  });

  /** One pitch must never appear twice, under two different names for it. */
  it('drops a map result the book already has', async () => {
    mockSearch.mockResolvedValue([{ ...mapHit, name: 'Kimpisen kenttä', town: null }]);
    const { field } = setup();

    await userEvent.type(field, 'Kimpisen');
    await settle();

    expect(screen.getAllByText('Kimpisen kenttä')).toHaveLength(1);
    expect(screen.queryByText('From the map')).toBeNull();
  });

  /**
   * "No places found" contradicts a list of the coach's own venues - the field
   * has plainly found something, and the advice to try a plainer name is
   * nonsense there.
   */
  it('never says nothing was found while offering its own venues', async () => {
    mockSearch.mockResolvedValue([]);
    const { field } = setup();

    await userEvent.type(field, 'Mitta');
    await settle();

    expect(screen.queryByText(/No places found/)).toBeNull();
    expect(screen.getByText('Mitta-Keittiöt Areena')).toBeInTheDocument();
  });

  it('still says so for a place neither the book nor the map knows', async () => {
    mockSearch.mockResolvedValue([]);
    const { field } = setup();

    await userEvent.type(field, 'Zzzzz');
    await settle();

    expect(screen.getByText(/No places found/)).toBeInTheDocument();
  });
});

describe('keyboard', () => {
  it('runs the arrow keys over both groups as one list', async () => {
    mockSearch.mockResolvedValue([]);
    const { onChange, field } = setup();

    await userEvent.click(field);
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'Mitta-Keittiöt Areena',
    }));
  });
});
