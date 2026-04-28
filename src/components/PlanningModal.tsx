'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowUpTray,
  HiOutlinePlus,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import {
  parsePlanExport,
  type ImportedPlan,
  type PlanImportError,
} from '@/utils/planExport';
import type { SavedGamesCollection } from '@/types/game';
import PlanningGamePicker, {
  type PlanningGamePickerGame,
} from './PlanningGamePicker';

type PlanningPage = 'list' | 'picker';

interface PlanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** All saved games keyed by id (from useGamePersistence). */
  savedGames?: SavedGamesCollection;
  /**
   * Active team id — picker filters to games matching this team. Optional;
   * undefined leaves all saved games eligible (for users without team
   * scoping configured).
   */
  currentTeamId?: string;
}

/** Phase 0.5 + 1c: list page (with JSON import) and game-picker page. */
const PlanningModal: React.FC<PlanningModalProps> = ({
  isOpen,
  onClose,
  savedGames,
  currentTeamId,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState<PlanningPage>('list');
  const [importedPlan, setImportedPlan] = useState<ImportedPlan | null>(null);
  const [importError, setImportError] = useState<PlanImportError | null>(null);

  // Convert SavedGamesCollection to the picker's input shape.
  const pickerGames: PlanningGamePickerGame[] = useMemo(() => {
    if (!savedGames) return [];
    return Object.entries(savedGames).map(([id, game]) => ({ id, game }));
  }, [savedGames]);

  const resetImportState = () => {
    setImportedPlan(null);
    setImportError(null);
  };

  const goToList = () => {
    setPage('list');
  };

  const handleClose = () => {
    resetImportState();
    setPage('list');
    onClose();
  };

  const handleNewPlan = () => {
    resetImportState();
    setPage('picker');
  };

  const handlePickerContinue = (_gameIds: string[]) => {
    // PR 5d wires this into the editor page; for now Continue closes
    // the modal so the picker's homogeneous-set guard ships visibly
    // without a half-built editor pretending to do something.
    // Reset modal state so the next open lands on the list page, not the
    // picker we just left.
    resetImportState();
    setPage('list');
    onClose();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;

    resetImportState();
    // Plans are tiny — 1 MB is generous. Guard against accidental large
    // files that would stall the main thread on low-memory mobile devices.
    const MAX_BYTES = 1 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setImportError({
        message: t(
          'planningModal.fileTooLarge',
          'File is too large (over 1 MB). Plans should be a few KB; please check the file.',
        ),
      });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () =>
      setImportError({
        message: t('planningModal.readError', 'Failed to read file.'),
      });
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result = parsePlanExport(text);
      if (result.ok) {
        setImportedPlan(result.plan);
      } else {
        setImportError(result.error);
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display"
      data-testid="planning-modal"
    >
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />

        <div className="relative z-10 flex flex-col min-h-0 h-full">
          <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 flex-shrink-0">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
              {t('planningModal.title', 'Planning')}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner space-y-6">
              {page === 'list' && (
                <>
                  {/* Empty / saved-list area */}
                  {!importedPlan && !importError && (
                    <div className="space-y-3 text-center py-8">
                      <p className="text-slate-200 text-base">
                        {t(
                          'planningModal.emptyTitle',
                          'No saved planning sessions yet.',
                        )}
                      </p>
                      <p className="text-slate-400 text-sm">
                        {t(
                          'planningModal.emptyHint',
                          'Import a plan exported from the standalone planner to get started. Saved sessions land in a later phase.',
                        )}
                      </p>
                    </div>
                  )}

                  {/* Import success */}
                  {importedPlan && (
                    <div className="space-y-3 rounded-md bg-emerald-900/30 border border-emerald-700/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-semibold text-emerald-200">
                          {t('planningModal.importSuccessTitle', 'Plan imported')}
                        </h3>
                        <button
                          type="button"
                          onClick={resetImportState}
                          className="rounded-md p-1 text-emerald-200 hover:bg-emerald-900/50"
                          aria-label={t('planningModal.dismissImport', 'Dismiss')}
                        >
                          <HiOutlineXMark className="h-4 w-4" />
                        </button>
                      </div>
                      <ul className="text-sm text-emerald-100/90 space-y-1">
                        <li>
                          <strong>{t('planningModal.team', 'Team')}:</strong>{' '}
                          {importedPlan.teamName}
                        </li>
                        <li>
                          <strong>{t('planningModal.formation', 'Formation')}:</strong>{' '}
                          {importedPlan.formationId}
                        </li>
                        <li>
                          <strong>{t('planningModal.gameCount', 'Games')}:</strong>{' '}
                          {importedPlan.games.length}
                        </li>
                        <li>
                          <strong>{t('planningModal.subCount', 'Scheduled subs')}:</strong>{' '}
                          {importedPlan.games.reduce(
                            (n, g) => n + g.scheduledSubs.length,
                            0,
                          )}
                        </li>
                      </ul>
                      <p className="text-xs text-emerald-200/80 pt-2">
                        {t(
                          'planningModal.importNoApply',
                          'Apply-to-games lands in a later phase. The plan is currently in memory only.',
                        )}
                      </p>
                    </div>
                  )}

                  {/* Import failure */}
                  {importError && (
                    <div className="space-y-2 rounded-md bg-rose-900/30 border border-rose-700/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-semibold text-rose-200">
                          {t('planningModal.importFailedTitle', 'Import failed')}
                        </h3>
                        <button
                          type="button"
                          onClick={resetImportState}
                          className="rounded-md p-1 text-rose-200 hover:bg-rose-900/50"
                          aria-label={t('planningModal.dismissImport', 'Dismiss')}
                        >
                          <HiOutlineXMark className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-sm text-rose-100/90">{importError.message}</p>
                      {importError.path ? (
                        <p className="text-xs font-mono text-rose-200/80">
                          {t('planningModal.errorPath', 'at')}: {importError.path}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row justify-center items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleNewPlan}
                      className="inline-flex items-center gap-2 rounded-md bg-amber-500/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-amber-400"
                    >
                      <HiOutlinePlus className="h-4 w-4" />
                      {t('planningModal.newPlanButton', 'New plan')}
                    </button>
                    <button
                      type="button"
                      onClick={handleImportClick}
                      className="inline-flex items-center gap-2 rounded-md bg-slate-700/70 px-4 py-2 text-sm font-semibold text-slate-100 shadow hover:bg-slate-600"
                    >
                      <HiOutlineArrowUpTray className="h-4 w-4" />
                      {t('planningModal.importButton', 'Import plan from JSON')}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={handleFileChange}
                      className="hidden"
                      data-testid="planning-modal-file-input"
                    />
                  </div>
                </>
              )}

              {page === 'picker' && (
                <PlanningGamePicker
                  games={pickerGames}
                  teamFilterId={currentTeamId}
                  onBack={goToList}
                  onContinue={handlePickerContinue}
                />
              )}
            </div>
          </div>

          <ModalFooter>
            <button type="button" onClick={handleClose} className={primaryButtonStyle}>
              {t('common.doneButton', 'Done')}
            </button>
          </ModalFooter>
        </div>
      </div>
    </div>
  );
};

export default PlanningModal;
