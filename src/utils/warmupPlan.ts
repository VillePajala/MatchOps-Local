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
 * Type guard to check if a value is an array of strings
 */
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item): item is string => typeof item === 'string');

/**
 * Creates the default warm-up plan from i18n translations.
 * This is used when no custom plan exists.
 * @param t - The i18next translation function
 * @returns A WarmupPlan populated with default content
 */
export const createDefaultWarmupPlan = (t: TFunction): WarmupPlan => {
  // Helper to convert array of strings to bullet point text
  const arrayToText = (key: string): string => {
    const result: unknown = t(key, { returnObjects: true, defaultValue: [] });
    if (isStringArray(result)) {
      return result.map((item: string) => `• ${item}`).join('\n');
    }
    return '';
  };

  // Helper to create a section with type safety
  const createSection = (title: string, content: string): WarmupPlanSection => ({
    id: generateId(),
    title,
    content,
  });

  const sections: WarmupPlanSection[] = [
    createSection(
      t('warmup.section1Title', '1. 30 min / Gathering'),
      [
        t('warmup.section1Goal', ''),
        '',
        arrayToText('warmup.section1Points'),
      ].filter(Boolean).join('\n')
    ),
    createSection(
      t('warmup.section2Title', '2. 20 min / Warm-up'),
      [
        t('warmup.section2Goal', ''),
        '',
        arrayToText('warmup.section2Activities'),
      ].filter(Boolean).join('\n')
    ),
    createSection(
      t('warmup.section3Title', '3. 10 min / Ball Work'),
      [
        t('warmup.section3Goal', ''),
        '',
        t('warmup.section3PairWork', 'Partner + Ball:'),
        arrayToText('warmup.section3PairWorkPoints'),
      ].filter(Boolean).join('\n')
    ),
    createSection(
      t('warmup.section3GoalieWarmup', 'Goalkeeper Warm-up'),
      arrayToText('warmup.section3GoalieWarmupPoints')
    ),
    createSection(
      t('warmup.section3CombinedGoalieWarmup', 'Combined GK warm-up'),
      arrayToText('warmup.section3CombinedGoalieWarmupPoints')
    ),
    createSection(
      t('warmup.section4Title', '4. 2 min / Bench Area'),
      [
        t('warmup.section4Goal', ''),
        '',
        arrayToText('warmup.section4Points'),
      ].filter(Boolean).join('\n')
    ),
    createSection(
      t('warmup.duringGameTitle', 'During the Game'),
      arrayToText('warmup.duringGamePoints')
    ),
  ];

  return {
    id: 'user_warmup_plan',
    version: WARMUP_PLAN_SCHEMA_VERSION,
    lastModified: new Date().toISOString(),
    isDefault: true,
    sections,
  } satisfies WarmupPlan;
};
