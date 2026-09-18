'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineMapPin } from 'react-icons/hi2';
import { searchVenues, venueLabel, venuePinLabel, type VenueSuggestion } from '@/utils/venueSearch';
import { matchVenues, isKnownVenue, type KnownVenue } from '@/utils/venueBook';

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
 * TYPING AFTER PICKING KEEPS THE PIN, AND SHOWS WHAT IT IS. This used to clear
 * the coordinates on the first keystroke, on the grounds that a pin which no
 * longer matches the words beside it is worse than no pin because nothing on
 * screen reveals the disagreement. The objection was right; the remedy was
 * wrong. A venue has TWO names - the one the map knows ("Pihlajavedentie 1")
 * and the one the coach and the parents say ("Mitta-Keittiöt Areena") - and
 * OSM carries the first and almost never the second. Forbidding the edit meant
 * a pinned venue could only ever be called what the map calls it.
 *
 * So the pinned address is displayed under the field instead. The name and the
 * place are then both on screen and cannot drift apart unnoticed, which is what
 * the old rule was actually protecting. Emptying the field drops the pin, and
 * the address line carries an explicit way to remove it.
 *
 * YOUR OWN VENUES COME FIRST, and they are the reason the search rarely has to
 * work at all. A pitch played eight times a season should be recognised, not
 * re-searched: the book is matched locally against what the coach has typed,
 * with no debounce and no network, so their own places appear instantly and
 * offline - and a venue the map can never find (a sponsor name) is findable
 * from the moment it has been used once. Focusing an empty field offers the
 * recent ones outright, because a coach who has to type before being
 * recognised is still doing the typing.
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
  /** Emits the venue name, plus the pin when there is one. */
  onChange: (venue: {
    name: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  }) => void;
  /** True when the current value came from a pick, so the pin can be shown. */
  hasCoordinates?: boolean;
  /** The pinned venue's address, shown when it differs from the typed name. */
  address?: string;
  /** Venues this coach has used before, offered ahead of any map result. */
  knownVenues?: readonly KnownVenue[];
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
  address,
  latitude,
  longitude,
  knownVenues,
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
  // Set while a pick is being applied, so the resulting value change does not
  // immediately fire another search for the name we just inserted.
  const justPickedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derived, not stored: the list is only ever shown for the value on screen
  // right now, so suggestions left over from a longer query cannot reappear
  // when the coach deletes back to two letters.
  /**
   * The coach's own venues for what is typed so far. Local, so there is no
   * debounce and no minimum length: these appear on the first character, and
   * on focus before there is one.
   */
  const ownVenues = useMemo(
    () => matchVenues(knownVenues ?? [], value),
    [knownVenues, value],
  );

  /**
   * Map results, minus anything the book already offers. Without this the same
   * pitch appears twice - once under the coach's name for it and once under
   * the map's - and the two rows disagree about what the place is called.
   */
  const mapSuggestions = useMemo(
    () => suggestions.filter((s) => !isKnownVenue(knownVenues ?? [], venueLabel(s))),
    [suggestions, knownVenues],
  );

  const showMapSuggestions =
    isOpen && mapSuggestions.length > 0 && value.trim().length >= MIN_QUERY;
  const showOwnVenues = isOpen && ownVenues.length > 0;
  const showSuggestions = showOwnVenues || showMapSuggestions;

  /** Arrow keys and Enter run over both groups as one list, own venues first. */
  const navigable: Array<{ own: KnownVenue } | { map: VenueSuggestion }> = useMemo(
    () => [
      ...ownVenues.map((own) => ({ own })),
      ...(showMapSuggestions ? mapSuggestions.map((map) => ({ map })) : []),
    ],
    [ownVenues, mapSuggestions, showMapSuggestions],
  );

  /**
   * "Nothing found", shown only for the text actually searched.
   *
   * A SILENT EMPTY RESULT READS AS A BROKEN FIELD. OpenStreetMap knows venues
   * by their real names, not their sponsors: "Mitta-Keittiöt Areena" returns
   * nothing while "jäähalli Savonlinna" finds the same building. Without a
   * word on screen the coach cannot tell that apart from a failed lookup, and
   * the useful advice - try the plain name, or just type it - never arrives.
   */
  /**
   * A pin whose address is no longer what the field says - i.e. the coach has
   * renamed the venue. Derived rather than stored so it tracks every edit.
   */
  const pinnedElsewhere =
    Boolean(address) && Boolean(hasCoordinates) && address !== value.trim();

  const foundNothing =
    // Never while the coach's own venues are on screen - the field has plainly
    // found something, and the advice to try a plainer name is nonsense there.
    ownVenues.length === 0 &&
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
        // Deliberately NOT touching isOpen. The search used to open the list on
        // results and close it on none, which meant an empty map lookup shut
        // the list on the coach's OWN venues sitting in it - the one group that
        // had matched. Typing and focus open it now; picking, Escape and a tap
        // outside close it. Whether anything is worth showing is derived.
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
        address: venuePinLabel(suggestion),
      });
    },
    [onChange],
  );

  /**
   * Picking a venue the coach has used before: their name, their pin, no
   * search. This is the path that should carry almost every match after the
   * first one at a given pitch.
   */
  const pickKnown = useCallback(
    (venue: KnownVenue) => {
      justPickedRef.current = true;
      setIsSearching(false);
      setSearchedFor(null);
      setIsOpen(false);
      setSuggestions([]);
      setActiveIndex(-1);
      onChange({
        name: venue.name,
        latitude: venue.latitude,
        longitude: venue.longitude,
        address: venue.address,
      });
    },
    [onChange],
  );

  /** Whichever row the arrow keys are on, in the combined list. */
  const pickAt = useCallback(
    (index: number) => {
      const row = navigable[index];
      if (!row) return;
      if ('own' in row) pickKnown(row.own);
      else pick(row.map);
    },
    [pickKnown, pick, navigable],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % navigable.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? navigable.length - 1 : i - 1));
        return;
      }
      if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        pickAt(activeIndex);
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
          // THE PIN SURVIVES EVERY EDIT, including one that empties the field.
          // Dropping it on empty looked safer and was not: selecting all and
          // retyping is how people rename, and that passes through empty on
          // the way - so the safe-looking rule destroyed the pin in the middle
          // of the exact gesture this feature exists to allow. Removal is the
          // × on the address line instead: explicit, and visible the whole
          // time, which is the same thing that stops a renamed pin going stale.
          onChange={(e) => {
            setIsOpen(true);
            onChange({ name: e.target.value, latitude, longitude, address });
          }}
          // Focusing an empty field offers the venues already played at. A
          // coach who must type before being recognised is still doing the
          // typing, and after the first match at a pitch there is nothing left
          // to type.
          onFocus={() => setIsOpen(true)}
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
        <p
          // It arrives after an async search, so without a live region a screen
          // reader never learns the list came back empty - the field just stays
          // silent, which is the very confusion this message exists to end.
          role="status"
          aria-live="polite"
          className="mt-1 text-xs text-slate-400"
        >
          {t(
            'venueInput.noMatches',
            'No places found. Try the venue\'s plain name, or just type it - the location is saved either way.',
          )}
        </p>
      ) : null}

      {/* Shown only once the two disagree: right after a pick the field already
          reads as the address, and repeating it underneath is noise. The moment
          the coach renames the venue it appears, which is exactly when a pin
          could otherwise go stale unseen. */}
      {pinnedElsewhere ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
          <HiOutlineMapPin className="h-3.5 w-3.5 shrink-0 text-indigo-300" aria-hidden="true" />
          <span className="truncate">{address}</span>
          <button
            type="button"
            onClick={() => onChange({ name: value })}
            className="shrink-0 rounded px-1 text-slate-500 transition-colors hover:text-slate-300"
            aria-label={t('venueInput.removePin', 'Remove the pinned location')}
          >
            ×
          </button>
        </p>
      ) : null}

      {showSuggestions ? (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-600 bg-slate-800 shadow-lg"
        >
          {/* The coach's own venues, first and visibly theirs. A pin icon
              marks the ones that carry a position, since that is what makes
              the car button work without ever searching again. */}
          {showOwnVenues ? (
            <li role="presentation" className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t('venueInput.yourVenues', 'Your venues')}
            </li>
          ) : null}
          {ownVenues.map((venue, i) => (
            <li key={`own-${venue.name}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickKnown(venue);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === activeIndex ? 'bg-slate-700 text-white' : 'text-slate-200 hover:bg-slate-700/70'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{venue.name}</span>
                  {venue.address && venue.address !== venue.name ? (
                    <span className="block truncate text-xs text-slate-400">{venue.address}</span>
                  ) : null}
                </span>
                {venue.latitude !== undefined ? (
                  <HiOutlineMapPin
                    className="h-4 w-4 shrink-0 text-indigo-300"
                    aria-label={t('venueInput.pinned', 'Pinned to a map location')}
                  />
                ) : null}
              </button>
            </li>
          ))}

          {/* Places the coach has not been yet. Anything already in the book
              is filtered out upstream so one pitch never appears twice. */}
          {showMapSuggestions && showOwnVenues ? (
            <li role="presentation" className="border-t border-slate-700 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t('venueInput.fromMap', 'From the map')}
            </li>
          ) : null}
          {showMapSuggestions
            ? mapSuggestions.map((s, i) => {
                const index = ownVenues.length + i;
                return (
                  <li key={s.key} role="option" aria-selected={index === activeIndex}>
                    <button
                      type="button"
                      // onMouseDown, not onClick: the input's blur would otherwise
                      // close the list before the click could land on it.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(s);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                        index === activeIndex ? 'bg-slate-700 text-white' : 'text-slate-200 hover:bg-slate-700/70'
                      }`}
                    >
                      <span className="block truncate font-medium">{s.name}</span>
                      {s.context ? (
                        <span className="block truncate text-xs text-slate-400">{s.context}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            : null}
        </ul>
      ) : null}
    </div>
  );
};

export default VenueInput;
