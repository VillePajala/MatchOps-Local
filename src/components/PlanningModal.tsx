'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowUpTray,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import {
  parsePlanExport,
  type ImportedPlan,
  type PlanImportError,
} from '@/utils/planExport';
import type { Player, PlanningSession } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';
import PlanningGamePicker, {
  type PlanningGamePickerGame,
} from './PlanningGamePicker';
import PlanningEditor from './PlanningEditor';
import {
  useDeletePlanningSessionMutation,
  usePlanningSessionsQuery,
} from '@/hooks/usePlanningSessionQueries';

type PlanningPage = 'list' | 'picker' | 'editor';

/**
 * Format a PlanningSession.updatedAt for the row's "updated …" label.
 *
 * Guards against:
 * - missing values (legacy rows or DataStore bugs)
 * - malformed ISO strings (`new Date(<bad>)` returns Invalid Date)
 *
 * Drops the time component — the precise time is noise in this row;
 * coaches care about which day they last touched the plan.
 */
const formatSessionDate = (
  iso: string | undefined,
  locale: string,
): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(locale);
};

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
  /**
   * Active team's display name. Used by the picker as a fallback match
   * for legacy games that have no `teamId` — without this they'd be
   * silently excluded when a team filter is active.
   */
  currentTeamName?: string;
  /** Master roster — required; the editor renders raw UUIDs without it. */
  roster: Player[];
  /** Required — missing at runtime would silently drop saves. */
  applyToGame: (gameId: string, updates: Partial<AppState>) => Promise<void>;
}

const PlanningModal: React.FC<PlanningModalProps> = ({
  isOpen,
  onClose,
  savedGames,
  currentTeamId,
  currentTeamName,
  roster,
  applyToGame,
}) => {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState<PlanningPage>('list');
  const [editorGameIds, setEditorGameIds] = useState<string[]>([]);
  const [importedPlan, setImportedPlan] = useState<ImportedPlan | null>(null);
  const [importError, setImportError] = useState<PlanImportError | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Saved sessions are scoped to the active team. The query is gated on
  // (isOpen && page === 'list') so it doesn't fetch while the modal is
  // closed or while the user is in the picker / editor — avoids cache
  // refresh churn during in-flight editing.
  const sessionsEnabled = isOpen && page === 'list';
  const sessionsQuery = usePlanningSessionsQuery({
    teamId: currentTeamId,
    enabled: sessionsEnabled,
  });
  const deleteSession = useDeletePlanningSessionMutation();
  const sessions: PlanningSession[] = sessionsQuery.data ?? [];

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
    setEditorGameIds([]);
    setPendingDeleteId(null);
    setPage('list');
    onClose();
  };

  const handleNewPlan = () => {
    resetImportState();
    setPage('picker');
  };

  const handlePickerContinue = (gameIds: string[]) => {
    // Picker's validation already blocks Continue on empty selection;
    // guarding here makes the contract explicit at the call site.
    if (gameIds.length === 0) return;
    setEditorGameIds(gameIds);
    setPage('editor');
  };

  const handleEditorBack = () => {
    setPage('picker');
  };

  const handleEditorApplied = () => {
    setEditorGameIds([]);
    setPendingDeleteId(null);
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
    // FileReader rather than `file.text()` for broader runtime support
    // (jsdom's File polyfill in tests, older mobile Safari).
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
                  {/* Saved-session list */}
                  {!importedPlan && !importError && sessionsQuery.isLoading && (
                    <div
                      className="text-center py-6 text-slate-300 text-sm"
                      role="status"
                    >
                      {t('planningModal.sessionsLoading', 'Loading saved plans…')}
                    </div>
                  )}

                  {/* Error banner: replaces the blank state on fetch failure (full retry UI in PR 7c). */}
                  {!importedPlan && !importError && sessionsQuery.isError && (
                    <p
                      className="text-center text-sm text-rose-300 py-4"
                      role="alert"
                      data-testid="planning-modal-sessions-error"
                    >
                      {t(
                        'planningModal.sessionsLoadError',
                        'Could not load saved plans. Please try again.',
                      )}
                    </p>
                  )}

                  {/* Empty state: reserved for genuine empty-but-successful — !isError keeps it from masking a fetch failure. */}
                  {!importedPlan &&
                    !importError &&
                    !sessionsQuery.isLoading &&
                    !sessionsQuery.isError &&
                    sessions.length === 0 && (
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
                            'Start a new plan from your saved games, or import a plan exported from the standalone planner.',
                          )}
                        </p>
                      </div>
                    )}

                  {/* List: !isError prevents stale data rendering alongside the error banner. */}
                  {!importedPlan &&
                    !importError &&
                    !sessionsQuery.isError &&
                    sessions.length > 0 && (
                      <div
                        className="space-y-2"
                        data-testid="planning-modal-session-list"
                      >
                        <h3
                          id="planning-modal-session-heading"
                          className="text-sm font-semibold text-slate-200"
                        >
                          {t(
                            'planningModal.savedSessionsHeading',
                            'Saved plans',
                          )}
                        </h3>
                        <ul
                          aria-labelledby="planning-modal-session-heading"
                          className="space-y-2"
                        >
                          {sessions.map((session) => {
                            const isPending = pendingDeleteId === session.id;
                            return (
                              <li
                                key={session.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium text-slate-100">
                                      {session.name}
                                    </span>
                                    {session.isActive && (
                                      <span className="rounded-full bg-emerald-700/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                                        {t(
                                          'planningModal.activeBadge',
                                          'Active',
                                        )}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-400">
                                    {t(
                                      'planningModal.gameCountLabel',
                                      '{{count}} games',
                                      { count: session.gameIds.length },
                                    )}
                                    {' · '}
                                    {t(
                                      'planningModal.updatedAtLabel',
                                      'updated {{date}}',
                                      {
                                        date: formatSessionDate(
                                          session.updatedAt,
                                          i18n.language,
                                        ),
                                      },
                                    )}
                                  </p>
                                </div>

                                {isPending ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      // `mutate` + onSettled (not mutateAsync)
                                      // so React Query absorbs rejections
                                      // rather than letting them escape as
                                      // unhandled errors. `disabled` on
                                      // isPending blocks double-submit while
                                      // the backend round-trip is in flight.
                                      onClick={() => {
                                        deleteSession.mutate(session.id, {
                                          onSettled: () =>
                                            setPendingDeleteId(null),
                                        });
                                      }}
                                      disabled={deleteSession.isPending}
                                      className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
                                      data-testid={`planning-session-delete-confirm-${session.id}`}
                                    >
                                      {t(
                                        'planningModal.deleteConfirm',
                                        'Confirm delete?',
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPendingDeleteId(null)}
                                      className="rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
                                    >
                                      {t('common.cancel', 'Cancel')}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPendingDeleteId(session.id)
                                    }
                                    className="rounded-md p-1.5 text-slate-300 hover:bg-rose-900/40 hover:text-rose-200"
                                    aria-label={t(
                                      'planningModal.deleteSession',
                                      'Delete plan',
                                    )}
                                    data-testid={`planning-session-delete-${session.id}`}
                                  >
                                    <HiOutlineTrash className="h-4 w-4" />
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
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
                  teamFilterName={currentTeamName}
                  onBack={goToList}
                  onContinue={handlePickerContinue}
                />
              )}

              {page === 'editor' && (
                <PlanningEditor
                  gameIds={editorGameIds}
                  savedGames={savedGames ?? {}}
                  roster={roster}
                  onBack={handleEditorBack}
                  onApplied={handleEditorApplied}
                  applyToGame={applyToGame}
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
