/**
 * Review 5.3: the stats rows carry the fair play award count - it was never filled,
 * so the Excel "Fair Play Awards" column was 0 for everyone and its sort did nothing.
 * Counted per game from the game's own player lists, as the player view does.
 * @critical
 */
import { renderHook } from '@testing-library/react';
import { useGameStats } from './useGameStats';
import type { GameStatsParams } from '../types';
import type { AppState, Player, PlayerStatAdjustment, SavedGamesCollection } from '@/types';

const player = (card = false): Player => ({ id: 'p1', name: 'John', receivedFairPlayCard: card } as Player);

const game = (card: boolean, over: Partial<AppState> = {}): AppState =>
  ({
    gameDate: '2024-12-01',
    isPlayed: true,
    selectedPlayerIds: ['p1'],
    availablePlayers: [player(card)],
    gameEvents: [],
    ...over,
  }) as unknown as AppState;

const fpAwards = (over: Partial<GameStatsParams>) => {
  const { result } = renderHook(() =>
    useGameStats({
      activeTab: 'overall',
      savedGames: {} as SavedGamesCollection,
      availablePlayers: [player()],
      selectedPlayerIds: ['p1'],
      localGameEvents: [],
      currentGameId: null,
      selectedSeasonIdFilter: 'all',
      selectedTournamentIdFilter: 'all',
      selectedTeamIdFilter: 'all',
      selectedSeriesIdFilter: 'all',
      selectedGameTypeFilter: 'all',
      selectedGenderFilter: 'all',
      selectedClubSeason: 'all',
      sortColumn: 'fpAwards',
      sortDirection: 'desc',
      filterText: '',
      playerPool: [player()],
      ...over,
    } as GameStatsParams),
  );
  return result.current.stats.find((p) => p.id === 'p1')?.fpAwards;
};

describe('useGameStats - fair play awards', () => {
  it('counts one award per game the player received the card in', () => {
    const savedGames = { g1: game(true), g2: game(false), g3: game(true) } as unknown as SavedGamesCollection;
    expect(fpAwards({ savedGames })).toBe(2);
  });

  it('counts a card held on the field list too', () => {
    const savedGames = { g1: game(false, { playersOnField: [player(true)] } as Partial<AppState>) } as unknown as SavedGamesCollection;
    expect(fpAwards({ savedGames })).toBe(1);
  });

  it('adds external-game fair play cards', () => {
    const savedGames = { g1: game(true) } as unknown as SavedGamesCollection;
    const adjustment = { id: 'a1', playerId: 'p1', gamesPlayedDelta: 1, goalsDelta: 0, assistsDelta: 0, fairPlayCardsDelta: 2, appliedAt: '2024-11-03T00:00:00Z' } as PlayerStatAdjustment;
    expect(fpAwards({ savedGames, adjustments: [adjustment] })).toBe(3);
  });

  it('the current-game view shows this game\'s card', () => {
    expect(fpAwards({ activeTab: 'currentGame', availablePlayers: [player(true)], currentGameId: 'g1' })).toBe(1);
  });
});
