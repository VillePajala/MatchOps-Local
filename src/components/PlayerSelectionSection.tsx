'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Player } from '@/types';
import { sortPlayersByLastName } from '@/utils/gamePlayerList';
import { matchesSearch, playerSearchFields } from '@/utils/listSearch';
import { HiOutlineMagnifyingGlass } from 'react-icons/hi2';
import {
  sectionLabelStyle,
  checkboxStyle,
  inputBaseStyle,
  secondaryButtonStyle,
  iconButtonCancelStyle,
  badgeArchivedStyle,
  fieldErrorStyle,
} from '@/styles/modalStyles';

/** Longer lists than this get a search box. */
const PICKER_SEARCH_THRESHOLD = 12;

export interface PlayerSelectionSectionProps {
  availablePlayers: Player[];
  selectedPlayerIds: string[];
  onSelectedPlayersChange: (ids: string[]) => void;
  title: string;
  playersSelectedText: string; // like 'selected'
  selectAllText: string;
  noPlayersText: string;
  disabled?: boolean;
  /**
   * Players no longer in the club roster (kept in a game's list as its record). They are
   * marked, so a removed player can be told apart from a current one with the same name.
   */
  removedPlayerIds?: ReadonlySet<string>;
  /**
   * Enable flexible height to fill parent container.
   *
   * When true:
   * - Component wrapper gets `h-full` class
   * - Player list uses `flex-1 min-h-0` instead of `max-h-[336px]`
   * - Component stretches to fill available vertical space
   *
   * When false (default):
   * - Component uses natural height
   * - Player list has fixed `max-h-[336px]` (six 56px rows) with internal scrolling
   *
   * Use Cases:
   * - Set to `true` when component is in a fixed-height container (e.g., UnifiedTeamModal roster edit)
   * - Leave `false` for modals with dynamic height (e.g., NewGameSetupModal, GameSettingsModal)
   *
   * @default false
   */
  useFlexHeight?: boolean;
  /**
   * Roster bridge (two-level restructure 3.2): inline "add to club roster".
   * When provided, the picker renders an add row - the handler writes the
   * CLUB roster and (at the call site) selects the new player in the game.
   * The ONLY club-write from match scope. Resolve `true` on success (clears
   * + closes the row) or a ready-to-display error message (duplicate name,
   * failed write) shown inline under the row.
   */
  onAddPlayer?: (name: string, nickname?: string) => Promise<true | string>;
  /** Label for the inline-add trigger (e.g. "Lisää uusi pelaaja"). */
  addPlayerLabel?: string;
  /** Label for the submit button (e.g. "Lisää"). */
  addPlayerConfirmLabel?: string;
  /** Placeholder for the inline-add name input. */
  addPlayerPlaceholder?: string;
  /** Placeholder for the OPTIONAL nickname input (what the disc shows). */
  addPlayerNicknamePlaceholder?: string;

  /**
   * Additional CSS classes to apply to the wrapper div.
   *
   * Useful for:
   * - Custom spacing or padding adjustments
   * - Additional styling that doesn't conflict with base styles
   *
   * Note: Base styles (the section label row and the list surface) are always applied.
   *
   * @default ''
   */
  className?: string;
}

