'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowUturnLeft,
  HiOutlineCheck,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { UNDO_WINDOW_MS } from '@/utils/applySnapshot';

export interface PlanningUndoBannerProps {
  /** Number of games the apply touched. Drives the headline copy. */
  gameCount: number;
  /**
   * Wall-clock timestamp from the snapshot. Used to compute the
   * remaining countdown so the timer survives parent re-renders
   * without resetting.
   */
  appliedAt: number;
  /** True while the parent is restoring (replaying snapshot via applyToGame). */
  isUndoing: boolean;
  /** Surface this when restore fails, so the user has feedback. */
  undoError?: string | null;
  /** Click "Undo" — parent replays the snapshot. */
  onUndo: () => void;
  /** Click X / "Got it" — parent dismisses. */
  onDismiss: () => void;
  /** Window expired (UNDO_WINDOW_MS elapsed since appliedAt). */
  onExpire: () => void;
}

/**
 * Computes seconds remaining in the undo window. Negative values are
 * clamped to 0 so the countdown never flashes negative on a delayed
 * tick or stale timer.
 */
const remainingSeconds = (appliedAt: number, now: number): number =>
  Math.max(0, Math.ceil((appliedAt + UNDO_WINDOW_MS - now) / 1000));

const PlanningUndoBanner: React.FC<PlanningUndoBannerProps> = ({
  gameCount,
  appliedAt,
  isUndoing,
  undoError,
  onUndo,
  onDismiss,
  onExpire,
}) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);
  // Latest onExpire — kept in a ref so the timer effect doesn't have
  // to depend on it. Without this, the effect cleanup + restart fires
  // on every parent re-render (e.g. setIsUndoing(true) flips the
  // parent), which resets `expiredRef` to false and lets the timer
  // re-fire onExpire after the user already clicked Undo.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    expiredRef.current = false;
    const tick = () => {
      const next = Date.now();
      setNow(next);
      // Fire onExpire exactly once per banner instance.
      if (!expiredRef.current && next >= appliedAt + UNDO_WINDOW_MS) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [appliedAt]);

  const seconds = remainingSeconds(appliedAt, now);

  return (
    <div
      role="status"
      data-testid="planning-undo-banner"
      className="space-y-2 rounded-md border border-emerald-700/40 bg-emerald-900/20 p-4"
    >
      <div className="flex items-start gap-3">
        <HiOutlineCheck
          aria-hidden="true"
          className="h-5 w-5 mt-0.5 flex-shrink-0 text-emerald-300"
        />
        <div className="flex-1">
          {/* Finnish title_one and title_other are intentionally
              identical — "Suunnitelma sovellettu N peliin." uses the
              illative case which doesn't change form between counts.
              The English variants differ ("game"/"games") and the
              ternary fallback below stays grammatical when the
              namespace fails to load. */}
          <p className="text-sm font-medium text-emerald-100">
            {t(
              'planningUndoBanner.title',
              gameCount === 1
                ? 'Plan applied to {{count}} game.'
                : 'Plan applied to {{count}} games.',
              { count: gameCount },
            )}
          </p>
          {/* aria-hidden on the countdown so the per-second
              re-renders don't re-announce the entire banner via the
              outer role="status". The visual countdown is still
              there; AT users get the initial banner announcement
              once and the static title + Undo button.  */}
          <p
            className="text-xs text-emerald-200/80 mt-0.5"
            aria-hidden="true"
            data-testid="planning-undo-banner-countdown"
          >
            {t(
              'planningUndoBanner.countdown',
              'Undo available for {{seconds}}s.',
              { seconds },
            )}
          </p>
          {undoError && (
            <p
              className="mt-1 text-xs text-rose-200"
              data-testid="planning-undo-banner-error"
            >
              {undoError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={isUndoing}
          className="rounded-md p-1 text-slate-300 hover:text-slate-100 disabled:opacity-50"
          aria-label={t('planningUndoBanner.dismiss', 'Dismiss')}
          data-testid="planning-undo-banner-dismiss"
        >
          <HiOutlineXMark aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onUndo}
          disabled={isUndoing || seconds === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="planning-undo-banner-undo"
        >
          <HiOutlineArrowUturnLeft aria-hidden="true" className="h-3.5 w-3.5" />
          {isUndoing
            ? t('planningUndoBanner.undoing', 'Undoing…')
            : t('planningUndoBanner.undo', 'Undo')}
        </button>
      </div>
    </div>
  );
};

export default PlanningUndoBanner;
