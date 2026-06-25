"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/ToastProvider";
import { useDataStore } from "@/hooks/useDataStore";
import {
  getLastOffDeviceBackupTime,
  getBackupReminderDismissedTime,
  setBackupReminderDismissed,
} from "@/utils/appSettings";
import { exportFullBackup } from "@/utils/fullBackup";
import logger from "@/utils/logger";

/**
 * Data Safety - Layer 2b: a gentle, dismissible reminder to keep an OFF-DEVICE
 * backup. Shows only when the user has data AND their last off-device backup
 * (export/share) is older than 30 days AND they haven't snoozed the reminder in
 * the last 30 days. "Back up now" opens the share/download flow (which records a
 * fresh timestamp and hides the banner); "Dismiss" snoozes for another 30 days.
 */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface BackupReminderBannerProps {
  /** Whether the user has any saved games worth backing up. */
  hasSavedGames: boolean;
}

const BackupReminderBanner: React.FC<BackupReminderBannerProps> = ({ hasSavedGames }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { userId } = useDataStore();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const evaluate = useCallback(async () => {
    // Nothing to protect yet → never nag.
    if (!hasSavedGames) {
      setVisible(false);
      return;
    }
    try {
      const dismissed = await getBackupReminderDismissedTime();
      if (dismissed && Date.now() - dismissed < THIRTY_DAYS_MS) {
        setVisible(false);
        return;
      }
      const last = await getLastOffDeviceBackupTime();
      if (last && Date.now() - last < THIRTY_DAYS_MS) {
        setVisible(false);
        return;
      }
      setVisible(true);
    } catch (error) {
      logger.debug("[BackupReminderBanner] evaluate failed (non-critical)", { error });
      setVisible(false);
    }
  }, [hasSavedGames]);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  const handleBackupNow = useCallback(async () => {
    setBusy(true);
    try {
      await exportFullBackup(showToast, userId);
    } catch {
      // exportFullBackup surfaces its own error toast.
    } finally {
      setBusy(false);
      // A successful backup updates the timestamp → re-evaluate hides the banner.
      // A cancelled share leaves it visible (the user can dismiss it).
      evaluate();
    }
  }, [showToast, userId, evaluate]);

  const handleDismiss = useCallback(async () => {
    try {
      await setBackupReminderDismissed();
    } catch (error) {
      logger.debug("[BackupReminderBanner] dismiss persist failed (non-critical)", { error });
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-3 bg-indigo-700/95 text-white px-4 py-2 text-sm"
    >
      <span className="text-center">
        {t("backupReminder.message", "It's been a while since your last backup. Keep your data safe with an off-device copy.")}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleBackupNow}
          disabled={busy}
          className="px-3 py-1 bg-white text-indigo-800 rounded font-medium hover:bg-indigo-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {t("backupReminder.backupNow", "Back up now")}
        </button>
        <button
          onClick={handleDismiss}
          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition-colors"
        >
          {t("backupReminder.dismiss", "Dismiss")}
        </button>
      </div>
    </div>
  );
};

export default BackupReminderBanner;
