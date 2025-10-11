'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SavedGamesCollection } from '@/types'; // Keep this if SavedGamesCollection is from here
import { Season, Tournament, Team } from '@/types'; // Corrected import path
import logger from '@/utils/logger';
import { createEntityMaps, getDisplayNames } from '@/utils/entityLookup';
import {
  HiOutlineDocumentArrowDown,
  HiOutlineTrash,
  HiOutlineDocumentText,
  HiOutlineTableCells,
  HiOutlineClock,
  HiOutlineMapPin,
  HiOutlineMagnifyingGlass,
  HiOutlineChevronDown,
  HiOutlineChevronUp
} from 'react-icons/hi2';
import { DEFAULT_GAME_ID } from '@/config/constants';
import ConfirmationModal from './ConfirmationModal';

export interface LoadGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedGames: SavedGamesCollection;
  onLoad: (gameId: string) => void;
  onDelete: (gameId: string) => void;
  onExportOneJson: (gameId: string) => void;
  onExportOneCsv: (gameId: string) => void;
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
  onExportOneCsv,
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<string>('');
  const [filterType, setFilterType] = useState<'season' | 'tournament' | 'team' | null>(null);
  const [filterId, setFilterId] = useState<string | null>(null);
  const [showUnplayedOnly, setShowUnplayedOnly] = useState<boolean>(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Confirmation modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [gameToDelete, setGameToDelete] = useState<{ id: string; name: string } | null>(null);

  // Create entity maps for O(1) lookups (live entity names)
  const entityMaps = useMemo(
    () => createEntityMaps(teams, seasons, tournaments),
    [teams, seasons, tournaments]
  );

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
  };

  const handleDeleteConfirmed = () => {
    if (gameToDelete) {
      onDelete(gameToDelete.id);
      setOpenMenuId(null); // Close menu after delete
    }
    setShowDeleteConfirm(false);
    setGameToDelete(null);
  };

  // --- Event Handlers ---
  const handleBadgeClick = (type: 'season' | 'tournament' | 'team', id: string) => {
    if (filterType === type && filterId === id) {
      // Clicked the currently active filter badge, so clear it
      setFilterType(null);
      setFilterId(null);
    } else {
      // Set new filter
      setFilterType(type);
      setFilterId(id);
    }
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

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
      <ul className="scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 pr-1 px-1 overflow-x-hidden">
        {/* Display general game load/delete errors here, above the list but inside scroll area if many games */}
        {gameLoadError && processingGameId === null && ( // Show if error is general, not for a specific item in loop
          <li className="px-3 py-2 bg-red-700/20 border-b border-red-600 text-red-300 text-xs" role="alert">
            {gameLoadError}
          </li>
        )}
        {gameDeleteError && processingGameId === null && (
          <li className="px-3 py-2 bg-red-700/20 border-b border-red-600 text-red-300 text-xs" role="alert">
            {gameDeleteError}
          </li>
        )}
        {filteredGameIds.map((gameId) => {
          const game = savedGames[gameId];
          if (!game) return null;
          const isCurrent = gameId === currentGameId;

          // Look up entities using maps for O(1) performance
          const season = game.seasonId ? entityMaps.seasons.get(game.seasonId) : null;
          const tournament = game.tournamentId ? entityMaps.tournaments.get(game.tournamentId) : null;
          const team = game.teamId ? entityMaps.teams.get(game.teamId) : null;
          const isOrphaned = game.teamId && !team; // Game has teamId but team doesn't exist
          const contextName = season?.name || tournament?.name;
          const contextType = season ? 'Season' : (tournament ? 'Tournament' : null);
          const contextId = season?.id || tournament?.id;

          // Get live entity names (or fallback to snapshots)
          const { teamName: liveTeamName } = getDisplayNames(game, entityMaps);

          // Determine display names based on the specific game's homeOrAway setting
          const displayHomeTeamName = game.homeOrAway === 'home' ? (liveTeamName || 'Team') : (game.opponentName || 'Opponent');
          const displayAwayTeamName = game.homeOrAway === 'home' ? (game.opponentName || 'Opponent') : (liveTeamName || 'Team');

          const isProcessingThisGame = processingGameId === gameId;
          const isLoadActionActive = isGameLoading && isProcessingThisGame;
          const disableActions = isGameLoading || isGameDeleting || isGamesImporting;

          // Get game status (removed unused variable)
          const totalPlayers = game.selectedPlayerIds?.length || 0;
          const assessmentsDone = Object.keys(game.assessments || {}).length;
          const assessmentsComplete = totalPlayers > 0 && assessmentsDone >= totalPlayers;
          const isExpanded = expandedIds.has(gameId);

          // Get the index for alternating card styles
          const index = filteredGameIds.indexOf(gameId);
          const cardBaseStyles = index % 2 === 0 
            ? 'bg-slate-700/60 border-slate-600/60 hover:bg-slate-700/80 hover:border-slate-500/80'
            : 'bg-slate-700/40 border-slate-600/40 hover:bg-slate-700/60 hover:border-slate-500/60';

          return (
            <li
              key={gameId}
              className={`relative mb-5 last:mb-0 ${cardBaseStyles} rounded-lg border shadow-lg transition-all duration-200 hover:shadow-xl overflow-hidden ${
                isCurrent ? 'ring-2 ring-indigo-500 border-indigo-500' : ''
              } ${openMenuId === gameId ? 'z-10' : ''}`}
              data-testid={`game-item-${gameId}`}
            >
              <button
                type="button"
                onClick={() => toggleExpanded(gameId)}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? t('loadGameModal.collapseCard', 'Collapse details') : t('loadGameModal.expandCard', 'Expand details')}
                className="w-full p-5 text-left hover:bg-slate-700/20 transition-colors rounded-lg flex justify-between items-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 min-w-0 flex-wrap sm:flex-nowrap">
                    <h3 className={`text-lg truncate min-w-0 ${
                      // "Your team" based on homeOrAway setting
                      game.homeOrAway === 'home' 
                        ? `font-semibold ${isCurrent ? 'text-indigo-400' : 'text-slate-100'}` 
                        : `font-normal ${isCurrent ? 'text-indigo-300' : 'text-slate-300'}`
                    }`}>
                      {displayHomeTeamName}
                    </h3>
                    <span className="text-slate-400 font-medium shrink-0">vs</span>
                    <h3 className={`text-lg truncate min-w-0 ${
                      // "Your team" based on homeOrAway setting  
                      game.homeOrAway === 'away' 
                        ? `font-semibold ${isCurrent ? 'text-indigo-400' : 'text-slate-100'}` 
                        : `font-normal ${isCurrent ? 'text-indigo-300' : 'text-slate-300'}`
                    }`}>
                      {displayAwayTeamName}
                    </h3>
                  </div>
                  {/* Context badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    {contextName && contextType && contextId && (
                      <span
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleBadgeClick(contextType.toLowerCase() as ('season' | 'tournament'), contextId);
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBadgeClick(contextType.toLowerCase() as ('season' | 'tournament'), contextId);
                        }}
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                          contextType.toLowerCase() === 'tournament' 
                            ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30' 
                            : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                        } ${filterType === contextType.toLowerCase() && filterId === contextId ? 'ring-2 ring-indigo-500' : ''}`}
                        title={t('loadGameModal.filterByTooltip', 'Filter by {{name}}', { replace: { name: contextName } }) ?? `Filter by ${contextName}`}
                      >
                        {contextName}
                      </span>
                    )}

                    {/* Team badge or orphaned indicator */}
                    {isOrphaned ? (
                      <span
                        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        title={t('loadGameModal.orphanedGameTooltip', 'Original team no longer exists')}
                      >
                        ⚠️ {t('loadGameModal.orphanedTeam', 'Team Deleted')}
                      </span>
                    ) : team ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleBadgeClick('team', team.id);
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBadgeClick('team', team.id);
                        }}
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                          filterType === 'team' && filterId === team.id ? 'ring-2 ring-green-500' : ''
                        }`}
                        style={{ 
                          backgroundColor: team.color ? `${team.color}20` : '#10B98120',
                          color: team.color || '#10B981'
                        }}
                        title={t('loadGameModal.filterByTeam', 'Filter by team {{name}}', { replace: { name: team.name } }) ?? `Filter by team ${team.name}`}
                      >
                        {team.name}
                      </span>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleBadgeClick('team', 'legacy');
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBadgeClick('team', 'legacy');
                        }}
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 ${
                          filterType === 'team' && filterId === 'legacy' ? 'ring-2 ring-amber-500' : ''
                        }`}
                        title={t('loadGameModal.legacyGameTooltip', 'Legacy game (no team assigned)')}
                      >
                        {t('loadGameModal.legacy', 'Legacy')}
                      </span>
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400 mb-3">
                    {game.gameDate && (
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{new Date(game.gameDate).toLocaleDateString(i18n.language)}</span>
                      </div>
                    )}
                    {game.gameTime && (
                      <div className="flex items-center gap-1">
                        <HiOutlineClock className="w-4 h-4" />
                        <span>{game.gameTime}</span>
                      </div>
                    )}
                    {game.gameLocation && (
                      <div className="flex items-center gap-1">
                        <HiOutlineMapPin className="w-4 h-4" />
                        <span>{game.gameLocation}</span>
                      </div>
                    )}
                  </div>

                  {/* Status badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {game.isPlayed === false && (
                      <span className="bg-red-500/20 text-red-300 px-2 py-1 rounded text-xs font-medium">
                        {t('loadGameModal.unplayedBadge', 'NOT PLAYED')}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="bg-green-500/20 text-green-300 px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        {t('loadGameModal.currentlyLoaded', 'Loaded')}
                      </span>
                    )}
                    {totalPlayers > 0 && !assessmentsComplete && (
                      <span className="bg-amber-500/20 text-amber-300 px-2 py-1 rounded text-xs font-medium">
                        Assessments Pending
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-6 flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${(() => {
                      if (game.homeScore === game.awayScore) return 'text-gray-300';
                      const isWin = (game.homeOrAway === 'home' && game.homeScore > game.awayScore) || 
                                   (game.homeOrAway === 'away' && game.awayScore > game.homeScore);
                      return isWin ? 'text-green-400' : 'text-red-400';
                    })()}`}>
                      {game.homeScore ?? 0} - {game.awayScore ?? 0}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Final Score</div>
                  </div>
                  {isExpanded ? <HiOutlineChevronUp className="w-5 h-5 text-slate-400" /> : <HiOutlineChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-600/40 bg-slate-700/40">
                  <div className="p-5 space-y-4">
                    {/* Game notes */}
                    {game.gameNotes && (
                      <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/40">
                        <div className="text-sm font-medium text-slate-200 mb-2">Game Notes</div>
                        <div className="text-slate-300 whitespace-pre-line leading-relaxed">{game.gameNotes}</div>
                      </div>
                    )}

                    {/* Assessments progress */}
                    {totalPlayers > 0 && (
                      <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-200">Player Assessments</span>
                          <span className="text-xs text-slate-400">{Math.round((assessmentsDone / totalPlayers) * 100)}%</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="h-1.5 bg-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${(assessmentsDone / totalPlayers) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Actions row */}
                    <div className="flex items-center justify-between">
                      {/* Left: primary Load button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onLoad(gameId); onClose(); }}
                        className={`px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center ${
                          isLoadActionActive ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        disabled={disableActions || isLoadActionActive}
                      >
                        {isLoadActionActive ? (
                          <svg className="animate-spin h-4 w-4 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <HiOutlineDocumentArrowDown className="h-4 w-4 mr-2" />
                        )}
                        {t('loadGameModal.loadButton', 'Load Game')}
                      </button>

                      {/* Right: secondary icon buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); onExportOneJson(gameId); }}
                          className={`p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700/40 rounded-lg transition-colors ${
                            isLoadActionActive ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          disabled={disableActions || isLoadActionActive}
                          title="Export JSON"
                        >
                          <HiOutlineDocumentText className="h-5 w-5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onExportOneCsv(gameId); }}
                          className={`p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700/40 rounded-lg transition-colors ${
                            isLoadActionActive ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          disabled={disableActions || isLoadActionActive}
                          title="Export CSV"
                        >
                          <HiOutlineTableCells className="h-5 w-5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(gameId, `${liveTeamName || 'Team'} vs ${game.opponentName || 'Opponent'}`); }}
                          className={`p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors ${
                            isLoadActionActive ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          disabled={disableActions || isLoadActionActive}
                          title="Delete"
                        >
                          <HiOutlineTrash className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {isProcessingThisGame && gameLoadError && (
                    <p className="text-xs text-red-400 mt-1 animate-pulse">{gameLoadError}</p>
                  )}
                  {isProcessingThisGame && gameDeleteError && (
                    <p className="text-xs text-red-400 mt-1 animate-pulse">{gameDeleteError}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
        <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">{t('loadGameModal.title', 'Load Game')}</h2>
        </div>
        <div className="px-6 py-4 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          <div className="relative">
            <input type="text" placeholder={t('loadGameModal.filterPlaceholder', 'Filter by name, date, etc...')} value={searchText} onChange={handleSearchChange} className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
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

          {/* Team Filter Section */}
          {teams.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-slate-400 mb-2">
                {t('loadGameModal.teamFilter', 'Filter by Team:')}
              </div>
              <div className="flex flex-wrap gap-2">
                {/* All Teams option */}
                <button
                  onClick={() => {
                    setFilterType(null);
                    setFilterId(null);
                  }}
                  className={`inline-flex items-center px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filterType !== 'team' 
                      ? 'bg-slate-600/80 text-slate-200 hover:bg-slate-600' 
                      : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {t('loadGameModal.allTeams', 'All Teams')}
                </button>

                {/* Legacy games option */}
                <button
                  onClick={() => handleBadgeClick('team', 'legacy')}
                  className={`inline-flex items-center px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filterType === 'team' && filterId === 'legacy'
                      ? 'bg-amber-500/30 text-amber-300 ring-2 ring-amber-500/50' 
                      : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                  }`}
                >
                  {t('loadGameModal.legacyGames', 'Legacy Games')}
                </button>

                {/* Team filter buttons */}
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => handleBadgeClick('team', team.id)}
                    className={`inline-flex items-center px-3 py-1 rounded text-xs font-medium transition-colors ${
                      filterType === 'team' && filterId === team.id
                        ? 'bg-green-500/30 text-green-300 ring-2 ring-green-500/50' 
                        : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    }`}
                    style={team.color ? { 
                      backgroundColor: `${team.color}20`, 
                      color: team.color,
                      ...(filterType === 'team' && filterId === team.id ? { 
                        boxShadow: `0 0 0 2px ${team.color}80` 
                      } : {})
                    } : undefined}
                  >
                    {team.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
          {mainContent}
        </div>
        <div className="p-4 border-t border-slate-700/20 backdrop-blur-sm bg-slate-900/20 flex-shrink-0">
          <button onClick={onClose} className="w-full px-4 py-2 rounded-md font-semibold text-slate-200 bg-slate-700 hover:bg-slate-600 transition-colors">
            {t('common.close', 'Close')}
          </button>
        </div>
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
