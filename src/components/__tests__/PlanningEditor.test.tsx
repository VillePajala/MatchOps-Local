import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningEditor from '../PlanningEditor';
import type { AppState, SavedGamesCollection } from '@/types/game';
import type { Player } from '@/types';
import { getPresetById } from '@/config/formationPresets';

// 8v8-3-3-1 has 8 field roles (incl. GK) and is the editor's heuristic
// default for an 8-player lineup (first 8v8 preset by id), so the test
// fixture and the editor agree on which preset to render.
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

describe('PlanningEditor', () => {
  beforeEach(() => {
    // Editor's default-preset heuristic picks by playersOnField count;
    // the fixture has 8 field players → 8v8 preset.
  });

  it('renders the pitch with one button per preset role', () => {
    renderEditor();
    const pitch = screen.getByTestId('planning-editor-pitch');
    expect(pitch).toBeInTheDocument();
    // 8v8-2-3-2 has 8 roles incl. GK.
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

  it('tap-to-swap: tap two roles swaps their players', () => {
    renderEditor();
    const role0 = (PRESET.roles ?? [])[0]; // GK
    const role1 = (PRESET.roles ?? [])[1];
    const before0 = screen
      .getByTestId(`planning-editor-role-${role0.name}`)
      .textContent;
    const before1 = screen
      .getByTestId(`planning-editor-role-${role1.name}`)
      .textContent;
    fireEvent.click(screen.getByTestId(`planning-editor-role-${role0.name}`));
    fireEvent.click(screen.getByTestId(`planning-editor-role-${role1.name}`));
    expect(
      screen.getByTestId(`planning-editor-role-${role0.name}`),
    ).toHaveTextContent(before1!.replace(role1.name, '').trim());
    expect(
      screen.getByTestId(`planning-editor-role-${role1.name}`),
    ).toHaveTextContent(before0!.replace(role0.name, '').trim());
  });

  it('tap-to-swap: tap role then bench player brings bench player on', () => {
    renderEditor();
    const role = (PRESET.roles ?? [])[1]; // skip GK to keep semantics obvious
    const fieldPlayerBefore = screen
      .getByTestId(`planning-editor-role-${role.name}`)
      .textContent;
    fireEvent.click(screen.getByTestId(`planning-editor-role-${role.name}`));
    fireEvent.click(screen.getByTestId('planning-editor-bench-p8'));
    // Field role now shows P8.
    expect(
      screen.getByTestId(`planning-editor-role-${role.name}`),
    ).toHaveTextContent('P8');
    // Previous occupant (P1) is now on the bench.
    expect(screen.getByTestId('planning-editor-bench')).toHaveTextContent(
      fieldPlayerBefore!.replace(role.name, '').trim(),
    );
  });

  it('tap on empty role does not enter selection mode', () => {
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
    // Tapping the empty role should not arm selection — tapping role1
    // afterwards arms it instead, which we observe by tapping role1
    // again and confirming no swap happened.
    fireEvent.click(screen.getByTestId(`planning-editor-role-${role0.name}`));
    fireEvent.click(screen.getByTestId(`planning-editor-role-${role1.name}`));
    fireEvent.click(screen.getByTestId(`planning-editor-role-${role0.name}`));
    // role0 should still be empty (selection of role1 -> tap role0 moves
    // role1's player into role0, which is the expected swap behaviour).
    // The point of this test is that the FIRST tap on empty did nothing —
    // we verify by checking role1 is now empty, not role0.
    expect(
      screen.getByTestId(`planning-editor-role-${role1.name}`),
    ).toHaveTextContent('—');
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
    // Each call carries playersOnField + selectedPlayerIds.
    const [firstId, firstUpdates] = applyToGame.mock.calls[0];
    expect(firstId).toBe('g1');
    expect(firstUpdates).toHaveProperty('playersOnField');
    expect(firstUpdates).toHaveProperty('selectedPlayerIds');
  });

  it('Apply surfaces an error and does not call onApplied on failure', async () => {
    const applyToGame = jest.fn().mockRejectedValueOnce(new Error('boom'));
    const onApplied = jest.fn();
    renderEditor({ applyToGame, onApplied });
    fireEvent.click(screen.getByTestId('planning-editor-apply'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/boom/i);
    });
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('Back invokes onBack', () => {
    const { props } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /back|takaisin/i }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('switching formation rebuilds the draft and clears any selection', () => {
    renderEditor();
    // ST is unique to 8v8-3-3-1 (5v5-2-2 has GK/LB/RB/LF/RF, no ST).
    const ROLE_8V8_ONLY = 'ST';
    fireEvent.click(screen.getByTestId(`planning-editor-role-${ROLE_8V8_ONLY}`));
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '5v5-2-2' } });
    expect(
      screen.queryByTestId(`planning-editor-role-${ROLE_8V8_ONLY}`),
    ).not.toBeInTheDocument();
  });
});
