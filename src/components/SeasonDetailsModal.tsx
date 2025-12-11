'use client';

import React, { useState } from 'react';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { Season, GameType, Gender } from '@/types';
import { UseMutationResult } from '@tanstack/react-query';
import { AGE_GROUPS } from '@/config/gameOptions';
import { FINNISH_YOUTH_LEAGUES, CUSTOM_LEAGUE_ID } from '@/config/leagues';

interface SeasonDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  season?: Season | null;
  addSeasonMutation?: UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>;
  updateSeasonMutation?: UseMutationResult<Season | null, Error, Season, unknown>;
  stats?: { games: number; goals: number };
}

const SeasonDetailsModal: React.FC<SeasonDetailsModalProps> = ({
  isOpen,
  onClose,
  mode,
  season,
  addSeasonMutation,
  updateSeasonMutation,
  stats,
}) => {
  const { t } = useTranslation();

  // Form state
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [periodCount, setPeriodCount] = useState<number | undefined>(undefined);
  const [periodDuration, setPeriodDuration] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [archived, setArchived] = useState(false);
  const [leagueId, setLeagueId] = useState('');
  const [customLeagueName, setCustomLeagueName] = useState('');
  const [gameType, setGameType] = useState<GameType>('soccer');
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize form when season changes or modal opens
  React.useLayoutEffect(() => {
    if (isOpen) {
      if (mode === 'create') {
        // Reset form for create mode
        setName('');
        setLocation('');
        setAgeGroup('');
        setPeriodCount(undefined);
        setPeriodDuration(undefined);
        setStartDate('');
        setEndDate('');
        setNotes('');
        setArchived(false);
        setLeagueId('');
        setCustomLeagueName('');
        setGameType('soccer');
        setGender(undefined);
        setErrorMessage(null);
      } else if (season) {
        // Load existing season data for edit mode
        setName(season.name || '');
        setLocation(season.location || '');
        setAgeGroup(season.ageGroup || '');
        setPeriodCount(season.periodCount);
        setPeriodDuration(season.periodDuration);
        setStartDate(season.startDate || '');
        setEndDate(season.endDate || '');
        setNotes(season.notes || '');
        setArchived(season.archived || false);
        setLeagueId(season.leagueId || '');
        setCustomLeagueName(season.customLeagueName || '');
        setGameType(season.gameType || 'soccer');
        setGender(season.gender);
        setErrorMessage(null);
      }
    }
  }, [mode, season, isOpen]);

  const parseIntOrUndefined = (value: string): number | undefined => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
  };

  const handleSave = () => {
    if (!name.trim()) return;

    // Validate custom league name if "Muu" is selected
    const trimmedCustomLeague = customLeagueName.trim();
    if (leagueId === CUSTOM_LEAGUE_ID) {
      if (trimmedCustomLeague.length === 0) {
        setErrorMessage(t('seasonDetailsModal.errors.customLeagueRequired', 'Please enter a custom league name or select a different league.'));
        return;
      }
      if (trimmedCustomLeague.length < 2) {
        setErrorMessage(t('seasonDetailsModal.errors.customLeagueTooShort', 'Custom league name must be at least 2 characters.'));
        return;
      }
    }

    // Sanitize period values
    const sanitizedPeriodCount = periodCount === 1 || periodCount === 2 ? periodCount : undefined;
    const sanitizedPeriodDuration = periodDuration && periodDuration > 0 ? periodDuration : undefined;

    if (mode === 'create') {
      // Create new season
      if (!addSeasonMutation) return;

      const newSeason: Partial<Season> & { name: string } = {
        name: name.trim(),
        location: location.trim() || undefined,
        ageGroup: ageGroup || undefined,
        periodCount: sanitizedPeriodCount,
        periodDuration: sanitizedPeriodDuration,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        notes: notes.trim() || undefined,
        archived,
        leagueId: leagueId || undefined,
        customLeagueName: leagueId === CUSTOM_LEAGUE_ID ? trimmedCustomLeague || undefined : undefined,
        gameType,
        gender,
      };

      addSeasonMutation.mutate(newSeason, {
        onSuccess: (result) => {
          if (result) {
            onClose();
          } else {
            setErrorMessage(
              t('seasonDetailsModal.errors.duplicateName', 'A season with this name already exists. Please choose a different name.')
            );
          }
        },
        onError: (error) => {
          setErrorMessage(error.message || t('seasonDetailsModal.errors.createFailed', 'Failed to create season. Please try again.'));
        }
      });
    } else {
      // Update existing season
      if (!season || !updateSeasonMutation) return;

      const updatedSeason: Season = {
        ...season,
        name: name.trim(),
        location: location.trim() || undefined,
        ageGroup: ageGroup || undefined,
        periodCount: sanitizedPeriodCount,
        periodDuration: sanitizedPeriodDuration,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        notes: notes.trim() || undefined,
        archived,
        leagueId: leagueId || undefined,
        customLeagueName: leagueId === CUSTOM_LEAGUE_ID ? trimmedCustomLeague || undefined : undefined,
        gameType,
        gender,
      };

      updateSeasonMutation.mutate(updatedSeason, {
        onSuccess: (result) => {
          if (result) {
            onClose();
          } else {
            setErrorMessage(
              t('seasonDetailsModal.errors.duplicateName', 'A season with this name already exists. Please choose a different name.')
            );
          }
        },
        onError: (error) => {
          setErrorMessage(error.message || t('seasonDetailsModal.errors.updateFailed', 'Failed to update season. Please try again.'));
        }
      });
    }
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  const isPending = mode === 'create' ? addSeasonMutation?.isPending : updateSeasonMutation?.isPending;

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
                ? t('seasonDetailsModal.createTitle', 'Create Season')
                : season?.name || t('seasonDetailsModal.editTitle', 'Season Details')}
            </h2>
          </div>

          {/* Stats Section - Only show in edit mode */}
          {mode === 'edit' && stats && (
            <div className="px-6 pt-1 pb-4 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20">
              <div className="mb-2 text-center text-sm">
                <div className="flex justify-center items-center gap-6 text-slate-300">
                  <span>
                    <span className="text-yellow-400 font-semibold">{stats.games}</span>
                    {" "}{stats.games === 1
                      ? t('seasonDetailsModal.gameSingular', 'Game')
                      : t('seasonDetailsModal.games', 'Games')}
                  </span>
                  <span>
                    <span className="text-yellow-400 font-semibold">{stats.goals}</span>
                    {" "}{stats.goals === 1
                      ? t('seasonDetailsModal.goalSingular', 'Goal')
                      : t('seasonDetailsModal.goals', 'Goals')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
          <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6">
            <div className="space-y-3">
              {/* Error Message */}
              {errorMessage && (
                <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-md text-sm">
                  {errorMessage}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('seasonDetailsModal.nameLabel', 'Season Name')} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    // Clear error when user starts typing
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder={t('seasonDetailsModal.namePlaceholder', 'Enter season name')}
                  className={`w-full px-3 py-2 bg-slate-700 border rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500 ${
                    errorMessage ? 'border-red-500' : 'border-slate-600'
                  }`}
                  required
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('seasonDetailsModal.locationLabel', 'Location')}
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t('seasonDetailsModal.locationPlaceholder', 'Enter location')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Age Group */}
              <div>
                <label htmlFor="season-age-group" className="block text-sm font-medium text-slate-300 mb-1">
                  {t('seasonDetailsModal.ageGroupLabel', 'Age Group')}
                </label>
                <select
                  id="season-age-group"
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">{t('common.selectAgeGroup', '-- Select Age Group --')}</option>
                  {AGE_GROUPS.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>

              {/* Sport Type (Soccer/Futsal) */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('common.gameTypeLabel', 'Sport Type')}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGameType('soccer')}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      gameType === 'soccer'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.gameTypeSoccer', 'Soccer')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGameType('futsal')}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      gameType === 'futsal'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.gameTypeFutsal', 'Futsal')}
                  </button>
                </div>
              </div>

              {/* Gender (Boys/Girls) */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('common.genderLabel', 'Gender')}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGender(undefined)}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      gender === undefined
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.genderNotSet', 'Not Set')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('boys')}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      gender === 'boys'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.genderBoys', 'Boys')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('girls')}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                      gender === 'girls'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('common.genderGirls', 'Girls')}
                  </button>
                </div>
              </div>

              {/* League Selection */}
              <div>
                <label htmlFor="season-league" className="block text-sm font-medium text-slate-300 mb-1">
                  {t('seasonDetailsModal.leagueLabel', 'League')}
                </label>
                <select
                  id="season-league"
                  value={leagueId}
                  onChange={(e) => {
                    setLeagueId(e.target.value);
                    // Clear custom name when selecting a non-custom league
                    if (e.target.value !== 'muu') setCustomLeagueName('');
                  }}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">{t('seasonDetailsModal.selectLeague', '-- Select League --')}</option>
                  {FINNISH_YOUTH_LEAGUES.map(league => (
                    <option key={league.id} value={league.id}>{league.name}</option>
                  ))}
                </select>
              </div>

              {/* Custom League Name - shown when "Muu" selected */}
              {leagueId === CUSTOM_LEAGUE_ID && (
                <div>
                  <label htmlFor="season-custom-league" className="block text-sm font-medium text-slate-300 mb-1">
                    {t('seasonDetailsModal.customLeagueLabel', 'Custom League Name')}
                  </label>
                  <input
                    id="season-custom-league"
                    type="text"
                    value={customLeagueName}
                    onChange={(e) => setCustomLeagueName(e.target.value)}
                    placeholder={t('seasonDetailsModal.customLeaguePlaceholder', 'Enter league name')}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Start Date and End Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {t('seasonDetailsModal.startDateLabel', 'Start Date')}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {t('seasonDetailsModal.endDateLabel', 'End Date')}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Period Count and Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {t('seasonDetailsModal.periodCountLabel', 'Periods')}
                  </label>
                  <input
                    type="number"
                    value={periodCount || ''}
                    onChange={(e) => setPeriodCount(parseIntOrUndefined(e.target.value))}
                    placeholder={t('seasonDetailsModal.periodCountPlaceholder', 'e.g., 2')}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {t('seasonDetailsModal.periodDurationLabel', 'Minutes')}
                  </label>
                  <input
                    type="number"
                    value={periodDuration || ''}
                    onChange={(e) => setPeriodDuration(parseIntOrUndefined(e.target.value))}
                    placeholder={t('seasonDetailsModal.periodDurationPlaceholder', 'e.g., 20')}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('seasonDetailsModal.notesLabel', 'Notes')}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('seasonDetailsModal.notesPlaceholder', 'Enter any notes')}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
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
                  {t('seasonDetailsModal.archivedLabel', 'Archived')}
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

export default SeasonDetailsModal;
