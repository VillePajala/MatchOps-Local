/**
 * @critical - one rule for whether a hand-recorded external game belongs in
 * the view on screen. The stats table and the per-player drill-down both read
 * it, because each carrying its own copy is how a team's totals came to
 * include other teams' games, and how the two came to disagree.
 */
import { adjustmentInScope } from '../adjustmentScope';
import type { PlayerStatAdjustment } from '@/types';

const adj = (over: Partial<PlayerStatAdjustment> = {}): PlayerStatAdjustment =>
  ({
    id: 'a1',
    playerId: 'p1',
    gamesPlayedDelta: 1,
    goalsDelta: 0,
    assistsDelta: 0,
    appliedAt: '2024-12-02T00:00:00Z',
    ...over,
  }) as PlayerStatAdjustment;

describe('adjustmentInScope', () => {
  it('lets everything through when nothing is filtered', () => {
    expect(adjustmentInScope(adj(), {})).toBe(true);
    expect(adjustmentInScope(adj({ teamId: 'teamB' }), {})).toBe(true);
  });

  describe('team', () => {
    it('keeps an external game recorded against the selected team', () => {
      expect(adjustmentInScope(adj({ teamId: 'teamA' }), { teamFilter: 'teamA' })).toBe(true);
    });

    it('drops one played for another team', () => {
      expect(adjustmentInScope(adj({ teamId: 'teamB' }), { teamFilter: 'teamA' })).toBe(false);
    });

    it('drops one that names no team, which cannot be shown to be this team', () => {
      expect(adjustmentInScope(adj(), { teamFilter: 'teamA' })).toBe(false);
    });

    it('treats legacy as its own scope: only what names no team', () => {
      expect(adjustmentInScope(adj(), { teamFilter: 'legacy' })).toBe(true);
      expect(adjustmentInScope(adj({ teamId: 'teamA' }), { teamFilter: 'legacy' })).toBe(false);
    });
  });

  describe('year', () => {
    it('places an external game by the date the coach recorded', () => {
      expect(adjustmentInScope(adj({ gameDate: '2024-12-05' }), { clubSeason: '24/25' })).toBe(true);
      expect(adjustmentInScope(adj({ gameDate: '2023-12-05' }), { clubSeason: '24/25' })).toBe(false);
    });

    it('drops one with no date, which cannot be placed in a year', () => {
      expect(adjustmentInScope(adj(), { clubSeason: '24/25' })).toBe(false);
    });
  });

  describe('sport and gender', () => {
    /**
     * An adjustment records neither, so under a specific filter there is no
     * way to say it belongs. Left out rather than assumed to match.
     */
    it('drops every external game once a sport or gender is chosen', () => {
      expect(adjustmentInScope(adj(), { gameTypeFilter: 'futsal' })).toBe(false);
      expect(adjustmentInScope(adj(), { genderFilter: 'girls' })).toBe(false);
    });
  });

  it('requires every active filter to be satisfied, not just one', () => {
    const a = adj({ teamId: 'teamA', gameDate: '2024-12-05' });
    expect(adjustmentInScope(a, { teamFilter: 'teamA', clubSeason: '24/25' })).toBe(true);
    expect(adjustmentInScope(a, { teamFilter: 'teamA', clubSeason: '23/24' })).toBe(false);
    expect(adjustmentInScope(a, { teamFilter: 'teamB', clubSeason: '24/25' })).toBe(false);
  });
});
