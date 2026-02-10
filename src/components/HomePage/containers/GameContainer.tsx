import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import ErrorBoundary from '@/components/ErrorBoundary';
import PlayerBar from '@/components/PlayerBar';
import GameInfoBar from '@/components/GameInfoBar';
import ControlBar from '@/components/ControlBar';
import type { Player } from '@/types';
import type { GameContainerViewModel } from '@/viewModels/gameContainer';
import { FieldContainer } from './FieldContainer';
import type { FieldContainerProps } from './FieldContainer';

const barStyle = 'flex-shrink-0 bg-slate-800 border-b border-slate-700';
type ControlBarProps = React.ComponentProps<typeof ControlBar>;

export interface GameContainerProps {
  playerBar: GameContainerViewModel['playerBar'];
  gameInfo: GameContainerViewModel['gameInfo'];
  onPlayerDragStartFromBar: (player: Player) => void;
  onBarBackgroundClick: () => void;
  onPlayerTapInBar: (player: Player) => void;
  onToggleGoalie: (playerId: string) => void;
  onTeamNameChange: (name: string) => void;
  onOpponentNameChange: (name: string) => void;
  orphanedGameInfo: { teamId: string; teamName?: string } | null;
  onOpenTeamReassignModal: () => void;
  fieldProps: FieldContainerProps;
  controlBarProps: ControlBarProps;
}

export function GameContainer({
  playerBar,
  gameInfo,
  onPlayerDragStartFromBar,
  onBarBackgroundClick,
  onPlayerTapInBar,
  onToggleGoalie,
  onTeamNameChange,
  onOpponentNameChange,
  orphanedGameInfo: _orphanedGameInfo,
  onOpenTeamReassignModal: _onOpenTeamReassignModal,
  fieldProps,
  controlBarProps,
}: GameContainerProps) {
  const { t } = useTranslation();

  return (
    <main className="flex flex-col h-full min-h-[100svh] bg-slate-900 text-slate-50 lg:max-w-5xl lg:mx-auto lg:w-full lg:my-2 lg:min-h-0 lg:h-[calc(100svh-1rem)] lg:rounded-xl lg:border lg:border-slate-700/40 lg:shadow-[0_4px_30px_rgba(0,0,0,0.5),0_0_80px_rgba(99,102,241,0.06)] lg:overflow-hidden" data-testid="home-page">
      <div className={barStyle}>
        <ErrorBoundary
          fallback={
            <div className="p-4 bg-red-900/20 border border-red-700 text-red-300">
              {t('errors.playerBarCrashed', 'Player bar crashed. Please refresh the page.')}
            </div>
          }
        >
          <PlayerBar
            players={playerBar.players}
            onPlayerDragStartFromBar={onPlayerDragStartFromBar}
            selectedPlayerIdFromBar={playerBar.selectedPlayerIdFromBar}
            onBarBackgroundClick={onBarBackgroundClick}
            gameEvents={playerBar.gameEvents}
            onPlayerTapInBar={onPlayerTapInBar}
            onToggleGoalie={onToggleGoalie}
          />
        </ErrorBoundary>
        <GameInfoBar
          teamName={gameInfo.teamName}
          opponentName={gameInfo.opponentName}
          homeScore={gameInfo.homeScore}
          awayScore={gameInfo.awayScore}
          onTeamNameChange={onTeamNameChange}
          onOpponentNameChange={onOpponentNameChange}
          homeOrAway={gameInfo.homeOrAway}
        />
      </div>

      {/* Orphaned game banner removed - warning in TeamManagerModal is sufficient.
          Functionality (orphanedGameInfo, TeamReassignModal) kept for potential future use. */}

      <FieldContainer {...fieldProps} />

      <div className={barStyle}>
        <ControlBar {...controlBarProps} />
      </div>

      {/* Safe area bottom cover - rendered via portal to same stacking context as FormationPicker.
          Covers the gap between ControlBar and screen bottom in PWA standalone mode.
          Uses 34px fixed height (typical safe area) + env() for extra safety.
          z-35 puts it above overlays (z-30) but below ControlBar (z-40). */}
      {typeof document !== 'undefined' && createPortal(
        <div
          className="fixed bottom-0 inset-x-0 bg-gradient-to-b from-slate-800 to-slate-900 pointer-events-none"
          style={{ height: 'max(34px, env(safe-area-inset-bottom, 34px))', zIndex: 35 }}
          aria-hidden="true"
        />,
        document.body
      )}
    </main>
  );
}
