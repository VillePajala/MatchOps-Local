import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningTotalsTable from '../PlanningTotalsTable';
import type { Player } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';
import type { PlanDraft } from '@/utils/planSwapEngine';

const buildGame = (
  mins = 10,
  opponentName?: string,
): AppState =>
  ({
    teamId: 't1',
    teamName: 'Pepo',
    numberOfPeriods: 2,
    periodDurationMinutes: mins,
    opponentName,
  }) as unknown as AppState;

const baseDraft = (): PlanDraft => ({
  startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
  bench: ['p3'],
  scheduledSubs: [],
});

const renderTable = (
  overrides: Partial<React.ComponentProps<typeof PlanningTotalsTable>> = {},
) => {
  const props: React.ComponentProps<typeof PlanningTotalsTable> = {
    drafts: { g1: baseDraft(), g2: baseDraft() },
    gameIds: ['g1', 'g2'],
    savedGames: {
      g1: buildGame(10, 'Lions'),
      g2: buildGame(10, 'Tigers'),
    } as SavedGamesCollection,
    roster: [
      { id: 'p0', name: 'Alice' },
      { id: 'p1', name: 'Bob', nickname: 'Bobby' },
      { id: 'p2', name: 'Cara' },
      { id: 'p3', name: 'Dan' },
    ] as Player[],
    ...overrides,
  };
  return render(
    <I18nextProvider i18n={i18n}>
      <PlanningTotalsTable {...props} />
    </I18nextProvider>,
  );
};

describe('PlanningTotalsTable', () => {
  it('renders the empty-state when no players are referenced', () => {
    renderTable({
      drafts: { g1: { startingXI: {}, bench: [], scheduledSubs: [] } },
      gameIds: ['g1'],
    });
    expect(
      screen.getByTestId('planning-totals-table-empty'),
    ).toBeInTheDocument();
  });

  it('renders one row per referenced player, sorted by total ascending', () => {
    // p1 plays only 5min in g1 (subbed off at 300s) and 0 in g2 → 300s.
    // p3 came on at 300s in g1 only → 900s.
    // p0/p2 play full both games → 2400s each.
    // Tie-break by playerId (p0 before p2) for stability.
    renderTable({
      drafts: {
        g1: {
          startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
          bench: ['p3'],
          scheduledSubs: [
            { id: 's1', timeSeconds: 300, inPlayer: 'p3', positionRole: 'LB' },
          ],
        },
        g2: { startingXI: { GK: 'p0', RB: 'p2' }, bench: [], scheduledSubs: [] },
      },
    });
    const rows = screen
      .getAllByTestId(/^planning-totals-row-/)
      .map((r) =>
        r.getAttribute('data-testid')?.replace('planning-totals-row-', ''),
      );
    // Full order asserts the tie-break rule: identical totals stay
    // in playerId-ascending order so the rendering is deterministic
    // across renders.
    expect(rows).toEqual(['p1', 'p3', 'p0', 'p2']);
  });

  it('renders an opponent-name column header when available, fallback to G{N}', () => {
    renderTable({
      savedGames: {
        g1: buildGame(10, 'Lions'),
        g2: buildGame(10) /* no opponentName */,
      } as SavedGamesCollection,
    });
    expect(screen.getByRole('columnheader', { name: 'Lions' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'G2' })).toBeInTheDocument();
  });

  it('marks excluded game columns with line-through + an excluded-title hint', () => {
    renderTable({
      includedGameIds: ['g1'], // g2 excluded
    });
    const g2Header = screen.getByRole('columnheader', { name: 'Tigers' });
    expect(g2Header.getAttribute('data-included')).toBe('false');
    expect(g2Header.className).toMatch(/line-through/);
    // Title text reveals the excluded state for sighted users.
    expect(g2Header.getAttribute('title')).toMatch(/excluded/i);
  });

  it('cells in excluded columns are line-through but still display the seconds', () => {
    renderTable({
      includedGameIds: ['g1'],
    });
    // p0 played the full 1200s in g2 even though it's excluded.
    const cell = screen.getByTestId('planning-totals-cell-p0-g2');
    expect(cell.className).toMatch(/line-through/);
    expect(cell.textContent ?? '').toMatch(/20:00/); // 1200s = 20:00
  });

  it('zero-second cells in INCLUDED games get the rose flag', () => {
    renderTable({
      drafts: {
        g1: { startingXI: { GK: 'p0' }, bench: [], scheduledSubs: [] },
        g2: { startingXI: { GK: 'p1' }, bench: [], scheduledSubs: [] },
      },
    });
    const p0InG2 = screen.getByTestId('planning-totals-cell-p0-g2');
    // p0 didn't play g2 → 0:00 in an included game → rose styling.
    expect(p0InG2.className).toMatch(/bg-rose-/);
    expect(p0InG2.textContent ?? '').toMatch(/0:00/);
  });

  it('renders a "GK" badge for players who started AND ended at goalkeeper', () => {
    renderTable();
    const cell = screen.getByTestId('planning-totals-cell-p0-g1');
    expect(cell.getAttribute('data-gk')).toBe('full');
    expect(cell.textContent ?? '').toMatch(/GK/);
  });

  it('omits the GK badge for partial-game GK rotation', () => {
    renderTable({
      drafts: {
        g1: {
          startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
          bench: ['p3'],
          scheduledSubs: [
            { id: 's1', timeSeconds: 600, inPlayer: 'p3', positionRole: 'GK' },
          ],
        },
        g2: baseDraft(),
      },
    });
    const cell = screen.getByTestId('planning-totals-cell-p0-g1');
    expect(cell.getAttribute('data-gk')).toBe('partial');
    // Only the time renders for the partial badge — no "GK" label.
    expect(cell.querySelector('[aria-label]')).toBeNull();
  });

  it('total cell carries the band classification on data-band', () => {
    // p1 played 5min in g1 only → ~25% of fair share → below-half band.
    renderTable({
      drafts: {
        g1: {
          startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
          bench: ['p3'],
          scheduledSubs: [
            { id: 's1', timeSeconds: 300, inPlayer: 'p3', positionRole: 'LB' },
          ],
        },
        g2: { startingXI: { GK: 'p0', RB: 'p2' }, bench: [], scheduledSubs: [] },
      },
    });
    const p1Row = screen.getByTestId('planning-totals-row-p1');
    expect(p1Row.getAttribute('data-band')).toBe('below-half');
  });
});
