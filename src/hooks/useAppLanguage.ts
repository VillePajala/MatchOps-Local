import { useCallback, useSyncExternalStore } from 'react';
import i18n, { saveLanguagePreference } from '@/i18n';

/** The default i18n.ts initialises with outside tests - what the server renders. */
const SERVER_LANGUAGE = 'fi';

const subscribe = (onChange: () => void) => {
  i18n.on('languageChanged', onChange);
  return () => i18n.off('languageChanged', onChange);
};
const getLanguage = () => i18n.language;
const getServerLanguage = () => SERVER_LANGUAGE;

/**
 * Switch the app language and remember it on this device - the one way to change
 * it (review 8.1). Settings used to switch without saving, so the next launch or
 * reload was back in Finnish, while the Home/login toggles did save.
 */
export function changeAppLanguage(next: string): void {
  if (next === i18n.language) return;
  void i18n.changeLanguage(next);
  // localStorage: i18n reads the preference from here on start.
  saveLanguagePreference(next);
}

/**
 * The current app language and a setter, for the language controls.
 *
 * - Every control follows a change made by any other one (review 8.1: the Home
 *   toggle kept showing the old language after a change in Settings).
 * - Hydration-safe: during hydration it reports the server's 'fi', then the real
 *   language (MATCHOPS-LOCAL-8K: reading i18n.language for the first render
 *   diverged the toggles' markup).
 * - Changing is an action, never an effect keyed on the value - that shape re-fired
 *   on every mount with a stale value and fed the Home render loop.
 */
export function useAppLanguage(): [string, (next: string) => void] {
  const language = useSyncExternalStore(subscribe, getLanguage, getServerLanguage);
  const change = useCallback((next: string) => changeAppLanguage(next), []);
  return [language, change];
}
