/**
 * @critical - the venue link is the one place a coach taps on their way to a
 * match they are about to be late for. Sending them to the wrong place, or to
 * a search that cannot resolve, is worse than showing no link at all.
 */
import { mapsSearchUrl, mapsDirectionsUrl, TASO_URL } from '../externalLinks';

describe('mapsSearchUrl', () => {
  it('searches Maps for a venue name', () => {
    expect(mapsSearchUrl('Kimpisen kenttä')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Kimpisen%20kentt%C3%A4',
    );
  });

  /**
   * The escape hatch that makes free text good enough. A coach who wants an
   * exact pin shares one from the Maps app and pastes it here; searching for
   * the TEXT of a URL would find nothing.
   */
  it('passes a pasted link straight through instead of searching for it', () => {
    const shared = 'https://maps.app.goo.gl/abc123';
    expect(mapsSearchUrl(shared)).toBe(shared);
  });

  it('passes http links through too', () => {
    expect(mapsSearchUrl('http://example.com/place')).toBe('http://example.com/place');
  });

  /** Coordinates are exact, and the same free URL handles them - no API needed. */
  it('accepts coordinates as a query', () => {
    expect(mapsSearchUrl('61.0583,28.1887')).toBe(
      'https://www.google.com/maps/search/?api=1&query=61.0583%2C28.1887',
    );
  });

  it('encodes characters that would otherwise break the URL', () => {
    expect(mapsSearchUrl('A & B / C')).toContain('query=A%20%26%20B%20%2F%20C');
  });

  /** No venue means no link, so the caller renders plain text instead. */
  it.each([[undefined], [''], ['   ']])('returns null for %p', (value) => {
    expect(mapsSearchUrl(value as string | undefined)).toBeNull();
  });

  it('ignores surrounding whitespace rather than encoding it', () => {
    expect(mapsSearchUrl('  Kisapuisto  ')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Kisapuisto',
    );
  });

  /**
   * The pitch number is NOT the venue's problem. This is the failure the
   * separate `fieldNumber` field exists to prevent: a map cannot resolve
   * "Kimpisen kenttä TN 2", so the venue must stay clean.
   */
  it('is only ever given the venue, so the query stays resolvable', () => {
    const url = mapsSearchUrl('Kimpisen kenttä');
    expect(url).not.toContain('TN');
  });
});

describe('mapsSearchUrl with coordinates', () => {
  /** The whole reason the lookup stores a position: nothing left to search. */
  it('uses the exact position instead of searching for the name', () => {
    expect(mapsSearchUrl('Kimpisen kenttä', 61.0583, 28.1887)).toBe(
      'https://www.google.com/maps/search/?api=1&query=61.0583,28.1887',
    );
  });

  it('prefers coordinates even when the name would also resolve', () => {
    const url = mapsSearchUrl('Helsinki', 61.0583, 28.1887);
    expect(url).not.toContain('Helsinki');
  });

  it('pins a venue that has coordinates but no name at all', () => {
    expect(mapsSearchUrl('', 61.0583, 28.1887)).toContain('61.0583,28.1887');
  });

  /** Half a pair is not a position; fall back rather than invent one. */
  it.each([
    [61.0583, undefined],
    [undefined, 28.1887],
  ])('falls back to searching the name given only one of (%p, %p)', (lat, lng) => {
    expect(mapsSearchUrl('Kisapuisto', lat, lng)).toContain('query=Kisapuisto');
  });

  it('accepts a position at the equator and prime meridian', () => {
    // 0 is falsy, and a naive truthiness check would silently drop it.
    expect(mapsSearchUrl('somewhere', 0, 0)).toBe(
      'https://www.google.com/maps/search/?api=1&query=0,0',
    );
  });
});

describe('mapsDirectionsUrl', () => {
  it('routes to an exact position', () => {
    expect(mapsDirectionsUrl(61.0583, 28.1887)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=61.0583,28.1887',
    );
  });

  /**
   * THE WHOLE REASON THIS EXISTS. mapsSearchUrl would fall back to searching
   * the venue's name, so a match at "Itainen alue" would put a car button on
   * the front page that opens a search for a region. A navigation control that
   * cannot navigate is worse than no control, so this returns null and the
   * button never renders.
   */
  it.each([
    [undefined, undefined],
    [61.0583, undefined],
    [undefined, 28.1887],
  ])('refuses to route without both coordinates (%p, %p)', (lat, lng) => {
    expect(mapsDirectionsUrl(lat, lng)).toBeNull();
  });

  it('never falls back to a name, however good the name looks', () => {
    // No name is even accepted - the signature cannot express one.
    expect(mapsDirectionsUrl(undefined, undefined)).toBeNull();
  });

  it('asks for directions, not a dropped pin', () => {
    // /dir/ opens Maps already routing; /search/ would need another tap.
    expect(mapsDirectionsUrl(1, 2)).toContain('/maps/dir/');
    expect(mapsDirectionsUrl(1, 2)).not.toContain('/maps/search/');
  });

  it('accepts the equator and prime meridian, which are falsy', () => {
    expect(mapsDirectionsUrl(0, 0)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=0,0',
    );
  });
});

describe('TASO_URL', () => {
  it('is the address the Taso rows point at', () => {
    expect(TASO_URL).toBe('https://taso.palloliitto.fi');
  });
});

/**
 * @critical - OpenStreetMap has no house number for many Finnish streets, so a
 * pin for "Puusepänkatu 1" is the street, and Maps names the nearest door to
 * it. The written address is what the coach meant; the pin only proves the
 * place is real.
 */
describe('mapsDirectionsUrl with a written address', () => {
  it('routes to the address, not the pin', () => {
    expect(mapsDirectionsUrl(61.874, 28.8677, 'Puusepänkatu 1, Savonlinna')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Puusep%C3%A4nkatu%201%2C%20Savonlinna',
    );
  });

  it('still needs the pin to exist at all', () => {
    expect(mapsDirectionsUrl(undefined, undefined, 'Puusepänkatu 1, Savonlinna')).toBeNull();
  });

  it('falls back to the pin for a blank address', () => {
    expect(mapsDirectionsUrl(61.874, 28.8677, '  ')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=61.874,28.8677',
    );
  });
});
