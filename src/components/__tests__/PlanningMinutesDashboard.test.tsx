import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningMinutesDashboard from '../PlanningMinutesDashboard';
import type { Player } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';

const buildGame = (mins = 10, periods = 2): AppState =>
  ({
    teamId: 't1',
    teamName: 'Pepo',
    numberOfPeriods: periods,
    periodDurationMinutes: mins,
  }) as unknown as AppState;

const renderDashboard = (
  overrides: Partial<React.ComponentProps<typeof PlanningMinutesDashboard>> = {},
) => {
  const props: React.ComponentProps<typeof PlanningMinutesDashboard> = {
    draft: {
      startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
      bench: ['p3'],
      scheduledSubs: [],
    },
    gameIds: ['g1'],
    savedGames: { g1: buildGame() } as SavedGamesCollection,
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
      <PlanningMinutesDashboard {...props} />
    </I18nextProvider>,
  );
};

describe('PlanningMinutesDashboard', () => {
  it('renders the empty-state when no players are referenced', () => {
    renderDashboard({
      draft: { startingXI: {}, bench: [], scheduledSubs: [] },
    });
    expect(
      screen.getByTestId('planning-minutes-dashboard-empty'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('planning-minutes-dashboard'),
    ).not.toBeInTheDocument();
  });

  it('renders the empty-state when gameIds is empty', () => {
    renderDashboard({ gameIds: [] });
    expect(
      screen.getByTestId('planning-minutes-dashboard-empty'),
    ).toBeInTheDocument();
  });

  it('renders one entry per referenced player with mm:ss totals', () => {
    renderDashboard();
    expect(
      screen.getByTestId('planning-minutes-dashboard'),
    ).toBeInTheDocument();
    // 3 starters, no subs → each plays the full 20:00.
    for (const pid of ['p0', 'p1', 'p2']) {
      const row = screen.getByTestId(
        `planning-minutes-dashboard-entry-${pid}`,
      );
      expect(row).toHaveTextContent('20:00');
    }
    // p3 is bench-only with no sub appearance — must NOT render.
    expect(
      screen.queryByTestId('planning-minutes-dashboard-entry-p3'),
    ).not.toBeInTheDocument();
  });

  it('uses nickname over name when both are present', () => {
    renderDashboard();
    expect(
      screen.getByTestId('planning-minutes-dashboard-entry-p1'),
    ).toHaveTextContent('Bobby');
  });

  it('tags rows with their fair-share band via data-band', () => {
    // 3 starters, all play the full game, fair-share = full game.
    // Every band → "fair".
    renderDashboard();
    expect(
      screen.getByTestId('planning-minutes-dashboard-entry-p0'),
    ).toHaveAttribute('data-band', 'fair');
  });

  it('marks a heavy-over player with the heavy-over band', () => {
    // 4 players in the rotation, but p3 plays both LB AND RB across
    // sub events — they accumulate well over their fair share.
    // Subs at t=0 swap p1→p3 and p2→p3 so p3 plays the full 20 min
    // on both LB and RB = 40 min, while p1+p2 each play 0 min.
    // Fair share = (1200 * 3 starters) / 2 active = 1800s.
    // p3 = 2400s, ratio = 2400/1800 = 1.33 → heavy-over.
    renderDashboard({
      draft: {
        startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
        bench: ['p3'],
        scheduledSubs: [
          { id: 's1', timeSeconds: 0, inPlayer: 'p3', positionRole: 'LB' },
          { id: 's2', timeSeconds: 0, inPlayer: 'p3', positionRole: 'RB' },
        ],
      },
    });
    expect(
      screen.getByTestId('planning-minutes-dashboard-entry-p3'),
    ).toHaveAttribute('data-band', 'heavy-over');
  });

  it('marks an under-share player with the under band', () => {
    // p1 plays 0-5 min then p3 takes over. p1 ends at 5min/20min total
    // = 25% of fair share = under band.
    renderDashboard({
      draft: {
        startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
        bench: ['p3'],
        scheduledSubs: [
          { id: 's1', timeSeconds: 300, inPlayer: 'p3', positionRole: 'LB' },
        ],
      },
    });
    expect(
      screen.getByTestId('planning-minutes-dashboard-entry-p1'),
    ).toHaveAttribute('data-band', 'under');
  });

  it('aggregates across multiple games using the same draft', () => {
    renderDashboard({
      gameIds: ['g1', 'g2', 'g3'],
      savedGames: {
        g1: buildGame(),
        g2: buildGame(),
        g3: buildGame(),
      } as SavedGamesCollection,
    });
    // 20:00 per game × 3 games = 1:00:00 per starter.
    expect(
      screen.getByTestId('planning-minutes-dashboard-entry-p0'),
    ).toHaveTextContent('60:00');
  });

  it('sorts entries by total seconds descending', () => {
    // p1 plays only 5 min; p0 + p2 play the full 20 min. p1 should
    // render last in the grid.
    renderDashboard({
      draft: {
        startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
        bench: ['p3'],
        scheduledSubs: [
          { id: 's1', timeSeconds: 300, inPlayer: 'p3', positionRole: 'LB' },
        ],
      },
    });
    const rows = screen
      .getByTestId('planning-minutes-dashboard-grid')
      .querySelectorAll('li');
    const ids = [...rows].map((r) =>
      r.getAttribute('data-testid')?.replace(
        'planning-minutes-dashboard-entry-',
        '',
      ),
    );
    // p3 plays 15m, p0 & p2 play 20m, p1 plays 5m. The two 20-minute
    // entries (p0, p2) tie for first; their relative order depends on
    // referencedPlayerIds insertion order (now sorted by id, so p0
    // before p2). Then p3 (15m), then p1 (5m).
    expect(ids).toEqual(['p0', 'p2', 'p3', 'p1']);
  });

  it('exposes an aria-label per row that bundles player + mm:ss + percent', () => {
    renderDashboard();
    const row = screen.getByTestId(
      'planning-minutes-dashboard-entry-p0',
    );
    expect(row).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/Alice.*20:00.*100/),
    );
  });
});
