'use client';

import React, { useRef } from 'react';
import {
  ModalFooter,
  primaryButtonStyle,
  WizardBackdrop,
  wizardModalLargeStyle,
  wizardHeaderStyle,
  wizardTitleStyle,
  wizardContentStyle,
  wizardCloseButtonStyle,
  sectionLabelStyle,
  warningBoxStyle,
  errorBoxStyle,
  successBoxStyle,
  progressBarContainerStyle,
  progressBarFillStyle,
} from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineExclamationTriangle,
  HiOutlineInformationCircle,
  HiOutlineXMark
} from 'react-icons/hi2';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

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

  useEscapeToClose(isOpen, onClose);


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
      return <div className="animate-spin w-8 h-8 border-4 border-action border-t-transparent rounded-full" />;
    }
    
    if (!importResult) return null;

    if (importResult.failed.length === 0) {
      return <HiOutlineCheckCircle className="w-8 h-8 text-win" />;
    } else if (importResult.successful > 0) {
      return <HiOutlineExclamationTriangle className="w-8 h-8 text-action" />;
    } else {
      return <HiOutlineXCircle className="w-8 h-8 text-loss" />;
    }
  };

  return (
    <WizardBackdrop onClick={handleBackdropClick}>
      <div ref={modalRef} className={`${wizardModalLargeStyle} font-ui overflow-y-auto text-ink`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className={wizardHeaderStyle}>
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <h2 className={wizardTitleStyle}>
              {isImporting ? t('importResults.importing') : t('importResults.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={wizardCloseButtonStyle}
            disabled={isImporting}
          >
            <HiOutlineXMark className="w-6 h-6" />
          </button>
        </div>

        <div className={wizardContentStyle}>
          {isImporting ? (
            <div className="text-center py-8">
              <p className="text-ink-2 mb-4">{t('importResults.processing')}</p>
              <div className={progressBarContainerStyle}>
                <div className="bg-action h-full rounded-full animate-pulse w-1/2"></div>
              </div>
            </div>
          ) : importResult ? (
            <div className="space-y-6">
              {/* Summary Statistics */}
              <div>
                <h3 className={`${sectionLabelStyle} mb-3`}>{t('importResults.summary')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-ink">
                  <div className="rounded-2xl bg-carbon/60 p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                    <div className="s1-numeral font-display text-3xl font-bold italic">{importResult.successful}</div>
                    <div className="text-sm text-ink-3">{t('importResults.successful')}</div>
                  </div>
                  <div className="rounded-2xl bg-carbon/60 p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                    <div className="s1-numeral font-display text-3xl font-bold italic">{importResult.skipped}</div>
                    <div className="text-sm text-ink-3">{t('importResults.skipped')}</div>
                  </div>
                  <div className="rounded-2xl bg-carbon/60 p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                    <div className="s1-numeral font-display text-3xl font-bold italic">{importResult.failed.length}</div>
                    <div className="text-sm text-ink-3">{t('importResults.failed')}</div>
                  </div>
                  <div className="rounded-2xl bg-carbon/60 p-3 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                    <div className="s1-numeral font-display text-3xl font-bold italic">{getSuccessRate()}%</div>
                    <div className="text-sm text-ink-3">{t('importResults.successRate')}</div>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              {getTotalProcessed() > 0 && (
                <div className={progressBarContainerStyle}>
                  <div
                    className={`${progressBarFillStyle} bg-win rounded-l-full`}
                    style={{ width: `${(importResult.successful / getTotalProcessed()) * 100}%` }}
                  ></div>
                  <div
                    className={`${progressBarFillStyle} bg-ink-3`}
                    style={{
                      width: `${(importResult.skipped / getTotalProcessed()) * 100}%`,
                      marginLeft: `${(importResult.successful / getTotalProcessed()) * 100}%`
                    }}
                  ></div>
                  <div
                    className={`${progressBarFillStyle} bg-loss rounded-r-full`}
                    style={{
                      width: `${(importResult.failed.length / getTotalProcessed()) * 100}%`,
                      marginLeft: `${((importResult.successful + importResult.skipped) / getTotalProcessed()) * 100}%`
                    }}
                  ></div>
                </div>
              )}

              {/* Warnings */}
              {importResult.warnings.length > 0 && (
                <div className={warningBoxStyle}>
                  <div className="flex items-start space-x-2">
                    <HiOutlineExclamationTriangle className="w-5 h-5 text-action mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-ink-2 font-medium mb-2">{t('importResults.warnings')}</h4>
                      <ul className="space-y-1">
                        {importResult.warnings.map((warning, index) => (
                          <li key={index} className="text-ink-2 text-sm">
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
                <div className={errorBoxStyle}>
                  <div className="flex items-start space-x-2">
                    <HiOutlineXCircle className="w-5 h-5 text-loss mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-ink font-medium mb-2">
                        {t('importResults.failedImports')} ({importResult.failed.length})
                      </h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {importResult.failed.map((failure, index) => (
                          <div key={index} className="text-sm bg-carbon/60 rounded-xl p-2">
                            <div className="font-medium text-ink">{failure.gameId}</div>
                            <div className="text-ink-2">{failure.error}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {importResult.failed.length === 0 && importResult.successful > 0 && (
                <div className={successBoxStyle}>
                  <div className="flex items-center space-x-2">
                    <HiOutlineCheckCircle className="w-5 h-5 text-win" />
                    <p className="text-ink">
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
              <HiOutlineInformationCircle className="w-12 h-12 text-ink-3 mx-auto mb-4" />
              <p className="text-ink-2">{t('importResults.noResults')}</p>
            </div>
          )}
        </div>

        <ModalFooter>
          <button onClick={onClose} disabled={isImporting} className={primaryButtonStyle}>
            {isImporting ? t('common.processing', 'Processing...') : t('common.doneButton', 'Done')}
          </button>
        </ModalFooter>
      </div>
    </WizardBackdrop>
  );
};

export default ImportResultsModal;
