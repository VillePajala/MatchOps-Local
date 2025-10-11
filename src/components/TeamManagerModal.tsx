'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineUsers, // Used in empty state
  HiOutlineEllipsisVertical
} from 'react-icons/hi2';
import { Team } from '@/types';
import { queryKeys } from '@/config/queryKeys';
import {
  addTeam,
  updateTeam,
  deleteTeam,
  countGamesForTeam,
} from '@/utils/teams';
import logger from '@/utils/logger';

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
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#6366F1');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamColor, setEditTeamColor] = useState('#6366F1');
  const [actionsMenuTeamId, setActionsMenuTeamId] = useState<string | null>(null);
  const [deleteConfirmTeamId, setDeleteConfirmTeamId] = useState<string | null>(null);
  const [deleteTeamGamesCount, setDeleteTeamGamesCount] = useState<number>(0);

  // Refs
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const newTeamInputRef = useRef<HTMLInputElement>(null);
  const editTeamInputRef = useRef<HTMLInputElement>(null);

  // Mutations
  const createTeamMutation = useMutation({
    mutationFn: addTeam,
    onSuccess: (newTeam) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams });
      setIsCreatingTeam(false);
      setNewTeamName('');
      setNewTeamColor('#6366F1');
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
      setEditingTeamId(null);
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
      setIsCreatingTeam(false);
      setEditingTeamId(null);
      setActionsMenuTeamId(null);
      setDeleteConfirmTeamId(null);
      setNewTeamName('');
      setNewTeamColor('#6366F1');
    }
  }, [isOpen]);

  // Focus input when creating/editing
  useEffect(() => {
    if (isCreatingTeam && newTeamInputRef.current) {
      newTeamInputRef.current.focus();
    }
  }, [isCreatingTeam]);

  useEffect(() => {
    if (editingTeamId && editTeamInputRef.current) {
      editTeamInputRef.current.focus();
      editTeamInputRef.current.select();
    }
  }, [editingTeamId]);

  // Handlers
  const handleCreateTeam = () => {
    if (!newTeamName.trim()) return;

    // Check for duplicate team name
    const trimmedName = newTeamName.trim();
    const existingTeam = teams.find(
      team => team.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingTeam) {
      showToast(
        t('teamManager.duplicateNameError',
          'A team named "{{name}}" already exists. Please choose a different name.',
          { name: existingTeam.name }
        ),
        'error'
      );
      return;
    }

    createTeamMutation.mutate({
      name: trimmedName,
      color: newTeamColor,
    });
  };

  const handleStartEdit = (team: Team) => {
    setEditingTeamId(team.id);
    setEditTeamName(team.name);
    setEditTeamColor(team.color || '#6366F1');
    setActionsMenuTeamId(null);
  };

  const handleSaveEdit = () => {
    if (!editingTeamId || !editTeamName.trim()) return;

    // Check for duplicate team name (excluding current team)
    const trimmedName = editTeamName.trim();
    const existingTeam = teams.find(
      team => team.id !== editingTeamId && team.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingTeam) {
      showToast(
        t('teamManager.duplicateNameError',
          'A team named "{{name}}" already exists. Please choose a different name.',
          { name: existingTeam.name }
        ),
        'error'
      );
      return;
    }

    updateTeamMutation.mutate({
      teamId: editingTeamId,
      updates: {
        name: trimmedName,
        color: editTeamColor,
      },
    });
  };

  const handleCancelEdit = () => {
    setEditingTeamId(null);
    setEditTeamName('');
    setEditTeamColor('#6366F1');
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

  const predefinedColors = [
    '#6366F1', // Indigo
    '#8B5CF6', // Violet
    '#06B6D4', // Cyan
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#EC4899', // Pink
    '#84CC16', // Lime
  ];

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
          {!isCreatingTeam ? (
            <button
              onClick={() => setIsCreatingTeam(true)}
              className="w-full px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-lg bg-indigo-600 hover:bg-indigo-700"
              aria-label={t('teamManager.createNewTeam', 'Create new team')}
              disabled={!!editingTeamId}
            >
              {t('teamManager.addTeam', 'Add Team')}
            </button>
          ) : null}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          {/* Create New Team Form */}
          {isCreatingTeam && (
            <div className="mb-6 bg-slate-700/50 rounded-lg p-4 border border-slate-600">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {t('teamManager.teamName', 'Team Name')}
                  </label>
                  <input
                    ref={newTeamInputRef}
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder={t('teamManager.namePlaceholder', 'Enter team name')}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateTeam();
                      if (e.key === 'Escape') setIsCreatingTeam(false);
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {t('teamManager.teamColor', 'Team Color')}
                  </label>
                  <div className="flex gap-2">
                    {predefinedColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewTeamColor(color)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          newTeamColor === color
                            ? 'border-white scale-110'
                            : 'border-slate-500 hover:border-slate-300'
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleCreateTeam}
                    disabled={!newTeamName.trim() || createTeamMutation.isPending}
                    className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
                  >
                    {createTeamMutation.isPending ? t('common.creating', 'Creating...') : t('common.create', 'Create')}
                  </button>
                  <button
                    onClick={() => setIsCreatingTeam(false)}
                    className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded-md font-medium transition-colors"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Teams List */}
          {teams.length === 0 ? (
            <div className="text-center py-8">
              <HiOutlineUsers className="w-12 h-12 mx-auto text-slate-400 mb-3" />
              <p className="text-slate-400 mb-4">
                {t('teamManager.noTeams', 'No teams yet. Create your first team to get started.')}
              </p>
            </div>
          ) : (
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
              <div className="space-y-0">
                {teams.map((team, index) => (
                  <div
                    key={team.id}
                    className={`py-1.5 px-1 rounded transition-colors ${
                      editingTeamId === team.id ? 'bg-slate-700/75' : 'hover:bg-slate-800/40'
                    } ${
                      index < teams.length - 1 ? 'border-b border-slate-700/50' : ''
                    }`}
                  >
                  {editingTeamId === team.id ? (
                    // Edit mode
                    <div className="space-y-3">
                      <div>
                        <input
                          ref={editTeamInputRef}
                          type="text"
                          value={editTeamName}
                          onChange={(e) => setEditTeamName(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        {predefinedColors.map((color) => (
                          <button
                            key={color}
                            onClick={() => setEditTeamColor(color)}
                            className={`w-6 h-6 rounded-full border transition-all ${
                              editTeamColor === color
                                ? 'border-white scale-110'
                                : 'border-slate-500 hover:border-slate-300'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={!editTeamName.trim() || updateTeamMutation.isPending}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white rounded-md text-sm font-medium transition-colors"
                        >
                          {updateTeamMutation.isPending ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded-md text-sm font-medium transition-colors"
                        >
                          {t('common.cancel', 'Cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Display mode
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-2 flex-1 cursor-pointer hover:opacity-80 transition-opacity py-1"
                        onClick={() => onManageRoster && onManageRoster(team.id)}
                        title={t('teamManager.roster', 'Roster')}
                      >
                        <div
                          className="w-4 h-4 rounded-full border border-slate-400 flex-shrink-0"
                          style={{ backgroundColor: team.color || '#6366F1' }}
                        />
                        <span className="text-slate-200">
                          {team.name}
                        </span>
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
                                onClick={() => handleStartEdit(team)}
                                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 first:rounded-t-md transition-colors"
                              >
                                <HiOutlinePencil className="w-4 h-4" />
                                {t('teamManager.rename', 'Rename')}
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
                  )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-800/50 border-t border-slate-700/20 backdrop-blur-sm flex justify-between items-center gap-4 flex-shrink-0">
          {onManageOrphanedGames ? (
            <button 
              onClick={onManageOrphanedGames}
              className="px-4 py-2 rounded-md font-medium text-amber-300 bg-amber-900/20 hover:bg-amber-900/30 border border-amber-600/30 transition-colors text-sm"
              title={t('teamManager.manageOrphanedGames', 'Manage games from deleted teams')}
            >
              {t('teamManager.orphanedGames', 'Orphaned Games')}
            </button>
          ) : (
            <div />
          )}
          
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            {t('common.doneButton', 'Done')}
          </button>
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
      </div>
    </div>
  );
};

export default TeamManagerModal;