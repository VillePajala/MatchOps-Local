import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningApplyPreview from '../PlanningApplyPreview';
import type { ApplyDiff } from '@/utils/applyPreview';
import type { Player } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';

const makeDiff = (overrides: Partial<ApplyDiff> = {}): ApplyDiff => ({
  gameId: 'g1',
  isEmpty: false,
  lineupAdded: [],
  lineupRemoved: [],
  lineupMoved: [],
  subsAdded: [],
  subsRemoved: [],
  subsModified: [],
  ...overrides,
});

const roster: Player[] = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob', nickname: 'Bobby' },
] as Player[];

// Only the fields the preview reads (opponentName, gameDate) are
// populated. The double cast suppresses the missing-AppState fields
// (gameEvents, scheduledSubs, etc.) — fine for a UI-only test.
const baseGame = (overrides: Partial<AppState> = {}): AppState => ({
  teamId: 't1',
  teamName: 'Pepo',
  opponentName: 'Opp',
  gameDate: '2026-04-30',
  numberOfPeriods: 2,
  periodDurationMinutes: 12,
  playersOnField: [],
  selectedPlayerIds: [],
  availablePlayers: [],
  ...overrides,
} as unknown as AppState);

const renderPreview = (
  overrides: Partial<React.ComponentProps<typeof PlanningApplyPreview>> = {},
) => {
  const props: React.ComponentProps<typeof PlanningApplyPreview> = {
    diffs: [makeDiff()],
    savedGames: { g1: baseGame() } as SavedGamesCollection,
    roster,
    isApplying: false,
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <PlanningApplyPreview {...props} />
      </I18nextProvider>,
    ),
    props,
  };
};

