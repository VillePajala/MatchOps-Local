import React from 'react';
import { useTranslation } from 'react-i18next';
import ModalPortal from '@/components/ModalPortal';
import TrainingResourcesModal from '@/components/TrainingResourcesModal';
import InstructionsModal from '@/components/InstructionsModal';
import PersonnelManagerModal from '@/components/PersonnelManagerModal';
import TeamManagerModal from '@/components/TeamManagerModal';
import GoalLogModal from '@/components/GoalLogModal';
import GameStatsModal from '@/components/GameStatsModal';
import LoadGameModal from '@/components/LoadGameModal';
import NewGameSetupModal from '@/components/NewGameSetupModal';
import RosterSettingsModal from '@/components/RosterSettingsModal';
import SeasonTournamentManagementModal from '@/components/SeasonTournamentManagementModal';
import GameSettingsModal from '@/components/GameSettingsModal';
import SettingsModal from '@/components/SettingsModal';
import PlayerAssessmentModal from '@/components/PlayerAssessmentModal';
import ConfirmationModal from '@/components/ConfirmationModal';
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
} from '@/types';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';
import type { PersonnelManagerReturn } from '@/hooks/usePersonnelManager';
import type { UseMutationResult } from '@tanstack/react-query';

interface LoadGameState {
  isLoadingGamesList: boolean;
  loadGamesListError: string | null;
  isGameLoading: boolean;
  gameLoadError: string | null;
  isGameDeleting: boolean;
  gameDeleteError: string | null;
  processingGameId: string | null;
}

interface SeasonTournamentMutations {
  addSeason?: UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>;
  addTournament?: UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>;
  updateSeason?: UseMutationResult<Season | null, Error, Season, unknown>;
  deleteSeason?: UseMutationResult<boolean, Error, string, unknown>;
  updateTournament?: UseMutationResult<Tournament | null, Error, Tournament, unknown>;
  deleteTournament?: UseMutationResult<boolean, Error, string, unknown>;
}

interface ModalManagerState {
  isTrainingResourcesOpen: boolean;
  isInstructionsModalOpen: boolean;
  isPersonnelManagerOpen: boolean;
  isTeamManagerOpen: boolean;
  isGoalLogModalOpen: boolean;
  isGameStatsModalOpen: boolean;
  isLoadGameModalOpen: boolean;
  isNewGameSetupModalOpen: boolean;
  isRosterModalOpen: boolean;
  isSeasonTournamentModalOpen: boolean;
  isGameSettingsModalOpen: boolean;
  isSettingsModalOpen: boolean;
  isPlayerAssessmentModalOpen: boolean;
  isTeamReassignModalOpen: boolean;
  showNoPlayersConfirm: boolean;
  showHardResetConfirm: boolean;
  showSaveBeforeNewConfirm: boolean;
  showStartNewConfirm: boolean;
  showResetFieldConfirm: boolean;
}

interface ModalManagerData {
  gameSessionState: GameSessionState;
  availablePlayers: Player[];
  playersForCurrentGame: Player[];
  savedGames: SavedGamesCollection;
  currentGameId: string | null;
  teams: Team[];
  seasons: Season[];
  tournaments: Tournament[];
  masterRoster: Player[];
  personnel: Personnel[];
  personnelManager: Pick<PersonnelManagerReturn, 'addPersonnel' | 'updatePersonnel' | 'removePersonnel' | 'isLoading'>;
  playerAssessments: Record<string, PlayerAssessment>;
  selectedPlayerForStats: Player | null;
  playerIdsForNewGame: string[] | null;
  newGameDemandFactor: number;
  availableTeams: Team[];
  orphanedGameInfo: { teamId: string; teamName?: string } | null;
  appLanguage: string;
  defaultTeamNameSetting: string;
  gameIdentifierForSave: string;
  isPlayed: boolean;
  isRosterUpdating: boolean;
  rosterError: string | null;
  loadGameState: LoadGameState;
  seasonTournamentMutations: SeasonTournamentMutations;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateGameDetailsMutation?: UseMutationResult<AppState | null, Error, any, unknown>;
}

