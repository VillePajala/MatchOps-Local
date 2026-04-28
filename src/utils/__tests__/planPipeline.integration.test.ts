/**
 * Cross-module integration test for the planner foundation pipeline.
 *
 * @critical Locks in the import → swap → apply contract before PR 5c's
 * UI starts wiring through it. Each module is tested in isolation
 * elsewhere; this file pins the chain.
 */

import { planDraftFromImport } from '@/utils/planFromImport';
import { performSwap, BENCH, checkRosterIntegrity } from '@/utils/planSwapEngine';
import { applyDraftToGame } from '@/utils/planApply';
import { FORMATION_PRESETS } from '@/config/formationPresets';
import type { Player } from '@/types';

const preset5v5 = FORMATION_PRESETS.find((p) => p.id === '5v5-2-2')!;

const roster: Player[] = [
  { id: 'p1', name: 'Alice', isGoalie: true, jerseyNumber: '1' },
  { id: 'p2', name: 'Bob', isGoalie: false, jerseyNumber: '2' },
  { id: 'p3', name: 'Cara', isGoalie: false, jerseyNumber: '3' },
  { id: 'p4', name: 'Dan', isGoalie: false, jerseyNumber: '4' },
  { id: 'p5', name: 'Eve', isGoalie: false, jerseyNumber: '5' },
  { id: 'p6', name: 'Frank', isGoalie: false, jerseyNumber: '6' },
];

describe('planner foundation pipeline — import → swap × N → apply', () => {
  it('imports a clean plan, swaps a couple of slots, and produces a Rule-3-compliant Apply result', () => {
    // 1. Import: the standalone exports a 5v5 starting XI.
    const importResult = planDraftFromImport(
      {
        startingXI: { GK: 'p1', LB: 'p2', RB: 'p3', LF: 'p4', RF: 'p5' },
      },
      roster,
    );
    expect(importResult.unknownPlayerIds).toEqual([]);
    expect(importResult.duplicateRoleAssignments).toEqual([]);

    // 2. Coach realises Bob (p2) plays better up front than Dan (p4).
    let draft = importResult.draft;
    draft = performSwap(draft, { source: 'LB', target: 'LF' });
    expect(draft.startingXI).toMatchObject({
      LB: 'p4', // Dan moved back
      LF: 'p2', // Bob moved up
    });

    // 3. Coach swaps in the bench player Frank for the goalkeeper Alice.
    draft = performSwap(draft, {
      source: BENCH,
      target: 'GK',
      benchPlayerId: 'p6',
    });
    expect(draft.startingXI.GK).toBe('p6');
    // Alice (p1) is now on the bench; Frank (p6) is gone from the bench.
    expect(draft.bench).toContain('p1');
    expect(draft.bench).not.toContain('p6');

    // 4. Roster integrity stays clean across the chain.
    expect(checkRosterIntegrity(draft, roster.map((p) => p.id))).toEqual({
      duplicates: [],
      missing: [],
      orphans: [],
    });

    // 5. Apply: the result resolves coords, surfaces no unknowns, and
    //    satisfies CLAUDE.md Rule 3 when the caller sets availablePlayers
    //    to the full roster.
    const applied = applyDraftToGame(draft, preset5v5, roster);
    expect(applied.unknownRoles).toEqual([]);
    expect(applied.unknownPlayerIds).toEqual([]);
    expect(applied.playersOnField).toHaveLength(5);

    const onFieldIds = new Set(applied.playersOnField.map((p) => p.id));
    const selectedSet = new Set(applied.selectedPlayerIds);
    const rosterIds = new Set(roster.map((p) => p.id));
    // playersOnField ⊆ selectedPlayerIds
    for (const id of onFieldIds) expect(selectedSet.has(id)).toBe(true);
    // selectedPlayerIds ⊆ roster (caller-supplied availablePlayers)
    for (const id of selectedSet) expect(rosterIds.has(id)).toBe(true);

    // 6. Player metadata survived the chain.
    const newGk = applied.playersOnField.find((p) => p.id === 'p6');
    expect(newGk?.name).toBe('Frank');
    expect(newGk?.relX).toBe(0.5);
    expect(newGk?.relY).toBe(0.95);
  });

  it('imports a malformed plan with duplicates and unknowns, and apply still produces a valid result', () => {
    // The standalone exported a plan with a duplicate role assignment
    // (p1 in both GK and LB) and one player that isn't in the roster
    // (pStranger). The pipeline should clean it up without throwing.
    const importResult = planDraftFromImport(
      {
        startingXI: {
          GK: 'p1',
          LB: 'p1',           // duplicate — drop with first-seen-wins
          RB: 'p2',
          LF: 'pStranger',    // not in roster — drop and surface
          RF: 'p3',
        },
      },
      roster,
    );
    expect(importResult.unknownPlayerIds).toEqual(['pStranger']);
    expect(importResult.duplicateRoleAssignments).toEqual([
      { role: 'LB', playerId: 'p1' },
    ]);
    expect(importResult.draft.startingXI).toEqual({
      GK: 'p1',
      RB: 'p2',
      RF: 'p3',
    });

    // Apply still succeeds; LB and LF are empty role slots.
    const applied = applyDraftToGame(importResult.draft, preset5v5, roster);
    expect(applied.playersOnField).toHaveLength(3);
    expect(applied.unknownRoles).toEqual([]);
    expect(applied.unknownPlayerIds).toEqual([]);
  });
});
