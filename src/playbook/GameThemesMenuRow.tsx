'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlinePlayCircle } from 'react-icons/hi2';
import { useGameThemes } from './useGameThemes';

/**
 * "Ottelun teemat" in the match view's menu: the current game's Playbook
 * themes, with the number picked as a badge. The row only asks for them to be
 * opened; GameThemesLauncher (mounted outside the side panel) plays or picks.
 * Lazily loaded, for accounts with the playbook flag only.
 */
export interface GameThemesMenuRowProps {
  gameId: string;
  onOpen: () => void;
  /** The menu's own row and icon classes, so the row looks like its neighbours. */
  className: string;
  iconClassName: string;
}

export default function GameThemesMenuRow({ gameId, onOpen, className, iconClassName }: GameThemesMenuRowProps) {
  const { t } = useTranslation();
  const { themes } = useGameThemes(gameId);
  const count = themes.length;
  return (
    <button type="button" onClick={onOpen} className={className} data-testid="menu-game-themes">
      <HiOutlinePlayCircle className={iconClassName} aria-hidden="true" />
      {t('playbook.themes.menuItem', 'Match themes')}
      {count > 0 && (
        <span
          className="ml-auto flex h-6 min-w-6 items-center justify-center rounded-full bg-action/15 px-2 text-[13px] font-semibold tabular-nums text-action"
          data-testid="menu-game-themes-count"
          aria-label={t('playbook.themes.chosenCount', '{{n}} chosen', { n: count })}
        >
          {count}
        </span>
      )}
    </button>
  );
}
