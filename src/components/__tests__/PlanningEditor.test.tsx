import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Fixture lineup uses 8 field players (incl. GK), which the editor's
// default-preset heuristic maps to the first 8v8 preset (8v8-3-3-1).
describe('PlanningEditor', () => {
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

  it('switching formation prompts only when the draft diverged from the loaded snap', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      renderEditor();
      const select = screen.getByRole('combobox');
      // Pristine draft → no prompt.
      await act(async () => {
        fireEvent.change(select, { target: { value: '5v5-2-2' } });
      });
      expect(confirmSpy).not.toHaveBeenCalled();
      // Make a manual edit: swap GK ↔ next role. Draft now diverges.
      const roles = getPresetById('5v5-2-2')!.roles ?? [];
      await act(async () => {
        fireEvent.click(screen.getByTestId(`planning-editor-role-${roles[0].name}`));
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId(`planning-editor-role-${roles[1].name}`));
      });
      // Now switching prompts; confirm=false → switch is cancelled.
      await act(async () => {
        fireEvent.change(select, { target: { value: '5v5-1-2-1' } });
      });
      expect(confirmSpy).toHaveBeenCalled();
      // Editor stayed on 5v5-2-2 because confirm returned false.
      expect(select).toHaveValue('5v5-2-2');
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