describe('PlanningApplyPreview', () => {
  it('renders the empty-state copy when every diff isEmpty', () => {
    renderPreview({
      diffs: [
        makeDiff({ gameId: 'g1', isEmpty: true }),
        makeDiff({ gameId: 'g2', isEmpty: true }),
      ],
      savedGames: {
        g1: baseGame(),
        g2: baseGame({ opponentName: 'Other' }),
      } as SavedGamesCollection,
    });
    expect(
      screen.getByTestId('planning-apply-preview-empty'),
    ).toBeInTheDocument();
    // No game cards rendered.
    expect(
      screen.queryByTestId('planning-apply-preview-card-g1'),
    ).not.toBeInTheDocument();
  });

  it('lists each non-empty game as a card with its change count', () => {
    renderPreview({
      diffs: [
        makeDiff({
          gameId: 'g1',
          lineupAdded: [{ playerId: 'p1', role: 'GK' }],
          lineupMoved: [{ playerId: 'p2', fromRole: 'LB', toRole: 'RB' }],
        }),
        makeDiff({ gameId: 'g2', isEmpty: true }),
      ],
      savedGames: {
        g1: baseGame(),
        g2: baseGame(),
      } as SavedGamesCollection,
    });
    expect(
      screen.getByTestId('planning-apply-preview-card-g1'),
    ).toBeInTheDocument();
    // g2 hidden because empty.
    expect(
      screen.queryByTestId('planning-apply-preview-card-g2'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Add Alice at GK/i)).toBeInTheDocument();
    expect(screen.getByText(/Move Bobby from LB to RB/i)).toBeInTheDocument();
  });

  it('renders an off-formation removal as "Remove {{player}} (off-formation)"', () => {
    renderPreview({
      diffs: [
        makeDiff({
          gameId: 'g1',
          lineupRemoved: [{ playerId: 'p1', role: undefined }],
        }),
      ],
    });
    // Locale-specific 'off-formation' or fi equivalent.
    expect(
      screen.getByText(/Remove Alice \(off-formation\)|Poista Alice/i),
    ).toBeInTheDocument();
  });

  it('default-checks every non-empty game; toggling unchecks one', () => {
    const onConfirm = jest.fn();
    renderPreview({
      diffs: [
        makeDiff({ gameId: 'g1', lineupAdded: [{ playerId: 'p1', role: 'GK' }] }),
        makeDiff({ gameId: 'g2', lineupAdded: [{ playerId: 'p2', role: 'LB' }] }),
      ],
      savedGames: {
        g1: baseGame(),
        g2: baseGame({ opponentName: 'Two' }),
      } as SavedGamesCollection,
      onConfirm,
    });
    const togglesG1 = screen.getByTestId(
      'planning-apply-preview-toggle-g1',
    ) as HTMLInputElement;
    expect(togglesG1.checked).toBe(true);
    fireEvent.click(togglesG1);
    expect(togglesG1.checked).toBe(false);

    fireEvent.click(screen.getByTestId('planning-apply-preview-confirm'));
    // Only g2 stayed checked.
    expect(onConfirm).toHaveBeenCalledWith(['g2']);
  });

  it('Cancel calls onCancel', () => {
    const onCancel = jest.fn();
    renderPreview({
      diffs: [
        makeDiff({ gameId: 'g1', lineupAdded: [{ playerId: 'p1', role: 'GK' }] }),
      ],
      onCancel,
    });
    fireEvent.click(screen.getByTestId('planning-apply-preview-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Confirm is disabled when no game is checked', () => {
    renderPreview({
      diffs: [
        makeDiff({ gameId: 'g1', lineupAdded: [{ playerId: 'p1', role: 'GK' }] }),
      ],
    });
    fireEvent.click(screen.getByTestId('planning-apply-preview-toggle-g1'));
    const confirm = screen.getByTestId(
      'planning-apply-preview-confirm',
    ) as HTMLButtonElement;
    expect(confirm).toBeDisabled();
  });

  it('Confirm shows "Applying…" and is disabled while isApplying', () => {
    renderPreview({
      diffs: [
        makeDiff({ gameId: 'g1', lineupAdded: [{ playerId: 'p1', role: 'GK' }] }),
      ],
      isApplying: true,
    });
    const confirm = screen.getByTestId(
      'planning-apply-preview-confirm',
    ) as HTMLButtonElement;
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveTextContent(/Applying|Käytetään/i);
  });

  it('renders sub diff entries: added / removed / modified', () => {
    renderPreview({
      diffs: [
        makeDiff({
          gameId: 'g1',
          subsAdded: [
            { id: 's1', timeSeconds: 600, inPlayer: 'p2', positionRole: 'LB' },
          ],
          subsRemoved: [
            {
              id: 's2',
              timeSeconds: 1200,
              inPlayer: 'p1',
              positionRole: 'GK',
              outPlayer: 'p2',
            },
          ],
          subsModified: [
            {
              before: {
                id: 's3',
                timeSeconds: 600,
                inPlayer: 'p1',
                positionRole: 'GK',
                outPlayer: 'p2',
              },
              after: {
                id: 's3',
                timeSeconds: 900,
                inPlayer: 'p1',
                positionRole: 'GK',
              },
            },
          ],
        }),
      ],
    });
    // 10:00 / 20:00 / 15:00 — formatTime renders mm:ss.
    expect(screen.getByText(/Schedule sub at 10:00/i)).toBeInTheDocument();
    // outPlayer must surface in the cancellation copy so the coach
    // sees who was scheduled to come off.
    expect(
      screen.getByText(/Cancel sub at 20:00.*on for Bobby/i),
    ).toBeInTheDocument();
    // The "before" half of the modified sub also has outPlayer; the
    // "after" half does not (DraftScheduledSub omits it).
    expect(screen.getByText(/Update sub:.*Alice↔Bobby.*→/i)).toBeInTheDocument();
  });

  it('renders the missing-games inline notice when missingGameIds is non-empty', () => {
    renderPreview({
      missingGameIds: ['gx', 'gy'],
      diffs: [
        makeDiff({
          gameId: 'g1',
          lineupAdded: [{ playerId: 'p1', role: 'GK' }],
        }),
      ],
    });
    const notice = screen.getByTestId('planning-apply-preview-missing');
    expect(notice).toBeInTheDocument();
    // The test i18n resources don't register the missingGames plural
    // pair, so t() falls back to the singular default value with
    // count=2 interpolated. Match either singular or plural form.
    expect(notice).toHaveTextContent(
      /2 games? can't be loaded|2 peliä ei voitu ladata/i,
    );
  });

  it('hides the missing-games notice when missingGameIds is empty', () => {
    renderPreview({
      diffs: [
        makeDiff({
          gameId: 'g1',
          lineupAdded: [{ playerId: 'p1', role: 'GK' }],
        }),
      ],
    });
    expect(
      screen.queryByTestId('planning-apply-preview-missing'),
    ).not.toBeInTheDocument();
  });

  it('renders the gameMissing fallback when savedGames lacks the gameId', () => {
    renderPreview({
      diffs: [
        makeDiff({
          gameId: 'missing-id',
          lineupAdded: [{ playerId: 'p1', role: 'GK' }],
        }),
      ],
      // savedGames intentionally omits 'missing-id' to exercise the
      // fallback path (cloud-sync race / IndexedDB eviction).
      savedGames: {} as SavedGamesCollection,
    });
    expect(
      screen.getByTestId('planning-apply-preview-card-missing-id'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Game \(missing-id\)|Peli \(missing-id\)/)).toBeInTheDocument();
  });
});
