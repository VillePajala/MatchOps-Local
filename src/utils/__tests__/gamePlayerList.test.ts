/**
 * The game's player list vs the club roster, and team membership matching.
 * Owner bug: a player added to the club roster after a game was created could not be
 * picked for that game, and team pre-selection matched by name only.
 * @critical
 */
import { mergeClubRosterIntoGamePlayers, teamMemberIds, activePlayers } from '@/utils/gamePlayerList';
import type { Player } from '@/types';

const p = (id: string, name: string, extra: Partial<Player> = {}): Player => ({ id, name, isGoalie: false, ...extra });

describe('mergeClubRosterIntoGamePlayers', () => {
  it('adds a club player who joined after the game was created', () => {
    const game = [p('a', 'Aino'), p('b', 'Eetu')];
    const club = [p('a', 'Aino'), p('b', 'Eetu'), p('s', 'Sanni Lahti')];
    expect(mergeClubRosterIntoGamePlayers(game, club).map((x) => x.id)).toEqual(['a', 'b', 's']);
  });

  it("keeps the game's own goalie flag and fair-play holder; never takes the roster's card", () => {
    const game = [p('a', 'Aino', { isGoalie: true }), p('b', 'Eetu', { receivedFairPlayCard: true })];
    const club = [p('a', 'Aino', { isGoalie: false }), p('b', 'Eetu'), p('c', 'Ilona', { receivedFairPlayCard: true })];
    const merged = mergeClubRosterIntoGamePlayers(game, club);
    expect(merged.find((x) => x.id === 'a')?.isGoalie).toBe(true);
    expect(merged.find((x) => x.id === 'b')?.receivedFairPlayCard).toBe(true);
    expect(merged.find((x) => x.id === 'c')?.receivedFairPlayCard).toBe(false);
  });

  it('takes current club details (a renamed player shows the new name)', () => {
    const merged = mergeClubRosterIntoGamePlayers([p('a', 'Aino')], [p('a', 'Aino K.', { jerseyNumber: '7' })]);
    expect(merged[0]).toEqual(expect.objectContaining({ name: 'Aino K.', jerseyNumber: '7' }));
  });

  it('keeps players who have left the club roster (the game is a historical record)', () => {
    const merged = mergeClubRosterIntoGamePlayers([p('a', 'Aino'), p('old', 'Left Club')], [p('a', 'Aino')]);
    expect(merged.map((x) => x.id)).toEqual(['a', 'old']);
  });

  it('never adds an archived club player to a game, but keeps one who is already in it', () => {
    const game = [p('a', 'Aino'), p('old', 'Archived But Played')];
    const club = [p('a', 'Aino'), p('old', 'Archived But Played', { archived: true }), p('gone', 'Left', { archived: true })];
    const merged = mergeClubRosterIntoGamePlayers(game, club);
    expect(merged.map((x) => x.id)).toEqual(['a', 'old']);
    expect(merged.find((x) => x.id === 'old')?.archived).toBe(true);
  });

  it('an empty club roster (not loaded yet) leaves the game list as it is', () => {
    const game = [p('a', 'Aino'), p('b', 'Eetu')];
    expect(mergeClubRosterIntoGamePlayers(game, [])).toEqual(game);
  });
});

describe('teamMemberIds', () => {
  const club = [p('a', 'Aino'), p('b', 'Eetu'), p('s1', 'Sanni Lahti'), p('s2', 'Sanni Lahti')];

  it('matches by id, so a renamed player stays on her team', () => {
    expect(teamMemberIds([{ id: 'a', name: 'Aino (old name)' }], club)).toEqual(['a']);
  });

  it('falls back to the name for old entries whose id is not in the club roster', () => {
    expect(teamMemberIds([{ id: 'legacy_123', name: ' eetu ' }], club)).toEqual(['b']);
  });

  it('never ticks two players that share a name from one entry', () => {
    expect(teamMemberIds([{ id: 'legacy_9', name: 'Sanni Lahti' }], club)).toEqual([]);
    expect(teamMemberIds([{ id: 's1', name: 'Sanni Lahti' }], club)).toEqual(['s1']);
  });

  it('keeps club roster order and ignores unknown names', () => {
    expect(teamMemberIds([{ id: 'b', name: 'Eetu' }, { id: 'a', name: 'Aino' }, { id: 'x', name: 'Nobody' }], club)).toEqual(['a', 'b']);
  });
});

describe('activePlayers', () => {
  it('leaves archived players out, keeping order', () => {
    expect(activePlayers([p('a', 'A'), p('b', 'B', { archived: true }), p('c', 'C')]).map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('returns the same array when nobody is archived', () => {
    const list = [p('a', 'A')];
    expect(activePlayers(list)).toBe(list);
  });
});
