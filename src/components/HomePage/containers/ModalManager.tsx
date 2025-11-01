/**
 * ModalManager Container
 *
 * Manages all modal rendering for the HomePage.
 * Extracted from HomePage.tsx as part of P0 refactoring.
 *
 * This component is responsible for:
 * - Rendering all application modals
 * - Managing modal-specific state and handlers
 * - Coordinating between modals and the main application
 *
 * @param props - All modal-related props and handlers from useGameOrchestration
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

// Modal Components
import GoalLogModal from '@/components/GoalLogModal';
import GameStatsModal from '@/components/GameStatsModal';
import TrainingResourcesModal from '@/components/TrainingResourcesModal';
import LoadGameModal from '@/components/LoadGameModal';
import NewGameSetupModal from '@/components/NewGameSetupModal';
import RosterSettingsModal from '@/components/RosterSettingsModal';
import GameSettingsModal from '@/components/GameSettingsModal';
import SettingsModal from '@/components/SettingsModal';
import SeasonTournamentManagementModal from '@/components/SeasonTournamentManagementModal';
import TeamManagerModal from '@/components/TeamManagerModal';
import TeamRosterModal from '@/components/TeamRosterModal';
import InstructionsModal from '@/components/InstructionsModal';
import PlayerAssessmentModal from '@/components/PlayerAssessmentModal';
import ConfirmationModal from '@/components/ConfirmationModal';
import ErrorBoundary from '@/components/ErrorBoundary';

// Types
import type {
  Player,
  Team,
  GameEvent,
  PlayerAssessment,
  Season,
  Tournament,
  AppState,
  Personnel,
} from '@/types';
import type { UseGameOrchestrationReturn } from '../hooks/useGameOrchestration';
import { useModalContext } from '@/contexts/ModalProvider';
import { useToast } from '@/contexts/ToastProvider';
import { exportFullBackup } from '@/utils/fullBackup';
import { saveLastHomeTeamName as utilSaveLastHomeTeamName } from '@/utils/appSettings';
import type { UseMutationResult } from '@tanstack/react-query';

interface ModalManagerProps extends Partial<UseGameOrchestrationReturn> {
  // Modal-specific states
  selectedPlayerForStats: Player | null;
  isTeamManagerOpen: boolean;
  isTeamRosterModalOpen: boolean;
  selectedTeamForRoster: string | null;
  showNoPlayersConfirm: boolean;
  showHardResetConfirm: boolean;
  showSaveBeforeNewConfirm: boolean;
  showStartNewConfirm: boolean;
  gameIdentifierForSave: string;
  isTeamReassignModalOpen: boolean;
  orphanedGameInfo: { teamId: string; teamName?: string } | null;
  availableTeams: Team[];
  isLoadingGamesList: boolean;
  loadGamesListError: string | null;
  isGameLoading: boolean;
  gameLoadError: string | null;
  isGameDeleting: boolean;
  gameDeleteError: string | null;
  processingGameId: string | null;
  isPlayed: boolean;
  playerIdsForNewGame: string[] | null;
  newGameDemandFactor: number;
  defaultTeamNameSetting: string;
  appLanguage: string;
  isInstructionsModalOpen: boolean;
  personnel: Personnel[];

  // Handlers
  handleToggleGoalLogModal: () => void;
  handleAddGoalEvent: (playerId: string, assistId?: string) => void;
  handleLogOpponentGoal: (currentTime: number) => void;
  handleUpdateGameEvent: (event: GameEvent) => void;
  handleDeleteGameEvent: (eventId: string) => void;
  handleToggleGameStatsModal: () => void;
  handleExportOneCsv: (gameId: string) => void;
  handleExportAggregateCsv: () => void;
  handleGameLogClick: (gameId: string) => void;
  handleCloseLoadGameModal: () => void;
  handleLoadGame: (gameId: string) => void;
  handleDeleteGame: (gameId: string) => void;
  handleExportOneJson: (gameId: string) => void;
  setIsNewGameSetupModalOpen: (open: boolean) => void;
  setSelectedTeamForRoster: (teamId: string | null) => void;
  setIsTeamRosterModalOpen: (open: boolean) => void;
  handleStartNewGameWithSetup: (data: unknown) => void;
  handleCancelNewGameSetup: () => void;
  setNewGameDemandFactor: (factor: number) => void;
  closeRosterModal: () => void;
  handleUpdatePlayerForModal: (playerId: string, updates: Partial<Omit<Player, 'id'>>) => Promise<void>;
  handleRenamePlayerForModal: (playerId: string, playerData: { name: string; nickname?: string }) => void;
  handleSetJerseyNumberForModal: (playerId: string, jerseyNumber: string) => void;
  handleSetPlayerNotesForModal: (playerId: string, notes: string) => void;
  handleToggleGoalieForModal?: (playerId: string) => void;
  handleRemovePlayerForModal: (playerId: string) => void;
  handleAddPlayerForModal: (playerData: { name: string; jerseyNumber: string; notes: string; nickname: string }) => void;
  handleOpenPlayerStats: (playerId: string) => void;
  handleCloseSeasonTournamentModal: () => void;
  addSeasonMutation?: UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>;
  addTournamentMutation?: UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>;
  updateSeasonMutation?: UseMutationResult<Season | null, Error, Season, unknown>;
  deleteSeasonMutation?: UseMutationResult<boolean, Error, string, unknown>;
  updateTournamentMutation?: UseMutationResult<Tournament | null, Error, Tournament, unknown>;
  deleteTournamentMutation?: UseMutationResult<boolean, Error, string, unknown>;
  handleCloseGameSettingsModal: () => void;
  handleTeamNameChange: (name: string) => void;
  handleOpponentNameChange: (name: string) => void;
  handleGameDateChange: (date: string) => void;
  handleGameLocationChange: (location: string) => void;
  handleGameTimeChange: (time: string) => void;
  handleGameNotesChange: (notes: string) => void;
  handleAgeGroupChange: (ageGroup: string) => void;
  handleTournamentLevelChange: (level: string) => void;
  handleAwardFairPlayCard: (playerId: string | null, time: number) => void;
  handleSetNumberOfPeriods: (periods: number) => void;
  handleSetPeriodDuration: (minutes: number) => void;
  handleSetDemandFactor: (factor: number) => void;
  handleSetSeasonId: (id: string | undefined) => void;
  handleSetTournamentId: (id: string | undefined) => void;
  handleSetHomeOrAway: (homeOrAway: 'home' | 'away') => void;
  handleSetIsPlayed: (played: boolean) => void;
  handleUpdateSelectedPlayers: (playerIds: string[]) => void;
  handleSetGamePersonnel?: (personnelIds: string[]) => void;
  updateGameDetailsMutation?: UseMutationResult<AppState | null, Error, { gameId: string; updates: Partial<AppState> }, unknown>;
  handleTeamIdChange: (teamId: string | null) => void;
  handleCloseSettingsModal: () => void;
  handleShowAppGuide: () => void;
  handleHardResetApp: () => void;
  onDataImportSuccess?: () => void;
  closePlayerAssessmentModal: () => void;
  handleSavePlayerAssessment: (playerId: string, assessment: Partial<PlayerAssessment>) => void;
  handleDeletePlayerAssessment: (playerId: string) => void;
  handleCloseTeamManagerModal: () => void;
  handleManageTeamRoster: (teamId: string) => void;
  handleCloseTeamRosterModal: () => void;
  handleBackToTeamManager: () => void;
  handleToggleTrainingResources: () => void;
  handleToggleInstructionsModal: () => void;
  setShowNoPlayersConfirm: (show: boolean) => void;
  handleNoPlayersConfirmed: () => void;
  setShowHardResetConfirm: (show: boolean) => void;
  handleHardResetConfirmed: () => void;
  setShowSaveBeforeNewConfirm?: (show: boolean) => void;
  handleSaveBeforeNewConfirmed: () => void;
  handleSaveBeforeNewCancelled: () => void;
  setShowStartNewConfirm: (show: boolean) => void;
  handleStartNewConfirmed: () => void;
  setIsTeamReassignModalOpen: (open: boolean) => void;
  handleTeamReassignment: (teamId: string | null) => void;
}

export function ModalManager(props: ModalManagerProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const {
    isGoalLogModalOpen,
    isGameStatsModalOpen,
    isTrainingResourcesOpen,
    isLoadGameModalOpen,
    isNewGameSetupModalOpen,
    isRosterModalOpen,
    isSeasonTournamentModalOpen,
    isGameSettingsModalOpen,
    isSettingsModalOpen,
    isPlayerAssessmentModalOpen,
  } = useModalContext();

  const {
    gameSessionState,
    availablePlayers,
    playersForCurrentGame,
    isRosterUpdating,
    rosterError,
    savedGames,
    currentGameId,
    masterRosterQueryResultData,
    seasons,
    tournaments,
    teams,
    playerAssessments,
    timeElapsedInSeconds,
    selectedPlayerForStats,
    isTeamManagerOpen,
    isTeamRosterModalOpen,
    selectedTeamForRoster,
    showNoPlayersConfirm,
    showHardResetConfirm,
    showSaveBeforeNewConfirm,
    showStartNewConfirm,
    gameIdentifierForSave,
    isTeamReassignModalOpen,
    orphanedGameInfo,
    availableTeams,
    isLoadingGamesList,
    loadGamesListError,
    isGameLoading,
    gameLoadError,
    isGameDeleting,
    gameDeleteError,
    processingGameId,
    isPlayed,
    playerIdsForNewGame,
    newGameDemandFactor,
    defaultTeamNameSetting,
    appLanguage,
    isInstructionsModalOpen,
    personnel,
    // Handlers
    handleToggleGoalLogModal,
    handleAddGoalEvent,
    handleLogOpponentGoal,
    handleUpdateGameEvent,
    handleDeleteGameEvent,
    handleToggleGameStatsModal,
    handleExportOneCsv,
    handleExportAggregateCsv,
    handleGameLogClick,
    handleCloseLoadGameModal,
    handleLoadGame,
    handleDeleteGame,
    handleExportOneJson,
    setIsNewGameSetupModalOpen,
    setSelectedTeamForRoster,
    setIsTeamRosterModalOpen,
    handleStartNewGameWithSetup,
    handleCancelNewGameSetup,
    setNewGameDemandFactor,
    closeRosterModal,
    handleUpdatePlayerForModal,
    handleRenamePlayerForModal,
    handleSetJerseyNumberForModal,
    handleSetPlayerNotesForModal,
    handleRemovePlayerForModal,
    handleAddPlayerForModal,
    handleOpenPlayerStats,
    handleCloseSeasonTournamentModal,
    addSeasonMutation,
    addTournamentMutation,
    updateSeasonMutation,
    deleteSeasonMutation,
    updateTournamentMutation,
    deleteTournamentMutation,
    handleCloseGameSettingsModal,
    handleTeamNameChange,
    handleOpponentNameChange,
    handleGameDateChange,
    handleGameLocationChange,
    handleGameTimeChange,
    handleGameNotesChange,
    handleAgeGroupChange,
    handleTournamentLevelChange,
    handleAwardFairPlayCard,
    handleSetNumberOfPeriods,
    handleSetPeriodDuration,
    handleSetDemandFactor,
    handleSetSeasonId,
    handleSetTournamentId,
    handleSetHomeOrAway,
    handleSetIsPlayed,
    handleUpdateSelectedPlayers,
    handleSetGamePersonnel,
    updateGameDetailsMutation,
    handleTeamIdChange,
    handleCloseSettingsModal,
    setAppLanguage,
    setDefaultTeamNameSetting,
    handleShowAppGuide,
    handleHardResetApp,
    onDataImportSuccess,
    closePlayerAssessmentModal,
    handleSavePlayerAssessment,
    handleDeletePlayerAssessment,
    handleCloseTeamManagerModal,
    handleManageTeamRoster,
    handleCloseTeamRosterModal,
    handleBackToTeamManager,
    handleToggleTrainingResources,
    handleToggleInstructionsModal,
    setShowNoPlayersConfirm,
    handleNoPlayersConfirmed,
    setShowHardResetConfirm,
    handleHardResetConfirmed,
    handleSaveBeforeNewConfirmed,
    handleSaveBeforeNewCancelled,
    setShowStartNewConfirm,
    handleStartNewConfirmed,
    setIsTeamReassignModalOpen,
    handleTeamReassignment,
  } = props;

  if (!gameSessionState) return null;

  return (
    <>
      {/* Training Resources Modal */}
      <TrainingResourcesModal
        isOpen={isTrainingResourcesOpen || false}
        onClose={handleToggleTrainingResources || (() => {})}
      />

      {/* Instructions Modal */}
      <InstructionsModal
        isOpen={isInstructionsModalOpen || false}
        onClose={handleToggleInstructionsModal || (() => {})}
      />

      {/* Team Manager Modal */}
      <ErrorBoundary>
        <TeamManagerModal
          isOpen={isTeamManagerOpen || false}
          onClose={handleCloseTeamManagerModal || (() => {})}
          teams={teams || []}
          onManageRoster={handleManageTeamRoster || (() => {})}
        />
      </ErrorBoundary>

      {/* Team Roster Modal */}
      <ErrorBoundary>
        <TeamRosterModal
          isOpen={isTeamRosterModalOpen || false}
          onClose={handleCloseTeamRosterModal || (() => {})}
          onBack={handleBackToTeamManager || (() => {})}
          teamId={selectedTeamForRoster || null}
          team={(teams || []).find(t => t.id === selectedTeamForRoster) || null}
          masterRoster={masterRosterQueryResultData || []}
        />
      </ErrorBoundary>

      {/* Goal Log Modal */}
      <GoalLogModal
        isOpen={isGoalLogModalOpen || false}
        onClose={handleToggleGoalLogModal || (() => {})}
        onLogGoal={handleAddGoalEvent || (() => {})}
        onLogOpponentGoal={handleLogOpponentGoal || (() => {})}
        availablePlayers={playersForCurrentGame || []}
        currentTime={gameSessionState.timeElapsedInSeconds}
        currentGameId={currentGameId || null}
        gameEvents={gameSessionState.gameEvents}
        onUpdateGameEvent={handleUpdateGameEvent || (() => {})}
        onDeleteGameEvent={handleDeleteGameEvent || (() => {})}
      />

      {/* Game Stats Modal */}
      {isGameStatsModalOpen && (
        <GameStatsModal
          isOpen={isGameStatsModalOpen}
          onClose={handleToggleGameStatsModal || (() => {})}
          teamName={gameSessionState.teamName}
          opponentName={gameSessionState.opponentName}
          gameDate={gameSessionState.gameDate}
          homeScore={gameSessionState.homeScore}
          awayScore={gameSessionState.awayScore}
          homeOrAway={gameSessionState.homeOrAway}
          gameLocation={gameSessionState.gameLocation}
          gameTime={gameSessionState.gameTime}
          numPeriods={gameSessionState.numberOfPeriods}
          periodDurationMinutes={gameSessionState.periodDurationMinutes}
          availablePlayers={availablePlayers || []}
          gameEvents={gameSessionState.gameEvents}
          gameNotes={gameSessionState.gameNotes}
          onUpdateGameEvent={handleUpdateGameEvent || (() => {})}
          selectedPlayerIds={gameSessionState.selectedPlayerIds}
          savedGames={savedGames || {}}
          currentGameId={currentGameId || null}
          onDeleteGameEvent={handleDeleteGameEvent || (() => {})}
          onExportOneCsv={handleExportOneCsv || (() => {})}
          onExportAggregateCsv={handleExportAggregateCsv || (() => {})}
          initialSelectedPlayerId={selectedPlayerForStats?.id}
          onGameClick={handleGameLogClick || (() => {})}
          masterRoster={masterRosterQueryResultData || []}
        />
      )}

      {/* Load Game Modal */}
      <LoadGameModal
        isOpen={isLoadGameModalOpen || false}
        onClose={handleCloseLoadGameModal || (() => {})}
        savedGames={savedGames || {}}
        onLoad={handleLoadGame || (() => {})}
        onDelete={handleDeleteGame || (() => {})}
        onExportOneJson={handleExportOneJson || (() => {})}
        onExportOneCsv={handleExportOneCsv || (() => {})}
        currentGameId={currentGameId || undefined}
        isLoadingGamesList={isLoadingGamesList || false}
        loadGamesListError={loadGamesListError || null}
        isGameLoading={isGameLoading || false}
        gameLoadError={gameLoadError || null}
        isGameDeleting={isGameDeleting || false}
        gameDeleteError={gameDeleteError || null}
        processingGameId={processingGameId || null}
        seasons={seasons || []}
        tournaments={tournaments || []}
        teams={teams || []}
      />

      {/* New Game Setup Modal */}
      {isNewGameSetupModalOpen && (
        <NewGameSetupModal
          isOpen={isNewGameSetupModalOpen}
          initialPlayerSelection={playerIdsForNewGame || null}
          demandFactor={newGameDemandFactor || 1}
          onDemandFactorChange={setNewGameDemandFactor || (() => {})}
          onManageTeamRoster={(teamId) => {
            if (setIsNewGameSetupModalOpen) setIsNewGameSetupModalOpen(false);
            if (setSelectedTeamForRoster) setSelectedTeamForRoster(teamId);
            if (setIsTeamRosterModalOpen) setIsTeamRosterModalOpen(true);
          }}
          onStart={handleStartNewGameWithSetup || (() => {})}
          onCancel={handleCancelNewGameSetup || (() => {})}
          masterRoster={masterRosterQueryResultData || []}
          seasons={seasons || []}
          tournaments={tournaments || []}
          teams={teams || []}
          personnel={personnel || []}
        />
      )}

      {/* Roster Settings Modal */}
      <RosterSettingsModal
        isOpen={isRosterModalOpen || false}
        onClose={closeRosterModal || (() => {})}
        availablePlayers={availablePlayers || []}
        onUpdatePlayer={handleUpdatePlayerForModal || (() => {})}
        onRenamePlayer={handleRenamePlayerForModal || (() => {})}
        onSetJerseyNumber={handleSetJerseyNumberForModal || (() => {})}
        onSetPlayerNotes={handleSetPlayerNotesForModal || (() => {})}
        onRemovePlayer={handleRemovePlayerForModal || (() => {})}
        onAddPlayer={handleAddPlayerForModal || (() => {})}
        isRosterUpdating={isRosterUpdating || false}
        rosterError={rosterError || null}
        onOpenPlayerStats={handleOpenPlayerStats || (() => {})}
      />

      {/* Season & Tournament Management Modal */}
      <SeasonTournamentManagementModal
        isOpen={isSeasonTournamentModalOpen || false}
        onClose={handleCloseSeasonTournamentModal || (() => {})}
        seasons={seasons || []}
        tournaments={tournaments || []}
        masterRoster={masterRosterQueryResultData || []}
        addSeasonMutation={addSeasonMutation!}
        addTournamentMutation={addTournamentMutation!}
        updateSeasonMutation={updateSeasonMutation!}
        deleteSeasonMutation={deleteSeasonMutation!}
        updateTournamentMutation={updateTournamentMutation!}
        deleteTournamentMutation={deleteTournamentMutation!}
      />

      {/* Game Settings Modal */}
      <GameSettingsModal
        isOpen={isGameSettingsModalOpen || false}
        onClose={handleCloseGameSettingsModal || (() => {})}
        currentGameId={currentGameId || null}
        teamId={savedGames?.[currentGameId || '']?.teamId}
        teamName={gameSessionState.teamName}
        opponentName={gameSessionState.opponentName}
        gameDate={gameSessionState.gameDate}
        gameLocation={gameSessionState.gameLocation}
        gameTime={gameSessionState.gameTime}
        gameNotes={gameSessionState.gameNotes}
        ageGroup={gameSessionState.ageGroup}
        tournamentLevel={gameSessionState.tournamentLevel}
        gameEvents={gameSessionState.gameEvents}
        availablePlayers={availablePlayers || []}
        availablePersonnel={personnel || []}
        selectedPlayerIds={gameSessionState.selectedPlayerIds}
        selectedPersonnelIds={gameSessionState.gamePersonnel || []}
        onSelectedPlayersChange={handleUpdateSelectedPlayers || (() => {})}
        onSelectedPersonnelChange={personnelIds => {
          if (handleSetGamePersonnel) {
            handleSetGamePersonnel(personnelIds);
          }
        }}
        numPeriods={gameSessionState.numberOfPeriods}
        periodDurationMinutes={gameSessionState.periodDurationMinutes}
        demandFactor={gameSessionState.demandFactor}
        onTeamNameChange={handleTeamNameChange || (() => {})}
        onOpponentNameChange={handleOpponentNameChange || (() => {})}
        onGameDateChange={handleGameDateChange || (() => {})}
        onGameLocationChange={handleGameLocationChange || (() => {})}
        onGameTimeChange={handleGameTimeChange || (() => {})}
        onGameNotesChange={handleGameNotesChange || (() => {})}
        onAgeGroupChange={handleAgeGroupChange || (() => {})}
        onTournamentLevelChange={handleTournamentLevelChange || (() => {})}
        onUpdateGameEvent={handleUpdateGameEvent || (() => {})}
        onAwardFairPlayCard={handleAwardFairPlayCard || (() => {})}
        onDeleteGameEvent={handleDeleteGameEvent || (() => {})}
        onNumPeriodsChange={handleSetNumberOfPeriods || (() => {})}
        onPeriodDurationChange={handleSetPeriodDuration || (() => {})}
        onDemandFactorChange={handleSetDemandFactor || (() => {})}
        seasonId={gameSessionState.seasonId}
        tournamentId={gameSessionState.tournamentId}
        onSeasonIdChange={handleSetSeasonId || (() => {})}
        onTournamentIdChange={handleSetTournamentId || (() => {})}
        homeOrAway={gameSessionState.homeOrAway}
        onSetHomeOrAway={handleSetHomeOrAway || (() => {})}
        isPlayed={isPlayed || true}
        onIsPlayedChange={handleSetIsPlayed || (() => {})}
        timeElapsedInSeconds={timeElapsedInSeconds || 0}
        updateGameDetailsMutation={updateGameDetailsMutation!}
        seasons={seasons || []}
        tournaments={tournaments || []}
        masterRoster={masterRosterQueryResultData || []}
        teams={teams || []}
        onTeamIdChange={handleTeamIdChange || (() => {})}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen || false}
        onClose={handleCloseSettingsModal || (() => {})}
        language={appLanguage || 'en'}
        onLanguageChange={setAppLanguage || (() => {})}
        defaultTeamName={defaultTeamNameSetting || ''}
        onDefaultTeamNameChange={(name) => {
          if (setDefaultTeamNameSetting) setDefaultTeamNameSetting(name);
          utilSaveLastHomeTeamName(name);
        }}
        onResetGuide={handleShowAppGuide || (() => {})}
        onHardResetApp={handleHardResetApp || (() => {})}
        onCreateBackup={() => exportFullBackup(showToast)}
        onDataImportSuccess={onDataImportSuccess}
      />

      {/* Player Assessment Modal */}
      <PlayerAssessmentModal
        isOpen={isPlayerAssessmentModalOpen || false}
        onClose={closePlayerAssessmentModal || (() => {})}
        selectedPlayerIds={gameSessionState.selectedPlayerIds}
        availablePlayers={availablePlayers || []}
        assessments={playerAssessments || {}}
        onSave={handleSavePlayerAssessment || (() => {})}
        onDelete={handleDeletePlayerAssessment || (() => {})}
        teamName={gameSessionState.teamName}
        opponentName={gameSessionState.opponentName}
        gameDate={gameSessionState.gameDate}
        homeScore={gameSessionState.homeScore}
        awayScore={gameSessionState.awayScore}
        homeOrAway={gameSessionState.homeOrAway}
        gameLocation={gameSessionState.gameLocation}
        gameTime={gameSessionState.gameTime}
        numberOfPeriods={gameSessionState.numberOfPeriods}
        periodDurationMinutes={gameSessionState.periodDurationMinutes}
      />

      {/* Team Reassignment Modal for Orphaned Games */}
      {isTeamReassignModalOpen && orphanedGameInfo && (
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
                onClick={() => handleTeamReassignment?.(null)}
                className="w-full text-left px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
              >
                {t('orphanedGame.noTeam', 'No Team (Use Master Roster)')}
              </button>
              {(availableTeams || []).map(team => (
                <button
                  key={team.id}
                  onClick={() => handleTeamReassignment?.(team.id)}
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
                onClick={() => setIsTeamReassignModalOpen?.(false)}
                className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded-md font-medium transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}

      {/* No Players Confirmation */}
      <ConfirmationModal
        isOpen={showNoPlayersConfirm || false}
        title={t('controlBar.noPlayersTitle', 'No Players in Roster')}
        message={t('controlBar.noPlayersForNewGame', 'You need at least one player in your roster to create a game. Would you like to add players now?')}
        onConfirm={handleNoPlayersConfirmed || (() => {})}
        onCancel={() => setShowNoPlayersConfirm?.(false)}
        confirmLabel={t('common.addPlayers', 'Add Players')}
        variant="primary"
      />

      {/* Hard Reset Confirmation */}
      <ConfirmationModal
        isOpen={showHardResetConfirm || false}
        title={t('controlBar.hardResetTitle', 'Reset Application')}
        message={t('controlBar.hardResetConfirmation', 'Are you sure you want to completely reset the application? All saved data (players, stats, positions) will be permanently lost.')}
        warningMessage={t('controlBar.hardResetWarning', 'This action cannot be undone. All your data will be permanently deleted.')}
        onConfirm={handleHardResetConfirmed || (() => {})}
        onCancel={() => setShowHardResetConfirm?.(false)}
        confirmLabel={t('common.reset', 'Reset')}
        variant="danger"
      />

      {/* Save Before New Game Confirmation */}
      <ConfirmationModal
        isOpen={showSaveBeforeNewConfirm || false}
        title={t('controlBar.saveBeforeNewTitle', 'Save Current Game?')}
        message={t('controlBar.saveBeforeNewPrompt', `Save changes to the current game "${gameIdentifierForSave}" before starting a new one?`, { gameName: gameIdentifierForSave })}
        warningMessage={t('controlBar.saveBeforeNewInfo', 'Click "Save & Continue" to save your progress, or "Discard" to start fresh without saving.')}
        onConfirm={handleSaveBeforeNewConfirmed || (() => {})}
        onCancel={handleSaveBeforeNewCancelled || (() => {})}
        confirmLabel={t('controlBar.saveAndContinue', 'Save & Continue')}
        cancelLabel={t('controlBar.discard', 'Discard')}
        variant="primary"
      />

      {/* Start New Game Confirmation */}
      <ConfirmationModal
        isOpen={showStartNewConfirm || false}
        title={t('controlBar.startNewMatchTitle', 'Start New Match?')}
        message={t('controlBar.startNewMatchConfirmation', 'Are you sure you want to start a new match? Any unsaved progress will be lost.')}
        warningMessage={t('controlBar.startNewMatchWarning', 'Make sure you have saved your current game if you want to keep it.')}
        onConfirm={handleStartNewConfirmed || (() => {})}
        onCancel={() => setShowStartNewConfirm?.(false)}
        confirmLabel={t('common.startNew', 'Start New')}
        variant="danger"
      />
    </>
  );
}
