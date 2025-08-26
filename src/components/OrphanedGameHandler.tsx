'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineExclamationTriangle, HiOutlineArrowPath, HiOutlineTrash } from 'react-icons/hi2';
import { AppState, Team } from '@/types';
import { getTeams } from '@/utils/teams';
import { getSavedGames, deleteGame, updateGameDetails } from '@/utils/savedGames';
import logger from '@/utils/logger';

interface OrphanedGame {
  gameId: string;
  game: AppState;
  teamName: string;
}

interface OrphanedGameHandlerProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

const OrphanedGameHandler: React.FC<OrphanedGameHandlerProps> = ({
  isOpen,
  onClose,
  onRefresh
}) => {
  const { t } = useTranslation();
  const [orphanedGames, setOrphanedGames] = useState<OrphanedGame[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedReassignments, setSelectedReassignments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      loadOrphanedGames();
    }
  }, [isOpen]);

  const loadOrphanedGames = async () => {
    setIsLoading(true);
    try {
      const [savedGames, availableTeams] = await Promise.all([
        getSavedGames(),
        getTeams()
      ]);

      setTeams(availableTeams);

      // Find games with team IDs that don't exist
      const teamIds = new Set(availableTeams.map(t => t.id));
      const orphaned: OrphanedGame[] = [];

      Object.entries(savedGames).forEach(([gameId, game]) => {
        if (game.teamId && !teamIds.has(game.teamId)) {
          orphaned.push({
            gameId,
            game,
            teamName: game.teamName || 'Unknown Team'
          });
        }
      });

      setOrphanedGames(orphaned);
    } catch (error) {
      logger.error('[OrphanedGameHandler] Error loading orphaned games:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReassignGame = async (gameId: string, newTeamId: string) => {
    try {
      await updateGameDetails(gameId, { teamId: newTeamId });
      
      // Remove from orphaned list
      setOrphanedGames(prev => prev.filter(og => og.gameId !== gameId));
      
      // Clear selection
      setSelectedReassignments(prev => {
        const { [gameId]: _, ...rest } = prev;
        return rest;
      });

      logger.log('[OrphanedGameHandler] Reassigned game:', gameId, 'to team:', newTeamId);
    } catch (error) {
      logger.error('[OrphanedGameHandler] Error reassigning game:', error);
    }
  };

  const handleDeleteGame = async (gameId: string) => {
    if (!window.confirm(t('orphanedGames.confirmDelete', 'Delete this orphaned game permanently?'))) {
      return;
    }

    try {
      await deleteGame(gameId);
      setOrphanedGames(prev => prev.filter(og => og.gameId !== gameId));
      logger.log('[OrphanedGameHandler] Deleted orphaned game:', gameId);
    } catch (error) {
      logger.error('[OrphanedGameHandler] Error deleting game:', error);
    }
  };

  const handleBulkReassign = async () => {
    const assignments = Object.entries(selectedReassignments);
    if (assignments.length === 0) return;

    try {
      await Promise.all(
        assignments.map(([gameId, teamId]) => 
          updateGameDetails(gameId, { teamId })
        )
      );

      // Remove reassigned games from orphaned list
      const reassignedGameIds = new Set(assignments.map(([gameId]) => gameId));
      setOrphanedGames(prev => prev.filter(og => !reassignedGameIds.has(og.gameId)));
      setSelectedReassignments({});

      logger.log('[OrphanedGameHandler] Bulk reassigned games:', assignments.length);
    } catch (error) {
      logger.error('[OrphanedGameHandler] Error in bulk reassign:', error);
    }
  };

  const handleClose = () => {
    if (onRefresh) {
      onRefresh();
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden max-w-4xl max-h-[90vh] rounded-lg">
        {/* Header */}
        <div className="flex justify-center items-center pt-6 pb-4 px-6 border-b border-slate-700/20">
          <div className="flex items-center gap-3">
            <HiOutlineExclamationTriangle className="w-8 h-8 text-amber-400" />
            <h2 className="text-2xl font-bold text-slate-200">
              {t('orphanedGames.title', 'Orphaned Games')}
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <HiOutlineArrowPath className="w-8 h-8 text-indigo-400 animate-spin" />
              <span className="ml-2 text-slate-400">{t('common.loading', 'Loading...')}</span>
            </div>
          ) : orphanedGames.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400 text-lg">
                {t('orphanedGames.noOrphanedGames', 'No orphaned games found!')}
              </p>
              <p className="text-slate-500 text-sm mt-2">
                {t('orphanedGames.allGamesLinked', 'All games are properly linked to existing teams.')}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-slate-400 mb-4">
                  {t('orphanedGames.description', 'Found {{count}} games linked to deleted teams. You can reassign them to existing teams or delete them.', 
                    { count: orphanedGames.length })}
                </p>
                
                {Object.keys(selectedReassignments).length > 0 && (
                  <button
                    onClick={handleBulkReassign}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors"
                  >
                    {t('orphanedGames.bulkReassign', 'Reassign Selected ({{count}})', 
                      { count: Object.keys(selectedReassignments).length })}
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {orphanedGames.map((orphaned) => (
                  <div key={orphaned.gameId} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-slate-200 font-medium">
                          {orphaned.teamName} vs {orphaned.game.opponentName}
                        </h3>
                        <p className="text-slate-400 text-sm">
                          {orphaned.game.gameDate} • Game ID: {orphaned.gameId}
                        </p>
                      </div>
                      
                      <button
                        onClick={() => handleDeleteGame(orphaned.gameId)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-md transition-colors"
                        title={t('orphanedGames.deleteGame', 'Delete game')}
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="flex gap-3">
                      <select
                        value={selectedReassignments[orphaned.gameId] || ''}
                        onChange={(e) => setSelectedReassignments(prev => ({
                          ...prev,
                          [orphaned.gameId]: e.target.value
                        }))}
                        className="flex-1 bg-slate-600 text-slate-200 border border-slate-500 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">
                          {t('orphanedGames.selectTeam', 'Select team to reassign...')}
                        </option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                      
                      <button
                        onClick={() => handleReassignGame(orphaned.gameId, selectedReassignments[orphaned.gameId])}
                        disabled={!selectedReassignments[orphaned.gameId]}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
                      >
                        {t('orphanedGames.reassign', 'Reassign')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/20">
          <div className="flex gap-3 justify-end">
            <button
              onClick={loadOrphanedGames}
              disabled={isLoading}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
            >
              <HiOutlineArrowPath className={`w-4 h-4 inline mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {t('common.refresh', 'Refresh')}
            </button>
            
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors"
            >
              {t('common.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrphanedGameHandler;