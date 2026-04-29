import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningEditor from '../PlanningEditor';
import type { AppState, SavedGamesCollection } from '@/types/game';
import type { Player } from '@/types';
import { getPresetById } from '@/config/formationPresets';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// 8v8-3-3-1 is the editor's heuristic default for an 8-player lineup
// (the first 8v8 preset by id), so the test fixture and the editor
// agree on which preset to render.
const PRESET_ID = '8v8-3-3-1';
const PRESET = getPresetById(PRESET_ID)!;

// Build a roster of N players with deterministic ids (`p0`, `p1`, …).
const makeRoster = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    nickname: `P${i}`,
    isGoalie: i === 0,
  })) as Player[];

// Place each preset role's first-N players at the canonical coords so the
// editor's roleForCoord snap finds them. Uses preset.roles to drive the
// fixture, so it never drifts from formationPresets.ts.
const makeGameWithLineup = (
  roster: Player[],
  benchIds: string[] = [],
): AppState => {
  const playersOnField: Player[] = [];
  for (const [idx, role] of (PRESET.roles ?? []).entries()) {
    const player = roster[idx];
    if (!player) continue;
    playersOnField.push({ ...player, relX: role.relX, relY: role.relY });
  }
  const onFieldIds = playersOnField.map((p) => p.id);
  return {
    teamName: 'Pepo',
    teamId: 'team_a',
    opponentName: 'Opp',
    gameDate: '2026-04-28',
    numberOfPeriods: 2,
    periodDurationMinutes: 25,
    playersOnField,
    selectedPlayerIds: [...onFieldIds, ...benchIds],
    availablePlayers: roster,
  } as unknown as AppState;
};

const renderEditor = (
  overrides: Partial<React.ComponentProps<typeof PlanningEditor>> = {},
) => {
  const roster = makeRoster(11);
  const game = makeGameWithLineup(roster, ['p8', 'p9', 'p10']);
  const props: React.ComponentProps<typeof PlanningEditor> = {
    gameIds: ['g1'],
    savedGames: { g1: game } as SavedGamesCollection,
    roster,
    onBack: jest.fn(),
    onApplied: jest.fn(),
    applyToGame: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <PlanningEditor {...props} />
      </I18nextProvider>,
    ),
    props,
  };
};

