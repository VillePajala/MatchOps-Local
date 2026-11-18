'use client';

import React, { useState } from 'react';
import { ratingSegmentClass } from './OverallRatingSelector';
import { useTranslation } from 'react-i18next';
import { HiOutlineInformationCircle } from 'react-icons/hi2';
import type { TranslationKey } from '@/i18n-types';
import type { AssessmentRatingStyle } from '@/types/settings';
import {
  RATING_STYLE_MAX,
  canonicalToDisplay,
  displayToCanonical,
} from '@/config/assessmentMetrics';

interface AssessmentLevelSelectorProps {
  label: string;
  /** Canonical 1-10 value. */
  value: number;
  /** Receives the new canonical 1-10 value. */
  onChange: (value: number) => void;
  /** Presentation style (default 'words'). */
  ratingStyle?: AssessmentRatingStyle;
  /** Optional one-line definition of the metric, shown via an info toggle. */
  description?: string;
  /**
   * The coach has not rated this metric yet: `value` is only the default, so it
   * is drawn as a faint grey outline rather than an amber selection, and the
   * level word beside the name stays grey. Presentation only - the value saved
   * is unchanged.
   */
  untouched?: boolean;
}

/**
 * Per-metric rating control. Presents the canonical 1-10 value in the coach's
 * chosen style - the 5-level developmental words, numbers 1-5, or numbers 1-10
 * (see AssessmentRatingStyle) - and converts the selection back to canonical.
 */
const AssessmentLevelSelector: React.FC<AssessmentLevelSelectorProps> = ({
  label,
  value,
  onChange,
  ratingStyle = 'words',
  description,
  untouched = false,
}) => {
  const { t } = useTranslation();
  const [showDescription, setShowDescription] = useState(false);
  const styleMax = RATING_STYLE_MAX[ratingStyle];
  const isWords = ratingStyle === 'words';
  const selectedDisplay = canonicalToDisplay(value, styleMax);
  const positions = Array.from({ length: styleMax }, (_, i) => i + 1);

  const levelLabel = (pos: number) =>
    isWords ? t(`assessmentScale.level${pos}` as TranslationKey, String(pos)) : String(pos);

  return (
    <div className="flex flex-col gap-1.5">
      {/* "Pelikäsitys · Kehittyvä": the chosen level is read beside the name,
          so the segments below can stay one even row of equal parts. */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="min-w-0 text-sm text-ink-2">
          <span className="font-medium">{label}</span>
          <span className={untouched ? 'text-ink-3/70' : 'font-semibold text-ink'} data-testid="assessment-level-value">
            {' · '}{levelLabel(selectedDisplay)}
          </span>
        </span>
        {description && (
          <button
            type="button"
            onClick={() => setShowDescription((v) => !v)}
            aria-pressed={showDescription}
            aria-label={t('playerAssessmentModal.whatIsThis', 'What does this mean?')}
            title={t('playerAssessmentModal.whatIsThis', 'What does this mean?')}
            className="inline-flex flex-none items-center justify-center min-h-9 min-w-9 -my-1.5 rounded-full text-ink-3 hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <HiOutlineInformationCircle className="w-5 h-5" />
          </button>
        )}
      </div>
      {description && showDescription && (
        <p className="text-sm text-ink-3 -mt-0.5 mb-0.5">{description}</p>
      )}
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${styleMax}, minmax(0, 1fr))` }}
        role="group"
        aria-label={label}
      >
        {positions.map((pos) => {
          // The visible number leads the accessible name (label-in-name), the
          // level word follows in the words style: "3, Kehittyvä".
          const optionLabel = isWords ? `${pos}, ${levelLabel(pos)}` : String(pos);
          const selected = selectedDisplay === pos;
          return (
            <button
              key={pos}
              type="button"
              // An untouched default is not a given rating: not announced as chosen.
              aria-pressed={selected && !untouched}
              aria-label={optionLabel}
              title={optionLabel}
              onClick={() => onChange(displayToCanonical(pos, styleMax))}
              className={ratingSegmentClass(selected, untouched)}
            >
              {/* The level number is always inside the segment; in the words
                  style the chosen level's word is read beside the name. */}
              {pos}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AssessmentLevelSelector;
