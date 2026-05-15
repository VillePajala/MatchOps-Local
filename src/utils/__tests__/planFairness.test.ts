import {
  computePlayerSeconds,
  getRoleSegments,
} from '@/utils/planFairness';
import type { PlanDraft } from '@/utils/planSwapEngine';

const sub = (
  id: string,
  timeSeconds: number,
  inPlayer: string,
  positionRole: string,
) => ({ id, timeSeconds, inPlayer, positionRole });

const baseDraft = (): PlanDraft => ({
  startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
  bench: ['p3', 'p4'],
  scheduledSubs: [],
});

describe('computePlayerSeconds', () => {
  it('credits each starting-XI player the full game when there are no subs', () => {
    const totals = computePlayerSeconds(baseDraft(), 1500);
    expect(totals.get('p0')).toBe(1500);
    expect(totals.get('p1')).toBe(1500);
    expect(totals.get('p2')).toBe(1500);
    expect(totals.has('p3')).toBe(false); // bench, never subbed in
  });

  it('splits time correctly at a single sub mid-game', () => {
    const draft: PlanDraft = {
      ...baseDraft(),
      scheduledSubs: [sub('s1', 600, 'p3', 'LB')],
    };
    const totals = computePlayerSeconds(draft, 1500);
    expect(totals.get('p1')).toBe(600); // played 0-600
    expect(totals.get('p3')).toBe(900); // played 600-1500
    expect(totals.get('p0')).toBe(1500); // GK never subbed
  });

  it('handles two consecutive subs at the same role', () => {
    const draft: PlanDraft = {
      ...baseDraft(),
      scheduledSubs: [
        sub('s1', 500, 'p3', 'LB'),
        sub('s2', 1000, 'p4', 'LB'),
      ],
    };
    const totals = computePlayerSeconds(draft, 1500);
    expect(totals.get('p1')).toBe(500);
    expect(totals.get('p3')).toBe(500);
    expect(totals.get('p4')).toBe(500);
  });

  it('aggregates time across multiple roles for the same player', () => {
    // p3 enters at LB, then leaves and re-enters at RB later.
    const draft: PlanDraft = {
      ...baseDraft(),
      scheduledSubs: [
        sub('s1', 300, 'p3', 'LB'),
        sub('s2', 800, 'p4', 'LB'),
        sub('s3', 1000, 'p3', 'RB'),
      ],
    };
    const totals = computePlayerSeconds(draft, 1500);
    // p3: LB 300-800 (500s) + RB 1000-1500 (500s) = 1000
    expect(totals.get('p3')).toBe(1000);
  });

  it('clamps subs to [0, gameDurationSec]', () => {
    const draft: PlanDraft = {
      ...baseDraft(),
      scheduledSubs: [
        sub('s1', -100, 'p3', 'LB'), // negative → clamped to 0
        sub('s2', 9999, 'p4', 'LB'), // past end → clamped to game end
      ],
    };
    const totals = computePlayerSeconds(draft, 1500);
    // s1 fires at 0 → p1 plays 0s, p3 takes over at 0
    // s2 fires at 1500 (clamped) → p4 plays 0s, p3 plays full 1500
    expect(totals.get('p1') ?? 0).toBe(0);
    expect(totals.get('p3')).toBe(1500);
    expect(totals.get('p4') ?? 0).toBe(0);
  });

  it('returns an empty map when game duration is 0 or negative', () => {
    expect(computePlayerSeconds(baseDraft(), 0).size).toBe(0);
    expect(computePlayerSeconds(baseDraft(), -100).size).toBe(0);
  });

  it('out-of-order sub array is sorted internally before walking', () => {
    const draft: PlanDraft = {
      ...baseDraft(),
      scheduledSubs: [
        sub('s2', 1000, 'p4', 'LB'),
        sub('s1', 500, 'p3', 'LB'),
      ],
    };
    const totals = computePlayerSeconds(draft, 1500);
    expect(totals.get('p1')).toBe(500);
    expect(totals.get('p3')).toBe(500);
    expect(totals.get('p4')).toBe(500);
  });

  it('counts the union — not the sum — when a player occupies two roles simultaneously', () => {
    // Malformed-but-reachable: validation only prevents within-role
    // duplicates and (in==out) within a single sub, NOT a sub bringing
    // in a player already on-field elsewhere. p1 starts at LB and is
    // also subbed into GK at 600s — for [600, 1500] p1 occupies both
    // roles. Per-role sum would give 1500 (LB) + 900 (GK) = 2400s,
    // which exceeds gameDurationSec; the union is the real on-field
    // time of 1500s.
    const draft: PlanDraft = {
      startingXI: { GK: 'p3', LB: 'p1', RB: 'p2' },
      bench: ['p4'],
      scheduledSubs: [sub('s1', 600, 'p1', 'GK')],
    };
    const totals = computePlayerSeconds(draft, 1500);
    expect(totals.get('p1')).toBe(1500);
    expect(totals.get('p2')).toBe(1500);
    expect(totals.get('p3')).toBe(600); // displaced at 600
  });

  it('subs targeting an empty role are silently ignored (no startingXI entry)', () => {
    // GK is unassigned; a sub at GK has no startingPlayer to displace.
    const draft: PlanDraft = {
      startingXI: { LB: 'p1' },
      bench: ['p0', 'p2'],
      scheduledSubs: [sub('s1', 500, 'p2', 'GK')],
    };
    const totals = computePlayerSeconds(draft, 1500);
    expect(totals.has('p2')).toBe(false);
    expect(totals.has('p0')).toBe(false);
    expect(totals.get('p1')).toBe(1500);
  });
});

describe('getRoleSegments', () => {
  it('returns one segment for an unsubbed role', () => {
    const segs = getRoleSegments(baseDraft(), 'GK', 1500);
    expect(segs).toEqual([{ startSec: 0, endSec: 1500, playerId: 'p0' }]);
  });

  it('returns N+1 segments for N subs at the role', () => {
    const draft: PlanDraft = {
      ...baseDraft(),
      scheduledSubs: [
        sub('s1', 500, 'p3', 'LB'),
        sub('s2', 1000, 'p4', 'LB'),
      ],
    };
    const segs = getRoleSegments(draft, 'LB', 1500);
    expect(segs).toEqual([
      { startSec: 0, endSec: 500, playerId: 'p1' },
      { startSec: 500, endSec: 1000, playerId: 'p3' },
      { startSec: 1000, endSec: 1500, playerId: 'p4' },
    ]);
  });

  it('returns [] for an unassigned role', () => {
    expect(getRoleSegments(baseDraft(), 'ST', 1500)).toEqual([]);
  });

  it('skips zero-length segments at the boundary', () => {
    // Sub at exactly t=0 means the starting player plays 0 seconds at
    // that role. The helper drops the degenerate [0, 0) segment via
    // its `t > curStart` guard, so only the post-sub segment renders.
    const draft: PlanDraft = {
      ...baseDraft(),
      scheduledSubs: [sub('s1', 0, 'p3', 'LB')],
    };
    const segs = getRoleSegments(draft, 'LB', 1500);
    // The 0-0 segment for p1 is dropped; only p3's 0-1500 remains.
    expect(segs).toEqual([{ startSec: 0, endSec: 1500, playerId: 'p3' }]);
  });
});
