'use client';

/**
 * The game-theme pieces the rest of the app renders, each a lazily loaded
 * chunk with nothing warmed in the background: only accounts with the
 * 'pelitapa' flag ever render them, so nobody else downloads any Pelitapa
 * code. `inline`: a chunk that cannot load (offline after an update) leaves
 * the piece out quietly instead of a "needs a connection" toast.
 */

import { lazyModal } from '@/components/lazyModal';
import type { GameThemeRowProps } from './GameThemeRow';
import type { GameThemeFieldProps } from './GameThemeField';

export const LazyGameThemeRow = lazyModal<GameThemeRowProps>(() => import('./GameThemeRow'), { warm: false, inline: true });
export const LazyGameThemeField = lazyModal<GameThemeFieldProps>(() => import('./GameThemeField'), { warm: false, inline: true });
