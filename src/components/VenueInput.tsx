'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineMapPin, HiOutlineXMark } from 'react-icons/hi2';
import { venueLabel, venuePinLabel, type VenueSuggestion } from '@/utils/venueSearch';
import { matchVenues, isKnownVenue, type KnownVenue } from '@/utils/venueBook';
import { useVenueSuggestions, VENUE_MIN_QUERY } from '@/hooks/useVenueSuggestions';

/**
 * The match location: what the coach CALLS the place, plus an optional pin.
 *
 * TWO THINGS, TWO CONTROLS, and that separation is the whole design. A venue
 * has two names - the one the map knows ("Muurarinkatu 4") and the one the
 * coach and the parents say ("Mitta-Keittiöt Areena") - and OpenStreetMap
 * carries the first and almost never the second.
 *
 * An earlier version made one box do both jobs: you searched an address,
 * picked it, then typed over the result to rename it. The owner's verdict was
 * that nobody would ever guess this, and they were right for a reason no hint
 * could have fixed - typing in a search box MEANS searching. Overloading the
 * same keystrokes to mean "rename" asks the coach to unlearn what the control
 * plainly is. So the field now only ever means one thing, and the pin is a
 * separate thing hanging off it with its own search.
 *
 * THE FIELD IS THE NAME. It is what gets stored, what shows on the next-match
 * card, what goes in the match report and the exports. Typing in it always
 * searches, honestly, and editing it can never disturb the pin.
 *
 * ONE TAP STILL DOES BOTH when the map knows the venue. Picking "Kimpisen
 * kenttä" from the list fills the name and attaches its position together -
 * the separate control exists for the places search cannot find, and for
 * changing a pin later, not as an extra step in the common case.
 *
 * YOUR OWN VENUES COME FIRST, and they are why the search rarely has to work
 * at all. Matched locally against the coach's own matches, with no debounce
 * and no network, so their places appear instantly and offline - and a venue
 * the map can never find is findable from the moment it has been used once.
 *
 * IT DEGRADES TO A PLAIN TEXT BOX, always. Offline, throttled, or simply
 * ignored, the typed name is the location exactly as before any of this.
 *
 * @module VenueInput
 * @category Components
 */
export interface VenueInputProps {
  id: string;
  /** What the coach calls this place. The stored, displayed location. */
  value: string;
  onChange: (venue: {
    name: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  }) => void;
  hasCoordinates?: boolean;
  /** The pinned venue's address, as the lookup gave it. */
  address?: string;
  latitude?: number;
  longitude?: number;
  /** Venues this coach has used before, offered ahead of any map result. */
  knownVenues?: readonly KnownVenue[];
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

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
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  /**
   * The label a pick just wrote into the box, so the very next search is not
   * spent rediscovering what was just chosen. A VALUE rather than a one-shot
   * flag on purpose: a flag set where the query does not change stays armed
   * and swallows the next real search, which this shape cannot do.
   */
  const [justPicked, setJustPicked] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { suggestions, isSearching, searchedFor } = useVenueSuggestions(value, justPicked);

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
    isOpen && mapSuggestions.length > 0 && value.trim().length >= VENUE_MIN_QUERY;
  const showOwnVenues = isOpen && ownVenues.length > 0;
  const showSuggestions = showOwnVenues || showMapSuggestions;

  /** Arrow keys and Enter run over both groups as one list, own venues first. */
  const navigable = useMemo(
    () => [
      ...ownVenues.map((own) => ({ own }) as const),
      ...(showMapSuggestions ? mapSuggestions.map((map) => ({ map }) as const) : []),
    ],
    [ownVenues, mapSuggestions, showMapSuggestions],
  );

  /**
   * "Nothing found", only for the text actually searched and only when there
   * is nothing else on offer. It is no longer advice - the attach control
   * below IS the next step - so it just states the fact.
   */
  const foundNothing =
    ownVenues.length === 0 &&
    !isSearching &&
    searchedFor !== null &&
    searchedFor === value.trim() &&
    suggestions.length === 0 &&
    value.trim().length >= VENUE_MIN_QUERY;

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

  const closeList = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  /** A venue from the map: name and pin together, one tap. */
  const pick = useCallback(
    (suggestion: VenueSuggestion) => {
      const name = venueLabel(suggestion);
      setJustPicked(name);
      closeList();
      onChange({
        name,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        address: venuePinLabel(suggestion),
      });
    },
    [onChange, closeList],
  );

  /** A venue the coach has used before: their name, their pin, no search. */
  const pickKnown = useCallback(
    (venue: KnownVenue) => {
      setJustPicked(venue.name);
      closeList();
      onChange({
        name: venue.name,
        latitude: venue.latitude,
        longitude: venue.longitude,
        address: venue.address,
      });
    },
    [onChange, closeList],
  );

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

  /** The pin changes here and ONLY here; the name is never touched. */
  const setPin = useCallback(
    (pin: { latitude: number; longitude: number; address: string } | null) => {
      onChange(
        pin
          ? { name: value, latitude: pin.latitude, longitude: pin.longitude, address: pin.address }
          : { name: value },
      );
    },
    [onChange, value],
  );

