'use client';

import React, { useRef } from 'react';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineExclamationTriangle,
  HiOutlineInformationCircle,
  HiOutlineXMark
} from 'react-icons/hi2';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ImportResult {
  successful: number;
  skipped: number;
  failed: Array<{ gameId: string; error: string; }>;
  warnings: string[];
}

interface ImportResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  importResult: ImportResult | null;
  isImporting?: boolean;
}

const ImportResultsModal: React.FC<ImportResultsModalProps> = ({
  isOpen,
  onClose,
  importResult,
  isImporting = false,
}) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap: keeps Tab cycling within modal
  useFocusTrap(modalRef, isOpen);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getTotalProcessed = () => {
    if (!importResult) return 0;
    return importResult.successful + importResult.skipped + importResult.failed.length;
  };

  const getSuccessRate = () => {
    const total = getTotalProcessed();
    if (!importResult || total === 0) return 0;
    return Math.round((importResult.successful / total) * 100);
  };

  const getStatusIcon = () => {
    if (isImporting) {
      return <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />;
    }
    
    if (!importResult) return null;

    if (importResult.failed.length === 0) {
      return <HiOutlineCheckCircle className="w-8 h-8 text-green-500" />;
    } else if (importResult.successful > 0) {
      return <HiOutlineExclamationTriangle className="w-8 h-8 text-yellow-500" />;
    } else {
      return <HiOutlineXCircle className="w-8 h-8 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    if (isImporting) return 'text-blue-600';
    if (!importResult) return 'text-gray-600';
    
    if (importResult.failed.length === 0) {
      return 'text-green-600';
    } else if (importResult.successful > 0) {
      return 'text-yellow-600';
    } else {
      return 'text-red-600';
    }
  };

  return (
    <div ref={modalRef} className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display" onClick={handleBackdropClick}>
      <div className="bg-slate-800 rounded-lg border border-slate-600 shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto text-slate-100" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50 bg-slate-900/20 backdrop-blur-sm">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <h2 className={`text-xl font-semibold ${getStatusColor()}`}>
              {isImporting ? t('importResults.importing') : t('importResults.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-slate-100 transition-colors"
            disabled={isImporting}
          >
            <HiOutlineXMark className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {isImporting ? (
            <div className="text-center py-8">
              <p className="text-slate-300 mb-4">{t('importResults.processing')}</p>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-indigo-500 h-2 rounded-full animate-pulse w-1/2"></div>
              </div>
            </div>
          ) : importResult ? (
            <div className="space-y-6">
              {/* Summary Statistics */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4">
                <h3 className="text-lg font-medium mb-3">{t('importResults.summary')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-slate-200">
                  <div className="bg-slate-800/60 border border-slate-700 rounded p-3">
                    <div className="text-2xl font-bold text-green-400">{importResult.successful}</div>
                    <div className="text-sm text-slate-400">{t('importResults.successful')}</div>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700 rounded p-3">
                    <div className="text-2xl font-bold text-indigo-400">{importResult.skipped}</div>
                    <div className="text-sm text-slate-400">{t('importResults.skipped')}</div>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700 rounded p-3">
                    <div className="text-2xl font-bold text-red-400">{importResult.failed.length}</div>
                    <div className="text-sm text-slate-400">{t('importResults.failed')}</div>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700 rounded p-3">
                    <div className="text-2xl font-bold text-slate-300">{getSuccessRate()}%</div>
                    <div className="text-sm text-slate-400">{t('importResults.successRate')}</div>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-700 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-l-full"
                  style={{ width: `${(importResult.successful / getTotalProcessed()) * 100}%` }}
                ></div>
                <div
                  className="bg-indigo-500 h-3"
                  style={{ 
                    width: `${(importResult.skipped / getTotalProcessed()) * 100}%`,
                    marginLeft: `${(importResult.successful / getTotalProcessed()) * 100}%`
                  }}
                ></div>
                <div
                  className="bg-red-500 h-3 rounded-r-full"
                  style={{ 
                    width: `${(importResult.failed.length / getTotalProcessed()) * 100}%`,
                    marginLeft: `${((importResult.successful + importResult.skipped) / getTotalProcessed()) * 100}%`
                  }}
                ></div>
              </div>

              {/* Warnings */}
              {importResult.warnings.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <HiOutlineExclamationTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-amber-300 font-medium mb-2">{t('importResults.warnings')}</h4>
                      <ul className="space-y-1">
                        {importResult.warnings.map((warning, index) => (
                          <li key={index} className="text-amber-200 text-sm">
                            • {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Failed Imports */}
              {importResult.failed.length > 0 && (
                <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <HiOutlineXCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-red-300 font-medium mb-2">
                        {t('importResults.failedImports')} ({importResult.failed.length})
                      </h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {importResult.failed.map((failure, index) => (
                          <div key={index} className="text-sm bg-slate-800/60 rounded p-2 border border-red-600/20">
                            <div className="font-medium text-red-300">{failure.gameId}</div>
                            <div className="text-red-400">{failure.error}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {importResult.failed.length === 0 && importResult.successful > 0 && (
                <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <HiOutlineCheckCircle className="w-5 h-5 text-green-400" />
                    <p className="text-green-200">
                      {t('importResults.successMessage', { 
                        count: importResult.successful,
                        skipped: importResult.skipped 
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <HiOutlineInformationCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-300">{t('importResults.noResults')}</p>
            </div>
          )}
        </div>

        <ModalFooter>
          <button onClick={onClose} disabled={isImporting} className={primaryButtonStyle}>
            {isImporting ? t('common.processing', 'Processing...') : t('common.doneButton', 'Done')}
          </button>
        </ModalFooter>
      </div>
    </div>
  );
};

export default ImportResultsModal;
