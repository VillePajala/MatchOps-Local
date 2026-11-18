'use client';

import React, { useRef } from 'react';
import {
  primaryButtonStyle,
  DialogBackdrop,
  dialogTitleStyle,
  warningBoxStyle,
  sectionLabelStyle,
  wizardCloseButtonStyle,
} from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineXMark
} from 'react-icons/hi2';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export interface BackupRestoreResult {
  success: boolean;
  statistics: {
    gamesImported: number;
    playersImported: number;
    teamsImported: number;
    seasonsImported: number;
    tournamentsImported: number;
    personnelImported: number;
  };
  mappingReport?: {
    totalGames: number;
    gamesWithMappedPlayers: number;
    totalPlayerMappings: number;
    exactMatches: number;
    nameMatches: number;
    noMatches: number;
  };
  warnings: string[];
}

interface BackupRestoreResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: BackupRestoreResult | null;
}

const BackupRestoreResultsModal: React.FC<BackupRestoreResultsModalProps> = ({
  isOpen,
  onClose,
  result,
}) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap: keeps Tab cycling within modal
  useFocusTrap(modalRef, isOpen);

  if (!isOpen || !result) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const { statistics, warnings } = result;

  return (
    <DialogBackdrop className="z-[60]" onClick={handleBackdropClick}>
      <div ref={modalRef} className="s1-list font-ui max-w-2xl w-full flex flex-col text-ink max-h-[85vh] overflow-hidden" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-hairline flex-shrink-0">
          <div className="flex items-center space-x-3">
            <HiOutlineCheckCircle className="w-8 h-8 text-win" />
            <h2 className={dialogTitleStyle}>
              {t('backupRestore.resultsTitle', 'Backup Restore Complete')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={wizardCloseButtonStyle}
            aria-label={t('common.close', 'Close')}
          >
            <HiOutlineXMark className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Statistics Grid */}
          <div>
            <h3 className={`${sectionLabelStyle} mb-3`}>{t('backupRestore.statistics', 'Imported Data')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Games */}
              <div className="rounded-2xl bg-carbon/60 p-3 text-center shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                <div className="s1-numeral font-display text-3xl font-bold italic">{statistics.gamesImported}</div>
                <div className="text-sm text-ink-3">{t('backupRestore.gamesImported', { count: statistics.gamesImported, defaultValue_one: 'Game', defaultValue_other: 'Games' })}</div>
              </div>

              {/* Players */}
              <div className="rounded-2xl bg-carbon/60 p-3 text-center shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                <div className="s1-numeral font-display text-3xl font-bold italic">{statistics.playersImported}</div>
                <div className="text-sm text-ink-3">{t('backupRestore.playersImported', { count: statistics.playersImported, defaultValue_one: 'Player', defaultValue_other: 'Players' })}</div>
              </div>

              {/* Teams */}
              <div className="rounded-2xl bg-carbon/60 p-3 text-center shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                <div className="s1-numeral font-display text-3xl font-bold italic">{statistics.teamsImported}</div>
                <div className="text-sm text-ink-3">{t('backupRestore.teamsImported', { count: statistics.teamsImported, defaultValue_one: 'Team', defaultValue_other: 'Teams' })}</div>
              </div>

              {/* Seasons */}
              <div className="rounded-2xl bg-carbon/60 p-3 text-center shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                <div className="s1-numeral font-display text-3xl font-bold italic">{statistics.seasonsImported}</div>
                <div className="text-sm text-ink-3">{t('backupRestore.seasonsImported', { count: statistics.seasonsImported, defaultValue_one: 'Season', defaultValue_other: 'Seasons' })}</div>
              </div>

              {/* Tournaments */}
              <div className="rounded-2xl bg-carbon/60 p-3 text-center shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                <div className="s1-numeral font-display text-3xl font-bold italic">{statistics.tournamentsImported}</div>
                <div className="text-sm text-ink-3">{t('backupRestore.tournamentsImported', { count: statistics.tournamentsImported, defaultValue_one: 'Tournament', defaultValue_other: 'Tournaments' })}</div>
              </div>

              {/* Personnel */}
              <div className="rounded-2xl bg-carbon/60 p-3 text-center shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                <div className="s1-numeral font-display text-3xl font-bold italic">{statistics.personnelImported}</div>
                <div className="text-sm text-ink-3">{t('backupRestore.personnelImported', { count: statistics.personnelImported, defaultValue_one: 'Personnel', defaultValue_other: 'Personnel' })}</div>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className={warningBoxStyle}>
              <div className="flex items-start space-x-2">
                <HiOutlineExclamationTriangle className="w-5 h-5 text-action mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-ink-2 font-medium mb-2">{t('backupRestore.warnings', 'Warnings')}</h4>
                  <ul className="space-y-1">
                    {warnings.map((warning, index) => (
                      <li key={index} className="text-ink-2 text-sm">
                        • {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-hairline flex justify-end flex-shrink-0">
          <button onClick={onClose} className={primaryButtonStyle}>
            {t('common.continue', 'Continue')}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
};

export default BackupRestoreResultsModal;
