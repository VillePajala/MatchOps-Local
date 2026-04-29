/**
 * Tests for applyDraftToGame — turning a PlanDraft into the
 * playersOnField + selectedPlayerIds shape the Game record stores.
 *
 * @critical Locks in CLAUDE.md Rule 3 (playersOnField ⊆ selectedPlayerIds
 * ⊆ availablePlayers) for the planner Apply path.
 */

import { applyDraftToGame } from '@/utils/planApply';
import { FORMATION_PRESETS } from '@/config/formationPresets';
import type { Player } from '@/types';
import type { PlanDraft } from '@/utils/planSwapEngine';

const preset5v5_2_2 = FORMATION_PRESETS.find((p) => p.id === '5v5-2-2')!;
const preset8v8 = FORMATION_PRESETS.find((p) => p.id === '8v8-3-3-1')!;

const roster: Player[] = [
  { id: 'p1', name: 'Alice', isGoalie: true, jerseyNumber: '1' },
  { id: 'p2', name: 'Bob', isGoalie: false, jerseyNumber: '2' },
  { id: 'p3', name: 'Cara', isGoalie: false, jerseyNumber: '3' },
  { id: 'p4', name: 'Dan', isGoalie: false, jerseyNumber: '4' },
  { id: 'p5', name: 'Eve', isGoalie: false, jerseyNumber: '5' },
];

