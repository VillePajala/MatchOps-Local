import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { APP_SETTINGS_KEY } from '@/config/storageKeys';
import { getStorageJSON } from '@/utils/storage';
// Use the comprehensive translation files
// Load translations from the public folder so all keys are available
import fi from '../public/locales/fi/common.json';
import en from '../public/locales/en/common.json';

export const resources = {
  fi: { translation: fi },
  en: { translation: en },
} as const;

/**
 * Load language preference from IndexedDB storage
 * This runs asynchronously after initial setup
 */
const loadLanguagePreference = async (): Promise<void> => {
  try {
    // Use storage helper instead of direct localStorage access
    const settings = await getStorageJSON<{ language?: string }>(APP_SETTINGS_KEY, {
      throwOnError: false,
      defaultValue: { language: 'fi' }
    });

    const preferredLanguage = settings?.language || 'fi';
    if (preferredLanguage !== i18n.language) {
      await i18n.changeLanguage(preferredLanguage);
    }
  } catch {
    // Silently fail - keep default language
  }
};

// Initialize i18n with synchronous default, then update asynchronously
if (!i18n.isInitialized) {
  // Initialize with default language synchronously (no localStorage access)
  i18n.use(initReactI18next).init({
    lng: 'fi', // Always start with Finnish, then load preference async
    fallbackLng: 'fi',
    resources,
    interpolation: { escapeValue: false },
    debug: false,
    react: {
      useSuspense: false,
      bindI18n: 'languageChanged loaded',
      bindI18nStore: 'added removed',
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'p', 'span'],
    },
  }).then(() => {
    // After initialization, load the actual language preference asynchronously
    if (typeof window !== 'undefined') {
      loadLanguagePreference();
    }
  });
}

// Export the language preference loader for use in components
export { loadLanguagePreference };

export default i18n;