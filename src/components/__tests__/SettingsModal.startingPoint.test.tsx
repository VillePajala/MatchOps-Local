/**
 * @jest-environment jsdom
 * @critical - REGRESSION, and the SECOND time this shape of bug shipped. A
 * controlled field whose value cannot round-trip through its own onChange
 * cannot be typed in at all: every keystroke is reverted on the next render.
 * It happened in GameSettingsModal (a prop that was never passed) and again
 * here (state discarded unless the venue had coordinates).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VenueInput from '@/components/VenueInput';
import type { AppSettings } from '@/types/settings';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
jest.mock('@/utils/venueSearch', () => {
  const actual = jest.requireActual('@/utils/venueSearch');
  return { ...actual, searchVenues: jest.fn(async () => []) };
});

/** SettingsModal's own wiring, reproduced exactly: state shape and handler. */
function StartingPointField({ onSave }: { onSave: jest.Mock }) {
  const [startingPoint, setStartingPoint] = React.useState<AppSettings['startingPoint']>(undefined);
  const handleChange = (venue: {
    name: string; latitude?: number; longitude?: number; address?: string;
  }) => {
    // Kept while ANY of the three has content. Requiring a name discarded an
    // address typed on its own, which is a perfectly normal order to fill two
    // fields in - and discarding it meant that field could not be typed in
    // either. Only an entirely empty venue means "no starting point".
    const hasAnything =
      Boolean(venue.name.trim()) || Boolean(venue.address?.trim()) || venue.latitude !== undefined;
    const next = hasAnything
      ? { name: venue.name, address: venue.address, latitude: venue.latitude, longitude: venue.longitude }
      : undefined;
    setStartingPoint(next);
    onSave(next);
  };
  return (
    <VenueInput
      id="starting-point"
      value={startingPoint?.name ?? ''}
      latitude={startingPoint?.latitude}
      longitude={startingPoint?.longitude}
      address={startingPoint?.address}
      hasCoordinates={startingPoint?.latitude !== undefined}
      onChange={handleChange}
    />
  );
}

const setup = () => {
  const onSave = jest.fn();
  render(<StartingPointField onSave={onSave} />);
  return {
    onSave,
    name: screen.getByLabelText(/Venue name/),
    address: screen.getByLabelText(/Street address/),
  };
};

describe('the starting point can actually be typed in', () => {
  /**
   * THE BUG. State was kept only when the venue had coordinates, so a name
   * being typed - which has none yet - was discarded on every keystroke and
   * the field reverted to empty.
   */
  it('keeps a name that has no coordinates yet', async () => {
    const { name } = setup();

    await userEvent.type(name, 'Koti');

    expect(name).toHaveValue('Koti');
  });

  it('keeps an address as it is typed', async () => {
    const { address } = setup();

    await userEvent.type(address, 'Muurarinkatu');

    expect(address).toHaveValue('Muurarinkatu');
  });

  it('saves the name, not undefined', async () => {
    const { onSave, name } = setup();

    await userEvent.type(name, 'Koti');

    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Koti' }));
  });

  /** Clearing it really does mean "no starting point". */
  it('drops the whole thing only when everything is cleared', async () => {
    const { onSave, name } = setup();

    await userEvent.type(name, 'Koti');
    await userEvent.clear(name);

    expect(onSave).toHaveBeenLastCalledWith(undefined);
  });
});

describe('only a pinned starting point can be measured from', () => {
  const { asCoordinates } = jest.requireActual('@/utils/travelPlan');

  it('gives nothing for a name the coach only typed', () => {
    expect(asCoordinates({ name: 'Koti' })).toBeNull();
  });

  it('gives the position once it is pinned', () => {
    expect(asCoordinates({ name: 'Koti', latitude: 61.87, longitude: 28.88 }))
      .toEqual({ latitude: 61.87, longitude: 28.88 });
  });

  it.each([[undefined], [null]])('copes with %p', (point) => {
    expect(asCoordinates(point as never)).toBeNull();
  });
});
