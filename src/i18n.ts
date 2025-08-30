import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// Use the comprehensive translation files
// Load translations from the public folder so all keys are available
import fi from '../public/locales/fi/common.json';
import en from '../public/locales/en/common.json';

export const resources = {
  fi: { translation: fi },
  en: { translation: en },
} as const;

// Get initial language from localStorage or default to 'fi'
const getInitialLanguage = (): string => {
  if (typeof window !== 'undefined') {
    try {
      const settingsJson = window.localStorage.getItem('appSettings');
      if (settingsJson) {
        const settings = JSON.parse(settingsJson);
        return settings.language || 'fi';
      }
    } catch {
      // Ignore errors and fall back to default
    }
  }
  return 'fi';
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: getInitialLanguage(),
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
  });
}

export default i18n;
