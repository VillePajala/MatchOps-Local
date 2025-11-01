'use client';

import React, { useState, useEffect, useRef } from 'react';
import { primaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineUsers, // Used in empty state
  HiOutlineEllipsisVertical,
  HiOutlineArchiveBox
} from 'react-icons/hi2';
import { Team } from '@/types';
import { queryKeys } from '@/config/queryKeys';
import {
  addTeam,
  updateTeam,
  deleteTeam,
  countGamesForTeam,
  getAllTeamRosters,
} from '@/utils/teams';
import logger from '@/utils/logger';
import TeamDetailsModal from './TeamDetailsModal';

interface TeamManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  onManageRoster?: (teamId: string) => void;
  onManageOrphanedGames?: () => void;
}

const TeamManagerModal: React.FC<TeamManagerModalProps> = ({
  isOpen,
  onClose,
  teams,
  onManageRoster,
  onManageOrphanedGames,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // State management
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [actionsMenuTeamId, setActionsMenuTeamId] = useState<string | null>(null);
  const [deleteConfirmTeamId, setDeleteConfirmTeamId] = useState<string | null>(null);
  const [deleteTeamGamesCount, setDeleteTeamGamesCount] = useState<number>(0);
  const [rosterCounts, setRosterCounts] = useState<Record<string, number>>({});

  // Refs
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Mutations
  const createTeamMutation = useMutation({
    mutationFn: addTeam,
    onSuccess: (newTeam) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams });
      setCreateTeamModalOpen(false);
      logger.log('[TeamManager] Created team:', newTeam);
    },
    onError: (error) => {
      logger.error('[TeamManager] Error creating team:', error);
    }
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ teamId, updates }: { teamId: string; updates: Partial<Team> }) =>
      updateTeam(teamId, updates),
    onSuccess: (updatedTeam) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams });
      setSelectedTeamId(null);
      logger.log('[TeamManager] Updated team:', updatedTeam);
    },
    onError: (error) => {
      logger.error('[TeamManager] Error updating team:', error);
    }
  });

  const deleteTeamMutation = useMutation({
    mutationFn: deleteTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams });
      setDeleteConfirmTeamId(null);
      logger.log('[TeamManager] Deleted team');
    },
    onError: (error) => {
      logger.error('[TeamManager] Error deleting team:', error);
    }
  });

  // Close actions menu when clicking outside
  useEffect(() => {
    if (!actionsMenuTeamId) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsMenuTeamId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [actionsMenuTeamId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCreateTeamModalOpen(false);
      setSelectedTeamId(null);
      setActionsMenuTeamId(null);
      setDeleteConfirmTeamId(null);
      setSearchText('');
    }
  }, [isOpen]);

  // Load roster counts when modal opens or teams change
  useEffect(() => {
    const loadRosterCounts = async () => {
      if (!isOpen) return;
      try {
        const rostersIndex = await getAllTeamRosters();
        const counts: Record<string, number> = {};
        teams.forEach(team => {
          counts[team.id] = rostersIndex[team.id]?.length || 0;
        });
        setRosterCounts(counts);
      } catch (err) {
        logger.warn('[TeamManager] Failed to load roster counts', err);
        setRosterCounts({});
      }
    };
    loadRosterCounts();
  }, [isOpen, teams]);

  // Handlers
  const handleEditTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setActionsMenuTeamId(null);
  };

  const handleToggleArchive = (teamId: string, currentArchived: boolean) => {
    updateTeamMutation.mutate({
      teamId,
      updates: {
        archived: !currentArchived,
      },
    });
    setActionsMenuTeamId(null);
  };

  const handleDeleteTeam = async (teamId: string) => {
    // Load games count for impact warning
    const gamesCount = await countGamesForTeam(teamId);
    setDeleteTeamGamesCount(gamesCount);
    setDeleteConfirmTeamId(teamId);
    setActionsMenuTeamId(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmTeamId) return;

    // Note: Active team concept removed - teams are contextually selected
    deleteTeamMutation.mutate(deleteConfirmTeamId);
  };

  // Note: Team switching removed - teams are now contextually selected

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-manager-title"
    >
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />

        {/* Header */}
        <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 flex-shrink-0">
          <h1 id="team-manager-title" className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
            {t('teamManager.title', 'Teams')}
          </h1>
        </div>

        {/* Fixed Section (Button and Team Counter) */}
        <div className="px-6 pt-1 pb-4 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          {/* Team Counter */}
          <div className="mb-5 text-center text-sm">
            <div className="flex justify-center items-center text-slate-300">
              <span>
                <span className="text-yellow-400 font-semibold">{teams.length}</span>
                {" "}{teams.length === 1
                  ? t('teamManager.totalTeamsSingular', 'Team')
                  : t('teamManager.totalTeamsPlural', 'Teams')
                }
              </span>
            </div>
          </div>

          {/* Add Team Button */}
          <button
            onClick={() => setCreateTeamModalOpen(true)}
            className="w-full px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-lg bg-indigo-600 hover:bg-indigo-700"
            aria-label={t('teamManager.createNewTeam', 'Create new team')}
          >
            {t('teamManager.addTeam', 'Add Team')}
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          {/* Search Field and Show Archived Toggle */}
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder={t('teamManager.searchPlaceholder', 'Search teams...')}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              autoComplete="off"
              aria-label={t('teamManager.searchAriaLabel', 'Search teams by name')}
              className="flex-1 px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
              />
              {t('teamManager.showArchived', 'Show Archived')}
            </label>
          </div>

          {/* Teams List */}
          {(() => {
            const filteredTeams = teams
              .filter(team => showArchived || !team.archived)
              .filter(team => team.name.toLowerCase().includes(searchText.toLowerCase()));

            if (teams.length === 0) {
              return (
                <div className="text-center py-8">
                  <HiOutlineUsers className="w-12 h-12 mx-auto text-slate-400 mb-3" />
                  <p className="text-slate-400 mb-4">
                    {t('teamManager.noTeams', 'No teams yet. Create your first team to get started.')}
                  </p>
                </div>
              );
            }

            if (filteredTeams.length === 0) {
              return (
                <div className="text-center py-8">
                  <HiOutlineUsers className="w-12 h-12 mx-auto text-slate-400 mb-3" />
                  <p className="text-slate-400 mb-4">
                    {searchText
                      ? t('teamManager.noSearchResults', 'No teams match your search for "{{search}}".', { search: searchText })
                      : t('teamManager.noArchivedTeams', 'No archived teams to show.')
                    }
                  </p>
                </div>
              );
            }

            return (
              <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
                <div className="space-y-3">
                  {filteredTeams.map((team) => (
                    <div
                      key={team.id}
                      className={`p-4 rounded-lg transition-all bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 ${team.archived ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-2 flex-1 cursor-pointer hover:opacity-80 transition-opacity py-1"
                          onClick={() => onManageRoster && onManageRoster(team.id)}
                          title={t('teamManager.roster', 'Roster')}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-200">{team.name}</span>
                              {team.archived && (
                                <span className="text-xs px-2 py-0.5 rounded bg-slate-700/70 text-slate-400 border border-slate-600">
                                  {t('teamManager.archivedBadge', 'Archived')}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              {rosterCounts[team.id] === 1
                                ? t('teamManager.onePlayer', '1 player')
                                : t('teamManager.playersCount', '{{count}} players', { count: rosterCounts[team.id] || 0 })
                              }
                              {" "}•{" "}
                              {t('teamManager.createdAt', 'Created {{date}}', {
                                date: new Date(team.createdAt).toLocaleDateString()
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative" ref={actionsMenuTeamId === team.id ? actionsMenuRef : null}>
                            <button
                              onClick={() => setActionsMenuTeamId(actionsMenuTeamId === team.id ? null : team.id)}
                              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-600 rounded transition-colors"
                              aria-label="Team actions"
                            >
                              <HiOutlineEllipsisVertical className="w-4 h-4" />
                            </button>

                            {actionsMenuTeamId === team.id && (
                              <div className="absolute right-0 mt-1 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50">
                                <button
                                  onClick={() => handleEditTeam(team.id)}
                                  className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 first:rounded-t-md transition-colors"
                                >
                                  <HiOutlinePencil className="w-4 h-4" />
                                  {t('teamManager.editRoster', 'Edit Roster')}
                                </button>
                                <button
                                  onClick={() => handleToggleArchive(team.id, team.archived || false)}
                                  className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 transition-colors"
                                >
                                  <HiOutlineArchiveBox className="w-4 h-4" />
                                  {team.archived
                                    ? t('teamManager.unarchive', 'Unarchive')
                                    : t('teamManager.archive', 'Archive')}
                                </button>
                                <button
                                  onClick={() => handleDeleteTeam(team.id)}
                                  className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600/20 flex items-center gap-2 last:rounded-b-md transition-colors"
                                >
                                  <HiOutlineTrash className="w-4 h-4" />
                                  {t('teamManager.delete', 'Delete')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-800/50 border-t border-slate-700/20 backdrop-blur-sm flex items-center gap-4 flex-shrink-0">
          {onManageOrphanedGames ? (
            <button 
              onClick={onManageOrphanedGames}
              className="px-4 py-2 rounded-md font-medium text-amber-300 bg-amber-900/20 hover:bg-amber-900/30 border border-amber-600/30 transition-colors text-sm"
              title={t('teamManager.manageOrphanedGames', 'Manage games from deleted teams')}
            >
              {t('teamManager.orphanedGames', 'Orphaned Games')}
            </button>
          ) : (
            null
          )}
          <div className="ml-auto" />
          <button onClick={onClose} className={primaryButtonStyle}>{t('common.doneButton', 'Done')}</button>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirmTeamId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-600 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">
                {t('common.confirmDelete', 'Confirm Delete')}
              </h3>
              <div className="text-slate-300 mb-6 space-y-3">
                <p>
                  {t('teamManager.confirmDelete', 
                    'Delete team "{{name}}"?',
                    { name: teams.find(t => t.id === deleteConfirmTeamId)?.name || '' }
                  )}
                </p>
                {deleteTeamGamesCount > 0 && (
                  <div className="p-3 bg-amber-900/20 border border-amber-600/30 rounded-md">
                    <p className="text-amber-300 text-sm font-medium">
                      {t('teamManager.deleteImpactWarning', 
                        'This will orphan {{count}} game(s). Games will remain but won\'t be associated with this team.',
                        { count: deleteTeamGamesCount }
                      )}
                    </p>
                  </div>
                )}
                {deleteTeamGamesCount === 0 && (
                  <p className="text-slate-400 text-sm">
                    {t('teamManager.noGamesImpact', 'No games are associated with this team.')}
                  </p>
                )}
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirmTeamId(null)}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded-md font-medium transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteTeamMutation.isPending}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-700 text-white rounded-md font-medium transition-colors"
                >
                  {deleteTeamMutation.isPending ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Team Create Modal */}
        <TeamDetailsModal
          isOpen={createTeamModalOpen}
          onClose={() => setCreateTeamModalOpen(false)}
          mode="create"
          teams={teams}
          addTeamMutation={createTeamMutation}
        />

        {/* Team Edit Modal */}
        <TeamDetailsModal
          isOpen={selectedTeamId !== null}
          onClose={() => setSelectedTeamId(null)}
          mode="edit"
          team={teams.find(t => t.id === selectedTeamId) || null}
          teams={teams}
          updateTeamMutation={updateTeamMutation}
        />
      </div>
    </div>
  );
};

export default TeamManagerModal;
