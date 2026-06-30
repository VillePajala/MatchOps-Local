export interface MetricAverages {
  count: number;
  averages: { [metric: string]: number };
  overall: number;
  finalScore: number;
}

import type { SavedGamesCollection, PlayerAssessment } from '@/types';
import { ASSESSMENT_METRIC_IDS, ratingBandLevel } from '@/config/assessmentMetrics';

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

// ===========================================================================
// Development view: current level + trend direction (the "where is the player
// now / what to work on next" question, as opposed to the lifetime average).
// ===========================================================================

export type TrendDirection = 'rising' | 'steady' | 'slipping' | 'insufficient';

export interface MetricDevelopment {
  /** Current level on the canonical 1-10 scale. */
  level: number;
  /** "Season start" level: mean of the earliest assessments (the radar baseline). */
  baseline: number;
  direction: TrendDirection;
}

// Earliest N assessments that define the "season start" baseline.
const BASELINE_POINTS = 3;

export interface PlayerDevelopment {
  count: number;
  metrics: { [metric: string]: MetricDevelopment };
  overall: MetricDevelopment;
  finalScore: number;
  /** Metric ids to work on next (low and not rising, or slipping). */
  focusAreas: string[];
  /** Metric ids to lean on (high and not slipping, or rising). */
  strengths: string[];
}

// At least this many assessments before a trend is meaningful.
const TREND_MIN_POINTS = 4;
// Change (canonical points) between the older and recent halves to call a trend.
const TREND_THRESHOLD = 1.0;
// Per-game-back decay for recency weighting (~half weight every ~4-5 games).
const RECENCY_DECAY = 0.85;

const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/** Weighted current level; recent games weigh more when recencyWeighted. */
function weightedLevel(values: number[], demands: number[], recencyWeighted: boolean): number {
  let wsum = 0;
  let vsum = 0;
  const n = values.length;
  for (let i = 0; i < n; i++) {
    const recency = recencyWeighted ? Math.pow(RECENCY_DECAY, n - 1 - i) : 1;
    const w = recency * (demands[i] ?? 1);
    vsum += values[i] * w;
    wsum += w;
  }
  return wsum > 0 ? vsum / wsum : 0;
}

/** Direction of travel from the chronological series (recent half vs older half). */
function classifyTrend(values: number[]): TrendDirection {
  const n = values.length;
  if (n < TREND_MIN_POINTS) return 'insufficient';
  const half = Math.floor(n / 2);
  const delta = mean(values.slice(n - half)) - mean(values.slice(0, half));
  if (delta >= TREND_THRESHOLD) return 'rising';
  if (delta <= -TREND_THRESHOLD) return 'slipping';
  return 'steady';
}

/**
 * Current developmental picture for a player: per-metric current level + trend
 * direction, plus derived focus areas / strengths. Levels are recency-weighted
 * by default ("current form"); pass recencyWeighted:false for a plain lifetime
 * average ("overall"). Composes with demand correction.
 */
export function calculatePlayerDevelopment(
  playerId: string,
  games: SavedGamesCollection,
  options: { recencyWeighted?: boolean; useDemandCorrection?: boolean } = {},
): PlayerDevelopment | null {
  const { recencyWeighted = true, useDemandCorrection = false } = options;

  const entries = Object.values(games)
    .filter(g => g.isPlayed !== false && g.assessments?.[playerId])
    .map(g => ({
      a: g.assessments![playerId],
      demand: useDemandCorrection ? (g.demandFactor ?? 1) : 1,
      date: g.gameDate,
    }))
    .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());

  if (entries.length === 0) return null;

  const metrics: { [metric: string]: MetricDevelopment } = {};
  const withData: string[] = [];
  METRICS.forEach(m => {
    const series = entries.filter(e => {
      const v = e.a.sliders[m];
      return typeof v === 'number' && Number.isFinite(v);
    });
    if (series.length === 0) {
      metrics[m] = { level: 0, baseline: 0, direction: 'insufficient' };
      return;
    }
    withData.push(m);
    const values = series.map(e => e.a.sliders[m]);
    const demands = series.map(e => e.demand);
    metrics[m] = {
      level: weightedLevel(values, demands, recencyWeighted),
      baseline: mean(values.slice(0, Math.min(BASELINE_POINTS, values.length))),
      direction: classifyTrend(values),
    };
  });

  const overallValues = entries.map(e => e.a.overall);
  const allDemands = entries.map(e => e.demand);
  const overall: MetricDevelopment = {
    level: weightedLevel(overallValues, allDemands, recencyWeighted),
    baseline: mean(overallValues.slice(0, Math.min(BASELINE_POINTS, overallValues.length))),
    direction: classifyTrend(overallValues),
  };
  const finalScore = weightedLevel(entries.map(e => calculateFinalScore(e.a)), allDemands, recencyWeighted);

  // Low-and-not-rising (or slipping) => work on next. A low metric that is
  // rising is encouraging, not a worry, so it is excluded from focus.
  const focusAreas = withData
    .filter(m => (ratingBandLevel(metrics[m].level) <= 2 && metrics[m].direction !== 'rising') || metrics[m].direction === 'slipping')
    .sort((a, b) => metrics[a].level - metrics[b].level)
    .slice(0, 3);
  const strengths = withData
    .filter(m => (ratingBandLevel(metrics[m].level) >= 4 && metrics[m].direction !== 'slipping') || metrics[m].direction === 'rising')
    .filter(m => !focusAreas.includes(m))
    .sort((a, b) => metrics[b].level - metrics[a].level)
    .slice(0, 3);

  return { count: entries.length, metrics, overall, finalScore, focusAreas, strengths };
}
