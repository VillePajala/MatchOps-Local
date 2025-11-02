'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SavedGamesCollection } from '@/types'; // Keep this if SavedGamesCollection is from here
import { Season, Tournament, Team } from '@/types'; // Corrected import path
import logger from '@/utils/logger';
import { createEntityMaps, getDisplayNames } from '@/utils/entityLookup';
import {
  HiOutlineTrash,
  HiOutlineDocumentText,
  HiOutlineTableCells,
  HiOutlineEllipsisVertical
} from 'react-icons/hi2';
import { DEFAULT_GAME_ID } from '@/config/constants';
import ConfirmationModal from './ConfirmationModal';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';

export interface LoadGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedGames: SavedGamesCollection;
  onLoad: (gameId: string) => void;
  onDelete: (gameId: string) => void;
  onExportOneJson: (gameId: string) => void;
  onExportOneExcel: (gameId: string) => void;
  currentGameId?: string;

  isLoadingGamesList?: boolean;
  loadGamesListError?: string | null;
  isGameLoading?: boolean;
  gameLoadError?: string | null;
  isGameDeleting?: boolean;
  gameDeleteError?: string | null;
  isGamesImporting?: boolean;
  processingGameId?: string | null;

  // Fresh data from React Query
  seasons: Season[];
  tournaments: Tournament[];
  teams: Team[];
}

// DEFAULT_GAME_ID now imported from constants 

