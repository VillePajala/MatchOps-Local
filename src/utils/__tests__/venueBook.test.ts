/**
 * @critical - the point of the whole location feature. A venue OSM cannot find
 * is typed and pinned ONCE; every match after that must recognise it from the
 * coach's own name for it, with the pin still attached.
 */
import { buildVenueBook, matchVenues, isKnownVenue, learnVenues, sanitizeKnownVenues } from '../venueBook';
import type { AppState } from '@/types/game';

const game = (over: Partial<AppState>): Partial<AppState> => ({
  gameDate: '2026-09-01',
  gameLocation: 'Kimpisen kenttä',
  ...over,
});

const pinned = {
  gameLocation: 'Mitta-Keittiöt Areena',
  locationLat: 61.87,
  locationLng: 28.88,
  locationAddress: 'Pihlajavedentie 1, Savonlinna',
};

describe('buildVenueBook', () => {
  it('collects each venue once, however often it was played', () => {
    const book = buildVenueBook([
      game({ gameDate: '2026-09-01' }),
      game({ gameDate: '2026-09-08' }),
      game({ gameDate: '2026-09-15' }),
    ]);

    expect(book).toHaveLength(1);
    expect(book[0].timesUsed).toBe(3);
  });

  it('carries the pin so the venue is never searched for twice', () => {
    const book = buildVenueBook([game(pinned)]);

    expect(book[0]).toMatchObject({
      name: 'Mitta-Keittiöt Areena',
      latitude: 61.87,
      longitude: 28.88,
      address: 'Pihlajavedentie 1, Savonlinna',
    });
  });

  /**
   * Pinning a venue once must not be undone by later matches where the coach
   * typed the name from memory - which is precisely how it will be used.
   */
  it('keeps a pin set once, through later matches that had none', () => {
    const book = buildVenueBook([
      game({ gameDate: '2026-08-01', ...pinned }),
      game({ gameDate: '2026-09-01', gameLocation: 'Mitta-Keittiöt Areena' }),
    ]);

    expect(book[0].latitude).toBe(61.87);
    expect(book[0].timesUsed).toBe(2);
  });

  it('adopts a pin added later to a venue first typed bare', () => {
    const book = buildVenueBook([
      game({ gameDate: '2026-08-01', gameLocation: 'Mitta-Keittiöt Areena' }),
      game({ gameDate: '2026-09-01', ...pinned }),
    ]);

    expect(book[0].address).toBe('Pihlajavedentie 1, Savonlinna');
  });

  /** One pitch spelled three ways is three venues to anything that groups. */
  it('treats spellings of one venue as one venue', () => {
    const book = buildVenueBook([
      game({ gameDate: '2026-08-01', gameLocation: 'kimpisen kenttä' }),
      game({ gameDate: '2026-09-01', gameLocation: 'Kimpisen Kenttä' }),
    ]);

    expect(book).toHaveLength(1);
    expect(book[0].timesUsed).toBe(2);
  });

  it('offers back the most recent spelling', () => {
    const book = buildVenueBook([
      game({ gameDate: '2026-08-01', gameLocation: 'kimpinen' }),
      game({ gameDate: '2026-09-01', gameLocation: 'Kimpisen kenttä' }),
    ]);

    expect(book[0].name).toBe('Kimpisen kenttä');
  });

  it('puts the most recently used venue first', () => {
    const book = buildVenueBook([
      game({ gameDate: '2026-08-01', gameLocation: 'Vanha kenttä' }),
      game({ gameDate: '2026-09-15', gameLocation: 'Uusi areena' }),
    ]);

    expect(book.map((v) => v.name)).toEqual(['Uusi areena', 'Vanha kenttä']);
  });

  it('ignores matches with no location at all', () => {
    expect(buildVenueBook([game({ gameLocation: '' }), game({ gameLocation: undefined })])).toEqual([]);
  });

  it('copes with no games', () => {
    expect(buildVenueBook([])).toEqual([]);
  });
});

describe('matchVenues', () => {
  const book = buildVenueBook([
    game({ gameDate: '2026-09-15', ...pinned }),
    game({ gameDate: '2026-09-08', gameLocation: 'Kimpisen kenttä' }),
    game({ gameDate: '2026-09-01', gameLocation: 'Savonlinnan kisapuisto' }),
  ]);

  /**
   * The whole ask: type your own name for the place and have it offered back,
   * pin included, without a search that was never going to find it.
   */
  it('finds a venue from the first few letters of the coach s own name for it', () => {
    const [first] = matchVenues(book, 'Mitta');

    expect(first.name).toBe('Mitta-Keittiöt Areena');
    expect(first.latitude).toBe(61.87);
  });

  /** Finnish keyboards are not universal, and this only widens matches. */
  it('finds it typed without umlauts', () => {
    expect(matchVenues(book, 'mitta-keittiot')[0]?.name).toBe('Mitta-Keittiöt Areena');
  });

  it('matches in the middle of a name too', () => {
    expect(matchVenues(book, 'kisapuisto')[0]?.name).toBe('Savonlinnan kisapuisto');
  });

  /** "kim" means Kimpinen, not something that merely contains those letters. */
  it('ranks a name that starts with the query above one that contains it', () => {
    const local = buildVenueBook([
      game({ gameDate: '2026-09-15', gameLocation: 'Areena Kimpinen' }),
      game({ gameDate: '2026-09-08', gameLocation: 'Kimpisen kenttä' }),
    ]);

    expect(matchVenues(local, 'kimp')[0].name).toBe('Kimpisen kenttä');
  });

  /**
   * An empty field offers the recent venues rather than nothing - a coach who
   * must type before being recognised is still doing the typing.
   */
  it('offers recent venues before anything is typed', () => {
    expect(matchVenues(book, '')).toHaveLength(3);
    expect(matchVenues(book, '  ')[0].name).toBe('Mitta-Keittiöt Areena');
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(matchVenues(book, 'Helsinki')).toEqual([]);
  });

  it('never floods the list', () => {
    const many = buildVenueBook(
      Array.from({ length: 20 }, (_, i) => game({ gameDate: `2026-09-${String(i + 1).padStart(2, '0')}`, gameLocation: `Kenttä ${i}` })),
    );

    expect(matchVenues(many, 'Kenttä')).toHaveLength(5);
    expect(matchVenues(many, 'Kenttä', 2)).toHaveLength(2);
  });
});

