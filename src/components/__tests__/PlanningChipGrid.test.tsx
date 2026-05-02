import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningChipGrid from '../PlanningChipGrid';
import type { Player } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';
import type { FormationPreset } from '@/config/formationPresets';

const buildPreset = (): FormationPreset =>
  ({
    id: '5v5-1-2-1',
    name: '1-2-1',
    labelKey: 'p.5v5_1_2_1',
    // FieldSize is a discriminated-union literal type; the surrounding
    // outer `as unknown as FormationPreset` already narrows the whole
    // object, but TS still flags this property in isolation.
    fieldSize: '5v5' as never,
    playerCount: 5,
    positions: [],
    roles: [
      { name: 'GK', relX: 0.5, relY: 0.92, stamina: 'preserved' },
      { name: 'LB', relX: 0.25, relY: 0.7, stamina: 'preferred' },
      { name: 'RB', relX: 0.75, relY: 0.7, stamina: 'preferred' },
      { name: 'CM', relX: 0.5, relY: 0.5, stamina: 'preferred' },
      { name: 'ST', relX: 0.5, relY: 0.25, stamina: 'preferred' },
    ],
  }) as unknown as FormationPreset;

const buildGame = (
  overrides: Partial<AppState> = {},
  mins = 10,
  periods = 2,
): AppState =>
  ({
    teamId: 't1',
    teamName: 'Pepo',
    opponentName: 'Opp',
    gameDate: '2026-04-30',
    numberOfPeriods: periods,
    periodDurationMinutes: mins,
    ...overrides,
  }) as unknown as AppState;

const renderGrid = (
  overrides: Partial<React.ComponentProps<typeof PlanningChipGrid>> = {},
) => {
  const props: React.ComponentProps<typeof PlanningChipGrid> = {
    draft: {
      startingXI: { GK: 'p0', LB: 'p1', RB: 'p2', CM: 'p3', ST: 'p4' },
      bench: ['p5'],
      scheduledSubs: [],
    },
    preset: buildPreset(),
    gameIds: ['g1'],
    savedGames: { g1: buildGame() } as SavedGamesCollection,
    roster: [
      { id: 'p0', name: 'Alice' },
      { id: 'p1', name: 'Bob', nickname: 'Bobby' },
      { id: 'p2', name: 'Cara' },
      { id: 'p3', name: 'Dan' },
      { id: 'p4', name: 'Eli' },
      { id: 'p5', name: 'Fran' },
    ] as Player[],
    ...overrides,
  };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <PlanningChipGrid {...props} />
      </I18nextProvider>,
    ),
    props,
  };
};

