'use client';

import React, { useState, useCallback } from 'react';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { useWarmupPlan } from '@/hooks/useWarmupPlan';
import type { WarmupPlan, WarmupPlanSection } from '@/types/warmupPlan';
import { FaChevronUp, FaChevronDown, FaPlus, FaTimes, FaPen, FaUndo } from 'react-icons/fa';

interface TrainingResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TrainingResourcesModal: React.FC<TrainingResourcesModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { plan, isLoading, savePlan, resetToDefault, isSaving, isResetting } = useWarmupPlan();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedPlan, setEditedPlan] = useState<WarmupPlan | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Initialize edit mode with current plan
  const startEditing = useCallback(() => {
    if (plan) {
      setEditedPlan(JSON.parse(JSON.stringify(plan))); // Deep copy
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

  if (!isOpen) return null;

  const displayPlan = isEditMode ? editedPlan : plan;

  // Render content as formatted text (preserves bullet points)
  const renderContent = (content: string) => {
    return content.split('\n').map((line, index) => (
      <React.Fragment key={index}>
        {line}
        {index < content.split('\n').length - 1 && <br />}
      </React.Fragment>
    ));
  };

  // Render a section
  const renderSection = (section: WarmupPlanSection, index: number, totalSections: number) => (
    <section key={section.id} className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
      {isEditMode ? (
        <div className="space-y-3">
          {/* Title with controls */}
          <div className="space-y-2">
            <input
              type="text"
              value={section.title}
              onChange={(e) => updateSection(section.id, { title: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-lg font-semibold text-slate-200 focus:outline-none focus:border-indigo-500"
              placeholder={t('warmupPlanModal.sectionTitlePlaceholder', 'Section Title')}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveSection(section.id, 'up')}
                  disabled={index === 0}
                  className="h-8 w-8 flex items-center justify-center text-slate-200 hover:text-white disabled:opacity-30 bg-slate-700/70 hover:bg-slate-600 rounded-md"
                  title={t('warmupPlanModal.moveUp', 'Move Up')}
                >
                  <FaChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveSection(section.id, 'down')}
                  disabled={index === totalSections - 1}
                  className="h-8 w-8 flex items-center justify-center text-slate-200 hover:text-white disabled:opacity-30 bg-slate-700/70 hover:bg-slate-600 rounded-md"
                  title={t('warmupPlanModal.moveDown', 'Move Down')}
                >
                  <FaChevronDown className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => removeSection(section.id)}
                className="h-8 w-8 flex items-center justify-center text-red-400 hover:text-red-300 bg-slate-700/70 hover:bg-slate-600 rounded-md"
                title={t('warmupPlanModal.deleteSection', 'Delete Section')}
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Free-form content textarea */}
          <textarea
            value={section.content}
            onChange={(e) => updateSection(section.id, { content: e.target.value })}
            className="w-full bg-slate-700/70 border border-slate-600 rounded px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 resize-y min-h-[100px]"
            placeholder={t('warmupPlanModal.contentPlaceholder', 'Enter content here... Use • for bullet points')}
            rows={5}
          />
        </div>
      ) : (
        <>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">{section.title}</h3>
          <div className="text-slate-300 text-sm whitespace-pre-wrap pl-2">
            {renderContent(section.content)}
          </div>
        </>
      )}
    </section>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        <div className="relative z-10 flex flex-col min-h-0 h-full">
          {/* Header */}
          <div className="flex justify-between items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 flex-shrink-0">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">
              {t('controlBar.training', 'Warmup Plan')}
            </h2>
            {!isEditMode && (
              <button
                onClick={startEditing}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
              >
                <FaPen className="w-3 h-3" />
                {t('warmupPlanModal.editButton', 'Edit')}
              </button>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-slate-400">
                {t('common.loading', 'Loading...')}
              </div>
            ) : displayPlan ? (
              <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6">
                <div className="space-y-4">
                  {displayPlan.sections.map((section, index) =>
                    renderSection(section, index, displayPlan.sections.length)
                  )}
                </div>
                {isEditMode && (
                  <button
                    onClick={addSection}
                    className="mt-4 flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md text-sm font-medium transition-colors"
                  >
                    <FaPlus className="w-3 h-3" />
                    {t('warmupPlanModal.addSection', 'Add Section')}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <ModalFooter>
            {isEditMode ? (
              <>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={isResetting}
                  className={`${secondaryButtonStyle} flex items-center gap-2 disabled:opacity-50`}
                >
                  <FaUndo className="w-3 h-3" />
                  {t('warmupPlanModal.resetToDefaultButton', 'Reset to Default')}
                </button>
                <button
                  onClick={cancelEditing}
                  className={secondaryButtonStyle}
                >
                  {t('warmupPlanModal.cancelButton', 'Cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`${primaryButtonStyle} disabled:opacity-50`}
                >
                  {isSaving
                    ? t('common.saving', 'Saving...')
                    : t('warmupPlanModal.saveButton', 'Save')}
                </button>
              </>
            ) : (
              <button onClick={onClose} className={primaryButtonStyle}>
                {t('common.doneButton', 'Done')}
              </button>
            )}
          </ModalFooter>
        </div>

        {/* Reset Confirmation Dialog */}
        {showResetConfirm && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-600 max-w-md mx-4">
              <h3 className="text-lg font-bold text-white mb-2">
                {t('warmupPlanModal.resetConfirmTitle', 'Reset Warmup Plan?')}
              </h3>
              <p className="text-slate-300 text-sm mb-4">
                {t('warmupPlanModal.resetConfirmMessage', 'This will replace your custom warmup plan with the default template. This cannot be undone.')}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md text-sm font-medium"
                >
                  {t('common.cancelButton', 'Cancel')}
                </button>
                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm font-medium disabled:opacity-50"
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
