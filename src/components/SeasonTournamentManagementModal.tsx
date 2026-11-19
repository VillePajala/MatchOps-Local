'use client';

import { useRememberedListSetting, isBoolean } from '@/hooks/useRememberedListSetting';
import { matchesSearch } from '@/utils/listSearch';
import React, { useState } from 'react';
import {
    CollapsibleModalHeader,
    useCollapsingHeader,
    modalContainerStyle,
    primaryButtonStyle,
    searchInputStyle,
    sectionLabelStyle,
    groupedListStyle,
    subtextStyle,
    popoverMenuStyle,
    popoverItemStyle,
    iconButtonEditStyle,
} from '@/styles/modalStyles';
import OpponentNameSweepModal from '@/components/OpponentNameSweepModal';
import { useOpponentVariantGroups } from '@/hooks/useOpponentVariantGroups';
import { useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';
import { Season, Tournament, Player } from '@/types';
import { HiOutlinePencil, HiOutlineTrash, HiOutlineEllipsisVertical, HiOutlineArchiveBox, HiOutlineMagnifyingGlass, HiOutlinePlus, HiOutlineBarsArrowDown } from 'react-icons/hi2';
import { UseMutationResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import SeasonDetailsModal from './SeasonDetailsModal';
import TournamentDetailsModal from './TournamentDetailsModal';
import ConfirmationModal from './ConfirmationModal';
import DeleteBlockedDialog from './DeleteBlockedDialog';
import { useResourceLimit } from '@/hooks/usePremium';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import { useDataStore } from '@/hooks/useDataStore';
import CompetitionCard from '@/components/CompetitionCard';
import type { EntityReferences } from '@/interfaces/DataStore';
import logger from '@/utils/logger';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

/** `actionsMenuId` of the list header's ⋮ menu (row menus use item ids). */
const LIST_MENU_ID = '__competitions-list-menu__';

interface SeasonTournamentManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Which competition list this manager shows: Kaudet or Turnaukset. */
    kind: 'season' | 'tournament';
    seasons: Season[];
    tournaments: Tournament[];
    masterRoster: Player[];
    addSeasonMutation: UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>;
    addTournamentMutation: UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>;
    updateSeasonMutation: UseMutationResult<Season | null, Error, Season, unknown>;
    deleteSeasonMutation: UseMutationResult<boolean, Error, string, unknown>;
    updateTournamentMutation: UseMutationResult<Tournament | null, Error, Tournament, unknown>;
    deleteTournamentMutation: UseMutationResult<boolean, Error, string, unknown>;
    onOpenSettings?: () => void;
    /** Opened from a Home card: that league / tournament's sheet opens at once. */
    openItemId?: string;
    /** Opened from Home's "Lisää sarja / turnaus": the add sheet opens at once. */
    openCreate?: boolean;
}

const SeasonTournamentManagementModal: React.FC<SeasonTournamentManagementModalProps> = ({
    isOpen, onClose, kind, seasons, tournaments, masterRoster,
    addSeasonMutation, addTournamentMutation,
    updateSeasonMutation, deleteSeasonMutation,
    updateTournamentMutation, deleteTournamentMutation,
    onOpenSettings,
    openItemId,
    openCreate = false,
}) => {
    const { t } = useTranslation();
    const headerCollapse = useCollapsingHeader();
    // Title/aria label track the kind (Kaudet / Turnaukset).
    const managerTitle = kind === 'season'
        ? t('seasonTournamentModal.seasons', 'Leagues')
        : t('seasonTournamentModal.tournaments', 'Tournaments');
    const { getStore } = useDataStore();

    // Premium limit checks (count non-archived items)
    const activeSeasonCount = seasons.filter(s => !s.archived).length;
    const activeTournamentCount = tournaments.filter(t => !t.archived).length;
    const { checkAndPrompt: checkSeasonLimitAndPrompt, canAdd: canAddSeason } = useResourceLimit('season', activeSeasonCount);
    const { checkAndPrompt: checkTournamentLimitAndPrompt, canAdd: canAddTournament } = useResourceLimit('tournament', activeTournamentCount);

    // Modal state for create. Opened from Home's add row, the add sheet is
    // the first thing shown - unless the limit is reached, when the list's
    // own Add button is the one that explains why.
    const [createSeasonModalOpen, setCreateSeasonModalOpen] = useState(openCreate && kind === 'season' && canAddSeason);
    const [createTournamentModalOpen, setCreateTournamentModalOpen] = useState(openCreate && kind === 'tournament' && canAddTournament);

    // Modal state for edit
    const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
    const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

    // A Home card asks for one item's sheet. The lists load after this modal
    // mounts, so the sheet opens once the item is in them (adjust-during-render;
    // an item that never appears - deleted meanwhile - leaves the list showing).
    const [pendingOpenId, setPendingOpenId] = useState<string | null>(openItemId ?? null);
    if (pendingOpenId && (kind === 'season' ? seasons : tournaments).some((d) => d.id === pendingOpenId)) {
        setPendingOpenId(null);
        if (kind === 'season') setSelectedSeasonId(pendingOpenId);
        else setSelectedTournamentId(pendingOpenId);
    }
    // Opened for one sheet: closing that sheet goes back to Home, not to a
    // list the coach never asked for.
    const [openedForOneSheet] = useState(!!openItemId || openCreate);
    const closeSheet = (close: () => void) => {
        close();
        if (openedForOneSheet) onClose();
    };

    const [stats, setStats] = useState<Record<string, { games: number; goals: number }>>({});

    const [searchText, setSearchText] = useState('');
    // Remembered on this device, per list (review 7.L10).
    const [showArchived, setShowArchived] = useRememberedListSetting(`competitions.${kind}.showArchived`, false, isBoolean);
    const archivedCount = (kind === 'season' ? seasons : tournaments).filter((d) => d.archived).length;
    // Cleanup for names that got in before the competition lists existed.
    const [showNameSweep, setShowNameSweep] = useState(false);
    // Back closes the sweep first, leaving this manager open underneath.
    useHardwareBackSubLevel(showNameSweep, () => setShowNameSweep(false));
    // Nobody opens a cleanup tool speculatively. The count is what tells a
    // coach there is anything to clean - the same groups the tool will show,
    // from the same hook, so the badge cannot advertise work that is not there.
    const nameConflicts = useOpponentVariantGroups(isOpen).length;
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    useEscapeToClose(isOpen, onClose, !showDeleteConfirm);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; type: 'season' | 'tournament' } | null>(null);

    // Delete blocked state
    const [deleteBlockedState, setDeleteBlockedState] = useState<{
        open: boolean;
        entityType: 'season' | 'tournament';
        entityName: string;
        references: EntityReferences;
        item: Season | Tournament;
    } | null>(null);

    const [actionsMenuId, setActionsMenuId] = useState<string | null>(null);
    const actionsMenuRef = React.useRef<HTMLDivElement>(null);
    const [menuPositions, setMenuPositions] = useState<Record<string, boolean>>({});
    const { calculatePosition } = useDropdownPosition();

    React.useEffect(() => {
        const loadStats = async () => {
            const { getFilteredGames } = await import('@/utils/savedGames');
            const nextStats: Record<string, { games: number; goals: number }> = {};
            // Only the shown kind needs stats (this manager renders one list).
            if (kind === 'season') {
                for (const s of seasons) {
                    const games = await getFilteredGames({ seasonId: s.id });
                    const goals = games.reduce((sum, [, g]) => sum + (g.gameEvents?.filter(e => e.type === 'goal').length || 0), 0);
                    nextStats[s.id] = { games: games.length, goals };
                }
            } else {
                for (const tourn of tournaments) {
                    const games = await getFilteredGames({ tournamentId: tourn.id });
                    const goals = games.reduce((sum, [, g]) => sum + (g.gameEvents?.filter(e => e.type === 'goal').length || 0), 0);
                    nextStats[tourn.id] = { games: games.length, goals };
                }
            }
            setStats(nextStats);
        };
        if (isOpen) {
            loadStats();
        }
    }, [isOpen, kind, seasons, tournaments]);

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

    const handleActionsMenuToggle = (e: React.MouseEvent<HTMLButtonElement>, itemId: string) => {
        const shouldOpenUpward = calculatePosition(e.currentTarget);
        setMenuPositions(prev => ({ ...prev, [itemId]: shouldOpenUpward }));
        setActionsMenuId(actionsMenuId === itemId ? null : itemId);
    };

    const handleAddSeason = () => {
        // Check premium limit before allowing season creation
        if (!checkSeasonLimitAndPrompt()) {
            return; // Upgrade prompt shown
        }
        setCreateSeasonModalOpen(true);
    };

    const handleAddTournament = () => {
        // Check premium limit before allowing tournament creation
        if (!checkTournamentLimitAndPrompt()) {
            return; // Upgrade prompt shown
        }
        setCreateTournamentModalOpen(true);
    };

    if (!isOpen) {
        return null;
    }


    const handleSeasonClick = (seasonId: string) => {
        setSelectedSeasonId(seasonId);
    };

    const handleTournamentClick = (tournamentId: string) => {
        setSelectedTournamentId(tournamentId);
    };

    const handleEditClick = (item: Season | Tournament, type: 'season' | 'tournament') => {
        if (type === 'season') {
            setSelectedSeasonId(item.id);
        } else {
            setSelectedTournamentId(item.id);
        }
        setActionsMenuId(null);
    };

    const handleDeleteClick = async (item: Season | Tournament, type: 'season' | 'tournament') => {
        setActionsMenuId(null);

        try {
            // Check for references before allowing delete
            const store = await getStore();
            const refs = type === 'season'
                ? await store.getSeasonReferences(item.id)
                : await store.getTournamentReferences(item.id);

            if (!refs.canDelete) {
                // Show blocked dialog with archive option
                setDeleteBlockedState({
                    open: true,
                    entityType: type,
                    entityName: item.name,
                    references: refs,
                    item,
                });
            } else {
                // No references - show normal delete confirmation
                setItemToDelete({ id: item.id, name: item.name, type });
                setShowDeleteConfirm(true);
            }
        } catch (error) {
            logger.error('[SeasonTournamentManagementModal] Failed to check references:', error);
            // On error, fall back to allowing delete with normal confirmation
            setItemToDelete({ id: item.id, name: item.name, type });
            setShowDeleteConfirm(true);
        }
    };

    const handleDeleteConfirmed = () => {
        if (itemToDelete) {
            if (itemToDelete.type === 'season') {
                deleteSeasonMutation.mutate(itemToDelete.id);
            } else {
                deleteTournamentMutation.mutate(itemToDelete.id);
            }
        }
        setShowDeleteConfirm(false);
        setItemToDelete(null);
    };

    const handleToggleArchive = (item: Season | Tournament, type: 'season' | 'tournament') => {
        // If unarchiving (archived -> not archived), check premium limits first
        if (item.archived) {
            const canUnarchive = type === 'season'
                ? checkSeasonLimitAndPrompt()
                : checkTournamentLimitAndPrompt();
            if (!canUnarchive) {
                setActionsMenuId(null);
                return; // Upgrade prompt shown
            }
        }

        const updatedItem = {
            ...item,
            archived: !item.archived,
        };

        if (type === 'season') {
            updateSeasonMutation.mutate(updatedItem as Season);
        } else {
            updateTournamentMutation.mutate(updatedItem as Tournament);
        }

        setActionsMenuId(null);
    };

    const renderList = (type: 'season' | 'tournament') => {
        const data = type === 'season' ? seasons : tournaments;
        // Same order as the league/tournament pickers (review 7.L5): newest start
        // date first (undated last), then name - this list was in storage order.
        const filtered = data
            .filter(d => showArchived || !d.archived)
            // The app's one search (review 7.L6).
            .filter(d => matchesSearch(searchText, [d.name]))
            .sort((a, b) => {
                if (a.startDate && b.startDate) {
                    const byDate = b.startDate.localeCompare(a.startDate);
                    if (byDate !== 0) return byDate;
                } else if (a.startDate) {
                    return -1;
                } else if (b.startDate) {
                    return 1;
                }
                return a.name.localeCompare(b.name, 'fi', { sensitivity: 'base' });
            });

        return (
            <>
                {filtered.length === 0 && searchText.trim() !== '' && (
                    // Only the search hides them (review 7.L4) - not "none yet".
                    <p className="font-ui text-sm text-ink-3 px-1 py-2" data-testid="competition-no-search-results">
                        {t('seasonTournamentModal.noSearchResults', 'Nothing matches "{{search}}".', { search: searchText.trim() })}
                    </p>
                )}
                {filtered.length === 0 && searchText.trim() === '' && archivedCount > 0 && !showArchived && (
                    // Not "none yet": they exist, archived (review 7.L7).
                    <p className="font-ui text-sm text-ink-3 px-1 py-2">{t('common.allArchived', 'Everything here is archived.')}</p>
                )}
                {filtered.length === 0 && searchText.trim() === '' && !(archivedCount > 0 && !showArchived) && (
                    type === 'tournament' ? (
                        // The same centred empty card as the staff list.
                        <div className={`${groupedListStyle} text-center py-8 px-4 ${subtextStyle}`} data-testid="tournaments-empty">
                            {t('seasonTournamentModal.noTournamentsNudge', 'No tournaments yet. Create one, then link your teams and games to it to track tournament-level stats.')}
                        </div>
                    ) : (
                        <p className="font-ui text-sm text-ink-3 px-1 py-2">
                            {t('seasonTournamentModal.noSeasonsNudge', 'No leagues yet. Create one, then link your teams and games to it to track league-level stats.')}
                        </p>
                    )
                )}
                {/* Not overflow-hidden: that clipped a row's action menu when the
                    list is short. The rows round their own hover corners instead. */}
                {filtered.length > 0 && (
                <div className="s1-list divide-y divide-hairline">
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className={`pt-4 font-ui cursor-pointer transition-colors hover:bg-white/[0.03] first:rounded-t-[22px] last:rounded-b-[22px] ${item.archived ? 'opacity-60' : ''}`}
                            onClick={() => type === 'season' ? handleSeasonClick(item.id) : handleTournamentClick(item.id)}
                        >
                            <CompetitionCard
                                item={item}
                                showDates={type === 'tournament'}
                                games={stats[item.id]?.games || 0}
                                goals={stats[item.id]?.goals || 0}
                                t={t}
                                menu={
                                    <div className="relative flex-shrink-0" ref={actionsMenuId === item.id ? actionsMenuRef : null} onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={(e) => handleActionsMenuToggle(e, item.id)}
                                            className={iconButtonEditStyle}
                                            aria-label={t('seasonTournamentModal.itemActions', 'Actions for {{name}}', { name: item.name })}
                                        >
                                            <HiOutlineEllipsisVertical className="w-5 h-5" />
                                        </button>
    
                                        {actionsMenuId === item.id && (
                                            <div className={`${popoverMenuStyle} ${menuPositions[item.id] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                                                <button
                                                    onClick={() => handleEditClick(item, type)}
                                                    className={popoverItemStyle}
                                                >
                                                    <HiOutlinePencil className="w-4 h-4" />
                                                    {t('common.edit', 'Edit')}
                                                </button>
                                                <button
                                                    onClick={() => handleToggleArchive(item, type)}
                                                    className={popoverItemStyle}
                                                >
                                                    <HiOutlineArchiveBox className="w-4 h-4" />
                                                    {item.archived
                                                        ? t('seasonTournamentModal.unarchive', 'Unarchive')
                                                        : t('seasonTournamentModal.archive', 'Archive')}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(item, type)}
                                                    className={`${popoverItemStyle} text-red-400! hover:bg-red-500/10!`}
                                                >
                                                    <HiOutlineTrash className="w-4 h-4" />
                                                    {t('common.delete', 'Delete')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                }
                            />
                        </div>
                    ))}
                </div>
                )}
            </>
        );
    };

  return (
    <div className={`${MODAL_BACKDROP} ${Z_LAYER.modal}`} role="dialog" aria-modal="true" aria-label={managerTitle}>
      <div className={`${modalContainerStyle} h-full w-full relative`}>
        {/* Chrome slimming: X-header; the (single) Add button collapses on scroll. */}
        <CollapsibleModalHeader
          title={managerTitle}
          onClose={onClose}
          closeLabel={t('common.doneButton', 'Done')}
          collapse={headerCollapse}
        >
          <div className="px-4 pt-2 pb-4">
            <button
              onClick={kind === 'season' ? handleAddSeason : handleAddTournament}
              className={`${primaryButtonStyle} w-full min-h-[52px] text-base`}
            >
              <HiOutlinePlus className="w-5 h-5" aria-hidden="true" />
              {kind === 'season'
                ? t('seasonTournamentModal.addSeason', 'Add League')
                : t('seasonTournamentModal.addTournament', 'Add Tournament')}
            </button>
          </div>
        </CollapsibleModalHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-3 pb-6" onScroll={headerCollapse.onScroll}>
            {/* The list header with its own ⋮ menu (as the planner's list has).
                One team written several ways is several opponents to every
                aggregation, so the cleanup lives next to the lists it cleans;
                the count rides on the ⋮ button so the tool stays discoverable. */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className={`${sectionLabelStyle} px-1`}>
                {kind === 'season'
                  ? t('seasonTournamentModal.seasons', 'Leagues')
                  : t('seasonTournamentModal.tournaments', 'Tournaments')}
              </h3>
              <div
                className="relative shrink-0 -mr-1"
                ref={actionsMenuId === LIST_MENU_ID ? actionsMenuRef : null}
              >
                <button
                  type="button"
                  onClick={() => setActionsMenuId(actionsMenuId === LIST_MENU_ID ? null : LIST_MENU_ID)}
                  aria-label={nameConflicts > 0
                    ? `${t('common.moreOptions', 'More options')} (${nameConflicts})`
                    : t('common.moreOptions', 'More options')}
                  aria-expanded={actionsMenuId === LIST_MENU_ID}
                  data-testid="competitions-list-menu"
                  className={`${iconButtonEditStyle} relative`}
                >
                  <HiOutlineEllipsisVertical className="w-5 h-5" />
                  {nameConflicts > 0 && (
                    <span
                      data-testid="opponent-sweep-badge"
                      aria-hidden="true"
                      className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-ink text-carbon font-ui text-xs font-bold leading-[18px] text-center"
                    >
                      {nameConflicts}
                    </span>
                  )}
                </button>
                {actionsMenuId === LIST_MENU_ID && (
                  <div className={`${popoverMenuStyle} top-full mt-1`}>
                    <button
                      type="button"
                      onClick={() => {
                        setActionsMenuId(null);
                        setShowNameSweep(true);
                      }}
                      data-testid="open-opponent-sweep"
                      className={`${popoverItemStyle} whitespace-nowrap`}
                    >
                      <HiOutlineBarsArrowDown className="w-4 h-4" aria-hidden="true" />
                      {t('opponentSweep.openLabel', 'Check team names')}
                      {nameConflicts > 0 && (
                        <span className="ml-auto pl-2 tabular-nums text-ink-3">{nameConflicts}</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* Search field - hidden while there is nothing to search (a tournaments list with no tournaments) */}
            {!(kind === 'tournament' && tournaments.length === 0) && (
            <div className="mb-3 relative">
              <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-3" aria-hidden="true" />
              <input
                type="text"
                placeholder={t('seasonTournamentModal.searchPlaceholder')}
                aria-label={t('seasonTournamentModal.searchPlaceholder')}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                autoComplete="off"
                className={searchInputStyle}
              />
            </div>
            )}

            {renderList(kind)}
            {archivedCount > 0 && (
              // One Show-archived control app-wide (review 7.L7), as in the roster.
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-pressed={showArchived}
                data-testid="competitions-toggle-archived"
                className="w-full mt-3 min-h-11 font-ui text-sm font-medium text-ink-3 hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-full"
              >
                {showArchived
                  ? t('common.hideArchived', 'Hide archived')
                  : t('common.showArchivedCount', 'Show archived ({{count}})', { count: archivedCount })}
              </button>
            )}
        </div>

      </div>

      {/* Season Create Modal */}
      <SeasonDetailsModal
        isOpen={createSeasonModalOpen}
        onClose={() => closeSheet(() => setCreateSeasonModalOpen(false))}
        mode="create"
        addSeasonMutation={addSeasonMutation}
        onOpenSettings={onOpenSettings}
      />

      {/* Season Edit Modal */}
      <SeasonDetailsModal
        isOpen={selectedSeasonId !== null}
        onClose={() => closeSheet(() => setSelectedSeasonId(null))}
        mode="edit"
        season={seasons.find(s => s.id === selectedSeasonId) || null}
        updateSeasonMutation={updateSeasonMutation}
        onOpenSettings={onOpenSettings}
      />

      {/* Tournament Create Modal */}
      <TournamentDetailsModal
        isOpen={createTournamentModalOpen}
        onClose={() => closeSheet(() => setCreateTournamentModalOpen(false))}
        mode="create"
        masterRoster={masterRoster}
        addTournamentMutation={addTournamentMutation}
        onOpenSettings={onOpenSettings}
      />

      {/* Tournament Edit Modal */}
      <TournamentDetailsModal
        isOpen={selectedTournamentId !== null}
        onClose={() => closeSheet(() => setSelectedTournamentId(null))}
        mode="edit"
        tournament={tournaments.find(t => t.id === selectedTournamentId) || null}
        masterRoster={masterRoster}
        updateTournamentMutation={updateTournamentMutation}
        onOpenSettings={onOpenSettings}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title={t('common.confirmDeleteTitle', 'Delete Item')}
        message={t('common.confirmDelete', 'Are you sure you want to delete this item?')}
        warningMessage={itemToDelete ? `${t(`seasonTournamentModal.${itemToDelete.type}Singular`, itemToDelete.type)}: ${itemToDelete.name}` : ''}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setItemToDelete(null);
        }}
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
      />

      {/* Delete Blocked Dialog - shown when entity has references */}
      {deleteBlockedState && (
        <DeleteBlockedDialog
          isOpen={deleteBlockedState.open}
          onClose={() => setDeleteBlockedState(null)}
          entityType={deleteBlockedState.entityType}
          entityName={deleteBlockedState.entityName}
          references={deleteBlockedState.references}
          onArchive={() => {
            // Archive the item instead of deleting
            handleToggleArchive(deleteBlockedState.item, deleteBlockedState.entityType);
            setDeleteBlockedState(null);
          }}
        />
      )}
      <OpponentNameSweepModal isOpen={showNameSweep} onClose={() => setShowNameSweep(false)} />
    </div>
  );
};

export default SeasonTournamentManagementModal; 
