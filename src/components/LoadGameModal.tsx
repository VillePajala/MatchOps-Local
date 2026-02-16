'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SavedGamesCollection } from '@/types'; // Keep this if SavedGamesCollection is from here
import { Season, Tournament, Team } from '@/types'; // Corrected import path
import type { TranslationKey } from '@/i18n-types';
import { createEntityMaps, getDisplayNames } from '@/utils/entityLookup';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import { getLeagueName, CUSTOM_LEAGUE_ID } from '@/config/leagues';
import { LEVELS } from '@/config/gameOptions';
import {
  HiOutlineTrash,
  HiOutlineDocumentText,
  HiOutlineTableCells,
  HiOutlineEllipsisVertical
} from 'react-icons/hi2';
import { DEFAULT_GAME_ID } from '@/config/constants';
import ConfirmationModal from './ConfirmationModal';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import { extractTimestampFromId } from '@/utils/idGenerator';

/**
 * Get validated series level from tournament, returning null if invalid.
 * Validates level exists in LEVELS config to ensure translation key exists.
 */
function getValidatedSeriesLevel(
  tournament: Tournament | null | undefined,
  seriesId: string | undefined
): string | null {
  if (!tournament || !seriesId) return null;
  const series = tournament.series?.find(s => s.id === seriesId);
  const level = series?.level;
  return level && LEVELS.includes(level) ? level : null;
}

