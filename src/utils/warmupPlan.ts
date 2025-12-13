import { WARMUP_PLAN_KEY } from '@/config/storageKeys';
import type { WarmupPlan, WarmupPlanSection } from '@/types/warmupPlan';
import { WARMUP_PLAN_SCHEMA_VERSION } from '@/types/warmupPlan';
import logger from '@/utils/logger';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { withKeyLock } from './storageKeyLock';
import type { TFunction } from 'i18next';

/**
 * Generates a unique ID for warmup plan sections
 */
const generateId = (): string =>
  `wp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

/**
 * Retrieves the user's warm-up plan from storage.
 * @returns The WarmupPlan if it exists, null otherwise.
 */
export const getWarmupPlan = async (): Promise<WarmupPlan | null> => {
  try {
    const planJson = await getStorageItem(WARMUP_PLAN_KEY);
    if (!planJson) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(planJson);
    } catch (parseError) {
      logger.error('[getWarmupPlan] JSON parse failed - data may be corrupted.', { error: parseError });
      return null;
    }

    // Basic validation
    if (!parsed || typeof parsed !== 'object' || !('sections' in parsed)) {
      logger.error('[getWarmupPlan] Invalid warmup plan structure');
      return null;
    }

    return parsed as WarmupPlan;
  } catch (error) {
    logger.error('[getWarmupPlan] Error reading warmup plan from storage:', error);
    return null;
  }
};

/**
 * Saves a warm-up plan to storage.
 * @param plan - The WarmupPlan to save.
 * @returns true if successful, false otherwise.
 */
export const saveWarmupPlan = async (plan: WarmupPlan): Promise<boolean> => {
  return withKeyLock(WARMUP_PLAN_KEY, async () => {
    try {
      const planToSave: WarmupPlan = {
        ...plan,
        lastModified: new Date().toISOString(),
        isDefault: false, // Once saved, it's no longer the default
      };
      await setStorageItem(WARMUP_PLAN_KEY, JSON.stringify(planToSave));
      return true;
    } catch (error) {
      logger.error('[saveWarmupPlan] Error saving warmup plan to storage:', error);
      return false;
    }
  });
};

/**
 * Deletes the user's custom warm-up plan, resetting to default.
 * @returns true if successful, false otherwise.
 */
export const deleteWarmupPlan = async (): Promise<boolean> => {
  return withKeyLock(WARMUP_PLAN_KEY, async () => {
    try {
      await setStorageItem(WARMUP_PLAN_KEY, '');
      return true;
    } catch (error) {
      logger.error('[deleteWarmupPlan] Error deleting warmup plan:', error);
      return false;
    }
  });
};

/**
 * Creates the default warm-up plan from i18n translations.
 * This is used when no custom plan exists.
 * @param t - The i18next translation function
 * @returns A WarmupPlan populated with default content
 */
export const createDefaultWarmupPlan = (t: TFunction): WarmupPlan => {
  // Helper to convert array of strings to bullet point text
  const arrayToText = (key: string): string => {
    const result = t(key, { returnObjects: true, defaultValue: [] });
    if (Array.isArray(result)) {
      return result.map(item => `• ${item}`).join('\n');
    }
    return '';
  };

  const sections: WarmupPlanSection[] = [
    {
      id: generateId(),
      title: t('warmup.section1Title', '1. 30 min / Gathering'),
      content: [
        t('warmup.section1Goal', ''),
        '',
        arrayToText('warmup.section1Points'),
      ].filter(Boolean).join('\n'),
    },
    {
      id: generateId(),
      title: t('warmup.section2Title', '2. 20 min / Warm-up'),
      content: [
        t('warmup.section2Goal', ''),
        '',
        arrayToText('warmup.section2Activities'),
      ].filter(Boolean).join('\n'),
    },
    {
      id: generateId(),
      title: t('warmup.section3Title', '3. 10 min / Ball Work'),
      content: [
        t('warmup.section3Goal', ''),
        '',
        t('warmup.section3PairWork', 'Partner + Ball:'),
        arrayToText('warmup.section3PairWorkPoints'),
      ].filter(Boolean).join('\n'),
    },
    {
      id: generateId(),
      title: t('warmup.section3GoalieWarmup', 'Goalkeeper Warm-up'),
      content: arrayToText('warmup.section3GoalieWarmupPoints'),
    },
    {
      id: generateId(),
      title: t('warmup.section3CombinedGoalieWarmup', 'Combined GK warm-up'),
      content: arrayToText('warmup.section3CombinedGoalieWarmupPoints'),
    },
    {
      id: generateId(),
      title: t('warmup.section4Title', '4. 2 min / Bench Area'),
      content: [
        t('warmup.section4Goal', ''),
        '',
        arrayToText('warmup.section4Points'),
      ].filter(Boolean).join('\n'),
    },
    {
      id: generateId(),
      title: t('warmup.duringGameTitle', 'During the Game'),
      content: arrayToText('warmup.duringGamePoints'),
    },
  ];

  return {
    id: 'user_warmup_plan',
    version: WARMUP_PLAN_SCHEMA_VERSION,
    lastModified: new Date().toISOString(),
    isDefault: true,
    sections,
  };
};
