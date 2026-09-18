/**
 * When to leave for a match.
 *
 * THE OWNER'S CORRECTION IS WHAT MAKES THIS CORRECT. A departure time is not
 * kick-off minus the drive: you have to BE at the ground a fixed time before
 * kick-off, for warm-up, the lineup and changing. So it is
 *
 *     departure = kickoff - arrivalBuffer - travelTime
 *
 * Omit the buffer and you produce a time that is confidently and uselessly
 * late, which is worse than showing nothing.
 *
 * NO ROUTING API, DELIBERATELY. Checked 2026-09-17: the OSRM demo server is
 * "not intended for production use", capped at one request per second, and may
 * be withdrawn "at any time and without giving a reason"; the Valhalla/FOSSGIS
 * demo carries the same fair-use terms. A shipped product cannot lean on
 * either. So the distance is a haversine between two points - exact, offline,
 * nobody's terms - and the time is derived from it.
 *
 * AND THE DERIVED TIME IS AN ESTIMATE, SAID PLAINLY. Straight-line distance
 * times a detour factor, over an assumed speed, is a guess about roads it has
 * never seen. It is useful and it must never be dressed as a promise; callers
 * carry `isEstimate` for exactly that reason. A time the coach has confirmed
 * from actually driving it replaces the guess and is not an estimate at all.
 *
 * @module travelPlan
 */

/** Mean radius of the Earth in kilometres. */
const EARTH_RADIUS_KM = 6371;

/**
 * Roads are longer than straight lines. 1.3 is the usual planning figure for
 * road networks and is about right for Finnish regional driving, where the lake
 * geography bends routes more than the flat-country average.
 */
const DETOUR_FACTOR = 1.3;

/**
 * Average door-to-door speed in km/h, not a speed limit. Mixed town and
 * highway driving with junctions and a car park at the end.
 */
const ASSUMED_SPEED_KMH = 60;

/**
 * Minutes to be AT the ground before kick-off: warm-up, the lineup, changing.
 * A DEFAULT, NOT A CONSTANT. Thirty minutes is the usual figure, but a cup tie
 * or a tournament may ask for an hour - so this is only the starting value, and
 * both the settings and an individual match can override it.
 */
export const DEFAULT_ARRIVAL_BUFFER_MINUTES = 30;

/** Below this, the drive is dominated by parking and walking, not distance. */
const MINIMUM_TRAVEL_MINUTES = 5;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle distance in kilometres. Exact, offline, and honest as long as
 * it is described as the crow flies.
 */
export function distanceKm(from: Coordinates, to: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Minutes of driving, guessed from the distance. Never less than the walk. */
export function estimateTravelMinutes(from: Coordinates, to: Coordinates): number {
  const roadKm = distanceKm(from, to) * DETOUR_FACTOR;
  return Math.max(MINIMUM_TRAVEL_MINUTES, Math.round((roadKm / ASSUMED_SPEED_KMH) * 60));
}

export interface TravelPlan {
  /** "HH:MM" - when to set off. */
  departure: string;
  /** "HH:MM" - when to be at the ground. */
  arriveBy: string;
  travelMinutes: number;
  /** The buffer actually used, so the UI can show which figure is in force. */
  arrivalBufferMinutes: number;
  /** True when travelMinutes was guessed rather than confirmed by the coach. */
  isEstimate: boolean;
  /** As the crow flies, for anything that wants to show the distance. */
  distanceKm: number;
  /** The departure is the day BEFORE the match - a very long drive. */
  departsPreviousDay: boolean;
}

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

const toClock = (minutes: number): string => {
  // Wrap into the day, so a departure before midnight reads as a time rather
  // than as a negative number.
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Work out when to leave, or null when anything needed is missing.
 *
 * RETURNS NULL RATHER THAN GUESSING. No kick-off time, no pinned venue, no
 * starting point - each of those makes the answer fiction, and a confident
 * wrong departure time is the one output nobody wants.
 *
 * @param kickoff "HH:MM"
 * @param confirmedTravelMinutes what the coach measured last time, if they have
 */
export function planDeparture(opts: {
  kickoff?: string | null;
  from?: Coordinates | null;
  to?: Coordinates | null;
  arrivalBufferMinutes: number;
  confirmedTravelMinutes?: number | null;
}): TravelPlan | null {
  const { kickoff, from, to, arrivalBufferMinutes, confirmedTravelMinutes } = opts;
  if (!kickoff) return null;
  const kickoffMinutes = toMinutes(kickoff);
  if (kickoffMinutes === null) return null;

  const confirmed =
    typeof confirmedTravelMinutes === 'number' && confirmedTravelMinutes >= 0
      ? Math.round(confirmedTravelMinutes)
      : null;

  // Without both ends there is no distance, and without a confirmed time there
  // is nothing to fall back on.
  if (!from || !to) {
    if (confirmed === null) return null;
  }

  const distance = from && to ? distanceKm(from, to) : 0;
  const travelMinutes = confirmed ?? estimateTravelMinutes(from as Coordinates, to as Coordinates);

  const buffer = Math.max(0, Math.round(arrivalBufferMinutes));
  const arriveByMinutes = kickoffMinutes - buffer;
  const departureMinutes = arriveByMinutes - travelMinutes;

  return {
    departure: toClock(departureMinutes),
    arriveBy: toClock(arriveByMinutes),
    travelMinutes,
    arrivalBufferMinutes: buffer,
    isEstimate: confirmed === null,
    distanceKm: Math.round(distance * 10) / 10,
    departsPreviousDay: departureMinutes < 0,
  };
}

export default planDeparture;
