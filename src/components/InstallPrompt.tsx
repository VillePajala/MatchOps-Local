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

type InstallPromptListener = (event: BeforeInstallPromptEvent) => void;

interface MatchOpsWindow extends Window {
  __matchopsInstallPromptListeners?: Set<InstallPromptListener>;
  __matchopsDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
  __matchopsInstallPromptListenerRegistered?: boolean;
}

let serverInstallPromptListeners: Set<InstallPromptListener> | null = null;
let serverDeferredInstallPrompt: BeforeInstallPromptEvent | null = null;

const getMatchOpsWindow = (): MatchOpsWindow | undefined =>
  typeof window === "undefined" ? undefined : (window as MatchOpsWindow);

const getInstallPromptListeners = (): Set<InstallPromptListener> => {
  const matchOpsWindow = getMatchOpsWindow();
  if (matchOpsWindow) {
    if (!matchOpsWindow.__matchopsInstallPromptListeners) {
      matchOpsWindow.__matchopsInstallPromptListeners = new Set();
    }
    return matchOpsWindow.__matchopsInstallPromptListeners;
  }

  if (!serverInstallPromptListeners) {
    serverInstallPromptListeners = new Set();
  }

  return serverInstallPromptListeners;
};

const getDeferredInstallPrompt = (): BeforeInstallPromptEvent | null => {
  const matchOpsWindow = getMatchOpsWindow();
  if (matchOpsWindow) {
    return matchOpsWindow.__matchopsDeferredInstallPrompt ?? null;
  }

  return serverDeferredInstallPrompt;
};

const setDeferredInstallPrompt = (prompt: BeforeInstallPromptEvent | null): void => {
  const matchOpsWindow = getMatchOpsWindow();
  if (matchOpsWindow) {
    matchOpsWindow.__matchopsDeferredInstallPrompt = prompt;
  } else {
    serverDeferredInstallPrompt = prompt;
  }
};

const clearDeferredInstallPrompt = (): void => {
  setDeferredInstallPrompt(null);
};

const notifyInstallPromptListeners = (promptEvent: BeforeInstallPromptEvent): void => {
  for (const listener of getInstallPromptListeners()) {
    try {
      listener(promptEvent);
    } catch (error) {
      logger.error("[InstallPrompt] Listener execution failed", error as Error, {
        component: "InstallPrompt",
        section: "listener-notify",
      });
    }
  }
};

const handleGlobalBeforeInstallPrompt = (event: Event): void => {
  const promptEvent = event as BeforeInstallPromptEvent;
  promptEvent.preventDefault();
  setDeferredInstallPrompt(promptEvent);
  notifyInstallPromptListeners(promptEvent);
};

const handleAppInstalled = (): void => {
  clearDeferredInstallPrompt();
};

const registerGlobalInstallPromptListener = (): void => {
  const matchOpsWindow = getMatchOpsWindow();
  if (!matchOpsWindow || matchOpsWindow.__matchopsInstallPromptListenerRegistered) {
    return;
  }

  window.addEventListener("beforeinstallprompt", handleGlobalBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
  matchOpsWindow.__matchopsInstallPromptListenerRegistered = true;
};

const subscribeToInstallPrompt = (listener: InstallPromptListener): (() => void) => {
  registerGlobalInstallPromptListener();

  const listeners = getInstallPromptListeners();
  listeners.add(listener);

  const storedPrompt = getDeferredInstallPrompt();
  if (storedPrompt) {
    listener(storedPrompt);
  }

  return () => {
    listeners.delete(listener);
  };
};

if (typeof window !== "undefined") {
  registerGlobalInstallPromptListener();
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
    const promptEvent = installPrompt ?? getDeferredInstallPrompt();
    if (promptEvent && installPrompt !== promptEvent) {
      setInstallPrompt(promptEvent);
    }

    console.log('[InstallPrompt] Install prompt event:', !!promptEvent);
    if (promptEvent) {
      console.log('[InstallPrompt] Setting visible to true');
      setIsVisible(true);
    } else {
      console.log('[InstallPrompt] No install prompt event available');
    }
  }, [installPrompt]);

  useEffect(() => {
    console.log('[InstallPrompt] Setting up event listeners');
    console.log('[InstallPrompt] Service Worker support:', 'serviceWorker' in navigator);
    console.log('[InstallPrompt] Current URL protocol:', window.location.protocol);
    console.log('[InstallPrompt] User agent:', navigator.userAgent);

    // Check if PWA is already installed
    if (window.matchMedia) {
      const standaloneQuery = window.matchMedia('(display-mode: standalone)');
      console.log('[InstallPrompt] Standalone mode:', standaloneQuery.matches);
    }

    // Check manifest
    const manifestLinks = document.querySelectorAll('link[rel="manifest"]');
    console.log('[InstallPrompt] Manifest links found:', manifestLinks.length);
    manifestLinks.forEach((link, index) => {
      console.log(`[InstallPrompt] Manifest ${index + 1}:`, (link as HTMLLinkElement).href);
    });

    // Check service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        console.log('[InstallPrompt] Service Worker registrations:', registrations.length);
        registrations.forEach((reg, index) => {
          console.log(`[InstallPrompt] SW ${index + 1} scope:`, reg.scope);
          console.log(`[InstallPrompt] SW ${index + 1} active:`, !!reg.active);
        });
      });
    }

    const unsubscribeInstallPrompt = subscribeToInstallPrompt(promptEvent => {
      console.log('[InstallPrompt] beforeinstallprompt event received!');
      setInstallPrompt(promptEvent);
      setIsVisible(true);
    });
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
      unsubscribeInstallPrompt();
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

    clearDeferredInstallPrompt();
    setInstallPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    setLocalStorageItem("installPromptDismissed", Date.now().toString());
    clearDeferredInstallPrompt();
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
