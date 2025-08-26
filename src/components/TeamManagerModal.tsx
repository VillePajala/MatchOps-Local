'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineUsers,
  HiOutlinePlus,
  HiOutlineDocumentDuplicate,
  HiOutlineEllipsisVertical
} from 'react-icons/hi2';
import { Team } from '@/types';
import { queryKeys } from '@/config/queryKeys';
import {
  addTeam,
  updateTeam,
  deleteTeam,
  duplicateTeam,
  countGamesForTeam,
} from '@/utils/teams';
import logger from '@/utils/logger';

interface TeamManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  onManageRoster?: (teamId: string) => void;
}

const TeamManagerModal: React.FC<TeamManagerModalProps> = ({
  isOpen,
  onClose,
  teams,
  onManageRoster,
}) => {
  const { t } = useTranslation();
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

  const duplicateTeamMutation = useMutation({
    mutationFn: (teamId: string) => duplicateTeam(teamId),
    onSuccess: (newTeam) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams });
      logger.log('[TeamManager] Duplicated team:', newTeam);
    },
    onError: (error) => {
      logger.error('[TeamManager] Error duplicating team:', error);
    }
  });

  // Close actions menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsMenuTeamId(null);
      }
    };

    if (actionsMenuTeamId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

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
    
    createTeamMutation.mutate({
      name: newTeamName.trim(),
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

    updateTeamMutation.mutate({
      teamId: editingTeamId,
      updates: {
        name: editTeamName.trim(),
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

  const handleDuplicateTeam = (team: Team) => {
    duplicateTeamMutation.mutate(team.id);
    setActionsMenuTeamId(null);
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
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />

        {/* Header */}
        <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
            {t('teamManager.title', 'Teams')}
          </h2>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          {/* Create New Team */}
          <div className="mb-6">
            {!isCreatingTeam ? (
              <button
                onClick={() => setIsCreatingTeam(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
              >
                <HiOutlinePlus className="w-5 h-5" />
                {t('teamManager.newTeam', 'New Team')}
              </button>
            ) : (
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
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
          </div>

          {/* Teams List */}
          {teams.length === 0 ? (
            <div className="text-center py-8">
              <HiOutlineUsers className="w-12 h-12 mx-auto text-slate-400 mb-3" />
              <p className="text-slate-400 mb-4">
                {t('teamManager.noTeams', 'No teams yet. Create your first team to get started.')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => (
                <div key={team.id} className="bg-slate-700/50 rounded-lg border border-slate-600 p-4">
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
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full border border-slate-400"
                          style={{ backgroundColor: team.color || '#6366F1' }}
                        />
                        <div>
                          <h3 className="font-medium text-slate-100 flex items-center gap-2">
                            {team.name}
                            {/* Note: Active team indicator removed - teams are contextually selected */}
                          </h3>
                          <p className="text-sm text-slate-400">
                            {t('teamManager.createdAt', 'Created {{date}}', {
                              date: new Date(team.createdAt).toLocaleDateString()
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
{/* Note: Team switching UI removed - teams are contextually selected */}
                        
                        {onManageRoster && (
                          <button
                            onClick={() => onManageRoster(team.id)}
                            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                          >
                            <HiOutlineUsers className="w-4 h-4" />
                            {t('teamManager.roster', 'Roster')}
                          </button>
                        )}

                        <div className="relative" ref={actionsMenuTeamId === team.id ? actionsMenuRef : null}>
                          <button
                            onClick={() => setActionsMenuTeamId(actionsMenuTeamId === team.id ? null : team.id)}
                            className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-600 rounded-md transition-colors"
                            aria-label="Team actions"
                          >
                            <HiOutlineEllipsisVertical className="w-4 h-4" />
                          </button>

                          {actionsMenuTeamId === team.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50">
                              <button
                                onClick={() => handleStartEdit(team)}
                                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2"
                              >
                                <HiOutlinePencil className="w-4 h-4" />
                                {t('teamManager.rename', 'Rename')}
                              </button>
                              <button
                                onClick={() => handleDuplicateTeam(team)}
                                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2"
                                disabled={duplicateTeamMutation.isPending}
                              >
                                <HiOutlineDocumentDuplicate className="w-4 h-4" />
                                {t('teamManager.duplicate', 'Duplicate')}
                              </button>
                              <button
                                onClick={() => handleDeleteTeam(team.id)}
                                className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600/20 flex items-center gap-2"
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
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-800/50 border-t border-slate-700/20 backdrop-blur-sm flex justify-end items-center gap-4 flex-shrink-0">
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