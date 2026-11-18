'use client';

import React from 'react';
import PlayerDisk from './PlayerDisk'; // Import the PlayerDisk component
import type { Player } from '@/types'; // Import the Player type from central types
import type { GameEvent } from '@/types'; // Correctly import GameEvent type

// Define props for PlayerBar
interface PlayerBarProps {
  players: Player[];
  onPlayerDragStartFromBar?: (player: Player) => void;
  selectedPlayerIdFromBar?: string | null; 
  onBarBackgroundClick?: () => void;
  gameEvents: GameEvent[];
  onPlayerTapInBar?: (player: Player) => void;
  onToggleGoalie?: (playerId: string) => void;
  /** Players already on the pitch: shown dimmed, in their usual place. */
  onFieldPlayerIds?: ReadonlySet<string>;
}

// Placeholder data - this would eventually come from state/localStorage
// const availablePlayers = [
//   { id: 'p1', name: 'Player 1' },
//   { id: 'p2', name: 'Player 2' },
//   { id: 'p3', name: 'Player 3' },
//   { id: 'p4', name: 'Player 4' },
//   { id: 'p5', name: 'Player 5' },
//   { id: 'p6', name: 'Player 6' },
//   { id: 'p7', name: 'Player 7' },
//   { id: 'p8', name: 'Player 8' },
//   { id: 'p9', name: 'Player 9' },
//   { id: 'p10', name: 'Player 10' },
//   { id: 'p11', name: 'Player 11' },
// ];

const PlayerBar: React.FC<PlayerBarProps> = React.memo(({ players, onPlayerDragStartFromBar, selectedPlayerIdFromBar, onBarBackgroundClick, gameEvents, onPlayerTapInBar, onToggleGoalie, onFieldPlayerIds }) => {
  return (
    // The player bar row of the match view's top panel. It sits on the
    // panel's frosted glass, so it paints no background of its own. 46px
    // discs at a 9px gap: on a phone the last visible disc is cut about in
    // half by the edge, which says "this row scrolls".
    <div
      data-testid="player-bar"
      className="relative h-[68px] pl-2.5 pr-2.5 flex items-center gap-[9px] flex-shrink-0 overflow-x-auto overflow-y-hidden whitespace-nowrap scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
      onClick={(e) => {
        // Check if the click target is the div itself (the background)
        if (e.target === e.currentTarget && onBarBackgroundClick) {
          onBarBackgroundClick();
        }
      }}
    >
      {/* Player Disks */}
      <div className="relative flex items-center gap-[9px] z-10">
        {players.map(player => (
          <PlayerDisk
            key={player.id}
            id={player.id}
            fullName={player.name}
            nickname={player.nickname}
            color={player.color}
            isGoalie={player.isGoalie}
            onPlayerDragStartFromBar={onPlayerDragStartFromBar}
            selectedPlayerIdFromBar={selectedPlayerIdFromBar}
            gameEvents={gameEvents}
            onPlayerTapInBar={onPlayerTapInBar}
            onToggleGoalie={onToggleGoalie}
            dimmed={onFieldPlayerIds?.has(player.id) ?? false}
          />
        ))}
      </div>
    </div>
  );
});

PlayerBar.displayName = 'PlayerBar';

export default PlayerBar; 
