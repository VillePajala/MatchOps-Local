/**
 * The modal hands its teams to the player view.
 *
 * @critical - one prop, and the only thing connecting the "which team was this
 * game for?" picker to real team data. Everything else about that feature is
 * covered inside PlayerStatsView, which cannot see whether anyone passes it
 * anything. Missing wiring under correct logic has already caused two rounds
 * of review findings in this area.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../../tests/utils/test-utils';
import GameStatsModal from './GameStatsModal';
import type { Player, SavedGamesCollection } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
    i18n: { language: 'fi' },
  }),
}));

jest.mock('@/utils/seasons', () => ({ getSeasons: jest.fn().mockResolvedValue([]) }));
jest.mock('@/utils/tournaments', () => ({ getTournaments: jest.fn().mockResolvedValue([]) }));
jest.mock('@/utils/appSettings', () => ({ getAppSettings: jest.fn().mockResolvedValue({}) }));
jest.mock('@/utils/teams', () => ({
  getTeams: jest.fn().mockResolvedValue([{ id: 'teamA', name: 'FC Oma' }]),
}));
jest.mock('@/contexts/ToastProvider', () => ({
  __esModule: true,
  ...jest.requireActual('@/contexts/ToastProvider'),
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({
    userId: 'u1',
    isUserScoped: true,
    getStore: jest.fn().mockResolvedValue({
      getAllPlayerAdjustments: jest.fn().mockResolvedValue(new Map()),
    }),
  }),
}));

/** Reports back what the modal actually handed it. */
jest.mock('./PlayerStatsView', () => ({
  __esModule: true,
  default: ({ teams }: { teams?: Array<{ id: string; name: string }> }) => (
    <div data-testid="player-view-teams">{(teams ?? []).map(t => t.name).join(',')}</div>
  ),
}));

const players: Player[] = [
  { id: 'p1', name: 'Emma', jerseyNumber: '7', isGoalie: false, notes: '', receivedFairPlayCard: false },
];

describe('GameStatsModal - the player view gets the coach teams', () => {
  it('forwards the loaded teams, so the picker has something to offer', async () => {
    render(
      <GameStatsModal
        isOpen
        onClose={jest.fn()}
        teamName="Testi"
        opponentName="Vastus"
        gameDate="2026-09-07"
        homeScore={0}
        awayScore={0}
        homeOrAway="home"
        availablePlayers={players}
        gameEvents={[]}
        selectedPlayerIds={['p1']}
        savedGames={{} as SavedGamesCollection}
        currentGameId={null}
        masterRoster={players}
        initialSelectedPlayerId="p1"
        initialTab="player"
      />,
    );

    // The element renders immediately with no teams; the load is async, so
    // wait for the content rather than for the element.
    await waitFor(() =>
      expect(screen.getByTestId('player-view-teams')).toHaveTextContent('FC Oma'),
    );
  });
});
