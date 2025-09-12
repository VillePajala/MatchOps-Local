import logger from '@/utils/logger';

export const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (error) {
    logger.error('[localStorage] Access error', error as Error, { component: 'localStorage', section: 'getStorage' });
    return null;
  }
};

export const getLocalStorageItem = (key: string): string | null => {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (error) {
    logger.error(`[getLocalStorageItem] Error getting item for key "${key}"`, error as Error, { component: 'localStorage', section: 'getLocalStorageItem' });
    throw error;
  }
};

export const setLocalStorageItem = (key: string, value: string): void => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch (error) {
    logger.error(`[setLocalStorageItem] Error setting item for key "${key}"`, error as Error, { component: 'localStorage', section: 'setLocalStorageItem' });
    throw error;
  }
};

export const removeLocalStorageItem = (key: string): void => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch (error) {
    logger.error(`[removeLocalStorageItem] Error removing item for key "${key}"`, error as Error, { component: 'localStorage', section: 'removeLocalStorageItem' });
    throw error;
  }
};

export const clearLocalStorage = (): void => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.clear();
  } catch (error) {
    logger.error('[clearLocalStorage] Error clearing localStorage', error as Error, { component: 'localStorage', section: 'clearLocalStorage' });
    throw error;
  }
};
