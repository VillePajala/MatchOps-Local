'use client';

import React, { useMemo } from 'react';
import { Player } from '@/types'; // Import Player from types
import { GameEvent } from '@/types'; // Import GameEvent type
import {
    HiOutlineShieldCheck, // Goalie icon
} from 'react-icons/hi2';

interface PlayerDiskProps {
  id: string;
  fullName: string;
  nickname?: string;
  color?: string;
  isGoalie?: boolean; // Add goalie status prop
  // Bar specific props
  onPlayerDragStartFromBar?: (player: Player) => void;
  selectedPlayerIdFromBar?: string | null;
  gameEvents: GameEvent[]; // Add gameEvents prop
  onPlayerTapInBar?: (player: Player) => void; // New prop for tap action
  onToggleGoalie?: (playerId: string) => void; // Need this prop
  /**
   * Not on the pitch (the bench): drawn hollow - a light ring on a faint fill -
   * while players on the pitch stay solid. Never dimmed; same place, same order.
   */
  onBench?: boolean;
}

// Goals / assists badge: a small navy chip on the disc's edge. Not amber -
// amber means "selected" in the match view.
const StatBadge: React.FC<{ count: number, toneClasses: string, positionClasses: string, title: string }> = ({ count, toneClasses, positionClasses, title }) => (
  <div
    title={title}
    className={`absolute ${positionClasses} min-w-5 h-5 px-1 rounded-full ${toneClasses} flex items-center justify-center font-ui text-xs font-bold shadow-md pointer-events-none z-20`}
  >
    {count}
  </div>
);

/**
 * The colour every disc used to default to. Without a colour of the player's
 * own (or with this legacy default stored) the disc takes the match view's
 * default look - white with a navy name; a coach-chosen colour is honoured.
 */
const LEGACY_DEFAULT_DISC_COLOR = '#7e22ce';

