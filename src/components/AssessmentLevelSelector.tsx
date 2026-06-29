'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslationKey } from '@/i18n-types';
import { ASSESSMENT_LEVELS } from '@/config/assessmentMetrics';

interface AssessmentLevelSelectorProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

/**
 * Per-metric rating control on the 5-level developmental word scale
 * (Working on it / Emerging / Developing / Consistent / A strength).
 * Replaces the old 1-10 numeric slider; labels come from `assessmentScale.*`.
 */
const AssessmentLevelSelector: React.FC<AssessmentLevelSelectorProps> = ({ label, value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {ASSESSMENT_LEVELS.map((level) => {
          const levelLabel = t(`assessmentScale.level${level}` as TranslationKey, String(level));
          const selected = value === level;
          return (
            <button
              key={level}
              type="button"
              aria-pressed={selected}
              aria-label={levelLabel}
              onClick={() => onChange(level)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                selected
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800/40 text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              {levelLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AssessmentLevelSelector;
