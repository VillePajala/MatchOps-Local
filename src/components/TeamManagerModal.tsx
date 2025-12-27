'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle, ModalFooter } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineUsers, // Used in empty state
  HiOutlineEllipsisVertical,
  HiOutlineArchiveBox
} from 'react-icons/hi2';
import { Team, Player, Tournament, Season } from '@/types';
import { queryKeys } from '@/config/queryKeys';
import {
  updateTeam,
  deleteTeam,
  countGamesForTeam,
  getAllTeamRosters,
} from '@/utils/teams';
import { useQuery } from '@tanstack/react-query';
import { getTournaments } from '@/utils/tournaments';
import { getSeasons } from '@/utils/seasons';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import logger from '@/utils/logger';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import UnifiedTeamModal from './UnifiedTeamModal';
import { useResourceLimit } from '@/hooks/usePremium';

interface TeamManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  masterRoster: Player[];
  onManageOrphanedGames?: () => void;
}

const TeamManagerModal: React.FC<TeamManagerModalProps> = ({
  isOpen,
  onClose,
  teams,
  masterRoster,
  onManageOrphanedGames,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Premium limit check for team creation (count non-archived teams)
  const activeTeamCount = teams.filter(team => !team.archived).length;
  const { checkAndPrompt: checkTeamLimitAndPrompt } = useResourceLimit('team', activeTeamCount);

  // State management
  const [unifiedModalOpen, setUnifiedModalOpen] = useState(false);
  const [unifiedModalMode, setUnifiedModalMode] = useState<'create' | 'edit'>('create');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [actionsMenuTeamId, setActionsMenuTeamId] = useState<string | null>(null);
  const [deleteConfirmTeamId, setDeleteConfirmTeamId] = useState<string | null>(null);
  const [deleteTeamGamesCount, setDeleteTeamGamesCount] = useState<number>(0);
  const [rosterCounts, setRosterCounts] = useState<Record<string, number>>({});

  // Refs
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [menuPositions, setMenuPositions] = useState<Record<string, boolean>>({});
  const { calculatePosition } = useDropdownPosition();

  // Mutations
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

  // Queries for tournaments and seasons (for placement badges)
  const { data: tournaments = [] } = useQuery<Tournament[]>({
    queryKey: queryKeys.tournaments,
    queryFn: getTournaments,
  });

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: queryKeys.seasons,
    queryFn: getSeasons,
  });

  // Lookup maps for O(1) access to seasons/tournaments by ID
  const seasonMap = useMemo(() =>
    Object.fromEntries(seasons.map(s => [s.id, s])),
    [seasons]
  );
  const tournamentMap = useMemo(() =>
    Object.fromEntries(tournaments.map(t => [t.id, t])),
    [tournaments]
  );

  // Helper function to get placement badges for a team
  const getTeamPlacements = (teamId: string): Array<{ name: string; placement: number; emoji: string }> => {
    const placements: Array<{ name: string; placement: number; emoji: string }> = [];

    tournaments.forEach(t => {
      if (t.teamPlacements?.[teamId]) {
        const emoji = t.teamPlacements[teamId].placement === 1 ? '🥇' :
                     t.teamPlacements[teamId].placement === 2 ? '🥈' :
                     t.teamPlacements[teamId].placement === 3 ? '🥉' : '🏆';
        placements.push({ name: t.name, placement: t.teamPlacements[teamId].placement, emoji });
      }
    });

    seasons.forEach(s => {
      if (s.teamPlacements?.[teamId]) {
        const emoji = s.teamPlacements[teamId].placement === 1 ? '🥇' :
                     s.teamPlacements[teamId].placement === 2 ? '🥈' :
                     s.teamPlacements[teamId].placement === 3 ? '🥉' : '📅';
        placements.push({ name: s.name, placement: s.teamPlacements[teamId].placement, emoji });
      }
    });

    // Return top 3 placements sorted by placement number
    return placements.sort((a, b) => a.placement - b.placement).slice(0, 3);
  };

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

  const handleActionsMenuToggle = (e: React.MouseEvent<HTMLButtonElement>, teamId: string) => {
    const shouldOpenUpward = calculatePosition(e.currentTarget);
    setMenuPositions(prev => ({ ...prev, [teamId]: shouldOpenUpward }));
    setActionsMenuTeamId(actionsMenuTeamId === teamId ? null : teamId);
  };

  // Reset state when modal closes
  React.useLayoutEffect(() => {
    if (!isOpen) {
      setUnifiedModalOpen(false);
      setSelectedTeamId(null);
      setActionsMenuTeamId(null);
      setDeleteConfirmTeamId(null);
      setSearchText('');
    }
  }, [isOpen]);

  // Load roster counts when modal opens, teams change, or master roster changes
  // (master roster changes can affect team roster counts via sync/matching)
  React.useLayoutEffect(() => {
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
  }, [isOpen, teams, masterRoster]);

  // Mutations for archive/unarchive
  const updateTeamMutation = useMutation({
    mutationFn: ({ teamId, updates }: { teamId: string; updates: Partial<Team> }) =>
      updateTeam(teamId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams });
      logger.log('[TeamManager] Updated team');
    },
    onError: (error) => {
      logger.error('[TeamManager] Error updating team:', error);
    }
  });

  // Handlers
  const handleEditTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setUnifiedModalMode('edit');
    setUnifiedModalOpen(true);
    setActionsMenuTeamId(null);
  };

  const handleToggleArchive = (teamId: string, currentArchived: boolean) => {
    // If unarchiving (archived -> not archived), check premium limits first
    if (currentArchived) {
      if (!checkTeamLimitAndPrompt()) {
        setActionsMenuTeamId(null);
        return; // Upgrade prompt shown
      }
    }

    updateTeamMutation.mutate({
      teamId,
      updates: {
        archived: !currentArchived,
      },
    });
    setActionsMenuTeamId(null);
  };

  const handleCreateTeam = () => {
    // Check premium limit before allowing team creation
    if (!checkTeamLimitAndPrompt()) {
      return; // Upgrade prompt shown, don't open create modal
    }
    setSelectedTeamId(null);
    setUnifiedModalMode('create');
    setUnifiedModalOpen(true);
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
            onClick={handleCreateTeam}
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
            const searchLower = searchText.toLowerCase();
            const filteredTeams = teams
              .filter(team => showArchived || !team.archived)
              .filter(team => {
                if (!searchText) return true;
                // Search by team name
                if (team.name.toLowerCase().includes(searchLower)) return true;
                // Search by ageGroup
                if (team.ageGroup?.toLowerCase().includes(searchLower)) return true;
                // Search by gameType
                if (team.gameType?.toLowerCase().includes(searchLower)) return true;
                // Search by season name (with club season)
                if (team.boundSeasonId && seasonMap[team.boundSeasonId]) {
                  const seasonName = getSeasonDisplayName(seasonMap[team.boundSeasonId]);
                  if (seasonName.toLowerCase().includes(searchLower)) return true;
                }
                // Search by tournament name (with club season)
                if (team.boundTournamentId && tournamentMap[team.boundTournamentId]) {
                  const tournamentName = getTournamentDisplayName(tournamentMap[team.boundTournamentId]);
                  if (tournamentName.toLowerCase().includes(searchLower)) return true;
                }
                return false;
              });

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
                      {/* Top row: Team name + archived badge + actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => handleEditTeam(team.id)}
                          title={t('teamManager.roster', 'Roster')}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-slate-200 truncate" title={team.name}>{team.name}</span>
                            {team.archived && (
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-700/70 text-slate-400 border border-slate-600 shrink-0">
                                {t('teamManager.archivedBadge', 'Archived')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative" ref={actionsMenuTeamId === team.id ? actionsMenuRef : null}>
                            <button
                              onClick={(e) => handleActionsMenuToggle(e, team.id)}
                              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-600 rounded transition-colors"
                              aria-label="Team actions"
                            >
                              <HiOutlineEllipsisVertical className="w-4 h-4" />
                            </button>

                            {actionsMenuTeamId === team.id && (
                              <div className={`absolute right-0 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50 ${menuPositions[team.id] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                                <button
                                  onClick={() => handleEditTeam(team.id)}
                                  className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 first:rounded-t-md transition-colors"
                                >
                                  <HiOutlinePencil className="w-4 h-4" />
                                  {t('teamManager.edit', 'Muokkaa')}
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

                      {/* Bottom row: Metadata left, context labels right */}
                      <div className="flex items-end justify-between gap-4 mt-2 text-xs">
                        {/* Left: Team metadata */}
                        <div
                          className="flex flex-col text-slate-400 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => handleEditTeam(team.id)}
                        >
                          <span>
                            {rosterCounts[team.id] === 1
                              ? t('teamManager.onePlayer', '1 player')
                              : t('teamManager.playersCount', '{{count}} players', { count: rosterCounts[team.id] || 0 })
                            }
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            {t('teamManager.createdAt', 'Created {{date}}', {
                              date: new Date(team.createdAt).toLocaleDateString()
                            })}
                          </span>
                          {/* Placement Badges */}
                          {(() => {
                            const placements = getTeamPlacements(team.id);
                            if (placements.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {placements.map((p, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-700/50 flex items-center gap-1"
                                    title={p.name}
                                  >
                                    {p.emoji} {p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Right: Context labels - wrap upward from bottom right */}
                        <div className="flex flex-wrap-reverse justify-end content-end gap-1.5">
                          {/* Age group */}
                          {team.ageGroup && (
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200"
                              aria-label={t('teamManager.ageGroupContext', 'Age group: {{ageGroup}}', { ageGroup: team.ageGroup })}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                              {team.ageGroup}
                            </span>
                          )}
                          {/* Game type */}
                          {team.gameType === 'futsal' && (
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200"
                              aria-label={t('teamManager.gameTypeContext', 'Game type: Futsal')}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                              {t('common.gameTypeFutsal', 'Futsal')}
                            </span>
                          )}
                          {/* Season - shows full name with club season */}
                          {team.boundSeasonId && seasonMap[team.boundSeasonId] && (
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200"
                              aria-label={t('teamManager.seasonContext', 'Season: {{name}}', { name: getSeasonDisplayName(seasonMap[team.boundSeasonId]) })}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                              {getSeasonDisplayName(seasonMap[team.boundSeasonId])}
                            </span>
                          )}
                          {/* Tournament - shows full name with club season */}
                          {team.boundTournamentId && tournamentMap[team.boundTournamentId] && (
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200"
                              aria-label={t('teamManager.tournamentContext', 'Tournament: {{name}}', { name: getTournamentDisplayName(tournamentMap[team.boundTournamentId]) })}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                              {getTournamentDisplayName(tournamentMap[team.boundTournamentId])}
                            </span>
                          )}
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
        <ModalFooter>
          {onManageOrphanedGames && (
            <button
              onClick={onManageOrphanedGames}
              className="px-4 py-2 rounded-md font-medium text-amber-300 bg-amber-900/20 hover:bg-amber-900/30 border border-amber-600/30 transition-colors text-sm"
              title={t('teamManager.manageOrphanedGames', 'Manage games from deleted teams')}
            >
              {t('teamManager.orphanedGames', 'Orphaned Games')}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className={primaryButtonStyle}>{t('common.doneButton', 'Done')}</button>
        </ModalFooter>

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
                  className={secondaryButtonStyle}
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteTeamMutation.isPending}
                  className={dangerButtonStyle}
                >
                  {deleteTeamMutation.isPending ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unified Team Modal */}
        <UnifiedTeamModal
          isOpen={unifiedModalOpen}
          onClose={() => {
            setUnifiedModalOpen(false);
            setSelectedTeamId(null);
          }}
          mode={unifiedModalMode}
          teamId={selectedTeamId}
          team={teams.find(t => t.id === selectedTeamId) || null}
          teams={teams}
          masterRoster={masterRoster}
        />
      </div>
    </div>
  );
};

export default TeamManagerModal;
