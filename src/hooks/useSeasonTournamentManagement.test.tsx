/**
 * L.1: season/tournament CRUD mutations, moved here from useGameDataManagement
 * (their only consumer, SeasonTournamentManagementModal, renders in the
 * page-level ClubModalsHost). Mutation tests ported from
 * useGameDataManagement.test.tsx alongside the code move.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSeasonTournamentManagement } from './useSeasonTournamentManagement';
import type { Season, Tournament } from '@/types';

jest.mock('@/utils/logger', () => {
  const makeLogger = () => ({
    debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  });
  return { __esModule: true, default: makeLogger(), createLogger: makeLogger };
});
jest.mock('@/utils/masterRosterManager', () => ({
  getMasterRoster: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/utils/seasons');
jest.mock('@/utils/tournaments');

const TEST_USER_ID = 'test-user-123';
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({ userId: 'test-user-123' }),
}));

import {
  getSeasons,
  addSeason as utilAddSeason,
  updateSeason as utilUpdateSeason,
  deleteSeason as utilDeleteSeason,
} from '@/utils/seasons';
import {
  getTournaments,
  addTournament as utilAddTournament,
  updateTournament as utilUpdateTournament,
  deleteTournament as utilDeleteTournament,
} from '@/utils/tournaments';

const mockedGetSeasons = getSeasons as jest.MockedFunction<typeof getSeasons>;
const mockedGetTournaments = getTournaments as jest.MockedFunction<typeof getTournaments>;
const mockedAddSeason = utilAddSeason as jest.MockedFunction<typeof utilAddSeason>;
const mockedUpdateSeason = utilUpdateSeason as jest.MockedFunction<typeof utilUpdateSeason>;
const mockedDeleteSeason = utilDeleteSeason as jest.MockedFunction<typeof utilDeleteSeason>;
const mockedAddTournament = utilAddTournament as jest.MockedFunction<typeof utilAddTournament>;
const mockedUpdateTournament = utilUpdateTournament as jest.MockedFunction<typeof utilUpdateTournament>;
const mockedDeleteTournament = utilDeleteTournament as jest.MockedFunction<typeof utilDeleteTournament>;

const createSeason = (overrides: Partial<Season> = {}): Season => ({
  id: 'season-1',
  name: 'Test Season',
  ...overrides,
});

const createTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: 'tournament-1',
  name: 'Test Tournament',
  ...overrides,
});

describe('useSeasonTournamentManagement (L.1)', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    Wrapper.displayName = 'TestQueryClientWrapper';
    return Wrapper;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSeasons.mockResolvedValue([]);
    mockedGetTournaments.mockResolvedValue([]);
  });

  describe('season mutations', () => {
    it('should expose addSeason mutation', async () => {
      const newSeason = createSeason({ id: 'new-season', name: 'New Season' });
      mockedAddSeason.mockResolvedValue(newSeason);

      const { result } = renderHook(() => useSeasonTournamentManagement(), { wrapper: createWrapper() });

      await act(async () => {
        const addedSeason = await result.current.addSeasonMutation.mutateAsync({ name: 'New Season' });
        expect(addedSeason).toEqual(newSeason);
      });

      expect(mockedAddSeason).toHaveBeenCalledWith('New Season', {}, TEST_USER_ID);
    });

    it('should expose updateSeason mutation', async () => {
      const season = createSeason({ name: 'Updated Season' });
      mockedUpdateSeason.mockResolvedValue(season);

      const { result } = renderHook(() => useSeasonTournamentManagement(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.updateSeasonMutation.mutateAsync(season);
      });

      expect(mockedUpdateSeason).toHaveBeenCalledWith(season, TEST_USER_ID);
    });

    it('should expose deleteSeason mutation', async () => {
      mockedDeleteSeason.mockResolvedValue(true);

      const { result } = renderHook(() => useSeasonTournamentManagement(), { wrapper: createWrapper() });

      await act(async () => {
        const deleted = await result.current.deleteSeasonMutation.mutateAsync('season-1');
        expect(deleted).toBe(true);
      });

      expect(mockedDeleteSeason).toHaveBeenCalledWith('season-1', TEST_USER_ID);
    });

    it('should handle addSeason returning null', async () => {
      mockedAddSeason.mockResolvedValue(null);

      const { result } = renderHook(() => useSeasonTournamentManagement(), { wrapper: createWrapper() });

      await act(async () => {
        const addedSeason = await result.current.addSeasonMutation.mutateAsync({ name: 'Failed Season' });
        expect(addedSeason).toBeNull();
      });
    });
  });

  describe('tournament mutations', () => {
    it('should expose addTournament mutation', async () => {
      const newTournament = createTournament({ id: 'new-tournament', name: 'New Cup' });
      mockedAddTournament.mockResolvedValue(newTournament);

      const { result } = renderHook(() => useSeasonTournamentManagement(), { wrapper: createWrapper() });

      await act(async () => {
        const addedTournament = await result.current.addTournamentMutation.mutateAsync({ name: 'New Cup' });
        expect(addedTournament).toEqual(newTournament);
      });

      expect(mockedAddTournament).toHaveBeenCalledWith('New Cup', {}, TEST_USER_ID);
    });

    it('should expose updateTournament mutation', async () => {
      const tournament = createTournament({ name: 'Updated Cup' });
      mockedUpdateTournament.mockResolvedValue(tournament);

      const { result } = renderHook(() => useSeasonTournamentManagement(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.updateTournamentMutation.mutateAsync(tournament);
      });

      expect(mockedUpdateTournament).toHaveBeenCalledWith(tournament, TEST_USER_ID);
    });

    it('should expose deleteTournament mutation', async () => {
      mockedDeleteTournament.mockResolvedValue(true);

      const { result } = renderHook(() => useSeasonTournamentManagement(), { wrapper: createWrapper() });

      await act(async () => {
        const deleted = await result.current.deleteTournamentMutation.mutateAsync('tournament-1');
        expect(deleted).toBe(true);
      });

      expect(mockedDeleteTournament).toHaveBeenCalledWith('tournament-1', TEST_USER_ID);
    });

    it('should handle addTournament returning null', async () => {
      mockedAddTournament.mockResolvedValue(null);

      const { result } = renderHook(() => useSeasonTournamentManagement(), { wrapper: createWrapper() });

      await act(async () => {
        const addedTournament = await result.current.addTournamentMutation.mutateAsync({ name: 'Failed Tournament' });
        expect(addedTournament).toBeNull();
      });
    });
  });

  describe('queries', () => {
    it('exposes seasons, tournaments and masterRoster from the shared query keys', async () => {
      mockedGetSeasons.mockResolvedValue([createSeason({ name: 'Season 2026' })]);
      mockedGetTournaments.mockResolvedValue([createTournament({ name: 'Cup 2026' })]);

      const { result } = renderHook(() => useSeasonTournamentManagement(), { wrapper: createWrapper() });

      await waitFor(() =>
        expect(result.current.seasons.map((s) => s.name)).toEqual(['Season 2026']),
      );
      expect(result.current.tournaments.map((t) => t.name)).toEqual(['Cup 2026']);
      expect(result.current.masterRoster).toEqual([]);
    });
  });
});
