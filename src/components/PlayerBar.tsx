'use client';

import React from 'react';
import PlayerDisk from './PlayerDisk'; // Import the PlayerDisk component
import type { Player } from '@/types'; // Import the Player type from central types
import { Audiowide } from 'next/font/google';
import type { GameEvent } from '@/types'; // Correctly import GameEvent type

// Title font matching StartScreen
const titleFont = Audiowide({ subsets: ['latin'], weight: '400' }); 

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

const PlayerBar: React.FC<PlayerBarProps> = ({ players, onPlayerDragStartFromBar, selectedPlayerIdFromBar, onBarBackgroundClick, gameEvents, onPlayerTapInBar, onToggleGoalie }) => {
  // Toned down gradient colors for PlayerBar (subtle colors, not fully grayscale)
  const logoGradientPrimary = `conic-gradient(from calc(var(--holo-angle, 0deg) + var(--holo-start, 0deg)) at 50% 50%,
    #67e8f9 0deg,    /* Muted cyan */
    #86efac 60deg,   /* Muted green */
    #fde68a 120deg,  /* Muted yellow */
    #fdba74 180deg,  /* Muted orange */
    #f9a8d4 240deg,  /* Muted pink */
    #c4b5fd 300deg,  /* Muted purple */
    #67e8f9 360deg   /* Loop back to cyan */
  )`;

  const logoGradientSecondary = `conic-gradient(from calc(var(--holo-angle2, 0deg) + var(--holo-start, 0deg)) at 50% 50%,
    rgba(103,232,249,0.25) 0deg,
    rgba(134,239,172,0.2) 90deg,
    rgba(249,168,212,0.25) 180deg,
    rgba(253,186,116,0.2) 270deg,
    rgba(103,232,249,0.25) 360deg
  )`;

  const logoGradientTertiary = `conic-gradient(from calc(var(--holo-angle3, 0deg) + var(--holo-start, 0deg)) at 50% 50%,
    rgba(196,181,253,0.15) 0deg,
    rgba(253,224,138,0.1) 120deg,
    rgba(134,239,172,0.1) 240deg,
    rgba(196,181,253,0.15) 360deg
  )`;
  return (
    <div 
      data-testid="player-bar"
      className="bg-gradient-to-b from-slate-800 to-slate-900/85 backdrop-blur-md pl-4 pr-2 py-0.5 flex items-center space-x-3 flex-shrink-0 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-700/80 scrollbar-track-slate-800/50 shadow-lg border-b border-slate-700/50"
      onClick={(e) => {
        // Check if the click target is the div itself (the background)
        if (e.target === e.currentTarget && onBarBackgroundClick) {
          onBarBackgroundClick();
        }
      }}
    >
      {/* Team Name Display/Edit */}
      <div
        className="flex flex-col items-center justify-center flex-shrink-0 py-1"
        onClick={() => {
          // Also deselect player when clicking the logo/team name area
          if (onBarBackgroundClick) {
            onBarBackgroundClick();
          }
        }}
      >
        <h1
          className={`${titleFont.className} font-extrabold tracking-tight leading-none text-center`}
          style={{ letterSpacing: '0.015em', fontSize: '0.9rem', lineHeight: '0.95' }}
        >
          <span
            className="logo-line start-logo-gradient-animate"
            data-text="Match"
            style={{
              ['--holo-start' as string]: '0deg',
              background: `${logoGradientPrimary}, ${logoGradientSecondary}, ${logoGradientTertiary}`,
              backgroundBlendMode: 'screen',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Match
          </span>
          <span
            className="logo-line start-logo-gradient-animate"
            data-text="Ops"
            style={{
              ['--holo-start' as string]: '45deg',
              background: `${logoGradientPrimary}, ${logoGradientSecondary}, ${logoGradientTertiary}`,
              backgroundBlendMode: 'screen',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Ops
          </span>
          <span
            className="logo-line start-logo-gradient-animate"
            data-text="Local"
            style={{
              ['--holo-start' as string]: '95deg',
              background: `${logoGradientPrimary}, ${logoGradientSecondary}, ${logoGradientTertiary}`,
              backgroundBlendMode: 'screen',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Local
          </span>
        </h1>
      </div>

      {/* Separator */}
      <div className="border-l border-slate-600 h-16 self-center"></div>

      {/* Player Disks */}
      <div className="flex items-center space-x-1"> 
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
};

export default PlayerBar; 