import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import ModalPortal from '@/components/ModalPortal';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';
import GoalLogModal from '@/components/GoalLogModal';
const GameSettingsModal = dynamic(() => import('@/components/GameSettingsModal'));
import PlayerAssessmentModal from '@/components/PlayerAssessmentModal';
import ConfirmationModal from '@/components/ConfirmationModal';

// Lazy-loaded modals: these pull in heavy dependencies (recharts, xlsx, etc.)
// and are not visible on initial render
const GameStatsModal = dynamic(() => import('@/components/GameStatsModal'));
import type {
  Player,
  GameEvent,
  PlayerStatRow,
  SavedGamesCollection,
  Season,
  Tournament,
  Team,
  Personnel,
  PlayerAssessment,
  AppState,
  ShootoutKick,
  UpdateGameDetailsMutationVariables,
} from '@/types';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';
import type { AssessmentRatingStyle, AssessmentTemplate } from '@/types/settings';
import type { UseMutationResult } from '@tanstack/react-query';



interface ModalManagerState {
  isGoalLogModalOpen: boolean;
  isGameStatsModalOpen: boolean;
  isGameSettingsModalOpen: boolean;
  /** R3: wrap-up rows land scrolled to their section. */
  gameSettingsInitialSection?: 'roster' | 'report' | 'positions' | 'competition';
  isPlayerAssessmentModalOpen: boolean;
  isTeamReassignModalOpen: boolean;
  showNoPlayersConfirm: boolean;
  showResetFieldConfirm: boolean;
}

interface ModalManagerData {
  gameSessionState: GameSessionState;
  availablePlayers: Player[];
  playersForCurrentGame: Player[];
  savedGames: SavedGamesCollection;
  currentGameId: string | null;
  canReapplyPlan: boolean;
  teams: Team[];
  seasons: Season[];
  tournaments: Tournament[];
  masterRoster: Player[];
  personnel: Personnel[];
  playerAssessments: Record<string, PlayerAssessment>;
  availableTeams: Team[];
  orphanedGameInfo: { teamId: string; teamName?: string } | null;
  isPlayed: boolean;
  updateGameDetailsMutation?: UseMutationResult<AppState | null, Error, UpdateGameDetailsMutationVariables, unknown>;
}

interface ModalManagerHandlers {
  toggleGoalLogModal: () => void;
  addGoalEvent: (playerId: string | undefined, assistId?: string) => void;
  logOpponentGoal: (timeSeconds: number) => void;
  recalculateScore: () => void;
  updateGameEvent: (event: GameEvent) => void;
  deleteGameEvent: (eventId: string) => Promise<boolean>;
  toggleGameStatsModal: () => void;
  exportOneExcel: (gameId: string) => void;
  exportOneJson: (gameId: string) => void;
  closeGameSettingsModal: () => void;
  teamNameChange: (name: string) => void;
  opponentNameChange: (name: string) => void;
  gameDateChange: (date: string) => void;
  gameLocationChange: (location: string) => void;
  gameTimeChange: (time: string) => void;
  gameNotesChange: (notes: string) => void;
  playerPositionsChange: (positions: Record<string, string[]>) => void;
  ageGroupChange: (ageGroup: string) => void;
  tournamentLevelChange: (level: string) => void;
  tournamentSeriesIdChange: (seriesId: string | undefined) => void;
  teamIdChange: (teamId: string | undefined) => void;
  awardFairPlayCard: (playerId: string | null) => void;
  setNumberOfPeriods: (periods: number) => void;
  setPeriodDuration: (minutes: number) => void;
  setDemandFactor: (factor: number) => void;
  setSeasonId: (id: string | undefined) => void;
  setTournamentId: (id: string | undefined) => void;
  setLeagueId: (id: string | undefined) => void;
  setCustomLeagueName: (name: string | undefined) => void;
  setGameType: (gameType: import('@/types').GameType) => void;
  setGender: (gender: import('@/types').Gender | undefined) => void;
  setWentToOvertime: (value: boolean) => void;
  setWentToPenalties: (value: boolean) => void;
  setShootoutKicks: (kicks: ShootoutKick[]) => void;
  setHomeOrAway: (value: 'home' | 'away') => void;
  setIsPlayed: (played: boolean) => void;
  updateSelectedPlayers: (playerIds: string[]) => void;
  /** 3.2 roster bridge: club write from the game picker. */
  addPlayerToClubRoster: (name: string, nickname?: string) => Promise<Player | null>;
  reapplyPlan: () => void | Promise<void>;
  setGamePersonnel?: (personnelIds: string[]) => void;
  closePlayerAssessmentModal: () => void;
  savePlayerAssessment: (playerId: string, assessment: Partial<PlayerAssessment>) => void;
  deletePlayerAssessment: (playerId: string) => void;
  teamReassignment: (teamId: string | null) => void;
  setIsTeamReassignModalOpen: (open: boolean) => void;
  confirmNoPlayers: () => void;
  setShowNoPlayersConfirm: (open: boolean) => void;
  setShowResetFieldConfirm: (open: boolean) => void;
  resetFieldConfirmed: () => void;
  openSettingsModal: () => void;
  /** W6: wrap-up rows navigate to where the item is completed. */
  wrapUpToGameSettings: (section: 'roster' | 'report' | 'positions' | 'competition') => void;
  wrapUpToAssessments: () => void;
}

