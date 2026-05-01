/**
 * Tests for computeApplyDiff + countDiffChanges — the per-game diff
 * the Apply preview UI displays before the user commits the change.
 */

import {
  computeApplyDiff,
  countDiffChanges,
  type ApplyDiff,
} from '@/utils/applyPreview';
import { FORMATION_PRESETS } from '@/config/formationPresets';
import type { AppState, ScheduledSub } from '@/types/game';
import type { Player } from '@/types';
import type { PlanDraft } from '@/utils/planSwapEngine';

const preset5v5 = FORMATION_PRESETS.find((p) => p.id === '5v5-2-2')!;

// Helper: build a saved game with given playersOnField roster mapped via
// preset role coords. Each player id is placed at the matching preset
// role's relX/relY.
const gameWith = (
  startingByRole: Record<string, string>,
  scheduledSubs: ScheduledSub[] = [],
  selectedExtra: string[] = [],
): AppState => {
  const playersOnField = (preset5v5.roles ?? [])
    .filter((r) => startingByRole[r.name])
    .map((r) => ({
      id: startingByRole[r.name],
      name: startingByRole[r.name],
      relX: r.relX,
      relY: r.relY,
    })) as unknown as AppState['playersOnField'];
  const onFieldIds = playersOnField.map((p) => p.id);
  return {
    teamId: 't1',
    teamName: 'Pepo',
    opponentName: 'Opp',
    gameDate: '2026-04-30',
    numberOfPeriods: 2,
    periodDurationMinutes: 12,
    playersOnField,
    selectedPlayerIds: [...onFieldIds, ...selectedExtra],
    availablePlayers: [] as Player[],
    scheduledSubs,
  } as unknown as AppState;
};

const sub = (overrides: Partial<ScheduledSub>): ScheduledSub => ({
  id: 's1',
  timeSeconds: 600,
  outPlayer: 'p1',
  inPlayer: 'p6',
  positionRole: 'LB',
  status: 'pending',
  ...overrides,
});

