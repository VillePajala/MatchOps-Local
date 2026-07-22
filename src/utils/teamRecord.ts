/**
 * Team record aggregation - the single W/D/L + goals tally shared by the stats
 * modal's Overall card and the Home dashboard's Vuosi bar, so the two can never
 * drift. Pure: takes already-filtered game objects, returns the totals.
 */
import type { AppState } from '@/types';
import { resolveGameResult } from './gameResult';

export interface TeamRecord {
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

/**
 * Tally W/D/L and goals from the coach's perspective (honours `homeOrAway`).
 * Result is via the shared, shootout-aware `resolveGameResult`; goals stay raw.
 * Callers are responsible for filtering (played-only, club season, friendlies).
 */
export function computeTeamRecord(games: AppState[]): TeamRecord {
  let gamesPlayed = 0, wins = 0, losses = 0, ties = 0, goalsFor = 0, goalsAgainst = 0;

  for (const game of games) {
    gamesPlayed++;
    const ourScore = game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
    const theirScore = game.homeOrAway === 'home' ? game.awayScore : game.homeScore;
    goalsFor += ourScore;
    goalsAgainst += theirScore;

    const result = resolveGameResult(game);
    if (result === 'W') wins++;
    else if (result === 'L') losses++;
    else ties++;
  }

  return {
    gamesPlayed,
    wins,
    losses,
    ties,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
  };
}
