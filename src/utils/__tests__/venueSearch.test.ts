/**
 * @critical - this runs on every keystroke behind a form the coach is filling
 * in at a pitch. It must never throw, never block, and never leave them without
 * a working text box, whatever the network or the endpoint does.
 */
import { searchVenues, venueLabel } from '../venueSearch';

const feature = (over: Record<string, unknown> = {}) => ({
  geometry: { coordinates: [28.1887, 61.0583] },
  properties: { name: 'Kimpisen kenttä', city: 'Lappeenranta', state: 'Etelä-Karjala', ...over },
});

const respondWith = (body: unknown, ok = true) => {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => body }) as unknown as typeof fetch;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('searchVenues', () => {
  it('maps a Photon feature to a suggestion', async () => {
    respondWith({ features: [feature()] });

    const [first] = await searchVenues('Kimpisen');

    expect(first.name).toBe('Kimpisen kenttä');
    expect(first.context).toBe('Lappeenranta, Etelä-Karjala');
    // Photon gives lon,lat - the order is the classic way to put a Finnish
    // pitch in the Indian Ocean, so it is pinned here.
    expect(first.latitude).toBe(61.0583);
    expect(first.longitude).toBe(28.1887);
  });

  /** One or two letters match half of Finland and cost a request to say so. */
  it.each([[''], ['a'], ['ki'], ['  ']])('does not call the API for %p', async (q) => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(searchVenues(q)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks Photon in the local language, biased to Finland', async () => {
    respondWith({ features: [] });

    await searchVenues('Kisapuisto');

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('photon.komoot.io');
    expect(url).toContain('q=Kisapuisto');
    // Photon supports only default/de/en/fr; 'default' returns the local name,
    // which for Finland is the Finnish one. Asking for fi is a 400.
    expect(url).toContain('lang=default');
    expect(url).toContain('bbox=');
  });

  describe('every failure ends as an ordinary text box', () => {
    it('survives a rejected request (offline at the pitch)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

      await expect(searchVenues('Kisapuisto')).resolves.toEqual([]);
    });

    it('survives a throttled response', async () => {
      respondWith({}, false);

      await expect(searchVenues('Kisapuisto')).resolves.toEqual([]);
    });

    it('survives a response that is not the shape we expect', async () => {
      respondWith({ nonsense: true });

      await expect(searchVenues('Kisapuisto')).resolves.toEqual([]);
    });

    it('survives invalid JSON', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('not json');
        },
      }) as unknown as typeof fetch;

      await expect(searchVenues('Kisapuisto')).resolves.toEqual([]);
    });
  });

  describe('results that cannot be used are dropped, not rendered blank', () => {
    it('drops a feature with no coordinates', async () => {
      respondWith({ features: [{ properties: { name: 'Nowhere' } }] });

      await expect(searchVenues('Nowhere')).resolves.toEqual([]);
    });

    it('drops a feature with no name', async () => {
      respondWith({ features: [feature({ name: undefined, street: undefined })] });

      await expect(searchVenues('Kimpisen')).resolves.toEqual([]);
    });

    it('falls back to the street for venues OSM knows by address', async () => {
      respondWith({ features: [feature({ name: undefined, street: 'Pohjolankatu' })] });

      const [first] = await searchVenues('Pohjolankatu');

      expect(first.name).toBe('Pohjolankatu');
    });

    it('keeps the usable results when one of them is broken', async () => {
      respondWith({ features: [{ properties: {} }, feature()] });

      const results = await searchVenues('Kimpisen');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Kimpisen kenttä');
    });
  });

  it('copes with a venue that has no town', async () => {
    respondWith({ features: [feature({ city: undefined, state: undefined })] });

    const [first] = await searchVenues('Kimpisen');

    expect(first.context).toBe('');
  });
});

describe('venueLabel', () => {
  it('reads as the venue, then where it is', () => {
    expect(
      venueLabel({ key: 'k', name: 'Kimpisen kenttä', context: 'Lappeenranta', latitude: 1, longitude: 2 }),
    ).toBe('Kimpisen kenttä, Lappeenranta');
  });

  it('is just the venue when there is no context to add', () => {
    expect(venueLabel({ key: 'k', name: 'Kisapuisto', context: '', latitude: 1, longitude: 2 })).toBe(
      'Kisapuisto',
    );
  });
});
