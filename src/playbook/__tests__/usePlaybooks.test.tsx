import { renderHook, act, waitFor } from '@testing-library/react';
import {
  usePlaybooks,
  buildPlaybooks,
  refreshPlaybooks,
  __resetPlaybooksForTests,
  BUILT_IN_PLAYBOOK_ID,
  type PlaybookRows,
} from '../usePlaybooks';
import type { Concept } from '../types';

type AuthState = { user: { id: string; isAnonymous: boolean } | null; mode: 'local' | 'cloud' };
let mockAuth: AuthState = { user: null, mode: 'local' };
jest.mock('@/contexts/AuthProvider', () => ({ useAuth: () => mockAuth }));

let mockFlag = true;
jest.mock('@/hooks/useAccountFeatures', () => ({
  useAccountFeatures: () => ({ hasFeature: (f: string) => f === jest.requireActual<typeof import('@/playbook/feature')>('@/playbook/feature').PLAYBOOK_FEATURE && mockFlag }),
}));

const mockWarn = jest.fn();
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { warn: (...a: unknown[]) => mockWarn(...a), debug: jest.fn(), error: jest.fn(), log: jest.fn(), info: jest.fn() },
}));

// The per-user IndexedDB cache, as an in-memory map.
const mockDb = new Map<string, Map<string, string>>();
const mockSetItem = jest.fn();
jest.mock('@/utils/storage', () => ({
  getUserStorageAdapter: async (userId: string) => {
    if (!mockDb.has(userId)) mockDb.set(userId, new Map());
    const m = mockDb.get(userId) as Map<string, string>;
    return {
      getItem: async (k: string) => m.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        mockSetItem(k, v);
        m.set(k, v);
      },
    };
  },
}));

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
const mockSelect: Record<string, jest.Mock> = { playbooks: jest.fn(), playbook_concepts: jest.fn() };
jest.mock('@/datastore/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: mockGetSession },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (table: string) => {
      const select = mockSelect[table];
      if (!select) throw new Error(`unexpected table ${table}`);
      return { select };
    },
  }),
}));

const USER = 'user-1';
const CACHE_KEY = 'pelitapa_playbooks_v1';
const sessionFor = (id: string) => ({ data: { session: { user: { id } } } });

/** A tiny SYNTHETIC concept. */
const concept = (id: string, over: Partial<Concept> = {}): Concept => ({
  id,
  title: `Concept ${id}`,
  phase: 'Hyökkääminen',
  format: '8v8',
  version: 1,
  players: [
    { id: 'p', side: 'us', start: [30, 60] },
    { id: 'o', side: 'opp', start: [30, 40] },
  ],
  steps: [{ title: 'Step', text: 'Text', ball: 'p' }],
  ...over,
});

const rows = (): PlaybookRows => ({
  playbooks: [{ id: 'club', name: 'Club book' }],
  concepts: [
    { playbook_id: 'club', id: 'b', sort: 1, data: concept('b') },
    { playbook_id: 'club', id: 'a', sort: 0, data: concept('a') },
  ],
});

function serve(r: PlaybookRows) {
  mockSelect.playbooks.mockResolvedValue({ data: r.playbooks, error: null });
  mockSelect.playbook_concepts.mockResolvedValue({ data: r.concepts, error: null });
}

describe('buildPlaybooks', () => {
  beforeEach(() => mockWarn.mockReset());

  it('orders concepts by sort, playbooks by name, drops playbooks with no valid concept', () => {
    const out = buildPlaybooks({
      playbooks: [
        { id: 'z', name: 'Zeta' },
        { id: 'club', name: 'Club book' },
        { id: 'empty', name: 'Empty' },
      ],
      concepts: [...rows().concepts, { playbook_id: 'z', id: 'c', sort: 0, data: concept('c') }],
    });
    expect(out.map((p) => p.id)).toEqual(['club', 'z']);
    expect(out[0].concepts.map((c) => c.id)).toEqual(['a', 'b']);
    expect(out[0].builtIn).toBe(false);
  });

  /** @edge-case bad content from the database never reaches the view */
  it('skips invalid and duplicate concepts with a warning', () => {
    const out = buildPlaybooks({
      playbooks: [{ id: 'club', name: 'Club' }],
      concepts: [
        { playbook_id: 'club', id: 'ok', sort: 0, data: concept('ok') },
        { playbook_id: 'club', id: 'bad', sort: 1, data: { ...concept('bad'), steps: [] } },
        { playbook_id: 'club', id: 'junk', sort: 2, data: 'not a concept' },
        { playbook_id: 'club', id: 'dup', sort: 3, data: concept('ok') },
      ],
    });
    expect(out[0].concepts.map((c) => c.id)).toEqual(['ok']);
    expect(mockWarn).toHaveBeenCalledTimes(3);
    expect(mockWarn.mock.calls[0][0]).toContain('club/bad');
  });
});

