'use client';

import React from 'react';
import Image from 'next/image';
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

const PlayerBar: React.FC<PlayerBarProps> = React.memo(({ players, onPlayerDragStartFromBar, selectedPlayerIdFromBar, onBarBackgroundClick, gameEvents, onPlayerTapInBar, onToggleGoalie }) => {
  return (
    <div
      data-testid="player-bar"
      className="relative pl-2 pr-2 py-0.5 flex items-center space-x-1 flex-shrink-0 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-700/80 scrollbar-track-slate-800/50 shadow-lg border-b border-slate-700/50 backdrop-blur-md"
      style={{
        background: `
          linear-gradient(to bottom, rgba(56, 189, 248, 0.1), transparent, transparent),
          linear-gradient(to bottom, rgba(79, 70, 229, 0.1), rgba(79, 70, 229, 0.1)),
          linear-gradient(to bottom, rgb(30, 41, 59), rgba(15, 23, 42, 0.85))
        `
      }}
      onClick={(e) => {
        // Check if the click target is the div itself (the background)
        if (e.target === e.currentTarget && onBarBackgroundClick) {
          onBarBackgroundClick();
        }
      }}
    >
      {/* App Logo */}
      <div
        className="relative flex items-center justify-center flex-shrink-0 z-10"
        onClick={() => {
          // Deselect player when clicking the logo
          if (onBarBackgroundClick) {
            onBarBackgroundClick();
          }
        }}
      >
        <Image
          src="/logos/app-logo-yellow.png"
          alt="MatchOps Local"
          width={80}
          height={27}
          priority={true}
          className="h-auto w-[70px] sm:w-[84px] drop-shadow-lg"
        />
      </div>

      {/* Separator */}
      <div className="relative border-l border-slate-600 h-16 self-center z-10"></div>

      {/* Player Disks */}
      <div className="relative flex items-center space-x-1 z-10"> 
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
          />
        ))}
      </div>
    </div>
  );
});

PlayerBar.displayName = 'PlayerBar';

export default PlayerBar; 
