'use client';

import React, { useState, useCallback, useId, useLayoutEffect, useRef } from 'react';
import {
  primaryButtonStyle,
  secondaryButtonStyle,
  dangerConfirmButtonStyle,
  CollapsibleModalHeader,
  useCollapsingHeader,
  modalContainerStyle,
  cardStyle,
  inputBaseStyle,
  textareaStyle,
  dialogContainerStyle,
  dialogTitleStyle,
  dialogBodyStyle,
} from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { useWarmupPlan } from '@/hooks/useWarmupPlan';
import type { WarmupPlan, WarmupPlanSection } from '@/types/warmupPlan';
import { FaPlus, FaPen, FaUndo } from 'react-icons/fa';
import { HiOutlineChevronUp, HiOutlineChevronDown, HiOutlineTrash } from 'react-icons/hi2';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

interface TrainingResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** A textarea that is always as tall as its text, so no line is ever clipped. */
const AutoGrowTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ value, ...rest }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} value={value} {...rest} />;
};

/** "• item" / "- item" / "* item" lines as list items; everything else as paragraphs. */
const BULLET_LINE = /^\s*[•\-*·]\s+(.*)$/;

const TrainingResourcesModal: React.FC<TrainingResourcesModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const headerCollapse = useCollapsingHeader();
  const { plan, isLoading, savePlan, resetToDefault, isSaving, isResetting } = useWarmupPlan();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedPlan, setEditedPlan] = useState<WarmupPlan | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Initialize edit mode with current plan
  const startEditing = useCallback(() => {
    if (plan) {
      setEditedPlan(structuredClone(plan));
      setIsEditMode(true);
    }
  }, [plan]);

  const cancelEditing = useCallback(() => {
    setEditedPlan(null);
    setIsEditMode(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (editedPlan) {
      await savePlan(editedPlan);
      setIsEditMode(false);
      setEditedPlan(null);
    }
  }, [editedPlan, savePlan]);

  const handleReset = useCallback(async () => {
    await resetToDefault();
    setShowResetConfirm(false);
    setIsEditMode(false);
    setEditedPlan(null);
  }, [resetToDefault]);

  // Generate unique ID
  const generateId = () => `wp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Section operations
  const updateSection = useCallback((sectionId: string, updates: Partial<WarmupPlanSection>) => {
    if (!editedPlan) return;
    setEditedPlan({
      ...editedPlan,
      sections: editedPlan.sections.map(s =>
        s.id === sectionId ? { ...s, ...updates } : s
      ),
    });
  }, [editedPlan]);

  const addSection = useCallback(() => {
    if (!editedPlan) return;
    const newSection: WarmupPlanSection = {
      id: generateId(),
      title: t('warmupPlanModal.newSectionTitle', 'New Section'),
      content: '',
    };
    setEditedPlan({
      ...editedPlan,
      sections: [...editedPlan.sections, newSection],
    });
  }, [editedPlan, t]);

  const removeSection = useCallback((sectionId: string) => {
    if (!editedPlan) return;
    setEditedPlan({
      ...editedPlan,
      sections: editedPlan.sections.filter(s => s.id !== sectionId),
    });
  }, [editedPlan]);

  const moveSection = useCallback((sectionId: string, direction: 'up' | 'down') => {
    if (!editedPlan) return;
    const sections = [...editedPlan.sections];
    const index = sections.findIndex(s => s.id === sectionId);
    if (index === -1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;
    [sections[index], sections[newIndex]] = [sections[newIndex], sections[index]];
    setEditedPlan({ ...editedPlan, sections });
  }, [editedPlan]);

  const modalTitleId = useId();

  useEscapeToClose(isOpen, onClose, !showResetConfirm);


  if (!isOpen) return null;

  const displayPlan = isEditMode ? editedPlan : plan;

  // Render content as paragraphs and real lists: consecutive bullet lines
  // become one list with a hanging indent, so a wrapped line lines up under
  // its own text instead of under the bullet.
  const renderContent = (content: string) => {
    const blocks: React.ReactNode[] = [];
    let bullets: string[] = [];
    const flush = () => {
      if (bullets.length === 0) return;
      const items = bullets;
      bullets = [];
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1 marker:text-ink-3">
          {items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
    };
    content.split('\n').forEach((line) => {
      const m = BULLET_LINE.exec(line);
      if (m) {
        bullets.push(m[1]);
        return;
      }
      flush();
      blocks.push(line.trim() === '' ? <div key={`sp-${blocks.length}`} className="h-2" aria-hidden="true" /> : <p key={`p-${blocks.length}`}>{line}</p>);
    });
    flush();
    return blocks;
  };

  // A section's move/delete control: a 44px raised round button.
  const sectionToolStyle =
    'inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-full s1-raised text-ink-2 hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-action';

  // Render a section
  const renderSection = (section: WarmupPlanSection, index: number, totalSections: number) => (
    <section key={section.id} className={`${cardStyle} font-ui`}>
      {isEditMode ? (
        <div className="space-y-3">
          {/* The 44px raised controls sit at the right end of the title row;
              on phones the title takes the full width above them (sharing the
              row cut the title off at ~366px). One row from sm up. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <input
              type="text"
              value={section.title}
              onChange={(e) => updateSection(section.id, { title: e.target.value })}
              className={`${inputBaseStyle} flex-1 basis-full sm:basis-36 min-w-0 text-lg font-semibold`}
              placeholder={t('warmupPlanModal.sectionTitlePlaceholder', 'Section Title')}
            />
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => moveSection(section.id, 'up')}
                disabled={index === 0}
                className={sectionToolStyle}
                title={t('warmupPlanModal.moveUp', 'Move Up')}
                aria-label={t('warmupPlanModal.moveUp', 'Move Up')}
              >
                <HiOutlineChevronUp className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                onClick={() => moveSection(section.id, 'down')}
                disabled={index === totalSections - 1}
                className={sectionToolStyle}
                title={t('warmupPlanModal.moveDown', 'Move Down')}
                aria-label={t('warmupPlanModal.moveDown', 'Move Down')}
              >
                <HiOutlineChevronDown className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                onClick={() => removeSection(section.id)}
                className={`${sectionToolStyle} text-red-300! hover:text-red-200!`}
                title={t('warmupPlanModal.deleteSection', 'Delete Section')}
                aria-label={t('warmupPlanModal.deleteSection', 'Delete Section')}
              >
                <HiOutlineTrash className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          {/* Free-form content textarea */}
          <AutoGrowTextarea
            value={section.content}
            onChange={(e) => updateSection(section.id, { content: e.target.value })}
            className={`${textareaStyle} resize-none overflow-hidden min-h-[120px] text-[15px] font-normal`}
            placeholder={t('warmupPlanModal.contentPlaceholder', 'Enter content here... Use • for bullet points')}
            rows={5}
          />
        </div>
      ) : (
        <>
          <h3 className="font-display text-2xl font-bold text-ink mb-2">{section.title}</h3>
          <div className="text-ink-2 text-[15px] leading-relaxed space-y-1">
            {renderContent(section.content)}
          </div>
        </>
      )}
    </section>
  );

  return (
    <div className={`${MODAL_BACKDROP} ${Z_LAYER.modal}`} role="dialog" aria-modal="true" aria-labelledby={modalTitleId}>
      <div className={`${modalContainerStyle} h-full w-full relative`}>
        <div className="relative z-10 flex flex-col min-h-0 h-full">
          {/* Chrome slimming: X-header. The action buttons live in one row
              inside the collapse region and fold away on scroll. The X
              absorbs Done (view) / Cancel (edit). */}
          <CollapsibleModalHeader
          titleId={modalTitleId}
            title={t('warmupPlanModal.title', 'Warmup')}
            onClose={isEditMode ? cancelEditing : onClose}
            closeLabel={isEditMode ? t('warmupPlanModal.cancelButton', 'Cancel') : t('common.doneButton', 'Done')}
            collapse={headerCollapse}
          >
            {/* House header buttons: full-width, stretching across the row -
                alone (Edit) or split evenly with a sibling (Reset + Save). */}
            <div className="px-4 pt-1 pb-3 flex gap-2">
              {isEditMode ? (
                <>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    disabled={isResetting}
                    className={`${secondaryButtonStyle} flex-1 flex items-center justify-center gap-2 disabled:opacity-50`}
                  >
                    <FaUndo className="w-3 h-3" />
                    {t('warmupPlanModal.resetToDefaultButton', 'Reset to Default')}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`${primaryButtonStyle} flex-1 disabled:opacity-50`}
                  >
                    {isSaving
                      ? t('common.saving', 'Saving...')
                      : t('warmupPlanModal.saveButton', 'Save')}
                  </button>
                </>
              ) : (
                <button
                  onClick={startEditing}
                  className={`${secondaryButtonStyle} flex-1 flex items-center justify-center gap-2`}
                >
                  <FaPen className="w-3 h-3" />
                  {t('warmupPlanModal.editButton', 'Edit')}
                </button>
              )}
            </div>
          </CollapsibleModalHeader>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-2 pb-8" onScroll={headerCollapse.onScroll}>
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-ink-3">
                {t('common.loading', 'Loading...')}
              </div>
            ) : displayPlan ? (
              <div>
                <div className="space-y-4">
                  {displayPlan.sections.map((section, index) =>
                    renderSection(section, index, displayPlan.sections.length)
                  )}
                </div>
                {isEditMode && (
                  <button
                    onClick={addSection}
                    className={`${secondaryButtonStyle} mt-4 w-full`}
                  >
                    <FaPlus className="w-3 h-3" />
                    {t('warmupPlanModal.addSection', 'Add Section')}
                  </button>
                )}
              </div>
            ) : null}
          </div>

        </div>

        {/* Reset Confirmation Dialog */}
        {showResetConfirm && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
            <div className={`${dialogContainerStyle} !bg-surface-2`}>
              <h3 className={`${dialogTitleStyle} mb-2`}>
                {t('warmupPlanModal.resetConfirmTitle', 'Reset Warmup Plan?')}
              </h3>
              <p className={`${dialogBodyStyle} mb-4`}>
                {t('warmupPlanModal.resetConfirmMessage', 'This will replace your custom warmup plan with the default template. This cannot be undone.')}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className={secondaryButtonStyle}
                >
                  {t('common.cancelButton', 'Cancel')}
                </button>
                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  className={dangerConfirmButtonStyle}
                >
                  {isResetting
                    ? t('common.resetting', 'Resetting...')
                    : t('warmupPlanModal.resetButton', 'Reset')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingResourcesModal;
