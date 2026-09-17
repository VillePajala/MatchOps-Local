/**
 * @jest-environment jsdom
 * @critical - the only way to pin a venue OSM carries under another name. Every
 * branch here is one a coach hits at a pitch: a map still loading, geolocation
 * refused, or a confirm that must report the exact centre.
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VenueMapPicker from '@/components/VenueMapPicker';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
jest.mock('leaflet/dist/leaflet.css', () => ({}), { virtual: true });

/** The Leaflet surface this component actually uses, and nothing more. */
const mapInstance = {
  setView: jest.fn(),
  getCenter: jest.fn(() => ({ lat: 61.87, lng: 28.88 })),
  invalidateSize: jest.fn(),
  remove: jest.fn(),
};
const tileLayer = { addTo: jest.fn() };
const mapFactory = jest.fn((..._args: unknown[]) => mapInstance);

jest.mock('leaflet', () => ({
  __esModule: true,
  default: {
    map: (...args: unknown[]) => mapFactory(...args),
    tileLayer: jest.fn(() => tileLayer),
  },
}));

const originalRAF = global.requestAnimationFrame;

beforeEach(() => {
  jest.clearAllMocks();
  mapInstance.getCenter.mockReturnValue({ lat: 61.87, lng: 28.88 });
  // The component defers invalidateSize to the next frame; run it inline so the
  // tests do not depend on real frame timing.
  global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof global.requestAnimationFrame;
});
afterEach(() => {
  global.requestAnimationFrame = originalRAF;
});

const setup = async (props: Partial<React.ComponentProps<typeof VenueMapPicker>> = {}) => {
  const onPick = jest.fn();
  const onCancel = jest.fn();
  const view = render(
    <VenueMapPicker venueName="Mitta-Keittiöt Areena" onPick={onPick} onCancel={onCancel} {...props} />,
  );
  // Leaflet is imported dynamically inside an effect.
  await act(async () => { await Promise.resolve(); });
  return { onPick, onCancel, ...view };
};

describe('the map itself', () => {
  it('opens on a known pin at a zoom that shows the pitch', async () => {
    await setup({ initialCenter: { latitude: 60.17, longitude: 24.94 } });

    const opts = mapFactory.mock.calls[0][1] as unknown as { center: number[]; zoom: number };
    expect(opts.center).toEqual([60.17, 24.94]);
    expect(opts.zoom).toBe(17);
  });

  /** A guessed town at pitch zoom drops the coach on one arbitrary street. */
  it('opens a guessed region at town zoom instead', async () => {
    await setup({ initialCenter: { latitude: 61.87, longitude: 28.88 }, centerIsApproximate: true });

    const opts = mapFactory.mock.calls[0][1] as unknown as { zoom: number };
    expect(opts.zoom).toBe(13);
  });

  it('falls back to the whole country when nothing is known', async () => {
    await setup({ initialCenter: null });

    const opts = mapFactory.mock.calls[0][1] as unknown as { center: number[]; zoom: number };
    expect(opts.center).toEqual([64.5, 26.0]);
    expect(opts.zoom).toBe(5);
  });

  /** Created inside a modal that may still be sizing - without this the tiles
   *  lay out against a zero box and the map renders as a grey stripe. */
  it('re-measures itself once laid out', async () => {
    await setup();

    expect(mapInstance.invalidateSize).toHaveBeenCalled();
  });

  it('tears the map down on unmount', async () => {
    const { unmount } = await setup();

    unmount();

    expect(mapInstance.remove).toHaveBeenCalled();
  });
});

describe('confirming', () => {
  it('reports the centre of the map, which is where the pin sits', async () => {
    const { onPick } = await setup();

    await userEvent.click(screen.getByRole('button', { name: 'Pin here' }));

    expect(onPick).toHaveBeenCalledWith({ latitude: 61.87, longitude: 28.88 });
  });

  /**
   * Leaflet arrives over the network. A confirm button that silently does
   * nothing while it loads reads as a broken app, so it says what it is doing.
   */
  it('cannot be confirmed before the map has loaded', () => {
    render(<VenueMapPicker venueName="X" onPick={jest.fn()} onCancel={jest.fn()} />);

    const button = screen.getByRole('button', { name: /Loading map/ });
    expect(button).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Pin here' })).toBeNull();
  });
});

describe('backing out', () => {
  it('cancels on Escape', async () => {
    const { onCancel } = await setup();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onCancel).toHaveBeenCalled();
  });

  it('cancels on the close button', async () => {
    const { onCancel } = await setup();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onCancel).toHaveBeenCalled();
  });
});

describe('my location', () => {
  const grant = (coords: { latitude: number; longitude: number }) => {
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (ok: PositionCallback) => ok({ coords } as GeolocationPosition) },
      configurable: true,
    });
  };
  const deny = () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail({} as GeolocationPositionError) },
      configurable: true,
    });
  };

  /** Opening a map must never prompt for permission on its own. */
  it('does not ask for a position until asked to', async () => {
    const getCurrentPosition = jest.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    await setup();

    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('moves the map to where the coach is standing', async () => {
    grant({ latitude: 61.05, longitude: 28.18 });
    await setup();

    await userEvent.click(screen.getByRole('button', { name: /My location/ }));

    await waitFor(() => expect(mapInstance.setView).toHaveBeenCalledWith([61.05, 28.18], 17));
  });

  it('says so when the position is refused, and leaves the map usable', async () => {
    deny();
    const { onPick } = await setup();

    await userEvent.click(screen.getByRole('button', { name: /My location/ }));

    await waitFor(() => expect(screen.getByText(/Could not get your location/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Pin here' }));
    expect(onPick).toHaveBeenCalled();
  });

  it('survives a browser with no geolocation at all', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    await setup();

    await userEvent.click(screen.getByRole('button', { name: /My location/ }));

    expect(screen.getByText(/Could not get your location/)).toBeInTheDocument();
  });
});

describe('attribution', () => {
  /**
   * The CSP grant for the tile host is justified by OSM's tile policy, which
   * asks for this exact credit as a link - so the link is part of the
   * justification, not decoration.
   */
  it('credits OpenStreetMap with a link to their copyright page', async () => {
    await setup();

    const link = screen.getByRole('link', { name: /OpenStreetMap contributors/ });
    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  });
});
