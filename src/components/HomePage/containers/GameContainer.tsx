import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAssessmentsEnabled } from '@/hooks/useAssessmentsEnabled';
import ErrorBoundary from '@/components/ErrorBoundary';
import PlayerBar from '@/components/PlayerBar';
import GameInfoBar from '@/components/GameInfoBar';
import ControlBar from '@/components/ControlBar';
import type { Player } from '@/types';
import type { GameContainerViewModel } from '@/viewModels/gameContainer';
import { FieldContainer } from './FieldContainer';
import type { FieldContainerProps } from './FieldContainer';
import { useTeamsQuery } from '@/hooks/useTeamQueries';

const barStyle = 'flex-shrink-0 bg-slate-800 border-b border-white/10';
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
  const assessmentsEnabled = useAssessmentsEnabled();

  // The current team's kit colour, when they have one. Resolved here rather
  // than plumbed through the view model: this container already receives the
  // session state on fieldProps, and a colour nobody has set is the common
  // case - not worth a new prop on every layer above.
  const { data: teams } = useTeamsQuery();
  // gameSessionState is genuinely absent before a game loads - the shell
  // renders without it, which is what GameContainer's own test asserts.
  const currentTeamId = fieldProps.gameSessionState?.teamId;
  const currentTeamColor = currentTeamId
    ? teams?.find((tm) => tm.id === currentTeamId)?.color
    : undefined;

  return (
    <main className="flex flex-col h-full min-h-[100svh] bg-slate-900 text-slate-50" data-testid="home-page">
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
          teamColor={currentTeamColor}
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
        {/* 3.1: the planner entry left the match menu (reachability: it
            lives on Home/Pelit - it creates games). */}
        <ControlBar
          {...controlBarProps}
          onOpenPlayerAssessmentModal={assessmentsEnabled ? controlBarProps.onOpenPlayerAssessmentModal : undefined}
        />
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
