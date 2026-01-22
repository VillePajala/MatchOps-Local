'use client';

/**
 * CloudModeImportModal Component
 *
 * Shown when user attempts to import a backup file while in cloud mode.
 * Explains that backup files contain local data and offers two options:
 * 1. Import & Migrate - imports to local, then triggers migration wizard
 * 2. Switch to Local Mode - switches mode first, then imports
 *
 * This is necessary because the backup import writes to local IndexedDB,
 * not to Supabase cloud storage. Without this modal, users would import
 * data that's invisible to the cloud-mode app.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCloudArrowUp, HiOutlineDevicePhoneMobile, HiOutlineXMark } from 'react-icons/hi2';
import {
  wizardBackdropStyle,
  wizardModalStyle,
  wizardHeaderStyle,
  wizardTitleStyle,
  wizardContentStyle,
  wizardCloseButtonStyle,
  secondaryButtonStyle,
} from '@/styles/modalStyles';

interface CloudModeImportModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when user chooses to import and migrate to cloud */
  onImportAndMigrate: () => void;
  /** Called when user chooses to switch to local mode first */
  onSwitchToLocal: () => void;
  /** Called when user cancels the operation */
  onCancel: () => void;
}

export default function CloudModeImportModal({
  isOpen,
  onImportAndMigrate,
  onSwitchToLocal,
  onCancel,
}: CloudModeImportModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className={wizardBackdropStyle}>
      <div className={wizardModalStyle}>
        {/* Header */}
        <div className={wizardHeaderStyle}>
          <h2 className={wizardTitleStyle}>
            {t('cloudModeImport.title', 'Import Backup')}
          </h2>
          <button
            onClick={onCancel}
            className={wizardCloseButtonStyle}
            aria-label={t('common.close', 'Close')}
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className={wizardContentStyle}>
          <p className="text-slate-300 text-sm mb-4">
            {t(
              'cloudModeImport.description',
              "You're currently using Cloud Sync. Backup files contain local data that needs to be uploaded to your cloud account."
            )}
          </p>

          <p className="text-slate-400 text-sm mb-5">
            {t('cloudModeImport.chooseOption', 'Choose how you want to proceed:')}
          </p>

          {/* Options */}
          <div className="space-y-3">
            {/* Option 1: Import & Migrate */}
            <button
              onClick={onImportAndMigrate}
              className="w-full p-4 rounded-lg bg-slate-700/50 border border-slate-600 hover:bg-slate-700 hover:border-sky-500/50 transition-all text-left group"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 rounded-lg bg-sky-500/20 text-sky-400 group-hover:bg-sky-500/30">
                  <HiOutlineCloudArrowUp className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium mb-1">
                    {t('cloudModeImport.importAndMigrate', 'Import & Migrate to Cloud')}
                  </div>
                  <div className="text-slate-400 text-sm">
                    {t(
                      'cloudModeImport.importAndMigrateDesc',
                      'Import the backup, then upload all data to your cloud account.'
                    )}
                  </div>
                  <div className="text-sky-400 text-xs mt-2 font-medium">
                    {t('cloudModeImport.recommended', 'Recommended')}
                  </div>
                </div>
              </div>
            </button>

            {/* Option 2: Switch to Local Mode */}
            <button
              onClick={onSwitchToLocal}
              className="w-full p-4 rounded-lg bg-slate-700/50 border border-slate-600 hover:bg-slate-700 hover:border-slate-500 transition-all text-left group"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 rounded-lg bg-slate-600/50 text-slate-400 group-hover:bg-slate-600">
                  <HiOutlineDevicePhoneMobile className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium mb-1">
                    {t('cloudModeImport.switchToLocal', 'Switch to Local Mode')}
                  </div>
                  <div className="text-slate-400 text-sm">
                    {t(
                      'cloudModeImport.switchToLocalDesc',
                      'Switch to local mode first. Data will stay on this device only.'
                    )}
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end">
          <button
            onClick={onCancel}
            className={secondaryButtonStyle}
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
