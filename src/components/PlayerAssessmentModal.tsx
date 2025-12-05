'use client';

import React, { useState } from 'react';
import { ModalFooter } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import type { Player, PlayerAssessment } from '@/types';
import PlayerAssessmentCard from './PlayerAssessmentCard';

interface PlayerAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlayerIds: string[];
  availablePlayers: Player[];
  assessments: { [id: string]: PlayerAssessment };
  onSave: (playerId: string, assessment: Partial<PlayerAssessment>) => void;
  onDelete?: (playerId: string) => void;
  // Game information
  teamName?: string;
  opponentName?: string;
  gameDate?: string;
  homeScore?: number;
  awayScore?: number;
  homeOrAway?: 'home' | 'away';
  gameLocation?: string;
  gameTime?: string;
  numberOfPeriods?: number;
  periodDurationMinutes?: number;
}

const PlayerAssessmentModal: React.FC<PlayerAssessmentModalProps> = ({
  isOpen,
  onClose,
  selectedPlayerIds,
  availablePlayers,
  assessments,
  onSave,
  onDelete,
  teamName,
  opponentName,
  gameDate,
  homeScore = 0,
  awayScore = 0,
  homeOrAway = 'home',
  gameLocation,
  gameTime,
  numberOfPeriods,
  periodDurationMinutes,
}) => {
  const { t } = useTranslation();
  const [savedIds, setSavedIds] = useState<string[]>([]);

  React.useLayoutEffect(() => {
    if (isOpen) {
      setSavedIds(Object.keys(assessments || {}));
    }
  }, [isOpen, assessments]);

  if (!isOpen) return null;

  const modalContainerStyle =
    'bg-slate-800 rounded-none shadow-xl flex flex-col border-0 overflow-hidden';
  const titleStyle =
    'text-3xl font-bold text-yellow-400 tracking-wide';
  const cardStyle =
    'bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner';
  const buttonBaseStyle =
    'px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';
  const secondaryButtonStyle =
    `${buttonBaseStyle} bg-gradient-to-b from-slate-600 to-slate-700 text-slate-200 hover:from-slate-700 hover:to-slate-600`;

  const getPlayer = (id: string) => availablePlayers.find(p => p.id === id);

  const handleSave = async (playerId: string, assessment: Partial<PlayerAssessment>) => {
    await onSave(playerId, assessment);
    setSavedIds(prev => (prev.includes(playerId) ? prev : [...prev, playerId]));
  };

  const handleDelete = async (playerId: string) => {
    if (!onDelete) return;
    await onDelete(playerId);
    setSavedIds(prev => prev.filter(id => id !== playerId));
  };

  const formatDisplayDate = (isoDate: string): string => {
    if (!isoDate) return t('common.notSet', 'Ei asetettu');
    try {
      if (isoDate.length !== 10) {
        return isoDate;
      }
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) {
          return isoDate;
      }

      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      return `${day}.${month}.${year}`;
    } catch {
      return 'Date Error';
    }
  };

  const displayHomeTeamName = homeOrAway === 'home' ? teamName : opponentName;
  const displayAwayTeamName = homeOrAway === 'home' ? opponentName : teamName;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className={`${modalContainerStyle} bg-noise-texture relative overflow-hidden h-full w-full flex flex-col`}>
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        <div className="relative z-10 flex flex-col min-h-0">
          {/* Header */}
          <div className="flex flex-col">
            {/* Title Section */}
            <div className="flex justify-center items-center pt-10 pb-4 px-4 sm:px-6 backdrop-blur-sm bg-slate-900/20">
              <h2 className={`${titleStyle} drop-shadow-lg`}>
                {t('playerAssessmentModal.title', 'Arvioi pelaajat')}
              </h2>
            </div>

            {/* Fixed Section (Assessment Progress) */}
            <div className="px-4 sm:px-6 pt-1 pb-4 backdrop-blur-sm bg-slate-900/20">
              {/* Assessment Progress */}
              <div className="mb-5 text-center text-sm">
                <div className="flex justify-center items-center text-slate-300">
                  <span>
                    <span className="text-yellow-400 font-semibold">{savedIds.length}/{selectedPlayerIds.length}</span>
                    {" "}{t('playerAssessmentModal.assessed', 'assessed')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
            {/* Game Information Section */}
            {(teamName || opponentName) && (
              <div className={`${cardStyle} mb-4`}>
                <h3 className="text-lg font-semibold text-slate-200 mb-3">
                  {t('gameStatsModal.gameInfoTitle', 'Game Information')}
                </h3>
                <div className="space-y-3">
                  <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-3 rounded-md transition-all">
                    <div className="flex justify-center items-center text-center">
                      <span className="font-semibold text-slate-100 flex-1 text-right">
                        {displayHomeTeamName || 'Home'}
                      </span>
                      <span className="text-2xl text-yellow-400 font-bold mx-4">
                        {homeScore} - {awayScore}
                      </span>
                      <span className="font-semibold text-slate-100 flex-1 text-left">
                        {displayAwayTeamName || 'Away'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {gameDate && (
                      <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-2 rounded-md transition-all">
                        <label className="block text-xs text-slate-400">
                          {t('common.date', 'Date')}
                        </label>
                        <span className="font-medium text-slate-200">
                          {formatDisplayDate(gameDate)}
                        </span>
                      </div>
                    )}
                    {gameTime && (
                      <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-2 rounded-md transition-all">
                        <label className="block text-xs text-slate-400">
                          {t('common.time', 'Time')}
                        </label>
                        <span className="font-medium text-slate-200">
                          {gameTime}
                        </span>
                      </div>
                    )}
                    {gameLocation && (
                      <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-2 rounded-md transition-all">
                        <label className="block text-xs text-slate-400">
                          {t('common.location', 'Location')}
                        </label>
                        <span className="font-medium text-slate-200">
                          {gameLocation}
                        </span>
                      </div>
                    )}
                    {numberOfPeriods && periodDurationMinutes && (
                      <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-2 rounded-md transition-all">
                        <label className="block text-xs text-slate-400">
                          {t('newGameSetupModal.periodsLabel', 'Periods')}
                        </label>
                        <span className="font-medium text-slate-200">
                          {numberOfPeriods} x {periodDurationMinutes} min
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className={cardStyle}>
              <div className="space-y-3">
                {selectedPlayerIds.map((pid) => {
                  const player = getPlayer(pid);
                  if (!player) return null;
                  return (
                    <div
                      key={pid}
                      className="p-4 rounded-lg bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 transition-all"
                    >
                      <PlayerAssessmentCard
                        player={player}
                        isSaved={savedIds.includes(pid)}
                        assessment={assessments[pid]}
                        onSave={(assessment) => handleSave(pid, assessment)}
                        onDelete={onDelete ? () => handleDelete(pid) : undefined}
                      />
                    </div>
                  );
                })}
                {selectedPlayerIds.length === 0 && (
                  <p className="text-slate-300 text-center py-8">
                    {t('playerAssessmentModal.noPlayers', 'No players selected')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <ModalFooter>
            <button onClick={onClose} className={secondaryButtonStyle}>
              {t('common.doneButton', 'Done')}
            </button>
          </ModalFooter>
        </div>
      </div>
    </div>
  );
};

export default PlayerAssessmentModal;