describe('usePlaybooks', () => {
  beforeEach(() => {
    __resetPlaybooksForTests();
    mockDb.clear();
    mockSetItem.mockReset();
    mockWarn.mockReset();
    mockSelect.playbooks.mockReset();
    mockSelect.playbook_concepts.mockReset();
    mockGetSession.mockReset().mockResolvedValue(sessionFor(USER));
    mockAuth = { user: { id: USER, isAnonymous: false }, mode: 'cloud' };
    mockFlag = true;
  });

  /** @critical accounts without the flag get nothing and fetch nothing */
  it('without the playbook flag: no playbooks, no fetch', async () => {
    mockFlag = false;
    const { result } = renderHook(() => usePlaybooks());
    expect(result.current.playbooks).toEqual([]);
    await act(async () => {});
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockSelect.playbooks).not.toHaveBeenCalled();
  });

  it('local mode: only the built-in examples, nothing fetched', async () => {
    mockAuth = { user: null, mode: 'local' };
    const { result } = renderHook(() => usePlaybooks());
    expect(result.current.playbooks.map((p) => p.id)).toEqual([BUILT_IN_PLAYBOOK_ID]);
    expect(result.current.status).toBe('ready');
    await act(async () => {});
    expect(mockSelect.playbooks).not.toHaveBeenCalled();
  });

  it('cloud: fetches the granted playbooks, puts them before the examples, caches the rows per user', async () => {
    serve(rows());
    const { result } = renderHook(() => usePlaybooks());
    expect(result.current.status).toBe('loading');
    expect(result.current.playbooks.map((p) => p.id)).toEqual([BUILT_IN_PLAYBOOK_ID]);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.playbooks.map((p) => p.id)).toEqual(['club', BUILT_IN_PLAYBOOK_ID]);
    expect(mockSelect.playbook_concepts).toHaveBeenCalledWith('playbook_id, id, sort, data');
    await waitFor(() => expect(mockSetItem).toHaveBeenCalledWith(CACHE_KEY, expect.any(String)));
    expect(JSON.parse(mockDb.get(USER)?.get(CACHE_KEY) as string)).toEqual(rows());
  });

  /** @edge-case offline arena: the last answer is shown */
  it('offline: shows the cached playbooks and reports offline', async () => {
    mockDb.set(USER, new Map([[CACHE_KEY, JSON.stringify(rows())]]));
    mockSelect.playbooks.mockRejectedValue(new Error('Failed to fetch'));
    mockSelect.playbook_concepts.mockRejectedValue(new Error('Failed to fetch'));
    const { result } = renderHook(() => usePlaybooks());
    await waitFor(() => expect(result.current.status).toBe('offline'));
    await waitFor(() => expect(result.current.playbooks.map((p) => p.id)).toEqual(['club', BUILT_IN_PLAYBOOK_ID]));
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('a corrupt cache is ignored', async () => {
    mockDb.set(USER, new Map([[CACHE_KEY, '{"playbooks":"nope"}']]));
    mockSelect.playbooks.mockRejectedValue(new Error('Failed to fetch'));
    mockSelect.playbook_concepts.mockRejectedValue(new Error('Failed to fetch'));
    const { result } = renderHook(() => usePlaybooks());
    await waitFor(() => expect(result.current.status).toBe('offline'));
    expect(result.current.playbooks.map((p) => p.id)).toEqual([BUILT_IN_PLAYBOOK_ID]);
  });

  it('access removed on the server: the answer replaces the cache', async () => {
    mockDb.set(USER, new Map([[CACHE_KEY, JSON.stringify(rows())]]));
    serve({ playbooks: [], concepts: [] });
    const { result } = renderHook(() => usePlaybooks());
    await waitFor(() => expect(mockSetItem).toHaveBeenCalled());
    expect(result.current.playbooks.map((p) => p.id)).toEqual([BUILT_IN_PLAYBOOK_ID]);
    expect(JSON.parse(mockDb.get(USER)?.get(CACHE_KEY) as string)).toEqual({ playbooks: [], concepts: [] });
  });

  /** @edge-case without this user's session the query would run as anon and return nothing */
  it('no session for the user: no query, the cache stays', async () => {
    mockDb.set(USER, new Map([[CACHE_KEY, JSON.stringify(rows())]]));
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => usePlaybooks());
    await waitFor(() => expect(result.current.status).toBe('offline'));
    expect(mockSelect.playbooks).not.toHaveBeenCalled();
    expect(result.current.playbooks.map((p) => p.id)).toEqual(['club', BUILT_IN_PLAYBOOK_ID]);
  });

  it('refetches when the app resumes; concurrent refreshes share one request', async () => {
    serve(rows());
    const { result } = renderHook(() => usePlaybooks());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockSelect.playbooks).toHaveBeenCalledTimes(1);

    serve({ playbooks: [{ id: 'club', name: 'Renamed' }], concepts: rows().concepts });
    await act(async () => {
      window.dispatchEvent(new Event('app-resume'));
    });
    await waitFor(() => expect(result.current.playbooks[0].name).toBe('Renamed'));

    await act(async () => {
      await Promise.all([refreshPlaybooks(USER), refreshPlaybooks(USER)]);
    });
    expect(mockSelect.playbooks).toHaveBeenCalledTimes(3);
  });
});

