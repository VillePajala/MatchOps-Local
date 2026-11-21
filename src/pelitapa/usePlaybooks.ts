import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useAccountFeatures } from '@/hooks/useAccountFeatures';
import logger from '@/utils/logger';
import { DEMO_CONCEPT } from './demoConcept';
import { validateConcept } from './validateConcept';
import type { Concept } from './types';

/**
 * The Pelitapa playbooks this account may read.
 *
 * - Only for accounts with the server-side 'pelitapa' flag; everyone else gets
 *   nothing and nothing is fetched.
 * - Cloud mode, signed in: the playbooks and concepts the account has been
 *   granted (Supabase playbooks / playbook_concepts; RLS does the filtering,
 *   migration 065), fetched in the background when the library opens and when
 *   the app resumes. Every concept is validated; an invalid one is skipped
 *   with a warning, never shown and never a crash.
 * - The last answer is kept per user in IndexedDB, so a tablet at an arena with
 *   no signal still has the playbooks. A failed fetch keeps it (status
 *   'offline').
 * - Local mode: no club playbooks.
 * - Always (for flagged accounts) our own "MatchOps esimerkit" playbook with the
 *   built-in demo concept, last in the list.
 */

export const BUILT_IN_PLAYBOOK_ID = 'matchops-examples';

export interface Playbook {
  id: string;
  name: string;
  /** Our own built-in examples (name is translated by the view). */
  builtIn: boolean;
  concepts: Concept[];
}

/** 'loading': no answer and nothing cached yet. 'offline': the last fetch failed (cached data shown). */
export type PlaybooksStatus = 'loading' | 'ready' | 'offline';

export interface PlaybooksResult {
  playbooks: Playbook[];
  status: PlaybooksStatus;
  /** Fetch again (deduplicated). */
  refresh: () => void;
}

/** The rows as they come from the database (and as they are cached). */
export interface PlaybookRows {
  playbooks: Array<{ id: string; name: string }>;
  concepts: Array<{ playbook_id: string; id: string; sort: number; data: unknown }>;
}

const CACHE_KEY = 'pelitapa_playbooks_v1';

export const BUILT_IN_PLAYBOOK: Playbook = {
  id: BUILT_IN_PLAYBOOK_ID,
  name: 'MatchOps esimerkit',
  builtIn: true,
  concepts: [DEMO_CONCEPT],
};

/**
 * Rows -> playbooks: concepts validated (invalid ones skipped with a warning),
 * ordered by `sort`, playbooks by name; playbooks with no valid concept are
 * left out.
 */
export function buildPlaybooks(rows: PlaybookRows): Playbook[] {
  const out: Playbook[] = [];
  for (const pb of [...rows.playbooks].sort((a, b) => a.name.localeCompare(b.name, 'fi'))) {
    const concepts: Concept[] = [];
    const seen = new Set<string>();
    const ofBook = rows.concepts
      .filter((c) => c.playbook_id === pb.id)
      .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
    for (const row of ofBook) {
      const v = validateConcept(row.data);
      if (!v.ok) {
        logger.warn(`[Pelitapa] Skipping invalid concept ${pb.id}/${row.id}`, v.errors.slice(0, 5));
        continue;
      }
      if (seen.has(v.concept.id)) {
        logger.warn(`[Pelitapa] Skipping duplicate concept id ${pb.id}/${v.concept.id}`);
        continue;
      }
      seen.add(v.concept.id);
      concepts.push(v.concept);
    }
    if (concepts.length > 0) out.push({ id: pb.id, name: pb.name, builtIn: false, concepts });
  }
  return out;
}

function isRows(v: unknown): v is PlaybookRows {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    Array.isArray(r.playbooks) &&
    r.playbooks.every(
      (p) => typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).id === 'string' && typeof (p as Record<string, unknown>).name === 'string',
    ) &&
    Array.isArray(r.concepts) &&
    r.concepts.every((c) => {
      if (typeof c !== 'object' || c === null) return false;
      const o = c as Record<string, unknown>;
      return typeof o.playbook_id === 'string' && typeof o.id === 'string' && typeof o.sort === 'number';
    })
  );
}

// --- Per-user store -------------------------------------------------------

interface UserState {
  remote: Playbook[];
  status: PlaybooksStatus;
  /** A network answer arrived this session (a late cache read must not overwrite it). */
  fromNetwork: boolean;
}