const LoadGameModal: React.FC<LoadGameModalProps> = ({
  isOpen,
  onClose,
  savedGames,
  onLoad,
  onDelete,
  onExportOneJson,
  onExportOneExcel,
  currentGameId,
  isLoadingGamesList = false,
  loadGamesListError = null,
  isGameLoading = false,
  gameLoadError = null,
  isGameDeleting = false,
  gameDeleteError = null,
  isGamesImporting = false,
  processingGameId = null,
  seasons,
  tournaments,
  teams,
}) => {
  const { t, i18n } = useTranslation();
  const [searchText, setSearchText] = useState<string>('');
  const [filterType, setFilterType] = useState<'season' | 'tournament' | 'team' | null>(null);
  const [filterId, setFilterId] = useState<string | null>(null);
  const [showUnplayedOnly, setShowUnplayedOnly] = useState<boolean>(false);

  // Confirmation modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [gameToDelete, setGameToDelete] = useState<{ id: string; name: string } | null>(null);

  // Actions menu state
  const [actionsMenuId, setActionsMenuId] = useState<string | null>(null);
  const actionsMenuRef = React.useRef<HTMLDivElement>(null);

  // Create entity maps for O(1) lookups (live entity names)
  const entityMaps = useMemo(
    () => createEntityMaps(teams, seasons, tournaments),
    [teams, seasons, tournaments]
  );

  // Close actions menu when clicking outside
  React.useEffect(() => {
    if (!actionsMenuId) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [actionsMenuId]);

  // Filter logic updated to only use searchText
  const filteredGameIds = useMemo(() => {
    const initialIds = Object.keys(savedGames).filter(id => id !== DEFAULT_GAME_ID);
    
    const filteredBySearch = initialIds.filter(id => {
      const gameData = savedGames[id];
      if (!gameData) return false;
      if (!searchText) return true;
      const lowerSearchText = searchText.toLowerCase();

      // Use live entity names for search (fallback to empty string if entity not found)
      const displayNames = getDisplayNames(gameData, entityMaps);
      const teamName = (displayNames.teamName || '').toLowerCase();
      const opponentName = (gameData.opponentName || '').toLowerCase();
      const gameDate = (gameData.gameDate || '').toLowerCase();
      const seasonName = (displayNames.seasonName || '').toLowerCase();
      const tournamentName = (displayNames.tournamentName || '').toLowerCase();

      return (
        teamName.includes(lowerSearchText) ||
        opponentName.includes(lowerSearchText) ||
        gameDate.includes(lowerSearchText) ||
        seasonName.includes(lowerSearchText) ||
        tournamentName.includes(lowerSearchText)
      );
    });

    const filteredByBadge = filteredBySearch.filter(id => {
      if (!filterType || !filterId) return true;
      const gameData = savedGames[id];
      if (!gameData) return false;

      let match = false;
      if (filterType === 'season') {
        match = gameData.seasonId === filterId;
      }
      if (filterType === 'tournament') {
        match = gameData.tournamentId === filterId;
      }
      if (filterType === 'team') {
        // Match games that have the selected team ID, or handle legacy games
        if (filterId === 'legacy') {
          match = !gameData.teamId; // Legacy games have no teamId
        } else {
          match = gameData.teamId === filterId;
        }
      }

      return match;
    });

    const filteredByPlayed = filteredByBadge.filter(id => {
      if (!showUnplayedOnly) return true;
      const gameData = savedGames[id];
      if (!gameData) return false;
      return gameData.isPlayed === false;
    });

    const sortedIds = filteredByPlayed.sort((a, b) => {
      const gameA = savedGames[a];
      const gameB = savedGames[b];
      
      // Primary sort: by date in descending order (newest first)
      const dateA = gameA.gameDate ? new Date(gameA.gameDate).getTime() : 0;
      const dateB = gameB.gameDate ? new Date(gameB.gameDate).getTime() : 0;

      if (dateB !== dateA) {
        // Handle cases where one date is missing (put games without date last)
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA;
      }

      // Secondary sort: by timestamp in game ID (descending, newest first)
      // Extract timestamp assuming format "game_TIMESTAMP_RANDOM"
      try {
        const timestampA = parseInt(a.split('_')[1], 10);
        const timestampB = parseInt(b.split('_')[1], 10);
        
        if (!isNaN(timestampA) && !isNaN(timestampB)) {
          return timestampB - timestampA;
        }
      } catch (error) {
        logger.warn("Could not parse timestamps from game IDs for secondary sort:", a, b, error);
      }
      
      // Fallback if dates are equal and timestamps can't be parsed
      return 0;
    });
    return sortedIds;
  }, [savedGames, searchText, filterType, filterId, showUnplayedOnly, entityMaps]);

  const handleDeleteClick = (gameId: string, gameName: string) => {
    setGameToDelete({ id: gameId, name: gameName });
    setShowDeleteConfirm(true);
    setActionsMenuId(null); // Close actions menu
  };

  const handleDeleteConfirmed = () => {
    if (gameToDelete) {
      onDelete(gameToDelete.id);
    }
    setShowDeleteConfirm(false);
    setGameToDelete(null);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchText = e.target.value;
    setSearchText(newSearchText);
    // If search text is cleared, also clear badge filter
    if (!newSearchText) {
      setFilterType(null);
      setFilterId(null);
    }
  };

  if (!isOpen) return null;

  // Scrollable Content Area
  // Main content: List of saved games or loading/error message
  let mainContent;
  if (isLoadingGamesList) {
    mainContent = (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10">
        <svg className="animate-spin h-8 w-8 text-indigo-400 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p>{t('loadGameModal.loadingGames', 'Loading saved games...')}</p>
      </div>
    );
  } else if (loadGamesListError) {
    mainContent = (
      <div className="bg-red-700/20 border border-red-600 text-red-300 px-4 py-3 rounded-md text-sm my-4 mx-2" role="alert">
        <p className="font-semibold mb-1">{t('common.error', 'Error')}:</p>
        <p>{loadGamesListError}</p>
      </div>
    );
  } else if (filteredGameIds.length === 0) {
    const hasFilters = searchText || (filterType && filterId);
    mainContent = (
      <div className="text-center text-slate-500 py-10 italic">
        {hasFilters ? 
          t('loadGameModal.noGamesMatchFilter', 'No saved games match your filter.') :
          t('loadGameModal.noGamesSaved', 'No games have been saved yet.')
        }
      </div>
    );
  } else {
    mainContent = (
      <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
        {/* Display general game load/delete errors here */}
        {gameLoadError && processingGameId === null && (
          <div className="px-3 py-2 mb-3 bg-red-700/20 border border-red-600 text-red-300 text-xs rounded" role="alert">
            {gameLoadError}
          </div>
        )}
        {gameDeleteError && processingGameId === null && (
          <div className="px-3 py-2 mb-3 bg-red-700/20 border border-red-600 text-red-300 text-xs rounded" role="alert">
            {gameDeleteError}
          </div>
        )}
        <div className="space-y-3">
          {filteredGameIds.map((gameId) => {
            const game = savedGames[gameId];
            if (!game) return null;
            const isCurrent = gameId === currentGameId;

            // Look up entities using maps for O(1) performance
            const season = game.seasonId ? entityMaps.seasons.get(game.seasonId) : null;
            const tournament = game.tournamentId ? entityMaps.tournaments.get(game.tournamentId) : null;

            // Get live entity names (or fallback to snapshots)
            const { teamName: liveTeamName } = getDisplayNames(game, entityMaps);

            // Determine display names based on the specific game's homeOrAway setting
            const displayHomeTeamName = game.homeOrAway === 'home' ? (liveTeamName || 'Team') : (game.opponentName || 'Opponent');
            const displayAwayTeamName = game.homeOrAway === 'home' ? (game.opponentName || 'Opponent') : (liveTeamName || 'Team');

            const isProcessingThisGame = processingGameId === gameId;
            const isLoadActionActive = isGameLoading && isProcessingThisGame;
            const disableActions = isGameLoading || isGameDeleting || isGamesImporting;

            // Calculate score display color
            const scoreColor = (() => {
              if (game.homeScore === game.awayScore) return 'text-slate-300';
              const isWin = (game.homeOrAway === 'home' && game.homeScore > game.awayScore) ||
                           (game.homeOrAway === 'away' && game.awayScore > game.homeScore);
              return isWin ? 'text-green-400' : 'text-red-400';
            })();

            return (
              <div
                key={gameId}
                className={`px-4 py-6 rounded-lg cursor-pointer transition-all bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 ${isCurrent ? 'border-l-4 border-indigo-500' : ''}`}
                data-testid={`game-item-${gameId}`}
                onClick={() => {
                  if (!disableActions && !isLoadActionActive) {
                    onLoad(gameId);
                    onClose();
                  }
                }}
              >
                {/* Card layout with two rows */}
                <div className="flex flex-col gap-3">
                  {/* Top row: Team names and score */}
                  <div className="flex items-start justify-between gap-4">
                    {/* Team names */}
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <span className="font-semibold text-base text-slate-100">
                        {displayHomeTeamName}
                      </span>
                      <span className="text-slate-400 text-sm">vs</span>
                      <span className="font-medium text-base text-slate-200">
                        {displayAwayTeamName}
                      </span>
                    </div>

                    {/* Score and actions */}
                    <div className="flex items-start gap-2 flex-shrink-0">
                      {/* Score */}
                      <div className="text-right">
                        <div className={`text-xl font-bold ${scoreColor}`}>
                          {game.homeScore ?? 0} - {game.awayScore ?? 0}
                        </div>
                      </div>

                      {/* Actions menu button */}
                      <div className="relative" ref={actionsMenuId === gameId ? actionsMenuRef : null}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionsMenuId(actionsMenuId === gameId ? null : gameId);
                          }}
                          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded transition-colors"
                          aria-label="Game actions"
                          disabled={disableActions}
                        >
                          {isLoadActionActive ? (
                            <svg className="animate-spin h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <HiOutlineEllipsisVertical className="w-4 h-4" />
                          )}
                        </button>

                        {/* Actions dropdown menu */}
                        {actionsMenuId === gameId && (
                          <div className="absolute right-0 mt-1 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onExportOneJson(gameId);
                                setActionsMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2"
                              disabled={disableActions}
                            >
                              <HiOutlineDocumentText className="w-4 h-4" />
                              Export JSON
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onExportOneExcel(gameId);
                                setActionsMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2"
                              disabled={disableActions}
                            >
                              <HiOutlineTableCells className="w-4 h-4" />
                              Export Excel
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(gameId, `${displayHomeTeamName} vs ${displayAwayTeamName}`);
                              }}
                              className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600/20 flex items-center gap-2"
                              disabled={disableActions}
                            >
                              <HiOutlineTrash className="w-4 h-4" />
                              {t('common.delete', 'Delete')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom row: Date on left, Badges on right (full width) */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Left side: Date and Status */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      {game.gameDate && (
                        <span>{new Date(game.gameDate).toLocaleDateString(i18n.language)}</span>
                      )}
                      {game.isPlayed === false && (
                        <>
                          {game.gameDate && <span>•</span>}
                          <span className="text-red-400 font-medium">{t('loadGameModal.unplayedBadge', 'NOT PLAYED')}</span>
                        </>
                      )}
                    </div>

                    {/* Right side: Season/Tournament badges */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {season && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {season.name}
                        </span>
                      )}
                      {tournament && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {tournament.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />

        {/* Header */}
        <div className="flex flex-col">
          {/* Title Section */}
          <div className="flex justify-center items-center pt-10 pb-4 backdrop-blur-sm bg-slate-900/20">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">{t('loadGameModal.title', 'Load Game')}</h2>
          </div>

          {/* Fixed Section (Games Counter) */}
          <div className="px-6 pt-1 pb-4 backdrop-blur-sm bg-slate-900/20">
            {/* Games Counter Section */}
            <div className="mb-5 text-center text-sm">
              <div className="flex justify-center items-center text-slate-300">
                <span>
                  <span className="text-yellow-400 font-semibold">{filteredGameIds.length}</span>
                  {" "}
                  {filteredGameIds.length === 1
                    ? t('loadGameModal.gameSingular', 'Game')
                    : t('loadGameModal.gamePlural', 'Games')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 pt-4 pb-6">
          {/* Search and filters */}
          <div className="relative mb-4">
            <input type="text" placeholder={t('loadGameModal.filterPlaceholder', 'Filter by name, date, etc...')} value={searchText} onChange={handleSearchChange} autoComplete="off" className="w-full px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={showUnplayedOnly}
                onChange={(e) => setShowUnplayedOnly(e.target.checked)}
                className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-700 border-slate-500 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
              />
              {t('loadGameModal.showUnplayedOnly', 'Show only unplayed games')}
            </label>
          </div>

          {mainContent}
        </div>
        <ModalFooter>
          <button onClick={onClose} className={primaryButtonStyle}>
            {t('common.doneButton', 'Done')}
          </button>
        </ModalFooter>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title={t('loadGameModal.deleteConfirmTitle', 'Delete Game')}
        message={t('loadGameModal.deleteConfirm', `Are you sure you want to delete the saved game "{gameName}"? This action cannot be undone.`).replace('{gameName}', gameToDelete?.name || '')}
        warningMessage={t('loadGameModal.deleteWarning', 'This action is permanent and cannot be undone.')}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setGameToDelete(null);
        }}
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
      />
    </div>
  );
};

export default LoadGameModal;
