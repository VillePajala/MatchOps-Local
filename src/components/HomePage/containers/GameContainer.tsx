/**
 * GameContainer Component
 *
 * Main container for game UI rendering.
 * Extracted from HomePage.tsx as part of P0 refactoring.
 *
 * This component handles:
 * - Player bar and game info display
 * - Soccer field rendering
 * - Control bar
 * - Timer overlay
 * - First-time user experience
 * - Orphaned game warnings
 *
 * @param props - Game state and handlers from useGameOrchestration
 */

import React from 'react';

// Components
import PlayerBar from '@/components/PlayerBar';
import ControlBar from '@/components/ControlBar';
import GameInfoBar from '@/components/GameInfoBar';
import ErrorBoundary from '@/components/ErrorBoundary';
import { FieldContainer } from './FieldContainer';
import { DEFAULT_GAME_ID } from '@/config/constants';
import type { FieldContainerProps } from './FieldContainer';

const barStyle = 'flex-shrink-0 bg-slate-800 border-b border-slate-700';

type PlayerBarProps = React.ComponentProps<typeof PlayerBar>;
type GameInfoBarProps = React.ComponentProps<typeof GameInfoBar>;
type ControlBarProps = React.ComponentProps<typeof ControlBar>;

export interface GameContainerProps {
  gameInfoBarProps: GameInfoBarProps;
  playerBarProps: PlayerBarProps;
  fieldProps: FieldContainerProps;
  controlBarProps: ControlBarProps;
  currentGameId?: string | null;
}

export function GameContainer(props: GameContainerProps) {
  const { gameInfoBarProps, playerBarProps, fieldProps, controlBarProps, currentGameId } = props;

  if (!fieldProps.gameSessionState) return null;

  return (
    <main className="flex flex-col h-[100dvh] bg-slate-900 text-slate-50" data-testid="home-page">
      {/* Top Section: Player Bar, Game Info */}
      <div className={barStyle}>
        <ErrorBoundary fallback={
          <div className="p-4 bg-red-900/20 border border-red-700 text-red-300">
            Player bar crashed. Please refresh the page.
          </div>
        }>
          <PlayerBar {...playerBarProps} />
        </ErrorBoundary>
        <GameInfoBar {...gameInfoBarProps} />
      </div>

      <FieldContainer {...fieldProps} />

      {/* Bottom Section: Control Bar (always visible) */}
      <div className={barStyle}>
        <ControlBar
          {...controlBarProps}
          isGameLoaded={!!currentGameId && currentGameId !== DEFAULT_GAME_ID}
        />
      </div>
    </main>
  );
}

// First Game Guide Component (extracted for clarity)
