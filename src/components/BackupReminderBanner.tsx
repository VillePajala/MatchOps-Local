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
import { exportFullBackup, prewarmBackup, trySharePrewarmedBackup } from "@/utils/fullBackup";
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

  // Build the backup ahead of the tap so navigator.share() fires with a fresh
  // user activation (otherwise it throws NotAllowedError and falls back to a
  // plain download). Prewarm once the banner is actually shown.
  useEffect(() => {
    if (visible) {
      prewarmBackup(userId);
    }
  }, [visible, userId]);

  const handleBackupNow = useCallback(async () => {
    // Synchronous share first (must run before any await to keep the tap's user
    // activation, which navigator.share() requires). If launched, re-evaluate
    // once the off-device timestamp is recorded so the banner hides itself.
    if (trySharePrewarmedBackup(showToast, userId, () => evaluate())) {
      return;
    }
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

  // Floating overlay card (fixed) rather than an inline banner, so it never steals
  // layout height from the field/app. App-style: slate card, indigo primary action.
  // z-[25]: BELOW the full-screen TimerOverlay (z-30), the sidebar backdrop (z-40),
  // the sidebar (z-50) and modals - an overdue-backup reminder must never sit on
  // top of live-game controls or navigation chrome. It floats clear of the bottom
  // ControlBar spatially (bottom offset), so its buttons stay tappable in normal use.
  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-[25] flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto w-full max-w-md rounded-xl border border-slate-700 bg-slate-800/95 backdrop-blur-sm shadow-xl p-3 flex flex-col gap-2"
      >
        <span className="text-sm text-slate-100">
          {t("backupReminder.message", "It's been a while since your last backup. Keep your data safe with an off-device copy.")}
        </span>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-sm rounded-md text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            {t("backupReminder.dismiss", "Dismiss")}
          </button>
          <button
            onClick={handleBackupNow}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {t("backupReminder.backupNow", "Back up now")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupReminderBanner;
