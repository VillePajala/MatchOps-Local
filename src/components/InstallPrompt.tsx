"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import styles from "./InstallPrompt.module.css";
import logger from "@/utils/logger";
import { getStorageItem, setStorageItem } from "@/utils/storage";

// Define proper interfaces for better type safety
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Define an interface for iOS navigator with standalone property
interface IosNavigator extends Navigator {
  standalone?: boolean;
}

// This component shows a prompt to install the PWA when available
const InstallPrompt: React.FC = () => {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const checkInstallationStatus = useCallback(async () => {
    // Only run this in the browser
    if (typeof window === "undefined") return;

    // Check if app is already installed (PWA or iOS)
    const isAppInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (window.navigator as IosNavigator).standalone === true;

    if (isAppInstalled) {
      setIsVisible(false); // Hide prompt if installed
      return;
    }

    // Check storage to see if the user dismissed the prompt recently
    try {
      const lastPromptTime = await getStorageItem("installPromptDismissed");
      if (
        lastPromptTime &&
        Date.now() - Number(lastPromptTime) < 24 * 60 * 60 * 1000
      ) {
        return; // Don't show prompt if dismissed in the last 24 hours
      }
    } catch (error) {
      // Silent fail - proceed to show prompt if storage check fails
      logger.debug('Failed to check install prompt dismissal status (non-critical)', { error });
    }

    // If not installed and not recently dismissed, check if we have a prompt event
    if (installPrompt) {
      setIsVisible(true);
    }
  }, [installPrompt]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      setInstallPrompt(promptEvent);
      setIsVisible(true); // Show immediately when event is caught
    };

    const handleFocus = () => {
      checkInstallationStatus().catch(() => {
        // Silent fail - focus check is not critical
      });
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("focus", handleFocus); // Re-check on focus

    // Initial check
    checkInstallationStatus().catch(() => {
      // Silent fail - initial check is not critical
    });

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("focus", handleFocus);
    };
  }, [installPrompt, checkInstallationStatus]); // Rerun effect if installPrompt changes

  const handleInstall = async () => {
    if (!installPrompt) return;

    try {
      await installPrompt.prompt();
      const choiceResult = await installPrompt.userChoice;

      if (choiceResult.outcome === "accepted") {
        logger.log("User accepted the install prompt");
      } else {
        logger.log("User dismissed the install prompt");
        // Store the time when dismissed to avoid showing it again too soon
        try {
          await setStorageItem("installPromptDismissed", Date.now().toString());
        } catch (error) {
          // Silent fail - dismissal tracking is not critical
          logger.debug('Failed to store install prompt dismissal (non-critical)', { error });
        }
      }
    } catch (error) {
      logger.error("Error showing install prompt:", error);
    }

    setInstallPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = async () => {
    try {
      await setStorageItem("installPromptDismissed", Date.now().toString());
    } catch (error) {
      // Silent fail - dismissal tracking is not critical
      logger.debug('Failed to store install prompt dismissal on dismiss (non-critical)', { error });
    }
    setIsVisible(false);
  };

  const { t } = useTranslation();

  if (!isVisible) return null;

  return (
    <div className={styles.installPrompt}>
      <p className={styles.installPromptText}>{t("installPrompt.message")}</p>
      <div className={styles.installPromptButtons}>
        <button className={styles.installButton} onClick={handleInstall}>
          {t("installPrompt.installButton")}
        </button>
        <button className={styles.dismissButton} onClick={handleDismiss}>
          {t("installPrompt.dismissButton")}
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
