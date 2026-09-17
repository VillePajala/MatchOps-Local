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
  // Fall back to the street for venues OSM knows by address rather than name.
  const name = str(p.name) ?? str(p.street);
  if (!name) return null;

  const context = [str(p.city) ?? str(p.county), str(p.state)].filter(Boolean).join(', ');

  return {
    key: `${latitude},${longitude},${index}`,
    name,
    context,
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

/** How a chosen suggestion reads in the field: the venue, then where it is. */
export function venueLabel(suggestion: VenueSuggestion): string {
  return suggestion.context ? `${suggestion.name}, ${suggestion.context}` : suggestion.name;
}
