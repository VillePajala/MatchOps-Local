'use client';

import React from 'react';
import { primaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineXMark
} from 'react-icons/hi2';

export interface BackupRestoreResult {
  success: boolean;
  statistics: {
    gamesImported: number;
    playersImported: number;
    teamsImported: number;
    seasonsImported: number;
    tournamentsImported: number;
    personnelImported: number;
    settingsRestored: boolean;
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

  if (!isOpen || !result) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const { statistics, warnings } = result;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display" onClick={handleBackdropClick}>
      <div className="bg-slate-800 rounded-lg border border-slate-600 shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto text-slate-100" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-slate-900/20 backdrop-blur-sm">
          <div className="flex items-center space-x-3">
            <HiOutlineCheckCircle className="w-8 h-8 text-green-500" />
            <h2 className="text-xl font-semibold text-green-600">
              {t('backupRestore.resultsTitle', 'Backup Restore Complete')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-slate-100 transition-colors"
          >
            <HiOutlineXMark className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Statistics Grid */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-3">{t('backupRestore.statistics', 'Imported Data')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Games */}
              <div className="bg-slate-800/60 border border-slate-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-indigo-400">{statistics.gamesImported}</div>
                <div className="text-sm text-slate-400">{t('backupRestore.gamesImported', { count: statistics.gamesImported, defaultValue_one: 'Game', defaultValue_other: 'Games' })}</div>
              </div>

              {/* Players */}
              <div className="bg-slate-800/60 border border-slate-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">{statistics.playersImported}</div>
                <div className="text-sm text-slate-400">{t('backupRestore.playersImported', { count: statistics.playersImported, defaultValue_one: 'Player', defaultValue_other: 'Players' })}</div>
              </div>

              {/* Teams */}
              <div className="bg-slate-800/60 border border-slate-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">{statistics.teamsImported}</div>
                <div className="text-sm text-slate-400">{t('backupRestore.teamsImported', { count: statistics.teamsImported, defaultValue_one: 'Team', defaultValue_other: 'Teams' })}</div>
              </div>

              {/* Seasons */}
              <div className="bg-slate-800/60 border border-slate-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">{statistics.seasonsImported}</div>
                <div className="text-sm text-slate-400">{t('backupRestore.seasonsImported', { count: statistics.seasonsImported, defaultValue_one: 'Season', defaultValue_other: 'Seasons' })}</div>
              </div>

              {/* Tournaments */}
              <div className="bg-slate-800/60 border border-slate-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-rose-400">{statistics.tournamentsImported}</div>
                <div className="text-sm text-slate-400">{t('backupRestore.tournamentsImported', { count: statistics.tournamentsImported, defaultValue_one: 'Tournament', defaultValue_other: 'Tournaments' })}</div>
              </div>

              {/* Personnel */}
              <div className="bg-slate-800/60 border border-slate-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-cyan-400">{statistics.personnelImported}</div>
                <div className="text-sm text-slate-400">{t('backupRestore.personnelImported', { count: statistics.personnelImported, defaultValue_one: 'Personnel', defaultValue_other: 'Personnel' })}</div>
              </div>

              {/* Settings */}
              <div className="bg-slate-800/60 border border-slate-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-slate-300">
                  {statistics.settingsRestored ? '✓' : '—'}
                </div>
                <div className="text-sm text-slate-400">{t('backupRestore.settingsRestored', 'Settings')}</div>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <HiOutlineExclamationTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-amber-300 font-medium mb-2">{t('backupRestore.warnings', 'Warnings')}</h4>
                  <ul className="space-y-1">
                    {warnings.map((warning, index) => (
                      <li key={index} className="text-amber-200 text-sm">
                        • {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-700/50 bg-slate-900/20 backdrop-blur-sm">
          <button onClick={onClose} className={primaryButtonStyle}>
            {t('common.continue', 'Continue')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupRestoreResultsModal;
