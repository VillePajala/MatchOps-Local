import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { PlayerAssessment } from '@/types';
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

/**
 * The match time played when the assessment is saved (review 4.34): the match clock.
 * It used to sum the sub-interval log, which only grows when a substitution is
 * confirmed - the stretch after the last sub was never counted, and a game with no
 * confirmed subs recorded 0 minutes.
 */
export function usePlayerAssessments(gameId: string, playedSeconds?: number) {
  // Read through a ref: the clock changes every second, and the save callback must
  // not be recreated on each tick.
  const playedSecondsRef = useRef(playedSeconds ?? 0);
  useEffect(() => { playedSecondsRef.current = playedSeconds ?? 0; }, [playedSeconds]);
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
    const minutesPlayed = Math.round(Math.max(0, playedSecondsRef.current) / 60);
    const full: PlayerAssessment = { ...data, minutesPlayed };
    const updated = await savePlayerAssessment(gameId, playerId, full);
    if (updated) {
      // The stored game's full set: from here on the hook holds the stored ratings.
      setAssessments(updated.assessments || {});
      setLoadedForGameId(gameId);
    }
    return updated;
  }, [gameId]);

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
