/**
 * What sport and age group the Rules screen should open on.
 *
 * The principle, after the owner pointed out that the futsal formats table sat
 * on screen for everyone regardless of what they play: a default should come
 * from the coach's OWN data first, the population second, and never from
 * whatever happened to be convenient to build.
 *
 * The futsal table was the clearest violation of that - it is on screen because
 * futsal is the only sport whose formats Palloliitto publishes as extractable
 * data, which is a fact about the source material and not about the coach.
 *
 * Region is the same trap in another form: a default of "Itäinen alue" is
 * wrong for everyone outside it and invisible to whoever set it. The app
 * already gets this right by defaulting area filters to "all" - when you cannot
 * know, show everything and let them narrow it, rather than guess.
 *
 * @module rulesContext
 * @category Utils
 */

import type { AppState } from '@/types';
import type { RulesSport } from '@/config/rulesIndex';

export interface RulesContext {
  sport: RulesSport;
  /** The coach's most common age group, e.g. "U10"; undefined when unknown. */
  ageGroup?: string;
}

/**
 * Derive the opening sport and age group from the games the coach has actually
 * recorded.
 *
 * Football is the fallback, not a guess: it is the app's main use (prod at the
 * time of writing: 191 football games from 19 coaches against 16 futsal games
 * from 3), so a coach with no games yet is far likelier to want it.
 */
export function preferredRulesContext(
  savedGames: Record<string, Partial<AppState>> | undefined,
): RulesContext {
  const games = Object.values(savedGames ?? {});

  let football = 0;
  let futsal = 0;
  const ages = new Map<string, number>();

  for (const g of games) {
    // Unplayed games still say what the coach is set up for, so they count.
    if (g?.gameType === 'futsal') futsal += 1;
    else football += 1; // legacy games have no gameType and are soccer

    const age = g?.ageGroup?.trim();
    if (age) ages.set(age, (ages.get(age) ?? 0) + 1);
  }

  // Strictly greater: a tie, or no games at all, falls back to football.
  const sport: RulesSport = futsal > football ? 'futsal' : 'football';

  let ageGroup: string | undefined;
  let best = 0;
  for (const [age, n] of ages) {
    // Ties break on the lower age group, so the answer is stable rather than
    // dependent on object key order.
    if (n > best || (n === best && ageGroup !== undefined && age.localeCompare(ageGroup) < 0)) {
      best = n;
      ageGroup = age;
    }
  }

  return { sport, ageGroup };
}
