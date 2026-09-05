import type { Player } from '@/types';
import { levenshtein, matchPlayerInText, playerSpeechHandles } from '../playerNameMatch';

const players: Player[] = [
  { id: 'p-emma', name: 'Emma Virtanen', nickname: 'Emma' },
  { id: 'p-matti', name: 'Matti Meikäläinen' },
  { id: 'p-matias', name: 'Matias Korhonen' },
  { id: 'p-sofia', name: 'Sofia Nieminen', nickname: 'Sofi' },
];

describe('playerNameMatch', () => {
  it('levenshtein counts single edits', () => {
    expect(levenshtein('emma', 'emma')).toBe(0);
    expect(levenshtein('emma', 'emmi')).toBe(1);
    expect(levenshtein('matti', 'mati')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('handles are the nickname and the first name, normalized', () => {
    expect(playerSpeechHandles(players[0])).toEqual(['emma']);
    expect(playerSpeechHandles(players[1])).toEqual(['matti']);
    expect(playerSpeechHandles(players[3])).toEqual(['sofi', 'sofia']);
  });

  /** @critical - the inbox guess: exact names and Finnish inflections must both land. */
  it('matches an exact handle and an inflected form', () => {
    expect(matchPlayerInText('Emma hieno syöttö', players)?.id).toBe('p-emma');
    expect(matchPlayerInText('Emman syöttö paineen alla', players)?.id).toBe('p-emma');
    expect(matchPlayerInText('Sofille pallo', players)?.id).toBe('p-sofia');
  });

  it('tolerates a one-letter slip on longer names', () => {
    expect(matchPlayerInText('Emmi teki maalin', players)?.id).toBe('p-emma');
  });

  it('gives no guess on a tie or when nobody matches', () => {
    // "Mati" stems both Matti and Matias equally.
    expect(matchPlayerInText('Mati pelasi hyvin', players)).toBeNull();
    expect(matchPlayerInText('Puolustus nukkui kulmissa', players)).toBeNull();
    expect(matchPlayerInText('', players)).toBeNull();
  });

  it('an exact name wins over a stem match on another player', () => {
    expect(matchPlayerInText('Matti syötti Matiakselle', players)?.id).toBe('p-matti');
  });
});
