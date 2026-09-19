/**
 * @critical - venues pinned before migration 049 kept their position and lost
 * their address, so the next-match card has no town to show. Re-pinning them
 * by hand is the coach fixing our bookkeeping.
 */
import { healVenueAddresses, persistHealedAddresses } from '../healVenueAddresses';
import type { AppState } from '@/types/game';

const respond = (byPosition: Record<string, Record<string, string>>) => {
  global.fetch = jest.fn(async (url: string) => {
    const u = new URL(url);
    const key = `${u.searchParams.get('lat')},${u.searchParams.get('lon')}`;
    const props = byPosition[key];
    return {
      ok: true,
      json: async () => ({
        features: props ? [{ geometry: { coordinates: [28.88, 61.87] }, properties: props }] : [],
      }),
    };
  }) as unknown as typeof fetch;
};

const requests = () => (global.fetch as jest.Mock).mock.calls.length;

const game = (over: Partial<AppState>): Partial<AppState> => ({
  gameLocation: 'Mitta-Keittiöt Areena', ...over,
});

const AT_SAVONLINNA = { locationLat: 61.87, locationLng: 28.88 };
const SAVONLINNA = { '61.87,28.88': { street: 'Olavinkatu', housenumber: '48', city: 'Savonlinna' } };

afterEach(() => jest.restoreAllMocks());

describe('healVenueAddresses', () => {
  it('finds the address for a venue that has only a position', async () => {
    respond(SAVONLINNA);

    const repaired = await healVenueAddresses({ g1: game(AT_SAVONLINNA) });

    expect(repaired.g1).toBe('Olavinkatu 48, Savonlinna');
  });

  it('leaves a venue that already has one alone', async () => {
    respond(SAVONLINNA);

    const repaired = await healVenueAddresses({
      g1: game({ ...AT_SAVONLINNA, locationAddress: 'Muurarinkatu 4, Savonlinna' }),
    });

    expect(repaired).toEqual({});
    expect(requests()).toBe(0);
  });

  it('ignores a venue that was never pinned', async () => {
    respond(SAVONLINNA);

    const repaired = await healVenueAddresses({ g1: game({ gameLocation: 'Keskuskenttä' }) });

    expect(repaired).toEqual({});
    expect(requests()).toBe(0);
  });

  /** A season at one pitch is one request, not thirty. */
  it('asks once per position, however many matches share it', async () => {
    respond(SAVONLINNA);

    const repaired = await healVenueAddresses({
      g1: game(AT_SAVONLINNA), g2: game(AT_SAVONLINNA), g3: game(AT_SAVONLINNA),
    });

    expect(requests()).toBe(1);
    expect(Object.keys(repaired)).toEqual(['g1', 'g2', 'g3']);
  });

  /** A long history must not turn a launch into a burst at a free service. */
  it('caps how many it does in one run', async () => {
    respond({});
    const games = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`g${i}`, game({ locationLat: 60 + i, locationLng: 24 })]),
    );

    await healVenueAddresses(games, 3);

    expect(requests()).toBe(3);
  });

  describe('tidying old data is never worth an error', () => {
    it('gives up quietly when the lookup fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

      await expect(healVenueAddresses({ g1: game(AT_SAVONLINNA) })).resolves.toEqual({});
    });

    it('gives up quietly when the map cannot name the place', async () => {
      respond({});

      await expect(healVenueAddresses({ g1: game(AT_SAVONLINNA) })).resolves.toEqual({});
    });

    it('does nothing at all when there is nothing to do', async () => {
      respond(SAVONLINNA);

      expect(await healVenueAddresses({})).toEqual({});
      expect(requests()).toBe(0);
    });
  });
});

/**
 * @critical - REGRESSION, found by review. Finding an address is several
 * sequential network calls, so the snapshot they began with is seconds old by
 * the time they end. Writing that stale copy back would lose whatever the
 * coach changed on the match meanwhile - their edit gone to a background
 * tidy-up they never asked for.
 */
describe('persistHealedAddresses', () => {
  const save = () => jest.fn(async () => undefined);

  it('writes the address onto the game', async () => {
    const saved = save();
    const written = await persistHealedAddresses(
      { g1: 'Olavinkatu 48, Savonlinna' },
      async () => ({ g1: { gameLocation: 'Areena', locationLat: 61.87 } }),
      saved,
    );

    expect(written).toBe(1);
    expect(saved).toHaveBeenCalledWith('g1', expect.objectContaining({
      gameLocation: 'Areena',
      locationAddress: 'Olavinkatu 48, Savonlinna',
    }));
  });

  /** THE BUG. The copy written must be the one read AFTER the geocoding. */
  it('writes the coach s latest edit, not the copy it geocoded from', async () => {
    const saved = save();

    await persistHealedAddresses(
      { g1: 'Olavinkatu 48, Savonlinna' },
      // What the game looks like NOW - the opponent was changed while the
      // lookup was in flight.
      async () => ({ g1: { opponentName: 'HJK', gameLocation: 'Areena' } }),
      saved,
    );

    expect(saved).toHaveBeenCalledWith('g1', expect.objectContaining({ opponentName: 'HJK' }));
  });

  it('reads before it writes, never the other way round', async () => {
    const order: string[] = [];
    await persistHealedAddresses(
      { g1: 'X', g2: 'Y' },
      async () => { order.push('read'); return { g1: {}, g2: {} }; },
      async (id) => { order.push(`write:${id}`); },
    );

    expect(order).toEqual(['read', 'write:g1', 'write:g2']);
  });

  it('leaves a game that was deleted meanwhile', async () => {
    const saved = save();

    const written = await persistHealedAddresses({ g1: 'X' }, async () => ({}), saved);

    expect(written).toBe(0);
    expect(saved).not.toHaveBeenCalled();
  });

  it('leaves a game somebody already gave an address to', async () => {
    const saved = save();

    const written = await persistHealedAddresses(
      { g1: 'X' },
      async () => ({ g1: { locationAddress: 'Muurarinkatu 4, Savonlinna' } }),
      saved,
    );

    expect(written).toBe(0);
    expect(saved).not.toHaveBeenCalled();
  });

  /** Nothing found means nothing read and nothing written. */
  it('does not even read when there is nothing to write', async () => {
    const read = jest.fn(async () => ({}));

    expect(await persistHealedAddresses({}, read, save())).toBe(0);
    expect(read).not.toHaveBeenCalled();
  });
});
