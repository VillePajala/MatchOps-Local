'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { Team, Player, Tournament, Season } from '@/types';
import {
  useAddTeamMutation,
  useUpdateTeamMutation,
  useTeamRosterQuery,
  useSetTeamRosterMutation
} from '@/hooks/useTeamQueries';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { getTournaments, updateTeamPlacement as updateTournamentTeamPlacement } from '@/utils/tournaments';
import { getSeasons, updateTeamPlacement as updateSeasonTeamPlacement } from '@/utils/seasons';
import { getSavedGames } from '@/utils/savedGames';
import PlayerSelectionSection from './PlayerSelectionSection';
import logger from '@/utils/logger';
import { AGE_GROUPS } from '@/config/gameOptions';
import { useToast } from '@/contexts/ToastProvider';

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

  // Team details state
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [notes, setNotes] = useState('');
  const [archived, setArchived] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

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

  // Queries for tournaments, seasons, and saved games (when viewing/editing existing team)
  const { data: tournaments = [] } = useQuery<Tournament[]>({
    queryKey: queryKeys.tournaments,
    queryFn: getTournaments,
    enabled: !!teamId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: queryKeys.seasons,
    queryFn: getSeasons,
    enabled: !!teamId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  const { data: savedGames = {} } = useQuery({
    queryKey: queryKeys.savedGames,
    queryFn: getSavedGames,
    enabled: !!teamId,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  // Initialize form when modal opens or team changes
  useEffect(() => {
    if (isOpen) {
      if (mode === 'create') {
        // Reset for create mode
        setName('');
        setAgeGroup('');
        setNotes('');
        setArchived(false);
        setSelectedPlayerIds([]);
        setDuplicateError(null);
        setIsEditingRoster(false);
      } else if (team) {
        // Load existing team data for edit mode
        setName(team.name || '');
        setAgeGroup(team.ageGroup || '');
        setNotes(team.notes || '');
        setArchived(team.archived || false);
        setDuplicateError(null);
        setIsEditingRoster(false);
        // Roster will be loaded via query
      }
    }
  }, [isOpen, mode, team]);

  // Normalizer for robust name comparisons (handles case/diacritics)
  const normalizeName = (value: string | undefined | null) =>
    (value || '').normalize('NFKC').toLowerCase().trim();

  // Pre-select existing roster players when in edit mode
  // Match by name since roster uses team-local IDs, not master roster IDs
  useEffect(() => {
    if (mode === 'edit' && existingRoster.length > 0 && masterRoster.length > 0) {
      const teamPlayerNames = new Set(existingRoster.map(p => normalizeName(p.name)));
      const matchedMasterIds = masterRoster
        .filter(p => teamPlayerNames.has(normalizeName(p.name)))
        .map(p => p.id);
      setSelectedPlayerIds(matchedMasterIds);
    }
  }, [mode, existingRoster, masterRoster]);

  // Clear duplicate error when name changes
  useEffect(() => {
    if (duplicateError) {
      setDuplicateError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

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
  const handlePlacementChange = async (
    type: 'tournament' | 'season',
    id: string,
    placementValue: string
  ) => {
    if (!teamId) return;

    const placement = placementValue === '' ? null : parseInt(placementValue, 10);

    try {
      if (type === 'tournament') {
        await updateTournamentTeamPlacement(id, teamId, placement);
        await queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
      } else {
        await updateSeasonTeamPlacement(id, teamId, placement);
        await queryClient.invalidateQueries({ queryKey: queryKeys.seasons });
      }
      showToast(
        t('unifiedTeamModal.placementUpdated', 'Placement updated successfully'),
        'success'
      );
    } catch (error) {
      logger.error(`Failed to update ${type} placement:`, error);
      showToast(
        t('unifiedTeamModal.placementUpdateFailed', 'Failed to update placement'),
        'error'
      );
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setDuplicateError(t('teamManager.nameRequired', 'Team name is required'));
      return;
    }

    // Check for duplicate team name
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

    try {
      if (mode === 'create') {
        // Create new team (data layer normalizes empty strings to undefined)
        const newTeam = await addTeamMutation.mutateAsync({
          name: trimmedName,
          ageGroup: ageGroup,
          notes: notes,
          archived,
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
            ageGroup: ageGroup,
            notes: notes,
            archived,
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
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
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
        <div className="flex-1 min-h-0 p-6 pb-2 relative z-10 flex flex-col">
          <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6 flex-1 overflow-y-auto">
              <div className="space-y-4">
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
                  </>
                )}

                {/* Roster Section */}
                <div>
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
                          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
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

                      {/* Tournament & Season Placements Section */}
                      {teamId && (teamHistory.tournaments.length > 0 || teamHistory.seasons.length > 0) && (
                        <div className="mt-6">
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
                                    <span className="text-lg">🏆</span>
                                    <span className="text-slate-100 font-medium">{tournament.name}</span>
                                  </div>
                                  <select
                                    value={placement}
                                    onChange={(e) => handlePlacementChange('tournament', tournament.id, e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:ring-indigo-500 focus:border-indigo-500"
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
                                    <span className="text-lg">📅</span>
                                    <span className="text-slate-100 font-medium">{season.name}</span>
                                  </div>
                                  <select
                                    value={placement}
                                    onChange={(e) => handlePlacementChange('season', season.id, e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:ring-indigo-500 focus:border-indigo-500"
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
                  ) : (
                    <>
                      {/* Player Selection - Flexible height to stretch to buttons */}
                      <div className="mb-2 flex flex-col h-[calc(100vh-280px)] min-h-[300px] max-h-[750px]">
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

                      {/* Action Buttons - Always Visible */}
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => setIsEditingRoster(false)}
                          className={secondaryButtonStyle}
                        >
                          {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                          onClick={() => setIsEditingRoster(false)}
                          className={primaryButtonStyle}
                        >
                          {t('common.doneButton', 'Done')}
                        </button>
                      </div>
                    </>
                  )}
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
            disabled={isPending}
            className={primaryButtonStyle}
          >
            {isPending
              ? t('common.saving', 'Saving...')
              : mode === 'create'
              ? t('common.create', 'Create')
              : t('unifiedTeamModal.saveChanges', 'Save Changes')}
          </button>
        </ModalFooter>
      </div>
    </div>
  );
};

export default UnifiedTeamModal;
