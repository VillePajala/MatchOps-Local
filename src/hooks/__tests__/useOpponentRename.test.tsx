/**
 * Review 7.13: an opponent rename made while a match is open must stick - the
 * open match's next autosave used to write the old spelling back.
 * @critical
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOpponentRename } from '../useOpponentRename';

jest.mock('@/hooks/useDataStore', () => ({ useDataStore: () => ({ userId: 'u1' }) }));
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const cached = {
  g1: { opponentName: 'IPS', homeScore: 0, awayScore: 0, gameNotes: '' },
  g2: { opponentName: 'ips ', homeScore: 1, awayScore: 0, gameNotes: '' },
  g3: { opponentName: 'HJK', homeScore: 0, awayScore: 0, gameNotes: '' },
};
// What storage holds now: g1 is the open match, autosaved after the cache was read.
const stored: Record<string, unknown> = {
  g1: { opponentName: 'IPS', homeScore: 2, awayScore: 0, gameNotes: 'kirjattu' },
  g2: cached.g2,
};
const calls: string[] = [];
const saveGame = jest.fn(async (id: string) => { calls.push(`save:${id}`); });
jest.mock('@/utils/savedGames', () => ({
  getSavedGames: jest.fn(async () => cached),
  getGame: jest.fn(async (id: string) => stored[id] ?? null),
  saveGame: (...a: unknown[]) => saveGame(...(a as [string])),
}));
jest.mock('@/utils/seasons', () => ({
  getSeasons: jest.fn(async () => []),
  updateSeason: jest.fn(),
}));

const liveGame = {
  onFlushLiveGame: jest.fn(async () => { calls.push('flush'); }),
  onLinkedGamesUpdated: jest.fn((ids: string[]) => { calls.push(`linked:${ids.join(',')}`); }),
};
let mockLiveGame: typeof liveGame | null = liveGame;
jest.mock('@/contexts/ModalProvider', () => ({
  useModalContextOptional: () => ({ plannerLiveGameHooks: mockLiveGame }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('useOpponentRename', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    mockLiveGame = liveGame;
  });

  const rename = async () => {
    const { result } = renderHook(() => useOpponentRename(true), { wrapper });
    // Wait until the cached games have loaded (the plan is built from them).
    await waitFor(async () => {
      let out: unknown;
      await act(async () => { out = await result.current.renameOpponent('IPS', 'IPS Punainen'); });
      expect(out).not.toBeNull();
    });
  };

  it('lands the open match first, writes from storage, then tells the match', async () => {
    await rename();
    expect(calls[0]).toBe('flush');
    expect(calls.slice(1, 3).sort()).toEqual(['save:g1', 'save:g2']);
    expect(calls[3]).toBe('linked:g1,g2');
    // g1 is written from its stored copy (score 2, the note), not the stale cache.
    expect(saveGame).toHaveBeenCalledWith('g1', expect.objectContaining({ opponentName: 'IPS Punainen', homeScore: 2, gameNotes: 'kirjattu' }), 'u1');
    expect(saveGame).not.toHaveBeenCalledWith('g3', expect.anything(), expect.anything());
  });

  it('writes nothing when the open match cannot be flushed', async () => {
    const original = liveGame.onFlushLiveGame.getMockImplementation();
    liveGame.onFlushLiveGame.mockImplementation(async () => { throw new Error('save failed'); });
    try {
      const { result } = renderHook(() => useOpponentRename(true), { wrapper });
      // Until the cached games load the rename has no plan and resolves to null
      // without flushing; once they have, it must reject and write nothing.
      await waitFor(async () => {
        let error: unknown = null;
        await act(async () => {
          error = await result.current.renameOpponent('IPS', 'IPS Punainen').then(() => null, (e: unknown) => e);
        });
        expect(error).toEqual(new Error('save failed'));
      });
      expect(saveGame).not.toHaveBeenCalled();
      expect(liveGame.onLinkedGamesUpdated).not.toHaveBeenCalled();
    } finally {
      liveGame.onFlushLiveGame.mockImplementation(original);
    }
  });

  it('works from Home, with no match open', async () => {
    mockLiveGame = null;
    await rename();
    expect(saveGame).toHaveBeenCalledTimes(2);
  });
});
