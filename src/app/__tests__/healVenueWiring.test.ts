/**
 * @critical - REGRESSION, both found by review. The heal runs in the
 * background over someone's real match data, so the two ways it could go
 * wrong are: never running for a second account on the same tab, and
 * overwriting an edit made while its network pass was in flight.
 */
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/page.tsx'), 'utf8');

const heal = source.slice(
  source.indexOf('const healVenueAddressesOnce'),
  source.indexOf('const handleOpenGameById'),
);

describe('it runs once per user, not once per tab', () => {
  /**
   * A second account signing in never reloads the page, so a bare boolean
   * would leave their venues unhealed for the rest of the session.
   */
  it('remembers WHO it healed for', () => {
    expect(heal).toContain('healedAddressesForRef.current === who');
    expect(heal).toContain('healedAddressesForRef.current = who');
  });

  it('treats a signed-out user as their own case, not as "done"', () => {
    expect(heal).toContain('const who = userId ?? null;');
  });
});

describe('it cannot clobber an edit made while it was working', () => {
  /**
   * The geocode pass is several sequential network calls. The snapshot it
   * started from is seconds old by the time it finishes, so writing
   * `{ ...staleGame, address }` would lose anything changed meanwhile.
   */
  it('re-reads the games before writing any of them', () => {
    const readAt = heal.indexOf('const fresh = await getSavedGames');
    const writeAt = heal.indexOf('utilSaveGame');

    expect(readAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(readAt);
  });

  it('writes onto the fresh copy, never the snapshot it geocoded from', () => {
    expect(heal).toContain('const game = fresh?.[id];');
    expect(heal).not.toMatch(/const game = games\[id\]/);
  });

  /** Deleted meanwhile, or already given an address by someone else. */
  it('skips a game that no longer needs it', () => {
    expect(heal).toContain('if (!game || game.locationAddress) continue;');
  });
});
