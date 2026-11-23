'use client';

import React from 'react';
import GameThemesControl from './GameThemesControl';
import type { GameTheme } from './gameThemeTypes';

/**
 * Themes for a game that does not exist yet (the new-game form): the form
 * holds the list and stores it with the new game's id once it is created.
 * Lazily loaded, for flagged accounts only.
 */
export interface GameThemeFieldProps {
  value: GameTheme[];
  onChange: (themes: GameTheme[]) => void;
}

export default function GameThemeField({ value, onChange }: GameThemeFieldProps) {
  return <GameThemesControl themes={value} onChange={onChange} />;
}
