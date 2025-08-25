'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  HiOutlineXMark,
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
  createTeam,
  updateTeam,
  deleteTeam,
  duplicateTeam,
  setActiveTeamId,
} from '@/utils/teams';
import logger from '@/utils/logger';

interface TeamManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  activeTeamId: string | null;
  onTeamSwitch?: (teamId: string) => void;
  onManageRoster?: (teamId: string) => void;
}

const TeamManagerModal: React.FC<TeamManagerModalProps> = ({
  isOpen,
  onClose,
  teams,
  activeTeamId,
  onTeamSwitch,
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

  // Refs
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const newTeamInputRef = useRef<HTMLInputElement>(null);
  const editTeamInputRef = useRef<HTMLInputElement>(null);

  // Mutations
  const createTeamMutation = useMutation({
    mutationFn: createTeam,
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
    mutationFn: ({ sourceTeamId, newName }: { sourceTeamId: string; newName: string }) =>
      duplicateTeam(sourceTeamId, newName),
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

  const handleDeleteTeam = (teamId: string) => {
    setDeleteConfirmTeamId(teamId);
    setActionsMenuTeamId(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmTeamId) return;
    
    // If deleting active team, clear active team
    if (deleteConfirmTeamId === activeTeamId) {
      const remainingTeams = teams.filter(t => t.id !== deleteConfirmTeamId);
      if (remainingTeams.length > 0) {
        setActiveTeamId(remainingTeams[0].id);
      } else {
        setActiveTeamId(null);
      }
    }
    
    deleteTeamMutation.mutate(deleteConfirmTeamId);
  };

  const handleDuplicateTeam = (team: Team) => {
    const newName = `${team.name} Copy`; // Simple fallback - can be improved with proper i18n later
    duplicateTeamMutation.mutate({
      sourceTeamId: team.id,
      newName,
    });
    setActionsMenuTeamId(null);
  };

  const handleSwitchTeam = (teamId: string) => {
    setActiveTeamId(teamId);
    queryClient.invalidateQueries({ queryKey: ['teams'] }); // Invalidate team-related queries
    if (onTeamSwitch) {
      onTeamSwitch(teamId);
    }
  };

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl border border-slate-600 w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-600">
          <h2 className="text-xl font-semibold text-slate-100">
            {t('teamManager.title', 'Teams')}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-300 p-1 rounded transition-colors"
            aria-label="Close"
          >
            <HiOutlineXMark className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
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
                            {team.id === activeTeamId && (
                              <span className="px-2 py-0.5 bg-green-600/20 text-green-300 text-xs rounded-full border border-green-500/30">
                                {t('teamManager.active', 'Active')}
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-slate-400">
                            {t('teamManager.createdAt', 'Created {{date}}', {
                              date: new Date(team.createdAt).toLocaleDateString()
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {team.id !== activeTeamId && (
                          <button
                            onClick={() => handleSwitchTeam(team.id)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
                          >
                            {t('teamManager.switchTo', 'Switch')}
                          </button>
                        )}
                        
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

        {/* Delete Confirmation Modal */}
        {deleteConfirmTeamId && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-slate-800 p-6 rounded-lg border border-slate-600 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">
                {t('common.confirmDelete', 'Confirm Delete')}
              </h3>
              <p className="text-slate-300 mb-6">
                {t('teamManager.confirmDelete', 
                  'Delete team "{{name}}"? All associated data remains but will be unassigned.',
                  { name: teams.find(t => t.id === deleteConfirmTeamId)?.name || '' }
                )}
              </p>
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