// Fixture lineup uses 8 field players (incl. GK), which the editor's
// default-preset heuristic maps to the first 8v8 preset (8v8-3-3-1).
describe('PlanningEditor', () => {
  it('renders the pitch with one button per preset role', () => {
    renderEditor();
    const pitch = screen.getByTestId('planning-editor-pitch');
    expect(pitch).toBeInTheDocument();
    // 8v8-3-3-1 has 8 roles incl. GK.
    expect(pitch.querySelectorAll('button').length).toBe(PRESET.roles!.length);
  });

  it('snaps loaded players onto their canonical roles', () => {
    renderEditor();
    // Each preset role's button should show the corresponding player's
    // nickname (P0..P7 for the 8 field roles).
    for (let i = 0; i < (PRESET.roles ?? []).length; i++) {
      const role = (PRESET.roles ?? [])[i];
      const btn = screen.getByTestId(`planning-editor-role-${role.name}`);
      expect(btn).toHaveTextContent(`P${i}`);
    }
  });

  it('lists bench players from selectedPlayerIds not on the field', () => {
    renderEditor();
    const bench = screen.getByTestId('planning-editor-bench');
    // p8, p9, p10 are bench-only.
    expect(bench).toHaveTextContent('P8');
    expect(bench).toHaveTextContent('P9');
    expect(bench).toHaveTextContent('P10');
  });

  it('off-formation players (legacy coord drift) fall through to the bench', () => {
    const roster = makeRoster(8);
    // Place p1 at coords no role of the preset matches within tolerance
    // (~mid-pitch but offset enough to miss roleForCoord). 0.99,0.99 is
    // safely outside any 8v8 role.
    const game = {
      ...makeGameWithLineup(roster),
      playersOnField: [
        { ...roster[0], relX: PRESET.roles![0].relX, relY: PRESET.roles![0].relY },
        { ...roster[1], relX: 0.99, relY: 0.99 },
      ],
      selectedPlayerIds: roster.map((p) => p.id),
    } as unknown as AppState;
    renderEditor({
      savedGames: { g1: game } as SavedGamesCollection,
      roster,
    });
    const bench = screen.getByTestId('planning-editor-bench');
    // p1 had no role match — it lands on the bench, visible to the coach.
    expect(bench).toHaveTextContent('P1');
  });

  it('tap-to-swap: tap two roles swaps their players', async () => {
    renderEditor();
    const role0 = (PRESET.roles ?? [])[0]; // GK
    const role1 = (PRESET.roles ?? [])[1];
    const before0 = screen
      .getByTestId(`planning-editor-role-${role0.name}`)
      .textContent;
    const before1 = screen
      .getByTestId(`planning-editor-role-${role1.name}`)
      .textContent;
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role0.name}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role1.name}`));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId(`planning-editor-role-${role0.name}`),
      ).toHaveTextContent(before1!.replace(role1.name, '').trim());
    });
    expect(
      screen.getByTestId(`planning-editor-role-${role1.name}`),
    ).toHaveTextContent(before0!.replace(role0.name, '').trim());
  });

  it('tap-to-swap: tapping the same role twice deselects without swapping', async () => {
    renderEditor();
    const role = (PRESET.roles ?? [])[1];
    const before = screen
      .getByTestId(`planning-editor-role-${role.name}`)
      .textContent;
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    expect(
      screen.getByTestId(`planning-editor-role-${role.name}`).className,
    ).toContain('bg-amber-400');
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    expect(
      screen.getByTestId(`planning-editor-role-${role.name}`).className,
    ).not.toContain('bg-amber-400');
    expect(
      screen.getByTestId(`planning-editor-role-${role.name}`).textContent,
    ).toBe(before);
  });

  it('tap-to-swap: tap role then bench player brings bench player on', async () => {
    renderEditor();
    const role = (PRESET.roles ?? [])[1]; // skip GK to keep semantics obvious
    const fieldPlayerBefore = screen
      .getByTestId(`planning-editor-role-${role.name}`)
      .textContent;
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-bench-p8'));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId(`planning-editor-role-${role.name}`),
      ).toHaveTextContent('P8');
    });
    expect(screen.getByTestId('planning-editor-bench')).toHaveTextContent(
      fieldPlayerBefore!.replace(role.name, '').trim(),
    );
  });

  it('tap on empty role does not enter selection mode', async () => {
    // Build a game whose first preset role (GK) is empty.
    const roster = makeRoster(8);
    const playersOnField = (PRESET.roles ?? [])
      .slice(1) // drop the first role so it stays empty
      .map((role, idx) => ({
        ...roster[idx + 1],
        relX: role.relX,
        relY: role.relY,
      })) as Player[];
    const game = {
      ...makeGameWithLineup(roster),
      playersOnField,
      selectedPlayerIds: roster.map((p) => p.id),
    } as unknown as AppState;
    renderEditor({
      savedGames: { g1: game } as SavedGamesCollection,
      roster,
    });
    const role0 = (PRESET.roles ?? [])[0];
    const role1 = (PRESET.roles ?? [])[1];
    // Tap empty role0 (no-op), then role1 (arms it), then role0
    // (should now move role1's player into role0). We assert role1
    // ends empty — proving role0's first tap didn't arm selection.
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role0.name}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role1.name}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role0.name}`));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId(`planning-editor-role-${role1.name}`),
      ).toHaveTextContent('—');
    });
  });

  it('tap-to-swap: bench player → empty role fills the role with no displacement', async () => {
    // GK role left empty; p0 and p8 land on the bench (in selectedPlayerIds
    // but not on field). Tapping bench p8 then the empty GK role should
    // place p8 at GK and shrink the bench by one — no displacement.
    const roster = makeRoster(9);
    const playersOnField = (PRESET.roles ?? [])
      .slice(1)
      .map((role, idx) => ({
        ...roster[idx + 1],
        relX: role.relX,
        relY: role.relY,
      })) as Player[];
    const game = {
      ...makeGameWithLineup(roster),
      playersOnField,
      selectedPlayerIds: roster.map((p) => p.id),
    } as unknown as AppState;
    renderEditor({
      savedGames: { g1: game } as SavedGamesCollection,
      roster,
    });
    const gkRole = (PRESET.roles ?? [])[0];
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-bench-p8'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${gkRole.name}`));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId(`planning-editor-role-${gkRole.name}`),
      ).toHaveTextContent('P8');
    });
    const benchText = screen.getByTestId('planning-editor-bench').textContent ?? '';
    expect(benchText).not.toMatch(/\bP8\b/);
  });

  // ----- Drag-drop (desktop). Touch devices don't fire drag events,
  // so tap-to-swap remains the mobile-only path. -----

  it('drag-drop: dragging role A onto role B swaps their players', async () => {
    renderEditor();
    const role0 = (PRESET.roles ?? [])[0];
    const role1 = (PRESET.roles ?? [])[1];
    const before0 = screen.getByTestId(`planning-editor-role-${role0.name}`).textContent;
    const before1 = screen.getByTestId(`planning-editor-role-${role1.name}`).textContent;
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId(`planning-editor-role-${role0.name}`));
    });
    await act(async () => {
      fireEvent.dragOver(screen.getByTestId(`planning-editor-role-${role1.name}`));
    });
    await act(async () => {
      fireEvent.drop(screen.getByTestId(`planning-editor-role-${role1.name}`));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId(`planning-editor-role-${role0.name}`),
      ).toHaveTextContent(before1!.replace(role1.name, '').trim());
    });
    expect(
      screen.getByTestId(`planning-editor-role-${role1.name}`),
    ).toHaveTextContent(before0!.replace(role0.name, '').trim());
  });

  it('drag-drop: dragging a bench player onto a role brings them on', async () => {
    renderEditor();
    const role = (PRESET.roles ?? [])[1];
    const displacedLabel = screen
      .getByTestId(`planning-editor-role-${role.name}`)
      .textContent!.replace(role.name, '')
      .trim();
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId('planning-editor-bench-p8'));
    });
    await act(async () => {
      fireEvent.drop(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId(`planning-editor-role-${role.name}`),
      ).toHaveTextContent('P8');
    });
    // Previous occupant should now be on the bench tail.
    expect(screen.getByTestId('planning-editor-bench')).toHaveTextContent(
      displacedLabel,
    );
  });

  it('drag-drop: dragging a role onto the bench drawer sends the player to bench', async () => {
    renderEditor();
    const role = (PRESET.roles ?? [])[1];
    const fieldPlayerLabel = screen
      .getByTestId(`planning-editor-role-${role.name}`)
      .textContent!.replace(role.name, '')
      .trim();
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    await act(async () => {
      fireEvent.dragOver(screen.getByTestId('planning-editor-bench-drawer'));
    });
    await act(async () => {
      fireEvent.drop(screen.getByTestId('planning-editor-bench-drawer'));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId(`planning-editor-role-${role.name}`),
      ).toHaveTextContent('—');
    });
    expect(screen.getByTestId('planning-editor-bench')).toHaveTextContent(
      fieldPlayerLabel,
    );
  });

  it('drag-drop: drop on self is a no-op', async () => {
    renderEditor();
    const role = (PRESET.roles ?? [])[1];
    const before = screen.getByTestId(`planning-editor-role-${role.name}`).textContent;
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    await act(async () => {
      fireEvent.drop(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    expect(
      screen.getByTestId(`planning-editor-role-${role.name}`).textContent,
    ).toBe(before);
  });

  it('drag-drop: hovering the drag source over itself does not show conflicting visuals', async () => {
    // While dragging, the source button has opacity-50 (dim). If the
    // drop-target ring also fires when hovering self, the user sees
    // two contradictory cues (dim = "you're holding it" vs ring =
    // "drop here"). Ring should be suppressed when isOver === isSrc.
    renderEditor();
    const role = (PRESET.roles ?? [])[1];
    const button = screen.getByTestId(`planning-editor-role-${role.name}`);
    await act(async () => {
      fireEvent.dragStart(button);
    });
    expect(button.className).toContain('opacity-50');
    await act(async () => {
      fireEvent.dragOver(button);
    });
    // Still dimmed (still the source)…
    expect(button.className).toContain('opacity-50');
    // …but the drop-target ring is suppressed on the source itself.
    // Other roles use ring on dragover; the source must not.
    const ringMatches = button.className.match(/\bring-amber-200\b/g) ?? [];
    expect(ringMatches.length).toBe(0);
  });

  it('drag-drop: dragging a role onto a specific bench player swaps them (does not bubble to bench-drawer)', async () => {
    // Codex P1: a drop on a bench <button> bubbles to the bench-drawer
    // <div> ancestor. Both handlers read the same captured dragSource
    // (stale closure), so without stopPropagation the second handler
    // performs performDrop(BENCH) and benches the just-placed player —
    // role ends up empty instead of holding the bench player.
    renderEditor();
    const role = (PRESET.roles ?? [])[1];
    const fieldPlayerLabel = screen
      .getByTestId(`planning-editor-role-${role.name}`)
      .textContent!.replace(role.name, '')
      .trim();
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    await act(async () => {
      fireEvent.drop(screen.getByTestId('planning-editor-bench-p8'));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId(`planning-editor-role-${role.name}`),
      ).toHaveTextContent('P8');
    });
    expect(screen.getByTestId('planning-editor-bench')).toHaveTextContent(
      fieldPlayerLabel,
    );
  });

  it('drag-drop: dragLeave keeps the highlight when moving from drawer into a child', async () => {
    // Browsers fire dragleave on the parent <div> before dragover on
    // a descendant <button>. Without the relatedTarget contains-guard
    // the ring would disappear for a frame each time the cursor
    // crossed an internal boundary. Verify the guard stays the
    // clear, and that a real exit (relatedTarget outside) still clears.
    renderEditor();
    const role = (PRESET.roles ?? [])[1];
    const drawer = screen.getByTestId('planning-editor-bench-drawer');
    const childBench = screen.getByTestId('planning-editor-bench-p8');
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    await act(async () => {
      fireEvent.dragOver(drawer);
    });
    await waitFor(() => {
      expect(drawer.className).toContain('ring-amber-200');
    });
    // jsdom's DragEvent constructor doesn't honour the `relatedTarget`
    // init option — fireEvent's plain object is dropped silently — so
    // we build the event explicitly and pin relatedTarget via
    // defineProperty before dispatching.
    const buildDragLeave = (related: Node) => {
      const ev = new MouseEvent('dragleave', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'relatedTarget', { value: related });
      return ev;
    };
    await act(async () => {
      fireEvent(drawer, buildDragLeave(childBench));
    });
    expect(drawer.className).toContain('ring-amber-200');
    await act(async () => {
      fireEvent(drawer, buildDragLeave(document.body));
    });
    expect(drawer.className).not.toContain('ring-amber-200');
  });

  it('drag-drop: bench → bench dragOver does NOT highlight the bench drawer', async () => {
    // Without the bench <button>'s onDragOver guard, hovering one bench
    // player while dragging another previously fired the drawer's
    // 'bench-drawer' highlight even though the drop is a no-op. The
    // bench drawer wrapper's ring class only applies when dragOverTarget
    // === 'bench-drawer'; assert it stays off for bench → bench.
    renderEditor();
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId('planning-editor-bench-p8'));
    });
    await act(async () => {
      fireEvent.dragOver(screen.getByTestId('planning-editor-bench-p9'));
    });
    expect(
      screen.getByTestId('planning-editor-bench-drawer').className,
    ).not.toContain('ring-amber-200');
  });

  it('drag-drop: bench → empty role brings the bench player on with no displacement', async () => {
    // GK role left empty so the bench → role drop has no field
    // occupant to displace. Bench should shrink by one; GK takes p8.
    const roster = makeRoster(9);
    const playersOnField = (PRESET.roles ?? [])
      .slice(1)
      .map((role, idx) => ({
        ...roster[idx + 1],
        relX: role.relX,
        relY: role.relY,
      })) as Player[];
    const game = {
      ...makeGameWithLineup(roster),
      playersOnField,
      selectedPlayerIds: roster.map((p) => p.id),
    } as unknown as AppState;
    renderEditor({
      savedGames: { g1: game } as SavedGamesCollection,
      roster,
    });
    const gkRole = (PRESET.roles ?? [])[0];
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId('planning-editor-bench-p8'));
    });
    await act(async () => {
      fireEvent.drop(screen.getByTestId(`planning-editor-role-${gkRole.name}`));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId(`planning-editor-role-${gkRole.name}`),
      ).toHaveTextContent('P8');
    });
    expect(screen.getByTestId('planning-editor-bench').textContent).not.toMatch(
      /\bP8\b/,
    );
  });

  it('drag-drop: bench → drawer (bench source) clears tap-selection so it does not leak into the next tap', async () => {
    // 1. tap-select a bench player (this sets `selected`)
    // 2. start a drag from a different bench player (bench → bench)
    // 3. drop on the bench drawer area (early-return branch)
    // 4. tap a role — should NOT swap, because both selected and
    //    dragSource must be clean by now. Without setSelected(null) in
    //    the early return, the role tap would auto-swap with the
    //    originally tap-selected bench player.
    renderEditor();
    const role = (PRESET.roles ?? [])[1];
    const beforeRoleText = screen
      .getByTestId(`planning-editor-role-${role.name}`)
      .textContent;
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-bench-p9'));
    });
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId('planning-editor-bench-p8'));
    });
    await act(async () => {
      fireEvent.drop(screen.getByTestId('planning-editor-bench-drawer'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    // Role contents must be unchanged — first tap after the drag
    // should arm a fresh selection, not auto-swap with a stale one.
    expect(
      screen.getByTestId(`planning-editor-role-${role.name}`).textContent,
    ).toBe(beforeRoleText);
  });

  it('drag-drop: bench → bench drag is a no-op', async () => {
    renderEditor();
    const before = screen.getByTestId('planning-editor-bench').textContent;
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId('planning-editor-bench-p8'));
    });
    await act(async () => {
      fireEvent.dragOver(screen.getByTestId('planning-editor-bench-p9'));
    });
    await act(async () => {
      fireEvent.drop(screen.getByTestId('planning-editor-bench-p9'));
    });
    expect(screen.getByTestId('planning-editor-bench').textContent).toBe(before);
  });

  it('drag-drop: cancelled drag does not leak a prior tap-selection into the next tap', async () => {
    // Sequence the bug needs to fail without the handleDragStart fix:
    //   1. tap-select role A           → selected = { target: A }
    //   2. start dragging role B       → dragSource = { target: B }
    //   3. cancel the drag (dragEnd)
    //   4. tap role C                  → must NOT swap A↔C
    // With handleDragStart calling clearDragState, step 2 already
    // wipes the prior tap-selection so the cancel path is safe.
    renderEditor();
    const role0 = (PRESET.roles ?? [])[0];
    const role1 = (PRESET.roles ?? [])[1];
    const role2 = (PRESET.roles ?? [])[2];
    const beforeRole0 = screen.getByTestId(`planning-editor-role-${role0.name}`).textContent;
    const beforeRole2 = screen.getByTestId(`planning-editor-role-${role2.name}`).textContent;
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role0.name}`));
    });
    await act(async () => {
      fireEvent.dragStart(screen.getByTestId(`planning-editor-role-${role1.name}`));
    });
    await act(async () => {
      fireEvent.dragEnd(screen.getByTestId(`planning-editor-role-${role1.name}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role2.name}`));
    });
    expect(
      screen.getByTestId(`planning-editor-role-${role0.name}`).textContent,
    ).toBe(beforeRole0);
    expect(
      screen.getByTestId(`planning-editor-role-${role2.name}`).textContent,
    ).toBe(beforeRole2);
  });

  it('drag-drop: dragend without drop clears drag state', async () => {
    renderEditor();
    const role = (PRESET.roles ?? [])[1];
    const sourceEl = screen.getByTestId(`planning-editor-role-${role.name}`);
    await act(async () => {
      fireEvent.dragStart(sourceEl);
    });
    expect(sourceEl.className).toContain('opacity-50');
    await act(async () => {
      fireEvent.dragEnd(sourceEl);
    });
    // Drag visuals cleared even though no drop landed.
    expect(sourceEl.className).not.toContain('opacity-50');
    // A subsequent unrelated tap should still work — proves dragSource
    // didn't leak into the tap-selected state.
    const role0 = (PRESET.roles ?? [])[0];
    const before0 = screen.getByTestId(`planning-editor-role-${role0.name}`).textContent;
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role0.name}`));
    });
    expect(
      screen.getByTestId(`planning-editor-role-${role0.name}`).textContent,
    ).toBe(before0);
  });

  it('drag-drop: role buttons are not draggable while applying', async () => {
    // Stall applyToGame on a never-resolving promise to keep isApplying
    // pinned to true through the assertion.
    const applyToGame = jest.fn().mockReturnValue(new Promise(() => {}));
    renderEditor({ applyToGame });
    fireEvent.click(screen.getByTestId('planning-editor-apply'));
    await waitFor(() => {
      expect(screen.getByTestId('planning-editor-apply')).toBeDisabled();
    });
    const role = (PRESET.roles ?? [])[1];
    expect(
      screen.getByTestId(`planning-editor-role-${role.name}`),
    ).toHaveAttribute('draggable', 'false');
    expect(
      screen.getByTestId('planning-editor-bench-p8'),
    ).toHaveAttribute('draggable', 'false');
  });

  it('drag-drop: role buttons are not draggable while the formation-change banner is open', async () => {
    renderEditor();
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-2-2' } });
    });
    const fivev5Roles = getPresetById('5v5-2-2')!.roles ?? [];
    await act(async () => {
      fireEvent.click(
        screen.getByTestId(`planning-editor-role-${fivev5Roles[0].name}`),
      );
    });
    await act(async () => {
      fireEvent.click(
        screen.getByTestId(`planning-editor-role-${fivev5Roles[1].name}`),
      );
    });
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-1-2-1' } });
    });
    expect(
      screen.getByTestId('planning-editor-preset-confirm'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`planning-editor-role-${fivev5Roles[0].name}`),
    ).toHaveAttribute('draggable', 'false');
  });

  it('drag-drop: empty role buttons are not draggable', () => {
    // Build a game whose first preset role is empty.
    const roster = makeRoster(8);
    const playersOnField = (PRESET.roles ?? [])
      .slice(1)
      .map((role, idx) => ({
        ...roster[idx + 1],
        relX: role.relX,
        relY: role.relY,
      })) as Player[];
    const game = {
      ...makeGameWithLineup(roster),
      playersOnField,
      selectedPlayerIds: roster.map((p) => p.id),
    } as unknown as AppState;
    renderEditor({
      savedGames: { g1: game } as SavedGamesCollection,
      roster,
    });
    const emptyRole = (PRESET.roles ?? [])[0];
    expect(
      screen.getByTestId(`planning-editor-role-${emptyRole.name}`),
    ).toHaveAttribute('draggable', 'false');
  });

  it('Apply calls applyToGame for each picked game and then onApplied', async () => {
    const applyToGame = jest.fn().mockResolvedValue(undefined);
    const onApplied = jest.fn();
    const roster = makeRoster(11);
    const game1 = makeGameWithLineup(roster, ['p8']);
    const game2 = makeGameWithLineup(roster, ['p9']);
    renderEditor({
      gameIds: ['g1', 'g2'],
      savedGames: { g1: game1, g2: game2 } as SavedGamesCollection,
      roster,
      applyToGame,
      onApplied,
    });
    fireEvent.click(screen.getByTestId('planning-editor-apply'));
    await waitFor(() => {
      expect(onApplied).toHaveBeenCalledTimes(1);
    });
    expect(applyToGame).toHaveBeenCalledTimes(2);
    // Each call carries playersOnField + selectedPlayerIds + scheduledSubs.
    const [firstId, firstUpdates] = applyToGame.mock.calls[0];
    expect(firstId).toBe('g1');
    expect(firstUpdates).toHaveProperty('playersOnField');
    expect(firstUpdates).toHaveProperty('selectedPlayerIds');
    expect(firstUpdates).toHaveProperty('scheduledSubs');
  });

  it('Apply writes scheduledSubs from the timeline to every picked game', async () => {
    // Add a sub via the timeline form, then Apply, and verify the sub
    // lands on each picked game's scheduledSubs with status: 'pending'.
    const applyToGame = jest.fn().mockResolvedValue(undefined);
    const onApplied = jest.fn();
    const roster = makeRoster(11);
    const game1 = makeGameWithLineup(roster, ['p8']);
    const game2 = makeGameWithLineup(roster, ['p9']);
    renderEditor({
      gameIds: ['g1', 'g2'],
      savedGames: { g1: game1, g2: game2 } as SavedGamesCollection,
      roster,
      applyToGame,
      onApplied,
    });
    const role1 = (PRESET.roles ?? [])[1].name;
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-add'));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-time'), {
        target: { value: '08:00' },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-role'), {
        target: { value: role1 },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-in'), {
        target: { value: 'p8' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-form-save'));
    });
    fireEvent.click(screen.getByTestId('planning-editor-apply'));
    await waitFor(() => {
      expect(onApplied).toHaveBeenCalledTimes(1);
    });
    // Both games receive the same scheduledSubs entry.
    for (const call of applyToGame.mock.calls) {
      const subs = call[1].scheduledSubs;
      expect(subs).toHaveLength(1);
      expect(subs[0]).toMatchObject({
        timeSeconds: 480,
        positionRole: role1,
        inPlayer: 'p8',
        status: 'pending',
      });
    }
  });

  it('Apply warning banner reports unreachable subs (sub past per-game end)', async () => {
    // g1 is 40 min, g2 is 10 min. A sub at 14:00 reaches g1 but is
    // past g2's end. We inject the sub directly via game1.scheduledSubs
    // (hydrated into the draft) so the form-level min-duration guard
    // doesn't block it; applyDraftToGame's per-game filter siphons it
    // into g2's unreachableSubs and the banner surfaces the count.
    const roster = makeRoster(11);
    const role1 = (PRESET.roles ?? [])[1].name;
    const game1: AppState = {
      ...makeGameWithLineup(roster, ['p8']),
      numberOfPeriods: 2,
      periodDurationMinutes: 20, // 40 min total
      scheduledSubs: [
        {
          id: 's_far',
          timeSeconds: 840, // 14:00 — reachable in g1 only
          outPlayer: 'p1',
          inPlayer: 'p8',
          positionRole: role1,
          status: 'pending',
        },
      ],
    } as AppState;
    const game2: AppState = {
      ...makeGameWithLineup(roster, ['p8']),
      numberOfPeriods: 2,
      periodDurationMinutes: 5, // 10 min total
    } as AppState;
    const applyToGame = jest.fn().mockResolvedValue(undefined);
    const onApplied = jest.fn();
    renderEditor({
      gameIds: ['g1', 'g2'],
      savedGames: { g1: game1, g2: game2 } as SavedGamesCollection,
      roster,
      applyToGame,
      onApplied,
    });
    fireEvent.click(screen.getByTestId('planning-editor-apply'));
    await waitFor(() => {
      expect(screen.getByTestId('planning-editor-warning')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('planning-editor-warning').textContent,
    ).toMatch(/could not be applied|joita ei voitu soveltaa/i);
    expect(onApplied).not.toHaveBeenCalled();
    // Apply still ran for both games — the dropped sub doesn't
    // prevent persistence of the lineup.
    expect(applyToGame).toHaveBeenCalledTimes(2);
  });

  it('Apply shows the warning banner and does not call onApplied when a game drops players or roles', async () => {
    // Build a game whose availablePlayers excludes one of the bench
    // players in the draft (p10). applyDraftToGame will drop p10 from
    // selectedPlayerIds and surface it via unknownPlayerIds; the editor
    // saves the rest and stays open with the warning banner.
    const roster = makeRoster(11);
    const game = makeGameWithLineup(roster, ['p8', 'p9', 'p10']);
    // Narrow the per-game roster: drop p10 entirely.
    const narrowAvailable = roster.filter((p) => p.id !== 'p10');
    const game1: AppState = {
      ...(game as AppState),
      availablePlayers: narrowAvailable,
    } as AppState;
    const applyToGame = jest.fn().mockResolvedValue(undefined);
    const onApplied = jest.fn();
    renderEditor({
      gameIds: ['g1'],
      savedGames: { g1: game1 } as SavedGamesCollection,
      roster,
      applyToGame,
      onApplied,
    });
    fireEvent.click(screen.getByTestId('planning-editor-apply'));
    await waitFor(() => {
      expect(screen.getByTestId('planning-editor-warning')).toBeInTheDocument();
    });
    // The save still ran for the games that succeeded.
    expect(applyToGame).toHaveBeenCalledTimes(1);
    // But the modal should not auto-close so the coach acknowledges.
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('Apply reports partial-save count when a later game fails', async () => {
    // Two-game plan: g1 saves OK, g2 throws. The error banner must
    // reflect the 1-of-2 success so the coach knows what's already
    // persisted before retrying.
    const applyToGame = jest
      .fn()
      .mockResolvedValueOnce(undefined) // g1 OK
      .mockRejectedValueOnce(new Error('network down')); // g2 fails
    const onApplied = jest.fn();
    const roster = makeRoster(11);
    const game1 = makeGameWithLineup(roster, ['p8']);
    const game2 = makeGameWithLineup(roster, ['p9']);
    renderEditor({
      gameIds: ['g1', 'g2'],
      savedGames: { g1: game1, g2: game2 } as SavedGamesCollection,
      roster,
      applyToGame,
      onApplied,
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-apply'));
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Saved 1 of 2|Tallennettu 1\/2/i,
    );
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('Apply error banner carries forward warning counters from games that succeeded before the throw', async () => {
    // g1 succeeds with unknown-players warning (per-game roster narrows
    // p10), g2 throws. Coach sees both: "Saved 1 of 2…" AND the unknown-
    // players note about the earlier successful save.
    const roster = makeRoster(11);
    const game1Base = makeGameWithLineup(roster, ['p8', 'p9', 'p10']);
    const game1: AppState = {
      ...(game1Base as AppState),
      availablePlayers: roster.filter((p) => p.id !== 'p10'),
    } as AppState;
    const game2 = makeGameWithLineup(roster, ['p8']);
    const applyToGame = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network down'));
    const onApplied = jest.fn();
    renderEditor({
      gameIds: ['g1', 'g2'],
      savedGames: { g1: game1, g2: game2 } as SavedGamesCollection,
      roster,
      applyToGame,
      onApplied,
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-apply'));
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    const alertText = screen.getByRole('alert').textContent ?? '';
    expect(alertText).toMatch(/Saved 1 of 2|Tallennettu 1\/2/i);
    expect(alertText).toMatch(
      /players outside their roster|kokoonpanon ulkopuolisia pelaajia/i,
    );
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('Apply error banner does not over-count drops from the throwing game', async () => {
    // g1 saves cleanly (no drops). g2 has narrowed availablePlayers (drops
    // p10) AND its applyToGame throws. Without the post-await guard, g2's
    // drops would be counted as a saved warning even though g2 never
    // persisted. Assert the alert reflects only g1's clean save.
    const roster = makeRoster(11);
    const game1 = makeGameWithLineup(roster, ['p8']);
    const game2Base = makeGameWithLineup(roster, ['p8', 'p9', 'p10']);
    const game2: AppState = {
      ...(game2Base as AppState),
      availablePlayers: roster.filter((p) => p.id !== 'p10'),
    } as AppState;
    const applyToGame = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network down'));
    const onApplied = jest.fn();
    renderEditor({
      gameIds: ['g1', 'g2'],
      savedGames: { g1: game1, g2: game2 } as SavedGamesCollection,
      roster,
      applyToGame,
      onApplied,
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-apply'));
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    const alertText = screen.getByRole('alert').textContent ?? '';
    expect(alertText).toMatch(/Saved 1 of 2|Tallennettu 1\/2/i);
    expect(alertText).not.toMatch(
      /players outside their roster|kokoonpanon ulkopuolisia pelaajia/i,
    );
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('Apply surfaces a sanitized error and does not call onApplied on failure', async () => {
    // Raw error text from the mutation must never reach the user (CLAUDE
    // Quality Bar). The banner shows the translated fallback only.
    const applyToGame = jest
      .fn()
      .mockRejectedValueOnce(new Error('Supabase: relation "games" does not exist'));
    const onApplied = jest.fn();
    renderEditor({ applyToGame, onApplied });
    fireEvent.click(screen.getByTestId('planning-editor-apply'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Apply failed|Käyttö epäonnistui/i,
    );
    // Raw mutation message never leaks.
    expect(screen.getByRole('alert')).not.toHaveTextContent(/Supabase/i);
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('Back invokes onBack', async () => {
    const { props } = renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /back|takaisin/i }));
    });
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('switching formation rebuilds the draft and clears any selection', async () => {
    renderEditor();
    // ST is unique to 8v8-3-3-1 (5v5-2-2 has GK/LB/RB/LF/RF, no ST).
    const ROLE_8V8_ONLY = 'ST';
    await act(async () => {
      fireEvent.click(
        screen.getByTestId(`planning-editor-role-${ROLE_8V8_ONLY}`),
      );
    });
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-2-2' } });
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId(`planning-editor-role-${ROLE_8V8_ONLY}`),
      ).not.toBeInTheDocument();
    });
  });

  it('switching formation shows inline banner only when the draft diverged from the loaded snap', async () => {
    renderEditor();
    const select = screen.getByRole('combobox');
    // Pristine draft → switch happens immediately, no banner.
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-2-2' } });
    });
    expect(
      screen.queryByTestId('planning-editor-preset-confirm'),
    ).not.toBeInTheDocument();
    expect(select).toHaveValue('5v5-2-2');
    // Make a manual edit: swap two roles. Draft now diverges.
    const roles = getPresetById('5v5-2-2')!.roles ?? [];
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${roles[0].name}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${roles[1].name}`));
    });
    // Try switching → banner appears, select stays put.
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-1-2-1' } });
    });
    expect(
      screen.getByTestId('planning-editor-preset-confirm'),
    ).toBeInTheDocument();
    expect(select).toHaveValue('5v5-2-2');
    // Cancel keeps the current preset.
    await act(async () => {
      fireEvent.click(
        screen.getByTestId('planning-editor-preset-confirm-cancel'),
      );
    });
    expect(
      screen.queryByTestId('planning-editor-preset-confirm'),
    ).not.toBeInTheDocument();
    expect(select).toHaveValue('5v5-2-2');
  });

  it('role and bench buttons are disabled while the formation-change banner is open', async () => {
    renderEditor();
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-2-2' } });
    });
    const roles = getPresetById('5v5-2-2')!.roles ?? [];
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${roles[0].name}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${roles[1].name}`));
    });
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-1-2-1' } });
    });
    expect(
      screen.getByTestId('planning-editor-preset-confirm'),
    ).toBeInTheDocument();
    // While the banner is open, no further swaps should be possible.
    expect(
      screen.getByTestId(`planning-editor-role-${roles[0].name}`),
    ).toBeDisabled();
    expect(screen.getByTestId('planning-editor-bench-p4')).toBeDisabled();
  });

  it('formation change with only scheduled-sub edits prompts the confirm banner (does not silently discard subs)', async () => {
    // Bug 1: handlePresetChange's diverged check only inspected
    // startingXI; if the user added a sub without touching the pitch,
    // the change fired silently and applyPresetChange re-hydrated
    // from the saved game, wiping the sub. Verify the confirm
    // banner shows up so the coach can choose.
    renderEditor();
    const role1 = (PRESET.roles ?? [])[1].name;
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-add'));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-time'), {
        target: { value: '08:00' },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-role'), {
        target: { value: role1 },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-in'), {
        target: { value: 'p8' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-form-save'));
    });
    // Sub is on the draft; pitch is untouched. Switching formation
    // should prompt confirm rather than silently re-hydrate.
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-2-2' } });
    });
    expect(
      screen.getByTestId('planning-editor-preset-confirm'),
    ).toBeInTheDocument();
  });

  it('formation change with only an in-place sub edit also prompts the confirm banner', async () => {
    // Bug 2 follow-up: editing an existing sub's time (or any other
    // field) preserves its id and the array length. Before this fix
    // the diverged check missed it (length unchanged, id still in
    // baseline set) → silent re-hydration discarded the edit. Now
    // the check inspects each field by id-keyed lookup.
    const role1 = (PRESET.roles ?? [])[1].name;
    const roster = makeRoster(11);
    // Hydrate the editor with an existing sub via game1.scheduledSubs;
    // draftFromGame strips status and brings the rest onto the draft.
    const game1: AppState = {
      ...makeGameWithLineup(roster, ['p8']),
      scheduledSubs: [
        {
          id: 's1',
          timeSeconds: 480,
          outPlayer: 'p1',
          inPlayer: 'p8',
          positionRole: role1,
          status: 'pending',
        },
      ],
    } as AppState;
    renderEditor({
      gameIds: ['g1'],
      savedGames: { g1: game1 } as SavedGamesCollection,
      roster,
    });
    // Open the existing sub and bump its time.
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-sub-edit-s1'));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-time'), {
        target: { value: '12:00' },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-in'), {
        target: { value: 'p8' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-form-save'));
    });
    // Switch formation — confirm banner must show.
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-2-2' } });
    });
    expect(
      screen.getByTestId('planning-editor-preset-confirm'),
    ).toBeInTheDocument();
  });

  it('confirming the formation-change banner switches the preset', async () => {
    renderEditor();
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-2-2' } });
    });
    const roles = getPresetById('5v5-2-2')!.roles ?? [];
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${roles[0].name}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${roles[1].name}`));
    });
    await act(async () => {
      fireEvent.change(select, { target: { value: '5v5-1-2-1' } });
    });
    expect(
      screen.getByTestId('planning-editor-preset-confirm'),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        screen.getByTestId('planning-editor-preset-confirm-accept'),
      );
    });
    await waitFor(() => {
      expect(select).toHaveValue('5v5-1-2-1');
    });
    expect(
      screen.queryByTestId('planning-editor-preset-confirm'),
    ).not.toBeInTheDocument();
  });

  it('warning banner exposes a Done button that calls onApplied', async () => {
    // Bug fix: previously the warning state had no exit. Coach must
    // be able to acknowledge and close the modal.
    const roster = makeRoster(11);
    const game = makeGameWithLineup(roster, ['p8', 'p9', 'p10']);
    const game1: AppState = {
      ...(game as AppState),
      // Drop p10 from the per-game roster → unknownPlayerIds fires.
      availablePlayers: roster.filter((p) => p.id !== 'p10'),
    } as AppState;
    const onApplied = jest.fn();
    renderEditor({
      gameIds: ['g1'],
      savedGames: { g1: game1 } as SavedGamesCollection,
      roster,
      onApplied,
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-apply'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('planning-editor-warning')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-warning-done'));
    });
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('bench → bench tap moves the selection to the new bench player', async () => {
    // Coverage for the bench-to-bench branch of handleBenchTap. The
    // engine treats this as a no-op swap; the UI just retargets the
    // selection so a subsequent role tap acts on the latest bench
    // choice. We assert by tapping role afterwards and verifying
    // the second-tapped bench player ends up on the field.
    renderEditor();
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-bench-p8'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-bench-p9'));
    });
    const role = (PRESET.roles ?? [])[1];
    await act(async () => {
      fireEvent.click(screen.getByTestId(`planning-editor-role-${role.name}`));
    });
    // Selection retargeted to p9 → p9 lands on the role.
    await waitFor(() => {
      expect(
        screen.getByTestId(`planning-editor-role-${role.name}`),
      ).toHaveTextContent('P9');
    });
  });

  it('Apply surfaces the missing-game warning when a picked id is no longer in savedGames', async () => {
    // Picker selected g1 + g2, but g2 has been deleted (cloud sync,
    // multi-tab race, IndexedDB eviction). The editor must NOT
    // auto-close as if both saved; instead surface the gap.
    const roster = makeRoster(11);
    const game1 = makeGameWithLineup(roster, ['p8']);
    const applyToGame = jest.fn().mockResolvedValue(undefined);
    const onApplied = jest.fn();
    renderEditor({
      gameIds: ['g1', 'g2'],
      // g2 missing on purpose.
      savedGames: { g1: game1 } as SavedGamesCollection,
      roster,
      applyToGame,
      onApplied,
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-editor-apply'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('planning-editor-warning')).toBeInTheDocument();
    });
    // The save still ran for g1.
    expect(applyToGame).toHaveBeenCalledTimes(1);
    expect(applyToGame).toHaveBeenCalledWith('g1', expect.anything());
    // Modal does not auto-close.
    expect(onApplied).not.toHaveBeenCalled();
    // Warning text mentions the skipped game.
    expect(screen.getByTestId('planning-editor-warning')).toHaveTextContent(
      /no longer available|ei ollut enää saatavilla/i,
    );
  });
});