describe('computeApplyDiff', () => {
  it('reports an empty diff when game and draft already match', () => {
    const game = gameWith({ GK: 'p1', LB: 'p2', RB: 'p3', LF: 'p4', RF: 'p5' });
    const draft: PlanDraft = {
      startingXI: { GK: 'p1', LB: 'p2', RB: 'p3', LF: 'p4', RF: 'p5' },
      bench: [],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    // gameId passes through unchanged — used by PR 8b for per-game opt-out.
    expect(diff.gameId).toBe('g1');
    expect(diff.isEmpty).toBe(true);
    expect(countDiffChanges(diff)).toBe(0);
  });

  it('adds a player who appears in the draft but not the game', () => {
    const game = gameWith({ GK: 'p1' });
    const draft: PlanDraft = {
      startingXI: { GK: 'p1', LB: 'p2' },
      bench: [],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.isEmpty).toBe(false);
    expect(diff.lineupAdded).toEqual([{ playerId: 'p2', role: 'LB' }]);
    expect(diff.lineupRemoved).toEqual([]);
    expect(diff.lineupMoved).toEqual([]);
  });

  it('removes a player who is on the field but missing from the draft', () => {
    const game = gameWith({ GK: 'p1', LB: 'p2' });
    const draft: PlanDraft = {
      startingXI: { GK: 'p1' },
      bench: ['p2'],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.lineupRemoved).toEqual([{ playerId: 'p2', role: 'LB' }]);
    expect(diff.lineupAdded).toEqual([]);
  });

  it('detects a role change for a player who stays on the field', () => {
    const game = gameWith({ GK: 'p1', LB: 'p2' });
    const draft: PlanDraft = {
      startingXI: { GK: 'p1', RB: 'p2' },
      bench: [],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.lineupMoved).toEqual([
      { playerId: 'p2', fromRole: 'LB', toRole: 'RB' },
    ]);
    expect(diff.lineupAdded).toEqual([]);
    expect(diff.lineupRemoved).toEqual([]);
  });

  it('handles add + remove + move in the same diff', () => {
    const game = gameWith({ GK: 'p1', LB: 'p2', RB: 'p3' });
    const draft: PlanDraft = {
      startingXI: { GK: 'p1', LB: 'p3', RF: 'p4' },
      bench: ['p2'],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.lineupRemoved).toEqual([{ playerId: 'p2', role: 'LB' }]);
    expect(diff.lineupMoved).toEqual([
      { playerId: 'p3', fromRole: 'RB', toRole: 'LB' },
    ]);
    expect(diff.lineupAdded).toEqual([{ playerId: 'p4', role: 'RF' }]);
    expect(countDiffChanges(diff)).toBe(3);
  });

  it('subsAdded covers subs in the draft but not the saved game', () => {
    const game = gameWith({ GK: 'p1' }, []);
    const draft: PlanDraft = {
      startingXI: { GK: 'p1' },
      bench: [],
      scheduledSubs: [
        { id: 's1', timeSeconds: 600, inPlayer: 'p2', positionRole: 'LB' },
      ],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.subsAdded).toEqual([
      {
        id: 's1',
        timeSeconds: 600,
        inPlayer: 'p2',
        positionRole: 'LB',
      },
    ]);
    expect(diff.subsRemoved).toEqual([]);
    expect(diff.subsModified).toEqual([]);
  });

  it('subsRemoved covers subs in the saved game but not the draft', () => {
    const game = gameWith({ GK: 'p1' }, [sub({})]);
    const draft: PlanDraft = {
      startingXI: { GK: 'p1' },
      bench: [],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.subsRemoved).toHaveLength(1);
    expect(diff.subsRemoved[0]).toMatchObject({ id: 's1', outPlayer: 'p1' });
  });

  it('subsModified flags same id with different fields', () => {
    const game = gameWith({ GK: 'p1' }, [sub({ id: 's1', timeSeconds: 600 })]);
    const draft: PlanDraft = {
      startingXI: { GK: 'p1' },
      bench: [],
      scheduledSubs: [
        { id: 's1', timeSeconds: 900, inPlayer: 'p6', positionRole: 'LB' },
      ],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.subsModified).toHaveLength(1);
    expect(diff.subsModified[0].before.timeSeconds).toBe(600);
    expect(diff.subsModified[0].after.timeSeconds).toBe(900);
    expect(diff.subsAdded).toEqual([]);
    expect(diff.subsRemoved).toEqual([]);
  });

  it('returns isEmpty=true when the only difference is computed-on-Apply outPlayer', () => {
    // The draft doesn't carry outPlayer (it's recomputed via getRoleSegments
    // at apply time), so it shouldn't count as a "modify" by itself.
    const game = gameWith({ GK: 'p1' }, [
      sub({ id: 's1', outPlayer: 'p1', inPlayer: 'p6', positionRole: 'LB', timeSeconds: 600 }),
    ]);
    const draft: PlanDraft = {
      startingXI: { GK: 'p1' },
      bench: [],
      scheduledSubs: [
        { id: 's1', timeSeconds: 600, inPlayer: 'p6', positionRole: 'LB' },
      ],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.subsModified).toEqual([]);
    expect(diff.isEmpty).toBe(true);
  });

  it('off-formation player not in the draft is reported as removed (Codex P1)', () => {
    // Game has a player at coords that don't snap to any preset role
    // (legacy data / coord drift). Without the on-field-id tracking,
    // Apply would silently remove them while the diff said isEmpty.
    const game: AppState = {
      teamId: 't1',
      teamName: 'Pepo',
      opponentName: 'Opp',
      gameDate: '2026-04-30',
      numberOfPeriods: 2,
      periodDurationMinutes: 12,
      playersOnField: [
        // GK at canonical coords (mappable).
        { id: 'p1', name: 'GK', relX: 0.5, relY: 0.95 },
        // Off-formation: no preset role at (0.99, 0.01).
        { id: 'p99', name: 'Drift', relX: 0.99, relY: 0.01 },
      ],
      selectedPlayerIds: ['p1', 'p99'],
      availablePlayers: [],
      scheduledSubs: [],
    } as unknown as AppState;
    const draft: PlanDraft = {
      startingXI: { GK: 'p1' },
      bench: [],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.isEmpty).toBe(false);
    expect(diff.lineupRemoved).toEqual([
      { playerId: 'p99', role: undefined },
    ]);
  });

  it('off-formation player placed at a real role in the draft is reported as added', () => {
    // Drifted-coord player has no recognized current role; placing them
    // at a draft role surfaces as a clean "add" rather than a confusing
    // "moved from off-formation" entry.
    const game: AppState = {
      teamId: 't1',
      teamName: 'Pepo',
      opponentName: 'Opp',
      gameDate: '2026-04-30',
      numberOfPeriods: 2,
      periodDurationMinutes: 12,
      playersOnField: [
        { id: 'p1', name: 'GK', relX: 0.5, relY: 0.95 },
        { id: 'p99', name: 'Drift', relX: 0.99, relY: 0.01 },
      ],
      selectedPlayerIds: ['p1', 'p99'],
      availablePlayers: [],
      scheduledSubs: [],
    } as unknown as AppState;
    const draft: PlanDraft = {
      startingXI: { GK: 'p1', LB: 'p99' },
      bench: [],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.lineupAdded).toEqual([{ playerId: 'p99', role: 'LB' }]);
    expect(diff.lineupRemoved).toEqual([]);
    expect(diff.lineupMoved).toEqual([]);
  });

  it('malformed playersOnField with missing coords are treated as off-formation, not snapped to center', () => {
    // Without the explicit null check, undefined relX/relY would default
    // to (0.5, 0.5) — which can be a recognized role. The diff would
    // then misclassify the player as "in role X" and silently skip
    // surfacing them in lineupRemoved when not in the draft.
    const game: AppState = {
      teamId: 't1',
      teamName: 'Pepo',
      opponentName: 'Opp',
      gameDate: '2026-04-30',
      numberOfPeriods: 2,
      periodDurationMinutes: 12,
      playersOnField: [
        // Mappable.
        { id: 'p1', name: 'GK', relX: 0.5, relY: 0.95 },
        // Malformed: undefined coords. Must surface as off-formation.
        { id: 'pX', name: 'Malformed' },
      ],
      selectedPlayerIds: ['p1', 'pX'],
      availablePlayers: [],
      scheduledSubs: [],
    } as unknown as AppState;
    const draft: PlanDraft = {
      startingXI: { GK: 'p1' },
      bench: [],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    // pX must be reported as removed with role=undefined, NOT silently
    // mapped to a center-field role.
    expect(diff.lineupRemoved).toEqual([{ playerId: 'pX', role: undefined }]);
  });

  it('duplicate player id in playersOnField does not produce duplicate diff entries', () => {
    // Defensive: corrupt data with the same id twice should be
    // de-duped by the onFieldPlayerIds.has guard.
    const game: AppState = {
      teamId: 't1',
      teamName: 'Pepo',
      opponentName: 'Opp',
      gameDate: '2026-04-30',
      numberOfPeriods: 2,
      periodDurationMinutes: 12,
      playersOnField: [
        { id: 'p1', name: 'GK', relX: 0.5, relY: 0.95 },
        // Duplicate id — bug in upstream data.
        { id: 'p1', name: 'GK dup', relX: 0.5, relY: 0.95 },
      ],
      selectedPlayerIds: ['p1'],
      availablePlayers: [],
      scheduledSubs: [],
    } as unknown as AppState;
    const draft: PlanDraft = {
      startingXI: {},
      bench: ['p1'],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    // Exactly one removal entry, not two.
    expect(diff.lineupRemoved).toEqual([{ playerId: 'p1', role: 'GK' }]);
  });

  it('fired/skipped saved subs are excluded from the diff (historical events)', () => {
    // A saved sub with status='fired' has already played out during
    // live play and can't be undone by Apply. The diff should ignore it
    // entirely — neither modify nor remove — so the preview UI doesn't
    // dangle a "removed" entry the user can't actually reverse.
    const game: AppState = {
      teamId: 't1',
      teamName: 'Pepo',
      opponentName: 'Opp',
      gameDate: '2026-04-30',
      numberOfPeriods: 2,
      periodDurationMinutes: 12,
      playersOnField: [{ id: 'p1', name: 'GK', relX: 0.5, relY: 0.95 }],
      selectedPlayerIds: ['p1'],
      availablePlayers: [],
      scheduledSubs: [
        sub({ id: 'fired_sub', status: 'fired' }),
        sub({ id: 'skipped_sub', status: 'skipped' }),
        sub({ id: 'pending_sub', status: 'pending' }),
      ],
    } as unknown as AppState;
    const draft: PlanDraft = {
      startingXI: { GK: 'p1' },
      bench: [],
      // Draft only contains the pending sub. fired/skipped saved subs
      // would otherwise surface as `removed` if not filtered.
      scheduledSubs: [
        {
          id: 'pending_sub',
          timeSeconds: 600,
          inPlayer: 'p6',
          positionRole: 'LB',
        },
      ],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.subsRemoved).toEqual([]);
    expect(diff.subsModified).toEqual([]);
    expect(diff.subsAdded).toEqual([]);
    expect(diff.isEmpty).toBe(true);
  });

  it('two distinct players at the same coords: second loses role, surfaces as off-formation removal', () => {
    // Defensive: corrupt data with two different players at the same
    // role coords (e.g., both at GK). The occupiedRoles guard records
    // the first one with the role; the second falls through to
    // onFieldPlayerIds without a role. If neither is in the draft,
    // both surface in lineupRemoved — first with role, second with
    // role=undefined (off-formation).
    const game: AppState = {
      teamId: 't1',
      teamName: 'Pepo',
      opponentName: 'Opp',
      gameDate: '2026-04-30',
      numberOfPeriods: 2,
      periodDurationMinutes: 12,
      playersOnField: [
        { id: 'p1', name: 'First', relX: 0.5, relY: 0.95 },
        { id: 'p2', name: 'Second', relX: 0.5, relY: 0.95 }, // same coords
      ],
      selectedPlayerIds: ['p1', 'p2'],
      availablePlayers: [],
      scheduledSubs: [],
    } as unknown as AppState;
    const draft: PlanDraft = {
      startingXI: {},
      bench: ['p1', 'p2'],
      scheduledSubs: [],
    };
    const diff = computeApplyDiff('g1', game, draft, preset5v5);
    expect(diff.lineupRemoved).toEqual([
      { playerId: 'p1', role: 'GK' },
      { playerId: 'p2', role: undefined },
    ]);
  });

  it('countDiffChanges sums every category', () => {
    const diff: ApplyDiff = {
      gameId: 'g1',
      isEmpty: false,
      lineupAdded: [{ playerId: 'p1', role: 'LB' }],
      lineupRemoved: [{ playerId: 'p2', role: 'RB' }],
      lineupMoved: [{ playerId: 'p3', fromRole: 'LF', toRole: 'RF' }],
      subsAdded: [
        { id: 's1', timeSeconds: 600, inPlayer: 'p4', positionRole: 'GK' },
      ],
      subsRemoved: [
        { id: 's2', timeSeconds: 1200, inPlayer: 'p5', positionRole: 'GK' },
      ],
      subsModified: [
        {
          before: {
            id: 's3',
            timeSeconds: 600,
            inPlayer: 'p6',
            positionRole: 'LB',
          },
          after: {
            id: 's3',
            timeSeconds: 900,
            inPlayer: 'p6',
            positionRole: 'LB',
          },
        },
      ],
    };
    expect(countDiffChanges(diff)).toBe(6);
  });
});