export interface ModalManagerProps {
  state: ModalManagerState;
  data: ModalManagerData;
  handlers: ModalManagerHandlers;
  /** Assessment rating presentation style (default 'words'). */
  ratingStyle?: AssessmentRatingStyle;
  /** Assessment metric template (default 'balanced'). */
  assessmentTemplate?: AssessmentTemplate;
}

export function ModalManager({ state, data, handlers, ratingStyle = 'words', assessmentTemplate = 'balanced' }: ModalManagerProps) {
  const { t } = useTranslation();

  // Hardware-back contract (modal governance, audited in 3.1): MATCH-scope
  // modals register on the SAME stack as the lifted ones, so they sit above
  // the page-level match entry ("back exits to Home") and close first -
  // back must never exit the match while one of these is open.
  useModalHardwareBack(state.isGoalLogModalOpen, handlers.toggleGoalLogModal);
  useModalHardwareBack(state.isGameStatsModalOpen, handlers.toggleGameStatsModal);
  useModalHardwareBack(state.isGameSettingsModalOpen, handlers.closeGameSettingsModal);
  useModalHardwareBack(state.isPlayerAssessmentModalOpen, handlers.closePlayerAssessmentModal);
  useModalHardwareBack(state.isTeamReassignModalOpen, () => handlers.setIsTeamReassignModalOpen(false));
  useModalHardwareBack(state.showNoPlayersConfirm, () => handlers.setShowNoPlayersConfirm(false));
  useModalHardwareBack(state.showResetFieldConfirm, () => handlers.setShowResetFieldConfirm(false));

  return (
    <ModalPortal>
      <>
        {/* TrainingResources + RulesDirectory LIFTED to ClubModalsHost (L.0a),
            Settings + Instructions + hard-reset confirm LIFTED there too (L.0b)
            - never render them here again (dual-render guard). */}
        {/* PersonnelManagerModal + SeasonTournamentManagementModal LIFTED to
            ClubModalsHost (L.1); RosterSettingsModal + TeamManagerModal LIFTED
            there too (L.2) - never render them here again (dual-render guard). */}
        <GoalLogModal
          isOpen={state.isGoalLogModalOpen}
          onClose={handlers.toggleGoalLogModal}
          onLogGoal={handlers.addGoalEvent}
          onLogOpponentGoal={handlers.logOpponentGoal}
          availablePlayers={data.playersForCurrentGame}
          currentTime={data.gameSessionState.timeElapsedInSeconds}
          currentGameId={data.currentGameId}
          gameEvents={data.gameSessionState.gameEvents}
          homeScore={data.gameSessionState.homeScore}
          awayScore={data.gameSessionState.awayScore}
          homeOrAway={data.gameSessionState.homeOrAway}
          onUpdateGameEvent={handlers.updateGameEvent}
          onDeleteGameEvent={handlers.deleteGameEvent}
          onRecalculateScore={handlers.recalculateScore}
        />

        {state.isGameStatsModalOpen && (
          <GameStatsModal
            isOpen={state.isGameStatsModalOpen}
            onClose={handlers.toggleGameStatsModal}
            teamName={data.gameSessionState.teamName}
            opponentName={data.gameSessionState.opponentName}
            gameDate={data.gameSessionState.gameDate}
            homeScore={data.gameSessionState.homeScore}
            awayScore={data.gameSessionState.awayScore}
            homeOrAway={data.gameSessionState.homeOrAway}
            gameLocation={data.gameSessionState.gameLocation}
            gameTime={data.gameSessionState.gameTime}
            numPeriods={data.gameSessionState.numberOfPeriods}
            periodDurationMinutes={data.gameSessionState.periodDurationMinutes}
            wentToOvertime={data.gameSessionState.wentToOvertime}
            wentToPenalties={data.gameSessionState.wentToPenalties}
            shootoutKicks={data.gameSessionState.shootoutKicks}
            availablePlayers={data.playersForCurrentGame}
            gameEvents={data.gameSessionState.gameEvents}
            gameNotes={data.gameSessionState.gameNotes}
            playerPositions={data.gameSessionState.playerPositions}
            gamePersonnel={data.gameSessionState.gamePersonnel}
            personnelDirectory={data.personnel}
            onUpdateGameEvent={handlers.updateGameEvent}
            selectedPlayerIds={data.gameSessionState.selectedPlayerIds}
            savedGames={data.savedGames}
            currentGameId={data.currentGameId}
            onDeleteGameEvent={handlers.deleteGameEvent}
            onExportOneExcel={handlers.exportOneExcel}
            currentGameOnly
            masterRoster={data.masterRoster}
            onGameNotesChange={handlers.gameNotesChange}
          onOpenSettings={handlers.openSettingsModal}
          onOpenGameSettings={handlers.wrapUpToGameSettings}
          onOpenAssessments={handlers.wrapUpToAssessments}
        />
      )}

        {/* LoadGameModal LIFTED to ClubModalsHost (L.3a) - dual-render guard. */}

        {/* NewGameSetupModal LIFTED to ClubModalsHost (L.3b) - dual-render guard. */}

        <GameSettingsModal
          isOpen={state.isGameSettingsModalOpen}
          onClose={handlers.closeGameSettingsModal}
          initialScrollSection={state.gameSettingsInitialSection}
          currentGameId={data.currentGameId}
          teamId={data.gameSessionState.teamId}
          teamName={data.gameSessionState.teamName}
          opponentName={data.gameSessionState.opponentName}
          gameDate={data.gameSessionState.gameDate}
          gameLocation={data.gameSessionState.gameLocation}
          gameTime={data.gameSessionState.gameTime}
          gameNotes={data.gameSessionState.gameNotes}
          playerPositions={data.gameSessionState.playerPositions}
          ageGroup={data.gameSessionState.ageGroup}
          tournamentLevel={data.gameSessionState.tournamentLevel}
          tournamentSeriesId={data.gameSessionState.tournamentSeriesId}
          gameEvents={data.gameSessionState.gameEvents}
          availablePlayers={data.availablePlayers}
          availablePersonnel={data.personnel}
          selectedPlayerIds={data.gameSessionState.selectedPlayerIds}
          selectedPersonnelIds={data.gameSessionState.gamePersonnel || []}
          onSelectedPlayersChange={handlers.updateSelectedPlayers}
          onAddPlayerToRoster={handlers.addPlayerToClubRoster}
          canReapplyPlan={data.canReapplyPlan}
          onReapplyPlan={handlers.reapplyPlan}
          onSelectedPersonnelChange={handlers.setGamePersonnel || (() => {})}
          numPeriods={data.gameSessionState.numberOfPeriods}
          periodDurationMinutes={data.gameSessionState.periodDurationMinutes}
          demandFactor={data.gameSessionState.demandFactor}
          onTeamNameChange={handlers.teamNameChange}
          onOpponentNameChange={handlers.opponentNameChange}
          onGameDateChange={handlers.gameDateChange}
          onGameLocationChange={handlers.gameLocationChange}
          onGameTimeChange={handlers.gameTimeChange}
          onGameNotesChange={handlers.gameNotesChange}
          onPlayerPositionsChange={handlers.playerPositionsChange}
          onAgeGroupChange={handlers.ageGroupChange}
          onTournamentLevelChange={handlers.tournamentLevelChange}
          onTournamentSeriesIdChange={handlers.tournamentSeriesIdChange}
          onUpdateGameEvent={handlers.updateGameEvent}
          onAwardFairPlayCard={handlers.awardFairPlayCard}
          onDeleteGameEvent={handlers.deleteGameEvent}
          onNumPeriodsChange={handlers.setNumberOfPeriods}
          onPeriodDurationChange={handlers.setPeriodDuration}
          onDemandFactorChange={handlers.setDemandFactor}
          seasonId={data.gameSessionState.seasonId}
          tournamentId={data.gameSessionState.tournamentId}
          leagueId={data.gameSessionState.leagueId}
          customLeagueName={data.gameSessionState.customLeagueName}
          onSeasonIdChange={handlers.setSeasonId}
          onTournamentIdChange={handlers.setTournamentId}
          onLeagueIdChange={handlers.setLeagueId}
          onCustomLeagueNameChange={handlers.setCustomLeagueName}
          homeOrAway={data.gameSessionState.homeOrAway}
          onSetHomeOrAway={handlers.setHomeOrAway}
          isPlayed={data.isPlayed}
          onIsPlayedChange={handlers.setIsPlayed}
          wentToOvertime={data.gameSessionState.wentToOvertime}
          wentToPenalties={data.gameSessionState.wentToPenalties}
          onWentToOvertimeChange={handlers.setWentToOvertime}
          onWentToPenaltiesChange={handlers.setWentToPenalties}
          shootoutKicks={data.gameSessionState.shootoutKicks}
          onShootoutKicksChange={handlers.setShootoutKicks}
          gameType={data.gameSessionState.gameType}
          onGameTypeChange={handlers.setGameType}
          gender={data.gameSessionState.gender}
          onGenderChange={handlers.setGender}
          timeElapsedInSeconds={data.gameSessionState.timeElapsedInSeconds}
          updateGameDetailsMutation={data.updateGameDetailsMutation!}
          seasons={data.seasons}
          tournaments={data.tournaments}
          masterRoster={data.masterRoster}
          teams={data.teams}
          onTeamIdChange={(teamId) => handlers.teamIdChange(teamId ?? undefined)}
        />

        <PlayerAssessmentModal
          isOpen={state.isPlayerAssessmentModalOpen}
          onClose={handlers.closePlayerAssessmentModal}
          selectedPlayerIds={data.gameSessionState.selectedPlayerIds}
          availablePlayers={data.availablePlayers}
          assessments={data.playerAssessments}
          onSave={handlers.savePlayerAssessment}
          onDelete={handlers.deletePlayerAssessment}
          teamName={data.gameSessionState.teamName}
          opponentName={data.gameSessionState.opponentName}
          gameDate={data.gameSessionState.gameDate}
          homeScore={data.gameSessionState.homeScore}
          awayScore={data.gameSessionState.awayScore}
          homeOrAway={data.gameSessionState.homeOrAway}
          gameLocation={data.gameSessionState.gameLocation}
          gameTime={data.gameSessionState.gameTime}
          numberOfPeriods={data.gameSessionState.numberOfPeriods}
          periodDurationMinutes={data.gameSessionState.periodDurationMinutes}
          ratingStyle={ratingStyle}
          assessmentTemplate={assessmentTemplate}
        />

        {state.isTeamReassignModalOpen && data.orphanedGameInfo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-yellow-400 mb-4">
                {t('orphanedGame.reassignTitle', 'Reassign Game to Team')}
              </h2>
              <p className="text-slate-300 mb-4">
                {t('orphanedGame.reassignDescription', 'Select a team to associate this game with, or choose "No Team" to use the master roster.')}
              </p>

              <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                <button
                  onClick={() => handlers.teamReassignment(null)}
                  className="w-full text-left px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
                >
                  {t('orphanedGame.noTeam', 'No Team (Use Master Roster)')}
                </button>
                {data.availableTeams.map(team => (
                  <button
                    key={team.id}
                    onClick={() => handlers.teamReassignment(team.id)}
                    className="w-full text-left px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors flex items-center gap-2"
                  >
                    {team.color && (
                      <span
                        className="w-4 h-4 rounded-full border border-slate-500"
                        style={{ backgroundColor: team.color }}
                      />
                    )}
                    {team.name}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handlers.setIsTeamReassignModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded-md font-medium transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmationModal
          isOpen={state.showNoPlayersConfirm}
          title={t('controlBar.noPlayersTitle', 'No Players in Roster')}
          message={t('controlBar.noPlayersForNewGame', 'You need at least one player in your roster to create a game. Would you like to add players now?')}
          onConfirm={handlers.confirmNoPlayers}
          onCancel={() => handlers.setShowNoPlayersConfirm(false)}
          confirmLabel={t('common.addPlayers', 'Add Players')}
          variant="primary"
        />

        {/* Save-before-new / start-new confirms DELETED (3.1) - their only
            entry (the menu's New Game item) left with the menu shrink. */}

        <ConfirmationModal
          isOpen={state.showResetFieldConfirm}
          title={
            data.gameSessionState.isTimerRunning
              ? t('controlBar.resetFieldTacticsTitle', 'Reset Tactics Board?')
              : t('controlBar.resetFieldNormalTitle', 'Reset Field?')
          }
          message={
            data.gameSessionState.isTimerRunning
              ? t('tooltips.resetFieldTactics', 'Clear all tactical discs, drawings, and ball position from the tactics board.')
              : t('tooltips.resetFieldNormal', 'Clear all players, opponents, and drawings from the field.')
          }
          warningMessage={t('common.cannotUndo', 'This action cannot be undone.')}
          onConfirm={handlers.resetFieldConfirmed}
          onCancel={() => handlers.setShowResetFieldConfirm(false)}
          confirmLabel={t('controlBar.resetField', 'Reset Field')}
          variant="danger"
        />
      </>
    </ModalPortal>
  );
}
