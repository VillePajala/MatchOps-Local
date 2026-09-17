/**
 * @critical - decides where the map picker opens. Getting it right saves the
 * coach pinching in from the whole country on a phone; getting it wrong must
 * still leave them a working map, never an error.
 */
import { guessRegionFor } from '../venueSearch';

const feature = (name: string) => ({
  geometry: { coordinates: [28.88, 61.87] },
  properties: { name, city: 'Savonlinna' },
});

/** Answers each query per `byQuery`, and with nothing for anything else. */
const respondPerQuery = (byQuery: Record<string, string[]>) => {
  global.fetch = jest.fn(async (url: string) => {
    const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
    const names = byQuery[q] ?? [];
    return { ok: true, json: async () => ({ features: names.map(feature) }) };
  }) as unknown as typeof fetch;
};

/** The queries Photon was actually asked, in order. */
const queried = () =>
  (global.fetch as jest.Mock).mock.calls.map(([url]) =>
    decodeURIComponent(new URL(url as string).searchParams.get('q') ?? ''),
  );

afterEach(() => jest.restoreAllMocks());

describe('guessRegionFor', () => {
  /**
   * The owner's actual failing search. The whole string finds nothing; the
   * town after the comma finds the right part of Finland.
   */
  it('falls back to the town after the comma', async () => {
    respondPerQuery({ Savonlinna: ['Savonlinna'] });

    const guess = await guessRegionFor('Mitta-Keittiöt Areena, Savonlinna');

    expect(queried()).toContain('Savonlinna');
    expect(guess?.latitude).toBe(61.87);
    expect(guess?.longitude).toBe(28.88);
  });

  it('tries the last word when there is no comma', async () => {
    respondPerQuery({ Savonlinna: ['Savonlinna'] });

    const guess = await guessRegionFor('Mitta-Keittiöt Areena Savonlinna');

    expect(queried()).toContain('Savonlinna');
    expect(guess).not.toBeNull();
  });

  /** "Savonlinnan keskuskenttä" puts the town FIRST, so the tail misses it. */
  it('tries the leading words when the tail finds nothing', async () => {
    respondPerQuery({ 'Savonlinnan keskuskenttä': ['Savonlinna'] });

    const guess = await guessRegionFor('Savonlinnan keskuskenttä');

    expect(queried()).toEqual(['keskuskenttä', 'Savonlinnan keskuskenttä']);
    expect(guess).not.toBeNull();
  });

  it('stops at the first hit rather than trying every candidate', async () => {
    respondPerQuery({ Savonlinna: ['Savonlinna'] });

    await guessRegionFor('Areena, Savonlinna');

    expect(queried()).toEqual(['Savonlinna']);
  });

  /** No guess is a fine answer - the picker just opens zoomed out. */
  it('returns null when nothing in the query is findable', async () => {
    respondPerQuery({});

    await expect(guessRegionFor('qqq zzz')).resolves.toBeNull();
  });

  it('returns null for an empty query without asking', async () => {
    respondPerQuery({});

    await expect(guessRegionFor('   ')).resolves.toBeNull();
    expect(queried()).toEqual([]);
  });

  /** A dead network must not stop the map from opening. */
  it('returns null rather than throwing when the lookup fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    await expect(guessRegionFor('Areena, Savonlinna')).resolves.toBeNull();
  });
});
