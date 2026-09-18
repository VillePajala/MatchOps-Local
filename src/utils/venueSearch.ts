/**
 * Venue lookup for match locations.
 *
 * WHY THIS EXISTS. A typed location is a guess: a map has to search for it, and
 * "Keskuskentta" could be any of a dozen places. Picking a real venue attaches
 * COORDINATES to the match, which is the durable part - it makes the map link
 * exact instead of a search, and it is the input any later feature about travel
 * (when to leave, how far the season's away games are) would need. The dropdown
 * is only how those coordinates get captured.
 *
 * WHY PHOTON AND NOT GOOGLE PLACES. Places is the better dataset and it is what
 * Google Calendar uses, but it requires a Google Cloud project with billing
 * enabled - a card on file - before the first request. Photon is search-as-you-
 * type over OpenStreetMap, free, and needs no key, no account and no billing.
 * Its own terms are the honest catch: *"We do not guarantee for the availability
 * and usage might be subject of change in the future"*, and heavy use is
 * throttled. At one coach picking a venue a few times a season that is well
 * inside fair use, and EVERY failure path here degrades to a plain text box
 * rather than blocking the form - see `searchVenues`.
 *
 * `lang=default` deliberately: Photon supports only default/de/en/fr, and
 * `default` returns the local OSM name, which for Finland is the Finnish one.
 *
 * @module venueSearch
 */

/** Roughly Finland, as lon/lat corners. Biases results without excluding others. */
const FINLAND_BBOX = '19.0,59.7,31.6,70.1';

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';

/** How many suggestions are worth showing on a phone without a scroll. */
const RESULT_LIMIT = 5;

export interface VenueSuggestion {
  /** Stable within one result set; Photon ids are not durable enough to store. */
  key: string;
  /** What the venue is called, e.g. "Kimpisen kentta". */
  name: string;
  /** Town and region, for telling two identically named pitches apart. */
  context: string;
  /** The town alone. Kept as a field rather than parsed back out of `context`,
   *  whose first part is the STREET whenever the venue has both. */
  town: string | null;
  /** Street and number, when OSM has them. This is the half a map can find
   *  and a parent can be sent; the name is the half they recognise. */
  address: string | null;
  latitude: number;
  longitude: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

/**
 * Turn one Photon feature into a suggestion, or null when it cannot be used.
 *
 * A result with no coordinates is worthless here - coordinates are the entire
 * point - and a result with no name has nothing to show, so both are dropped
 * rather than rendered as a blank row.
 */
function toSuggestion(feature: PhotonFeature, index: number): VenueSuggestion | null {
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [longitude, latitude] = coords;
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null;

  const p = feature.properties ?? {};

  // THE HOUSE NUMBER MATTERS, and dropping it was a real fault: searching
  // "Mannerheimintie 10" returned the right buildings and then showed them as
  // plain "Mannerheimintie", so the address looked unfindable when Photon had
  // in fact found it. The number comes back as its own field and has to be
  // recombined with the street by hand.
  const street = str(p.street);
  const number = str(p.housenumber);
  const address = street && number ? `${street} ${number}` : street;

  // A venue's own name wins; otherwise the address IS the name.
  const name = str(p.name) ?? address;
  if (!name) return null;

  const town = str(p.city) ?? str(p.county);
  const context = [
    // Only when the name is not already the address, or it reads twice.
    name === address ? null : address,
    town,
    str(p.state),
  ]
    .filter(Boolean)
    .join(', ');

  return {
    key: `${latitude},${longitude},${index}`,
    name,
    context,
    town,
    address,
    latitude,
    longitude,
  };
}

/**
 * Suggestions for what the coach has typed so far.
 *
 * NEVER THROWS, and that is the contract the callers rely on. This runs on every
 * keystroke behind a form the coach is in the middle of filling in: a throttled
 * endpoint, a dead network at a pitch, or a change to Photon's response shape
 * must all end as "no suggestions", leaving an ordinary text box behind. An
 * aborted request (the next keystroke superseding this one) is likewise not a
 * failure and returns empty.
 *
 * @param query what the coach has typed; short strings return nothing, because
 *   one or two letters match half of Finland and cost a request to say so.
 * @param signal aborts the request when the query moves on.
 */
export async function searchVenues(
  query: string,
  signal?: AbortSignal,
): Promise<VenueSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  try {
    const url =
      `${PHOTON_ENDPOINT}?q=${encodeURIComponent(q)}` +
      `&limit=${RESULT_LIMIT}&lang=default&bbox=${FINLAND_BBOX}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return [];

    const body: unknown = await response.json();
    const features = (body as { features?: unknown })?.features;
    if (!Array.isArray(features)) return [];

    return features
      .map((f, i) => toSuggestion(f as PhotonFeature, i))
      .filter((s): s is VenueSuggestion => s !== null);
  } catch {
    // Aborted, offline, throttled, or an unexpected shape. All the same here:
    // the coach keeps a text box that works.
    return [];
  }
}

/**
 * What gets STORED when a suggestion is picked - deliberately shorter than what
 * was shown while picking.
 *
 * The full context ("Jonni Myyrän tie 3, Savitaipale, Etelä-Karjala") exists to
 * tell two similarly named venues apart in the dropdown. Once one is chosen
 * that job is done, and the coordinates carry the precision from then on - so
 * keeping the whole string only makes a location that truncates everywhere it
 * is displayed, as it did on the owner's next-match card.
 *
 * The town is kept because it survives being read out loud and answers "which
 * Keskuskenttä"; the street and region are dropped.
 */
export function venueLabel(suggestion: VenueSuggestion): string {
  const { name, town } = suggestion;
  if (!town || name.includes(town)) return name;
  return `${name}, ${town}`;
}

/**
 * What gets shown as "this is the place you pinned", under a venue the coach
 * has renamed.
 *
 * Deliberately the ADDRESS rather than the label: the whole reason renaming is
 * allowed is that the map's name and the coach's name are different facts, so
 * echoing the map's name back adds nothing once they have replaced it. The
 * street and town are what a map can find and what a parent can be sent, and
 * they are what makes a stale pin visible instead of silent.
 *
 * Falls back to the venue's own name for a place OSM has no street for - a
 * pitch in a field still has a town, and "somewhere in Savitaipale" beats
 * showing nothing at all.
 */
export function venuePinLabel(suggestion: VenueSuggestion): string {
  const { address, town, name } = suggestion;
  const head = address ?? name;
  if (!town || head.includes(town)) return head;
  return `${head}, ${town}`;
}
