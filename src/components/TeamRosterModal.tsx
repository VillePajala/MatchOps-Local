'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark, HiOutlinePlus, HiOutlineArrowDownOnSquareStack } from 'react-icons/hi2';
import { Team, Player } from '@/types';
import { useTeamRosterQuery, useSetTeamRosterMutation, useAddPlayerToRosterMutation, useRemovePlayerFromRosterMutation } from '@/hooks/useTeamQueries';
import { getMasterRoster } from '@/utils/masterRosterManager';
import logger from '@/utils/logger';

interface TeamRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string | null;
  team: Team | null;
}

const TeamRosterModal: React.FC<TeamRosterModalProps> = ({
  isOpen,
  onClose,
  teamId,
  team,
}) => {
  const { t } = useTranslation();
  
  // State
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerJerseyNumber, setNewPlayerJerseyNumber] = useState('');
  const [newPlayerNotes, setNewPlayerNotes] = useState('');

  // Queries and mutations
  const { data: teamRoster = [], isLoading: isLoadingRoster } = useTeamRosterQuery(teamId);
  const setTeamRosterMutation = useSetTeamRosterMutation();
  const addPlayerToRosterMutation = useAddPlayerToRosterMutation();
  const removePlayerFromRosterMutation = useRemovePlayerFromRosterMutation();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsAddingPlayer(false);
      setNewPlayerName('');
      setNewPlayerJerseyNumber('');
      setNewPlayerNotes('');
    }
  }, [isOpen]);

  const handleAddPlayer = async () => {
    if (!teamId || !newPlayerName.trim()) return;

    const newPlayer: Player = {
      id: `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: newPlayerName.trim(),
      nickname: newPlayerName.trim().split(' ')[0], // Use first name as nickname
      jerseyNumber: newPlayerJerseyNumber.trim() || undefined,
      notes: newPlayerNotes.trim() || undefined,
    };

    try {
      await addPlayerToRosterMutation.mutateAsync({ teamId, player: newPlayer });
      setNewPlayerName('');
      setNewPlayerJerseyNumber('');
      setNewPlayerNotes('');
      setIsAddingPlayer(false);
    } catch (error) {
      logger.error('Failed to add player to team roster:', error);
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    if (!teamId) return;
    
    try {
      await removePlayerFromRosterMutation.mutateAsync({ teamId, playerId });
    } catch (error) {
      logger.error('Failed to remove player from team roster:', error);
    }
  };

  const handleImportFromMasterRoster = async () => {
    if (!teamId) return;

    try {
      const masterRoster = await getMasterRoster();
      if (masterRoster && masterRoster.length > 0) {
        // Convert master roster players to team players with new IDs
        const teamPlayers: Player[] = masterRoster.map(player => ({
          ...player,
          id: `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        }));
        
        await setTeamRosterMutation.mutateAsync({ teamId, roster: teamPlayers });
      }
    } catch (error) {
      logger.error('Failed to import from master roster:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-white">
              {t('teamRosterModal.title', 'Team Roster')}
            </h2>
            {team && (
              <p className="text-sm text-slate-300 mt-1">
                {team.name} • {teamRoster.length} {t('teamRosterModal.players', 'players')}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <HiOutlineXMark className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {/* Actions */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setIsAddingPlayer(true)}
              className="flex items-center px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              <HiOutlinePlus className="w-4 h-4 mr-2" />
              {t('teamRosterModal.addPlayer', 'Add Player')}
            </button>
            
            <button
              onClick={handleImportFromMasterRoster}
              className="flex items-center px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
              disabled={setTeamRosterMutation.isPending}
            >
              <HiOutlineArrowDownOnSquareStack className="w-4 h-4 mr-2" />
              {t('teamRosterModal.importFromMaster', 'Import from Master Roster')}
            </button>
          </div>

          {/* Add Player Form */}
          {isAddingPlayer && (
            <div className="bg-slate-700 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-white mb-3">
                {t('teamRosterModal.addNewPlayer', 'Add New Player')}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder={t('teamRosterModal.playerName', 'Player Name')}
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-white placeholder-slate-400"
                />
                
                <input
                  type="text"
                  placeholder={t('teamRosterModal.jerseyNumber', 'Jersey #')}
                  value={newPlayerJerseyNumber}
                  onChange={(e) => setNewPlayerJerseyNumber(e.target.value)}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-white placeholder-slate-400"
                />
                
                <input
                  type="text"
                  placeholder={t('teamRosterModal.notes', 'Notes')}
                  value={newPlayerNotes}
                  onChange={(e) => setNewPlayerNotes(e.target.value)}
                  className="px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-white placeholder-slate-400"
                />
              </div>
              
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleAddPlayer}
                  disabled={!newPlayerName.trim() || addPlayerToRosterMutation.isPending}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white text-sm rounded-md transition-colors"
                >
                  {t('common.add', 'Add')}
                </button>
                
                <button
                  onClick={() => setIsAddingPlayer(false)}
                  className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded-md transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Players List */}
          {isLoadingRoster ? (
            <div className="text-center py-8 text-slate-400">
              {t('common.loading', 'Loading...')}
            </div>
          ) : teamRoster.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>{t('teamRosterModal.noPlayers', 'No players in this team yet.')}</p>
              <p className="text-sm mt-1">
                {t('teamRosterModal.addFirstPlayer', 'Add your first player or import from the master roster.')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {teamRoster.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-slate-700 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      {player.jerseyNumber && (
                        <span className="w-8 h-8 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                          {player.jerseyNumber}
                        </span>
                      )}
                      <div>
                        <p className="text-white font-medium">{player.name}</p>
                        {player.notes && (
                          <p className="text-slate-400 text-sm">{player.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleRemovePlayer(player.id)}
                    disabled={removePlayerFromRosterMutation.isPending}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    <HiOutlineXMark className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamRosterModal;