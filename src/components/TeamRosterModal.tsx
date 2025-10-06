'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineUserPlus } from 'react-icons/hi2';
import { Team, Player } from '@/types';
import { useTeamRosterQuery, useAddPlayerToRosterMutation, useSetTeamRosterMutation } from '@/hooks/useTeamQueries';
import PlayerSelectionSection from './PlayerSelectionSection';
import logger from '@/utils/logger';

interface TeamRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void; // Optional back navigation
  teamId: string | null;
  team: Team | null;
  masterRoster: Player[]; // Master roster from React Query
}

const TeamRosterModal: React.FC<TeamRosterModalProps> = ({
  isOpen,
  onClose,
  onBack,
  teamId,
  team,
  masterRoster, // Use prop instead of fetching manually
}) => {
  const { t } = useTranslation();

  // State
  const [isSelectingFromMaster, setIsSelectingFromMaster] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  // Queries and mutations
  const { data: teamRoster = [], isLoading: isLoadingRoster } = useTeamRosterQuery(teamId);
  const addPlayerToRosterMutation = useAddPlayerToRosterMutation();
  const setTeamRosterMutation = useSetTeamRosterMutation();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsSelectingFromMaster(false);
      setSelectedPlayerIds([]);
    }
  }, [isOpen]);

  const handleSelectFromMaster = () => {
    setIsSelectingFromMaster(true);
  };

  const handleAddSelectedPlayers = async () => {
    if (!teamId || selectedPlayerIds.length === 0) return;

    try {
      // Map the selected master players to team-local players (new IDs)
      const selectedMasterPlayers = masterRoster.filter(p => selectedPlayerIds.includes(p.id));
      const newRoster: Player[] = selectedMasterPlayers.map((player, index) => ({
        ...player,
        id: `player_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${index}`,
      }));

      // Replace the team roster with the exact selection
      await setTeamRosterMutation.mutateAsync({ teamId, roster: newRoster });

      // Exit selection mode
      setIsSelectingFromMaster(false);
      setSelectedPlayerIds([]);
    } catch (error) {
      logger.error('Failed to add selected players:', error);
    }
  };

  // Normalizer for robust name comparisons (handles case/diacritics)
  const normalizeName = (value: string | undefined | null) =>
    (value || '').normalize('NFKC').toLowerCase().trim();

  // When opening selection from master, pre-select players that are already in the team
  useEffect(() => {
    if (!isSelectingFromMaster) return;
    if (masterRoster.length === 0) return;

    const teamNames = new Set(teamRoster.map(p => normalizeName(p.name)));
    const preselectedIds = masterRoster
      .filter(p => teamNames.has(normalizeName(p.name)))
      .map(p => p.id);

    setSelectedPlayerIds(preselectedIds);
  }, [isSelectingFromMaster, masterRoster, teamRoster]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
        
        {/* Header */}
        <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">
            {t('teamRosterModal.title', 'Team Roster')}
          </h2>
        </div>

        {/* Controls Section */}
        <div className="px-6 py-4 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          {team && (
            <p className="text-slate-300 text-center mb-4">
              {team.name} • {teamRoster.length} {t('teamRosterModal.players', 'players')}
            </p>
          )}
          
          <div className="w-full">
            <button
              onClick={handleSelectFromMaster}
              className="w-full flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium"
            >
              <HiOutlineUserPlus className="w-4 h-4 mr-2" />
              {t('common.edit', 'Edit')}
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">


          {/* Select from Master Roster */}
          {isSelectingFromMaster && (
            <div className="space-y-4">
              <PlayerSelectionSection
                availablePlayers={masterRoster}
                selectedPlayerIds={selectedPlayerIds}
                onSelectedPlayersChange={setSelectedPlayerIds}
                title={t('teamRosterModal.selectFromMaster', 'Select from Master Roster')}
                playersSelectedText={t('teamRosterModal.selected', 'selected')}
                selectAllText={t('teamRosterModal.selectAll', 'Select All')}
                noPlayersText={t('teamRosterModal.noAvailablePlayers', 'No available players to add from master roster.')}
                disabled={addPlayerToRosterMutation.isPending}
              />
              
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setIsSelectingFromMaster(false);
                    setSelectedPlayerIds([]);
                  }}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-md transition-colors font-medium"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={handleAddSelectedPlayers}
                  disabled={selectedPlayerIds.length === 0 || addPlayerToRosterMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-600 disabled:opacity-50 text-white rounded-md transition-colors font-medium"
                >
                  {addPlayerToRosterMutation.isPending 
                    ? t('teamRosterModal.adding', 'Adding...') 
                    : `${t('teamRosterModal.addSelected', 'Add Selected')} (${selectedPlayerIds.length})`
                  }
                </button>
              </div>
            </div>
          )}

          {/* Current Team Roster */}
          {!isSelectingFromMaster && (
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4">
              <h3 className="text-xl font-semibold text-slate-200 mb-4">
                {t('teamRosterModal.currentRoster', 'Current Team Roster')}
              </h3>

              {isLoadingRoster ? (
                <div className="text-center py-8 text-slate-400">
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{t('common.loading', 'Loading...')}</span>
                  </div>
                </div>
              ) : teamRoster.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p className="text-lg">{t('teamRosterModal.noPlayers', 'No players in this team yet.')}</p>
                  <p className="text-sm mt-2">
                    {t('teamRosterModal.addFirstPlayer', 'Add your first player or import from the master roster.')}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {teamRoster.map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center p-3 rounded-lg border transition-all ${
                        index % 2 === 0 
                          ? 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60'
                          : 'bg-slate-800/20 border-slate-700/30 hover:bg-slate-800/40'
                      }`}
                    >
                      <p className="text-slate-100 font-medium">{player.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/20 backdrop-blur-sm bg-slate-900/20 flex-shrink-0">
          {onBack ? (
            <div className="flex gap-3">
              <button 
                onClick={onBack}
                className="flex-1 px-4 py-2 rounded-md font-semibold text-slate-200 bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                {t('teamRosterModal.backToTeamManager', 'Back to Team Manager')}
              </button>
              <button 
                onClick={onClose}
                className="px-6 py-2 rounded-md font-semibold text-slate-400 bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          ) : (
            <button 
              onClick={onClose} 
              className="w-full px-4 py-2 rounded-md font-semibold text-slate-200 bg-slate-700 hover:bg-slate-600 transition-colors"
            >
              {t('common.close', 'Close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamRosterModal;