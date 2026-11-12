'use client';

/**
 * Lazily loaded modals that survive a missing connection.
 *
 * The big modals are split into their own chunks so the app starts fast. After an
 * update the new version's chunks are not on the device until something fetches
 * them, so opening a modal offline used to fail inside React.lazy: the rejection
 * was thrown during render, caught only by the page-level error boundary, and the
 * whole app (or the live match view) was replaced by the error screen. React.lazy
 * also remembers the failure, so "try again" kept failing.
 *
 * `lazyModal(loader)` fixes both ends:
 * - A local boundary catches a chunk-load failure, shows a "needs a connection"
 *   toast and closes the modal. The screen underneath stays as it was. Any other
 *   error is re-thrown to the page boundary as before.
 * - The failed React.lazy is replaced by a fresh one, so the next open retries.
 * - `warmLazyModals()` fetches every registered modal's chunk in the background once
 *   the app is idle and online, so the service worker has them for later offline use.
 */

import React, { Component, Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';

type ModalLoader<P> = () => Promise<{ default: ComponentType<P> }>;

/** Every lazyModal's loader, in registration order, for the background warm-up. */
const loaders: Array<() => Promise<unknown>> = [];

/** True for the errors browsers and bundlers raise when a code chunk can't be fetched. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return /Loading (CSS )?chunk|Failed to load chunk|dynamically imported module|Importing a module script failed/i.test(
    error.message,
  );
}

interface ChunkBoundaryProps {
  /** A change clears a caught chunk error (the modal being opened again). */
  resetKey: unknown;
  onChunkError: (error: Error) => void;
  children: ReactNode;
}

class ChunkErrorBoundary extends Component<ChunkBoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error)) this.props.onChunkError(error);
  }

  componentDidUpdate(prev: ChunkBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (error) {
      // Not ours to handle: let the page boundary report it as before.
      if (!isChunkLoadError(error)) throw error;
      return null;
    }
    return this.props.children;
  }
}

/** The toast API, or undefined outside a ToastProvider (isolated component tests). */
function useToastIfAvailable(): ReturnType<typeof useToast> | undefined {
  try {
    return useToast();
  } catch {
    return undefined;
  }
}

interface ModalLikeProps {
  isOpen?: boolean;
  onClose?: () => void;
  /** NewGameSetupModal closes through onCancel. */
  onCancel?: () => void;
}

/**
 * Drop-in replacement for `dynamic(() => import('...'))` on modals. The props are
 * passed through unchanged; `isOpen` and `onClose` (or `onCancel`), when present, are
 * used to close a modal whose code could not be loaded and to stay silent while it is
 * closed. Closing matters: the host's open flag must go back to false, or the next tap
 * on the same button changes nothing and the modal can't be retried.
 */
export function lazyModal<P extends object>(loader: ModalLoader<P>): ComponentType<P> {
  const current = { Lazy: lazy(loader) };
  loaders.push(loader);

  function LazyModal(props: P) {
    const { t } = useTranslation();
    const toast = useToastIfAvailable();
    const { isOpen, onClose, onCancel } = props as ModalLikeProps;

    const handleChunkError = (error: Error) => {
      // React.lazy keeps the rejection forever; a fresh one retries on the next open.
      current.Lazy = lazy(loader);
      logger.warn('[lazyModal] Modal code could not be loaded:', error.message);
      if (isOpen === false) return; // mounted closed (e.g. game settings): nothing was asked for
      toast?.showToast(
        t('common.viewNeedsConnection', "This view couldn't be opened without a connection. Try again when you're online."),
        'error',
      );
      (onClose ?? onCancel)?.();
    };

    const { Lazy } = current;
    return (
      <ChunkErrorBoundary resetKey={isOpen} onChunkError={handleChunkError}>
        <Suspense fallback={null}>
          <Lazy {...props} />
        </Suspense>
      </ChunkErrorBoundary>
    );
  }
  return LazyModal;
}

let warmState: 'idle' | 'scheduled' | 'done' = 'idle';
/** Loaders whose chunk is already fetched; a later run only retries the rest. */
const warmed = new Set<() => Promise<unknown>>();
/** Retries after failures while still online (flaky signal, server blip). */
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000];
let retryCount = 0;

/**
 * Fetches every lazy modal's code in the background, one at a time, once the browser
 * is idle. Skipped with Data Saver on. A failed fetch doesn't stop the others; the
 * failed ones are retried later on a backoff timer, and again whenever the device
 * comes back online. Safe to call repeatedly.
 */
export function warmLazyModals(): void {
  if (typeof window === 'undefined' || warmState !== 'idle') return;
  // Data Saver on: don't spend data up front. Modals still load when opened.
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  warmState = 'scheduled';

  const tryAgainLater = () => {
    warmState = 'idle';
    // 'online' only fires after the device was offline; a failure while it still
    // reports online needs the timer.
    window.addEventListener('online', () => warmLazyModals(), { once: true });
    const delay = RETRY_DELAYS_MS[retryCount];
    if (delay !== undefined) {
      retryCount++;
      setTimeout(() => warmLazyModals(), delay);
    }
  };

  const run = async () => {
    let failed = false;
    for (const load of loaders) {
      if (warmed.has(load)) continue;
      if (!navigator.onLine) return tryAgainLater();
      try {
        await load();
        warmed.add(load);
      } catch (error) {
        failed = true;
        logger.warn('[lazyModal] Background modal preload failed:', error instanceof Error ? error.message : error);
      }
    }
    if (failed) return tryAgainLater();
    warmState = 'done';
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => void run(), { timeout: 10_000 });
  } else {
    setTimeout(() => void run(), 3_000);
  }
}

/** Test-only: forget the warm-up state between tests. */
export function __resetWarmLazyModalsForTests(): void {
  warmState = 'idle';
  retryCount = 0;
}
