'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
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
}) => {
  const { t } = useTranslation();
  const styleMax = RATING_STYLE_MAX[ratingStyle];
  const isWords = ratingStyle === 'words';
  const selectedDisplay = canonicalToDisplay(value, styleMax);
  const positions = Array.from({ length: styleMax }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
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
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                selected
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800/40 text-slate-300 hover:bg-slate-800/60'
              }`}
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
