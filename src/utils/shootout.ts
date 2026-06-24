import type { ShootoutKick } from '@/types/game';

/**
 * Penalty-shootout derivation. The result is *constructed* from the logged
 * kicks (no fixed format enforced), exactly like the match score is built from
 * goal events. Pure functions — safe to call during render.
 */

export interface ShootoutTally {
  home: number;
  away: number;
}

/** Counts scored kicks per side. */
export const getShootoutTally = (kicks?: ShootoutKick[]): ShootoutTally => {
  const tally: ShootoutTally = { home: 0, away: 0 };
  if (!kicks) return tally;
  for (const kick of kicks) {
    if (kick.scored) tally[kick.team] += 1;
  }
  return tally;
};

/**
 * The winning side of the shootout, or null if there are no kicks or the tally
 * is level (an incomplete/undecided shootout — the result stays a draw until
 * more kicks are logged).
 */
export const getShootoutWinner = (kicks?: ShootoutKick[]): 'home' | 'away' | null => {
  if (!kicks || kicks.length === 0) return null;
  const { home, away } = getShootoutTally(kicks);
  if (home > away) return 'home';
  if (away > home) return 'away';
  return null;
};

/** Whether a (decided) shootout exists for this game. */
export const hasDecidedShootout = (kicks?: ShootoutKick[]): boolean =>
  getShootoutWinner(kicks) !== null;
