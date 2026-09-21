/**
 * @jest-environment jsdom
 * @critical - the address field is the only thing here that searches the map,
 * and picking from it is what makes directions exact rather than a text search
 * a map has to guess at. It must never rewrite a name the coach has given.
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

/** What Photon returns for the owner's real address. */
const muurarinkatu = {
  key: 'm', name: 'Muurarinkatu 4', context: 'Savonlinna', town: 'Savonlinna',
  address: 'Muurarinkatu 4', latitude: 61.87, longitude: 28.88,
};
/** A venue the map knows by its own name. */
const kimpinen = {
  key: 'k', name: 'Kimpisen kenttä', context: 'Pohjolankatu 1, Lappeenranta',
  town: 'Lappeenranta', address: 'Pohjolankatu 1', latitude: 61.05, longitude: 28.18,
};

beforeEach(() => mockSearch.mockReset().mockResolvedValue([]));

const Host = ({ onChange, initialName }: { onChange: jest.Mock; initialName: string }) => {
  const [v, setV] = React.useState<{
    name: string; latitude?: number; longitude?: number; address?: string;
  }>({ name: initialName });
  return (
    <VenueInput
      id="loc"
      value={v.name}
      latitude={v.latitude}
      longitude={v.longitude}
      address={v.address}
      hasCoordinates={v.latitude !== undefined}
      onChange={(next) => { onChange(next); setV(next); }}
    />
  );
};

const setup = (initialName = '') => {
  const onChange = jest.fn();
  render(<Host onChange={onChange} initialName={initialName} />);
  return { onChange, address: screen.getByLabelText(/Street address/) };
};

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 350)); });

describe('finding the place', () => {
  it('searches the map for what is typed', async () => {
    mockSearch.mockResolvedValue([muurarinkatu]);
    const { address } = setup();

    await userEvent.type(address, 'Muurarinkatu 4');
    await settle();

    expect(screen.getByText('Muurarinkatu 4, Savonlinna')).toBeInTheDocument();
  });

  it('attaches the position when a result is picked', async () => {
    mockSearch.mockResolvedValue([muurarinkatu]);
    const { onChange, address } = setup('Mitta-Keittiöt Areena');

    await userEvent.type(address, 'Muurarinkatu 4');
    await settle();
    await userEvent.click(screen.getByText('Muurarinkatu 4, Savonlinna'));

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'Mitta-Keittiöt Areena',
      latitude: 61.87,
      longitude: 28.88,
      address: 'Muurarinkatu 4, Savonlinna',
    });
  });

  /**
   * OSM has no house numbers for many Finnish streets: "Puusepänkatu 1" comes
   * back as the street alone. The number the coach typed is what they meant;
   * the street pin only marks where the map thinks the street is.
   */
  it('keeps a typed house number when the lookup found only the street', async () => {
    mockSearch.mockResolvedValue([{
      key: 'p', name: 'Puusepänkatu', context: 'Savonlinna', town: 'Savonlinna',
      address: 'Puusepänkatu', latitude: 61.8735, longitude: 28.8676,
    }]);
    const { onChange, address } = setup('Mitta-Keittiöt Areena');

    await userEvent.type(address, 'Puusepänkatu 1');
    await settle();
    await userEvent.click(screen.getByText('Puusepänkatu, Savonlinna'));

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'Mitta-Keittiöt Areena',
      latitude: 61.8735,
      longitude: 28.8676,
      address: 'Puusepänkatu 1, Savonlinna',
    });
  });

  /**
   * THE MISTAKE THIS DESIGN EXISTS TO PREVENT. The coach has already said what
   * the place is called; an address search must never take that away.
   */
  it('never overwrites a name the coach has given', async () => {
    mockSearch.mockResolvedValue([kimpinen]);
    const { onChange, address } = setup('Mitta-Keittiöt Areena');

    await userEvent.type(address, 'Kimpisen');
    await settle();
    await userEvent.click(screen.getByText('Pohjolankatu 1, Lappeenranta'));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Mitta-Keittiöt Areena' }),
    );
  });

  /** But a coach who has not named it yet gets the venue's own name free. */
  it('fills an empty name with the place it found', async () => {
    mockSearch.mockResolvedValue([kimpinen]);
    const { onChange, address } = setup('');

    await userEvent.type(address, 'Kimpisen');
    await settle();
    await userEvent.click(screen.getByText('Pohjolankatu 1, Lappeenranta'));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Kimpisen kenttä', latitude: 61.05 }),
    );
  });

  it('says so when the address matches nothing', async () => {
    mockSearch.mockResolvedValue([]);
    const { address } = setup();

    await userEvent.type(address, 'Zzzzzz 99');
    await settle();

    expect(screen.getByText(/No match for that address/)).toBeInTheDocument();
  });

  it('does not search a query too short to mean anything', async () => {
    const { address } = setup();

    await userEvent.type(address, 'Mu');
    await settle();

    expect(mockSearch).not.toHaveBeenCalled();
  });
});

describe('the pin comes from picking, not typing', () => {
  const pinned = async () => {
    mockSearch.mockResolvedValue([muurarinkatu]);
    const { onChange, address } = setup('Mitta-Keittiöt Areena');
    await userEvent.type(address, 'Muurarinkatu 4');
    await settle();
    await userEvent.click(screen.getByText('Muurarinkatu 4, Savonlinna'));
    onChange.mockClear();
    return { onChange };
  };

  it('says the directions are exact once one is picked', async () => {
    await pinned();

    expect(screen.getByText(/Directions will go straight here/)).toBeInTheDocument();
  });

  /** Says what picking is FOR, before the coach has done it. */
  it('explains why picking matters, before anything is pinned', () => {
    setup();

    expect(screen.getByText(/Pick one from the list to get exact directions/)).toBeInTheDocument();
  });

  /**
   * Editing the address is searching again, so the old position no longer
   * describes it. Safe here precisely because this box is never used to name
   * anything - unlike the field above it.
   */
  it('drops the position when the address is edited afterwards', async () => {
    const { onChange } = await pinned();

    await userEvent.type(screen.getByLabelText(/Street address/), '5');

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'Mitta-Keittiöt Areena',
      address: 'Muurarinkatu 4, Savonlinna5',
    });
  });

  it('does not re-search the address it just pinned', async () => {
    await pinned();
    mockSearch.mockClear();

    await settle();

    expect(mockSearch).not.toHaveBeenCalled();
  });
});
