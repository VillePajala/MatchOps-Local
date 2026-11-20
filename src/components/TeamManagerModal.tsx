'use client';

import { useRememberedListSetting, isBoolean } from '@/hooks/useRememberedListSetting';
import { matchesSearch } from '@/utils/listSearch';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { secondaryButtonStyle, dangerConfirmButtonStyle, primaryButtonStyle, CollapsibleModalHeader, useCollapsingHeader, modalContainerStyle, searchInputStyle, popoverMenuStyle, popoverItemStyle, iconButtonEditStyle, badgeArchivedStyle, dialogContainerStyle, dialogTitleStyle, dialogBodyStyle, warningBoxStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineUsers, // Used in empty state
  HiOutlineEllipsisVertical,
  HiOutlineArchiveBox,
  HiOutlineMagnifyingGlass,
  HiOutlinePlus
} from 'react-icons/hi2';
import { Team, Player, Tournament, Season } from '@/types';
import type { EntityReferences } from '@/interfaces/DataStore';
import { queryKeys } from '@/config/queryKeys';
import {
  updateTeam,
  deleteTeam,
  countGamesForTeam,
  getAllTeamRosters,
  getTeamBoundSeries,
} from '@/utils/teams';
import { useQuery } from '@tanstack/react-query';
import { getTournaments } from '@/utils/tournaments';
import { getSeasons } from '@/utils/seasons';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import logger from '@/utils/logger';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import { useDataStore } from '@/hooks/useDataStore';
import UnifiedTeamModal from './UnifiedTeamModal';
import DeleteBlockedDialog from './DeleteBlockedDialog';
import { useResourceLimit } from '@/hooks/usePremium';
import { useToast } from '@/contexts/ToastProvider';
import { MODAL_BACKDROP, MODAL_BACKDROP_BLOCKING, Z_LAYER } from '@/styles/modalStyles';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

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
  const headerCollapse = useCollapsingHeader();
  const queryClient = useQueryClient();
  const { userId, getStore } = useDataStore();
  const { showToast } = useToast();

  // Premium limit check for team creation (count non-archived teams)
  const activeTeamCount = teams.filter(team => !team.archived).length;
  const { checkAndPrompt: checkTeamLimitAndPrompt } = useResourceLimit('team', activeTeamCount);

  // State management
  const [unifiedModalOpen, setUnifiedModalOpen] = useState(false);
  const [unifiedModalMode, setUnifiedModalMode] = useState<'create' | 'edit'>('create');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  // Remembered on this device (review 7.L10).
  const [showArchived, setShowArchived] = useRememberedListSetting('teams.showArchived', false, isBoolean);
  const archivedTeamCount = useMemo(() => teams.filter((team) => team.archived).length, [teams]);
  const [searchText, setSearchText] = useState('');
  const [actionsMenuTeamId, setActionsMenuTeamId] = useState<string | null>(null);
  const [deleteConfirmTeamId, setDeleteConfirmTeamId] = useState<string | null>(null);
  const [deleteTeamGamesCount, setDeleteTeamGamesCount] = useState<number>(0);
  const [rosterCounts, setRosterCounts] = useState<Record<string, number>>({});
  const [deleteBlockedState, setDeleteBlockedState] = useState<{
    open: boolean;
    entityName: string;
    references: EntityReferences | null;
    teamId: string | null;
  }>({ open: false, entityName: '', references: null, teamId: null });

  // Refs
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [menuPositions, setMenuPositions] = useState<Record<string, boolean>>({});
  const { calculatePosition } = useDropdownPosition();

  // Mutations (user-scoped)
  const deleteTeamMutation = useMutation({
    mutationFn: (teamId: string) => deleteTeam(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] });
      setDeleteConfirmTeamId(null);
      logger.log('[TeamManager] Deleted team');
    },
    onError: (error) => {
      logger.error('[TeamManager] Error deleting team:', error);
      showToast(t('teams.deleteError', 'Failed to delete team. Please try again.'), 'error');
    }
  });

  // Queries for tournaments and seasons (for placement badges, user-scoped)
  const { data: tournaments = [] } = useQuery<Tournament[]>({
    queryKey: [...queryKeys.tournaments, userId],
    queryFn: () => getTournaments(userId),
  });

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: [...queryKeys.seasons, userId],
    queryFn: () => getSeasons(userId),
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
      setDeleteBlockedState({ open: false, entityName: '', references: null, teamId: null });
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

  // Mutations for archive/unarchive (user-scoped)
  const updateTeamMutation = useMutation({
    mutationFn: ({ teamId, updates }: { teamId: string; updates: Partial<Team> }) =>
      updateTeam(teamId, updates, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] });
      logger.log('[TeamManager] Updated team');
    },
    onError: (error) => {
      logger.error('[TeamManager] Error updating team:', error);
      showToast(t('teams.updateError', 'Failed to update team. Please try again.'), 'error');
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
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    // Check if team has references that block deletion
    const store = await getStore();
    const refs = await store.getTeamReferences(teamId);

    if (!refs.canDelete) {
      // Show blocked dialog
      logger.log(`[TeamManager] Delete blocked for team "${team.name}": ${refs.summary}`);
      setDeleteBlockedState({
        open: true,
        entityName: team.name,
        references: refs,
        teamId: teamId,
      });
      setActionsMenuTeamId(null);
      return;
    }

    // Can delete - show normal confirmation
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

  useEscapeToClose(isOpen, onClose, !deleteConfirmTeamId);


  if (!isOpen) return null;

  return (
    <div 
      className={`${MODAL_BACKDROP} ${Z_LAYER.modal}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('teamManager.title', 'Teams')}
    >
      <div className={`${modalContainerStyle} h-full w-full relative`}>

        {/* Chrome slimming: X-header (Done→X); Add Team collapses on scroll. */}
        <CollapsibleModalHeader
          title={t('teamManager.title', 'Teams')}
          onClose={onClose}
          closeLabel={t('common.doneButton', 'Done')}
          collapse={headerCollapse}
        >
          <div className="px-4 pt-2 pb-4">
            <button
              onClick={handleCreateTeam}
              data-testid="tour-add-team"
              className={`${primaryButtonStyle} w-full min-h-[52px] text-base`}
              aria-label={t('teamManager.createNewTeam', 'Create new team')}
            >
              <HiOutlinePlus className="w-5 h-5" aria-hidden="true" />
              {t('teamManager.addTeam', 'Add Team')}
            </button>
          </div>
        </CollapsibleModalHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-3 pb-6" onScroll={headerCollapse.onScroll}>
          {/* Search Field and Show Archived Toggle */}
          <div className="mb-3 relative">
            <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-3" aria-hidden="true" />
            <input
              type="text"
              placeholder={t('teamManager.searchPlaceholder', 'Search teams...')}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              autoComplete="off"
              aria-label={t('teamManager.searchAriaLabel', 'Search teams by name')}
              className={searchInputStyle}
            />
          </div>

          {/* Teams List */}
          {(() => {
            const filteredTeams = [...teams]
              .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
              .filter(team => showArchived || !team.archived)
              // The app's one search (review 7.L6): name, age group, sport (as stored
              // and as shown) and the bound league / tournament.
              .filter(team => matchesSearch(searchText, [
                team.name,
                team.ageGroup,
                team.gameType,
                team.gameType === 'futsal' ? t('common.futsal', 'Futsal') : team.gameType ? t('common.gameTypeSoccer', 'Soccer') : '',
                team.boundSeasonId && seasonMap[team.boundSeasonId] ? getSeasonDisplayName(seasonMap[team.boundSeasonId]) : '',
                team.boundTournamentId && tournamentMap[team.boundTournamentId] ? getTournamentDisplayName(tournamentMap[team.boundTournamentId]) : '',
              ]));

            if (teams.length === 0) {
              return (
                <div className="text-center py-8">
                  <HiOutlineUsers className="w-12 h-12 mx-auto text-ink-3 mb-3" />
                  <p className="font-ui text-ink-2 mb-2">
                    {t('teamManager.noTeams', 'No teams yet. Create your first team to get started.')}
                  </p>
                  <p className="font-ui text-ink-3 text-sm max-w-md mx-auto">
                    {t('teamManager.noTeamsNudge', 'Teams let you reuse a roster and link games to a competition, so your stats add up by team and competition.')}
                  </p>
                </div>
              );
            }

            if (filteredTeams.length === 0) {
              return (
                <div className="text-center py-8">
                  <HiOutlineUsers className="w-12 h-12 mx-auto text-ink-3 mb-3" />
                  <p className="font-ui text-ink-2 mb-4">
                    {searchText
                      ? t('teamManager.noSearchResults', 'No teams match your search for "{{search}}".', { search: searchText })
                      : t('common.allArchived', 'Everything here is archived.')
                    }
                  </p>
                </div>
              );
            }

            // One card per team (owner, 2026-11-20, variant A): kit swatch, the
            // name, ONE meta line, the menu. Separate cards, not one shared
            // box. Not overflow-hidden: that would clip the action menu.
            return (
              <div className="flex flex-col gap-2.5">
                  {filteredTeams.map((team) => {
                    const count = rosterCounts[team.id] || 0;
                    const season = team.boundSeasonId ? seasonMap[team.boundSeasonId] : undefined;
                    const tournament = team.boundTournamentId ? tournamentMap[team.boundTournamentId] : undefined;
                    const series = getTeamBoundSeries(team, tournaments);
                    // "<N> players · <age group> · <competition>": only the
                    // parts the team has, so no dangling separators.
                    const metaRest = [
                      team.ageGroup,
                      team.gameType === 'futsal' ? t('common.gameTypeFutsal', 'Futsal') : null,
                      season ? getSeasonDisplayName(season) : null,
                      tournament ? getTournamentDisplayName(tournament) : null,
                      series ? t(`common.level${series.level}`, series.level) : null,
                    ].filter(Boolean) as string[];
                    const playersText = t('teamManager.playersCount', '{{count}} players', { count });
                    const placements = getTeamPlacements(team.id);
                    return (
                    <div
                      key={team.id}
                      className={`s1-list flex items-center gap-1 py-1.5 pl-1.5 pr-1 font-ui ${team.archived ? 'opacity-60' : ''}`}
                      data-testid={`team-card-${team.id}`}
                    >
                      <button
                        type="button"
                        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl py-1.5 pl-2.5 pr-1 text-left transition-colors hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                        onClick={() => handleEditTeam(team.id)}
                        title={t('teamManager.roster', 'Roster')}
                      >
                        {/* Kit swatch: the team's own colour, set inline. A team
                            without one gets an empty outlined swatch so the
                            names still line up. */}
                        <span
                          aria-hidden="true"
                          className="h-9 w-3.5 flex-none rounded-[5px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.15)]"
                          style={team.color ? { backgroundColor: team.color } : undefined}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-display text-[22px] font-bold leading-[1.1] text-ink">{team.name}</span>
                            {team.archived && (
                              <span className={`${badgeArchivedStyle} shrink-0`}>
                                {t('teamManager.archivedBadge', 'Archived')}
                              </span>
                            )}
                          </span>
                          <span
                            className="mt-0.5 block truncate text-[13px] leading-5 text-ink-3"
                            title={[playersText, ...metaRest].join(' · ')}
                            data-testid={`team-meta-${team.id}`}
                          >
                            <b className="font-semibold text-ink-2">{playersText}</b>
                            {metaRest.length > 0 && ` · ${metaRest.join(' · ')}`}
                          </span>
                          {placements.length > 0 && (
                            <span className="mt-0.5 block truncate text-xs leading-4 text-ink-3">
                              {placements.map((p) => `${p.emoji} ${p.name}`).join(' · ')}
                            </span>
                          )}
                        </span>
                      </button>

                      <div className="relative" ref={actionsMenuTeamId === team.id ? actionsMenuRef : null}>
                        <button
                          onClick={(e) => handleActionsMenuToggle(e, team.id)}
                          className={iconButtonEditStyle}
                          aria-label={t('teamManager.teamActions', 'Team actions')}
                        >
                          <HiOutlineEllipsisVertical className="w-5 h-5" />
                        </button>

                        {actionsMenuTeamId === team.id && (
                          <div className={`${popoverMenuStyle} ${menuPositions[team.id] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                            <button
                              onClick={() => handleEditTeam(team.id)}
                              className={popoverItemStyle}
                            >
                              <HiOutlinePencil className="w-4 h-4" />
                              {t('teamManager.edit', 'Edit')}
                            </button>
                            <button
                              onClick={() => handleToggleArchive(team.id, team.archived || false)}
                              className={popoverItemStyle}
                            >
                              <HiOutlineArchiveBox className="w-4 h-4" />
                              {team.archived
                                ? t('teamManager.unarchive', 'Unarchive')
                                : t('teamManager.archive', 'Archive')}
                            </button>
                            <button
                              onClick={() => handleDeleteTeam(team.id)}
                              className={`${popoverItemStyle} text-red-400! hover:bg-red-500/10!`}
                            >
                              <HiOutlineTrash className="w-4 h-4" />
                              {t('teamManager.delete', 'Delete')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
              </div>
            );
          })()}
          {archivedTeamCount > 0 && (
            // One Show-archived control app-wide (review 7.L7): a link under the list
            // with the count, shown only when something is archived - as in the roster.
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
              data-testid="teams-toggle-archived"
              className="w-full mt-3 min-h-11 font-ui text-sm font-medium text-ink-3 hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-full"
            >
              {showArchived
                ? t('common.hideArchived', 'Hide archived')
                : t('common.showArchivedCount', 'Show archived ({{count}})', { count: archivedTeamCount })}
            </button>
          )}

          {/* Utility action, inline at the bottom of the content (chrome
              slimming): games left behind by deleted teams. */}
          {onManageOrphanedGames && (
            <div className="mt-6 pt-4 border-t border-hairline">
              <button
                onClick={onManageOrphanedGames}
                className={secondaryButtonStyle}
                title={t('teamManager.manageOrphanedGames', 'Manage games from deleted teams')}
              >
                {t('teamManager.orphanedGames', 'Orphaned Games')}
              </button>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirmTeamId && (
          <div className={`${MODAL_BACKDROP_BLOCKING} ${Z_LAYER.modalNested}`}>
            <div className={dialogContainerStyle}>
              <h3 className={`${dialogTitleStyle} mb-4`}>
                {t('common.confirmDelete', 'Are you sure you want to delete this item?')}
              </h3>
              <div className={`${dialogBodyStyle} mb-6 space-y-3`}>
                <p>
                  {t('teamManager.confirmDelete', 
                    'Delete team "{{name}}"?',
                    { name: teams.find(t => t.id === deleteConfirmTeamId)?.name || '' }
                  )}
                </p>
                {deleteTeamGamesCount > 0 && (
                  <div className={warningBoxStyle}>
                    <p className="text-sm font-medium text-ink">
                      {t('teamManager.deleteImpactWarning', 
                        'This will orphan {{count}} game(s). Games will remain but won\'t be associated with this team.',
                        { count: deleteTeamGamesCount }
                      )}
                    </p>
                  </div>
                )}
                {deleteTeamGamesCount === 0 && (
                  <p className="text-ink-3 text-sm">
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
                  className={dangerConfirmButtonStyle}
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

        {/* Delete Blocked Dialog */}
        {deleteBlockedState.references && (
          <DeleteBlockedDialog
            isOpen={deleteBlockedState.open}
            onClose={() => setDeleteBlockedState({ open: false, entityName: '', references: null, teamId: null })}
            entityType="team"
            entityName={deleteBlockedState.entityName}
            references={deleteBlockedState.references}
            onArchive={() => {
              if (deleteBlockedState.teamId) {
                handleToggleArchive(deleteBlockedState.teamId, false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

export default TeamManagerModal;
