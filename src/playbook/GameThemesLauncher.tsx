'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import PlaybookLibrary from './PlaybookLibrary';
import { GameThemePresentation } from './GameThemesControl';
import { useGameThemes } from './useGameThemes';
import { usePlaybooks } from './usePlaybooks';
import { availableConcepts, resolveGameThemes } from './resolveGameThemes';
import type { GameTheme } from './gameThemeTypes';

/**
 * Opens a saved game's themes from the match view's menu ("Ottelun teemat"):
 * the presentation of the picked themes in pick order (in the remembered focus
 * mode), or - when none is picked, or none of the picked can be shown any
 * more - the theme picker, after which the new pick plays straight away.
 *
 * Mounted by the host while open; `onClose` when the coach is done with
 * whatever opened. Rendered to document.body, outside the menu's side panel
 * (the panel's drag handlers would otherwise see the overlays' touches).
 * Lazily loaded, for accounts with the playbook flag only.
 */
export interface GameThemesLauncherProps {
  gameId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function GameThemesLauncher({ gameId, isOpen, onClose }: GameThemesLauncherProps) {
  const { themes, isLoading, save } = useGameThemes(gameId);
  const { playbooks, status } = usePlaybooks();
  /** What the coach picked here, which then plays instead of the stored themes. */
  const [picked, setPicked] = useState<GameTheme[] | null>(null);

  const source = picked ?? themes;
  const concepts = useMemo(() => availableConcepts(resolveGameThemes(source, playbooks)), [source, playbooks]);

  const done = useCallback(
    (next: GameTheme[]) => {
      // Saved like the game-settings picker (local-first; a failed save is logged and
      // rolled back by useGameThemes). The pick plays either way.
      void save(next);
      if (next.length > 0) setPicked(next);
      else onClose();
    },
    [save, onClose],
  );

  // Nothing until the stored themes are known, and - with themes picked -
  // until the playbooks are, so a theme still loading never reads as gone.
  if (!isOpen || isLoading || typeof document === 'undefined') return null;
  if (concepts.length === 0 && source.length > 0 && status === 'loading') return null;
  return createPortal(
    concepts.length > 0 ? (
      <GameThemePresentation concepts={concepts} onClose={onClose} />
    ) : (
      // None picked, or none of the picked can be shown any more (access
      // withdrawn): the picker.
      <PlaybookLibrary isOpen onClose={onClose} selection={{ initial: themes, onDone: done }} />
    ),
    document.body,
  );
}
