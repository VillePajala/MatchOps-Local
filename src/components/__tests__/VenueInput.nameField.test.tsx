/**
 * @jest-environment jsdom
 * @critical - the name field holds what the coach calls the place, and that is
 * all it does. It completes from their own venues and never queries the map,
 * so the box can never surprise them with places they did not ask for.
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
  address: 'Muurarinkatu 4, Savonlinna',
  timesUsed: 8,
  lastUsed: '2026-09-15',
};
const kimpinen: KnownVenue = { name: 'Kimpisen kenttä', timesUsed: 2, lastUsed: '2026-09-01' };

beforeEach(() => mockSearch.mockReset().mockResolvedValue([]));

const Host = ({ onChange, venues }: { onChange: jest.Mock; venues: KnownVenue[] }) => {
  const [v, setV] = React.useState<{
    name: string; latitude?: number; longitude?: number; address?: string;
  }>({ name: '' });
  return (
    <VenueInput
      id="loc"
      value={v.name}
      latitude={v.latitude}
      longitude={v.longitude}
      address={v.address}
      hasCoordinates={v.latitude !== undefined}
      knownVenues={venues}
      onChange={(next) => { onChange(next); setV(next); }}
    />
  );
};

const setup = (venues: KnownVenue[] = [areena, kimpinen]) => {
  const onChange = jest.fn();
  render(<Host onChange={onChange} venues={venues} />);
  return {
    onChange,
    name: screen.getByLabelText(/Venue name/),
    address: screen.getByLabelText(/Street address/),
  };
};

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 350)); });

describe('both fields are always there, and say which is which', () => {
  it('shows a name field and an address field', () => {
    const { name, address } = setup();

    expect(name).toBeInTheDocument();
    expect(address).toBeInTheDocument();
  });
});

describe('the name field', () => {
  /**
   * THE ASK. Set the place up once and type your own name for it next time -
   * a name the map does not carry and never will.
   */
  it('completes from the venues this coach has used', async () => {
    const { name } = setup();

    await userEvent.type(name, 'Mitta');

    expect(screen.getByText('Mitta-Keittiöt Areena')).toBeInTheDocument();
  });

  it('brings the address and the pin with it in one tap', async () => {
    const { onChange, name } = setup();

    await userEvent.type(name, 'Mitta');
    await userEvent.click(screen.getByText('Mitta-Keittiöt Areena'));

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'Mitta-Keittiöt Areena',
      latitude: 61.87,
      longitude: 28.88,
      address: 'Muurarinkatu 4, Savonlinna',
    });
  });

  /** Local, so it beats the debounce entirely - and works with no signal. */
  it('never queries the map', async () => {
    const { name } = setup();

    await userEvent.type(name, 'Mitta-Keittiöt Areena');
    await settle();

    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('offers the recent venues as soon as the empty field is focused', async () => {
    const { name } = setup();

    await userEvent.click(name);

    expect(screen.getByText('Mitta-Keittiöt Areena')).toBeInTheDocument();
    expect(screen.getByText('Kimpisen kenttä')).toBeInTheDocument();
  });

  it('carries a venue that never had a pin, without inventing one', async () => {
    const { onChange, name } = setup();

    await userEvent.type(name, 'Kimp');
    await userEvent.click(screen.getByText('Kimpisen kenttä'));

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'Kimpisen kenttä', latitude: undefined, longitude: undefined, address: undefined,
    });
  });

  /** Renaming a place does not move it. The pin is the other field's business. */
  it('leaves the pin alone when the name is edited', async () => {
    const { onChange, name } = setup();

    await userEvent.type(name, 'Mitta');
    await userEvent.click(screen.getByText('Mitta-Keittiöt Areena'));
    onChange.mockClear();

    await userEvent.type(screen.getByLabelText(/Venue name/), ' (iso halli)');

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'Mitta-Keittiöt Areena (iso halli)',
      latitude: 61.87,
      address: 'Muurarinkatu 4, Savonlinna',
    }));
  });

  it('picks with the keyboard', async () => {
    const { onChange, name } = setup();

    await userEvent.click(name);
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Mitta-Keittiöt Areena' }),
    );
  });
});