describe('PlanningChipGrid', () => {
  it('renders the empty-state when gameIds is empty', () => {
    renderGrid({ gameIds: [] });
    expect(
      screen.getByTestId('planning-chip-grid-empty'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('planning-chip-grid'),
    ).not.toBeInTheDocument();
  });

  it('renders the empty-state when the preset has no roles', () => {
    const presetNoRoles = { ...buildPreset(), roles: [] } as FormationPreset;
    renderGrid({ preset: presetNoRoles });
    expect(
      screen.getByTestId('planning-chip-grid-empty'),
    ).toBeInTheDocument();
  });

  it('renders one card per game with a row per role', () => {
    renderGrid({
      gameIds: ['g1', 'g2'],
      savedGames: {
        g1: buildGame(),
        g2: buildGame({ opponentName: 'Other' }),
      } as SavedGamesCollection,
    });
    expect(
      screen.getByTestId('planning-chip-grid-card-g1'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('planning-chip-grid-card-g2'),
    ).toBeInTheDocument();
    // 5 roles × 2 games = 10 role rows.
    for (const gid of ['g1', 'g2']) {
      for (const role of ['GK', 'LB', 'RB', 'CM', 'ST']) {
        expect(
          screen.getByTestId(`planning-chip-grid-role-${gid}-${role}`),
        ).toBeInTheDocument();
      }
    }
  });

  it('renders a placeholder row for an unassigned role', () => {
    renderGrid({
      // ST left unassigned in startingXI.
      draft: {
        startingXI: { GK: 'p0', LB: 'p1', RB: 'p2', CM: 'p3' },
        bench: ['p4', 'p5'],
        scheduledSubs: [],
      },
    });
    const row = screen.getByTestId('planning-chip-grid-role-g1-ST');
    expect(row).toHaveTextContent('—');
    // No chip button rendered for ST.
    expect(
      screen.queryByTestId(/planning-chip-grid-chip-g1-ST-/),
    ).not.toBeInTheDocument();
  });

  it('renders one chip per segment (sub events split a role into multiple chips)', () => {
    renderGrid({
      draft: {
        startingXI: { GK: 'p0', LB: 'p1', RB: 'p2', CM: 'p3', ST: 'p4' },
        bench: ['p5'],
        scheduledSubs: [
          { id: 's1', timeSeconds: 600, inPlayer: 'p5', positionRole: 'LB' },
        ],
      },
    });
    // LB row: p1 (0:00-10:00), p5 (10:00-20:00).
    expect(
      screen.getByTestId('planning-chip-grid-chip-g1-LB-p1'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('planning-chip-grid-chip-g1-LB-p5'),
    ).toBeInTheDocument();
  });

  it('chips show the player nickname when available', () => {
    renderGrid();
    // p1 has nickname "Bobby" — should appear instead of "Bob".
    expect(
      screen.getByTestId('planning-chip-grid-chip-g1-LB-p1'),
    ).toHaveTextContent('Bobby');
  });

  it('chips have aria-label with player + segment range', () => {
    renderGrid();
    const chip = screen.getByTestId('planning-chip-grid-chip-g1-GK-p0');
    expect(chip).toHaveAttribute(
      'aria-label',
      'Alice from 0:00 to 20:00',
    );
  });

  it('clicking a chip toggles the highlight on every chip of that player', () => {
    renderGrid({
      gameIds: ['g1', 'g2'],
      savedGames: {
        g1: buildGame(),
        g2: buildGame({ opponentName: 'Other' }),
      } as SavedGamesCollection,
    });
    const g1Chip = screen.getByTestId('planning-chip-grid-chip-g1-GK-p0');
    expect(g1Chip).toHaveAttribute('data-highlighted', 'false');
    expect(g1Chip).toHaveAttribute('aria-pressed', 'false');
    act(() => {
      fireEvent.click(g1Chip);
    });
    // Same player chip in the second game also flips to highlighted.
    expect(g1Chip).toHaveAttribute('data-highlighted', 'true');
    expect(g1Chip).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByTestId('planning-chip-grid-chip-g2-GK-p0'),
    ).toHaveAttribute('data-highlighted', 'true');
    // Other players are NOT highlighted.
    expect(
      screen.getByTestId('planning-chip-grid-chip-g1-LB-p1'),
    ).toHaveAttribute('data-highlighted', 'false');
  });

  it('multi-select: clicking two chips highlights both players', () => {
    renderGrid();
    act(() => {
      fireEvent.click(screen.getByTestId('planning-chip-grid-chip-g1-GK-p0'));
      fireEvent.click(screen.getByTestId('planning-chip-grid-chip-g1-LB-p1'));
    });
    expect(
      screen.getByTestId('planning-chip-grid-chip-g1-GK-p0'),
    ).toHaveAttribute('data-highlighted', 'true');
    expect(
      screen.getByTestId('planning-chip-grid-chip-g1-LB-p1'),
    ).toHaveAttribute('data-highlighted', 'true');
  });

  it('clicking a highlighted chip removes that player from the selection', () => {
    renderGrid();
    const chip = screen.getByTestId('planning-chip-grid-chip-g1-GK-p0');
    act(() => {
      fireEvent.click(chip);
    });
    expect(chip).toHaveAttribute('data-highlighted', 'true');
    act(() => {
      fireEvent.click(chip);
    });
    expect(chip).toHaveAttribute('data-highlighted', 'false');
  });

  it('Clear button resets the highlight set and disappears when empty', () => {
    renderGrid();
    // Clear button hidden when nothing highlighted.
    expect(
      screen.queryByTestId('planning-chip-grid-clear'),
    ).not.toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByTestId('planning-chip-grid-chip-g1-GK-p0'));
    });
    const clearBtn = screen.getByTestId('planning-chip-grid-clear');
    expect(clearBtn).toBeInTheDocument();
    expect(clearBtn).toHaveTextContent(/Clear highlight \(1\)/);
    act(() => {
      fireEvent.click(clearBtn);
    });
    // Clear hides again.
    expect(
      screen.queryByTestId('planning-chip-grid-clear'),
    ).not.toBeInTheDocument();
    // All chips back to non-highlighted.
    expect(
      screen.getByTestId('planning-chip-grid-chip-g1-GK-p0'),
    ).toHaveAttribute('data-highlighted', 'false');
  });

  it('renders a missing-game card when savedGames lacks the gameId', () => {
    renderGrid({
      gameIds: ['gx'],
      savedGames: {} as SavedGamesCollection,
    });
    expect(
      screen.getByTestId('planning-chip-grid-card-missing-gx'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('planning-chip-grid-card-gx'),
    ).not.toBeInTheDocument();
  });

  it('Enter / Space on a chip activates the highlight (keyboard a11y)', () => {
    renderGrid();
    const chip = screen.getByTestId('planning-chip-grid-chip-g1-GK-p0');
    // Native <button> elements activate via Enter / Space click
    // synthesis. fireEvent.click is what jsdom emits for a real
    // keyboard activation; this guards the chip renders as a real
    // button and not a div+role="button" that needs manual key
    // handling.
    expect(chip.tagName).toBe('BUTTON');
    act(() => {
      fireEvent.click(chip);
    });
    expect(chip).toHaveAttribute('data-highlighted', 'true');
  });

  it('gameLabel falls back to opponentName only when gameDate is missing', () => {
    renderGrid({
      savedGames: {
        g1: ({
          teamId: 't1',
          opponentName: 'OnlyOpp',
          // gameDate omitted
          numberOfPeriods: 2,
          periodDurationMinutes: 10,
        } as unknown) as AppState,
      } as SavedGamesCollection,
    });
    expect(
      screen.getByTestId('planning-chip-grid-card-g1'),
    ).toHaveTextContent('OnlyOpp');
  });

  it('gameLabel falls back to gameDate only when opponentName is missing', () => {
    renderGrid({
      savedGames: {
        g1: ({
          teamId: 't1',
          // opponentName omitted
          gameDate: '2026-04-30',
          numberOfPeriods: 2,
          periodDurationMinutes: 10,
        } as unknown) as AppState,
      } as SavedGamesCollection,
    });
    // Locale-formatted; just match the year + day to stay
    // locale-stable across CI.
    expect(
      screen.getByTestId('planning-chip-grid-card-g1'),
    ).toHaveTextContent(/2026/);
  });

  it('gameLabel falls back to the raw gameId when both opp and date are missing', () => {
    renderGrid({
      savedGames: {
        g1: ({
          teamId: 't1',
          // opponentName + gameDate both omitted
          numberOfPeriods: 2,
          periodDurationMinutes: 10,
        } as unknown) as AppState,
      } as SavedGamesCollection,
    });
    expect(
      screen.getByTestId('planning-chip-grid-card-g1'),
    ).toHaveTextContent('g1');
  });

  it('title attribute matches aria-label so hover and AT announcements never drift', () => {
    renderGrid();
    const chip = screen.getByTestId('planning-chip-grid-chip-g1-GK-p0');
    const aria = chip.getAttribute('aria-label');
    expect(aria).toBeTruthy();
    expect(chip).toHaveAttribute('title', aria!);
  });
});
