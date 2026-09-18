/**
 * @jest-environment jsdom
 * @critical - a venue has two names: the one the map knows and the one the
 * coach says. Renaming a pinned venue must keep the pin, and the pinned
 * address must stay visible so the two can never drift apart unseen.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VenueInput from '@/components/VenueInput';
import { searchVenues } from '@/utils/venueSearch';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
jest.mock('@/utils/venueSearch', () => {
  const actual = jest.requireActual('@/utils/venueSearch');
  return { ...actual, searchVenues: jest.fn() };
});

const mockSearch = searchVenues as jest.Mock;

beforeEach(() => mockSearch.mockReset().mockResolvedValue([]));

/** A controlled host, because the field is controlled. */
const Host = ({ onChange, initial = '', ...rest }: {
  onChange: jest.Mock;
  initial?: string;
} & Partial<React.ComponentProps<typeof VenueInput>>) => {
  const [venue, setVenue] = React.useState<{
    name: string; latitude?: number; longitude?: number; address?: string;
  }>({ name: initial, ...rest });
  return (
    <VenueInput
      id="loc"
      value={venue.name}
      latitude={venue.latitude}
      longitude={venue.longitude}
      address={venue.address}
      hasCoordinates={venue.latitude !== undefined}
      onChange={(v) => { onChange(v); setVenue(v); }}
    />
  );
};

const pinned = {
  initial: 'Pihlajavedentie 1, Savonlinna',
  latitude: 61.87,
  longitude: 28.88,
  address: 'Pihlajavedentie 1, Savonlinna',
};

const setup = (over: Partial<React.ComponentProps<typeof Host>> = {}) => {
  const onChange = jest.fn();
  render(<Host onChange={onChange} {...pinned} {...over} />);
  return { onChange };
};

/** Typing fires one onChange per character; assert on the final state. */
const rename = async (to: string) => {
  const field = screen.getByRole('combobox');
  await userEvent.clear(field);
  await userEvent.type(field, to);
  await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
};

describe('renaming a pinned venue', () => {
  /**
   * THE POINT. OSM carries "Pihlajavedentie 1" and never "Mitta-Keittiöt
   * Areena", so a pinned venue that can only be called what the map calls it
   * is a venue the coach cannot name.
   */
  it('keeps the pin when the venue is renamed', async () => {
    const { onChange } = setup();

    await rename('Mitta-Keittiöt Areena');

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'Mitta-Keittiöt Areena',
      latitude: 61.87,
      longitude: 28.88,
      address: 'Pihlajavedentie 1, Savonlinna',
    });
  });

  /**
   * The pin is its own row WHENEVER there is one, not only once the name has
   * diverged from it. Hiding it while the two happened to match is what made
   * the pin invisible, and an invisible pin is one the coach cannot tell is
   * there, cannot change, and cannot believe survives an edit.
   */
  it('shows what is pinned from the moment there is a pin', () => {
    setup();

    expect(screen.getByText('Pihlajavedentie 1, Savonlinna')).toBeInTheDocument();
  });

  it('keeps showing it after the venue is renamed', async () => {
    setup();

    await rename('Mitta-Keittiöt Areena');

    expect(screen.getByText('Pihlajavedentie 1, Savonlinna')).toBeInTheDocument();
  });

  it('says nothing about a pin when there is none', () => {
    setup({ latitude: undefined, longitude: undefined, address: undefined, initial: 'Kentän laita' });

    expect(screen.queryByRole('button', { name: /Remove the pinned/ })).toBeNull();
  });
});

describe('dropping the pin', () => {
  /**
   * Emptying the field does NOT drop it. Select-all-and-retype is how people
   * rename, and it passes through empty on the way - dropping the pin there
   * destroys it in the middle of the gesture this whole feature exists for.
   */
  it('survives the field being emptied', async () => {
    const { onChange } = setup();

    await userEvent.clear(screen.getByRole('combobox'));

    expect(onChange).toHaveBeenLastCalledWith({
      name: '',
      latitude: 61.87,
      longitude: 28.88,
      address: 'Pihlajavedentie 1, Savonlinna',
    });
  });

  it('is visible and removable while the field is empty', async () => {
    setup();

    await userEvent.clear(screen.getByRole('combobox'));

    expect(screen.getByText('Pihlajavedentie 1, Savonlinna')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove the pinned/ })).toBeInTheDocument();
  });

  it('can be removed explicitly while the name is kept', async () => {
    const { onChange } = setup();
    await rename('Mitta-Keittiöt Areena');

    await userEvent.click(screen.getByRole('button', { name: /Remove the pinned/ }));

    expect(onChange).toHaveBeenLastCalledWith({ name: 'Mitta-Keittiöt Areena' });
  });

  it('stops showing the address once the pin is removed', async () => {
    setup();
    await rename('Mitta-Keittiöt Areena');

    await userEvent.click(screen.getByRole('button', { name: /Remove the pinned/ }));

    expect(screen.queryByText('Pihlajavedentie 1, Savonlinna')).toBeNull();
  });
});
