'use client';

import React, { useState, useEffect } from 'react';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { League } from '@/types';
import { UseMutationResult } from '@tanstack/react-query';
import { AGE_GROUPS } from '@/config/gameOptions';

interface LeagueDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  league: League | null;
  updateLeagueMutation: UseMutationResult<League | null, Error, League, unknown>;
  stats?: { games: number; goals: number };
}

const LeagueDetailsModal: React.FC<LeagueDetailsModalProps> = ({
  isOpen,
  onClose,
  league,
  updateLeagueMutation,
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

  // Initialize form when season changes
  useEffect(() => {
    if (league) {
      setName(league.name || '');
      setLocation(league.location || '');
      setAgeGroup(league.ageGroup || '');
      setPeriodCount(league.periodCount);
      setPeriodDuration(league.periodDuration);
      setStartDate(league.startDate || '');
      setEndDate(league.endDate || '');
      setNotes(league.notes || '');
      setArchived(league.archived || false);
    }
  }, [league]);

  const parseIntOrUndefined = (value: string): number | undefined => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
  };

  const handleSave = () => {
    if (!league || !name.trim()) return;

    // Sanitize period values
    const sanitizedPeriodCount = periodCount === 1 || periodCount === 2 ? periodCount : undefined;
    const sanitizedPeriodDuration = periodDuration && periodDuration > 0 ? periodDuration : undefined;

    const updatedSeason: League = {
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
    };

    updateLeagueMutation.mutate(updatedSeason);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen || !league) {
    return null;
  }

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
              {t('seasonDetailsModal.title', 'Season Details')}
            </h2>
          </div>

          {/* Stats Section */}
          {stats && (
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
        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('seasonDetailsModal.nameLabel', 'Season Name')} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('seasonDetailsModal.namePlaceholder', 'Enter season name')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
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
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('seasonDetailsModal.ageGroupLabel', 'Age Group')}
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
            disabled={!name.trim() || updateLeagueMutation.isPending}
            className={primaryButtonStyle}
          >
            {updateLeagueMutation.isPending
              ? t('common.saving', 'Saving...')
              : t('common.save', 'Save')}
          </button>
        </ModalFooter>
      </div>
    </div>
  );
};

export default LeagueDetailsModal;
