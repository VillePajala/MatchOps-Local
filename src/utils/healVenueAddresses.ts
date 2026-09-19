import { reverseGeocode, venuePinLabel } from '@/utils/venueSearch';
import type { AppState } from '@/types/game';
import logger from '@/utils/logger';

/**
 * Fill in the address for venues that have a position and no words.
 *
 * WHY THESE EXIST. Venues pinned before migration 049 had their address
 * dropped on save, because the column did not exist yet. They kept their
 * coordinates - the map link and the departure time work perfectly - but the
 * next-match card cannot show the town, since the town is read out of the
 * address. Asking the coach to re-pin a venue the app already knows the
 * position of is asking them to fix our bookkeeping.
 *
 * ONE LOOKUP PER DISTINCT POSITION, and only for games that need it. Two
 * matches at the same pitch are one request, and a venue that already has its
 * address is never touched.
 *
 * BEST EFFORT, ALWAYS. This runs in the background to tidy old data: a dead
 * network, a throttled endpoint or a position the map cannot name all leave
 * the games exactly as they were. Nothing here is worth an error in front of a
 * coach who did not ask for it.
 *
 * @returns the games it repaired, keyed by id - empty when there was nothing
 *   to do, which is the normal case after the first run.
 * @module healVenueAddresses
 */
export async function healVenueAddresses(
  games: Record<string, Partial<AppState>>,
  limit = 5,
): Promise<Record<string, string>> {
  const needing = Object.entries(games).filter(
    ([, g]) =>
      typeof g?.locationLat === 'number' &&
      typeof g?.locationLng === 'number' &&
      !g.locationAddress,
  );
  if (needing.length === 0) return {};

  // Distinct positions first: the same pitch across a season is one request.
  const byPosition = new Map<string, { lat: number; lng: number; ids: string[] }>();
  for (const [id, g] of needing) {
    const key = `${g.locationLat},${g.locationLng}`;
    const seen = byPosition.get(key);
    if (seen) seen.ids.push(id);
    else byPosition.set(key, { lat: g.locationLat as number, lng: g.locationLng as number, ids: [id] });
  }

  const repaired: Record<string, string> = {};
  // Capped per run so a long history cannot turn a launch into a burst of
  // requests at a free public service. What is left is picked up next time.
  for (const { lat, lng, ids } of [...byPosition.values()].slice(0, limit)) {
    const found = await reverseGeocode(lat, lng);
    if (!found) continue;
    const address = venuePinLabel(found);
    for (const id of ids) repaired[id] = address;
  }

  if (Object.keys(repaired).length > 0) {
    logger.info('[healVenueAddresses] Filled in addresses for venues pinned before they could be stored', {
      games: Object.keys(repaired).length,
    });
  }
  return repaired;
}

export default healVenueAddresses;

/**
 * Write the found addresses onto the games, safely.
 *
 * SEPARATE FROM FINDING THEM, and re-reading in between, because the finding
 * is several sequential network calls: the snapshot they started from is
 * seconds old by the time they finish, and writing `{ ...staleGame, address }`
 * would lose anything the coach changed on that match meanwhile - their edit
 * gone to a background tidy-up they never asked for.
 *
 * Takes its reader and writer as arguments so the ordering that makes it safe
 * can actually be tested, rather than asserted about by reading the source.
 *
 * @returns how many games were written.
 */
export async function persistHealedAddresses(
  repaired: Record<string, string>,
  readGames: () => Promise<Record<string, Partial<AppState>> | null | undefined>,
  save: (id: string, game: Partial<AppState>) => Promise<unknown>,
): Promise<number> {
  if (Object.keys(repaired).length === 0) return 0;

  const fresh = await readGames();
  let written = 0;
  for (const [id, locationAddress] of Object.entries(repaired)) {
    const game = fresh?.[id];
    // Gone, or somebody got there first: either way, leave it alone.
    if (!game || game.locationAddress) continue;
    await save(id, { ...game, locationAddress });
    written += 1;
  }
  return written;
}
