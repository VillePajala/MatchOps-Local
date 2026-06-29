export interface MetricAverages {
  count: number;
  averages: { [metric: string]: number };
  overall: number;
  finalScore: number;
}

import type { SavedGamesCollection, PlayerAssessment } from '@/types';
import { ASSESSMENT_METRIC_IDS } from '@/config/assessmentMetrics';

// Active metric ids, sourced from the single config (see assessmentMetrics.ts).
const METRICS = ASSESSMENT_METRIC_IDS;

export interface MetricTrendPoint {
  date: string;
  value: number;
}

// A metric may be absent on an assessment (older rows, or a metric the coach
// did not observe), so every read is guarded - missing values are skipped, not
// counted as 0.
const sliderValue = (assessment: PlayerAssessment, metric: string): number | undefined => {
  const v = assessment.sliders[metric];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

export function calculateFinalScore(assessment: PlayerAssessment): number {
  let sum = 0;
  let n = 0;
  METRICS.forEach(m => {
    const v = sliderValue(assessment, m);
    if (v !== undefined) { sum += v; n++; }
  });
  return n > 0 ? sum / n : 0;
}

export function getPlayerAssessmentTrends(playerId: string, games: SavedGamesCollection): { [metric: string]: MetricTrendPoint[] } {
  const trends: { [metric: string]: MetricTrendPoint[] } = {};
  METRICS.forEach(m => { trends[m] = []; });
  for (const game of Object.values(games)) {
    if (game.isPlayed === false) continue;
    const a = game.assessments?.[playerId];
    if (!a) continue;
    METRICS.forEach(m => {
      const v = sliderValue(a, m);
      if (v !== undefined) trends[m].push({ date: game.gameDate, value: v });
    });
  }
  METRICS.forEach(m => trends[m].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
  return trends;
}

export function getPlayerAssessmentNotes(playerId: string, games: SavedGamesCollection): { date: string; notes: string }[] {
  const notes: { date: string; notes: string }[] = [];
  for (const game of Object.values(games)) {
    if (game.isPlayed === false) continue;
    const a = game.assessments?.[playerId];
    if (a && a.notes) notes.push({ date: game.gameDate, notes: a.notes });
  }
  notes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return notes;
}

export function calculatePlayerAssessmentAverages(
  playerId: string,
  games: SavedGamesCollection,
  useDemandCorrection = false
): MetricAverages | null {
  let count = 0;
  const totals: Record<string, number> = {};
  const metricDenoms: Record<string, number> = {};
  METRICS.forEach(m => { totals[m] = 0; metricDenoms[m] = 0; });
  let overallTotal = 0;
  let finalScoreTotal = 0;
  let denominator = 0;
  for (const game of Object.values(games)) {
    if (game.isPlayed === false) continue;
    const a = game.assessments?.[playerId];
    if (!a) continue;
    count++;
    const factor = useDemandCorrection ? game.demandFactor ?? 1 : 1;
    METRICS.forEach(m => {
      const v = sliderValue(a, m);
      if (v !== undefined) { totals[m] += v * factor; metricDenoms[m] += factor; }
    });
    overallTotal += a.overall * factor;
    finalScoreTotal += calculateFinalScore(a) * factor;
    denominator += factor;
  }
  if (count === 0) return null;
  const divisor = useDemandCorrection ? denominator : count;
  const averages: Record<string, number> = {};
  METRICS.forEach(m => {
    averages[m] = metricDenoms[m] > 0 ? totals[m] / metricDenoms[m] : 0;
  });
  return { count, averages, overall: overallTotal / divisor, finalScore: finalScoreTotal / divisor };
}

export function calculateTeamAssessmentAverages(
  games: SavedGamesCollection,
  useDemandCorrection = false
): MetricAverages | null {
  let count = 0;
  const totals: Record<string, number> = {};
  const metricDenoms: Record<string, number> = {};
  METRICS.forEach(m => { totals[m] = 0; metricDenoms[m] = 0; });
  let overallTotal = 0;
  let finalScoreTotal = 0;
  let denominator = 0;
  for (const game of Object.values(games)) {
    if (game.isPlayed === false) continue;
    if (!game.assessments) continue;
    const players = Object.values(game.assessments);
    if (players.length === 0) continue;
    count++;
    const factor = useDemandCorrection ? game.demandFactor ?? 1 : 1;
    const perMetricTotals: Record<string, number> = {};
    const perMetricPlayers: Record<string, number> = {};
    METRICS.forEach(m => { perMetricTotals[m] = 0; perMetricPlayers[m] = 0; });
    players.forEach(a => {
      METRICS.forEach(m => {
        const v = sliderValue(a, m);
        if (v !== undefined) { perMetricTotals[m] += v; perMetricPlayers[m] += 1; }
      });
    });
    overallTotal += (players.reduce((s, a) => s + a.overall, 0) / players.length) * factor;
    finalScoreTotal += (players.reduce((s, a) => s + calculateFinalScore(a), 0) / players.length) * factor;
    METRICS.forEach(m => {
      if (perMetricPlayers[m] > 0) {
        totals[m] += (perMetricTotals[m] / perMetricPlayers[m]) * factor;
        metricDenoms[m] += factor;
      }
    });
    denominator += factor;
  }
  if (count === 0) return null;
  const divisor = useDemandCorrection ? denominator : count;
  const averages: Record<string, number> = {};
  METRICS.forEach(m => {
    averages[m] = metricDenoms[m] > 0 ? totals[m] / metricDenoms[m] : 0;
  });
  return { count, averages, overall: overallTotal / divisor, finalScore: finalScoreTotal / divisor };
}
