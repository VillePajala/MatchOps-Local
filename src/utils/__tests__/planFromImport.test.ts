/**
 * Tests for the import → editor draft conversion.
 */

import { planDraftFromImport } from '@/utils/planFromImport';
import type { Player } from '@/types';

const roster: Player[] = [
  { id: 'p1', name: 'Alice', isGoalie: true, jerseyNumber: '1' },
  { id: 'p2', name: 'Bob', isGoalie: false, jerseyNumber: '2' },
  { id: 'p3', name: 'Cara', isGoalie: false, jerseyNumber: '3' },
  { id: 'p4', name: 'Dan', isGoalie: false, jerseyNumber: '4' },
];

describe('planDraftFromImport', () => {
  it('builds a draft with startingXI assignments + remaining roster on bench', () => {
    const r = planDraftFromImport(
      { scheduledSubs: [], startingXI: { GK: 'p1', LB: 'p2' } },
      roster,
    );
    expect(r.draft.startingXI).toEqual({ GK: 'p1', LB: 'p2' });
    expect(r.draft.bench).toEqual(['p3', 'p4']);
    expect(r.unknownPlayerIds).toEqual([]);
    expect(r.duplicateRoleAssignments).toEqual([]);
  });

  it('strips unknown player ids and surfaces them', () => {
    const r = planDraftFromImport(
      { scheduledSubs: [], startingXI: { GK: 'p1', LB: 'pUnknown' } },
      roster,
    );
    expect(r.draft.startingXI).toEqual({ GK: 'p1' });
    expect(r.unknownPlayerIds).toEqual(['pUnknown']);
    expect(r.draft.bench).toEqual(['p2', 'p3', 'p4']);
  });

  it('drops duplicate role assignments (first-seen wins) and surfaces them — Codex P2', () => {
    const r = planDraftFromImport(
      { scheduledSubs: [], startingXI: { GK: 'p1', LB: 'p1', RB: 'p2' } },
      roster,
    );
    // p1 stays at GK (first seen); LB is dropped.
    expect(r.draft.startingXI).toEqual({ GK: 'p1', RB: 'p2' });
    expect(r.duplicateRoleAssignments).toEqual([
      { role: 'LB', playerId: 'p1' },
    ]);
    // p1 still on field, not on bench.
    expect(r.draft.bench).toEqual(['p3', 'p4']);
  });

  it('skips empty-string player slots from the standalone', () => {
    const r = planDraftFromImport(
      { scheduledSubs: [], startingXI: { GK: 'p1', LB: '' } },
      roster,
    );
    expect(r.draft.startingXI).toEqual({ GK: 'p1' });
    expect(r.unknownPlayerIds).toEqual([]);
  });

  it('returns an empty bench when all roster members are starters', () => {
    const r = planDraftFromImport(
      {
        scheduledSubs: [], startingXI: { GK: 'p1', LB: 'p2', RB: 'p3', ST: 'p4' },
      },
      roster,
    );
    expect(r.draft.bench).toEqual([]);
  });

  it('preserves roster order in bench (deterministic for snapshot tests)', () => {
    const r = planDraftFromImport(
      { scheduledSubs: [], startingXI: { GK: 'p3' } },
      roster,
    );
    expect(r.draft.bench).toEqual(['p1', 'p2', 'p4']);
  });

  it('returns an empty draft for empty startingXI', () => {
    const r = planDraftFromImport({ scheduledSubs: [], startingXI: {} }, roster);
    expect(r.draft.startingXI).toEqual({});
    expect(r.draft.bench).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  // pass-14 Issue 3: presetId must round-trip through import so a saved
  // imported plan reopened later renders against the original formation
  // rather than silently dropping role-name-mismatched startingXI entries.
  it('stamps the supplied presetId onto the draft', () => {
    const r = planDraftFromImport(
      { scheduledSubs: [], startingXI: { GK: 'p1' } },
      roster,
      'formation-4-3-3',
    );
    expect(r.draft.presetId).toBe('formation-4-3-3');
  });

  it('leaves presetId undefined when no formation id is supplied', () => {
    const r = planDraftFromImport(
      { scheduledSubs: [], startingXI: { GK: 'p1' } },
      roster,
    );
    expect(r.draft.presetId).toBeUndefined();
  });
});
