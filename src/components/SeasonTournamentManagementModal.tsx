'use client';

import { useRememberedListSetting, isBoolean } from '@/hooks/useRememberedListSetting';
import { matchesSearch } from '@/utils/listSearch';
import React, { useState } from 'react';
import {
    CollapsibleModalHeader,
    useCollapsingHeader,
    modalContainerStyle,
    primaryButtonStyle,
    secondaryButtonStyle,
    groupedListStyle,
    searchInputStyle,
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
import { CLUB_SEASON_OFF_SEASON } from '@/utils/entityDisplayNames';
import type { EntityReferences } from '@/interfaces/DataStore';
import logger from '@/utils/logger';
import FirstVisitIntro from '@/components/FirstVisitIntro';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { formatAppDate } from '@/utils/localeFormat';

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
}

const SeasonTournamentManagementModal: React.FC<SeasonTournamentManagementModalProps> = ({
    isOpen, onClose, kind, seasons, tournaments, masterRoster,
    addSeasonMutation, addTournamentMutation,
    updateSeasonMutation, deleteSeasonMutation,
    updateTournamentMutation, deleteTournamentMutation,
    onOpenSettings
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
    const { checkAndPrompt: checkSeasonLimitAndPrompt } = useResourceLimit('season', activeSeasonCount);
    const { checkAndPrompt: checkTournamentLimitAndPrompt } = useResourceLimit('tournament', activeTournamentCount);

    // Modal state for create
    const [createSeasonModalOpen, setCreateSeasonModalOpen] = useState(false);
    const [createTournamentModalOpen, setCreateTournamentModalOpen] = useState(false);

    // Modal state for edit
    const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
    const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

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

        const chipClass = "inline-flex items-center h-[26px] px-[11px] rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] font-ui text-xs font-semibold tracking-[0.04em] text-ink-2 whitespace-nowrap";

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
                    <p className="font-ui text-sm text-ink-3 px-1 py-2">
                        {type === 'season'
                            ? t('seasonTournamentModal.noSeasonsNudge', 'No leagues yet. Create one, then link your teams and games to it to track league-level stats.')
                            : t('seasonTournamentModal.noTournamentsNudge', 'No tournaments yet. Create one, then link your teams and games to it to track tournament-level stats.')}
                    </p>
                )}
                {filtered.length > 0 && (
                <div className={`${groupedListStyle} divide-y divide-hairline`}>
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className={`pt-4 font-ui cursor-pointer transition-colors hover:bg-white/[0.03] ${item.archived ? 'opacity-60' : ''}`}
                            onClick={() => type === 'season' ? handleSeasonClick(item.id) : handleTournamentClick(item.id)}
                        >
                            <div className="flex items-start gap-2 pl-[18px] pr-2">
                                <div className="flex-1 min-w-0 pt-1.5">
                                    <p className="font-display text-[26px] font-bold leading-[1.1] text-ink break-words">{item.name}</p>
                                    {type==='tournament' && ((item as Tournament).startDate || (item as Tournament).endDate) && (
                                        <p className="mt-1 text-sm text-ink-3">{(item as Tournament).startDate ? formatAppDate((item as Tournament).startDate!) : ''}{(item as Tournament).startDate && (item as Tournament).endDate ? ' – ' : ''}{(item as Tournament).endDate ? formatAppDate((item as Tournament).endDate!) : ''}</p>
                                    )}
                                    {/* Context chips: plain text (green/red mean results only) */}
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {item.archived && (
                                            <span className={chipClass}>
                                                {t('seasonTournamentModal.archivedBadge', 'Archived')}
                                            </span>
                                        )}
                                        {item.clubSeason && item.clubSeason !== CLUB_SEASON_OFF_SEASON && (
                                            <span className={chipClass}>
                                                <span className="sr-only">{t('seasonDetailsModal.clubSeasonLabel', 'Season')}: </span>
                                                {item.clubSeason}
                                            </span>
                                        )}
                                        {item.gameType === 'futsal' && (
                                            <span className={chipClass}>
                                                <span className="sr-only">{t('common.gameTypeLabel', 'Sport Type')}: </span>
                                                {t('common.futsal', 'Futsal')}
                                            </span>
                                        )}
                                        {item.gender && (
                                            <span className={chipClass}>
                                                <span className="sr-only">{t('common.genderLabel', 'Gender')}: </span>
                                                {item.gender === 'boys' ? t('common.genderBoys', 'Boys') : t('common.genderGirls', 'Girls')}
                                            </span>
                                        )}
                                        {type === 'tournament' && (item as Tournament).series?.map(series => (
                                            <span key={series.id} className={chipClass}>
                                                <span className="sr-only">{t('common.seriesLabel', 'Level')}: </span>
                                                {t(`common.level${series.level}`, series.level)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
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
                                                onClick={() => handleToggleArchive(item, type)}
                                                className={popoverItemStyle}
                                            >
                                                <HiOutlineArchiveBox className="w-4 h-4" />
                                                {item.archived
                                                    ? t('seasonTournamentModal.unarchive', 'Unarchive')
                                                    : t('seasonTournamentModal.archive', 'Archive')}
                                            </button>
                                            <button
                                                onClick={() => handleEditClick(item, type)}
                                                className={popoverItemStyle}
                                            >
                                                <HiOutlinePencil className="w-4 h-4" />
                                                {t('common.edit', 'Edit')}
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
                            </div>
                            {/* Matches / goals as the home screen's italic numerals */}
                            <div className="mt-4 flex border-t border-hairline">
                                <div className="flex-1 flex items-baseline gap-2.5 px-[18px] pt-3 pb-3.5">
                                    <span className="s1-numeral pr-[3px] font-display text-[34px] font-bold italic leading-none">{stats[item.id]?.games || 0}</span>
                                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{t('seasonTournamentModal.statsGames')}</span>
                                </div>
                                <div className="flex-1 flex items-baseline gap-2.5 px-[18px] pt-3 pb-3.5 border-l border-hairline">
                                    <span className="s1-numeral pr-[3px] font-display text-[34px] font-bold italic leading-none">{stats[item.id]?.goals || 0}</span>
                                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{t('seasonTournamentModal.statsGoals')}</span>
                                </div>
                            </div>
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
          <div className="px-4 pt-2 pb-4 flex flex-col gap-3">
            <button
              onClick={kind === 'season' ? handleAddSeason : handleAddTournament}
              className={`${primaryButtonStyle} w-full min-h-[52px] text-base`}
            >
              <HiOutlinePlus className="w-5 h-5" aria-hidden="true" />
              {kind === 'season'
                ? t('seasonTournamentModal.addSeason', 'Add League')
                : t('seasonTournamentModal.addTournament', 'Add Tournament')}
            </button>
            {/* One team written several ways is several opponents to every
                aggregation. Cleanup lives next to the lists it cleans. */}
            <button
              type="button"
              onClick={() => setShowNameSweep(true)}
              data-testid="open-opponent-sweep"
              className={`${secondaryButtonStyle} w-full`}
            >
              <HiOutlineBarsArrowDown className="w-5 h-5 text-ink-3" aria-hidden="true" />
              {t('opponentSweep.openLabel', 'Check team names')}
              {nameConflicts > 0 && (
                <span
                  data-testid="opponent-sweep-badge"
                  className="px-2 py-0.5 rounded-full bg-action text-on-action text-xs font-bold"
                >
                  {nameConflicts}
                </span>
              )}
            </button>
          </div>
        </CollapsibleModalHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-3 pb-6" onScroll={headerCollapse.onScroll}>
            <FirstVisitIntro
              surface="seasons"
              className="mb-4"
              text={t('firstVisit.seasons', 'Group games into a league or tournament to get standings and per-competition stats.')}
            />
            {/* Search field */}
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
        onClose={() => setCreateSeasonModalOpen(false)}
        mode="create"
        addSeasonMutation={addSeasonMutation}
        onOpenSettings={onOpenSettings}
      />

      {/* Season Edit Modal */}
      <SeasonDetailsModal
        isOpen={selectedSeasonId !== null}
        onClose={() => setSelectedSeasonId(null)}
        mode="edit"
        season={seasons.find(s => s.id === selectedSeasonId) || null}
        updateSeasonMutation={updateSeasonMutation}
        onOpenSettings={onOpenSettings}
      />

      {/* Tournament Create Modal */}
      <TournamentDetailsModal
        isOpen={createTournamentModalOpen}
        onClose={() => setCreateTournamentModalOpen(false)}
        mode="create"
        masterRoster={masterRoster}
        addTournamentMutation={addTournamentMutation}
        onOpenSettings={onOpenSettings}
      />

      {/* Tournament Edit Modal */}
      <TournamentDetailsModal
        isOpen={selectedTournamentId !== null}
        onClose={() => setSelectedTournamentId(null)}
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