interface ModalManagerHandlers {
  toggleTrainingResources: () => void;
  toggleInstructionsModal: () => void;
  closePersonnelManager: () => void;
  closeTeamManagerModal: () => void;
  toggleGoalLogModal: () => void;
  addGoalEvent: (playerId: string, assistId?: string) => void;
  logOpponentGoal: (timeSeconds: number) => void;
  updateGameEvent: (event: GameEvent) => void;
  deleteGameEvent: (eventId: string) => Promise<boolean>;
  toggleGameStatsModal: () => void;
  exportOneExcel: (gameId: string) => void;
  exportAggregateExcel: (gameIds: string[], aggregateStats: PlayerStatRow[]) => void;
  exportPlayerExcel: (playerId: string, playerData: PlayerStatRow, gameIds: string[]) => void;
  gameLogClick: (gameId: string) => void;
  closeLoadGameModal: () => void;
  loadGame: (gameId: string) => void;
  deleteGame: (gameId: string) => void;
  exportOneJson: (gameId: string) => void;
  setSelectedTeamForRoster: (teamId: string | null) => void;
  setNewGameDemandFactor: (factor: number) => void;
  startNewGameWithSetup: (
    initialSelectedPlayerIds: string[],
    homeTeamName: string,
    opponentName: string,
    gameDate: string,
    gameLocation: string,
    gameTime: string,
    seasonId: string | null,
    tournamentId: string | null,
    numPeriods: 1 | 2,
    periodDuration: number,
    homeOrAway: 'home' | 'away',
    demandFactor: number,
    ageGroup: string,
    tournamentLevel: string,
    tournamentSeriesId: string | null,
    isPlayedParam: boolean,
    teamId: string | null,
    availablePlayersForGame: Player[],
    selectedPersonnelIds: string[],
    leagueId: string,
    customLeagueName: string,
    gameType: import('@/types').GameType
  ) => void;
  cancelNewGameSetup: () => void;
  closeRosterModal: () => void;
  updatePlayerForModal: (playerId: string, updates: Partial<Omit<Player, 'id'>>) => Promise<void>;
  renamePlayerForModal: (playerId: string, playerData: { name: string; nickname?: string }) => void;
  setJerseyNumberForModal: (playerId: string, jerseyNumber: string) => void;
  setPlayerNotesForModal: (playerId: string, notes: string) => void;
  removePlayerForModal: (playerId: string) => void;
  addPlayerForModal: (playerData: { name: string; jerseyNumber: string; notes: string; nickname: string }) => void;
  openPlayerStats: (playerId: string) => void;
  closeSeasonTournamentModal: () => void;
  closeGameSettingsModal: () => void;
  teamNameChange: (name: string) => void;
  opponentNameChange: (name: string) => void;
  gameDateChange: (date: string) => void;
  gameLocationChange: (location: string) => void;
  gameTimeChange: (time: string) => void;
  gameNotesChange: (notes: string) => void;
  ageGroupChange: (ageGroup: string) => void;
  tournamentLevelChange: (level: string) => void;
  awardFairPlayCard: (playerId: string | null, time: number) => void;
  setNumberOfPeriods: (periods: number) => void;
  setPeriodDuration: (minutes: number) => void;
  setDemandFactor: (factor: number) => void;
  setSeasonId: (id: string | undefined) => void;
  setTournamentId: (id: string | undefined) => void;
  setLeagueId: (id: string | undefined) => void;
  setCustomLeagueName: (name: string | undefined) => void;
  setGameType: (gameType: import('@/types').GameType) => void;
  setHomeOrAway: (value: 'home' | 'away') => void;
  setIsPlayed: (played: boolean) => void;
  updateSelectedPlayers: (playerIds: string[]) => void;
  setGamePersonnel?: (personnelIds: string[]) => void;
  closeSettingsModal: () => void;
  setAppLanguage: (lang: string) => void;
  setDefaultTeamName: (name: string) => void;
  showAppGuide: () => void;
  hardResetApp: () => void;
  closePlayerAssessmentModal: () => void;
  savePlayerAssessment: (playerId: string, assessment: Partial<PlayerAssessment>) => void;
  deletePlayerAssessment: (playerId: string) => void;
  teamReassignment: (teamId: string | null) => void;
  setIsTeamReassignModalOpen: (open: boolean) => void;
  confirmNoPlayers: () => void;
  setShowNoPlayersConfirm: (open: boolean) => void;
  confirmHardReset: () => void;
  setShowHardResetConfirm: (open: boolean) => void;
  saveBeforeNewConfirmed: () => void;
  saveBeforeNewCancelled: () => void;
  setShowStartNewConfirm: (open: boolean) => void;
  startNewConfirmed: () => void;
  setShowResetFieldConfirm: (open: boolean) => void;
  resetFieldConfirmed: () => void;
  openSettingsModal: () => void;
  onCreateBackup: () => void;
  onDataImportSuccess?: () => void;
  manageTeamRosterFromNewGame: (teamId?: string) => void;
}

