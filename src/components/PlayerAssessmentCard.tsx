'use client';

import React, { useState, useEffect, useRef } from 'react';
import { HiOutlineChevronDown, HiCheck } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import type { Player, PlayerAssessment } from '@/types';
import type { TranslationKey } from '@/i18n-types';
import OverallRatingSelector from './OverallRatingSelector';
import AssessmentLevelSelector from './AssessmentLevelSelector';
import { validateAssessment } from '@/hooks/usePlayerAssessments';
import { ASSESSMENT_DEFAULT, makeDefaultSliders, templateMetricIds } from '@/config/assessmentMetrics';
import type { AssessmentRatingStyle, AssessmentTemplate } from '@/types/settings';
import { textareaStyle, primaryButtonStyle, dangerButtonStyle } from '@/styles/modalStyles';

interface PlayerAssessmentCardProps {
  player: Player;
  onSave: (assessment: Partial<PlayerAssessment>) => void;
  onDelete?: () => void;
  isSaved?: boolean;
  assessment?: PlayerAssessment;
  ratingStyle?: AssessmentRatingStyle;
  assessmentTemplate?: AssessmentTemplate;
}

const PlayerAssessmentCard: React.FC<PlayerAssessmentCardProps> = ({ player, onSave, onDelete, isSaved, assessment, ratingStyle = 'words', assessmentTemplate = 'balanced' }) => {
  const { t } = useTranslation();
  // The active template's metric ids, and fresh defaults for a new assessment.
  const metricIds = React.useMemo(() => templateMetricIds(assessmentTemplate), [assessmentTemplate]);
  const initialSliders = React.useMemo(() => makeDefaultSliders(metricIds), [metricIds]);
  const [expanded, setExpanded] = useState(false);
  const [overall, setOverall] = useState<number>(assessment?.overall ?? 5);
  const [sliders, setSliders] = useState<Record<string, number>>(assessment?.sliders ?? initialSliders);
  const [notes, setNotes] = useState(assessment?.notes ?? '');
  const prev = useRef({ overall, sliders, notes });

  React.useLayoutEffect(() => {
    const newOverall = assessment?.overall ?? 5;
    const newSliders = assessment?.sliders ?? initialSliders;
    const newNotes = assessment?.notes ?? '';
    setOverall(newOverall);
    setSliders(newSliders);
    setNotes(newNotes);
    // Also update prev to prevent auto-save from triggering after reset
    prev.current = { overall: newOverall, sliders: newSliders, notes: newNotes };
  }, [assessment, initialSliders]);
  const isValid = validateAssessment({ overall, sliders: sliders as PlayerAssessment['sliders'], notes });

  useEffect(() => {
    if (!isValid) return;
    const timeout = setTimeout(() => {
      const current = { overall, sliders, notes };
      if (JSON.stringify(prev.current) !== JSON.stringify(current)) {
        onSave({ overall, sliders: sliders as PlayerAssessment['sliders'], notes });
        prev.current = current;
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [overall, sliders, notes, isValid, onSave]);

  // Flush on close (review 4.16): the debounce above is cancelled when the card
  // unmounts, so a rating or note changed within 0.8 s of pressing back/Done was
  // silently dropped. The latest values are kept in a ref and saved on unmount.
  const latestRef = useRef({ overall, sliders, notes, isValid, onSave });
  // Deleted: a pending edit must not bring the assessment back on close.
  const deletedRef = useRef(false);
  useEffect(() => {
    latestRef.current = { overall, sliders, notes, isValid, onSave };
  }, [overall, sliders, notes, isValid, onSave]);
  useEffect(() => () => {
    const latest = latestRef.current;
    if (!latest.isValid || deletedRef.current) return;
    const current = { overall: latest.overall, sliders: latest.sliders, notes: latest.notes };
    if (JSON.stringify(prev.current) !== JSON.stringify(current)) {
      latest.onSave({ ...current, sliders: current.sliders as PlayerAssessment['sliders'] });
      prev.current = current;
    }
  }, []);

  const handleSliderChange = (key: string, value: number) => {
    setSliders((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      overall,
      sliders: sliders as PlayerAssessment['sliders'],
      notes,
    });
    prev.current = { overall, sliders, notes }; // saved: closing must not save it again
    setExpanded(false);
  };

  return (
    // One row of the modal's grouped list: a 56px header, with an inset divider
    // above every row but the first; opens in place.
    <div className="relative font-ui text-ink before:absolute before:top-0 before:left-[50px] before:right-0 before:h-px before:bg-hairline first:before:hidden">
      <button
        type="button"
        className="flex items-center gap-3.5 w-full min-h-14 px-4 text-left hover:bg-white/[0.03] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        title={expanded ? t('playerAssessmentModal.collapse', { name: player.name }) : t('playerAssessmentModal.expand', { name: player.name })}
      >
        {/* Not assessed yet: a dashed ring. Assessed: filled green with a check. */}
        {isSaved ? (
          <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-win/[0.18] text-win">
            <HiCheck className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : (
          <span className="h-6 w-6 flex-none rounded-full border-[1.5px] border-dashed border-ink-3/70" aria-hidden="true" />
        )}
        <span className="flex-1 min-w-0 truncate font-semibold">{player.name}</span>
        <HiOutlineChevronDown className={`h-[18px] w-[18px] flex-none text-ink-3 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-2 w-24 shrink-0">
              {t('playerAssessmentModal.overallLabel', 'Overall')}
            </span>
            <OverallRatingSelector value={overall} onChange={setOverall} />
          </div>
          <div className="space-y-4">
            {metricIds.map((id) => (
              <AssessmentLevelSelector
                key={id}
                label={t(`assessmentMetrics.${id}` as TranslationKey, id)}
                description={t(`assessmentMetricDescriptions.${id}` as TranslationKey, '')}
                value={sliders[id] ?? ASSESSMENT_DEFAULT}
                onChange={(v) => handleSliderChange(id, v)}
                ratingStyle={ratingStyle}
              />
            ))}
          </div>
          <div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={280}
              className={textareaStyle}
              placeholder={t('playerAssessmentModal.notesPlaceholder', 'Add notes...')}
              aria-label={t('playerAssessmentModal.notesPlaceholder', 'Add notes...')}
              rows={3}
            />
            <div className="mt-1 text-xs text-ink-3 text-right">{notes.length}/280</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`${primaryButtonStyle} min-h-11`}
              onClick={handleSave}
              disabled={!isValid}
              aria-label={t('playerAssessmentModal.saveButton', 'Save')}
            >
              {t('playerAssessmentModal.saveButton', 'Save')}
            </button>
            {assessment && onDelete && (
              <button
                type="button"
                className={`${dangerButtonStyle} min-h-11`}
                onClick={() => { deletedRef.current = true; onDelete(); }}
              >
                {t('playerAssessmentModal.resetButton', 'Reset')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerAssessmentCard;
