'use client';

import React, { useState } from 'react';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { Tournament, Player, TournamentSeries } from '@/types';
import { UseMutationResult } from '@tanstack/react-query';
import { AGE_GROUPS, LEVELS } from '@/config/gameOptions';
import type { TranslationKey } from '@/i18n-types';

interface TournamentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  tournament?: Tournament | null;
  masterRoster: Player[];
  addTournamentMutation?: UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>;
  updateTournamentMutation?: UseMutationResult<Tournament | null, Error, Tournament, unknown>;
  stats?: { games: number; goals: number };
}

const TournamentDetailsModal: React.FC<TournamentDetailsModalProps> = ({
  isOpen,
  onClose,
  mode,
  tournament,
  masterRoster,
  addTournamentMutation,
  updateTournamentMutation,
  stats,
}) => {
  const { t } = useTranslation();

  // Form state
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Series management UI state
  const [isAddingNewSeries, setIsAddingNewSeries] = useState(false);
  const [newSeriesLevel, setNewSeriesLevel] = useState('');

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
        setErrorMessage(null);
        setIsAddingNewSeries(false);
        setNewSeriesLevel('');
      } else if (tournament) {
        // Load existing tournament data for edit mode
        setName(tournament.name || '');
        setLocation(tournament.location || '');
        setAgeGroup(tournament.ageGroup || '');
        setLevel(tournament.level || '');
        // Migrate legacy level to series if needed
        if (tournament.series && tournament.series.length > 0) {
          setSeries(tournament.series);
        } else if (tournament.level) {
          // Auto-migrate legacy level to series for UI display
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
        setErrorMessage(null);
        setIsAddingNewSeries(false);
        setNewSeriesLevel('');
      }
    }
  }, [mode, tournament, isOpen]);

  const parseIntOrUndefined = (value: string): number | undefined => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
  };

  // Series management functions
  const handleAddSeries = () => {
    // Validate level is from allowed list (dropdown enforces this, but defensive check)
    if (!newSeriesLevel || !LEVELS.includes(newSeriesLevel)) return;
    // Generate unique ID - crypto.randomUUID available in all browsers supporting IndexedDB
    let uniquePart: string;
    try {
      uniquePart = crypto.randomUUID().slice(0, 8);
    } catch {
      // Fallback for edge cases (shouldn't happen in supported browsers)
      uniquePart = Math.random().toString(36).substring(2, 10);
    }
    const newSeries: TournamentSeries = {
      id: `series_${Date.now()}_${uniquePart}`,
      level: newSeriesLevel,
    };
    setSeries([...series, newSeries]);
    setNewSeriesLevel('');
    setIsAddingNewSeries(false);
  };

  const handleRemoveSeries = (seriesId: string) => {
    setSeries(series.filter(s => s.id !== seriesId));
  };

  // Get available levels (exclude already selected)
  const availableLevels = LEVELS.filter(lvl => !series.some(s => s.level === lvl));

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
        onError: (error) => {
          setErrorMessage(error.message || t('tournamentDetailsModal.errors.createFailed', 'Failed to create tournament. Please try again.'));
        }
      });
    } else {
      // Update existing tournament
      if (!tournament || !updateTournamentMutation) return;

      const updatedTournament: Tournament = {
        ...tournament,
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
        onError: (error) => {
          setErrorMessage(error.message || t('tournamentDetailsModal.errors.updateFailed', 'Failed to update tournament. Please try again.'));
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

  const isPending = mode === 'create' ? addTournamentMutation?.isPending : updateTournamentMutation?.isPending;

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
                ? t('tournamentDetailsModal.createTitle', 'Create Tournament')
                : tournament?.name || t('tournamentDetailsModal.editTitle', 'Tournament Details')}
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
                      ? t('tournamentDetailsModal.gameSingular', 'Game')
                      : t('tournamentDetailsModal.games', 'Games')}
                  </span>
                  <span>
                    <span className="text-yellow-400 font-semibold">{stats.goals}</span>
                    {" "}{stats.goals === 1
                      ? t('tournamentDetailsModal.goalSingular', 'Goal')
                      : t('tournamentDetailsModal.goals', 'Goals')}
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
                  className={`w-full px-3 py-2 bg-slate-700 border rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500 ${
                    errorMessage ? 'border-red-500' : 'border-slate-600'
                  }`}
                  required
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('tournamentDetailsModal.locationLabel', 'Location')}
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t('tournamentDetailsModal.locationPlaceholder', 'Enter location')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Age Group */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('tournamentDetailsModal.ageGroupLabel', 'Age Group')}
                </label>
                <select
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

              {/* Tournament Series */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('tournamentDetailsModal.seriesLabel', 'Series (Competition Levels)')}
                </label>

                {/* Display existing series */}
                {series.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {series.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-1 bg-slate-600 px-2 py-1 rounded-md text-sm"
                      >
                        <span>{t(`common.level${s.level}` as TranslationKey, s.level)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSeries(s.id)}
                          className="text-slate-400 hover:text-red-400 ml-1"
                          aria-label={`${t('tournamentDetailsModal.removeSeries', 'Remove series')}: ${t(`common.level${s.level}` as TranslationKey, s.level)}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new series UI */}
                {isAddingNewSeries ? (
                  <div className="flex gap-2">
                    <select
                      value={newSeriesLevel}
                      onChange={(e) => setNewSeriesLevel(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                      aria-label={t('tournamentDetailsModal.selectLevelForNewSeries', 'Select level for new series')}
                    >
                      <option value="">{t('common.selectLevel', '-- Select Level --')}</option>
                      {LEVELS.map(lvl => (
                        <option
                          key={lvl}
                          value={lvl}
                          disabled={series.some(s => s.level === lvl)}
                        >
                          {t(`common.level${lvl}` as TranslationKey, lvl)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddSeries}
                      disabled={!newSeriesLevel}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-md text-sm"
                      aria-label={t('tournamentDetailsModal.confirmAddSeries', 'Confirm add series')}
                    >
                      {t('common.add', 'Add')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewSeries(false);
                        setNewSeriesLevel('');
                      }}
                      className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-sm"
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingNewSeries(true)}
                    disabled={availableLevels.length === 0}
                    className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-md text-sm"
                    aria-label={t('tournamentDetailsModal.addSeries', 'Add series')}
                  >
                    + {t('tournamentDetailsModal.addSeries', 'Add Series')}
                  </button>
                )}
              </div>

              {/* Start Date and End Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {t('tournamentDetailsModal.startDateLabel', 'Start Date')}
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
                    {t('tournamentDetailsModal.endDateLabel', 'End Date')}
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
                    {t('tournamentDetailsModal.periodCountLabel', 'Periods')}
                  </label>
                  <input
                    type="number"
                    value={periodCount || ''}
                    onChange={(e) => setPeriodCount(parseIntOrUndefined(e.target.value))}
                    placeholder={t('tournamentDetailsModal.periodCountPlaceholder', 'e.g., 2')}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {t('tournamentDetailsModal.periodDurationLabel', 'Minutes')}
                  </label>
                  <input
                    type="number"
                    value={periodDuration || ''}
                    onChange={(e) => setPeriodDuration(parseIntOrUndefined(e.target.value))}
                    placeholder={t('tournamentDetailsModal.periodDurationPlaceholder', 'e.g., 20')}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Player of Tournament Award */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('tournamentDetailsModal.awardedPlayerLabel', 'Player of Tournament')}
                </label>
                <select
                  value={awardedPlayerId || ''}
                  onChange={(e) => setAwardedPlayerId(e.target.value || undefined)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                  aria-label={t('tournaments.selectAwardWinner', 'Select Player of Tournament')}
                >
                  <option value="">{t('tournaments.selectAwardWinner', '-- Select Player of Tournament --')}</option>
                  {masterRoster.map(player => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('tournamentDetailsModal.notesLabel', 'Notes')}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('tournamentDetailsModal.notesPlaceholder', 'Enter any notes')}
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
                  {t('tournamentDetailsModal.archivedLabel', 'Archived')}
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

export default TournamentDetailsModal;
