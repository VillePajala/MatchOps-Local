'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { HiOutlineMapPin } from 'react-icons/hi2';
import { searchVenues, guessRegionFor, venueLabel, type VenueSuggestion } from '@/utils/venueSearch';

/**
 * Leaflet and its stylesheet are a real weight, and most coaches find their
 * venue by typing and never open a map at all. Splitting the picker out keeps
 * all of it off the first load and fetches it only on the tap that needs it.
 */
const VenueMapPicker = dynamic(() => import('@/components/VenueMapPicker'), { ssr: false });

/**
 * The match location field: an ordinary text box that offers real venues.
 *
 * THE COORDINATES ARE THE POINT, not the dropdown. Picking a suggestion attaches
 * a position to the match, which turns the map link from a search into an exact
 * place and gives the venue an identity that does not depend on spelling. The
 * list is only how that gets captured.
 *
 * PICKING ADOPTS THE OFFICIAL NAME, and that is a data-quality decision rather
 * than a cosmetic one. Left as free text, one pitch accumulates "Kimpinen",
 * "Kimpisen kentta" and "kimpisen" across a season and stops grouping - the
 * same failure the opponent-name work had to clean up, and the app already
 * answers it the same way there by adopting the spelling in use.
 *
 * TYPING AFTER PICKING CLEARS THE COORDINATES. A pin that no longer matches the
 * words beside it is worse than no pin, because nothing on screen reveals the
 * disagreement. Re-picking re-attaches one.
 *
 * IT DEGRADES TO A PLAIN TEXT BOX, always. Offline at a pitch, a throttled
 * endpoint, or a coach who simply ignores the list all end in the same place:
 * the typed name is the location, exactly as before this existed.
 *
 * @module VenueInput
 * @category Components
 */
