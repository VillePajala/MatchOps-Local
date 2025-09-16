"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import styles from "./InstallPrompt.module.css";
import logger from "@/utils/logger";
import { getLocalStorageItem, setLocalStorageItem } from "@/utils/localStorage";

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

  const checkInstallationStatus = useCallback(() => {
    // Only run this in the browser
    if (typeof window === "undefined") return;

    console.log('[InstallPrompt] Checking installation status...');

    // Check if app is already installed (PWA or iOS)
    const isAppInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (window.navigator as IosNavigator).standalone === true;

    console.log('[InstallPrompt] App installed:', isAppInstalled);

    if (isAppInstalled) {
      setIsVisible(false); // Hide prompt if installed
      return;
    }

    // Check localStorage to see if the user dismissed the prompt recently
    const lastPromptTime = getLocalStorageItem("installPromptDismissed");
    const timeSinceLastDismiss = lastPromptTime ? Date.now() - Number(lastPromptTime) : null;
    console.log('[InstallPrompt] Last prompt dismissed:', lastPromptTime, 'Time since:', timeSinceLastDismiss);
    
    if (
      lastPromptTime &&
      Date.now() - Number(lastPromptTime) < 24 * 60 * 60 * 1000
    ) {
      console.log('[InstallPrompt] Prompt dismissed recently, not showing');
      return; // Don't show prompt if dismissed in the last 24 hours
    }

    // If not installed and not recently dismissed, check if we have a prompt event
    console.log('[InstallPrompt] Install prompt event:', !!installPrompt);
    if (installPrompt) {
      console.log('[InstallPrompt] Setting visible to true');
      setIsVisible(true);
    } else {
      console.log('[InstallPrompt] No install prompt event available');
    }
  }, [installPrompt]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      console.log('[InstallPrompt] beforeinstallprompt event received!');
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      setInstallPrompt(promptEvent);
      setIsVisible(true); // Show immediately when event is caught
    };

    console.log('[InstallPrompt] Setting up event listeners');
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("focus", checkInstallationStatus); // Re-check on focus

    // Clear dismissed status in development for testing
    if (process.env.NODE_ENV === 'development') {
      const dismissedTime = getLocalStorageItem("installPromptDismissed");
      if (dismissedTime) {
        console.log('[InstallPrompt] [DEV] Clearing dismissed prompt for testing');
        // Remove localStorage entry in dev for testing
        localStorage.removeItem("installPromptDismissed");
      }
    }

    // Initial check
    checkInstallationStatus();

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("focus", checkInstallationStatus);
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
        setLocalStorageItem("installPromptDismissed", Date.now().toString());
      }
    } catch (error) {
      logger.error('Error showing install prompt', error as Error, {
        component: 'InstallPrompt',
        section: 'prompt-display',
      });
    }

    setInstallPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    setLocalStorageItem("installPromptDismissed", Date.now().toString());
    setIsVisible(false);
  };

  const { t } = useTranslation();

  // Debug version - always show in development
  const isDev = process.env.NODE_ENV === 'development';
  const shouldShow = isVisible || (isDev && typeof window !== 'undefined');

  if (!shouldShow) return null;

  return (
    <div className={styles.installPrompt}>
      <p className={styles.installPromptText}>
        {isDev && !isVisible ? 
          '🔧 [DEV] PWA Install (testing)' : 
          t("installPrompt.message", "Install this app for the best experience")}
      </p>
      <div className={styles.installPromptButtons}>
        <button 
          className={styles.installButton} 
          onClick={handleInstall}
          disabled={!installPrompt}
        >
          {t("installPrompt.installButton", "Install")}
          {isDev && !installPrompt && " (no event)"}
        </button>
        <button className={styles.dismissButton} onClick={handleDismiss}>
          {t("installPrompt.dismissButton", "Maybe later")}
        </button>
      </div>
      {isDev && (
        <div style={{fontSize: '12px', marginTop: '8px', opacity: 0.7}}>
          Event available: {installPrompt ? 'Yes' : 'No'} | 
          Visible: {isVisible ? 'Yes' : 'No'} | 
          localStorage: {getLocalStorageItem("installPromptDismissed") || 'none'}
        </div>
      )}
    </div>
  );
};

export default InstallPrompt;
