import React, { useState, useCallback, useMemo } from 'react';
import type { PlayerAssessment, IntervalLog } from '@/types';
import { getPlayerAssessments, savePlayerAssessment, deletePlayerAssessment } from '@/utils/playerAssessments';
import { ASSESSMENT_MIN, ASSESSMENT_MAX } from '@/config/assessmentMetrics';
import logger from '@/utils/logger';

export const validateAssessment = (a: Partial<PlayerAssessment>): boolean => {
  // Overall stays on the holistic 1-10 scale; per-metric sliders use the 1-5
  // developmental word scale (see assessmentMetrics.ts).
  if (typeof a.overall !== 'number' || a.overall < 1 || a.overall > 10) return false;
  if (!a.sliders) return false;
  const inRange = Object.values(a.sliders).every(v => v >= ASSESSMENT_MIN && v <= ASSESSMENT_MAX);
  if (!inRange) return false;
  if (a.notes && a.notes.length > 280) return false;
  return true;
};

const minutesFromIntervals = (intervals?: IntervalLog[]): number => {
  if (!intervals || intervals.length === 0) return 0;
  const seconds = intervals.reduce((s, i) => s + i.duration, 0);
  return Math.round(seconds / 60);
};

export function usePlayerAssessments(gameId: string, intervals?: IntervalLog[]) {
  const [assessments, setAssessments] = useState<{[id: string]: PlayerAssessment}>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The game whose stored assessments were actually loaded (review 3.23). Until it
  // matches gameId - still loading, or the load failed - `assessments` is not the
  // stored set, and autosave must not write it (it would wipe the stored ratings).
  const [loadedForGameId, setLoadedForGameId] = useState<string | null>(null);

  React.useLayoutEffect(() => {
    if (!gameId) return;
    let current = true;
    setLoading(true);
    setError(null);
    setLoadedForGameId(null);
    getPlayerAssessments(gameId)
      .then(data => {
        if (!current) return;
        setAssessments(data || {});
        setLoadedForGameId(gameId);
      })
      .catch(err => {
        logger.error('Failed to load assessments', err);
        if (current) setError('load');
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [gameId]);
  const loaded = loadedForGameId === gameId && gameId !== '';

  const saveAssessment = useCallback(async (playerId: string, data: PlayerAssessment) => {
    if (!validateAssessment(data)) throw new Error('invalid');
    const minutesPlayed = minutesFromIntervals(intervals);
    const full: PlayerAssessment = { ...data, minutesPlayed };
    const updated = await savePlayerAssessment(gameId, playerId, full);
    if (updated) {
      // The stored game's full set: from here on the hook holds the stored ratings.
      setAssessments(updated.assessments || {});
      setLoadedForGameId(gameId);
    }
    return updated;
  }, [gameId, intervals]);

  const deleteAssessment = useCallback(async (playerId: string) => {
    const updated = await deletePlayerAssessment(gameId, playerId);
    if (updated) {
      setAssessments(updated.assessments || {});
      setLoadedForGameId(gameId);
    }
    return updated;
  }, [gameId]);

  return useMemo(() => ({
    assessments, loading, error, loaded, saveAssessment, deleteAssessment,
  }), [assessments, loading, error, loaded, saveAssessment, deleteAssessment]);
}

export default usePlayerAssessments;
