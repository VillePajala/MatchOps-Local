/**
 * Whether a match should default to "already played", from its date alone.
 *
 * ONLY THE PAST COUNTS AS PLAYED. A match dated today has almost certainly not
 * been played yet at the moment it is created - a coach sets Saturday's fixture
 * up on Saturday morning, or at the pitch before kick-off - and the lifecycle
 * that follows is play it, then finish it, which is what marks it played.
 *
 * WHY THIS IS NOT A COSMETIC DEFAULT. A match marked played carries a 0-0
 * scoreline until someone enters one, and `resolveGameResult` reads 0-0 as a
 * DRAW. Getting this wrong does not just mislabel a row, it silently inflates
 * the season record with matches that never happened - a record reading
 * "14 peliä · 4-10-0" that was mostly fixtures booked in advance.
 *
 * TODAY USED TO COUNT AS PLAYED, and that reintroduced the same corruption for
 * the one day it mattered most. It also made today's match impossible to show
 * on the front page: `buildHomeSummary` requires `isPlayed === false` for the
 * next-match card while deliberately including today, on the grounds that a
 * match this afternoon is the most upcoming thing there is. The two rules
 * disagreed, and a match created for today fell down the gap - neither
 * upcoming, nor honestly recorded.
 *
 * The wrong answer in this direction is cheap and visible: a match that really
 * was played shows a toggle the coach flips. The wrong answer in the other
 * direction is silent and corrupts a season.
 *
 * @module matchPlayedDefault
 */
export function defaultIsPlayed(gameDate: string, today: string): boolean {
  return gameDate < today;
}

export default defaultIsPlayed;
