'use client';

import React, { useState, useMemo } from 'react';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle, ModalAmbientGlows } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { Team, Player, Tournament, Season } from '@/types';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import {
  useAddTeamMutation,
  useUpdateTeamMutation,
  useTeamRosterQuery,
  useSetTeamRosterMutation
} from '@/hooks/useTeamQueries';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { getTournaments, updateTeamPlacement as updateTournamentTeamPlacement } from '@/utils/tournaments';
import { getSeasons, updateTeamPlacement as updateSeasonTeamPlacement } from '@/utils/seasons';
import { getSavedGames } from '@/utils/savedGames';
import PlayerSelectionSection from './PlayerSelectionSection';
import logger from '@/utils/logger';
import { AGE_GROUPS } from '@/config/gameOptions';
import { useToast } from '@/contexts/ToastProvider';
import { useDataStore } from '@/hooks/useDataStore';

interface UnifiedTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  teamId?: string | null;
  team?: Team | null;
  teams: Team[]; // For duplicate validation
  masterRoster: Player[];
}

const UnifiedTeamModal: React.FC<UnifiedTeamModalProps> = ({
  isOpen,
  onClose,
  mode,
  teamId,
  team,
  teams,
  masterRoster,
}) => {
  const { t } = useTranslation();
  const { userId } = useDataStore();

  // Team details state
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [notes, setNotes] = useState('');
  const [archived, setArchived] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Context binding state (for differentiating teams with same name)
  // Note: Empty strings used for form control; converted to undefined on save (see handleSave)
  const [boundSeasonId, setBoundSeasonId] = useState<string>('');
  const [boundTournamentId, setBoundTournamentId] = useState<string>('');
  const [boundTournamentSeriesId, setBoundTournamentSeriesId] = useState<string>('');
  const [gameType, setGameType] = useState<'soccer' | 'futsal' | ''>('');
  const [activeTab, setActiveTab] = useState<'none' | 'season' | 'tournament'>('none');

  // Roster state
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [isEditingRoster, setIsEditingRoster] = useState(false);

  // Mutations
  const addTeamMutation = useAddTeamMutation();
  const updateTeamMutation = useUpdateTeamMutation();
  const setTeamRosterMutation = useSetTeamRosterMutation();

  // Query client for cache invalidation
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Query for existing roster (edit mode only)
  const { data: existingRoster = [] } = useTeamRosterQuery(teamId || null);

  // Queries for tournaments and seasons (needed for context binding selectors)
  // Note: Loading states omitted intentionally - IndexedDB queries complete in <10ms
  // Adding spinners would cause unnecessary UI flicker for no user benefit
  const { data: tournaments = [] } = useQuery<Tournament[]>({
    queryKey: [...queryKeys.tournaments, userId],
    queryFn: () => getTournaments(userId),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: [...queryKeys.seasons, userId],
    queryFn: () => getSeasons(userId),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  const { data: savedGames = {} } = useQuery({
    queryKey: [...queryKeys.savedGames, userId],
    queryFn: () => getSavedGames(userId),
    enabled: !!teamId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  // Initialize form when modal opens or team changes
  React.useLayoutEffect(() => {
    if (isOpen) {
      if (mode === 'create') {
        // Reset for create mode
        setName('');
        setAgeGroup('');
        setNotes('');
        setArchived(false);
        setBoundSeasonId('');
        setBoundTournamentId('');
        setBoundTournamentSeriesId('');
        setGameType('');
        setActiveTab('none');
        setSelectedPlayerIds([]);
        setDuplicateError(null);
        setIsEditingRoster(false);
      } else if (team) {
        // Load existing team data for edit mode
        setName(team.name || '');
        setAgeGroup(team.ageGroup || '');
        setNotes(team.notes || '');
        setArchived(team.archived || false);
        setBoundSeasonId(team.boundSeasonId || '');
        setBoundTournamentId(team.boundTournamentId || '');
        setBoundTournamentSeriesId(team.boundTournamentSeriesId || '');
        setGameType(team.gameType || '');
        // Set activeTab based on existing bindings
        if (team.boundSeasonId) {
          setActiveTab('season');
        } else if (team.boundTournamentId) {
          setActiveTab('tournament');
        } else {
          setActiveTab('none');
        }
        setDuplicateError(null);
        setIsEditingRoster(false);
        // Roster will be loaded via query
      }
    }
  }, [isOpen, mode, team]);

  // Pre-select existing roster players when in edit mode
  // Match by ID since team roster stores the same player IDs as master roster
  React.useLayoutEffect(() => {
    if (mode === 'edit' && existingRoster.length > 0 && masterRoster.length > 0) {
      const teamPlayerIds = new Set(existingRoster.map(p => p.id));
      const matchedMasterIds = masterRoster
        .filter(p => teamPlayerIds.has(p.id))
        .map(p => p.id);
      setSelectedPlayerIds(matchedMasterIds);
    }
  }, [mode, existingRoster, masterRoster]);

  // Clear duplicate error when name or context changes
  React.useLayoutEffect(() => {
    if (duplicateError) {
      setDuplicateError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, boundSeasonId, boundTournamentId, gameType]);

  // Get the selected season/tournament for auto-inheritance
  const selectedSeason = boundSeasonId ? seasons.find(s => s.id === boundSeasonId) : null;
  const selectedTournament = boundTournamentId ? tournaments.find(t => t.id === boundTournamentId) : null;

  // Derived gameType from association (for display purposes)
  const inheritedGameType = selectedSeason?.gameType || selectedTournament?.gameType;
  const hasAssociation = !!boundSeasonId || !!boundTournamentId;

  // Sort seasons by startDate (newest first), then by name for consistent dropdown order
  const sortedSeasons = useMemo(() => {
    return [...seasons]
      .filter(s => !s.archived)
      .sort((a, b) => {
        // Sort by startDate descending (newest first), nulls last
        if (a.startDate && b.startDate) {
          const dateCompare = b.startDate.localeCompare(a.startDate);
          if (dateCompare !== 0) return dateCompare;
        } else if (a.startDate) {
          return -1;
        } else if (b.startDate) {
          return 1;
        }
        // Secondary sort by name
        return a.name.localeCompare(b.name);
      });
  }, [seasons]);

  // Sort tournaments by startDate (newest first), then by name for consistent dropdown order
  const sortedTournaments = useMemo(() => {
    return [...tournaments]
      .filter(t => !t.archived)
      .sort((a, b) => {
        // Sort by startDate descending (newest first), nulls last
        if (a.startDate && b.startDate) {
          const dateCompare = b.startDate.localeCompare(a.startDate);
          if (dateCompare !== 0) return dateCompare;
        } else if (a.startDate) {
          return -1;
        } else if (b.startDate) {
          return 1;
        }
        // Secondary sort by name
        return a.name.localeCompare(b.name);
      });
  }, [tournaments]);

  // Handle tab change - clears the other binding
  const handleTabChange = (tab: 'none' | 'season' | 'tournament') => {
    setActiveTab(tab);
    if (tab === 'none') {
      setBoundSeasonId('');
      setBoundTournamentId('');
      setBoundTournamentSeriesId('');
    } else if (tab === 'season') {
      setBoundTournamentId('');
      setBoundTournamentSeriesId('');
    } else if (tab === 'tournament') {
      setBoundSeasonId('');
    }
  };

  // Handle season selection - inherits properties
  const handleSeasonChange = (seasonId: string) => {
    setBoundSeasonId(seasonId);

    if (seasonId) {
      const season = seasons.find(s => s.id === seasonId);
      if (season) {
        // Inherit gameType from season
        if (season.gameType) {
          setGameType(season.gameType);
        }
        // Prefill ageGroup from season (only if not already set)
        if (season.ageGroup && !ageGroup) {
          setAgeGroup(season.ageGroup);
        }
      }
    }
  };

  // Handle tournament selection - inherits properties
  const handleTournamentChange = (tournamentId: string) => {
    setBoundTournamentId(tournamentId);
    // Clear series when tournament changes (series belong to specific tournament)
    setBoundTournamentSeriesId('');

    if (tournamentId) {
      const tournament = tournaments.find(t => t.id === tournamentId);
      if (tournament) {
        // Inherit gameType from tournament
        if (tournament.gameType) {
          setGameType(tournament.gameType);
        }
        // Prefill ageGroup from tournament (only if not already set)
        if (tournament.ageGroup && !ageGroup) {
          setAgeGroup(tournament.ageGroup);
        }
      }
    }
  };

  // Mutation for updating team placement with optimistic updates (user-scoped)
  const updatePlacementMutation = useMutation({
    mutationFn: async ({
      type,
      id,
      teamId,
      placement
    }: {
      type: 'tournament' | 'season';
      id: string;
      teamId: string;
      placement: number | null;
    }) => {
      if (type === 'tournament') {
        return await updateTournamentTeamPlacement(id, teamId, placement, undefined, undefined, userId);
      } else {
        return await updateSeasonTeamPlacement(id, teamId, placement, undefined, undefined, userId);
      }
    },
    onMutate: async ({ type, id, teamId: mutationTeamId, placement }) => {
      const queryKey = type === 'tournament' ? [...queryKeys.tournaments, userId] : [...queryKeys.seasons, userId];

      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value for rollback
      const previousData = queryClient.getQueryData(queryKey);

      // Optimistically update the cache
      queryClient.setQueryData(queryKey, (old: Tournament[] | Season[] | undefined) => {
        if (!old) return old;

        return old.map((item) => {
          if (item.id !== id) return item;

          // Update the placement for this team
          const updatedItem = { ...item };
          if (placement === null) {
            // Remove placement
            if (updatedItem.teamPlacements) {
               
              const { [mutationTeamId]: _removed, ...rest } = updatedItem.teamPlacements;
              updatedItem.teamPlacements = Object.keys(rest).length > 0 ? rest : undefined;
            }
          } else {
            // Set or update placement
            updatedItem.teamPlacements = {
              ...updatedItem.teamPlacements,
              [mutationTeamId]: {
                placement,
                ...(updatedItem.teamPlacements?.[mutationTeamId]?.award && {
                  award: updatedItem.teamPlacements[mutationTeamId].award
                }),
                ...(updatedItem.teamPlacements?.[mutationTeamId]?.note && {
                  note: updatedItem.teamPlacements[mutationTeamId].note
                }),
              },
            };
          }

          return updatedItem;
        });
      });

      // Return context with previous data for rollback
      return { previousData, queryKey };
    },
    onError: (error, variables, context) => {
      // Rollback to previous data on error
      if (context?.previousData && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }

      logger.error(`Failed to update ${variables.type} placement:`, error);
      showToast(
        t('unifiedTeamModal.placementUpdateFailed', 'Failed to update placement'),
        'error'
      );
    },
    onSuccess: (data, variables) => {
      // Refetch to ensure we have the latest server data
      const queryKey = variables.type === 'tournament' ? [...queryKeys.tournaments, userId] : [...queryKeys.seasons, userId];
      queryClient.invalidateQueries({ queryKey });

      showToast(
        t('unifiedTeamModal.placementUpdated', 'Placement updated successfully'),
        'success'
      );
    },
  });

  // Calculate tournaments/seasons where this team has played games OR has a placement assigned
  const teamHistory = useMemo(() => {
    if (!teamId) return { tournaments: [], seasons: [] };

    const teamTournaments = tournaments.filter(t => {
      // Show if team has games in this tournament OR has a placement assigned
      const hasGames = Object.values(savedGames).some(game =>
        game.teamId === teamId && game.tournamentId === t.id
      );
      const hasPlacement = !!t.teamPlacements?.[teamId];
      return hasGames || hasPlacement;
    });

    const teamSeasons = seasons.filter(s => {
      // Show if team has games in this season OR has a placement assigned
      const hasGames = Object.values(savedGames).some(game =>
        game.teamId === teamId && game.seasonId === s.id
      );
      const hasPlacement = !!s.teamPlacements?.[teamId];
      return hasGames || hasPlacement;
    });

    return { tournaments: teamTournaments, seasons: teamSeasons };
  }, [teamId, tournaments, seasons, savedGames]);

  // Handler for updating team placement in tournaments/seasons
  const handlePlacementChange = (
    type: 'tournament' | 'season',
    id: string,
    placementValue: string
  ) => {
    if (!teamId) return;

    const placement = placementValue === '' ? null : parseInt(placementValue, 10);

    updatePlacementMutation.mutate({
      type,
      id,
      teamId,
      placement,
    });
  };

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setDuplicateError(t('teamManager.nameRequired', 'Team name is required'));
      return;
    }

    // Check for duplicate using composite key (name + context bindings)
    // Teams with same name can exist if they have different context
    const normalizedName = trimmedName.toLowerCase();
    const existingTeam = teams.find(t => {
      if (t.id === team?.id) return false; // Skip self in edit mode
      if (t.name.toLowerCase() !== normalizedName) return false;
      // Names match - check if context also matches (would be duplicate)
      const sameSeasonBinding = (t.boundSeasonId || '') === boundSeasonId;
      const sameTournamentBinding = (t.boundTournamentId || '') === boundTournamentId;
      const sameGameType = (t.gameType || '') === gameType;
      return sameSeasonBinding && sameTournamentBinding && sameGameType;
    });

    if (existingTeam) {
      setDuplicateError(
        t('teamManager.duplicateNameError',
          'A team with this name and context already exists. Change the name or select different context.',
          { name: existingTeam.name }
        )
      );
      return;
    }

    try {
      if (mode === 'create') {
        // Create new team (data layer normalizes empty strings to undefined)
        const newTeam = await addTeamMutation.mutateAsync({
          name: trimmedName,
          ageGroup: ageGroup || undefined,
          notes: notes || undefined,
          archived,
          boundSeasonId: boundSeasonId || undefined,
          boundTournamentId: boundTournamentId || undefined,
          boundTournamentSeriesId: boundTournamentSeriesId || undefined,
          gameType: gameType || undefined,
        });

        // Set roster if players were selected
        if (selectedPlayerIds.length > 0 && newTeam) {
          const rosterPlayers = masterRoster.filter(p => selectedPlayerIds.includes(p.id));
          await setTeamRosterMutation.mutateAsync({
            teamId: newTeam.id,
            roster: rosterPlayers,
          });
        }
      } else {
        // Update existing team (data layer normalizes empty strings to undefined)
        if (!team) return;

        await updateTeamMutation.mutateAsync({
          teamId: team.id,
          updates: {
            name: trimmedName,
            ageGroup: ageGroup || undefined,
            notes: notes || undefined,
            archived,
            boundSeasonId: boundSeasonId || undefined,
            boundTournamentId: boundTournamentId || undefined,
            boundTournamentSeriesId: boundTournamentSeriesId || undefined,
            gameType: gameType || undefined,
          },
        });

        // Update roster
        const rosterPlayers = masterRoster.filter(p => selectedPlayerIds.includes(p.id));
        await setTeamRosterMutation.mutateAsync({
          teamId: team.id,
          roster: rosterPlayers,
        });
      }

      onClose();
    } catch (error) {
      logger.error('Failed to save team:', error);
      // Error is handled by React Query and displayed via toast in parent component
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const isPending = addTeamMutation.isPending || updateTeamMutation.isPending || setTeamRosterMutation.isPending;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-[70] font-display">
      <ModalAmbientGlows />
      <div className="bg-slate-800 flex flex-col h-full w-full lg:max-w-2xl lg:max-h-[calc(100vh-1rem)] lg:rounded-xl bg-noise-texture relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50 pointer-events-none" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50 pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 flex-shrink-0">
          <div className="flex justify-center items-center pt-10 pb-4 backdrop-blur-sm bg-slate-900/20">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">
              {mode === 'create'
                ? t('unifiedTeamModal.createTitle', 'Create Team')
                : team?.name || t('unifiedTeamModal.editTitle', 'Edit Team')}
            </h2>
          </div>

          {/* Player Counter */}
          <div className="px-6 pb-4 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20">
            <div className="text-center text-sm">
              <div className="flex justify-center items-center text-slate-300">
                <span>
                  <span className="text-yellow-400 font-semibold">{selectedPlayerIds.length}</span>
                  {" "}{selectedPlayerIds.length === 1
                    ? t('unifiedTeamModal.playerSingular', 'Pelaaja')
                    : t('unifiedTeamModal.playerPlural', 'Pelaajaa')
                  }
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className={`flex-1 min-h-0 p-6 ${isEditingRoster ? 'pb-4' : 'pb-2'} relative z-10 flex flex-col`}
        >
          <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6 flex-1 overflow-y-auto">
              <div className={`space-y-4 ${isEditingRoster ? 'flex flex-col h-full' : ''}`}>
                {!isEditingRoster && (
                  <>
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

                    {/* Age Group */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        {t('teamDetailsModal.ageGroupLabel', 'Age Group')}
                      </label>
                      <select
                        value={ageGroup}
                        onChange={(e) => setAgeGroup(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">{t('teamDetailsModal.selectAgeGroup', '-- Select Age Group --')}</option>
                        {AGE_GROUPS.map((ag) => (
                          <option key={ag} value={ag}>
                            {ag}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Team Context Section */}
                    <div className="border-t border-slate-600 pt-4 mt-2">
                      <h4 className="text-sm font-medium text-slate-300 mb-2">
                        {t('teamDetailsModal.contextSection', 'Team Context')}
                      </h4>

                      {/* Tab buttons - same style as NewGameSetupModal */}
                      <div className="flex gap-2 mb-3">
                        <button
                          type="button"
                          onClick={() => handleTabChange('none')}
                          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            activeTab === 'none'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {t('gameSettingsModal.eiMitaan', 'None')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTabChange('season')}
                          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            activeTab === 'season'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {t('gameSettingsModal.kausi', 'Season')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTabChange('tournament')}
                          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            activeTab === 'tournament'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {t('gameSettingsModal.turnaus', 'Tournament')}
                        </button>
                      </div>

                      {/* Season Selection */}
                      {activeTab === 'season' && (
                        <div className="mb-3">
                          <select
                            value={boundSeasonId}
                            onChange={(e) => handleSeasonChange(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="">{t('newGameSetupModal.selectSeason', '-- Select Season --')}</option>
                            {sortedSeasons.map((s) => (
                              <option key={s.id} value={s.id}>
                                {getSeasonDisplayName(s)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Tournament Selection */}
                      {activeTab === 'tournament' && (
                        <div className="mb-3">
                          <select
                            value={boundTournamentId}
                            onChange={(e) => handleTournamentChange(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="">{t('newGameSetupModal.selectTournament', '-- Select Tournament --')}</option>
                            {sortedTournaments.map((tourn) => (
                              <option key={tourn.id} value={tourn.id}>
                                {getTournamentDisplayName(tourn)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Tournament Series Selection - only show if tournament has series */}
                      {activeTab === 'tournament' && boundTournamentId && selectedTournament?.series && selectedTournament.series.length > 0 && (
                        <div className="mb-3">
                          <label htmlFor="boundTournamentSeriesSelect" className="block text-xs font-medium text-slate-400 mb-1">
                            {t('teamDetailsModal.seriesLabel', 'Series')}
                          </label>
                          <select
                            id="boundTournamentSeriesSelect"
                            value={boundTournamentSeriesId}
                            onChange={(e) => setBoundTournamentSeriesId(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="">{t('teamDetailsModal.selectSeries', '-- Select Series --')}</option>
                            {selectedTournament.series.map((series) => (
                              <option key={series.id} value={series.id}>
                                {t(`common.level${series.level}`, series.level)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Game Type - inherited from association or manual selection */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          {t('teamDetailsModal.gameTypeLabel', 'Game Type')}
                          {hasAssociation && inheritedGameType && (
                            <span className="ml-2 text-slate-500">
                              ({t('teamDetailsModal.inheritedFromAssociation', 'from association')})
                            </span>
                          )}
                        </label>
                        {hasAssociation && inheritedGameType ? (
                          // Show inherited value as read-only
                          <div className="w-full px-3 py-2 text-sm bg-slate-600 border border-slate-500 rounded-md text-slate-300">
                            {inheritedGameType === 'soccer' ? t('common.gameTypeSoccer', 'Soccer') : t('common.gameTypeFutsal', 'Futsal')}
                          </div>
                        ) : (
                          // Manual selection when no association
                          <select
                            value={gameType}
                            onChange={(e) => setGameType(e.target.value as 'soccer' | 'futsal' | '')}
                            className="w-full px-3 py-2 text-sm bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="">{t('teamDetailsModal.anyGameType', '-- Any --')}</option>
                            <option value="soccer">{t('common.gameTypeSoccer', 'Soccer')}</option>
                            <option value="futsal">{t('common.gameTypeFutsal', 'Futsal')}</option>
                          </select>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-slate-300">
                          {t('teamDetailsModal.notesLabel', 'Notes')}
                        </label>
                        <span className="text-xs text-slate-400">
                          {notes.length}/1000
                        </span>
                      </div>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t('teamDetailsModal.notesPlaceholder', 'Enter team notes or description')}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                        rows={3}
                        maxLength={1000}
                      />
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

                    {/* Tournament & Season Placements Section */}
                    {teamId && (teamHistory.tournaments.length > 0 || teamHistory.seasons.length > 0) && (
                      <div className="mt-2">
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          {t('unifiedTeamModal.placementsTitle', 'Tournament & Season Placements')} ({teamHistory.tournaments.length + teamHistory.seasons.length})
                        </label>

                        <div className="space-y-3">
                          {/* Tournaments */}
                          {teamHistory.tournaments.map((tournament) => {
                            const placement = tournament.teamPlacements?.[teamId!]?.placement || '';
                            return (
                              <div
                                key={tournament.id}
                                className="p-4 rounded-lg transition-all bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40"
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg" aria-hidden="true">🏆</span>
                                  <span className="text-slate-100 font-medium">
                                    {getTournamentDisplayName(tournament)}
                                  </span>
                                </div>
                                <select
                                  value={placement}
                                  onChange={(e) => handlePlacementChange('tournament', tournament.id, e.target.value)}
                                  disabled={updatePlacementMutation.isPending}
                                  aria-label={`Tournament placement for ${tournament.name}`}
                                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <option value="">{t('unifiedTeamModal.selectPlacement', 'Select placement...')}</option>
                                  <option value="1">{t('unifiedTeamModal.placement1st', '1st Place 🥇')}</option>
                                  <option value="2">{t('unifiedTeamModal.placement2nd', '2nd Place 🥈')}</option>
                                  <option value="3">{t('unifiedTeamModal.placement3rd', '3rd Place 🥉')}</option>
                                  <option value="4">{t('unifiedTeamModal.placement4th', '4th Place')}</option>
                                  <option value="5">{t('unifiedTeamModal.placement5th', '5th Place')}</option>
                                  <option value="6">{t('unifiedTeamModal.placement6th', '6th Place')}</option>
                                  <option value="7">{t('unifiedTeamModal.placement7th', '7th Place')}</option>
                                  <option value="8">{t('unifiedTeamModal.placement8th', '8th Place')}</option>
                                  <option value="9">{t('unifiedTeamModal.placement9th', '9th Place')}</option>
                                  <option value="10">{t('unifiedTeamModal.placement10th', '10th Place')}</option>
                                </select>
                              </div>
                            );
                          })}

                          {/* Seasons */}
                          {teamHistory.seasons.map((season) => {
                            const placement = season.teamPlacements?.[teamId!]?.placement || '';
                            return (
                              <div
                                key={season.id}
                                className="p-4 rounded-lg transition-all bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40"
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg" aria-hidden="true">📅</span>
                                  <span className="text-slate-100 font-medium">
                                    {getSeasonDisplayName(season)}
                                  </span>
                                </div>
                                <select
                                  value={placement}
                                  onChange={(e) => handlePlacementChange('season', season.id, e.target.value)}
                                  disabled={updatePlacementMutation.isPending}
                                  aria-label={`Season placement for ${season.name}`}
                                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <option value="">{t('unifiedTeamModal.selectPlacement', 'Select placement...')}</option>
                                  <option value="1">{t('unifiedTeamModal.placement1st', '1st Place 🥇')}</option>
                                  <option value="2">{t('unifiedTeamModal.placement2nd', '2nd Place 🥈')}</option>
                                  <option value="3">{t('unifiedTeamModal.placement3rd', '3rd Place 🥉')}</option>
                                  <option value="4">{t('unifiedTeamModal.placement4th', '4th Place')}</option>
                                  <option value="5">{t('unifiedTeamModal.placement5th', '5th Place')}</option>
                                  <option value="6">{t('unifiedTeamModal.placement6th', '6th Place')}</option>
                                  <option value="7">{t('unifiedTeamModal.placement7th', '7th Place')}</option>
                                  <option value="8">{t('unifiedTeamModal.placement8th', '8th Place')}</option>
                                  <option value="9">{t('unifiedTeamModal.placement9th', '9th Place')}</option>
                                  <option value="10">{t('unifiedTeamModal.placement10th', '10th Place')}</option>
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Roster Section */}
                <div className={isEditingRoster ? 'flex flex-col flex-1 min-h-0' : ''}>
                  {!isEditingRoster ? (
                    <>
                      {/* Roster Header */}
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-300">
                          {t('unifiedTeamModal.roster', 'Roster')} ({selectedPlayerIds.length})
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsEditingRoster(true)}
                          className={`${secondaryButtonStyle} px-3 py-1 text-xs`}
                        >
                          {t('unifiedTeamModal.editRoster', 'Edit Roster')} →
                        </button>
                      </div>

                      {/* Player List */}
                      <div className="space-y-3">
                        {selectedPlayerIds.length === 0 ? (
                          <div className="text-center py-4 text-slate-400 text-sm">
                            {t('unifiedTeamModal.noPlayersSelected', 'No players selected. Click "Edit Roster" to add players.')}
                          </div>
                        ) : (
                          masterRoster
                            .filter(p => selectedPlayerIds.includes(p.id))
                            .map((player) => (
                              <div
                                key={player.id}
                                className="p-4 rounded-lg transition-all bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-base text-slate-100">
                                    {player.name}
                                    {player.nickname ? <span className="text-slate-400"> ({player.nickname})</span> : ''}
                                  </span>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Player Selection - Flexible height to stretch to buttons */}
                      <div className="flex-1 min-h-0 flex flex-col">
                        <PlayerSelectionSection
                          availablePlayers={masterRoster}
                          selectedPlayerIds={selectedPlayerIds}
                          onSelectedPlayersChange={setSelectedPlayerIds}
                          title={t('unifiedTeamModal.selectPlayers', 'Select Players for Team')}
                          playersSelectedText={t('teamRosterModal.selected', 'selected')}
                          selectAllText={t('teamRosterModal.selectAll', 'Select All')}
                          noPlayersText={t('teamRosterModal.noAvailablePlayers', 'No available players to add from master roster.')}
                          disabled={isPending}
                          useFlexHeight={true}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
        </div>

        {/* Footer */}
        <ModalFooter>
          {isEditingRoster ? (
            <>
              <button onClick={() => setIsEditingRoster(false)} className={secondaryButtonStyle}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button onClick={() => setIsEditingRoster(false)} className={primaryButtonStyle}>
                {t('common.doneButton', 'Done')}
              </button>
            </>
          ) : (
            <>
              <button onClick={handleCancel} className={secondaryButtonStyle}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className={primaryButtonStyle}
              >
                {isPending
                  ? t('common.saving', 'Saving...')
                  : mode === 'create'
                  ? t('common.create', 'Create')
                  : t('unifiedTeamModal.saveChanges', 'Save Changes')}
              </button>
            </>
          )}
        </ModalFooter>
      </div>
    </div>
  );
};

export default UnifiedTeamModal;
