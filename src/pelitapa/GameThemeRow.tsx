'use client';

import React from 'react';
import GameThemesControl from './GameThemesControl';
import { useGameThemes } from './useGameThemes';

/**
 * The themes of a SAVED game (next-match card, game settings): read and
 * written through the DataStore. Lazily loaded, for flagged accounts only.
 */
export interface GameThemeRowProps {
  gameId: string;
  variant: 'card' | 'form';
}

export default function GameThemeRow({ gameId, variant }: GameThemeRowProps) {
  const { themes, isLoading, save } = useGameThemes(gameId);
  // Nothing until the stored answer is known: a "Choose a theme" that turns
  // into the picked theme a moment later would jump under the coach's thumb.
  if (isLoading) return null;
  return <GameThemesControl themes={themes} onChange={save} variant={variant} />;
}