export interface LoadGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedGames: SavedGamesCollection;
  onLoad: (gameId: string) => void;
  onDelete: (gameId: string) => void;
  onExportOneJson: (gameId: string) => void;
  onExportOneExcel: (gameId: string) => void;
  currentGameId?: string;
  /**
   * Optional live score override for the currently loaded game.
   * This ensures the current game's card reflects unsaved in-memory score
   * while autosave is paused for open modals.
   */
  currentSessionHomeScore?: number;
  currentSessionAwayScore?: number;

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
  currentSessionHomeScore,
  currentSessionAwayScore,
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
  const [menuPositions, setMenuPositions] = useState<Record<string, boolean>>({});
  const { calculatePosition } = useDropdownPosition();

  // Create entity maps for O(1) lookups (live entity names)
  const entityMaps = useMemo(
    () => createEntityMaps(teams, seasons, tournaments),
    [teams, seasons, tournaments]
  );

  // Escape key handler — guarded so it doesn't fire when delete confirmation is open
  // (ConfirmationModal handles its own Escape with stopImmediatePropagation)
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showDeleteConfirm) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, showDeleteConfirm, onClose]);

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

  const handleActionsMenuToggle = (e: React.MouseEvent<HTMLButtonElement>, gameId: string) => {
    e.stopPropagation();
    const shouldOpenUpward = calculatePosition(e.currentTarget);
    setMenuPositions(prev => ({ ...prev, [gameId]: shouldOpenUpward }));
    setActionsMenuId(actionsMenuId === gameId ? null : gameId);
  };

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
      // Include game type in search (soccer/futsal/jalkapallo)
      const gameType = (gameData.gameType || 'soccer').toLowerCase();
      const gameTypeSearchTerms = gameType === 'soccer' ? 'soccer jalkapallo' : 'futsal';
      // Include gender in search (boys/girls/pojat/tytöt)
      const gender = gameData.gender;
      const genderSearchTerms = gender === 'boys' ? 'boys pojat' : gender === 'girls' ? 'girls tytöt' : '';

      return (
        teamName.includes(lowerSearchText) ||
        opponentName.includes(lowerSearchText) ||
        gameDate.includes(lowerSearchText) ||
        seasonName.includes(lowerSearchText) ||
        tournamentName.includes(lowerSearchText) ||
        gameTypeSearchTerms.includes(lowerSearchText) ||
        genderSearchTerms.includes(lowerSearchText)
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

    // Pre-extract dates and timestamps once (O(n)) instead of during sort comparisons (O(n log n))
    const gamesWithSortKeys = filteredByPlayed.map(id => {
      const gameData = savedGames[id];
      return {
        id,
        dateTimestamp: gameData?.gameDate ? new Date(gameData.gameDate).getTime() : 0,
        idTimestamp: extractTimestampFromId(id) || 0,
      };
    });

    // Sort using pre-extracted values
    gamesWithSortKeys.sort((a, b) => {
      // Primary sort: by date in descending order (newest first)
      if (b.dateTimestamp !== a.dateTimestamp) {
        // Handle cases where one date is missing (put games without date last)
        if (!a.dateTimestamp) return 1;
        if (!b.dateTimestamp) return -1;
        return b.dateTimestamp - a.dateTimestamp;
      }

      // Secondary sort: by timestamp in game ID (descending, newest first)
      return b.idTimestamp - a.idTimestamp;
    });

    return gamesWithSortKeys.map(g => g.id);
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
      <div className="flex flex-col items-center justify-center py-16 px-4">
        {/* Soccer ball illustration */}
        <div className="w-20 h-20 mb-6 text-slate-600">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 13v1c0 1.1.9 2 2 2v4.93zM17 12c0-.55-.45-1-1-1h-2v-1c0-.55-.45-1-1-1H9V7h4c.55 0 1-.45 1-1V4.59c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39-.26-.81-1-1.39-1.9-1.39h-1v-3z"/>
          </svg>
        </div>
        {hasFilters ? (
          <>
            <h3 className="text-lg font-medium text-slate-300 mb-2">
              {t('loadGameModal.noGamesMatchFilter', 'No games match your filter')}
            </h3>
            <p className="text-slate-500 text-sm">
              {t('loadGameModal.tryDifferentFilter', 'Try a different search term or clear the filter')}
            </p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-medium text-slate-300 mb-2">
              {t('loadGameModal.noGamesSaved', 'No games saved yet')}
            </h3>
            <p className="text-slate-500 text-sm text-center max-w-xs">
              {t('loadGameModal.startFirstGame', 'Start your first game from the home screen to begin tracking matches')}
            </p>
          </>
        )}
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

            // Get league name for season games
            // Priority: game's leagueId > season's leagueId (game can override season default)
            const effectiveLeagueId = game.leagueId || season?.leagueId;
            const leagueName = effectiveLeagueId === CUSTOM_LEAGUE_ID
              ? (game.customLeagueName || season?.customLeagueName || null)
              : (effectiveLeagueId ? getLeagueName(effectiveLeagueId) : null);

            // Get series level for tournament games (with validation)
            const seriesLevel = getValidatedSeriesLevel(tournament, game.tournamentSeriesId);

            // Get live entity names (or fallback to snapshots)
            const { teamName: liveTeamName } = getDisplayNames(game, entityMaps);

            // Determine display names based on the specific game's homeOrAway setting
            const displayHomeTeamName = game.homeOrAway === 'home' ? (liveTeamName || 'Team') : (game.opponentName || 'Opponent');
            const displayAwayTeamName = game.homeOrAway === 'home' ? (game.opponentName || 'Opponent') : (liveTeamName || 'Team');

            const isProcessingThisGame = processingGameId === gameId;
            const isLoadActionActive = isGameLoading && isProcessingThisGame;
            const disableActions = isGameLoading || isGameDeleting || isGamesImporting;

            // Score display: use live session score for the current game if provided
            const displayHomeScore = isCurrent && typeof currentSessionHomeScore === 'number'
              ? currentSessionHomeScore
              : (game.homeScore ?? 0);
            const displayAwayScore = isCurrent && typeof currentSessionAwayScore === 'number'
              ? currentSessionAwayScore
              : (game.awayScore ?? 0);

            // Calculate score display color using display scores
            // Determine win/loss/draw state
            const isDraw = displayHomeScore === displayAwayScore;
            const isWin = !isDraw && (
              (game.homeOrAway === 'home' && displayHomeScore > displayAwayScore) ||
              (game.homeOrAway === 'away' && displayAwayScore > displayHomeScore)
            );
            // Score color based on result
            const scoreColor = isDraw ? 'text-slate-300' : isWin ? 'text-green-400' : 'text-red-400';

            // Left border accent for result
            const resultBorderClass = isDraw
              ? 'border-l-4 border-slate-500'
              : isWin
                ? 'border-l-4 border-green-500'
                : 'border-l-4 border-red-500';

            // Current game highlight with glow
            const currentGameClass = isCurrent
              ? 'ring-1 ring-indigo-400/60 bg-indigo-900/20'
              : '';

            return (
              <div
                key={gameId}
                className={`px-4 py-6 rounded-lg cursor-pointer transition-all bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:brightness-110 ${resultBorderClass} ${currentGameClass}`}
                data-testid={`game-item-${gameId}`}
                onClick={() => {
                  if (!disableActions && !isLoadActionActive) {
                    // Note: Don't call onClose() here - the handler closes the modal
                    // after the game loads successfully. Calling it here causes a flash
                    // where the old field is briefly visible before the new game renders.
                    onLoad(gameId);
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
                      {/* Score - prominent display */}
                      <div className="text-right">
                        <div className={`text-2xl font-black tracking-tight ${scoreColor}`}>
                          {displayHomeScore} <span className="text-slate-500">-</span> {displayAwayScore}
                        </div>
                        {(game.wentToOvertime || game.wentToPenalties) && (
                          <div className="text-xs text-slate-400 font-medium">
                            {[
                              game.wentToOvertime && t('gameResult.overtime', 'OT'),
                              game.wentToPenalties && t('gameResult.penalties', 'PKs'),
                            ].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </div>

                      {/* Actions menu button */}
                      <div className="relative" ref={actionsMenuId === gameId ? actionsMenuRef : null}>
                        <button
                          onClick={(e) => handleActionsMenuToggle(e, gameId)}
                          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded transition-colors"
                          aria-label={t('loadGameModal.gameActions', 'Game actions')}
                          aria-haspopup="menu"
                          aria-expanded={actionsMenuId === gameId}
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
                          <div role="menu" className={`absolute right-0 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50 ${menuPositions[gameId] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                            <button
                              role="menuitem"
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
                              role="menuitem"
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
                              role="menuitem"
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

                  {/* Bottom row: Game data left, category labels right */}
                  <div className="flex items-end justify-between gap-4 text-xs">
                    {/* Left: Game data (date, duration, status) */}
                    <div className="flex items-end gap-3">
                      {/* Date and duration stacked */}
                      {(game.gameDate || (game.numberOfPeriods && game.periodDurationMinutes)) && (
                        <div className="flex flex-col text-slate-400">
                          {game.gameDate && (
                            <span>
                              {new Date(game.gameDate).toLocaleDateString(i18n.language)}
                              {game.gameTime && ` ${game.gameTime}`}
                            </span>
                          )}
                          {game.numberOfPeriods && game.periodDurationMinutes && (
                            <span className="text-slate-500 text-[10px]">
                              {game.numberOfPeriods}×{game.periodDurationMinutes}min
                            </span>
                          )}
                        </div>
                      )}
                      {game.isPlayed === false && (
                        <span className="px-2 py-0.5 rounded-full bg-red-600/80 text-red-100 font-semibold uppercase text-[10px] tracking-wide">
                          {t('loadGameModal.unplayedBadge', 'NOT PLAYED')}
                        </span>
                      )}
                    </div>

                    {/* Right: Category labels - wrap upward from bottom right */}
                    <div className="flex flex-wrap-reverse justify-end content-end gap-1.5">
                      {/* Game type */}
                      {game.gameType === 'futsal' && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                          {t('common.gameTypeFutsal', 'Futsal')}
                        </span>
                      )}
                      {/* Gender */}
                      {game.gender && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-pink-400"></span>
                          {game.gender === 'boys' ? t('common.genderBoys', 'Boys') : t('common.genderGirls', 'Girls')}
                        </span>
                      )}
                      {/* Season */}
                      {season && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" aria-hidden="true"></span>
                          <span className="sr-only">{t('common.season', 'Season')}: </span>
                          {getSeasonDisplayName(season)}
                        </span>
                      )}
                      {/* League */}
                      {leagueName && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                          {leagueName}
                        </span>
                      )}
                      {/* Tournament */}
                      {tournament && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" aria-hidden="true"></span>
                          <span className="sr-only">{t('common.tournament', 'Tournament')}: </span>
                          {getTournamentDisplayName(tournament)}
                        </span>
                      )}
                      {/* Series level */}
                      {seriesLevel && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          {t(`common.level${seriesLevel}` as TranslationKey, seriesLevel)}
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
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display" role="dialog" aria-modal="true" aria-label={t('loadGame.title', 'Load Game')}>
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
