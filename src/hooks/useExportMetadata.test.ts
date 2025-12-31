/**
 * Tests for useExportMetadata hook
 */

import { renderHook } from '@testing-library/react';
import { useExportMetadata } from './useExportMetadata';
import type { GameSessionState } from './useGameSessionReducer';
import type { Season, Tournament } from '@/types';

describe('useExportMetadata', () => {
  const mockGameSessionState: GameSessionState = {
    gameStatus: 'inProgress',
    homeScore: 2,
    awayScore: 1,
    teamName: 'Eagles',
    opponentName: 'Hawks',
    teamId: 'team-1',
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 25,
    currentPeriod: 1,
    completedIntervalDurations: [],
    gameDate: '2025-06-15',
    gameTime: '14:30',
    gameLocation: 'Central Stadium',
    ageGroup: 'U12',
    seasonId: 'season-1',
    tournamentId: 'tournament-1',
    subIntervalMinutes: 5,
    lastSubConfirmationTimeSeconds: 0,
    showPlayerNames: true,
    gameType: 'soccer',
    selectedPlayerIds: [],
    gamePersonnel: [],
    isTimerRunning: false,
    timeElapsedInSeconds: 0,
    nextSubDueTimeSeconds: 300,
    subAlertLevel: 'none',
    startTimestamp: null,
    gameEvents: [],
    gameNotes: '',
    demandFactor: 1,
  };

  const mockSeasons: Season[] = [
    {
      id: 'season-1',
      name: 'Spring 2025',
      gameType: 'soccer',
    },
    {
      id: 'season-2',
      name: 'Fall 2025',
      gameType: 'soccer',
    },
  ];

  const mockTournaments: Tournament[] = [
    {
      id: 'tournament-1',
      name: 'City Cup',
      gameType: 'soccer',
    },
  ];

  it('should return export metadata from game session state', () => {
    const { result } = renderHook(() =>
      useExportMetadata({
        gameSessionState: mockGameSessionState,
        seasons: mockSeasons,
        tournaments: mockTournaments,
        locale: 'en',
      })
    );

    expect(result.current).toEqual({
      teamName: 'Eagles',
      opponentName: 'Hawks',
      gameDate: '2025-06-15',
      gameTime: '14:30',
      gameLocation: 'Central Stadium',
      ageGroup: 'U12',
      seasonName: 'Spring 2025',
      tournamentName: 'City Cup',
      gameType: 'soccer',
      filenamePrefix: 'MatchOps',
      homeOrAway: 'home',
      locale: 'en',
      score: {
        home: 2,
        away: 1,
      },
    });
  });

  it('should resolve season name from seasons array', () => {
    const { result } = renderHook(() =>
      useExportMetadata({
        gameSessionState: {
          ...mockGameSessionState,
          seasonId: 'season-2',
          tournamentId: '',
        },
        seasons: mockSeasons,
        tournaments: [],
        locale: 'en',
      })
    );

    expect(result.current.seasonName).toBe('Fall 2025');
    expect(result.current.tournamentName).toBeUndefined();
  });

  it('should handle missing season/tournament', () => {
    const { result } = renderHook(() =>
      useExportMetadata({
        gameSessionState: {
          ...mockGameSessionState,
          seasonId: '',
          tournamentId: '',
        },
        seasons: mockSeasons,
        tournaments: mockTournaments,
        locale: 'en',
      })
    );

    expect(result.current.seasonName).toBeUndefined();
    expect(result.current.tournamentName).toBeUndefined();
  });

  it('should handle non-existent season/tournament IDs', () => {
    const { result } = renderHook(() =>
      useExportMetadata({
        gameSessionState: {
          ...mockGameSessionState,
          seasonId: 'non-existent',
          tournamentId: 'also-non-existent',
        },
        seasons: mockSeasons,
        tournaments: mockTournaments,
        locale: 'en',
      })
    );

    expect(result.current.seasonName).toBeUndefined();
    expect(result.current.tournamentName).toBeUndefined();
  });

  it('should use provided locale', () => {
    const { result } = renderHook(() =>
      useExportMetadata({
        gameSessionState: mockGameSessionState,
        seasons: mockSeasons,
        tournaments: mockTournaments,
        locale: 'fi',
      })
    );

    expect(result.current.locale).toBe('fi');
  });

  it('should use default filenamePrefix when not provided', () => {
    const { result } = renderHook(() =>
      useExportMetadata({
        gameSessionState: mockGameSessionState,
        seasons: mockSeasons,
        tournaments: mockTournaments,
        locale: 'en',
      })
    );

    expect(result.current.filenamePrefix).toBe('MatchOps');
  });

  it('should use custom filenamePrefix when provided', () => {
    const { result } = renderHook(() =>
      useExportMetadata({
        gameSessionState: mockGameSessionState,
        seasons: mockSeasons,
        tournaments: mockTournaments,
        locale: 'en',
        filenamePrefix: 'CustomApp',
      })
    );

    expect(result.current.filenamePrefix).toBe('CustomApp');
  });

  it('should update when game session state changes', () => {
    const { result, rerender } = renderHook(
      ({ gameSessionState }) =>
        useExportMetadata({
          gameSessionState,
          seasons: mockSeasons,
          tournaments: mockTournaments,
          locale: 'en',
        }),
      { initialProps: { gameSessionState: mockGameSessionState } }
    );

    expect(result.current.score).toEqual({ home: 2, away: 1 });

    rerender({
      gameSessionState: {
        ...mockGameSessionState,
        homeScore: 3,
        awayScore: 2,
      },
    });

    expect(result.current.score).toEqual({ home: 3, away: 2 });
  });

  it('should include all game metadata fields', () => {
    const { result } = renderHook(() =>
      useExportMetadata({
        gameSessionState: mockGameSessionState,
        seasons: mockSeasons,
        tournaments: mockTournaments,
        locale: 'en',
      })
    );

    // Verify all expected fields are present
    expect(result.current).toHaveProperty('teamName');
    expect(result.current).toHaveProperty('opponentName');
    expect(result.current).toHaveProperty('gameDate');
    expect(result.current).toHaveProperty('gameTime');
    expect(result.current).toHaveProperty('gameLocation');
    expect(result.current).toHaveProperty('ageGroup');
    expect(result.current).toHaveProperty('seasonName');
    expect(result.current).toHaveProperty('tournamentName');
    expect(result.current).toHaveProperty('gameType');
    expect(result.current).toHaveProperty('filenamePrefix');
    expect(result.current).toHaveProperty('homeOrAway');
    expect(result.current).toHaveProperty('locale');
    expect(result.current).toHaveProperty('score');
  });
});
