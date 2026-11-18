'use client';

import { useRememberedListSetting, isBoolean, isOneOf, isString } from '@/hooks/useRememberedListSetting';
import { matchesSearch } from '@/utils/listSearch';
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SavedGamesCollection } from '@/types'; // Keep this if SavedGamesCollection is from here
import { Season, Tournament, Team } from '@/types'; // Corrected import path
import type { TranslationKey } from '@/i18n-types';
import { createEntityMaps, getDisplayNames } from '@/utils/entityLookup';
import { listOpponents, normalizeOpponentName } from '@/utils/opponentNames';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import { resolveGameResult } from '@/utils/gameResult';
import { computeGameCompleteness } from '@/utils/gameCompleteness';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import { getLeagueName, CUSTOM_LEAGUE_ID } from '@/config/leagues';
import { LEVELS } from '@/config/gameOptions';
import {
  HiOutlineTrash,
  HiOutlineMagnifyingGlass,
  HiOutlineDocumentText,
  HiOutlineTableCells,
  HiOutlineEllipsisVertical
} from 'react-icons/hi2';
import { DEFAULT_GAME_ID } from '@/config/constants';
import ConfirmationModal from './ConfirmationModal';
import {
  CollapsibleModalHeader,
  modalContainerStyle,
  groupedListStyle,
  searchInputStyle,
  selectStyle,
  switchInputStyle,
  popoverMenuStyle,
  popoverItemStyle,
  iconButtonEditStyle,
  errorBoxStyle,
  pillQuietStyle,
} from '@/styles/modalStyles';
import { extractTimestampFromId } from '@/utils/idGenerator';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { formatAppDate } from '@/utils/localeFormat';

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


