'use client';

import React, { useState, useMemo, useId } from 'react';
import { CollapsibleModalHeader, ModalStickyPrimary, ModalSwitch, modalContainerStyle, cardStyle, labelStyle, inputBaseStyle, selectStyle, textareaStyle, inputErrorStyle, segmentTrackStyle, segmentStyle, segmentSelectedStyle, warningBoxStyle, errorBoxStyle, infoBoxStyle, linkStyle } from '@/styles/modalStyles';
import { useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';
import { useTranslation } from 'react-i18next';
import { Tournament, Player, TournamentSeries, GameType, Gender } from '@/types';
import { UseMutationResult, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { getAppSettings, DEFAULT_CLUB_SEASON_START_DATE, DEFAULT_CLUB_SEASON_END_DATE } from '@/utils/appSettings';
import { useDataStore } from '@/hooks/useDataStore';
import { AGE_GROUPS } from '@/config/gameOptions';
import { createLogger } from '@/utils/logger';
import TournamentSeriesManager, { type SeriesUsage } from './TournamentSeriesManager';
import { getSavedGames } from '@/utils/savedGames';
import { getDataStore } from '@/datastore/factory';
import { getClubSeasonForDate } from '@/utils/clubSeason';
import { HiExclamationTriangle } from 'react-icons/hi2';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

const logger = createLogger('TournamentDetailsModal');

interface TournamentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  tournament?: Tournament | null;
  masterRoster: Player[];
  addTournamentMutation?: UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>;
  updateTournamentMutation?: UseMutationResult<Tournament | null, Error, Tournament, unknown>;
  onOpenSettings?: () => void;
}

const TournamentDetailsModal: React.FC<TournamentDetailsModalProps> = ({
  isOpen,
  onClose,
  mode,
  tournament,
  masterRoster,
  addTournamentMutation,
  updateTournamentMutation,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const { userId } = useDataStore();

  // Fetch app settings for club season configuration (user-scoped)
  const { data: settings } = useQuery({
    queryKey: [...queryKeys.settings.detail(), userId],
    queryFn: () => getAppSettings(userId),
    staleTime: Infinity, // Settings rarely change during session
  });

  // Which games and teams use each level (review 7.15), archived teams included -
  // a level they point at must not be removed.
  // Re-read on every open: the check must see games saved since the cache was filled.
  const { data: savedGamesForUsage, isSuccess: gamesUsageLoaded, isError: gamesUsageFailed } = useQuery({
    queryKey: [...queryKeys.savedGames, userId],
    queryFn: () => getSavedGames(userId),
    enabled: isOpen,
    refetchOnMount: 'always',
  });
  const { data: teamsForUsage, isSuccess: teamsUsageLoaded, isError: teamsUsageFailed } = useQuery({
    queryKey: [...queryKeys.teams, userId, 'withArchived'],
    queryFn: async () => (await getDataStore(userId)).getTeams(true),
    enabled: isOpen,
    refetchOnMount: 'always',
  });
  const seriesUsage = useMemo<SeriesUsage>(() => {
    const usage: SeriesUsage = {};
    const bump = (id: string | undefined, field: 'games' | 'teams') => {
      if (!id) return;
      usage[id] = usage[id] ?? { games: 0, teams: 0 };
      usage[id][field] += 1;
    };
    for (const game of Object.values(savedGamesForUsage ?? {})) bump(game?.tournamentSeriesId, 'games');
    for (const team of teamsForUsage ?? []) bump(team.boundTournamentSeriesId, 'teams');
    return usage;
  }, [savedGamesForUsage, teamsForUsage]);

  // Form state
  useEscapeToClose(isOpen, onClose);
  const modalTitleId = useId();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [level, setLevel] = useState('');
  const [series, setSeries] = useState<TournamentSeries[]>([]);
  const [periodCount, setPeriodCount] = useState<number | undefined>(undefined);
  const [periodDuration, setPeriodDuration] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [awardedPlayerId, setAwardedPlayerId] = useState<string | undefined>(undefined);
  const [archived, setArchived] = useState(false);
  const [gameType, setGameType] = useState<GameType>('soccer');
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Compute club season from start date using configured season boundaries
  const calculatedClubSeason = useMemo(() => {
    if (!startDate) return null;
    const result = getClubSeasonForDate(
      startDate,
      settings?.clubSeasonStartDate || DEFAULT_CLUB_SEASON_START_DATE,
      settings?.clubSeasonEndDate || DEFAULT_CLUB_SEASON_END_DATE
    );
    return result !== 'off-season' ? result : null;
  }, [startDate, settings?.clubSeasonStartDate, settings?.clubSeasonEndDate]);

  // Initialize form when tournament changes or modal opens
  React.useLayoutEffect(() => {
    if (isOpen) {
      if (mode === 'create') {
        // Reset form for create mode
        setName('');
        setLocation('');
        setAgeGroup('');
        setLevel('');
        setSeries([]);
        setPeriodCount(undefined);
        setPeriodDuration(undefined);
        setStartDate('');
        setEndDate('');
        setNotes('');
        setAwardedPlayerId(undefined);
        setArchived(false);
        setGameType('soccer');
        setGender(undefined);
        setErrorMessage(null);
      } else if (tournament) {
        // Load existing tournament data for edit mode
        setName(tournament.name || '');
        setLocation(tournament.location || '');
        setAgeGroup(tournament.ageGroup || '');
        setLevel(tournament.level || '');
        // Migrate legacy level to series if needed
        // This is a one-way migration: once saved, legacy level field is cleared
        // and series becomes the source of truth. Data is preserved, not lost.
        if (tournament.series && tournament.series.length > 0) {
          setSeries(tournament.series);
        } else if (tournament.level) {
          // Auto-migrate legacy level to series for UI display
          logger.info('Migrating legacy tournament level to series format', {
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            legacyLevel: tournament.level,
          });
          setSeries([{
            id: `series_${tournament.id}_${tournament.level.toLowerCase().replace(/\s+/g, '-')}`,
            level: tournament.level,
          }]);
        } else {
          setSeries([]);
        }
        setPeriodCount(tournament.periodCount);
        setPeriodDuration(tournament.periodDuration);
        setStartDate(tournament.startDate || '');
        setEndDate(tournament.endDate || '');
        setNotes(tournament.notes || '');
        setAwardedPlayerId(tournament.awardedPlayerId);
        setArchived(tournament.archived || false);
        setGameType(tournament.gameType || 'soccer');
        setGender(tournament.gender);
        setErrorMessage(null);
      }
    }
  }, [mode, tournament, isOpen]);

  const parseIntOrUndefined = (value: string): number | undefined => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
  };

  const handleSave = () => {
    if (!name.trim()) return;

    // Sanitize period values
    const sanitizedPeriodCount = periodCount === 1 || periodCount === 2 ? periodCount : undefined;
    const sanitizedPeriodDuration = periodDuration && periodDuration > 0 ? periodDuration : undefined;

    if (mode === 'create') {
      // Create new tournament
      if (!addTournamentMutation) return;

      // Level/series are both optional - valid scenarios:
      // - No level, no series: casual/friendly tournament
      // - Level only: single-level tournament (legacy or simple)
      // - Series only: multi-level tournament (new format)
      const newTournament: Partial<Tournament> & { name: string } = {
        name: name.trim(),
        location: location.trim() || undefined,
        ageGroup: ageGroup || undefined,
        // Clear legacy level field when series is present (series is now source of truth)
        level: series.length > 0 ? undefined : (level || undefined),
        series: series.length > 0 ? series : undefined,
        periodCount: sanitizedPeriodCount,
        periodDuration: sanitizedPeriodDuration,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        notes: notes.trim() || undefined,
        awardedPlayerId: awardedPlayerId || undefined,
        archived,
        gameType,
        gender,
      };

      addTournamentMutation.mutate(newTournament, {
        onSuccess: (result) => {
          if (result) {
            onClose();
          } else {
            setErrorMessage(
              t('tournamentDetailsModal.errors.duplicateName', 'A tournament with this name already exists. Please choose a different name.')
            );
          }
        },
        onError: () => {
          setErrorMessage(t('tournamentDetailsModal.errors.createFailed', 'Failed to create tournament. Please try again.'));
        }
      });
    } else {
      // Update existing tournament
      if (!tournament || !updateTournamentMutation) return;

      // Log when legacy level is being migrated to series format on save
      if (tournament.level && series.length > 0) {
        logger.info('Completing legacy level migration on save', {
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          legacyLevel: tournament.level,
          newSeriesCount: series.length,
          seriesLevels: series.map(s => s.level),
        });
      }

      const updatedTournament: Tournament = {
        ...tournament,
        name: name.trim(),
        location: location.trim() || undefined,
        ageGroup: ageGroup || undefined,
        // Clear legacy level field when series is present (series is now source of truth)
        // This is intentional one-way migration - data is preserved in series array
        level: series.length > 0 ? undefined : (level || undefined),
        series: series.length > 0 ? series : undefined,
        periodCount: sanitizedPeriodCount,
        periodDuration: sanitizedPeriodDuration,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        notes: notes.trim() || undefined,
        awardedPlayerId: awardedPlayerId || undefined,
        archived,
        gameType,
        gender,
      };

      updateTournamentMutation.mutate(updatedTournament, {
        onSuccess: (result) => {
          if (result) {
            onClose();
          } else {
            setErrorMessage(
              t('tournamentDetailsModal.errors.duplicateName', 'A tournament with this name already exists. Please choose a different name.')
            );
          }
        },
        onError: () => {
          setErrorMessage(t('tournamentDetailsModal.errors.updateFailed', 'Failed to update tournament. Please try again.'));
        }
      });
    }
  };

  const handleCancel = () => {
    onClose();
  };

  // Cancel THIS nested dialog on hardware back instead of falling through to the
  // parent manager. A PREEMPTIVE sub-guard so back#1 cancels the dialog and
  // back#2 still reaches the manager's sentinel - no fragile re-arm-after-a-back
  // (which fails on Android WebViews and would exit the app on back#2).
  useHardwareBackSubLevel(isOpen, handleCancel);

  if (!isOpen) {
    return null;
  }

  const isPending = mode === 'create' ? addTournamentMutation?.isPending : updateTournamentMutation?.isPending;

  return (
    <div className={`${MODAL_BACKDROP} ${Z_LAYER.modalNested}`} role="dialog" aria-modal="true" aria-labelledby={modalTitleId}>
      <div className={`${modalContainerStyle} h-full w-full relative`}>

        {/* Chrome slimming: X-header (Cancel) + sticky Save. */}
        <CollapsibleModalHeader
          titleId={modalTitleId}
          title={mode === 'create'
                ? t('tournamentDetailsModal.createTitle', 'Create Tournament')
                : tournament?.name || t('tournamentDetailsModal.editTitle', 'Edit Tournament')}
          onClose={handleCancel}
          closeLabel={t('common.cancel', 'Cancel')}
        />

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-3 pb-6">
          <div className={cardStyle}>
            <div className="space-y-5">
              {/* Season Dates Not Configured Warning */}
              {settings && !settings.hasConfiguredSeasonDates && (
                <div className={warningBoxStyle}>
                  <div className="flex items-start gap-2">
                    <HiExclamationTriangle className="w-5 h-5 text-action flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="flex-1">
                      <p className="font-ui text-ink text-sm font-medium">
                        {t('tournamentDetailsModal.seasonDatesNotConfigured', 'Season dates not configured')}
                      </p>
                      <p className="font-ui text-ink-2 text-sm mt-1">
                        {t('tournamentDetailsModal.configureInSettings', 'Configure in Settings to calculate club seasons correctly.')}
                      </p>
                      {onOpenSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenSettings();
                          }}
                          className={`${linkStyle} mt-2 inline-flex min-h-11 items-center text-sm`}
                        >
                          {t('common.openSettings', 'Open Settings')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className={`${errorBoxStyle} font-ui text-sm text-ink`} role="alert">
                  {errorMessage}
                </div>
              )}

              {/* Name */}
              <div>
                <label className={labelStyle}>
                  {t('tournamentDetailsModal.nameLabel', 'Tournament Name')} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    // Clear error when user starts typing
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder={t('tournamentDetailsModal.namePlaceholder', 'Enter tournament name')}
                  className={`${inputBaseStyle} ${errorMessage ? inputErrorStyle : ''}`}
                  required
                />
              </div>

              {/* Location */}
              <div>
                <label className={labelStyle}>
                  {t('tournamentDetailsModal.locationLabel', 'Location')}
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t('tournamentDetailsModal.locationPlaceholder', 'Enter location')}
                  className={inputBaseStyle}
                />
              </div>

              {/* Age Group */}
              <div>
                <label className={labelStyle}>
                  {t('tournamentDetailsModal.ageGroupLabel', 'Age Group')}
                </label>
                <select
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  className={selectStyle}
                >
                  <option value="">{t('common.selectAgeGroup', '-- Select Age Group --')}</option>
                  {AGE_GROUPS.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>

              {/* Sport Type (Soccer/Futsal) */}
              <div>
                <label className={labelStyle}>
                  {t('common.gameTypeLabel', 'Sport Type')}
                </label>
                <div className={segmentTrackStyle}>
                  <button
                    type="button"
                    onClick={() => setGameType('soccer')}
                    aria-pressed={gameType === 'soccer'}
                    className={gameType === 'soccer' ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.gameTypeSoccer', 'Soccer')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGameType('futsal')}
                    aria-pressed={gameType === 'futsal'}
                    className={gameType === 'futsal' ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.gameTypeFutsal', 'Futsal')}
                  </button>
                </div>
              </div>

              {/* Gender (Boys/Girls) */}
              <div>
                <label className={labelStyle}>
                  {t('common.genderLabel', 'Gender')}
                </label>
                <div className={segmentTrackStyle}>
                  <button
                    type="button"
                    onClick={() => setGender(undefined)}
                    aria-pressed={gender === undefined}
                    className={gender === undefined ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.genderNotSet', 'Not Set')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('boys')}
                    aria-pressed={gender === 'boys'}
                    className={gender === 'boys' ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.genderBoys', 'Boys')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('girls')}
                    aria-pressed={gender === 'girls'}
                    className={gender === 'girls' ? segmentSelectedStyle : segmentStyle}
                  >
                    {t('common.genderGirls', 'Girls')}
                  </button>
                </div>
              </div>

              {/* Tournament Series */}
              <TournamentSeriesManager
                series={series}
                onSeriesChange={setSeries}
                seriesUsage={seriesUsage}
                usageReady={gamesUsageLoaded && teamsUsageLoaded}
              />
              {(gamesUsageFailed || teamsUsageFailed) && (
                // Removal stays off (fail closed); say why rather than leave dead buttons.
                <p className="font-ui text-[13px] text-ink-3 -mt-2" data-testid="series-usage-failed">
                  {t('errors.failedToLoadData', 'Failed to load data. Some features may not be available.')}
                </p>
              )}

              {/* Start Date and End Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>
                    {t('tournamentDetailsModal.startDateLabel', 'Start Date')}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={inputBaseStyle}
                  />
                </div>
                <div>
                  <label className={labelStyle}>
                    {t('tournamentDetailsModal.endDateLabel', 'End Date')}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={inputBaseStyle}
                  />
                </div>
              </div>

              {/* Club Season (auto-calculated) */}
              {calculatedClubSeason && (
                <div className={`${infoBoxStyle} p-3.5! font-ui`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-2">
                      {t('tournamentDetailsModal.clubSeasonLabel', 'Season')}:
                    </span>
                    <span className="text-[15px] font-semibold text-ink">{calculatedClubSeason}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-ink-3">
                    {t('tournamentDetailsModal.clubSeasonHint', 'Auto-calculated from start date. Usually your club\'s operating season.')}
                  </p>
                </div>
              )}

              {/* Period Count and Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>
                    {t('tournamentDetailsModal.periodCountLabel', 'Periods')}
                  </label>
                  <input
                    type="number"
                    value={periodCount || ''}
                    onChange={(e) => setPeriodCount(parseIntOrUndefined(e.target.value))}
                    placeholder={t('tournamentDetailsModal.periodCountPlaceholder', 'e.g., 2')}
                    className={inputBaseStyle}
                  />
                </div>
                <div>
                  <label className={labelStyle}>
                    {t('tournamentDetailsModal.periodDurationLabel', 'Minutes')}
                  </label>
                  <input
                    type="number"
                    value={periodDuration || ''}
                    onChange={(e) => setPeriodDuration(parseIntOrUndefined(e.target.value))}
                    placeholder={t('tournamentDetailsModal.periodDurationPlaceholder', 'e.g., 20')}
                    className={inputBaseStyle}
                  />
                </div>
              </div>

              {/* Player of Tournament Award */}
              <div>
                <label className={labelStyle}>
                  {t('tournamentDetailsModal.awardedPlayerLabel', 'Player of Tournament')}
                </label>
                <select
                  value={awardedPlayerId || ''}
                  onChange={(e) => setAwardedPlayerId(e.target.value || undefined)}
                  className={selectStyle}
                  aria-label={t('tournaments.selectAwardWinner', '-- Select Player of Tournament --')}
                >
                  <option value="">{t('tournaments.selectAwardWinner', '-- Select Player of Tournament --')}</option>
                  {masterRoster.map(player => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className={labelStyle}>
                  {t('tournamentDetailsModal.notesLabel', 'Notes')}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('tournamentDetailsModal.notesPlaceholder', 'Enter any notes')}
                  rows={3}
                  className={textareaStyle}
                />
              </div>

              {/* Archived */}
              <ModalSwitch checked={archived} onToggle={() => setArchived(v => !v)}>
                {t('tournamentDetailsModal.archivedLabel', 'Archived')}
              </ModalSwitch>
            </div>
          </div>
        </div>

        {/* Footer */}
        <ModalStickyPrimary onClick={handleSave} disabled={!name.trim() || isPending}>
          {isPending
            ? t('common.saving', 'Saving...')
            : mode === 'create'
            ? t('common.create', 'Create')
            : t('common.save', 'Save')}
        </ModalStickyPrimary>
      </div>
    </div>
  );
};

export default TournamentDetailsModal;
