import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import ErrorBoundary from '@/components/ErrorBoundary';
import PlayerBar from '@/components/PlayerBar';
import GameInfoBar from '@/components/GameInfoBar';
import ControlBar from '@/components/ControlBar';
import PlaytimePlannerModal from '@/components/PlaytimePlannerModal';
import type { Player } from '@/types';
import type { GameContainerViewModel } from '@/viewModels/gameContainer';
import { FieldContainer } from './FieldContainer';
import type { FieldContainerProps } from './FieldContainer';

const barStyle = 'flex-shrink-0 bg-slate-800 border-b border-slate-700';
// Survives a remount of the game view (e.g. resume-from-background loading flash).
// Exported so sign-out / screen resets can clear it (otherwise the planner would
// auto-reopen the next time a game view mounts).
export const PLANNER_OPEN_KEY = 'matchops_planner_open';
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
  /** Flush the loaded game's debounced autosave (run before bulk re-apply reads storage). */
  onFlushLiveGame?: () => Promise<void>;
  /** Planner bulk re-apply rewrote these games in storage; refresh live state if one is loaded. */
  onLinkedGamesUpdated?: (gameIds: string[]) => void;
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
  onFlushLiveGame,
  onLinkedGamesUpdated,
}: GameContainerProps) {
  const { t } = useTranslation();
  // Playing-Time Planner is launched from the ControlBar hamburger menu; the modal
  // is owned here (the ControlBar's parent) so no handler threading is needed.
  //
  // Open-state is mirrored to sessionStorage so it survives a remount of the game
  // view. On resume from background (cloud mode) the app can briefly flash a
  // loading/auth-check screen, which unmounts this container and would otherwise
  // drop the planner. Restoring from sessionStorage reopens it automatically so
  // the coach never has to reopen it by hand.
  const [showPlanner, setShowPlanner] = useState(
    () => typeof window !== 'undefined' && window.sessionStorage.getItem(PLANNER_OPEN_KEY) === '1',
  );
  const openPlanner = useCallback(() => {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(PLANNER_OPEN_KEY, '1');
    setShowPlanner(true);
  }, []);
  const closePlanner = useCallback(() => {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(PLANNER_OPEN_KEY);
    setShowPlanner(false);
  }, []);

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
        <ControlBar {...controlBarProps} onOpenPlanner={openPlanner} />
      </div>

      {showPlanner && (
        <PlaytimePlannerModal
          isOpen
          onClose={closePlanner}
          onFlushLiveGame={onFlushLiveGame}
          onLinkedGamesUpdated={onLinkedGamesUpdated}
        />
      )}

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
