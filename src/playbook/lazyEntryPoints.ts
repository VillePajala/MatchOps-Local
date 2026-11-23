'use client';

/**
 * The game-theme pieces the rest of the app renders, each a lazily loaded
 * chunk with nothing warmed in the background: only accounts with the
 * playbook flag ever render them, so nobody else downloads any Playbook
 * code. `inline`: a chunk that cannot load (offline after an update) leaves
 * the piece out quietly instead of a "needs a connection" toast.
 */

import { lazyModal } from '@/components/lazyModal';
import type { GameThemeRowProps } from './GameThemeRow';
import type { GameThemeFieldProps } from './GameThemeField';
import type { GameThemesMenuRowProps } from './GameThemesMenuRow';
import type { GameThemesLauncherProps } from './GameThemesLauncher';

export const LazyGameThemeRow = lazyModal<GameThemeRowProps>(() => import('./GameThemeRow'), { warm: false, inline: true });
export const LazyGameThemeField = lazyModal<GameThemeFieldProps>(() => import('./GameThemeField'), { warm: false, inline: true });

/** The match menu's "Match themes" row and what it opens (the launcher is opened by a tap, so a chunk that
 * cannot load gets the usual "needs a connection" toast and closes). */
export const LazyGameThemesMenuRow = lazyModal<GameThemesMenuRowProps>(() => import('./GameThemesMenuRow'), { warm: false, inline: true });
export const LazyGameThemesLauncher = lazyModal<GameThemesLauncherProps>(() => import('./GameThemesLauncher'), { warm: false });