const PlayerSelectionSection: React.FC<PlayerSelectionSectionProps> = ({
  availablePlayers,
  removedPlayerIds,
  selectedPlayerIds,
  onSelectedPlayersChange,
  title,
  playersSelectedText,
  selectAllText,
  noPlayersText,
  disabled,
  useFlexHeight = false,
  className = '',
  onAddPlayer,
  addPlayerLabel,
  addPlayerConfirmLabel,
  addPlayerPlaceholder,
  addPlayerNicknamePlaceholder,
}) => {
  const { t } = useTranslation();
  // Same order as the club roster list: by last name.
  const sortedPlayers = React.useMemo(() => sortPlayersByLastName(availablePlayers), [availablePlayers]);
  // A search box once the list is long enough to scroll (review 7.L9): a squad is
  // picked from a club roster of 50-100. It only narrows what is shown - ticks and
  // "Select all" still work on every player.
  const [query, setQuery] = React.useState('');
  const showSearch = availablePlayers.length > PICKER_SEARCH_THRESHOLD;
  const visiblePlayers = React.useMemo(
    () => (showSearch && query.trim() ? sortedPlayers.filter((p) => matchesSearch(query, playerSearchFields(p))) : sortedPlayers),
    [sortedPlayers, query, showSearch],
  );
  const allSelected = availablePlayers.length > 0 && availablePlayers.every((p) => selectedPlayerIds.includes(p.id));
  const [newPlayerNickname, setNewPlayerNickname] = useState('');
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const submitAddPlayer = async () => {
    const name = newPlayerName.trim();
    // `disabled` gate: the whole section serializes against the modal's
    // in-flight mutations (isProcessing) - the add-write must too.
    if (!name || !onAddPlayer || isSubmittingAdd || disabled) return;
    setIsSubmittingAdd(true);
    setAddError(null);
    try {
      const result = await onAddPlayer(name, newPlayerNickname.trim() || undefined);
      if (result === true) {
        setNewPlayerName('');
        setNewPlayerNickname('');
        setIsAddingOpen(false);
      } else {
        // Keep the input open for retry AND say why nothing happened
        // (duplicate name / failed write - the caller words it).
        setAddError(result);
      }
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  return (
    <div className={`flex flex-col font-ui ${useFlexHeight ? 'h-full' : ''} ${className}`}>
      {/* Section label with the count in the same row; the list is its own
          surface below it (no card-in-a-card). */}
      <div className="flex items-baseline justify-between gap-3 px-1 mb-2.5 flex-shrink-0">
        <h3 className={sectionLabelStyle}>{title}</h3>
        <div className="text-[13px] text-ink-3 whitespace-nowrap">
          <span className="font-bold text-ink">{selectedPlayerIds.length}</span>{' / '}
          <span>{availablePlayers.length}</span>{' '}
          {playersSelectedText}
        </div>
      </div>
      <div className={`s1-list overflow-hidden flex flex-col ${useFlexHeight ? 'flex-1 min-h-0' : ''}`}>
      {availablePlayers.length > 0 ? (
        <>
          <div className="flex-shrink-0 border-b border-hairline">
            <label className="flex items-center gap-3.5 min-h-14 px-4 text-base font-semibold text-ink cursor-pointer">
              <input
                type="checkbox"
                disabled={disabled || isSubmittingAdd}
                // Every listed player selected - by id, not by count (review 7.L4): a
                // selection holding an id not in this list made the counts match
                // while a listed player was unticked. Selecting all follows the order
                // shown (last name), which the assessment list then keeps.
                checked={allSelected}
                onChange={() => {
                  if (allSelected) {
                    onSelectedPlayersChange([]);
                  } else {
                    onSelectedPlayersChange(sortedPlayers.map((p) => p.id));
                  }
                }}
                className={checkboxStyle}
              />
              <span>{selectAllText}</span>
            </label>
          </div>
          {showSearch && (
            <div className="relative px-4 py-3 flex-shrink-0 border-b border-hairline">
              <HiOutlineMagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-[30px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-3" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('rosterSettingsModal.searchPlaceholder', 'Search players...')}
                aria-label={t('rosterSettingsModal.searchPlaceholder', 'Search players...')}
                data-testid="player-picker-search"
                className={`${inputBaseStyle} min-h-11! py-2! pl-10! text-[15px]!`}
              />
            </div>
          )}
          <div
            className={`overflow-y-auto ${useFlexHeight ? 'flex-1 min-h-0' : 'max-h-[336px]'}`}
          >
            {showSearch && query.trim() && visiblePlayers.length === 0 && (
              <p className="px-4 py-4 text-sm text-ink-3" data-testid="player-picker-no-results">
                {t('rosterSettingsModal.noSearchResults', 'No player matches "{{search}}".', { search: query.trim() })}
              </p>
            )}
            {visiblePlayers.map((player) => (
              <div
                key={player.id}
                className="relative transition-colors hover:bg-white/[0.03] before:absolute before:top-0 before:left-[54px] before:right-0 before:h-px before:bg-hairline first:before:hidden"
              >
                <label className="flex items-center gap-3.5 min-h-14 px-4 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={disabled || isSubmittingAdd}
                    checked={selectedPlayerIds.includes(player.id)}
                    onChange={() => {
                      if (selectedPlayerIds.includes(player.id)) {
                        onSelectedPlayersChange(selectedPlayerIds.filter((id) => id !== player.id));
                      } else {
                        onSelectedPlayersChange([...selectedPlayerIds, player.id]);
                      }
                    }}
                    className={checkboxStyle}
                  />
                  <span className="min-w-0 text-base font-medium text-ink">
                    {player.name}
                    {player.nickname && <span className="text-sm font-normal text-ink-3 ml-1.5">({player.nickname})</span>}
                    {/* Archived players are only listed where they already belong (this
                        game, team or plan); the badge says why they are not offered elsewhere. */}
                    {removedPlayerIds?.has(player.id) && (
                      <span className={`ml-2 align-middle ${badgeArchivedStyle}`}>
                        {t('rosterSettingsModal.removedBadge', 'removed from player list')}
                      </span>
                    )}
                    {player.archived && (
                      <span className={`ml-2 align-middle ${badgeArchivedStyle}`}>
                        {t('rosterSettingsModal.archivedBadge', 'archived')}
                      </span>
                    )}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center px-4 py-5 text-sm text-ink-3">{noPlayersText}</div>
      )}
      {onAddPlayer && (
        <div className="p-4 flex-shrink-0 border-t border-hairline">
          {isAddingOpen ? (
            <>
            <form
              onSubmit={(e) => { e.preventDefault(); void submitAddPlayer(); }}
              className="flex flex-col gap-2.5"
            >
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => { setNewPlayerName(e.target.value); setAddError(null); }}
                placeholder={addPlayerPlaceholder}
                aria-label={addPlayerPlaceholder}
                autoFocus
                disabled={disabled || isSubmittingAdd}
                className={inputBaseStyle}
              />
              <input
                type="text"
                value={newPlayerNickname}
                onChange={(e) => { setNewPlayerNickname(e.target.value); setAddError(null); }}
                placeholder={addPlayerNicknamePlaceholder}
                aria-label={addPlayerNicknamePlaceholder}
                disabled={disabled || isSubmittingAdd}
                className={inputBaseStyle}
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={disabled || !newPlayerName.trim() || isSubmittingAdd}
                  className={`${secondaryButtonStyle} flex-1`}
                >
                  {addPlayerConfirmLabel ?? addPlayerLabel}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAddingOpen(false); setNewPlayerName(''); setNewPlayerNickname(''); setAddError(null); }}
                  disabled={disabled || isSubmittingAdd}
                  className={iconButtonCancelStyle}
                  aria-label={`${addPlayerLabel} - cancel`}
                >
                  ✕
                </button>
              </div>
            </form>
            {addError && (
              <p role="alert" className={fieldErrorStyle}>{addError}</p>
            )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingOpen(true)}
              disabled={disabled}
              className={`${secondaryButtonStyle} w-full`}
            >
              + {addPlayerLabel}
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
};

export default PlayerSelectionSection;