type SavedGamesSort = 'date' | 'opponent' | 'result';
const RESULT_RANK = { W: 0, D: 1, L: 2 } as const;

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
  const language = i18n.language;
  const [searchText, setSearchText] = useState<string>('');
  // Filters and sort are remembered on this device (review 7.L10); search is not.
  const [showUnplayedOnly, setShowUnplayedOnly] = useRememberedListSetting('savedGames.unplayedOnly', false, isBoolean);
  const [sortBy, setSortBy] = useRememberedListSetting<SavedGamesSort>(
    'savedGames.sort',
    'date',
    isOneOf<SavedGamesSort>('date', 'opponent', 'result'),
  );
  /** Normalised opponent key, so every spelling of one team is one choice. */
  const [storedOpponentFilter, setOpponentFilter] = useRememberedListSetting('savedGames.opponent', 'all', isString);

  /**
   * The teams in this list, one entry per team however it is spelled.
   *
   * NOT the same as typing a name into the search box. Search is a substring
   * match, so "IPS" also returns IPS/Sininen and IPS/Punainen - two different
   * squads - while a name written two ways is split across two searches. This
   * matches on the normalised key instead: one team, one option, every
   * spelling of it included and no sibling team swept in.
   */
  const opponentOptions = useMemo(
    () =>
      listOpponents(
        Object.entries(savedGames)
          .filter(([id]) => id !== DEFAULT_GAME_ID)
          .map(([, game]) => game?.opponentName ?? ''),
      ),
    [savedGames],
  );
  // A remembered opponent no game uses any more is no filter at all.
  const opponentFilter =
    storedOpponentFilter === 'all' || opponentOptions.some((o) => o.key === storedOpponentFilter)
      ? storedOpponentFilter
      : 'all';

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
      // The app's one search (review 7.L6): accents and case ignored, every typed
      // word must match one of these fields.
      const displayNames = getDisplayNames(gameData, entityMaps);
      const gameType = gameData.gameType || 'soccer';
      const gender = gameData.gender;
      return matchesSearch(searchText, [
        // The game's own team name, and the team's current one (7.17).
        displayNames.teamName,
        displayNames.currentTeamName,
        // The opponent as written and normalised ("ips/sininen" / "ips sininen", 7.L1).
        gameData.opponentName,
        normalizeOpponentName(gameData.opponentName),
        // The date as stored and as the card shows it (7.L1).
        gameData.gameDate,
        gameData.gameDate ? formatAppDate(gameData.gameDate, language) : '',
        displayNames.seasonName,
        displayNames.tournamentName,
        gameType === 'soccer' ? 'soccer jalkapallo' : 'futsal',
        gender === 'boys' ? 'boys pojat' : gender === 'girls' ? 'girls tytöt' : '',
      ]);
    });

    const filteredByOpponent = filteredBySearch.filter(id => {
      if (opponentFilter === 'all') return true;
      return normalizeOpponentName(savedGames[id]?.opponentName) === opponentFilter;
    });

    const filteredByPlayed = filteredByOpponent.filter(id => {
      if (!showUnplayedOnly) return true;
      const gameData = savedGames[id];
      if (!gameData) return false;
      return gameData.isPlayed === false;
    });

    // Pre-extract dates and timestamps once (O(n)) instead of during sort comparisons (O(n log n))
    const gamesWithSortKeys = filteredByPlayed.map(id => {
      const gameData = savedGames[id];
      // Parse gameTime "HH:MM" to minutes for sorting (e.g., "18:30" → 1110)
      let timeMinutes = 0;
      if (gameData?.gameTime) {
        const [h, m] = gameData.gameTime.split(':');
        timeMinutes = (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
      }
      return {
        id,
        dateTimestamp: gameData?.gameDate ? new Date(gameData.gameDate).getTime() : 0,
        timeMinutes,
        idTimestamp: extractTimestampFromId(id) || 0,
        opponentKey: normalizeOpponentName(gameData?.opponentName),
        // Win, draw, loss, then games not played yet.
        resultRank: !gameData || gameData.isPlayed === false ? 3 : RESULT_RANK[resolveGameResult(gameData)],
      };
    });

    // Sort (review 7.L11): opponent A-Z or result (wins first) when chosen, and
    // otherwise / within those: date (newest first) → game time (latest first) →
    // creation date (newest first).
    gamesWithSortKeys.sort((a, b) => {
      if (sortBy === 'opponent' && a.opponentKey !== b.opponentKey) {
        if (!a.opponentKey) return 1;
        if (!b.opponentKey) return -1;
        return a.opponentKey.localeCompare(b.opponentKey, 'fi');
      }
      if (sortBy === 'result' && a.resultRank !== b.resultRank) return a.resultRank - b.resultRank;
      // Primary: by date descending (games without date go last)
      if (b.dateTimestamp !== a.dateTimestamp) {
        if (!a.dateTimestamp) return 1;
        if (!b.dateTimestamp) return -1;
        return b.dateTimestamp - a.dateTimestamp;
      }

      // Secondary: by game time descending (games without time go last within same date)
      if (a.timeMinutes !== b.timeMinutes) {
        if (!a.timeMinutes) return 1;
        if (!b.timeMinutes) return -1;
        return b.timeMinutes - a.timeMinutes;
      }

      // Tertiary: by creation timestamp descending
      return b.idTimestamp - a.idTimestamp;
    });

    return gamesWithSortKeys.map(g => g.id);
  }, [savedGames, searchText, showUnplayedOnly, opponentFilter, entityMaps, language, sortBy]);

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
    setSearchText(e.target.value);
  };

  if (!isOpen) return null;

  // Scrollable Content Area
  // Main content: List of saved games or loading/error message
  let mainContent;
  if (isLoadingGamesList) {
    mainContent = (
      <div className="flex flex-col items-center justify-center h-full text-ink-3 font-ui py-10">
        <svg className="animate-spin h-8 w-8 text-action mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p>{t('loadGameModal.loadingGames', 'Loading games...')}</p>
      </div>
    );
  } else if (loadGamesListError) {
    mainContent = (
      <div className={`${errorBoxStyle} font-ui text-sm text-ink my-4`} role="alert">
        <p className="font-semibold mb-1">{t('common.error', 'Error')}:</p>
        <p>{loadGamesListError}</p>
      </div>
    );
  } else if (filteredGameIds.length === 0) {
    // "Unplayed only" is a filter too (review 7.L1): with it on and nothing
    // matching, the coach was told "No games saved yet".
    const hasFilters = searchText || opponentFilter !== 'all' || showUnplayedOnly;
    mainContent = (
      <div className="flex flex-col items-center justify-center py-16 px-4 font-ui">
        {/* Soccer ball illustration */}
        <div className="w-20 h-20 mb-6 text-ink-3 opacity-60">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 13v1c0 1.1.9 2 2 2v4.93zM17 12c0-.55-.45-1-1-1h-2v-1c0-.55-.45-1-1-1H9V7h4c.55 0 1-.45 1-1V4.59c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39-.26-.81-1-1.39-1.9-1.39h-1v-3z"/>
          </svg>
        </div>
        {hasFilters ? (
          <>
            <h3 className="text-lg font-semibold text-ink-2 mb-2">
              {t('loadGameModal.noGamesMatchFilter', 'No games match your filter')}
            </h3>
            <p className="text-ink-3 text-sm">
              {t('loadGameModal.tryDifferentFilter', 'Try a different search term or clear the filter')}
            </p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-ink-2 mb-2">
              {t('loadGameModal.noGamesSaved', 'No games saved yet')}
            </h3>
            <p className="text-ink-3 text-sm text-center max-w-xs">
              {t('loadGameModal.startFirstGame', 'Start your first game from the home screen to begin tracking matches')}
            </p>
          </>
        )}
      </div>
    );
  } else {
    mainContent = (
      <div className="font-ui">
        {/* Display general game load/delete errors here */}
        {gameLoadError && processingGameId === null && (
          <div className={`${errorBoxStyle} p-3! mb-3 text-sm text-ink`} role="alert">
            {gameLoadError}
          </div>
        )}
        {gameDeleteError && processingGameId === null && (
          <div className={`${errorBoxStyle} p-3! mb-3 text-sm text-ink`} role="alert">
            {gameDeleteError}
          </div>
        )}
        <div className={groupedListStyle}>
          {filteredGameIds.map((gameId) => {
            const game = savedGames[gameId];
            if (!game) return null;
            const isCurrent = gameId === currentGameId;
            // Not played yet: the amber dot in the badge. Played: the result letter.
            // A played game whose record is still incomplete gets a quiet chip
            // (the actionable case); a complete one is announced to screen readers only.
            const completeness = computeGameCompleteness(game);
            const isUnplayed = game.isPlayed === false;
            const showReadinessDot = !isUnplayed && completeness.applicable;
            const isRecordComplete = completeness.overall === 'complete';

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

            // The team name stored with the game (as the match screen shows it)
            const { teamName: liveTeamName } = getDisplayNames(game, entityMaps);

            // Determine display names based on the specific game's homeOrAway setting
            const displayHomeTeamName = game.homeOrAway === 'home' ? (liveTeamName || 'Team') : (game.opponentName || 'Opponent');
            const displayAwayTeamName = game.homeOrAway === 'home' ? (game.opponentName || 'Opponent') : (liveTeamName || 'Team');

            const isProcessingThisGame = processingGameId === gameId;
            const isLoadActionActive = isGameLoading && isProcessingThisGame;
            const disableActions = isGameLoading || isGameDeleting || isGamesImporting;

            // Score display comes from the SAVED game. The old live-session
            // override was retired with the L.3a lift (the modal renders at
            // page level with no session in scope): mid-match the current
            // game's row may trail the live score by one autosave debounce -
            // an accepted, documented trade-off.
            // The team's kit colour, for the stripe that lets a season's
            // games read as one team without parsing every name.
            const rowTeamColor = game.teamId
              ? teams.find((tm) => tm.id === game.teamId)?.color
              : undefined;

            const displayHomeScore = game.homeScore ?? 0;
            const displayAwayScore = game.awayScore ?? 0;

            // Win/loss/draw via the shared resolver (shootout-aware), using the
            // display scores.
            // TODO(PR 2): when the shootout UI lands, pass live session shootoutKicks
            // for the current game (not just the persisted ones) so the result isn't
            // computed from live score + stale kicks while the coach is logging.
            const displayResult = resolveGameResult({
              homeScore: displayHomeScore,
              awayScore: displayAwayScore,
              homeOrAway: game.homeOrAway,
              shootoutKicks: game.shootoutKicks,
            });
            const isDraw = displayResult === 'D';
            const isWin = displayResult === 'W';
            const badgeTone = isDraw ? 'bg-white/[0.09] text-ink-2' : isWin ? 'bg-win/[0.14] text-win' : 'bg-loss/[0.14] text-loss';
            const badgeLetter = isDraw ? t('export.tieShort', 'T') : isWin ? t('export.winShort', 'W') : t('export.lossShort', 'L');

            // The game open in the match view: a faint amber wash from the left.
            const currentGameClass = isCurrent
              ? 'bg-gradient-to-r from-action/[0.09] to-transparent'
              : '';

            const chipClass = 'inline-flex items-center px-[9px] py-1 rounded-full bg-white/[0.06] text-xs font-medium text-ink-2';

            return (
              <div
                key={gameId}
                className={`relative grid grid-cols-[36px_1fr_auto_44px] gap-x-3 items-start py-3.5 pl-3.5 pr-1 cursor-pointer transition-colors hover:bg-white/[0.03] before:absolute before:top-0 before:left-[62px] before:right-0 before:h-px before:bg-hairline first:before:hidden first:rounded-t-[22px] last:rounded-b-[22px] ${currentGameClass}`}
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
                {/* Result badge: the letter, or the amber dot for a game not played yet */}
                {isUnplayed ? (
                  <span
                    className="mt-0.5 grid h-9 w-9 place-items-center rounded-full shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.16)]"
                    title={t('loadGameModal.unplayedBadge', 'Not played')}
                  >
                    <i className="s1-live-dot" aria-hidden="true" />
                    <span className="sr-only">{t('loadGameModal.unplayedBadge', 'Not played')}</span>
                  </span>
                ) : (
                  <span className={`mt-0.5 grid h-9 w-9 place-items-center rounded-full text-xs font-bold tracking-[0.02em] ${badgeTone}`}>
                    {badgeLetter}
                  </span>
                )}

                {/* Teams and date line */}
                <div className="min-w-0">
                  <div className="flex items-center gap-x-1.5 flex-wrap font-semibold leading-tight text-ink">
                    {rowTeamColor && (
                      <span
                        aria-hidden="true"
                        className="w-1 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: rowTeamColor }}
                      />
                    )}
                    <span>{displayHomeTeamName}</span>
                    <em className="not-italic font-normal text-sm text-ink-3">vs</em>
                    <span>{displayAwayTeamName}</span>
                  </div>
                  <div className="mt-[3px] text-[13px] text-ink-3">
                    {[
                      game.gameDate ? formatAppDate(game.gameDate, i18n.language) : null,
                      game.gameDate && game.gameTime ? game.gameTime : null,
                      game.numberOfPeriods && game.periodDurationMinutes ? `${game.numberOfPeriods}×${game.periodDurationMinutes}min` : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {(game.wentToOvertime || game.wentToPenalties) && (
                    <div className="text-xs text-ink-3 font-medium">
                      {[
                        game.wentToOvertime && t('gameResult.overtime', 'OT'),
                        game.wentToPenalties && t('gameResult.penalties', 'PKs'),
                      ].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>

                {/* Score: italic numerals (grey while not a result yet) */}
                <div
                  className={`mt-[3px] whitespace-nowrap pr-[0.08em] font-display text-[30px] font-extrabold italic leading-[0.9] ${isUnplayed ? 'text-ink-3' : 's1-numeral'}`}
                >
                  {displayHomeScore}-{displayAwayScore}
                </div>

                {/* Actions menu button */}
                <div className="relative" ref={actionsMenuId === gameId ? actionsMenuRef : null}>
                  <button
                    onClick={(e) => handleActionsMenuToggle(e, gameId)}
                    className={iconButtonEditStyle}
                    aria-label={t('loadGameModal.gameActions', 'Game actions')}
                    aria-haspopup="menu"
                    aria-expanded={actionsMenuId === gameId}
                    disabled={disableActions}
                  >
                    {isLoadActionActive ? (
                      <svg className="animate-spin h-4 w-4 text-action" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <HiOutlineEllipsisVertical className="w-5 h-5" />
                    )}
                  </button>

                  {/* Actions dropdown menu */}
                  {actionsMenuId === gameId && (
                    <div role="menu" className={`${popoverMenuStyle} ${menuPositions[gameId] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                      <button
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExportOneJson(gameId);
                          setActionsMenuId(null);
                        }}
                        className={popoverItemStyle}
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
                        className={popoverItemStyle}
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
                        className={`${popoverItemStyle} text-red-400! hover:bg-red-500/10!`}
                        disabled={disableActions}
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                        {t('common.delete', 'Delete')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Chips: plain text (no coloured dots - green/red mean results only) */}
                <div className="col-start-2 col-end-[-1] mt-2 flex flex-wrap gap-1.5 pr-1.5 empty:hidden">
                  {showReadinessDot && (
                    isRecordComplete ? (
                      <span className="sr-only">{t('loadGameModal.readyTitle', 'Record complete')}</span>
                    ) : (
                      <span className={pillQuietStyle} title={t('loadGameModal.needsFinishingTitle', 'Needs finishing')}>
                        {t('loadGameModal.needsFinishingTitle', 'Needs finishing')}
                      </span>
                    )
                  )}
                  {game.gameType === 'futsal' && (
                    <span className={chipClass}>{t('common.gameTypeFutsal', 'Futsal')}</span>
                  )}
                  {game.gender && (
                    <span className={chipClass}>
                      {game.gender === 'boys' ? t('common.genderBoys', 'Boys') : t('common.genderGirls', 'Girls')}
                    </span>
                  )}
                  {season && (
                    <span className={chipClass}>
                      <span className="sr-only">{t('common.season', 'League')}: </span>
                      {getSeasonDisplayName(season)}
                    </span>
                  )}
                  {leagueName && (
                    <span className={chipClass}>{leagueName}</span>
                  )}
                  {tournament && (
                    <span className={chipClass}>
                      <span className="sr-only">{t('common.tournament', 'Tournament')}: </span>
                      {getTournamentDisplayName(tournament)}
                    </span>
                  )}
                  {seriesLevel && (
                    <span className={chipClass}>
                      {t(`common.level${seriesLevel}` as TranslationKey, seriesLevel)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`${MODAL_BACKDROP} ${Z_LAYER.modal}`} role="dialog" aria-modal="true" aria-label={t('loadGame.title', 'Load Game')}>
      <div className={`${modalContainerStyle} h-full w-full relative`}>
        {/* Modal-chrome slimming: X-header replaces the header + the
            close-only footer. Filter/checkbox stay in the scroll body. */}
        <CollapsibleModalHeader
          title={t('loadGameModal.title', 'Load Game')}
          onClose={onClose}
          closeLabel={t('common.doneButton', 'Done')}
        />

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-2 pb-6">
          {/* Search and filters */}
          <div className="relative">
            <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-3" aria-hidden="true" />
            <input type="text" placeholder={t('loadGameModal.filterPlaceholder', 'Filter by name, date, etc...')} aria-label={t('loadGameModal.filterPlaceholder', 'Filter by name, date, etc...')} value={searchText} onChange={handleSearchChange} autoComplete="off" className={searchInputStyle} />
          </div>
          <div className={`mt-2.5 grid gap-2.5 ${opponentOptions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label htmlFor="savedGamesSortSelect" className="sr-only">
                {t('loadGameModal.sortLabel', 'Sort by')}
              </label>
              <select
                id="savedGamesSortSelect"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SavedGamesSort)}
                data-testid="load-game-sort"
                className={`${selectStyle} text-[15px]! pl-3.5! min-w-0`}
              >
                <option value="date">{t('loadGameModal.sortDate', 'Newest first')}</option>
                <option value="opponent">{t('loadGameModal.sortOpponent', 'By opponent')}</option>
                <option value="result">{t('loadGameModal.sortResult', 'By result')}</option>
              </select>
            </div>
            {/* Only worth a control when there is a choice to make. */}
            {opponentOptions.length > 1 && (
              <div>
                <label htmlFor="opponentFilterSelect" className="sr-only">
                  {t('loadGameModal.opponentFilterLabel', 'Opponent')}
                </label>
                <select
                  id="opponentFilterSelect"
                  value={opponentFilter}
                  onChange={(e) => setOpponentFilter(e.target.value)}
                  data-testid="load-game-opponent-filter"
                  className={`${selectStyle} text-[15px]! pl-3.5! min-w-0`}
                >
                  <option value="all">
                    {t('loadGameModal.allOpponentsFilter', 'All opponents')}
                  </option>
                  {opponentOptions.map((opponent) => (
                    <option key={opponent.key} value={opponent.key}>
                      {opponent.spelling} ({opponent.count})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {/* The unplayed-only filter: a switch row (amber when on) */}
          <label className="flex items-center justify-between gap-3 min-h-11 px-1 pt-3.5 pb-1 mb-4 font-ui text-[15px] text-ink-2 cursor-pointer">
            <span>{t('loadGameModal.showUnplayedOnly', 'Show only unplayed games')}</span>
            <input
              type="checkbox"
              role="switch"
              checked={showUnplayedOnly}
              onChange={(e) => setShowUnplayedOnly(e.target.checked)}
              className={switchInputStyle}
            />
          </label>

          {mainContent}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title={t('loadGameModal.deleteConfirmTitle', 'Delete Game')}
        message={t('loadGameModal.deleteConfirm', 'Are you sure you want to delete the saved game "{{gameName}}"? This action cannot be undone.', { gameName: gameToDelete?.name || '' })}
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
