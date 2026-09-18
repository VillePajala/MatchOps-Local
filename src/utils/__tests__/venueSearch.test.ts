/**
 * @critical - this runs on every keystroke behind a form the coach is filling
 * in at a pitch. It must never throw, never block, and never leave them without
 * a working text box, whatever the network or the endpoint does.
 */
import { searchVenues, venueLabel, venuePinLabel } from '../venueSearch';

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

describe('house numbers', () => {
  /**
   * The owner searched "Mannerheimintie 10" and saw only "Mannerheimintie", so
   * the address looked unfindable when Photon had in fact found it. The number
   * arrives as its own field and has to be recombined with the street.
   */
  it('keeps the number on an address with no venue name', async () => {
    respondWith({
      features: [{
        geometry: { coordinates: [24.9384, 60.1699] },
        properties: { street: 'Mannerheimintie', housenumber: '10', city: 'Helsinki', state: 'Uusimaa' },
      }],
    });

    const [first] = await searchVenues('Mannerheimintie 10');

    expect(first.name).toBe('Mannerheimintie 10');
    expect(first.context).toBe('Helsinki, Uusimaa');
  });

  it('puts the address under a named venue rather than losing it', async () => {
    respondWith({
      features: [{
        geometry: { coordinates: [24.9384, 60.1699] },
        properties: { name: 'Marski by Scandic', street: 'Mannerheimintie', housenumber: '10', city: 'Helsinki', state: 'Uusimaa' },
      }],
    });

    const [first] = await searchVenues('Mannerheimintie 10');

    expect(first.name).toBe('Marski by Scandic');
    expect(first.context).toBe('Mannerheimintie 10, Helsinki, Uusimaa');
  });

  /** A street with no number is still a usable answer, just a vaguer one. */
  it('accepts a street with no number', async () => {
    respondWith({
      features: [{
        geometry: { coordinates: [23.36, 59.82] },
        properties: { street: 'Mannerheimintie', city: 'Hanko', state: 'Uusimaa' },
      }],
    });

    const [first] = await searchVenues('Mannerheimintie');

    expect(first.name).toBe('Mannerheimintie');
  });

  /** Never twice: the address must not be both the name and the subtitle. */
  it('does not repeat the address under itself', async () => {
    respondWith({
      features: [{
        geometry: { coordinates: [24.9384, 60.1699] },
        properties: { street: 'Mannerheimintie', housenumber: '10', city: 'Helsinki' },
      }],
    });

    const [first] = await searchVenues('Mannerheimintie 10');

    expect(first.context).not.toContain('Mannerheimintie');
  });
});

describe('venueLabel', () => {
  const sug = (over: Partial<Parameters<typeof venueLabel>[0]>) =>
    venueLabel({ key: 'k', name: 'Kimpisen kenttä', context: '', town: null, address: null, latitude: 1, longitude: 2, ...over });

  it('reads as the venue, then the town', () => {
    expect(sug({ town: 'Lappeenranta' })).toBe('Kimpisen kenttä, Lappeenranta');
  });

  it('is just the venue when the town is unknown', () => {
    expect(sug({ name: 'Kisapuisto' })).toBe('Kisapuisto');
  });

  /**
   * What gets stored is deliberately SHORTER than what was shown while
   * picking. The owner's card read "Savitaipale Areena, Jonni Myyrän tie 3,
   * Savitai…" - truncated, because the full disambiguation string was kept
   * after it had finished disambiguating. The coordinates carry the precision
   * from then on.
   */
  it('drops the street and region that only mattered while choosing', () => {
    expect(sug({
      name: 'Kimpisen kenttä',
      context: 'Pohjolankatu 1, Lappeenranta, Etelä-Karjala',
      town: 'Lappeenranta',
    })).toBe('Kimpisen kenttä, Lappeenranta');
  });

  /** "Savitaipale Areena, Savitaipale" is one repetition too many. */
  /**
   * The owner's actual card read "Savitaipale Areena, Jonni Myyrän tie 3,
   * Savitai…". The venue already carries its town, so the whole label is just
   * the name - which is also why it no longer truncates.
   */
  it('does not repeat a town already inside the venue name', () => {
    expect(sug({
      name: 'Savitaipale Areena',
      context: 'Jonni Myyrän tie 3, Savitaipale, Etelä-Karjala',
      town: 'Savitaipale',
    })).toBe('Savitaipale Areena');
  });

  it('keeps an address-only result as it is', () => {
    expect(sug({ name: 'Mannerheimintie 10', town: 'Helsinki' })).toBe('Mannerheimintie 10, Helsinki');
  });
});

describe('venuePinLabel', () => {
  const pin = (over: Partial<Parameters<typeof venuePinLabel>[0]>) =>
    venuePinLabel({ key: 'k', name: 'Kimpisen kenttä', context: '', town: null, address: null, latitude: 1, longitude: 2, ...over });

  /**
   * The line shown under a renamed venue. It is the ADDRESS, not the label:
   * once the coach has replaced the map's name with their own, echoing the
   * map's name back tells them nothing, while the street does.
   */
  it('is the street and town, not the venue name', () => {
    expect(pin({ name: 'Kimpisen kenttä', address: 'Pohjolankatu 1', town: 'Lappeenranta' }))
      .toBe('Pohjolankatu 1, Lappeenranta');
  });

  /** A pitch in a field has no street, and its town still beats nothing. */
  it('falls back to the venue name when OSM has no street', () => {
    expect(pin({ name: 'Keskuskenttä', address: null, town: 'Savitaipale' }))
      .toBe('Keskuskenttä, Savitaipale');
  });

  it('does not repeat a town already inside the address', () => {
    expect(pin({ address: 'Savitaipale 4', town: 'Savitaipale' })).toBe('Savitaipale 4');
  });

  it('copes with no town at all', () => {
    expect(pin({ address: 'Pohjolankatu 1', town: null })).toBe('Pohjolankatu 1');
  });
});

describe('the address a suggestion carries', () => {
  it('exposes street and number separately from the name', async () => {
    respondWith({
      features: [{
        geometry: { coordinates: [24.9384, 60.1699] },
        properties: { name: 'Marski by Scandic', street: 'Mannerheimintie', housenumber: '10', city: 'Helsinki' },
      }],
    });

    const [first] = await searchVenues('Marski');

    expect(first.address).toBe('Mannerheimintie 10');
    expect(first.name).toBe('Marski by Scandic');
  });

  it('is null for a venue OSM has no street for', async () => {
    respondWith({ features: [feature()] });

    const [first] = await searchVenues('Kimpisen');

    expect(first.address).toBeNull();
  });
});
