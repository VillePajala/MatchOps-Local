import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useAccountFeatures,
  refreshAccountFeatures,
  __resetAccountFeaturesForTests,
} from '../useAccountFeatures';

type AuthState = { user: { id: string; isAnonymous: boolean } | null; mode: 'local' | 'cloud' };
let mockAuth: AuthState = { user: null, mode: 'local' };
jest.mock('@/contexts/AuthProvider', () => ({ useAuth: () => mockAuth }));

const mockEq = jest.fn();
const mockGetSession = jest.fn();
jest.mock('@/datastore/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: mockGetSession },
    from: (table: string) => {
      if (table !== 'account_features') throw new Error(`unexpected table ${table}`);
      return { select: () => ({ eq: mockEq }) };
    },
  }),
}));

const USER = 'user-1';
const CACHE_KEY = `matchops_account_features_${USER}`;
const sessionFor = (id: string) => ({ data: { session: { user: { id } } } });

describe('useAccountFeatures', () => {
  const originalFlag = process.env.NEXT_PUBLIC_INTERNAL_TESTING;

  beforeEach(() => {
    __resetAccountFeaturesForTests();
    mockEq.mockReset();
    mockGetSession.mockReset().mockResolvedValue(sessionFor(USER));
    mockAuth = { user: { id: USER, isAnonymous: false }, mode: 'cloud' };
    delete process.env.NEXT_PUBLIC_INTERNAL_TESTING;
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_INTERNAL_TESTING;
    else process.env.NEXT_PUBLIC_INTERNAL_TESTING = originalFlag;
  });

  /** @critical the server decides; the client only reads its own enabled rows */
  it('turns a feature on once the server says so, and caches the answer per user', async () => {
    mockEq.mockResolvedValue({ data: [{ feature: 'pelitapa' }], error: null });
    const { result } = renderHook(() => useAccountFeatures());

    expect(result.current.hasFeature('pelitapa')).toBe(false); // default off, never blocks
    await waitFor(() => expect(result.current.hasFeature('pelitapa')).toBe(true));
    expect(mockEq).toHaveBeenCalledWith('enabled', true);
    expect(JSON.parse(localStorage.getItem(CACHE_KEY) as string)).toEqual(['pelitapa']);
  });

  it('stays off when the account has no rows', async () => {
    mockEq.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useAccountFeatures());
    await waitFor(() => expect(mockEq).toHaveBeenCalled());
    expect(result.current.hasFeature('pelitapa')).toBe(false);
  });

  /** @edge-case offline arena: the last answer is used */
  it('uses the cached answer when the fetch fails', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(['pelitapa']));
    mockEq.mockRejectedValue(new Error('Failed to fetch'));
    const { result } = renderHook(() => useAccountFeatures());
    expect(result.current.hasFeature('pelitapa')).toBe(true);
    await waitFor(() => expect(mockEq).toHaveBeenCalled());
    expect(result.current.hasFeature('pelitapa')).toBe(true);
  });

  /** @edge-case a query without this user's session would read as anon and return [] */
  it('does not clear a cached grant when there is no session for the user', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(['pelitapa']));
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAccountFeatures());
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    await act(async () => {
      await refreshAccountFeatures(USER);
    });
    expect(mockEq).not.toHaveBeenCalled();
    expect(result.current.hasFeature('pelitapa')).toBe(true);
  });

  it('a revoked feature switches off on the next refresh (app resume)', async () => {
    mockEq.mockResolvedValueOnce({ data: [{ feature: 'pelitapa' }], error: null });
    const { result } = renderHook(() => useAccountFeatures());
    await waitFor(() => expect(result.current.hasFeature('pelitapa')).toBe(true));

    mockEq.mockResolvedValueOnce({ data: [], error: null });
    act(() => {
      window.dispatchEvent(new CustomEvent('app-resume'));
    });
    await waitFor(() => expect(result.current.hasFeature('pelitapa')).toBe(false));
    expect(mockEq).toHaveBeenCalledTimes(2);
  });

  it('fetches once per session, however many components ask', async () => {
    mockEq.mockResolvedValue({ data: [{ feature: 'pelitapa' }], error: null });
    const a = renderHook(() => useAccountFeatures());
    renderHook(() => useAccountFeatures());
    await waitFor(() => expect(a.result.current.hasFeature('pelitapa')).toBe(true));
    renderHook(() => useAccountFeatures());
    expect(mockEq).toHaveBeenCalledTimes(1);
  });

  it('local mode: off and no fetch', () => {
    mockAuth = { user: null, mode: 'local' };
    const { result } = renderHook(() => useAccountFeatures());
    expect(result.current.hasFeature('pelitapa')).toBe(false);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('local mode with NEXT_PUBLIC_INTERNAL_TESTING=true: on (development override)', () => {
    process.env.NEXT_PUBLIC_INTERNAL_TESTING = 'true';
    mockAuth = { user: null, mode: 'local' };
    const { result } = renderHook(() => useAccountFeatures());
    expect(result.current.hasFeature('pelitapa')).toBe(true);
  });

  it("one account's cached grant does not leak to another account", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(['pelitapa']));
    mockEq.mockReturnValue(new Promise(() => {})); // never answers
    mockAuth = { user: { id: 'user-2', isAnonymous: false }, mode: 'cloud' };
    mockGetSession.mockResolvedValue(sessionFor('user-2'));
    const { result } = renderHook(() => useAccountFeatures());
    expect(result.current.hasFeature('pelitapa')).toBe(false);
  });
});
