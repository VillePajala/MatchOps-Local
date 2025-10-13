'use client';

import React from 'react';
import Image from 'next/image';
import PlayerDisk from './PlayerDisk'; // Import the PlayerDisk component
import type { Player } from '@/types'; // Import the Player type from central types
// import { Audiowide } from 'next/font/google'; // Commented out - was used for animated text
import type { GameEvent } from '@/types'; // Correctly import GameEvent type

// Title font matching StartScreen
// const titleFont = Audiowide({ subsets: ['latin'], weight: '400' }); // Commented out - was used for animated text 

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
  /* Commented out - was used for animated text
  // Exact same gradient colors as StartScreen
  const logoGradientPrimary = `conic-gradient(from calc(var(--holo-angle, 0deg) + var(--holo-start, 0deg)) at 50% 50%,
    #22d3ee 0deg,    // Cyan
    #a3e635 60deg,   // Lime
    #fde047 120deg,  // Yellow
    #f97316 180deg,  // Orange
    #e83d6d 240deg,  // Magenta
    #8b5cf6 300deg,  // A brighter, distinct Violet
    #22d3ee 360deg   // Cyan (to loop)
  )`;

  const logoGradientSecondary = `conic-gradient(from calc(var(--holo-angle2, 0deg) + var(--holo-start, 0deg)) at 50% 50%,
    rgba(34,211,238,0.4) 0deg,     // Cyan
    rgba(163,230,53,0.35) 90deg,   // Lime
    rgba(232,61,109,0.4) 180deg,   // Magenta
    rgba(253,224,71,0.35) 270deg,  // Yellow
    rgba(34,211,238,0.4) 360deg    // Cyan (to loop)
  )`;

  const logoGradientTertiary = `conic-gradient(from calc(var(--holo-angle3, 0deg) + var(--holo-start, 0deg)) at 50% 50%,
    rgba(236,72,153,0.2) 0deg,
    rgba(234,179,8,0.15) 120deg,
    rgba(132,204,22,0.15) 240deg,
    rgba(236,72,153,0.2) 360deg
  )`;
  */
  return (
    <div
      data-testid="player-bar"
      className="relative pl-4 pr-2 py-0.5 flex items-center space-x-3 flex-shrink-0 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-700/80 scrollbar-track-slate-800/50 shadow-lg border-b border-slate-700/50 backdrop-blur-md"
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
      {/* Team Logo */}
      <div
        className="relative flex items-center justify-center flex-shrink-0 py-0.5 px-0.5 z-10"
        onClick={() => {
          // Also deselect player when clicking the logo/team name area
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

        {/* OLD ANIMATED TEXT - Commented out for easy restoration
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
        */}
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
};

export default PlayerBar; 