  const [isAttaching, setIsAttaching] = useState(false);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          id={id}
          value={value}
          onChange={(e) => {
            setIsOpen(true);
            // The name and the pin are independent: renaming the place never
            // moves it, and there is a separate control for moving it.
            onChange({ name: e.target.value, latitude, longitude, address });
          }}
          // Focusing an empty field offers the venues already played at. After
          // the first match at a pitch there should be nothing left to type.
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
        {isSearching ? (
          <span
            role="status"
            aria-label={t('venueInput.searching', 'Searching for places')}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
          >
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-indigo-300" />
          </span>
        ) : null}
      </div>

      {foundNothing && !hasCoordinates ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-1 text-xs text-slate-400"
        >
          {t('venueInput.noMatches', 'No place of that name on the map. The name is saved as you typed it.')}
        </p>
      ) : null}

      {/* THE PIN, as its own row. Present or absent, it is always visible as a
          separate thing from the name - which is what makes it obvious that
          editing the name above cannot disturb it. */}
      {hasCoordinates ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
          <HiOutlineMapPin className="h-3.5 w-3.5 shrink-0 text-indigo-300" aria-hidden="true" />
          <span className="truncate">
            {address || t('venueInput.pinnedNoAddress', 'Location pinned')}
          </span>
          <button
            type="button"
            onClick={() => setIsAttaching(true)}
            className="shrink-0 rounded px-1 text-indigo-300 underline-offset-2 transition-colors hover:underline"
          >
            {t('venueInput.changePin', 'Change')}
          </button>
          <button
            type="button"
            onClick={() => setPin(null)}
            aria-label={t('venueInput.removePin', 'Remove the pinned location')}
            className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:text-slate-300"
          >
            <HiOutlineXMark className="h-3.5 w-3.5" />
          </button>
        </p>
      ) : value.trim() && !isAttaching ? (
        <button
          type="button"
          onClick={() => setIsAttaching(true)}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-600"
        >
          <HiOutlineMapPin className="h-3.5 w-3.5" />
          {t('venueInput.attachLocation', 'Attach a location by address')}
        </button>
      ) : null}

      {isAttaching ? (
        <PinAttacher
          id={`${id}-pin`}
          onAttach={(pin) => {
            setPin(pin);
            setIsAttaching(false);
          }}
          onCancel={() => setIsAttaching(false)}
        />
      ) : null}

      {showSuggestions ? (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-600 bg-slate-800 shadow-lg"
        >
          {showOwnVenues ? (
            <li role="presentation" className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
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

          {showMapSuggestions && showOwnVenues ? (
            <li role="presentation" className="border-t border-slate-700 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
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
                      // onMouseDown, not onClick: the input's blur would close
                      // the list before a click could land on it.
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

/**
 * The second control: find a position, and nothing else.
 *
 * Its own box, its own label, its own results. Picking here sets the pin and
 * leaves the name alone, which is the entire point of separating them - the
 * coach is searching for WHERE the place is, having already said WHAT it is
 * called.
 */
const PinAttacher: React.FC<{
  id: string;
  onAttach: (pin: { latitude: number; longitude: number; address: string }) => void;
  onCancel: () => void;
}> = ({ id, onAttach, onCancel }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { suggestions, isSearching, searchedFor } = useVenueSuggestions(query);

  const results = query.trim().length >= VENUE_MIN_QUERY ? suggestions : [];
  const nothingHere =
    !isSearching && searchedFor === query.trim() && results.length === 0 && query.trim().length >= VENUE_MIN_QUERY;

  return (
    <div className="mt-2 rounded-md border border-slate-600 bg-slate-800/60 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-slate-300">
          {t('venueInput.attachTitle', 'Find it by street address')}
        </label>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
        >
          {t('venueInput.attachCancel', 'Cancel')}
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          id={id}
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('venueInput.attachPlaceholder', 'e.g. Muurarinkatu 4, Savonlinna')}
          className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
        {isSearching ? (
          <span
            role="status"
            aria-label={t('venueInput.searching', 'Searching for places')}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
          >
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-indigo-300" />
          </span>
        ) : null}
      </div>

      {nothingHere ? (
        <p role="status" aria-live="polite" className="mt-1 text-xs text-slate-400">
          {t('venueInput.attachNothing', 'No match for that address.')}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul role="listbox" className="mt-1 overflow-hidden rounded-md border border-slate-600 bg-slate-800">
          {results.map((s) => (
            <li key={s.key} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() =>
                  onAttach({
                    latitude: s.latitude,
                    longitude: s.longitude,
                    address: venuePinLabel(s),
                  })
                }
                className="w-full px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-slate-700/70"
              >
                <span className="block truncate font-medium">{venuePinLabel(s)}</span>
                {s.name !== venuePinLabel(s) ? (
                  <span className="block truncate text-xs text-slate-400">{s.name}</span>
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
