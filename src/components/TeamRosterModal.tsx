'use client';

import React, { useState, useEffect } from 'react';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { Team, Player } from '@/types';
import { useTeamRosterQuery, useAddPlayerToRosterMutation, useSetTeamRosterMutation } from '@/hooks/useTeamQueries';
import PlayerSelectionSection from './PlayerSelectionSection';
import logger from '@/utils/logger';
import { generatePlayerId } from '@/utils/idGenerator';

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
        id: generatePlayerId(index),
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
        <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 flex-shrink-0">
          <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
            {team ? `${team.name} ${t('teamRosterModal.roster', 'Kokoonpano')}` : t('teamRosterModal.title', 'Team Roster')}
          </h2>
        </div>

        {/* Fixed Section (Button and Player Counter) */}
        <div className="px-6 pt-1 pb-4 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          {/* Player Counter */}
          <div className="mb-5 text-center text-sm">
            <div className="flex justify-center items-center text-slate-300">
              <span>
                <span className="text-yellow-400 font-semibold">{teamRoster.length}</span>
                {" "}{teamRoster.length === 1
                  ? t('teamRosterModal.playerSingular', 'Player')
                  : t('teamRosterModal.playerPlural', 'Players')
                }
              </span>
            </div>
          </div>

          {/* Edit Button */}
          {!isSelectingFromMaster && (
            <button
              onClick={handleSelectFromMaster}
              className="w-full px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-lg bg-indigo-600 hover:bg-indigo-700"
            >
              {t('teamRosterModal.editButton', 'Muokkaa')}
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6">


          {/* Select from Master Roster */}
          {isSelectingFromMaster && (
            <div className="space-y-4 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
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
            <div className="bg-slate-900/70 rounded-lg border border-slate-700 shadow-inner p-4 -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
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
                <div role="list" className="space-y-0" aria-label={t('teamRosterModal.playerList', 'Team player list')}>
                  {teamRoster.map((player, index) => (
                    <div
                      key={player.id}
                      role="listitem"
                      tabIndex={0}
                      aria-label={`${t('teamRosterModal.player', 'Player')}: ${player.name}`}
                      className={`flex items-center py-1.5 px-2 rounded hover:bg-slate-800/40 focus:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                        index < teamRoster.length - 1 ? 'border-b border-slate-700/50' : ''
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
        <ModalFooter>
          {onBack ? (
            <>
              <button onClick={onBack} className={secondaryButtonStyle}>
                {t('teamRosterModal.backToTeamManager', 'Back to Team Manager')}
              </button>
              <div className="flex-1" />
              <button onClick={onClose} className={primaryButtonStyle}>
                {t('common.doneButton', 'Done')}
              </button>
            </>
          ) : (
            <button onClick={onClose} className={primaryButtonStyle}>
              {t('common.doneButton', 'Done')}
            </button>
          )}
        </ModalFooter>
      </div>
    </div>
  );
};

export default TeamRosterModal;
