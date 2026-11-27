'use client';

/**
 * The day report ("Raportti · <plan>") opened from OUTSIDE the planner:
 * the finish screen of the day's last game and Home's "<plan> valmis · Tee
 * raportti" row. Loads the plan, its games and the roster itself, and saves the
 * text on the plan exactly as the planner does (`dayReport`, synced with it).
 *
 * `gameOverrides` lets the finish screen pass the game it is showing as it is
 * on screen - a goal or a report line from seconds ago may not be in storage
 * yet.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PlanDayReportModal from '@/components/PlanDayReportModal';
import { useToast } from '@/contexts/ToastProvider';
import { useDataStore } from '@/hooks/useDataStore';
import { getSavedGames } from '@/utils/savedGames';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { getPlan, savePlan } from '@/utils/playtimePlanner/storage';
import { getAllPlanLinks } from '@/utils/playtimePlanner/planLinks';
import { createdGameIdsForPlan } from '@/utils/playtimePlanner/createFromPlan';
import { orderDayGames, type DayReportGameInput } from '@/utils/playtimePlanner/dayReport';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import type { AppState } from '@/types/game';
import type { Player } from '@/types';
import logger from '@/utils/logger';

export interface PlanDayReportLauncherProps {
  planId: string;
  gameOverrides?: Record<string, AppState>;
  onClose: () => void;
  /** After the text was stored (Home drops its prompt). */
  onSaved?: () => void;
}

interface Loaded {
  plan: PlaytimePlan;
  inputs: DayReportGameInput[];
  roster: Player[];
}

const PlanDayReportLauncher: React.FC<PlanDayReportLauncherProps> = ({ planId, gameOverrides, onClose, onSaved }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { userId } = useDataStore();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // A snapshot of the screen at the tap, and the latest close/toast handlers:
  // read through refs so a parent re-render never re-runs the load (which
  // would reset the editor).
  const overridesRef = useRef(gameOverrides);
  const failRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    failRef.current = () => {
      showToast(t('planDayReport.loadError', 'Could not load the games. Try again.'), 'error');
      onClose();
    };
  }, [onClose, showToast, t]);

  // Read once per open: the games as they are now (the overrides on top).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [plan, games, links, roster] = await Promise.all([
          getPlan(planId),
          getSavedGames(userId),
          getAllPlanLinks(),
          getMasterRoster(userId),
        ]);
        if (cancelled) return;
        if (!plan) throw new Error('plan not found');
        const merged = { ...games, ...(overridesRef.current ?? {}) };
        setLoaded({ plan, inputs: orderDayGames(plan, createdGameIdsForPlan(merged, links, plan.id), merged), roster });
      } catch (error) {
        if (cancelled) return;
        logger.error('[PlanDayReportLauncher] Failed to load the day report', error);
        failRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, userId]);

  const handleSave = useCallback(
    (text: string) => {
      if (!loaded) return;
      const { dayReport: _previous, ...rest } = loaded.plan;
      const next: PlaytimePlan = text ? { ...rest, dayReport: text } : rest;
      // Shown at once; the store write follows (and is reported if it fails).
      setLoaded((current) => (current ? { ...current, plan: next } : current));
      void savePlan(next)
        .then((saved) => {
          if (!saved) throw new Error('savePlan returned null');
          onSaved?.();
        })
        .catch((error) => {
          logger.error('[PlanDayReportLauncher] Failed to save the day report', error);
          showToast(t('planDayReport.saveError', 'Could not save the report. Try again.'), 'error');
        });
    },
    [loaded, onSaved, showToast, t],
  );

  if (!loaded) return null;
  return (
    <PlanDayReportModal
      subject={loaded.plan}
      savedText={loaded.plan.dayReport}
      inputs={loaded.inputs}
      roster={loaded.roster}
      onSave={handleSave}
      onClose={onClose}
      ownHardwareBack
    />
  );
};

export default PlanDayReportLauncher;
