'use client';

import React, { useState } from 'react';
import { chipStyle, chipSelectedStyle } from '@/styles/modalStyles';
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
}) => {
  const { t } = useTranslation();
  const [showDescription, setShowDescription] = useState(false);
  const styleMax = RATING_STYLE_MAX[ratingStyle];
  const isWords = ratingStyle === 'words';
  const selectedDisplay = canonicalToDisplay(value, styleMax);
  const positions = Array.from({ length: styleMax }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-ink-2">{label}</span>
        {description && (
          <button
            type="button"
            onClick={() => setShowDescription((v) => !v)}
            aria-pressed={showDescription}
            aria-label={t('playerAssessmentModal.whatIsThis', 'What does this mean?')}
            title={t('playerAssessmentModal.whatIsThis', 'What does this mean?')}
            className="inline-flex items-center justify-center min-h-9 min-w-9 -my-1.5 rounded-full text-ink-3 hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <HiOutlineInformationCircle className="w-5 h-5" />
          </button>
        )}
      </div>
      {description && showDescription && (
        <p className="text-sm text-ink-3 -mt-0.5 mb-0.5">{description}</p>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {positions.map((pos) => {
          const optionLabel = isWords
            ? t(`assessmentScale.level${pos}` as TranslationKey, String(pos))
            : String(pos);
          const selected = selectedDisplay === pos;
          return (
            <button
              key={pos}
              type="button"
              aria-pressed={selected}
              aria-label={optionLabel}
              onClick={() => onChange(displayToCanonical(pos, styleMax))}
              className={selected ? chipSelectedStyle : chipStyle}
            >
              {optionLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AssessmentLevelSelector;
