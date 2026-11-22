import type { Player } from '@/types';
import { PITCH_LENGTH, PITCH_WIDTH, type Concept } from './types';

/**
 * Puts the team's own players on the concept's discs.
 *
 * 1. When the current game has players on the field (relX/relY, 0..1 with our
 *    goal at the bottom - the same orientation as a concept), each of our
 *    concept players gets the field player standing nearest to its start
 *    spot: the goalkeeper to the goalkeeper, the rest by shortest distance
 *    first, so a formation maps onto a formation.
 * 2. Concept players still without a name take roster players in roster
 *    order (a goalkeeper concept player prefers a roster keeper).
 * 3. Never the same player twice. A disc may stay nameless when the roster is
 *    shorter than the concept.
 *
 * Returns concept player id -> roster player id. Pure.
 */
export function assignPlayers(
  concept: Concept,
  roster: readonly Player[],
  fieldPlayers: readonly Player[] = [],
): Record<string, string> {
  const ours = concept.players.filter((p) => p.side === 'us');
  const result: Record<string, string> = {};
  const used = new Set<string>();
  const isKeeper = (role?: string) => role === 'gk';
  const active = roster.filter((p) => !p.archived);

  // 1. Field positions.
  const placed = fieldPlayers.filter(
    (p) => typeof p.relX === 'number' && typeof p.relY === 'number' && !p.archived,
  );
  if (placed.length > 0) {
    const keeper = ours.find((p) => isKeeper(p.role));
    const fieldKeeper = placed.find((p) => p.isGoalie);
    if (keeper && fieldKeeper) {
      result[keeper.id] = fieldKeeper.id;
      used.add(fieldKeeper.id);
    }
    const pairs: Array<{ c: string; p: string; d: number }> = [];
    for (const c of ours) {
      if (result[c.id]) continue;
      for (const p of placed) {
        if (used.has(p.id) || (p.isGoalie && !isKeeper(c.role))) continue;
        const dx = c.start[0] / PITCH_WIDTH - (p.relX as number);
        const dy = c.start[1] / PITCH_LENGTH - (p.relY as number);
        pairs.push({ c: c.id, p: p.id, d: dx * dx + dy * dy });
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    for (const { c, p } of pairs) {
      if (result[c] || used.has(p)) continue;
      result[c] = p;
      used.add(p);
    }
  }

  // 2. Roster order.
  const take = (prefer: (p: Player) => boolean): string | undefined => {
    const pick = active.find((p) => !used.has(p.id) && prefer(p)) ?? active.find((p) => !used.has(p.id));
    if (pick) used.add(pick.id);
    return pick?.id;
  };
  for (const c of ours) {
    if (result[c.id]) continue;
    const id = take(isKeeper(c.role) ? (p) => !!p.isGoalie : (p) => !p.isGoalie);
    if (id) result[c.id] = id;
  }
  return result;
}

/** The name painted on a disc: the nickname, else the first name. */
export function discName(player: Pick<Player, 'name' | 'nickname'>): string {
  const nick = player.nickname?.trim();
  if (nick) return nick;
  return player.name.trim().split(/\s+/)[0] ?? '';
}