describe('isKnownVenue', () => {
  const book = buildVenueBook([game({ ...pinned })]);

  /** So the same pitch is not offered twice, as ours and as the map's. */
  it('recognises a venue whatever its spelling', () => {
    expect(isKnownVenue(book, 'mitta-keittiöt areena')).toBe(true);
  });

  it('does not claim one it has never seen', () => {
    expect(isKnownVenue(book, 'Kimpisen kenttä')).toBe(false);
  });
});

/**
 * @critical - the owner deleted a test fixture and the next day the app no
 * longer knew the ground. The book is stored now, and matches only ever add.
 */
describe('learnVenues', () => {
  const pinned = (name: string, date: string): Partial<AppState> => ({
    gameLocation: name, gameDate: date, locationLat: 61.8, locationLng: 28.9, locationAddress: 'Kirkkokatu 1',
  });

  it('keeps a venue whose matches are all gone', () => {
    const { book } = learnVenues(
      [{ name: 'Mitta-Keittiöt Areena', latitude: 61.8, longitude: 28.9, address: 'Kirkkokatu 1', timesUsed: 1, lastUsed: '2026-09-19' }],
      [],
    );

    expect(book.map((v) => v.name)).toEqual(['Mitta-Keittiöt Areena']);
  });

  it('learns a venue from a match it had not seen', () => {
    const { book, changed } = learnVenues([], [pinned('Kimpisen kenttä', '2026-09-20')]);

    expect(changed).toBe(true);
    expect(book[0]).toMatchObject({ name: 'Kimpisen kenttä', latitude: 61.8, address: 'Kirkkokatu 1' });
  });

  it('reports no change when the matches teach nothing new', () => {
    const stored = learnVenues([], [pinned('Kimpisen kenttä', '2026-09-20')]).book;

    expect(learnVenues(stored, [pinned('Kimpisen kenttä', '2026-09-20')]).changed).toBe(false);
  });

  it('lets a match pin a venue that was only ever typed', () => {
    const { book } = learnVenues(
      [{ name: 'Kimpisen kenttä', timesUsed: 3, lastUsed: '2026-05-01' }],
      [pinned('Kimpisen kenttä', '2026-09-20')],
    );

    expect(book[0]).toMatchObject({ latitude: 61.8, longitude: 28.9, timesUsed: 3, lastUsed: '2026-09-20' });
  });

  it('never lets a count or a date go backwards', () => {
    const { book } = learnVenues(
      [{ name: 'Kimpisen kenttä', timesUsed: 7, lastUsed: '2026-09-25' }],
      [{ gameLocation: 'Kimpisen kenttä', gameDate: '2026-01-01' }],
    );

    expect(book[0]).toMatchObject({ timesUsed: 7, lastUsed: '2026-09-25' });
  });

  it('treats spellings of one venue as one, and keeps the newest', () => {
    const { book } = learnVenues(
      [{ name: 'kimpisen kentta', timesUsed: 1, lastUsed: '2026-01-01' }],
      [{ gameLocation: 'Kimpisen kenttä', gameDate: '2026-09-20' }],
    );

    expect(book).toHaveLength(1);
    expect(book[0].name).toBe('Kimpisen kenttä');
  });
});

describe('sanitizeKnownVenues', () => {
  it('drops entries that are not venues and keeps the rest', () => {
    expect(sanitizeKnownVenues([
      { name: 'Kimpisen kenttä', latitude: 61.8, longitude: 28.9, timesUsed: 2, lastUsed: '2026-09-20' },
      { name: '' },
      'nonsense',
      null,
      { latitude: 1 },
    ])).toEqual([
      { name: 'Kimpisen kenttä', latitude: 61.8, longitude: 28.9, address: undefined, timesUsed: 2, lastUsed: '2026-09-20' },
    ]);
  });

  /** Half a pin is no pin: a latitude without a longitude cannot be driven to. */
  it('keeps a pin only when both coordinates are numbers', () => {
    expect(sanitizeKnownVenues([{ name: 'X', latitude: 61.8, longitude: 'no' }])?.[0]).toMatchObject({
      latitude: undefined, longitude: undefined,
    });
  });

  it('answers undefined for a column that was never written', () => {
    expect(sanitizeKnownVenues(null)).toBeUndefined();
  });
});
