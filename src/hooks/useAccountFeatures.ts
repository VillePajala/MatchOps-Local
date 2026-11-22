import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import logger from '@/utils/logger';

/**
 * Per-account feature flags the SERVER controls (Supabase `account_features`,
 * migration 064). A coach cannot switch one on: the table is read-only for
 * clients and a feature is granted with SQL. The first flag is 'pelitapa'.
 *
 * - Cloud mode, signed in: the account's rows are fetched in the background
 *   once per session after sign-in, and again when the app returns from the
 *   background ('app-resume'). The last answer is kept in localStorage per
 *   user, so a tablet in an arena with no signal still shows what the account
 *   was granted.
 * - Local mode (or signed out): nothing is granted, unless
 *   NEXT_PUBLIC_INTERNAL_TESTING=true (development builds only).
 * - Never blocks anything: until an answer arrives every feature is off (or
 *   the cached answer is used).
 */

export type AccountFeature = 'pelitapa';

const CACHE_PREFIX = 'matchops_account_features_';
const EMPTY: ReadonlySet<string> = new Set();

const byUser = new Map<string, ReadonlySet<string>>();
const listeners = new Set<() => void>();
const inFlight = new Map<string, Promise<void>>();
/** Users whose flags were fetched in this page session (the "once after sign-in"). */
const fetchedThisSession = new Set<string>();

function readCache(userId: string): ReadonlySet<string> {
  try {
    // eslint-disable-next-line no-restricted-globals -- a tiny per-user cache of server flags, not app data
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return new Set(parsed.filter((f): f is string => typeof f === 'string'));
  } catch {
    return EMPTY;
  }
}

function writeCache(userId: string, features: ReadonlySet<string>): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- a tiny per-user cache of server flags, not app data
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify([...features].sort()));
  } catch {
    // Storage full or blocked: the in-memory answer still holds for this session.
  }
}

function snapshotFor(userId: string): ReadonlySet<string> {
  let features = byUser.get(userId);
  if (!features) {
    features = readCache(userId);
    byUser.set(userId, features);
  }
  return features;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const f of a) if (!b.has(f)) return false;
  return true;
}

/** The enabled features of the signed-in account, read through RLS (own rows only). */
async function fetchEnabledFeatures(userId: string): Promise<ReadonlySet<string>> {
  const { getSupabaseClient } = await import('@/datastore/supabase/client');
  const client = getSupabaseClient();
  // Without a session for THIS user the query would run as anon and return no
  // rows - which would wrongly clear a cached grant. Treat it as "no answer".
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== userId) {
    throw new Error('No session for the signed-in user');
  }
  const { data, error } = await client.from('account_features').select('feature').eq('enabled', true);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.feature));
}

/**
 * Fetch the account's flags (deduplicated per user). A failure keeps the last
 * known answer; nothing is thrown to the caller.
 */
export function refreshAccountFeatures(userId: string): Promise<void> {
  const running = inFlight.get(userId);
  if (running) return running;
  const run = fetchEnabledFeatures(userId)
    .then((features) => {
      fetchedThisSession.add(userId);
      writeCache(userId, features);
      if (!sameSet(snapshotFor(userId), features)) {
        byUser.set(userId, features);
        listeners.forEach((l) => l());
      }
    })
    .catch((error: unknown) => {
      logger.debug('[accountFeatures] fetch failed; keeping the last known flags', error);
    })
    .finally(() => {
      inFlight.delete(userId);
    });
  inFlight.set(userId, run);
  return run;
}

/** Tests only. */
export function __resetAccountFeaturesForTests(): void {
  byUser.clear();
  listeners.clear();
  inFlight.clear();
  fetchedThisSession.clear();
}

const devOverride = (): boolean => process.env.NEXT_PUBLIC_INTERNAL_TESTING === 'true';

/**
 * Outside React (data services): whether this user's last known flags on this
 * device include the feature. No fetch; false until the account's flags were
 * read once here.
 */
export function hasCachedAccountFeature(userId: string, feature: AccountFeature): boolean {
  return snapshotFor(userId).has(feature);
}

export interface AccountFeatures {
  hasFeature: (feature: AccountFeature) => boolean;
}

export function useAccountFeatures(): AccountFeatures {
  const { user, mode } = useAuth();
  const userId = mode === 'cloud' && user && !user.isAnonymous ? user.id : null;

  const features = useSyncExternalStore(
    subscribe,
    () => (userId ? snapshotFor(userId) : EMPTY),
    () => EMPTY,
  );

  useEffect(() => {
    if (!userId) return;
    if (!fetchedThisSession.has(userId)) void refreshAccountFeatures(userId);
    const onResume = () => void refreshAccountFeatures(userId);
    window.addEventListener('app-resume', onResume);
    return () => window.removeEventListener('app-resume', onResume);
  }, [userId]);

  const hasFeature = useCallback(
    (feature: AccountFeature) => (userId ? features.has(feature) : devOverride()),
    [userId, features],
  );
  return { hasFeature };
}