export interface VenueInputProps {
  id: string;
  value: string;
  /** Emits the venue name plus coordinates when one was picked. */
  onChange: (venue: { name: string; latitude?: number; longitude?: number }) => void;
  /** True when the current value came from a pick, so the pin can be shown. */
  hasCoordinates?: boolean;
  /** The pin already on this venue, if any - where the map picker opens. */
  latitude?: number;
  longitude?: number;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/** Long enough that the coach has stopped typing, short enough to feel live. */
const DEBOUNCE_MS = 300;

/** Below this, a query matches half of Finland and costs a request to say so. */
const MIN_QUERY = 3;

export const VenueInput: React.FC<VenueInputProps> = ({
  id,
  value,
  onChange,
  hasCoordinates,
  latitude,
  longitude,
  placeholder,
  className,
  onKeyDown,
}) => {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<VenueSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Photon is a free public service and can take a second or more to answer.
  // Without a sign that anything is happening, the field looks broken and the
  // coach keeps typing - which cancels the request they were waiting for.
  const [isSearching, setIsSearching] = useState(false);
  // The query the last completed search was FOR, so "nothing found" can be
  // shown for that exact text and not linger over the next keystroke.
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  // Whether mapCenter is the venue itself or only the town we guessed from the
  // typed name - the picker zooms differently for each.
  const [mapCenterIsGuess, setMapCenterIsGuess] = useState(false);
  // Looking up where to open the map, so the button can say it is working.
  const [isResolvingMap, setIsResolvingMap] = useState(false);
  // Set while a pick is being applied, so the resulting value change does not
  // immediately fire another search for the name we just inserted.
  const justPickedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derived, not stored: the list is only ever shown for the value on screen
  // right now, so suggestions left over from a longer query cannot reappear
  // when the coach deletes back to two letters.
  const showSuggestions = isOpen && suggestions.length > 0 && value.trim().length >= MIN_QUERY;

  /**
   * "Nothing found", shown only for the text actually searched.
   *
   * A SILENT EMPTY RESULT READS AS A BROKEN FIELD. OpenStreetMap knows venues
   * by their real names, not their sponsors: "Mitta-Keittiöt Areena" returns
   * nothing while "jäähalli Savonlinna" finds the same building. Without a
   * word on screen the coach cannot tell that apart from a failed lookup, and
   * the useful advice - try the plain name, or just type it - never arrives.
   */
  const foundNothing =
    !isSearching &&
    searchedFor !== null &&
    searchedFor === value.trim() &&
    suggestions.length === 0 &&
    value.trim().length >= MIN_QUERY;

  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    const query = value.trim();
    // Nothing to clear here on purpose: `showSuggestions` below derives
    // visibility from the current value, so a too-short query hides the list
    // without a synchronous setState in an effect body (which cascades renders,
    // and which react-hooks/set-state-in-effect rightly refuses).
    if (query.length < MIN_QUERY) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchVenues(query, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setActiveIndex(-1);
        setIsOpen(results.length > 0);
        setSearchedFor(query);
      } finally {
        // Not in the aborted branch alone: a superseded request must also stop
        // the spinner, or it spins forever on the last keystroke of a word.
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  // A tap outside is a dismissal, not a choice.
  useEffect(() => {
    if (!showSuggestions) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [showSuggestions]);

  const pick = useCallback(
    (suggestion: VenueSuggestion) => {
      justPickedRef.current = true;
      setIsSearching(false);
      setSearchedFor(null);
      setIsOpen(false);
      setSuggestions([]);
      setActiveIndex(-1);
      onChange({
        name: venueLabel(suggestion),
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      });
    },
    [onChange],
  );

  /**
   * Opening the picker resolves its starting point FIRST, rather than opening
   * on Finland and jumping once a guess arrives. A map that moves under the
   * coach while they are already panning is worse than a brief wait.
   */
  const openMap = useCallback(async () => {
    setIsOpen(false);
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      setMapCenter({ latitude, longitude });
      setMapCenterIsGuess(false);
      setIsMapOpen(true);
      return;
    }
    setIsResolvingMap(true);
    const guess = await guessRegionFor(value);
    setIsResolvingMap(false);
    setMapCenter(guess ? { latitude: guess.latitude, longitude: guess.longitude } : null);
    setMapCenterIsGuess(guess !== null);
    setIsMapOpen(true);
  }, [latitude, longitude, value]);

  /**
   * THE NAME IS THE COACH'S, THE COORDINATES ARE THE MAP'S. This is the whole
   * point of the picker: the sponsor name search cannot find is exactly the
   * name they want on the card, so pinning keeps the typed text untouched.
   */
  const pickFromMap = useCallback(
    (coords: { latitude: number; longitude: number }) => {
      justPickedRef.current = true;
      setIsMapOpen(false);
      setSearchedFor(null);
      setSuggestions([]);
      onChange({ name: value, latitude: coords.latitude, longitude: coords.longitude });
    },
    [onChange, value],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        pick(suggestions[activeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          id={id}
          value={value}
          onChange={(e) => onChange({ name: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={className}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          aria-controls={`${id}-suggestions`}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
        {/* The pin is the only signal that this location is pinned to a real
            place rather than a string, so it earns its space. */}
        {/* One slot, three states: searching beats pinned, because the
            spinner answers the question the coach is asking right now. */}
        {isSearching ? (
          <span
            role="status"
            aria-label={t('venueInput.searching', 'Searching for places')}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
          >
            <span className="block w-4 h-4 rounded-full border-2 border-slate-500 border-t-indigo-300 animate-spin" />
          </span>
        ) : hasCoordinates && !showSuggestions ? (
          <HiOutlineMapPin
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-300"
            aria-label={t('venueInput.pinned', 'Pinned to a map location')}
          />
        ) : null}
      </div>

      {foundNothing ? (
        <div
          // It arrives after an async search, so without a live region a screen
          // reader never learns the list came back empty - the field just stays
          // silent, which is the very confusion this message exists to end.
          role="status"
          aria-live="polite"
          className="mt-1 text-xs text-slate-400"
        >
          <p>
            {t(
              'venueInput.noMatches',
              'No places found. Try the venue\'s plain name, or just type it - the location is saved either way.',
            )}
          </p>
          {/* The escape hatch for a name OSM does not carry. Offered HERE
              specifically, because "nothing found" is the moment the coach
              learns typing will not get them a pin - and they still know
              perfectly well where the place is. */}
          <button
            type="button"
            onClick={openMap}
            disabled={isResolvingMap}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-600 disabled:opacity-60"
          >
            <HiOutlineMapPin className="h-3.5 w-3.5" />
            {isResolvingMap
              ? t('venueInput.openingMap', 'Opening map...')
              : t('venueInput.chooseOnMap', 'Choose on map')}
          </button>
        </div>
      ) : null}

      {isMapOpen ? (
        <VenueMapPicker
          initialCenter={mapCenter}
          centerIsApproximate={mapCenterIsGuess}
          venueName={value}
          onCancel={() => setIsMapOpen(false)}
          onPick={pickFromMap}
        />
      ) : null}

      {showSuggestions ? (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-600 bg-slate-800 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.key} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                // onMouseDown, not onClick: the input's blur would otherwise
                // close the list before the click could land on it.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  i === activeIndex ? 'bg-slate-700 text-white' : 'text-slate-200 hover:bg-slate-700/70'
                }`}
              >
                <span className="block truncate font-medium">{s.name}</span>
                {s.context ? (
                  <span className="block truncate text-xs text-slate-400">{s.context}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export default VenueInput;
