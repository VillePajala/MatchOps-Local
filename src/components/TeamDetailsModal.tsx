'use client';

import React, { useState, useEffect } from 'react';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { Team } from '@/types';
import { UseMutationResult } from '@tanstack/react-query';

interface TeamDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  team?: Team | null;
  teams: Team[]; // For duplicate name validation
  addTeamMutation?: UseMutationResult<Team | null, Error, Partial<Team> & { name: string }, unknown>;
  updateTeamMutation?: UseMutationResult<Team | null, Error, { teamId: string; updates: Partial<Team> }, unknown>;
}

const TeamDetailsModal: React.FC<TeamDetailsModalProps> = ({
  isOpen,
  onClose,
  mode,
  team,
  teams,
  addTeamMutation,
  updateTeamMutation,
}) => {
  const { t } = useTranslation();

  // Form state
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [archived, setArchived] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Initialize form when team changes or modal opens
  useEffect(() => {
    if (mode === 'create') {
      // Reset form for create mode
      setName('');
      setColor('');
      setArchived(false);
      setDuplicateError(null);
    } else if (team) {
      // Load existing team data for edit mode
      setName(team.name || '');
      setColor(team.color || '');
      setArchived(team.archived || false);
      setDuplicateError(null);
    }
  }, [mode, team, isOpen]);

  // Clear duplicate error when name changes
  useEffect(() => {
    if (duplicateError) {
      setDuplicateError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const handleSave = () => {
    if (!name.trim()) return;

    // Check for duplicate team name
    const trimmedName = name.trim();
    const existingTeam = teams.find(
      t => t.id !== team?.id && t.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingTeam) {
      setDuplicateError(
        t('teamManager.duplicateNameError',
          'A team named "{{name}}" already exists. Please choose a different name.',
          { name: existingTeam.name }
        )
      );
      return;
    }

    if (mode === 'create') {
      // Create new team
      if (!addTeamMutation) return;

      const newTeam: Partial<Team> & { name: string } = {
        name: trimmedName,
        color: color.trim() || undefined,
        archived,
      };

      addTeamMutation.mutate(newTeam, {
        onSuccess: () => onClose(),
      });
    } else {
      // Update existing team
      if (!team || !updateTeamMutation) return;

      updateTeamMutation.mutate({
        teamId: team.id,
        updates: {
          name: trimmedName,
          color: color.trim() || undefined,
          archived,
        },
      }, {
        onSuccess: () => onClose(),
      });
    }
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  const isPending = mode === 'create' ? addTeamMutation?.isPending : updateTeamMutation?.isPending;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />

        {/* Header */}
        <div className="flex flex-col flex-shrink-0">
          <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
              {mode === 'create'
                ? t('teamDetailsModal.createTitle', 'Create Team')
                : t('teamDetailsModal.editTitle', 'Team Details')}
            </h2>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('teamDetailsModal.nameLabel', 'Team Name')} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('teamDetailsModal.namePlaceholder', 'Enter team name')}
                  className={`w-full px-3 py-2 bg-slate-700 border ${duplicateError ? 'border-red-500' : 'border-slate-600'} rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500`}
                  required
                />
                {duplicateError && (
                  <p className="mt-1 text-sm text-red-400">{duplicateError}</p>
                )}
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('teamDetailsModal.colorLabel', 'Team Color')}
                </label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder={t('teamDetailsModal.colorPlaceholder', 'e.g., #FF5733 or blue')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  {t('teamDetailsModal.colorHint', 'Optional: hex code or color name')}
                </p>
              </div>

              {/* Archived */}
              <div>
                <label className="text-slate-200 text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={archived}
                    onChange={(e) => setArchived(e.target.checked)}
                    className="form-checkbox h-4 w-4 text-indigo-600 rounded"
                  />
                  {t('teamDetailsModal.archivedLabel', 'Archived')}
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <ModalFooter>
          <button onClick={handleCancel} className={secondaryButtonStyle}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isPending}
            className={primaryButtonStyle}
          >
            {isPending
              ? t('common.saving', 'Saving...')
              : mode === 'create'
              ? t('common.create', 'Create')
              : t('common.save', 'Save')}
          </button>
        </ModalFooter>
      </div>
    </div>
  );
};

export default TeamDetailsModal;
