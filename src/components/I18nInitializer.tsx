'use client';

import React, { useState, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n, { applyStoredLanguage } from '../i18n'; // Import the initialized i18n instance

// This component ensures i18n initialization happens on the client
const I18nInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isI18nInitialized, setIsI18nInitialized] = useState(i18n.isInitialized);

  // After hydration (effects never run before it): keep <html lang> on the app
  // language - screen readers, hyphenation and spellcheck read it (review 8.6; the
  // server always renders "fi") - and then apply the stored language (review 8.5).
  useEffect(() => {
    const syncLang = (lng: string) => {
      document.documentElement.lang = lng.startsWith('en') ? 'en' : 'fi';
    };
    syncLang(i18n.language ?? 'fi');
    i18n.on('languageChanged', syncLang);
    applyStoredLanguage();
    return () => {
      i18n.off('languageChanged', syncLang);
    };
  }, []);

  useEffect(() => {
    // Check if i18n is already initialized, if not wait for it
    if (!i18n.isInitialized) {
      const handleInitialized = () => {
        setIsI18nInitialized(true);
      };
      
      i18n.on('initialized', handleInitialized);
      return () => {
        i18n.off('initialized', handleInitialized);
      };
    }
  }, []);

  if (!isI18nInitialized) {
    // Show a minimal loading state
    // Use navigator.language to show localized loading text before i18n initializes
    const isFinnish = typeof navigator !== 'undefined' && navigator.language?.startsWith('fi');
    const loadingText = isFinnish ? 'Ladataan...' : 'Loading...';
    return <div className="flex items-center justify-center min-h-screen min-h-[100dvh] bg-slate-900 text-white">{loadingText}</div>;
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
};

export default I18nInitializer; 