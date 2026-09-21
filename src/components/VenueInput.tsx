'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineMapPin, HiOutlinePlus } from 'react-icons/hi2';
import { venuePinLabel, type VenueSuggestion } from '@/utils/venueSearch';
import { matchVenues, isKnownVenue, type KnownVenue } from '@/utils/venueBook';
import { useVenueSuggestions, VENUE_MIN_QUERY } from '@/hooks/useVenueSuggestions';

/**
 * The match location: two labelled fields, because it is two facts.
 *
 * WHAT WENT WRONG BEFORE. A venue has two names - the one the coach and the
 * parents say ("Mitta-Keittiöt Areena") and the one the map knows
 * ("Muurarinkatu 4") - and OpenStreetMap carries the second and almost never
 * the first. Two earlier attempts tried to fit both into one box: first by
 * having the coach type over a picked result to rename it, then by hiding the
 * second job behind a button. The owner's test killed both. Typing over a
 * result reads as firing another search, because in a search box it IS one.
 * And a control behind a button has to be guessed at - the owner typed the
 * street address into the box, pressed the button expecting to name the place,
 * and was asked for a street address.
 *
 * THE FIX IS TO STOP HIDING EITHER ONE. Two fields, both always visible, each
 * labelled for exactly what it holds - and, crucially, each searching the
 * thing its own label names:
 *
 *   Paikan nimi   - what you call it. Completes from YOUR OWN venues.
 *   Katuosoite    - where it is. Searches the map.
 *
 * Nothing overlaps, so there is nothing to work out. The name box never
 * queries the map, so it can never surprise the coach with places they did not
 * ask for; the address box never rewrites the name.
 *
 * ONE TAP STILL DOES BOTH, in both directions. Picking one of your own venues
 * by name fills the address and its pin too. Picking from the address search
 * fills the name as well, but ONLY when the name is still empty - a coach who
 * has already written "Mitta-Keittiöt Areena" must never have it replaced by
 * an address.
 *
 * THE PIN COMES FROM PICKING, and only from picking. Typing in the address box
 * is searching, so editing it after a pick drops the coordinates - the same
 * rule as any search box, and safe here precisely because this box is never
 * used for naming.
 *
 * IT DEGRADES TO PLAIN TEXT BOXES, always. Offline, throttled or simply
 * ignored, both fields keep whatever was typed.
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
  address?: string;
  latitude?: number;
  longitude?: number;
  knownVenues?: readonly KnownVenue[];
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
  className,
  onKeyDown,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  const [nameOpen, setNameOpen] = useState(false);
  const [nameActive, setNameActive] = useState(-1);

  /** Your own venues, matched locally - no debounce, no network, works offline. */
  const ownVenues = useMemo(
    () => matchVenues(knownVenues ?? [], value),
    [knownVenues, value],
  );
  /**
   * "Keep what I typed" as an explicit row.
   *
   * WITHOUT IT, NOTHING SAYS A NEW VENUE IS ALLOWED. The owner typed
   * "Mitta-Keittiöt Areena", saw two similar venues they had used before, and
   * read the list as the only permitted answers - as if the right move were to
   * keep trying spellings until one matched. Walking away from a list of
   * suggestions is a valid action that no suggestion list ever announces.
   *
   * Offered only when the name is not already one of theirs, since confirming
   * a venue they have used is what tapping it in the list does.
   */
  const typedName = value.trim();
  const canCreate = typedName.length > 0 && !isKnownVenue(knownVenues ?? [], typedName);

  const showOwnVenues = nameOpen && (ownVenues.length > 0 || canCreate);

  // A tap outside is a dismissal, not a choice.
  useEffect(() => {
    if (!showOwnVenues) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setNameOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [showOwnVenues]);

  /** A venue used before: its name, its address and its pin, in one tap. */
  const pickKnown = useCallback(
    (venue: KnownVenue) => {
      setNameOpen(false);
      setNameActive(-1);
      onChange({
        name: venue.name,
        latitude: venue.latitude,
        longitude: venue.longitude,
        address: venue.address,
      });
    },
    [onChange],
  );

  /**
   * Take the typed name as it stands. Nothing to emit - the field already holds
   * it - so this only dismisses the list and moves the coach on to the address,
   * which is the step they would reach for next anyway.
   */
  const keepTypedName = useCallback(() => {
    setNameOpen(false);
    setNameActive(-1);
    addressRef.current?.focus();
  }, []);

  // The create row is the last stop in the list, so the arrows reach it.
  const rowCount = ownVenues.length + (canCreate ? 1 : 0);

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showOwnVenues) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setNameActive((i) => (i + 1) % rowCount);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setNameActive((i) => (i <= 0 ? rowCount - 1 : i - 1));
        return;
      }
      if (e.key === 'Enter' && nameActive >= 0) {
        e.preventDefault();
        if (nameActive < ownVenues.length) pickKnown(ownVenues[nameActive]);
        else keepTypedName();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setNameOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  /** From the address search: the position, and the name only if none yet. */
  const pickAddress = useCallback(
    (suggestion: VenueSuggestion) => {
      const pin = venuePinLabel(suggestion);
      // THE HOUSE NUMBER THE COACH TYPED SURVIVES A STREET-ONLY HIT (owner,
      // 2026-09-21). OpenStreetMap has no numbers for many Finnish streets, so
      // "Puusepänkatu 1" comes back as the street alone, and storing that
      // label lost the number - the map then routed to whichever door was
      // nearest the street's midpoint. When the coach wrote a number and the
      // lookup found none, the written address is kept (with the town the
      // lookup did find) and the pin marks the street.
      const typed = address?.trim() ?? '';
      const typedHasNumber = /\d/.test(typed);
      const hitHasNumber = /\d/.test(suggestion.address ?? '');
      const keepTyped = typedHasNumber && !hitHasNumber;
      const withTown = (text: string) =>
        suggestion.town && !text.toLowerCase().includes(suggestion.town.toLowerCase())
          ? `${text}, ${suggestion.town}`
          : text;
      onChange({
        // A coach who has already named the place must never have it replaced
        // by an address; one who has not gets the venue's own name for free.
        name: value.trim() || suggestion.name,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        address: keepTyped ? withTown(typed) : pin,
      });
    },
    [onChange, value, address],
  );

  /** Editing the address is searching again, so the old pin no longer applies. */
  const typeAddress = useCallback(
    (text: string) => onChange({ name: value, address: text || undefined }),
    [onChange, value],
  );

  return (
    <div ref={containerRef} className="space-y-3">
      <div className="relative">
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-300">
          {t('venueInput.nameLabel', 'Venue name (optional)')}
        </label>
        <input
          type="text"
          id={id}
          value={value}
          onChange={(e) => {
            setNameOpen(true);
            // The name is only ever a name. It never moves the pin, and the
            // pin never rewrites it.
            onChange({ name: e.target.value, latitude, longitude, address });
          }}
          onFocus={() => setNameOpen(true)}
          onKeyDown={handleNameKeyDown}
          placeholder={t('venueInput.namePlaceholder', 'What you call the place')}
          className={className}
          role="combobox"
          aria-expanded={showOwnVenues}
          aria-autocomplete="list"
          aria-controls={`${id}-own`}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />

        {showOwnVenues ? (
          <ul
            id={`${id}-own`}
            role="listbox"
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-600 bg-slate-800 shadow-lg"
          >
            <li role="presentation" className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t('venueInput.yourVenues', 'Your venues')}
            </li>
            {ownVenues.map((venue, i) => (
              <li key={`own-${venue.name}`} role="option" aria-selected={i === nameActive}>
                <button
                  type="button"
                  // onMouseDown, not onClick: the input's blur would close the
                  // list before a click could land on it.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickKnown(venue);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    i === nameActive ? 'bg-slate-700 text-white' : 'text-slate-200 hover:bg-slate-700/70'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{venue.name}</span>
                    {venue.address ? (
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

            {canCreate ? (
              <li role="option" aria-selected={nameActive === ownVenues.length}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    keepTypedName();
                  }}
                  className={`flex w-full items-center gap-2 border-t border-slate-700 px-3 py-2 text-left text-sm transition-colors ${
                    nameActive === ownVenues.length
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-300 hover:bg-slate-700/70'
                  }`}
                >
                  <HiOutlinePlus className="h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />
                  <span className="truncate">
                    {t('venueInput.useTypedName', 'Use "{{name}}" as a new place', { name: typedName })}
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <AddressField
        inputRef={addressRef}
        id={`${id}-address`}
        value={address ?? ''}
        hasCoordinates={Boolean(hasCoordinates)}
        className={className}
        onType={typeAddress}
        onPick={pickAddress}
      />
    </div>
  );
};

/**
 * The second field: where the place is, and nothing else.
 *
 * It searches the map, which is what "street address" means, and it is the
 * ONLY thing here that does. Its results carry coordinates, and those are what
 * make the directions button exact instead of a text search a map has to guess
 * at - so picking, rather than typing, is what counts.
 */
const AddressField: React.FC<{
  inputRef?: React.Ref<HTMLInputElement>;
  id: string;
  value: string;
  hasCoordinates: boolean;
  className?: string;
  onType: (text: string) => void;
  onPick: (suggestion: VenueSuggestion) => void;
}> = ({ inputRef, id, value, hasCoordinates, className, onType, onPick }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { suggestions, isSearching, searchedFor } = useVenueSuggestions(
    value,
    hasCoordinates ? value.trim() : null,
  );

  const results =
    isOpen && !hasCoordinates && value.trim().length >= VENUE_MIN_QUERY ? suggestions : [];

  const nothingFound =
    isOpen &&
    !hasCoordinates &&
    !isSearching &&
    searchedFor === value.trim() &&
    suggestions.length === 0 &&
    value.trim().length >= VENUE_MIN_QUERY;

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-300">
        {t('venueInput.addressLabel', 'Street address (optional)')}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          id={id}
          value={value}
          onChange={(e) => {
            setIsOpen(true);
            onType(e.target.value);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
          placeholder={t('venueInput.addressPlaceholder', 'e.g. Muurarinkatu 4, Savonlinna')}
          className={className}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-autocomplete="list"
          aria-controls={`${id}-results`}
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
        ) : hasCoordinates ? (
          <HiOutlineMapPin
            className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-300"
            aria-label={t('venueInput.pinned', 'Pinned to a map location')}
          />
        ) : null}
      </div>

      {/* Says what the pin is FOR. Without it, nothing on screen explains why
          picking a result matters more than typing one. */}
      <p className="mt-1 text-xs text-slate-500">
        {hasCoordinates
          ? t('venueInput.addressPinned', 'Directions will go straight here.')
          : t('venueInput.addressHint', 'Pick one from the list to get exact directions.')}
      </p>

      {nothingFound ? (
        <p role="status" aria-live="polite" className="mt-1 text-xs text-slate-400">
          {t('venueInput.addressNothing', 'No match for that address.')}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul
          id={`${id}-results`}
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-600 bg-slate-800 shadow-lg"
        >
          {results.map((s) => (
            <li key={s.key} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(s);
                }}
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