const INITIAL: UserState = { remote: [], status: 'loading', fromNetwork: false };
const states = new Map<string, UserState>();
const listeners = new Set<() => void>();
const inFlight = new Map<string, Promise<void>>();
const cacheRead = new Set<string>();

function setState(userId: string, next: UserState): void {
  states.set(userId, next);
  listeners.forEach((l) => l());
}

function stateFor(userId: string): UserState {
  return states.get(userId) ?? INITIAL;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function readCache(userId: string): Promise<void> {
  if (cacheRead.has(userId)) return;
  cacheRead.add(userId);
  try {
    const { getUserStorageAdapter } = await import('@/utils/storage');
    const raw = await (await getUserStorageAdapter(userId)).getItem(CACHE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!isRows(parsed)) return;
    const current = stateFor(userId);
    if (current.fromNetwork) return;
    setState(userId, { ...current, remote: buildPlaybooks(parsed), status: current.status === 'loading' ? 'ready' : current.status });
  } catch (error) {
    logger.debug('[Pelitapa] Could not read the cached playbooks', error);
  }
}

async function writeCache(userId: string, rows: PlaybookRows): Promise<void> {
  try {
    const { getUserStorageAdapter } = await import('@/utils/storage');
    await (await getUserStorageAdapter(userId)).setItem(CACHE_KEY, JSON.stringify(rows));
  } catch (error) {
    // The in-memory answer still holds for this session.
    logger.debug('[Pelitapa] Could not cache the playbooks', error);
  }
}

async function fetchRows(userId: string): Promise<PlaybookRows> {
  const { getSupabaseClient } = await import('@/datastore/supabase/client');
  const client = getSupabaseClient();
  // Without a session for THIS user the query would run as anon and return no
  // rows, which would wrongly empty the cache. Treat it as "no answer".
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user.id !== userId) throw new Error('No session for the signed-in user');
  const [pb, cs] = await Promise.all([
    client.from('playbooks').select('id, name'),
    client.from('playbook_concepts').select('playbook_id, id, sort, data'),
  ]);
  if (pb.error) throw new Error(pb.error.message);
  if (cs.error) throw new Error(cs.error.message);
  return { playbooks: pb.data ?? [], concepts: cs.data ?? [] };
}

/** Fetch the account's playbooks (deduplicated per user). Never throws. */
export function refreshPlaybooks(userId: string): Promise<void> {
  const running = inFlight.get(userId);
  if (running) return running;
  const run = fetchRows(userId)
    .then(async (rows) => {
      setState(userId, { remote: buildPlaybooks(rows), status: 'ready', fromNetwork: true });
      await writeCache(userId, rows);
    })
    .catch((error: unknown) => {
      logger.debug('[Pelitapa] Playbook fetch failed; keeping the cached ones', error);
      setState(userId, { ...stateFor(userId), status: 'offline' });
    })
    .finally(() => {
      inFlight.delete(userId);
    });
  inFlight.set(userId, run);
  return run;
}

/** Tests only. */
export function __resetPlaybooksForTests(): void {
  states.clear();
  listeners.clear();
  inFlight.clear();
  cacheRead.clear();
}

const NONE: Playbook[] = [];
const ONLY_BUILT_IN: Playbook[] = [BUILT_IN_PLAYBOOK];
const noop = () => {};

export function usePlaybooks(): PlaybooksResult {
  const { user, mode } = useAuth();
  const { hasFeature } = useAccountFeatures();
  const enabled = hasFeature('pelitapa');
  const userId = enabled && mode === 'cloud' && user && !user.isAnonymous ? user.id : null;

  const state = useSyncExternalStore(
    subscribe,
    () => (userId ? stateFor(userId) : INITIAL),
    () => INITIAL,
  );

  useEffect(() => {
    if (!userId) return;
    void readCache(userId);
    void refreshPlaybooks(userId);
    const onResume = () => void refreshPlaybooks(userId);
    window.addEventListener('app-resume', onResume);
    return () => window.removeEventListener('app-resume', onResume);
  }, [userId]);

  const refresh = useCallback(() => {
    if (userId) void refreshPlaybooks(userId);
  }, [userId]);

  const playbooks = useMemo(
    () => (!enabled ? NONE : userId ? [...state.remote, BUILT_IN_PLAYBOOK] : ONLY_BUILT_IN),
    [enabled, userId, state.remote],
  );

  return {
    playbooks,
    status: userId ? state.status : 'ready',
    refresh: userId ? refresh : noop,
  };
}
