import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getFieldConfig } from '@/config/fieldConfigs';
import { getFieldEdgeColors } from '@/utils/fieldDrawing';
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

  // STACKED MATCH VIEW: the top panel (score row over the player bar), then
  // the pitch, then the control strip - top to bottom, nothing overlapping.
  // The pitch box gets exactly the height between the two, so every line, the
  // subs rail and every disc stay fully visible; relative player coordinates
  // map to that box as they always have.
  const gameType = fieldProps.gameSessionState?.gameType;
  // The pitch box is painted in the field's own edge colours under the
  // canvas, so a sub-pixel gap while the canvas resizes shows grass, not navy.
  const surround = useMemo(() => getFieldEdgeColors(getFieldConfig(gameType)), [gameType]);
  // Players on the pitch are drawn solid in the bar, the bench hollow (same order).
  const playersOnField = fieldProps.fieldVM?.playersOnField;
  const onFieldPlayerIds = useMemo(() => new Set((playersOnField ?? []).map((p) => p.id)), [playersOnField]);

  return (
    <main
      className="relative flex flex-col h-full min-h-[100svh] overflow-hidden bg-carbon text-slate-50"
      data-testid="home-page"
    >
      {/* Top panel: the score over the player bar, a solid block above the
          pitch, straight under the status bar. No z-index, filter or
          backdrop-filter, so the full-screen timer view (fixed, z-30) still
          covers it. */}
      <div
        className="flex-none bg-surface border-b border-hairline font-ui"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        data-testid="match-top-panel"
      >
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
            onFieldPlayerIds={onFieldPlayerIds}
          />
        </ErrorBoundary>
      </div>

      {/* The pitch: exactly the space between the panel and the control strip. */}
      <div
        className="relative flex-1 min-h-0"
        style={{ background: `linear-gradient(180deg, ${surround.top} 0%, ${surround.top} 50%, ${surround.bottom} 50%, ${surround.bottom} 100%)` }}
        data-testid="match-pitch-area"
      >
        <FieldContainer {...fieldProps} />
      </div>

      {/* Orphaned game banner removed - warning in TeamManagerModal is sufficient.
          Functionality (orphanedGameInfo, TeamReassignModal) kept for potential future use. */}

      {/* The control strip below the pitch, with the capsule centred in it.
          This wrapper deliberately has NO z-index, filter or backdrop-filter:
          ControlBar's side menu and its scrim are `fixed`, and any of those
          would become their containing block / stacking context and trap
          them here. */}
      <div
        className="flex-none flex justify-center items-center px-2 pt-3 border-t border-hairline"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
        data-testid="match-control-strip"
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
          area, + env() for extra safety). The app's carbon, like the control
          strip it continues; z-0 keeps it under the capsule (z-40) and under
          the full-screen timer and formation views (z-30). */}
      {typeof document !== 'undefined' && createPortal(
        <div
          className="fixed bottom-0 inset-x-0 pointer-events-none bg-carbon"
          style={{ height: 'max(34px, env(safe-area-inset-bottom, 34px))', zIndex: 0 }}
          aria-hidden="true"
        />,
        document.body
      )}
    </main>
  );
}
