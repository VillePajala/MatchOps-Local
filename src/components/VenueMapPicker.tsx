'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark } from 'react-icons/hi2';
import { MdMyLocation } from 'react-icons/md';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Pin a venue by pointing at it, for the places search cannot find.
 *
 * WHY THIS EXISTS. OpenStreetMap knows buildings by their real names, not their
 * sponsors: "Mitta-Keittiöt Areena" returns nothing while the same hall sits on
 * the map as a plain jäähalli. The coach knows exactly where it is - they just
 * cannot spell it in a way the search recognises. So they point at it instead,
 * and the typed name is kept as-is: the NAME comes from the coach, only the
 * COORDINATES come from the map. That is the right division, because the
 * coordinates are what the map link and any travel feature actually need, and
 * the sponsor name is what the coach and their parents call the place.
 *
 * DRAG THE MAP UNDER A FIXED PIN, rather than tapping a spot. A fingertip is
 * about 40px across and hides whatever it touches, so tap-to-place is precise
 * only on a mouse. The pin stays dead centre and the map moves beneath it,
 * which is how every phone map picker works and is why the confirm button can
 * simply read the map's centre.
 *
 * NO LEAFLET MARKER, deliberately. The centre pin is our own element overlaid
 * on the map, which both avoids Leaflet's default marker-icon path problem
 * (its images are referenced relative to the CSS and break under a bundler)
 * and keeps the pin perfectly still while the map animates under it.
 *
 * TILES ARE OpenStreetMap's own, which is also why `img-src` in next.config.ts
 * names that host. Their tile policy allows this kind of low-volume use and
 * requires visible attribution - rendered bottom-left, not optional.
 *
 * @module VenueMapPicker
 * @category Components
 */
export interface VenueMapPickerProps {
  /** Where to open. Falls back to a whole-country view when nothing is known. */
  initialCenter?: { latitude: number; longitude: number } | null;
  /**
   * True when the centre is only a guess at the region (a town matched from
   * what the coach typed) rather than the venue itself. It decides the zoom,
   * and getting that wrong is disorienting in both directions: a town centre
   * opened at pitch zoom drops the coach on one arbitrary street with no way
   * to tell which, while a known pin opened at town zoom hides the very pitch
   * they are confirming.
   */
  centerIsApproximate?: boolean;
  /** The coach's typed name, shown so they can see what they are pinning. */
  venueName: string;
  onCancel: () => void;
  onPick: (coords: { latitude: number; longitude: number }) => void;
}

/** Roughly the middle of Finland, at a zoom that shows the whole country. */
const FINLAND_CENTER: [number, number] = [64.5, 26.0];
const FINLAND_ZOOM = 5;

/** Close enough to read pitch markings, which is how a coach recognises one. */
const VENUE_ZOOM = 17;

/** A town fills the screen - the right scale when we only guessed the region. */
const TOWN_ZOOM = 13;

export const VenueMapPicker: React.FC<VenueMapPickerProps> = ({
  initialCenter,
  centerIsApproximate = false,
  venueName,
  onCancel,
  onPick,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  // Leaflet arrives over the network. Until it does there is no centre to read,
  // and a confirm button that silently does nothing reads as a broken app.
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    // Leaflet touches `window` as it loads, so it is imported here rather than
    // at module scope. The whole picker is lazy-loaded by VenueInput anyway, so
    // none of this reaches a coach who never opens the map.
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: initialCenter
          ? [initialCenter.latitude, initialCenter.longitude]
          : FINLAND_CENTER,
        zoom: !initialCenter
          ? FINLAND_ZOOM
          : centerIsApproximate
            ? TOWN_ZOOM
            : VENUE_ZOOM,
        // Our own attribution is rendered below, always visible rather than
        // behind Leaflet's collapsible control.
        attributionControl: false,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
      setIsMapReady(true);
      // The map is measured on creation, but it is created inside a modal that
      // may still be sizing. Without this the tiles lay out against a zero box
      // and the map renders as a grey stripe.
      requestAnimationFrame(() => map?.invalidateSize());
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      setIsMapReady(false);
    };
  }, [initialCenter, centerIsApproximate]);

  // Escape backs out, the same as every other modal here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  /**
   * Jump to where the coach is standing.
   *
   * Only on an explicit tap: opening a map must never trigger a permission
   * prompt on its own. Useful in two different ways - at the pitch it IS the
   * answer, and at home it still lands the map in the right region, which is
   * most of the work when the alternative is starting from the whole country.
   */
  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setLocateError(true);
      return;
    }
    setLocateError(false);
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], VENUE_ZOOM);
      },
      () => {
        // Denied, unavailable, or timed out. All the same to the coach: the map
        // still works, they just have to find the place themselves.
        setIsLocating(false);
        setLocateError(true);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const confirm = useCallback(() => {
    const center = mapRef.current?.getCenter();
    if (!center) return;
    onPick({ latitude: center.lat, longitude: center.lng });
  }, [onPick]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('venueMapPicker.title', 'Choose on map')}
    >
      <div className="flex h-full max-h-[36rem] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-600 bg-slate-800 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-700 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-100">
              {t('venueMapPicker.title', 'Choose on map')}
            </h2>
            {/* What they are pinning, so the name and the place stay connected
                while they pan around looking for it. */}
            {venueName ? (
              <p className="truncate text-xs text-slate-400">{venueName}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('venueMapPicker.close', 'Close')}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        <p className="px-4 pt-3 text-xs text-slate-400">
          {t('venueMapPicker.instructions', 'Move the map so the pin sits on the venue.')}
        </p>

        <div className="relative m-4 flex-1 overflow-hidden rounded-md border border-slate-600">
          <div ref={containerRef} className="absolute inset-0" data-testid="venue-map" />

          {/* The pin: fixed dead centre, its TIP on the point the map reports.
              pointer-events-none so it never swallows a drag. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="h-9 w-9 drop-shadow-lg"
              // Nudged up by half its own height so the tip, not the middle,
              // marks the spot.
              style={{ transform: 'translateY(-50%)' }}
              aria-hidden="true"
            >
              <path
                d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"
                fill="#818cf8"
                stroke="#1e293b"
                strokeWidth="1.5"
              />
              <circle cx="12" cy="9" r="2.5" fill="#1e293b" />
            </svg>
          </div>

          {/* OSM's tile policy asks for this exact credit, as a LINK to their
              copyright page - so it is neither collapsed behind a control nor
              flattened to plain text. The CSP grant in next.config.ts is
              justified by that policy, which makes getting this right part of
              the justification rather than decoration. */}
          <div className="absolute bottom-0 left-0 z-[400] bg-slate-900/75 px-1.5 py-0.5 text-[10px] text-slate-300">
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-100"
            >
              © OpenStreetMap contributors
            </a>
          </div>
        </div>

        {locateError ? (
          <p role="status" aria-live="polite" className="px-4 pb-2 text-xs text-amber-300">
            {t('venueMapPicker.locationFailed', 'Could not get your location. Find the place on the map instead.')}
          </p>
        ) : null}

        <div className="flex gap-2 border-t border-slate-700 px-4 py-3">
          <button
            type="button"
            onClick={locate}
            disabled={isLocating || !isMapReady}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-600 disabled:opacity-60"
          >
            <MdMyLocation className="h-4 w-4" />
            {isLocating
              ? t('venueMapPicker.locating', 'Locating...')
              : t('venueMapPicker.myLocation', 'My location')}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!isMapReady}
            className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMapReady
              ? t('venueMapPicker.confirm', 'Pin here')
              : t('venueMapPicker.loading', 'Loading map...')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VenueMapPicker;
