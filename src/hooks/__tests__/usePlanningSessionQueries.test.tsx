/**
 * Tests for the planning-session React Query hooks.
 *
 * Mocks `useDataStore` to provide a stub DataStore; uses a real
 * QueryClient so we can assert cache invalidation actually happens on
 * mutation success (vs. stubbing useQuery, which would hide that).
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDeletePlanningSessionMutation,
  usePlanningSessionsQuery,
  useSavePlanningSessionMutation,
  useSetActiveSessionMutation,
} from '../usePlanningSessionQueries';
import type { PlanningSession } from '@/types';

const TEST_USER_ID = 'user-test-123';

// Stub DataStore — only the planning-session methods are called by these
// hooks, so other DataStore methods can stay undefined.
const mockGetPlanningSessions = jest.fn();
const mockSavePlanningSession = jest.fn();
const mockDeletePlanningSession = jest.fn();
const mockSetActiveSession = jest.fn();

const stubStore = {
  getPlanningSessions: mockGetPlanningSessions,
  savePlanningSession: mockSavePlanningSession,
  deletePlanningSession: mockDeletePlanningSession,
  setActiveSession: mockSetActiveSession,
};

jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({
    userId: TEST_USER_ID,
    getStore: jest.fn(async () => stubStore),
    isUserScoped: true,
  }),
}));

const session = (overrides: Partial<PlanningSession> = {}): PlanningSession => ({
  id: 'planningSession_1',
  teamId: 'team_1',
  name: 'Plan A',
  gameIds: ['g1'],
  draft: { g1: { startingXI: {}, bench: [], scheduledSubs: [] } },
  isActive: false,
  createdAt: '2026-04-30T10:00:00.000Z',
  updatedAt: '2026-04-30T10:00:00.000Z',
  ...overrides,
});

const buildWrapper = () => {
  // A fresh QueryClient per test prevents one test's cached data from
  // bleeding into the next.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('usePlanningSessionsQuery', () => {
  it('fetches sessions and forwards teamId to getPlanningSessions', async () => {
    mockGetPlanningSessions.mockResolvedValue([session({ id: 'a' })]);
    const { wrapper } = buildWrapper();

    const { result } = renderHook(
      () => usePlanningSessionsQuery({ teamId: 'team_1' }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([session({ id: 'a' })]);
    expect(mockGetPlanningSessions).toHaveBeenCalledWith('team_1');
  });

  it('passes undefined to getPlanningSessions when no teamId provided', async () => {
    mockGetPlanningSessions.mockResolvedValue([]);
    const { wrapper } = buildWrapper();

    const { result } = renderHook(() => usePlanningSessionsQuery({}), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPlanningSessions).toHaveBeenCalledWith(undefined);
  });

  it('does not fetch when enabled=false', () => {
    mockGetPlanningSessions.mockResolvedValue([]);
    const { wrapper } = buildWrapper();

    renderHook(
      () => usePlanningSessionsQuery({ teamId: 'team_1', enabled: false }),
      { wrapper },
    );

    // useQuery only calls queryFn when enabled is true.
    expect(mockGetPlanningSessions).not.toHaveBeenCalled();
  });
});

describe('useSavePlanningSessionMutation', () => {
  it('saves and invalidates both the team-scoped and unscoped lists', async () => {
    const saved = session({ id: 'new', teamId: 'team_1' });
    mockSavePlanningSession.mockResolvedValue(saved);
    mockGetPlanningSessions.mockResolvedValue([saved]);

    const { client, wrapper } = buildWrapper();

    // Seed two live queries — one team-scoped, one unscoped — so we can
    // verify both branches actually invalidate (not just that
    // invalidateQueries was called). The unscoped key path catches any
    // "all sessions" view a future PR adds.
    const teamScopedKey: readonly unknown[] = [
      'planningSessions',
      'team',
      'team_1',
      TEST_USER_ID,
    ];
    const unscopedKey: readonly unknown[] = [
      'planningSessions',
      'team',
      '_all',
      TEST_USER_ID,
    ];
    client.setQueryData(teamScopedKey, []);
    client.setQueryData(unscopedKey, []);

    const { result } = renderHook(() => useSavePlanningSessionMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        teamId: 'team_1',
        name: 'New plan',
        gameIds: ['g1'],
        draft: { g1: { startingXI: {}, bench: [], scheduledSubs: [] } },
        isActive: false,
      });
    });

    expect(mockSavePlanningSession).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(teamScopedKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unscopedKey)?.isInvalidated).toBe(true);
  });
});

describe('useDeletePlanningSessionMutation', () => {
  it('invalidates live planningSessions queries when the delete succeeds', async () => {
    mockDeletePlanningSession.mockResolvedValue(true);
    const { client, wrapper } = buildWrapper();

    // Seed a live team-scoped query into the cache so we can verify the
    // delete actually invalidates it (vs. just verifying invalidateQueries
    // was called — which the previous version of this test did, but missed
    // a real prefix-mismatch bug Claude flagged in PR #391 review).
    const liveKey: readonly unknown[] = [
      'planningSessions',
      'team',
      'team_1',
      TEST_USER_ID,
    ];
    client.setQueryData(liveKey, [session()]);

    const { result } = renderHook(() => useDeletePlanningSessionMutation(), {
      wrapper,
    });

    await act(async () => {
      const ok = await result.current.mutateAsync('planningSession_x');
      expect(ok).toBe(true);
    });

    expect(mockDeletePlanningSession).toHaveBeenCalledWith('planningSession_x');
    // Real prefix-match assertion: confirm the seeded query is now stale.
    const state = client.getQueryState(liveKey);
    expect(state?.isInvalidated).toBe(true);
  });

  it('does not invalidate when the delete returns false', async () => {
    mockDeletePlanningSession.mockResolvedValue(false);
    const { client, wrapper } = buildWrapper();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeletePlanningSessionMutation(), {
      wrapper,
    });

    await act(async () => {
      const ok = await result.current.mutateAsync('does_not_exist');
      expect(ok).toBe(false);
    });

    // Implementation guards on `if (!deleted) return;` so the cache is not
    // bombed when the delete was a no-op (id mismatch, already removed).
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useSetActiveSessionMutation', () => {
  it('forwards { sessionId, teamId, gameIds } to setActiveSession', async () => {
    mockSetActiveSession.mockResolvedValue(session({ id: 's1', isActive: true }));
    const { wrapper } = buildWrapper();

    const { result } = renderHook(() => useSetActiveSessionMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: 's1',
        teamId: 'team_1',
        gameIds: ['g1', 'g2'],
      });
    });

    expect(mockSetActiveSession).toHaveBeenCalledWith(
      's1',
      'team_1',
      ['g1', 'g2'],
    );
  });

  it('passes through null sessionId for explicit deactivate', async () => {
    mockSetActiveSession.mockResolvedValue(null);
    const { wrapper } = buildWrapper();

    const { result } = renderHook(() => useSetActiveSessionMutation(), {
      wrapper,
    });

    await act(async () => {
      const out = await result.current.mutateAsync({
        sessionId: null,
        teamId: 'team_1',
        gameIds: ['g1'],
      });
      expect(out).toBeNull();
    });

    expect(mockSetActiveSession).toHaveBeenCalledWith(null, 'team_1', ['g1']);
  });

  it('invalidates the team-scoped session list on success', async () => {
    mockSetActiveSession.mockResolvedValue(session({ id: 's1', isActive: true }));
    const { client, wrapper } = buildWrapper();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useSetActiveSessionMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: 's1',
        teamId: 'team_42',
        gameIds: ['g1'],
      });
    });

    const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(
      calls.some(
        (k) =>
          Array.isArray(k) &&
          k.includes('planningSessions') &&
          k.includes('team_42'),
      ),
    ).toBe(true);
  });
});