describe('usePlaybooks: unlocking with a club code', () => {
  beforeEach(() => {
    __resetPlaybooksForTests();
    mockDb.clear();
    mockSetItem.mockReset();
    mockRpc.mockReset();
    mockSelect.playbooks.mockReset();
    mockSelect.playbook_concepts.mockReset();
    mockGetSession.mockReset().mockResolvedValue(sessionFor(USER));
    mockAuth = { user: { id: USER, isAnonymous: false }, mode: 'cloud' };
    mockFlag = true;
  });

  it('local mode and accounts without the flag cannot unlock', () => {
    mockAuth = { user: null, mode: 'local' };
    expect(renderHook(() => usePlaybooks()).result.current.redeemCode).toBeUndefined();
    mockAuth = { user: { id: USER, isAnonymous: false }, mode: 'cloud' };
    mockFlag = false;
    expect(renderHook(() => usePlaybooks()).result.current.redeemCode).toBeUndefined();
  });

  /** @critical a redeemed code shows the new playbook without reopening anything */
  it('a working code fetches the playbooks again and the unlocked one is there', async () => {
    serve({ playbooks: [], concepts: [] });
    const { result } = renderHook(() => usePlaybooks());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.playbooks.map((p) => p.id)).toEqual([BUILT_IN_PLAYBOOK_ID]);

    serve(rows());
    mockRpc.mockResolvedValue({ data: { ok: true, playbook_id: 'club', playbook_name: 'Club book' }, error: null });
    let answer: unknown;
    await act(async () => {
      answer = await result.current.redeemCode?.('club-1234');
    });
    expect(mockRpc).toHaveBeenCalledWith('redeem_playbook_code', { p_code: 'CLUB1234' });
    expect(answer).toEqual({ ok: true, playbookId: 'club', playbookName: 'Club book', already: false });
    expect(result.current.playbooks.map((p) => p.id)).toEqual(['club', BUILT_IN_PLAYBOOK_ID]);
  });

  it('a code that does not work fetches nothing', async () => {
    serve({ playbooks: [], concepts: [] });
    const { result } = renderHook(() => usePlaybooks());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const fetches = mockSelect.playbooks.mock.calls.length;
    mockRpc.mockResolvedValue({ data: { ok: false, error: 'expired' }, error: null });
    let answer: unknown;
    await act(async () => {
      answer = await result.current.redeemCode?.('ABCD-EFGH');
    });
    expect(answer).toEqual({ ok: false, error: 'expired' });
    expect(mockSelect.playbooks.mock.calls.length).toBe(fetches);
  });

  /** @edge-case a fetch already running started before the grant: a new one follows it */
  it('refreshPlaybooks fresh: does not reuse a fetch that was already running', async () => {
    let release: (v: unknown) => void = () => {};
    mockSelect.playbooks.mockImplementationOnce(() => new Promise((r) => (release = r)));
    mockSelect.playbook_concepts.mockResolvedValue({ data: [], error: null });
    const first = refreshPlaybooks(USER);
    serve(rows());
    const second = refreshPlaybooks(USER, { fresh: true });
    // The first fetch is waiting on its query.
    await waitFor(() => expect(mockSelect.playbooks).toHaveBeenCalledTimes(1));
    release({ data: [], error: null });
    await act(async () => {
      await first;
      await second;
    });
    expect(mockSelect.playbooks).toHaveBeenCalledTimes(2);
  });
});