export interface ModalManagerProps {
  state: ModalManagerState;
  data: ModalManagerData;
  handlers: ModalManagerHandlers;
}

export function ModalManager({ state, data, handlers }: ModalManagerProps) {
  const { t } = useTranslation();
  return (
    <ModalPortal>
      <>
        <TrainingResourcesModal
          isOpen={state.isTrainingResourcesOpen}
          onClose={handlers.toggleTrainingResources}
        />

        <InstructionsModal
          isOpen={state.isInstructionsModalOpen}
          onClose={handlers.toggleInstructionsModal}
        />

        <PersonnelManagerModal
          isOpen={state.isPersonnelManagerOpen}
          onClose={handlers.closePersonnelManager}
          personnel={data.personnel}
          onAddPersonnel={data.personnelManager.addPersonnel}
          onUpdatePersonnel={data.personnelManager.updatePersonnel}
          onRemovePersonnel={data.personnelManager.removePersonnel}
          isUpdating={data.personnelManager.isLoading}
        />

        <TeamManagerModal
          isOpen={state.isTeamManagerOpen}
          onClose={handlers.closeTeamManagerModal}
          teams={data.teams}
          masterRoster={data.masterRoster}
        />

        <GoalLogModal
          isOpen={state.isGoalLogModalOpen}
          onClose={handlers.toggleGoalLogModal}
          onLogGoal={handlers.addGoalEvent}
          onLogOpponentGoal={handlers.logOpponentGoal}
          availablePlayers={data.playersForCurrentGame}
          currentTime={data.gameSessionState.timeElapsedInSeconds}
          currentGameId={data.currentGameId}
          gameEvents={data.gameSessionState.gameEvents}
          onUpdateGameEvent={handlers.updateGameEvent}
          onDeleteGameEvent={handlers.deleteGameEvent}
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
            availablePlayers={data.playersForCurrentGame}
            gameEvents={data.gameSessionState.gameEvents}
            gameNotes={data.gameSessionState.gameNotes}
            gamePersonnel={data.gameSessionState.gamePersonnel}
            personnelDirectory={data.personnel}
            onUpdateGameEvent={handlers.updateGameEvent}
            selectedPlayerIds={data.gameSessionState.selectedPlayerIds}
            savedGames={data.savedGames}
            currentGameId={data.currentGameId}
            onDeleteGameEvent={handlers.deleteGameEvent}
            onExportOneExcel={handlers.exportOneExcel}
            onExportAggregateExcel={handlers.exportAggregateExcel}
            onExportPlayerExcel={handlers.exportPlayerExcel}
            initialSelectedPlayerId={data.selectedPlayerForStats?.id}
            onGameClick={handlers.gameLogClick}
            masterRoster={data.masterRoster}
          onOpenSettings={handlers.openSettingsModal}
        />
      )}

        <LoadGameModal
          isOpen={state.isLoadGameModalOpen}
          onClose={handlers.closeLoadGameModal}
          savedGames={data.savedGames}
          onLoad={handlers.loadGame}
          onDelete={handlers.deleteGame}
          onExportOneJson={handlers.exportOneJson}
          onExportOneExcel={handlers.exportOneExcel}
          currentGameId={data.currentGameId || undefined}
          currentSessionHomeScore={data.gameSessionState.homeScore}
          currentSessionAwayScore={data.gameSessionState.awayScore}
          isLoadingGamesList={data.loadGameState.isLoadingGamesList}
          loadGamesListError={data.loadGameState.loadGamesListError}
          isGameLoading={data.loadGameState.isGameLoading}
          gameLoadError={data.loadGameState.gameLoadError}
          isGameDeleting={data.loadGameState.isGameDeleting}
          gameDeleteError={data.loadGameState.gameDeleteError}
          processingGameId={data.loadGameState.processingGameId}
          seasons={data.seasons}
          tournaments={data.tournaments}
          teams={data.teams}
        />

        {state.isNewGameSetupModalOpen && (
          <NewGameSetupModal
            isOpen={state.isNewGameSetupModalOpen}
            initialPlayerSelection={data.playerIdsForNewGame}
            demandFactor={data.newGameDemandFactor}
            onDemandFactorChange={handlers.setNewGameDemandFactor}
          onManageTeamRoster={(teamId) => {
            handlers.manageTeamRosterFromNewGame(teamId);
          }}
            onStart={handlers.startNewGameWithSetup}
            onCancel={handlers.cancelNewGameSetup}
            masterRoster={data.masterRoster}
            seasons={data.seasons}
            tournaments={data.tournaments}
            teams={data.teams}
            personnel={data.personnel}
          />
        )}

        <RosterSettingsModal
          isOpen={state.isRosterModalOpen}
          onClose={handlers.closeRosterModal}
          availablePlayers={data.availablePlayers}
          onUpdatePlayer={handlers.updatePlayerForModal}
          onRenamePlayer={handlers.renamePlayerForModal}
          onSetJerseyNumber={handlers.setJerseyNumberForModal}
          onSetPlayerNotes={handlers.setPlayerNotesForModal}
          onRemovePlayer={handlers.removePlayerForModal}
          onAddPlayer={handlers.addPlayerForModal}
          isRosterUpdating={data.isRosterUpdating}
          rosterError={data.rosterError}
          onOpenPlayerStats={handlers.openPlayerStats}
        />

        {state.isSeasonTournamentModalOpen &&
          data.seasonTournamentMutations.addSeason &&
          data.seasonTournamentMutations.addTournament &&
          data.seasonTournamentMutations.updateSeason &&
          data.seasonTournamentMutations.deleteSeason &&
          data.seasonTournamentMutations.updateTournament &&
          data.seasonTournamentMutations.deleteTournament && (
          <SeasonTournamentManagementModal
            isOpen={state.isSeasonTournamentModalOpen}
            onClose={handlers.closeSeasonTournamentModal}
            seasons={data.seasons}
            tournaments={data.tournaments}
            masterRoster={data.masterRoster}
            addSeasonMutation={data.seasonTournamentMutations.addSeason}
            addTournamentMutation={data.seasonTournamentMutations.addTournament}
            updateSeasonMutation={data.seasonTournamentMutations.updateSeason}
            deleteSeasonMutation={data.seasonTournamentMutations.deleteSeason}
            updateTournamentMutation={data.seasonTournamentMutations.updateTournament}
            deleteTournamentMutation={data.seasonTournamentMutations.deleteTournament}
          />
        )}

        <GameSettingsModal
          isOpen={state.isGameSettingsModalOpen}
          onClose={handlers.closeGameSettingsModal}
          currentGameId={data.currentGameId}
          teamId={data.gameSessionState.teamId}
          teamName={data.gameSessionState.teamName}
          opponentName={data.gameSessionState.opponentName}
          gameDate={data.gameSessionState.gameDate}
          gameLocation={data.gameSessionState.gameLocation}
          gameTime={data.gameSessionState.gameTime}
          gameNotes={data.gameSessionState.gameNotes}
          ageGroup={data.gameSessionState.ageGroup}
          tournamentLevel={data.gameSessionState.tournamentLevel}
          gameEvents={data.gameSessionState.gameEvents}
          availablePlayers={data.availablePlayers}
          availablePersonnel={data.personnel}
          selectedPlayerIds={data.gameSessionState.selectedPlayerIds}
          selectedPersonnelIds={data.gameSessionState.gamePersonnel || []}
          onSelectedPlayersChange={handlers.updateSelectedPlayers}
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
          onAgeGroupChange={handlers.ageGroupChange}
          onTournamentLevelChange={handlers.tournamentLevelChange}
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
          gameType={data.gameSessionState.gameType}
          onGameTypeChange={handlers.setGameType}
          timeElapsedInSeconds={data.gameSessionState.timeElapsedInSeconds}
          updateGameDetailsMutation={data.updateGameDetailsMutation!}
          seasons={data.seasons}
          tournaments={data.tournaments}
          masterRoster={data.masterRoster}
          teams={data.teams}
          onTeamIdChange={() => {}} // No-op: teamId updates handled by updateGameDetailsMutation
        />

        <SettingsModal
          isOpen={state.isSettingsModalOpen}
          onClose={handlers.closeSettingsModal}
          language={data.appLanguage}
          onLanguageChange={handlers.setAppLanguage}
          defaultTeamName={data.defaultTeamNameSetting}
          onDefaultTeamNameChange={handlers.setDefaultTeamName}
          onResetGuide={handlers.showAppGuide}
          onHardResetApp={handlers.hardResetApp}
          onCreateBackup={handlers.onCreateBackup}
          onDataImportSuccess={handlers.onDataImportSuccess}
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

        <ConfirmationModal
          isOpen={state.showHardResetConfirm}
          title={t('controlBar.hardResetTitle', 'Reset Application')}
          message={t('controlBar.hardResetConfirmation', 'Are you sure you want to completely reset the application? All saved data (players, stats, positions) will be permanently lost.')}
          warningMessage={t('controlBar.hardResetWarning', 'This action cannot be undone. All your data will be permanently deleted.')}
          onConfirm={handlers.confirmHardReset}
          onCancel={() => handlers.setShowHardResetConfirm(false)}
          confirmLabel={t('common.reset', 'Reset')}
          variant="danger"
        />

        <ConfirmationModal
          isOpen={state.showSaveBeforeNewConfirm}
          title={t('controlBar.saveBeforeNewTitle', 'Save Current Game?')}
          message={t('controlBar.saveBeforeNewPrompt', `Save changes to the current game "${data.gameIdentifierForSave}" before starting a new one?`, { gameName: data.gameIdentifierForSave })}
          warningMessage={t('controlBar.saveBeforeNewInfo', 'Click "Save & Continue" to save your progress, or "Discard" to start fresh without saving.')}
          onConfirm={handlers.saveBeforeNewConfirmed}
          onCancel={handlers.saveBeforeNewCancelled}
          confirmLabel={t('controlBar.saveAndContinue', 'Save & Continue')}
          cancelLabel={t('controlBar.discard', 'Discard')}
          variant="primary"
        />

        <ConfirmationModal
          isOpen={state.showStartNewConfirm}
          title={t('controlBar.startNewMatchTitle', 'Start New Match?')}
          message={t('controlBar.startNewMatchConfirmation', 'Are you sure you want to start a new match? Any unsaved progress will be lost.')}
          warningMessage={t('controlBar.startNewMatchWarning', 'Make sure you have saved your current game if you want to keep it.')}
          onConfirm={handlers.startNewConfirmed}
          onCancel={() => handlers.setShowStartNewConfirm(false)}
          confirmLabel={t('common.startNew', 'Start New')}
          variant="danger"
        />

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