describe('applyDraftToGame — typical Apply path', () => {
  it('places players at their role coords', () => {
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1', LB: 'p2', RB: 'p3', LF: 'p4', RF: 'p5' },
      bench: [],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    expect(r.playersOnField).toHaveLength(5);
    const gk = r.playersOnField.find((p) => p.id === 'p1');
    expect(gk?.relX).toBe(0.5);
    expect(gk?.relY).toBe(0.95);
    const lb = r.playersOnField.find((p) => p.id === 'p2');
    expect(lb?.relX).toBe(0.25);
    expect(lb?.relY).toBe(0.7);
  });

  it('preserves player metadata (name, jerseyNumber, isGoalie)', () => {
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1' },
      bench: ['p2', 'p3', 'p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    expect(r.playersOnField[0]).toMatchObject({
      id: 'p1',
      name: 'Alice',
      jerseyNumber: '1',
      isGoalie: true,
    });
  });

  it('selectedPlayerIds contains every roster member referenced by the draft', () => {
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1', LB: 'p2' },
      bench: ['p3', 'p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    expect(r.selectedPlayerIds.sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('preserves Rule 3: playersOnField ⊆ selectedPlayerIds', () => {
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1', LB: 'p2', RB: 'p3', LF: 'p4', RF: 'p5' },
      bench: [],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    const onFieldIds = new Set(r.playersOnField.map((p) => p.id));
    for (const id of onFieldIds) {
      expect(r.selectedPlayerIds).toContain(id);
    }
  });

  it('skips empty role slots without errors', () => {
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1', LB: 'p2' }, // RB/LF/RF empty
      bench: ['p3', 'p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    expect(r.playersOnField).toHaveLength(2);
    expect(r.unknownRoles).toEqual([]);
    expect(r.unknownPlayerIds).toEqual([]);
  });
});

describe('applyDraftToGame — defensive paths', () => {
  it('flags player ids not in the roster (filters them out)', () => {
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1', LB: 'pUnknown' },
      bench: ['p3'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    expect(r.unknownPlayerIds).toContain('pUnknown');
    expect(r.playersOnField.find((p) => p.id === 'pUnknown')).toBeUndefined();
    expect(r.selectedPlayerIds).not.toContain('pUnknown');
  });

  it('flags role names not in the preset (filters them out of playersOnField)', () => {
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1', NotARole: 'p2' },
      bench: ['p3', 'p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    expect(r.unknownRoles).toContain('NotARole');
    expect(r.playersOnField.find((p) => p.id === 'p2')).toBeUndefined();
    // p2 still in selectedPlayerIds — they're in the roster, just not placed.
    expect(r.selectedPlayerIds).toContain('p2');
  });

  it('handles a preset with no `roles` map (legacy presets)', () => {
    const noRolesPreset = { ...preset5v5_2_2, roles: undefined };
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1', LB: 'p2' },
      bench: ['p3', 'p4', 'p5'],
    };
    const r = applyDraftToGame(draft, noRolesPreset, roster);
    // Without roles, all draft roles surface as unknown.
    expect(r.unknownRoles.sort()).toEqual(['GK', 'LB']);
    expect(r.playersOnField).toEqual([]);
    // Players still in selectedPlayerIds — Rule 3 holds (empty playersOnField ⊆ selectedPlayerIds).
    expect(r.selectedPlayerIds.sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('handles a null preset gracefully', () => {
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1' },
      bench: ['p2', 'p3', 'p4', 'p5'],
    };
    const r = applyDraftToGame(draft, null, roster);
    expect(r.playersOnField).toEqual([]);
    expect(r.unknownRoles).toEqual(['GK']);
  });

  it('does not deduplicate players when draft references the same id multiple times — UI is responsible (documented contract)', () => {
    // Pathological draft: same player in two roles. The engine treats it
    // as a contract violation — both slots are placed; selectedPlayerIds
    // dedupes via Set semantics. The editor UI is responsible for
    // preventing this state at the source. See JSDoc on applyDraftToGame.
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1', LB: 'p1' },
      bench: ['p2', 'p3', 'p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    const ids = r.playersOnField.map((p) => p.id);
    expect(ids.filter((id) => id === 'p1').length).toBe(2);
    expect(r.selectedPlayerIds.filter((id) => id === 'p1').length).toBe(1);
  });

  it('dedupes selectedPlayerIds when the same player is in startingXI and bench (malformed draft)', () => {
    // Pathological draft: p1 in both startingXI and bench. Set semantics
    // in step 3 of applyDraftToGame deduplicate, so selectedPlayerIds
    // contains p1 exactly once even though the draft references it twice.
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1' },
      bench: ['p1', 'p2', 'p3', 'p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    expect(r.selectedPlayerIds.filter((id) => id === 'p1').length).toBe(1);
    expect(r.unknownPlayerIds).toEqual([]);
  });

  it('surfaces unknown role names even when the player id appears at a known role too (Codex P2)', () => {
    // Reused player id at both a known and an unknown role: the unknown
    // role must still be reported via unknownRoles. Earlier code skipped
    // entries by player id, swallowing the unknown role in this case.
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: { GK: 'p1', NotARole: 'p1' },
      bench: ['p2', 'p3', 'p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    expect(r.unknownRoles).toContain('NotARole');
  });
});

describe('applyDraftToGame — per-game duration filter', () => {
  it('drops subs at or past gameDurationSec into unreachableSubs', () => {
    const draft: PlanDraft = {
      scheduledSubs: [
        // Reachable.
        {
          id: 's1',
          timeSeconds: 300,
          inPlayer: 'p4',
          positionRole: 'LB',
        },
        // At exactly the end — would never fire.
        {
          id: 's2',
          timeSeconds: 600,
          inPlayer: 'p5',
          positionRole: 'GK',
        },
        // Past the end — would never fire.
        {
          id: 's3',
          timeSeconds: 999,
          inPlayer: 'p4',
          positionRole: 'RB',
        },
      ],
      startingXI: { GK: 'p1', LB: 'p2', RB: 'p3' },
      bench: ['p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster, 600);
    expect(r.scheduledSubs.map((s) => s.id)).toEqual(['s1']);
    expect(r.unreachableSubs.map((s) => s.id)).toEqual(['s2', 's3']);
  });

  it('omitting gameDurationSec passes all subs through (legacy callers)', () => {
    const draft: PlanDraft = {
      scheduledSubs: [
        {
          id: 's1',
          timeSeconds: 999999,
          inPlayer: 'p4',
          positionRole: 'LB',
        },
      ],
      startingXI: { GK: 'p1', LB: 'p2', RB: 'p3' },
      bench: ['p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster);
    expect(r.scheduledSubs).toHaveLength(1);
    expect(r.unreachableSubs).toEqual([]);
  });
});

describe('applyDraftToGame — outPlayer derived from current draft state', () => {
  it('outPlayer reflects the latest startingXI, not what the draft sub may have stored', () => {
    // The draft has a sub at LB, but startingXI.LB has just been
    // changed via a pitch swap. The persisted ScheduledSub should
    // record the NEW startingXI player as outPlayer — the old value
    // would mean the live-game banner subs out the wrong player.
    // (DraftScheduledSub no longer carries outPlayer at all; this
    // test pins the contract.)
    const draft: PlanDraft = {
      scheduledSubs: [
        {
          id: 's1',
          timeSeconds: 300,
          inPlayer: 'p4',
          positionRole: 'LB',
        },
      ],
      startingXI: { GK: 'p1', LB: 'p3', RB: 'p2' }, // p3 at LB, not p2
      bench: ['p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster, 600);
    expect(r.scheduledSubs).toHaveLength(1);
    expect(r.scheduledSubs[0].outPlayer).toBe('p3');
    expect(r.scheduledSubs[0].inPlayer).toBe('p4');
  });

  it('chained subs at the same role: each sub\'s outPlayer is the prior sub\'s inPlayer', () => {
    const draft: PlanDraft = {
      scheduledSubs: [
        { id: 's1', timeSeconds: 200, inPlayer: 'p4', positionRole: 'LB' },
        { id: 's2', timeSeconds: 400, inPlayer: 'p5', positionRole: 'LB' },
      ],
      startingXI: { GK: 'p1', LB: 'p2', RB: 'p3' },
      bench: ['p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster, 600);
    expect(r.scheduledSubs).toHaveLength(2);
    expect(r.scheduledSubs[0]).toMatchObject({
      id: 's1',
      outPlayer: 'p2', // starter at LB
      inPlayer: 'p4',
    });
    expect(r.scheduledSubs[1]).toMatchObject({
      id: 's2',
      outPlayer: 'p4', // s1's inPlayer
      inPlayer: 'p5',
    });
  });

  it('drops a sub whose role is empty at sub-time (no outPlayer to record)', () => {
    // RB is in the preset but isn't assigned in startingXI, so the
    // role has no occupant at sub time. The sub can't fire and is
    // dropped silently. unknownRoles stays empty (RB is a known role).
    const draft: PlanDraft = {
      scheduledSubs: [
        { id: 's1', timeSeconds: 100, inPlayer: 'p4', positionRole: 'RB' },
      ],
      startingXI: { GK: 'p1', LB: 'p2' },
      bench: ['p3', 'p4', 'p5'],
    };
    const r = applyDraftToGame(draft, preset5v5_2_2, roster, 600);
    expect(r.scheduledSubs).toHaveLength(0);
    expect(r.unknownRoles).toEqual([]);
  });
});

describe('applyDraftToGame — 8v8 sanity check', () => {
  it('places all 8 starting-XI roles with a clean roster', () => {
    const fullRoster = [
      ...roster,
      { id: 'p6', name: 'Frank', isGoalie: false },
      { id: 'p7', name: 'Gina', isGoalie: false },
      { id: 'p8', name: 'Hank', isGoalie: false },
    ] as Player[];
    const draft: PlanDraft = {
      scheduledSubs: [],
      startingXI: {
        GK: 'p1',
        LB: 'p2',
        CB: 'p3',
        RB: 'p4',
        LM: 'p5',
        CM: 'p6',
        RM: 'p7',
        ST: 'p8',
      },
      bench: [],
    };
    const r = applyDraftToGame(draft, preset8v8, fullRoster);
    expect(r.playersOnField).toHaveLength(8);
    expect(r.unknownRoles).toEqual([]);
    expect(r.unknownPlayerIds).toEqual([]);
    // Every starter appears exactly once in playersOnField.
    const ids = r.playersOnField.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
