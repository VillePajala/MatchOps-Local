'use client';

import React, { useState } from 'react';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import { League, Tournament, Player } from '@/types';
import { AGE_GROUPS, LEVELS } from '@/config/gameOptions';
import type { TranslationKey } from '@/i18n-types';
import { HiOutlinePencil, HiOutlineTrash, HiOutlineEllipsisVertical, HiOutlineArchiveBox } from 'react-icons/hi2';
import { UseMutationResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import LeagueDetailsModal from './LeagueDetailsModal';
import TournamentDetailsModal from './TournamentDetailsModal';
import ConfirmationModal from './ConfirmationModal';

interface CompetitionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    leagues: League[];
    tournaments: Tournament[];
    masterRoster: Player[];
    addLeagueMutation: UseMutationResult<League | null, Error, Partial<League> & { name: string }, unknown>;
    addTournamentMutation: UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>;
    updateLeagueMutation: UseMutationResult<League | null, Error, League, unknown>;
    deleteLeagueMutation: UseMutationResult<boolean, Error, string, unknown>;
    updateTournamentMutation: UseMutationResult<Tournament | null, Error, Tournament, unknown>;
    deleteTournamentMutation: UseMutationResult<boolean, Error, string, unknown>;
}

const CompetitionsModal: React.FC<CompetitionsModalProps> = ({
    isOpen, onClose, leagues, tournaments, masterRoster,
    addLeagueMutation, addTournamentMutation,
    updateLeagueMutation, deleteLeagueMutation,
    updateTournamentMutation, deleteTournamentMutation
}) => {
    const { t } = useTranslation();
    const parseIntOrUndefined = (value: string): number | undefined => {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? undefined : parsed;
    };

    const sanitizeFields = (fields: Partial<League | Tournament>): Partial<League | Tournament> => {
        const sanitized: Partial<League | Tournament> = { ...fields };
        if (sanitized.periodCount !== undefined) {
            sanitized.periodCount =
                sanitized.periodCount === 1 || sanitized.periodCount === 2
                    ? sanitized.periodCount
                    : undefined;
        }
        if (sanitized.periodDuration !== undefined) {
            sanitized.periodDuration = sanitized.periodDuration > 0 ? sanitized.periodDuration : undefined;
        }
        return sanitized;
    };

    const [newLeagueName, setNewLeagueName] = useState('');
    const [showNewLeagueInput, setShowNewLeagueInput] = useState(false);

    const [newTournamentName, setNewTournamentName] = useState('');
    const [showNewTournamentInput, setShowNewTournamentInput] = useState(false);

    const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
    const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

    const [newLeagueFields, setNewLeagueFields] = useState<Partial<League>>({});
    const [newTournamentFields, setNewTournamentFields] = useState<Partial<Tournament>>({});

    const [stats, setStats] = useState<Record<string, { games: number; goals: number }>>({});

    const [searchText, setSearchText] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; type: 'league' | 'tournament' } | null>(null);

    const [actionsMenuId, setActionsMenuId] = useState<string | null>(null);
    const actionsMenuRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const loadStats = async () => {
            const { getFilteredGames } = await import('@/utils/savedGames');
            const leagueStats: Record<string, { games: number; goals: number }> = {};
            for (const s of leagues) {
                const games = await getFilteredGames({ seasonId: s.id });
                const goals = games.reduce((sum, [, g]) => sum + (g.gameEvents?.filter(e => e.type === 'goal').length || 0), 0);
                leagueStats[s.id] = { games: games.length, goals };
            }
            for (const t of tournaments) {
                const games = await getFilteredGames({ tournamentId: t.id });
                const goals = games.reduce((sum, [, g]) => sum + (g.gameEvents?.filter(e => e.type === 'goal').length || 0), 0);
                leagueStats[t.id] = { games: games.length, goals };
            }
            setStats(leagueStats);
        };
        if (isOpen) {
            loadStats();
        }
    }, [isOpen, leagues, tournaments]);

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

    if (!isOpen) {
        return null;
    }

    const handleSave = (type: 'league' | 'tournament') => {
        if (type === 'league' && newLeagueName.trim()) {
            const sanitized = sanitizeFields(newLeagueFields);
            addLeagueMutation.mutate({ name: newLeagueName.trim(), ...sanitized });
            setNewLeagueName('');
            setNewLeagueFields({});
            setShowNewLeagueInput(false);
        } else if (type === 'tournament' && newTournamentName.trim()) {
            const sanitized = sanitizeFields(newTournamentFields);
            addTournamentMutation.mutate({ name: newTournamentName.trim(), ...sanitized });
            setNewTournamentName('');
            setNewTournamentFields({});
            setShowNewTournamentInput(false);
        }
    };

    const handleSeasonClick = (seasonId: string) => {
        setSelectedLeagueId(seasonId);
    };

    const handleTournamentClick = (tournamentId: string) => {
        setSelectedTournamentId(tournamentId);
    };

    const handleEditClick = (item: League | Tournament, type: 'league' | 'tournament') => {
        if (type === 'league') {
            setSelectedLeagueId(item.id);
        } else {
            setSelectedTournamentId(item.id);
        }
        setActionsMenuId(null);
    };

    const handleDeleteClick = (item: League | Tournament, type: 'league' | 'tournament') => {
        setItemToDelete({ id: item.id, name: item.name, type });
        setShowDeleteConfirm(true);
        setActionsMenuId(null);
    };

    const handleDeleteConfirmed = () => {
        if (itemToDelete) {
            if (itemToDelete.type === 'league') {
                deleteLeagueMutation.mutate(itemToDelete.id);
            } else {
                deleteTournamentMutation.mutate(itemToDelete.id);
            }
        }
        setShowDeleteConfirm(false);
        setItemToDelete(null);
    };

    const handleToggleArchive = (item: League | Tournament, type: 'league' | 'tournament') => {
        const updatedItem = {
            ...item,
            archived: !item.archived,
        };

        if (type === 'league') {
            updateLeagueMutation.mutate(updatedItem as League);
        } else {
            updateTournamentMutation.mutate(updatedItem as Tournament);
        }

        setActionsMenuId(null);
    };

    const renderList = (type: 'league' | 'tournament') => {
        const data = type === 'league' ? leagues : tournaments;
        const filtered = data
            .filter(d => showArchived || !d.archived)
            .filter(d => d.name.toLowerCase().includes(searchText.toLowerCase()));
        const showInput = type === 'league' ? showNewLeagueInput : showNewTournamentInput;
        const setShowInput = type === 'league' ? setShowNewLeagueInput : setShowNewTournamentInput;
        const name = type === 'league' ? newLeagueName : newTournamentName;
        const setName = type === 'league' ? setNewLeagueName : setNewTournamentName;
        const placeholder = type === 'league' ? t('seasonTournamentModal.newSeasonPlaceholder') : t('seasonTournamentModal.newTournamentPlaceholder');

        return (
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">{t(`seasonTournamentModal.${type}s`)}</h3>
                {showInput && (
                    <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600 mb-3 flex flex-col gap-2">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={placeholder}
                            className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <input
                            type="text"
                            value={(type==='season'?newLeagueFields.location:newTournamentFields.location) || ''}
                            onChange={(e) => type==='season'?setNewLeagueFields(f=>({...f,location:e.target.value})):setNewTournamentFields(f=>({...f,location:e.target.value}))}
                            placeholder={t('seasonTournamentModal.locationLabel')}
                            className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <select
                            value={(type==='season'?newLeagueFields.ageGroup:newTournamentFields.ageGroup) || ''}
                            onChange={(e)=>type==='season'?setNewLeagueFields(f=>({...f,ageGroup:e.target.value})):setNewTournamentFields(f=>({...f,ageGroup:e.target.value}))}
                            className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="">{t('common.selectAgeGroup', '-- Select Age Group --')}</option>
                            {AGE_GROUPS.map(group => (
                                <option key={group} value={group}>{group}</option>
                            ))}
                        </select>
                        {type==='tournament' && (
                            <select
                                value={newTournamentFields.level || ''}
                                onChange={e=>setNewTournamentFields(f=>({...f,level:e.target.value}))}
                                className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="">{t('common.selectLevel', '-- Select Level --')}</option>
                                {LEVELS.map(lvl => (
                                    <option key={lvl} value={lvl}>{t(`common.level${lvl}` as TranslationKey, lvl)}</option>
                                ))}
                            </select>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <input type="number" value={(type==='season'?newLeagueFields.periodCount:newTournamentFields.periodCount) || ''} onChange={(e)=>type==='season'?setNewLeagueFields(f=>({...f,periodCount:parseIntOrUndefined(e.target.value)})):setNewTournamentFields(f=>({...f,periodCount:parseIntOrUndefined(e.target.value)}))} placeholder={t('seasonTournamentModal.periodCountLabel')} className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500" />
                            <input type="number" value={(type==='season'?newLeagueFields.periodDuration:newTournamentFields.periodDuration) || ''} onChange={(e)=>type==='season'?setNewLeagueFields(f=>({...f,periodDuration:parseIntOrUndefined(e.target.value)})):setNewTournamentFields(f=>({...f,periodDuration:parseIntOrUndefined(e.target.value)}))} placeholder={t('seasonTournamentModal.periodDurationLabel')} className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        {type==='tournament' && (
                            <>
                                <input type="date" value={(newTournamentFields.startDate as string) || ''} onChange={e=>setNewTournamentFields(f=>({...f,startDate:e.target.value}))} className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500" placeholder={t('seasonTournamentModal.startDateLabel')} />
                                <input type="date" value={(newTournamentFields.endDate as string) || ''} onChange={e=>setNewTournamentFields(f=>({...f,endDate:e.target.value}))} className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500" placeholder={t('seasonTournamentModal.endDateLabel')} />
                            </>
                        )}
                        <textarea value={(type==='season'?newLeagueFields.notes:newTournamentFields.notes) || ''} onChange={(e)=>type==='season'?setNewLeagueFields(f=>({...f,notes:e.target.value})):setNewTournamentFields(f=>({...f,notes:e.target.value}))} placeholder={t('seasonTournamentModal.notesLabel')} className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500" />
                        <div className="flex items-center gap-2">
                            <label className="text-slate-200 text-sm flex items-center gap-1"><input type="checkbox" checked={(type==='season'?newLeagueFields.archived:newTournamentFields.archived) || false} onChange={(e)=>type==='season'?setNewLeagueFields(f=>({...f,archived:e.target.checked})):setNewTournamentFields(f=>({...f,archived:e.target.checked}))} className="form-checkbox h-4 w-4" />{t('seasonTournamentModal.archiveLabel')}</label>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => {setShowInput(false); if(type==='season'){setNewLeagueFields({});} else {setNewTournamentFields({});}}} className="px-3 py-1 text-xs rounded bg-slate-600 hover:bg-slate-500">{t('common.cancel')}</button>
                            <button onClick={() => handleSave(type)} className="px-3 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500" data-testid={`save-new-${type}-button`}>{t('common.save')}</button>
                        </div>
                    </div>
                )}
                <div className="space-y-3">
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className={`p-4 rounded-lg bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 cursor-pointer transition-all ${item.archived ? 'opacity-60' : ''}`}
                            onClick={() => type === 'league' ? handleSeasonClick(item.id) : handleTournamentClick(item.id)}
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
                                        onClick={() => setActionsMenuId(actionsMenuId === item.id ? null : item.id)}
                                        className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-600 rounded transition-colors"
                                        aria-label={`${type} actions`}
                                    >
                                        <HiOutlineEllipsisVertical className="w-4 h-4" />
                                    </button>

                                    {actionsMenuId === item.id && (
                                        <div className="absolute right-0 mt-1 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50">
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
                onClick={() => setShowNewLeagueInput(true)}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-lg"
              >
                {t('seasonTournamentModal.addSeason', 'Add Season')}
              </button>
              <button
                onClick={() => setShowNewTournamentInput(true)}
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

      {/* League Details Modal */}
      <LeagueDetailsModal
        isOpen={selectedLeagueId !== null}
        onClose={() => setSelectedLeagueId(null)}
        season={leagues.find(s => s.id === selectedLeagueId) || null}
        updateLeagueMutation={updateLeagueMutation}
        stats={selectedLeagueId ? stats[selectedLeagueId] : undefined}
      />

      {/* Tournament Details Modal */}
      <TournamentDetailsModal
        isOpen={selectedTournamentId !== null}
        onClose={() => setSelectedTournamentId(null)}
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

export default CompetitionsModal; 
