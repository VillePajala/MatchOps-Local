/**
 * @jest-environment jsdom
 * @critical - the escape hatch for venues OSM carries under a different name
 * than the one on the shirt. The coach's typed name must survive a map pick;
 * only the coordinates come from the map.
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VenueInput from '@/components/VenueInput';
import { searchVenues, guessRegionFor } from '@/utils/venueSearch';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
jest.mock('@/utils/venueSearch', () => ({
  searchVenues: jest.fn(),
  guessRegionFor: jest.fn(),
  venueLabel: (s: { name: string }) => s.name,
}));

/** The real picker drags in Leaflet; this stands in for its contract. */
jest.mock('@/components/VenueMapPicker', () => ({
  __esModule: true,
  default: ({ venueName, initialCenter, centerIsApproximate, onPick }: {
    venueName: string;
    initialCenter: { latitude: number; longitude: number } | null;
    centerIsApproximate?: boolean;
    onPick: (c: { latitude: number; longitude: number }) => void;
  }) => (
    <div data-testid="map-picker">
      <span data-testid="picker-name">{venueName}</span>
      <span data-testid="picker-center">{initialCenter ? `${initialCenter.latitude},${initialCenter.longitude}` : 'none'}</span>
      <span data-testid="picker-approx">{String(Boolean(centerIsApproximate))}</span>
      <button type="button" onClick={() => onPick({ latitude: 61.87, longitude: 28.88 })}>
        pin
      </button>
    </div>
  ),
}));

jest.mock('next/dynamic', () => (loader: () => Promise<unknown>) => {
  // next/dynamic is a build-time split; in a test the mocked module is enough.
  const mod = jest.requireMock('@/components/VenueMapPicker');
  void loader;
  return mod.default;
});

const mockSearch = searchVenues as jest.Mock;
const mockGuess = guessRegionFor as jest.Mock;

beforeEach(() => {
  mockSearch.mockReset().mockResolvedValue([]);
  mockGuess.mockReset().mockResolvedValue(null);
});

const setup = async (props: Partial<React.ComponentProps<typeof VenueInput>> = {}) => {
  const onChange = jest.fn();
  render(
    <VenueInput id="loc" value="Mitta-Keittiöt Areena" onChange={onChange} {...props} />,
  );
  // Let the debounced search run and come back empty.
  await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
  return { onChange };
};

describe('choosing on the map', () => {
  it('offers the map only once the search has found nothing', async () => {
    mockSearch.mockResolvedValue([
      { key: 'k', name: 'Kimpisen kenttä', context: '', town: null, latitude: 61, longitude: 28 },
    ]);
    await setup();

    expect(screen.queryByRole('button', { name: /Choose on map/ })).toBeNull();
  });

  it('offers the map when nothing was found', async () => {
    await setup();

    expect(screen.getByRole('button', { name: /Choose on map/ })).toBeInTheDocument();
  });

  /**
   * THE WHOLE POINT. The sponsor name is exactly what search cannot find and
   * exactly what the coach wants on the card, so pinning must not rename it.
   */
  it('keeps the typed name and takes only the coordinates', async () => {
    const { onChange } = await setup();

    await userEvent.click(screen.getByRole('button', { name: /Choose on map/ }));
    await waitFor(() => expect(screen.getByTestId('map-picker')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'pin' }));

    expect(onChange).toHaveBeenLastCalledWith({
      name: 'Mitta-Keittiöt Areena',
      latitude: 61.87,
      longitude: 28.88,
    });
  });

  it('shows the coach what they are pinning', async () => {
    await setup();

    await userEvent.click(screen.getByRole('button', { name: /Choose on map/ }));

    await waitFor(() =>
      expect(screen.getByTestId('picker-name')).toHaveTextContent('Mitta-Keittiöt Areena'),
    );
  });

  describe('where the map opens', () => {
    it('opens on the pin the field already has, without guessing', async () => {
      await setup({ latitude: 60.17, longitude: 24.94 });

      await userEvent.click(screen.getByRole('button', { name: /Choose on map/ }));

      await waitFor(() =>
        expect(screen.getByTestId('picker-center')).toHaveTextContent('60.17,24.94'),
      );
      expect(mockGuess).not.toHaveBeenCalled();
      // A pin we already have is the venue, so open close enough to check it.
      expect(screen.getByTestId('picker-approx')).toHaveTextContent('false');
    });

    it('guesses the region from what was typed', async () => {
      mockGuess.mockResolvedValue({ latitude: 61.87, longitude: 28.88 });
      await setup();

      await userEvent.click(screen.getByRole('button', { name: /Choose on map/ }));

      await waitFor(() =>
        expect(screen.getByTestId('picker-center')).toHaveTextContent('61.87,28.88'),
      );
      expect(mockGuess).toHaveBeenCalledWith('Mitta-Keittiöt Areena');
      // A guessed town must open at town zoom, or the coach lands on one
      // arbitrary street with no way to tell which.
      expect(screen.getByTestId('picker-approx')).toHaveTextContent('true');
    });

    /** No guess still opens a working map, just zoomed out. */
    it('opens anyway when the region cannot be guessed', async () => {
      await setup();

      await userEvent.click(screen.getByRole('button', { name: /Choose on map/ }));

      await waitFor(() => expect(screen.getByTestId('picker-center')).toHaveTextContent('none'));
    });
  });
});
