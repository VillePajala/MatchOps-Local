'use client';

/**
 * The full substitution chain of ONE position, in a bottom sheet.
 *
 * Opened from a compact chain card (see utils/playtimePlanner/chainLayout): the
 * field shows the starter, the next change and a "+N" badge so long chains can
 * never run over the card below; this sheet lists everything. It sits over the
 * field instead of on it, so it never covers another position's card.
 *
 * Closes on a tap outside, Escape, or the phone's back button (a sub-level
 * back guard, the same contract every other overlay follows). Focus moves into
 * the sheet on open and back to the card that opened it on close.
 *
 * Rows are plain text by default. A caller that edits the plan (the planner's
 * field view) passes `onSelect` per row, so a stint hidden behind the badge can
 * still be picked up for select-and-place.
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';
import { groupedListStyle, listRowStyle, dialogTitleStyle, Z_LAYER } from '@/styles/modalStyles';

export interface PlanChainSheetRow {
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

interface PlanChainSheetProps {
  /** Position label (ST, CAM, #3, MV ...). */
  positionLabel: string;
  rows: PlanChainSheetRow[];
  onClose: () => void;
}

const PlanChainSheet: React.FC<PlanChainSheetProps> = ({ positionLabel, rows, onClose }) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);

  useHardwareBackSubLevel(true, onClose);
  useFocusTrap(dialogRef, true);

  // Focus the sheet ONCE on open; hand focus back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    // Capture phase on window, so this runs BEFORE the planner's / match
    // screen's own Escape listeners on document - and stops them: Escape here
    // closes the sheet and nothing else.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const title = t('playtimePlanner.chainSheet.title', '{{position}} · substitutions', {
    position: positionLabel,
  });

  const sheet = (
    <div
      className={`fixed inset-0 ${Z_LAYER.modal} flex items-end justify-center bg-black/60`}
      onClick={onClose}
      data-testid="plan-chain-sheet-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm s1-sheet rounded-t-[26px] px-4 pt-3 pb-6 max-h-[70vh] overflow-y-auto font-ui focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" aria-hidden="true" />
        <h4 className={`${dialogTitleStyle} text-center mb-4`}>{title}</h4>
        <ol className={groupedListStyle} data-testid="plan-chain-sheet-rows">
          {rows.map((row) => {
            const content = (
              <>
                <span
                  className="w-10 shrink-0 text-right font-bold tabular-nums text-amber-300"
                  style={row.minuteColor ? { color: row.minuteColor } : undefined}
                >
                  {row.minute === null ? t('playtimePlanner.chainSheet.start', 'Start') : `${row.minute}'`}
                </span>
                <span className="min-w-0 flex-1 truncate text-left text-[15px] text-ink">{row.name}</span>
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
            return (
              <li key={row.key} className={listRowStyle}>
                {row.onSelect ? (
                  <button
                    type="button"
                    onClick={() => {
                      row.onSelect?.();
                      onClose();
                    }}
                    className="flex flex-1 min-w-0 min-h-14 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                  >
                    {content}
                  </button>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );

  // Portaled: the match field sits inside transformed/overflow-clipped
  // containers, where a fixed-position sheet would be clipped to the pitch.
  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
};

export default PlanChainSheet;