const PlayerDisk: React.FC<PlayerDiskProps> = React.memo(({
  id,
  fullName,
  nickname,
  color = '#7E22CE', // Default to purple-700 if no color passed
  isGoalie = false, // Default goalie status
  onPlayerDragStartFromBar,
  selectedPlayerIdFromBar,
  gameEvents,
  onPlayerTapInBar,
  onToggleGoalie, // Destructure goalie toggle handler
  onBench = false,
}) => {
  // Calculate goals and assists for this player
  const playerStats = useMemo(() => {
    const goals = gameEvents.filter(event => event.type === 'goal' && event.scorerId === id).length;
    const assists = gameEvents.filter(event => event.type === 'goal' && event.assisterId === id).length;
    return { goals, assists };
  }, [gameEvents, id]);

  // --- Modified Event Handlers for Selection ONLY ---
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();

    // Single click selects
    if (onPlayerTapInBar) {
      onPlayerTapInBar({ id, name: fullName, nickname, color, isGoalie });
    }
  };

  const handleTouchStart = () => {
     // Basic start, no complex logic needed now
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
     e.preventDefault();

     // Simple tap selects
     if (onPlayerTapInBar) {
      onPlayerTapInBar({ id, name: fullName, nickname, color, isGoalie });
     }
  };

  // --- Goalie Toggle Icon Handler (Keep this) ---
  const handleToggleGoalieClick = (e: React.MouseEvent | React.TouchEvent) => {
    // On touch devices a touchEnd is followed by a synthetic click; without
    // preventDefault the toggle fires twice and cancels itself out. Only
    // suppress that on the touch event — calling preventDefault on the click
    // (incl. keyboard-driven clicks) is unnecessary and semantically off.
    if ('touches' in e) {
      e.preventDefault();
    }
    e.stopPropagation(); // keeps the tap from selecting the disk
    if (onToggleGoalie) {
      onToggleGoalie(id);
    }
  };

  // HTML Drag and Drop (Keep this)
  const handleDragStart = () => {
    if (!onPlayerDragStartFromBar) return;
    const playerData: Player = { id, name: fullName, nickname, color, isGoalie };
    onPlayerDragStartFromBar(playerData);
  };

  // Conditional styling. Same disc as the pitch draws: white with a navy name
  // by default, the keeper navy inside a white ring, a coach-chosen colour
  // with a white name.
  const isInBar = !!onPlayerDragStartFromBar;
  const isSelected = selectedPlayerIdFromBar === id;
  const hasCustomColor = !!color && color.trim().toLowerCase() !== LEGACY_DEFAULT_DISC_COLOR;
  const diskSizeClasses = isInBar ? "w-[50px] h-[50px]" : "w-20 h-20 p-2";
  // A bench player is drawn hollow. The keeper keeps the keeper's look wherever
  // they are; a coach-chosen colour carries over into the hollow disc's ring.
  const isHollow = onBench && !isGoalie;
  // PePo club preview: club-violet discs, the keeper in PePo yellow inside a
  // violet ring (same as the pitch).
  const fill = isGoalie
    ? 'radial-gradient(circle at 35% 28%, #fff27a, #fadd15 55%, #f2b705)'
    : isHollow
      ? 'rgb(255 255 255 / 0.05)'
      : hasCustomColor
        ? color
        : 'radial-gradient(circle at 35% 28%, #a6339a, #822174 55%, #5c1653)';
  const nameColorClass = isHollow ? 'text-[#e5e9f0]' : isGoalie ? 'text-[#2a0826]' : 'text-white';
  // The disc's own ring (inset): the keeper's violet ring, the hollow disc's
  // light (or kit-coloured) ring, or none.
  const innerRing = isGoalie
    ? 'inset 0 0 0 3px #822174'
    : isHollow
      ? `inset 0 0 0 2px ${hasCustomColor ? color : 'rgb(229 233 240 / 0.6)'}`
      : null;
  // Selected: a gap in the panel's colour, then the amber ring - the one amber
  // thing in the bar. Otherwise a drop shadow (none under a hollow disc).
  const outer = isSelected
    ? '0 0 0 3px var(--color-surface), 0 0 0 6px var(--color-action)'
    : isGoalie
      ? '0 8px 12px -6px rgb(0 0 0 / 0.6)'
      : isHollow
        ? null
        : '0 5px 9px -5px rgb(12 4 13 / 0.9)';
  const shadow = [innerRing, outer].filter(Boolean).join(', ') || undefined;
  const displayName = nickname || fullName;
  // Short names (5 letters or fewer) get a size up; longer ones keep 15px.
  const nameSizeClass = isInBar ? (Array.from(displayName).length <= 5 ? 'text-base' : 'text-[15px]') : 'text-base';

  return (
    <div
      className={`relative ${diskSizeClasses} flex-none rounded-full flex flex-col items-center justify-center cursor-pointer transition-[box-shadow,background] duration-150 ease-in-out`}
      style={{ background: fill, boxShadow: shadow }}
      data-bench={onBench ? 'true' : undefined}
      draggable={isInBar ? "true" : "false"}
      onDragStart={handleDragStart}
      // Use simplified selection handlers
      onMouseDown={isInBar ? handleMouseDown : undefined}
      onTouchStart={isInBar ? handleTouchStart : undefined}
      onTouchEnd={isInBar ? handleTouchEnd : undefined}
      onTouchCancel={isInBar ? handleTouchEnd : undefined} // Might still need cancel to deselect? Revisit if needed.
    >
      {/* Goalie Toggle Icon (Only when selected). The visible chip is 28px;
          the ::before pad takes its touch target to 44px. */}
      {isSelected && onToggleGoalie && (
        <button
          title={isGoalie ? "Unset Goalie" : "Set Goalie"}
          className="absolute -top-[7px] -left-[7px] w-7 h-7 flex items-center justify-center rounded-full bg-surface-2 text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18),0_3px_6px_rgb(12_4_13/0.6)] z-10 before:absolute before:-inset-2 before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          onClick={handleToggleGoalieClick}
          onTouchEnd={handleToggleGoalieClick}
        >
          <HiOutlineShieldCheck className={`w-4 h-4 ${isGoalie ? 'text-white' : 'text-ink-2'}`} />
        </button>
      )}

      {/* Always render the name span */}
      <span
        className={`font-display font-bold ${nameSizeClass} tracking-[0.02em] ${nameColorClass} break-words text-center leading-none max-w-full px-1`}
      >
        {displayName} {/* Always display nickname or full name */}
      </span>

      {/* Stat Badges */}
      {playerStats.goals > 0 && (
        <StatBadge
          count={playerStats.goals}
          toneClasses="bg-carbon text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.3)]"
          positionClasses="-top-1 -right-1"
          title={`${playerStats.goals} Goals`}
        />
      )}
      {playerStats.assists > 0 && (
        <StatBadge
          count={playerStats.assists}
          toneClasses="bg-surface-2 text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]"
          positionClasses="-bottom-1 -right-1"
          title={`${playerStats.assists} Assists`}
        />
      )}
    </div>
  );
});

PlayerDisk.displayName = 'PlayerDisk';

export default PlayerDisk;