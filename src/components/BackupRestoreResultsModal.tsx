'use client';

import React, { useState } from 'react';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineXMark,
  HiChevronDown,
  HiChevronUp
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
  const [showMappingDetails, setShowMappingDetails] = useState(false);

  if (!isOpen || !result) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const { statistics, mappingReport, warnings } = result;
  const totalCompetitions = statistics.seasonsImported + statistics.tournamentsImported;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display" onClick={handleBackdropClick}>
      <div className="bg-slate-800 rounded-lg border border-slate-600 shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto text-slate-100" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50 bg-slate-900/20 backdrop-blur-sm">
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

        <div className="p-6 space-y-6">
          {/* Summary Message */}
          <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <HiOutlineCheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-200">
                {t('backupRestore.successMessage', {
                  games: statistics.gamesImported,
                  players: statistics.playersImported,
                  teams: statistics.teamsImported,
                  defaultValue: 'Successfully restored {{games}} games, {{players}} players, and {{teams}} teams.'
                })}
              </p>
            </div>
          </div>

          {/* Statistics Grid */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-3">{t('backupRestore.statistics', 'Import Statistics')}</h3>
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

              {/* Competitions */}
              <div className="bg-slate-800/60 border border-slate-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-purple-400">{totalCompetitions}</div>
                <div className="text-sm text-slate-400">{t('backupRestore.competitionsImported', { count: totalCompetitions, defaultValue_one: 'Competition', defaultValue_other: 'Competitions' })}</div>
              </div>

              {/* Personnel */}
              <div className="bg-slate-800/60 border border-slate-700 rounded p-3 text-center">
                <div className="text-2xl font-bold text-cyan-400">{statistics.personnelImported}</div>
                <div className="text-sm text-slate-400 leading-tight">
                  <div>{t('backupRestore.personnelImported', 'Personnel')}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{t('backupRestore.personnelImportedCount', { count: statistics.personnelImported, defaultValue_one: '{{count}} person', defaultValue_other: '{{count}} people' })}</div>
                </div>
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

          {/* Competition Details (if any) */}
          {totalCompetitions > 0 && (
            <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-2">
                {t('backupRestore.competitionBreakdown', 'Competition Breakdown')}
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('backupRestore.seasonsImported', { count: statistics.seasonsImported, defaultValue_one: 'Season', defaultValue_other: 'Seasons' })}:</span>
                  <span className="text-slate-200 font-medium">{statistics.seasonsImported}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('backupRestore.tournamentsImported', { count: statistics.tournamentsImported, defaultValue_one: 'Tournament', defaultValue_other: 'Tournaments' })}:</span>
                  <span className="text-slate-200 font-medium">{statistics.tournamentsImported}</span>
                </div>
              </div>
            </div>
          )}

          {/* Player Mapping Details (collapsible) */}
          {mappingReport && mappingReport.totalGames > 0 && (
            <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowMappingDetails(!showMappingDetails)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-800/40 transition-colors"
              >
                <h4 className="text-sm font-medium text-slate-300">
                  {t('backupRestore.playerMapping', 'Player Mapping Details')}
                </h4>
                {showMappingDetails ? (
                  <HiChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <HiChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {showMappingDetails && (
                <div className="px-4 pb-4 space-y-2 text-sm border-t border-slate-700/50 pt-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('backupRestore.mappedGames', 'Games with Mapped Players')}:</span>
                    <span className="text-slate-200 font-medium">{mappingReport.gamesWithMappedPlayers} / {mappingReport.totalGames}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('backupRestore.exactMatches', 'Exact ID Matches')}:</span>
                    <span className="text-green-400 font-medium">{mappingReport.exactMatches}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('backupRestore.nameMatches', 'Name Matches')}:</span>
                    <span className="text-yellow-400 font-medium">{mappingReport.nameMatches}</span>
                  </div>
                  {mappingReport.noMatches > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('backupRestore.noMatches', 'Unmapped Players')}:</span>
                      <span className="text-red-400 font-medium">{mappingReport.noMatches}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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

        <ModalFooter>
          <button onClick={onClose} className={primaryButtonStyle}>
            {t('common.continue', 'Continue')}
          </button>
        </ModalFooter>
      </div>
    </div>
  );
};

export default BackupRestoreResultsModal;
