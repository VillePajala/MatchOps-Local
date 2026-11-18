import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import tinycolor from 'tinycolor2';
import { getFieldConfig } from '@/config/fieldConfigs';
import { matchGlassStyle } from '@/styles/modalStyles';
import { useAssessmentsEnabled } from '@/hooks/useAssessmentsEnabled';
import ErrorBoundary from '@/components/ErrorBoundary';
import PlayerBar from '@/components/PlayerBar';
import GameInfoBar from '@/components/GameInfoBar';
import ControlBar from '@/components/ControlBar';
import type { Player } from '@/types';
import type { GameContainerViewModel } from '@/viewModels/gameContainer';
import { FieldContainer } from './FieldContainer';
import type { FieldContainerProps } from './FieldContainer';

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

  // FULL-SCREEN PITCH. The canvas keeps its own box (FieldContainer: below
  // the top panel's lower edge, above the control capsule), so every player
  // coordinate means what it always meant. The grass beyond that box - under
  // the top panel, beside and under the capsule - is painted here in the
  // colours the field's own background has at its top and bottom edges, so
  // the pitch reads as one surface from edge to edge.
  const gameType = fieldProps.gameSessionState?.gameType;
  const surround = useMemo(() => {
    const base = getFieldConfig(gameType).style.fieldColor;
    const futsal = gameType === 'futsal';
    const top = tinycolor.mix(base, futsal ? '#000000' : '#ffffff', futsal ? 14 : 6).toHexString();
    const bottom = tinycolor.mix(base, '#000000', futsal ? 14 : 25).toHexString();
    return { top, bottom };
  }, [gameType]);

  return (
    <main
      className="relative h-full min-h-[100svh] overflow-hidden text-slate-50"
      style={{ background: `linear-gradient(180deg, ${surround.top} 0%, ${surround.top} 50%, ${surround.bottom} 50%, ${surround.bottom} 100%)` }}
      data-testid="home-page"
    >
      <FieldContainer {...fieldProps} />

      {/* Top panel: the score over the player bar, frosted navy over the
          grass. Below the timer view (z-30) so that view covers it. */}
      <div className={`absolute left-2 right-2 top-2 z-[26] rounded-[26px] overflow-hidden font-ui ${matchGlassStyle}`}>
        <GameInfoBar
          teamName={gameInfo.teamName}
          opponentName={gameInfo.opponentName}
          homeScore={gameInfo.homeScore}
          awayScore={gameInfo.awayScore}
          onTeamNameChange={onTeamNameChange}
          onOpponentNameChange={onOpponentNameChange}
          homeOrAway={gameInfo.homeOrAway}
        />
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
      </div>

      {/* Orphaned game banner removed - warning in TeamManagerModal is sufficient.
          Functionality (orphanedGameInfo, TeamReassignModal) kept for potential future use. */}

      {/* The control bar floats as a capsule over the grass. This wrapper
          deliberately has NO z-index, filter or backdrop-filter: ControlBar's
          side menu and its scrim are `fixed`, and any of those would become
          their containing block / stacking context and trap them here. The
          glass lives on the capsule element itself. */}
      <div
        className="absolute inset-x-0 flex justify-center px-2"
        style={{ bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* 3.1: the planner entry left the match menu (reachability: it
            lives on Home/Pelit - it creates games). */}
        <ControlBar
          {...controlBarProps}
          onOpenPlayerAssessmentModal={assessmentsEnabled ? controlBarProps.onOpenPlayerAssessmentModal : undefined}
          locationLat={fieldProps.gameSessionState?.locationLat}
          locationAddress={fieldProps.gameSessionState?.locationAddress}
          locationLng={fieldProps.gameSessionState?.locationLng}
        />
      </div>

      {/* Safe area bottom cover - rendered via portal so it also fills any gap
          below <main> in PWA standalone mode (34px fixed height, typical safe
          area, + env() for extra safety). Grass now, not a navy band, so the
          pitch still runs to the screen edge; z-0 keeps it under the capsule
          (z-40) and under the full-screen timer and formation views (z-30). */}
      {typeof document !== 'undefined' && createPortal(
        <div
          className="fixed bottom-0 inset-x-0 pointer-events-none"
          style={{ height: 'max(34px, env(safe-area-inset-bottom, 34px))', zIndex: 0, backgroundColor: surround.bottom }}
          aria-hidden="true"
        />,
        document.body
      )}
    </main>
  );
}
