'use client';

/**
 * The full substitution chain of ONE position, expanded IN PLACE on the field.
 *
 * Opened from a compact chain card (see utils/playtimePlanner/chainLayout): the
 * field shows the starter, the next change and a "+N" badge so long chains can
 * never run over the card below; pressing it grows that card where it stands
 * into the whole chain - the position label, the starter and every incoming
 * player with their minute. It stays inside the field (expandedChainPlacement
 * flips it up near the bottom and shifts it in near a side line).
 *
 * Rendered INSIDE the field's positioned container, so the caller must render
 * it there. A field-wide backdrop sits under the card and over everything else
 * on the field: a tap on it closes the card (and does nothing else). The caller
 * dims the other positions - by opacity on its own DOM cards, or with
 * `dimField` (a scrim on this backdrop) when the cards are painted on a canvas.
 *
 * Closes on that tap, a press anywhere outside the field, the close button,
 * Escape, or the phone's back button (a sub-level back guard, the same contract
 * every other overlay follows). Focus moves into the card on open and back to
 * the card that opened it on close.
 *
 * Rows are plain text by default. A caller that edits the plan (the planner's
 * field view) passes `onSelect` per row, so a stint hidden behind the badge can
 * still be picked up for select-and-place.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiXMark } from 'react-icons/hi2';
import { useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';
import {
  EXPANDED_CHAIN,
  expandedChainHeightPx,
  expandedChainPlacement,
  type ExpandedChainPlacement,
} from '@/utils/playtimePlanner/chainLayout';

export interface PlanChainRow {
  key: string;
  /** Minute the player comes on; null for the starter. */
  minute: number | null;
  name: string;
  /** Colour for the minute (the field's wave hue); amber when omitted. */
  minuteColor?: string;
  /** Player's total planned minutes, when the view already knows them. */
  totalMinutes?: number;
  /** Colour for the total (the planner's fairness ramp). */
  totalColor?: string;
  /** Pick this placement up (select-and-place). Omit for a read-only row. */
  onSelect?: () => void;
}

interface PlanChainExpandedProps {
  /** Position label (ST, CAM, MV ...) - never an internal slot number. */
  positionLabel: string;
  rows: PlanChainRow[];
  /** The compact card it expands from, in px from the field's top-left. */
  anchor: { centerX: number; top: number; bottom: number };
  /** The field's size in px; measured from the container when omitted. */
  fieldSize?: { widthPx: number; heightPx: number };
  /** Darken the whole field behind the card (canvas-drawn cards). */
  dimField?: boolean;
  onClose: () => void;
}

const PlanChainExpanded: React.FC<PlanChainExpandedProps> = ({
  positionLabel,
  rows,
  anchor,
  fieldSize,
  dimField = false,
  onClose,
}) => {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ widthPx: number; heightPx: number } | null>(null);

  useHardwareBackSubLevel(true, onClose);

  // Field size: the caller's when it knows it, else the container's (observed,
  // so a rotated phone or a resized window keeps the card inside the field).
  useEffect(() => {
    if (fieldSize) return;
    const parent = backdropRef.current?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = parent;
      if (clientWidth > 0 && clientHeight > 0) {
        setMeasured((prev) =>
          prev && prev.widthPx === clientWidth && prev.heightPx === clientHeight
            ? prev
            : { widthPx: clientWidth, heightPx: clientHeight },
        );
      }
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [fieldSize]);

  // Focus the card ONCE on open; hand focus back to the opener on close.
  useEffect(() => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    cardRef.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    // Capture phase on window, so this runs BEFORE the planner's / match
    // screen's own Escape listeners on document - and stops them: Escape here
    // closes the card and nothing else.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    // A press outside the field (the bench, the toolbar) closes the card too,
    // and still does what it does. Presses on the field land on the backdrop.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (cardRef.current?.contains(target) || backdropRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onClose]);

  const field = fieldSize ?? measured;
  const place: ExpandedChainPlacement = field
    ? expandedChainPlacement(anchor, expandedChainHeightPx(rows.length), field)
    : {
        left: anchor.centerX - EXPANDED_CHAIN.widthPx / 2,
        top: anchor.top,
        width: EXPANDED_CHAIN.widthPx,
        direction: 'down',
      };

  const title = t('playtimePlanner.chainSheet.region', '{{position}}: substitutions', {
    position: positionLabel,
  });

  return (
    <>
      <div
        ref={backdropRef}
        className="absolute inset-0 z-20"
        style={dimField ? { backgroundColor: 'rgb(2 6 23 / 0.55)' } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        data-testid="plan-chain-backdrop"
        aria-hidden="true"
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-label={title}
        tabIndex={-1}
        data-testid="plan-chain-expanded"
        data-direction={place.direction}
        onClick={(e) => e.stopPropagation()}
        className="absolute z-30 flex flex-col overflow-hidden rounded-2xl border-2 border-white/90 bg-slate-900/95 shadow-xl shadow-black/60 font-ui focus:outline-none"
        style={{ left: place.left, top: place.top, width: place.width, maxHeight: place.maxHeight }}
      >
        <div
          className="flex shrink-0 items-center gap-2 pl-3 border-b border-white/15"
          style={{ height: EXPANDED_CHAIN.headerPx }}
        >
          <h4 className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-wide text-ink">{positionLabel}</h4>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <HiXMark className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <ol className="min-h-0 flex-1 overflow-y-auto pb-1" data-testid="plan-chain-rows">
          {rows.map((row) => {
            const content = (
              <>
                <span
                  className="w-10 shrink-0 text-right text-xs font-extrabold tabular-nums text-amber-300"
                  style={row.minuteColor ? { color: row.minuteColor } : undefined}
                >
                  {row.minute === null ? t('playtimePlanner.chainSheet.start', 'Start') : `${row.minute}'`}
                </span>
                <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink">{row.name}</span>
                {row.totalMinutes !== undefined && (
                  <span
                    className="shrink-0 text-xs font-semibold tabular-nums"
                    style={row.totalColor ? { color: row.totalColor } : undefined}
                    aria-label={t('playtimePlanner.chainSheet.total', '{{minutes}} min in total', {
                      minutes: row.totalMinutes,
                    })}
                  >
                    {row.totalMinutes}&#39;
                  </span>
                )}
              </>
            );
            const rowClass = 'flex h-full w-full min-w-0 items-center gap-2.5 pl-1 pr-3';
            return (
              <li
                key={row.key}
                className="border-t border-white/10 first:border-t-0"
                style={{ height: EXPANDED_CHAIN.rowPx }}
              >
                {row.onSelect ? (
                  <button
                    type="button"
                    onClick={() => {
                      row.onSelect?.();
                      onClose();
                    }}
                    className={`${rowClass} hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action`}
                  >
                    {content}
                  </button>
                ) : (
                  <div className={rowClass}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
};

export default PlanChainExpanded;
