import React from 'react';
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
  orphanedGameInfo,
  onOpenTeamReassignModal,
  fieldProps,
  controlBarProps,
}: GameContainerProps) {
  const { t } = useTranslation();

  return (
    <main className="flex flex-col h-[100dvh] bg-slate-900 text-slate-50" data-testid="home-page">
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
    </main>
  );
}
