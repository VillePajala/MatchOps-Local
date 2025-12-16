'use client';

import React, { useState } from 'react';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import { Season, Tournament, Player } from '@/types';
import { HiOutlinePencil, HiOutlineTrash, HiOutlineEllipsisVertical, HiOutlineArchiveBox } from 'react-icons/hi2';
import { UseMutationResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import SeasonDetailsModal from './SeasonDetailsModal';
import TournamentDetailsModal from './TournamentDetailsModal';
import ConfirmationModal from './ConfirmationModal';
import { useResourceLimit } from '@/hooks/usePremium';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';

interface SeasonTournamentManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    seasons: Season[];
    tournaments: Tournament[];
    masterRoster: Player[];
    addSeasonMutation: UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>;
    addTournamentMutation: UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>;
    updateSeasonMutation: UseMutationResult<Season | null, Error, Season, unknown>;
    deleteSeasonMutation: UseMutationResult<boolean, Error, string, unknown>;
    updateTournamentMutation: UseMutationResult<Tournament | null, Error, Tournament, unknown>;
    deleteTournamentMutation: UseMutationResult<boolean, Error, string, unknown>;
}

const SeasonTournamentManagementModal: React.FC<SeasonTournamentManagementModalProps> = ({
    isOpen, onClose, seasons, tournaments, masterRoster,
    addSeasonMutation, addTournamentMutation,
    updateSeasonMutation, deleteSeasonMutation,
    updateTournamentMutation, deleteTournamentMutation
}) => {
    const { t } = useTranslation();

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
    const [showArchived, setShowArchived] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; type: 'season' | 'tournament' } | null>(null);

    const [actionsMenuId, setActionsMenuId] = useState<string | null>(null);
    const actionsMenuRef = React.useRef<HTMLDivElement>(null);
    const [menuPositions, setMenuPositions] = useState<Record<string, boolean>>({});
    const { calculatePosition } = useDropdownPosition();

    React.useEffect(() => {
        const loadStats = async () => {
            const { getFilteredGames } = await import('@/utils/savedGames');
            const seasonStats: Record<string, { games: number; goals: number }> = {};
            for (const s of seasons) {
                const games = await getFilteredGames({ seasonId: s.id });
                const goals = games.reduce((sum, [, g]) => sum + (g.gameEvents?.filter(e => e.type === 'goal').length || 0), 0);
                seasonStats[s.id] = { games: games.length, goals };
            }
            for (const t of tournaments) {
                const games = await getFilteredGames({ tournamentId: t.id });
                const goals = games.reduce((sum, [, g]) => sum + (g.gameEvents?.filter(e => e.type === 'goal').length || 0), 0);
                seasonStats[t.id] = { games: games.length, goals };
            }
            setStats(seasonStats);
        };
        if (isOpen) {
            loadStats();
        }
    }, [isOpen, seasons, tournaments]);

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

    const handleDeleteClick = (item: Season | Tournament, type: 'season' | 'tournament') => {
        setItemToDelete({ id: item.id, name: item.name, type });
        setShowDeleteConfirm(true);
        setActionsMenuId(null);
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
        const filtered = data
            .filter(d => showArchived || !d.archived)
            .filter(d => d.name.toLowerCase().includes(searchText.toLowerCase()));

        return (
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">{t(`seasonTournamentModal.${type}s`)}</h3>
                <div className="space-y-3">
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className={`p-4 rounded-lg bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 cursor-pointer transition-all ${item.archived ? 'opacity-60' : ''}`}
                            onClick={() => type === 'season' ? handleSeasonClick(item.id) : handleTournamentClick(item.id)}
                        >
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-slate-100 font-medium">{item.name}</p>
                                        {item.archived && (
                                            <span className="text-xs px-2 py-0.5 rounded bg-slate-700/70 text-slate-400 border border-slate-600">
                                                {t('seasonTournamentModal.archivedBadge', 'Archived')}
                                            </span>
                                        )}
                                    </div>
                                    {type==='tournament' && ((item as Tournament).startDate || (item as Tournament).endDate) && (
                                        <p className="text-xs text-slate-400">{(item as Tournament).startDate || ''}{(item as Tournament).startDate && (item as Tournament).endDate ? ' - ' : ''}{(item as Tournament).endDate || ''}</p>
                                    )}
                                    <p className="text-xs text-slate-400">{t('seasonTournamentModal.statsGames')}: {stats[item.id]?.games || 0} | {t('seasonTournamentModal.statsGoals')}: {stats[item.id]?.goals || 0}</p>
                                </div>
                                <div className="relative" ref={actionsMenuId === item.id ? actionsMenuRef : null} onClick={(e) => e.stopPropagation()}>
                                    <button
                                        onClick={(e) => handleActionsMenuToggle(e, item.id)}
                                        className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-600 rounded transition-colors"
                                        aria-label={`${type} actions`}
                                    >
                                        <HiOutlineEllipsisVertical className="w-4 h-4" />
                                    </button>

                                    {actionsMenuId === item.id && (
                                        <div className={`absolute right-0 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50 ${menuPositions[item.id] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                                            <button
                                                onClick={() => handleToggleArchive(item, type)}
                                                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 transition-colors"
                                            >
                                                <HiOutlineArchiveBox className="w-4 h-4" />
                                                {item.archived
                                                    ? t('seasonTournamentModal.unarchive', 'Unarchive')
                                                    : t('seasonTournamentModal.archive', 'Archive')}
                                            </button>
                                            <button
                                                onClick={() => handleEditClick(item, type)}
                                                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 transition-colors"
                                            >
                                                <HiOutlinePencil className="w-4 h-4" />
                                                {t('common.edit', 'Edit')}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(item, type)}
                                                className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600/20 flex items-center gap-2 transition-colors"
                                            >
                                                <HiOutlineTrash className="w-4 h-4" />
                                                {t('common.delete', 'Delete')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />

        {/* Header */}
        <div className="flex flex-col flex-shrink-0">
          {/* Title Section */}
          <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
              {t('seasonTournamentModal.title')}
            </h2>
          </div>

          {/* Fixed Section (Counters and Add Buttons) */}
          <div className="px-6 pt-1 pb-4 backdrop-blur-sm bg-slate-900/20">
            {/* Counters Section */}
            <div className="mb-5 text-center text-sm">
              <div className="flex justify-center items-center gap-6 text-slate-300">
                <span>
                  <span className="text-yellow-400 font-semibold">{seasons.length}</span>
                  {" "}{seasons.length === 1
                    ? t('seasonTournamentModal.seasonSingular', 'Season')
                    : t('seasonTournamentModal.seasons', 'Seasons')}
                </span>
                <span>
                  <span className="text-yellow-400 font-semibold">{tournaments.length}</span>
                  {" "}{tournaments.length === 1
                    ? t('seasonTournamentModal.tournamentSingular', 'Tournament')
                    : t('seasonTournamentModal.tournaments', 'Tournaments')}
                </span>
              </div>
            </div>

            {/* Add Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleAddSeason}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-lg"
              >
                {t('seasonTournamentModal.addSeason', 'Add Season')}
              </button>
              <button
                onClick={handleAddTournament}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-lg"
              >
                {t('seasonTournamentModal.addTournament', 'Add Tournament')}
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
            {/* Search Field and Show Archived Toggle */}
            <div className="mb-4 flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder={t('seasonTournamentModal.searchPlaceholder')}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                autoComplete="off"
                className="flex-1 px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
                />
                {t('seasonTournamentModal.showArchived', 'Show Archived')}
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {renderList('season')}
                {renderList('tournament')}
            </div>
        </div>

        {/* Footer */}
        <ModalFooter>
          <button onClick={onClose} className={primaryButtonStyle}>
            {t('common.doneButton', 'Done')}
          </button>
        </ModalFooter>
      </div>

      {/* Season Create Modal */}
      <SeasonDetailsModal
        isOpen={createSeasonModalOpen}
        onClose={() => setCreateSeasonModalOpen(false)}
        mode="create"
        addSeasonMutation={addSeasonMutation}
      />

      {/* Season Edit Modal */}
      <SeasonDetailsModal
        isOpen={selectedSeasonId !== null}
        onClose={() => setSelectedSeasonId(null)}
        mode="edit"
        season={seasons.find(s => s.id === selectedSeasonId) || null}
        updateSeasonMutation={updateSeasonMutation}
        stats={selectedSeasonId ? stats[selectedSeasonId] : undefined}
      />

      {/* Tournament Create Modal */}
      <TournamentDetailsModal
        isOpen={createTournamentModalOpen}
        onClose={() => setCreateTournamentModalOpen(false)}
        mode="create"
        masterRoster={masterRoster}
        addTournamentMutation={addTournamentMutation}
      />

      {/* Tournament Edit Modal */}
      <TournamentDetailsModal
        isOpen={selectedTournamentId !== null}
        onClose={() => setSelectedTournamentId(null)}
        mode="edit"
        tournament={tournaments.find(t => t.id === selectedTournamentId) || null}
        masterRoster={masterRoster}
        updateTournamentMutation={updateTournamentMutation}
        stats={selectedTournamentId ? stats[selectedTournamentId] : undefined}
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
    </div>
  );
};

export default SeasonTournamentManagementModal; 
