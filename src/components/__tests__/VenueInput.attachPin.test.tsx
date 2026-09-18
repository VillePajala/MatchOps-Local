/**
 * @jest-environment jsdom
 * @critical - the separation the owner asked for. The field means "what I call
 * this place" and nothing else; the pin is attached by its own control and can
 * never be disturbed by editing the name.
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
  key: 'm', name: 'Muurarinkatu 4', context: 'Savonlinna',
  town: 'Savonlinna', address: 'Muurarinkatu 4',
  latitude: 61.87, longitude: 28.88,
};

beforeEach(() => mockSearch.mockReset().mockResolvedValue([]));

const Host = ({ onChange, initial }: { onChange: jest.Mock; initial: string }) => {
  const [venue, setVenue] = React.useState<{
    name: string; latitude?: number; longitude?: number; address?: string;
  }>({ name: initial });
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

const setup = (initial = 'Mitta-Keittiöt Areena') => {
  const onChange = jest.fn();
  render(<Host onChange={onChange} initial={initial} />);
  return { onChange };
};

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 350)); });

describe('attaching a pin', () => {
  it('offers the control once the place has a name', () => {
    setup();

    expect(screen.getByRole('button', { name: /Attach a location by address/ })).toBeInTheDocument();
  });

  /** Attaching a location to nothing is meaningless. */
  it('offers nothing while the field is empty', () => {
    setup('');

    expect(screen.queryByRole('button', { name: /Attach a location by address/ })).toBeNull();
  });

  /**
   * THE WHOLE POINT. The coach has already said what the place is called; this
   * control answers only WHERE it is, and must not touch the name.
   */
  it('sets the pin and leaves the name exactly as typed', async () => {
    mockSearch.mockResolvedValue([muurarinkatu]);
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: /Attach a location by address/ }));
    await userEvent.type(screen.getByLabelText(/Find it by street address/), 'Muurarinkatu 4');
    await settle();
    await userEvent.click(screen.getByText('Muurarinkatu 4, Savonlinna'));

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'Mitta-Keittiöt Areena',
      latitude: 61.87,
      longitude: 28.88,
      address: 'Muurarinkatu 4, Savonlinna',
    });
  });

  it('searches in its own box, not the name box', async () => {
    mockSearch.mockResolvedValue([muurarinkatu]);
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: /Attach a location by address/ }));
    await userEvent.type(screen.getByLabelText(/Find it by street address/), 'Muurarinkatu 4');
    await settle();

    // Typing an address must never have rewritten the venue's name.
    expect(screen.getByRole('combobox')).toHaveValue('Mitta-Keittiöt Areena');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes without attaching anything when cancelled', async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: /Attach a location by address/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText(/Find it by street address/)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says so when the address matches nothing', async () => {
    mockSearch.mockResolvedValue([]);
    setup();

    await userEvent.click(screen.getByRole('button', { name: /Attach a location by address/ }));
    await userEvent.type(screen.getByLabelText(/Find it by street address/), 'Zzzzzz 99');
    await settle();

    expect(screen.getByText(/No match for that address/)).toBeInTheDocument();
  });
});

describe('once a pin is attached', () => {
  const pinned = async () => {
    mockSearch.mockResolvedValue([muurarinkatu]);
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: /Attach a location by address/ }));
    await userEvent.type(screen.getByLabelText(/Find it by street address/), 'Muurarinkatu 4');
    await settle();
    await userEvent.click(screen.getByText('Muurarinkatu 4, Savonlinna'));
    onChange.mockClear();
    return { onChange };
  };

  it('replaces the attach button with the pinned address', async () => {
    await pinned();

    expect(screen.getByText('Muurarinkatu 4, Savonlinna')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Attach a location by address/ })).toBeNull();
  });

  it('can be changed for a different one', async () => {
    const { onChange } = await pinned();
    mockSearch.mockResolvedValue([{ ...muurarinkatu, key: 'o', address: 'Olavinkatu 1', latitude: 61.86, longitude: 28.87 }]);

    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.type(screen.getByLabelText(/Find it by street address/), 'Olavinkatu 1');
    await settle();
    await userEvent.click(screen.getByText('Olavinkatu 1, Savonlinna'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'Mitta-Keittiöt Areena',
      latitude: 61.86,
      address: 'Olavinkatu 1, Savonlinna',
    }));
  });

  it('can be removed without losing the name', async () => {
    const { onChange } = await pinned();

    await userEvent.click(screen.getByRole('button', { name: /Remove the pinned location/ }));

    expect(onChange).toHaveBeenLastCalledWith({ name: 'Mitta-Keittiöt Areena' });
  });

  /** Editing the name is not a search for a new place, and never was. */
  it('survives the name being edited afterwards', async () => {
    const { onChange } = await pinned();

    await userEvent.type(screen.getByRole('combobox'), ' (iso halli)');
    await settle();

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'Mitta-Keittiöt Areena (iso halli)',
      latitude: 61.87,
      address: 'Muurarinkatu 4, Savonlinna',
    }));
  });
});
