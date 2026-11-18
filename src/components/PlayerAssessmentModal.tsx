'use client';

import { sortPlayersByLastName } from '@/utils/gamePlayerList';
import React, { useState, useEffect } from 'react';
import { CollapsibleModalHeader, useCollapsingHeader, modalContainerStyle, groupedListStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import type { Player, PlayerAssessment } from '@/types';
import type { AssessmentRatingStyle, AssessmentTemplate } from '@/types/settings';
import PlayerAssessmentCard from './PlayerAssessmentCard';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { formatAppDate } from '@/utils/localeFormat';

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
  ratingStyle?: AssessmentRatingStyle;
  assessmentTemplate?: AssessmentTemplate;
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
  ratingStyle = 'words',
  assessmentTemplate = 'balanced',
}) => {
  const { t } = useTranslation();
  const headerCollapse = useCollapsingHeader();
  const [savedIds, setSavedIds] = useState<string[]>([]);

  React.useLayoutEffect(() => {
    if (isOpen) {
      setSavedIds(Object.keys(assessments || {}));
    }
  }, [isOpen, assessments]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
    if (!isoDate) return t('common.notSet', 'Not Set');
    try {
      if (isoDate.length !== 10) {
        return isoDate;
      }
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) {
          return isoDate;
      }

      return formatAppDate(date);
    } catch {
      return 'Date Error';
    }
  };

  const displayHomeTeamName = homeOrAway === 'home' ? teamName : opponentName;
  const displayAwayTeamName = homeOrAway === 'home' ? opponentName : teamName;

  const players = sortPlayersByLastName(selectedPlayerIds.map(getPlayer).filter((p): p is Player => !!p));
  const progressPct = selectedPlayerIds.length > 0 ? Math.min(100, (savedIds.length / selectedPlayerIds.length) * 100) : 0;

  return (
    <div className={`${MODAL_BACKDROP} ${Z_LAYER.modal}`} role="dialog" aria-modal="true" aria-label={t('playerAssessment.title', 'Player Assessments')}>
      <div className={`${modalContainerStyle} relative overflow-hidden h-full w-full flex flex-col`}>
        <div className="relative z-10 flex flex-col min-h-0 h-full">
          {/* Chrome slimming: X-header; progress counter collapses on scroll. */}
          <CollapsibleModalHeader
            title={t('playerAssessmentModal.title', 'Record Performance')}
            onClose={onClose}
            closeLabel={t('common.doneButton', 'Done')}
            collapse={headerCollapse}
          >
            <div className="px-5 pt-1 pb-4">
              <div className="flex items-center gap-3 font-ui text-xs font-semibold uppercase tracking-[0.14em] text-ink-3 whitespace-nowrap">
                <span>
                  <b className="font-bold text-action">{savedIds.length}/{selectedPlayerIds.length}</b>
                  {" "}{t('playerAssessmentModal.assessed', 'assessed')}
                </span>
                <div className="flex-1 h-1 rounded bg-white/[0.08] overflow-hidden" aria-hidden="true">
                  <div className="h-full rounded bg-action" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            </div>
          </CollapsibleModalHeader>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-3 pb-6 font-ui" onScroll={headerCollapse.onScroll}>
            {/* Game Information: one quiet hero card, the score the only big numeral */}
            {(teamName || opponentName) && (
              <div className="s1-hero s1-hero-quiet px-[18px] pt-[18px] pb-4 mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
                  {t('gameStatsModal.gameInfoTitle', 'Game Information')}
                </h3>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-3 mb-3.5">
                  <span className="font-display text-[23px] font-bold leading-[1.05] text-ink">
                    {displayHomeTeamName || 'Home'}
                  </span>
                  <span className="s1-numeral pr-[0.08em] font-display text-[46px] font-extrabold italic leading-[0.9]">
                    {homeScore}-{awayScore}
                  </span>
                  <span className="font-display text-[23px] font-bold leading-[1.05] text-ink text-right">
                    {displayAwayTeamName || 'Away'}
                  </span>
                </div>
                <dl className="grid grid-cols-[1.35fr_1fr] gap-x-3.5 border-t border-hairline">
                  {gameDate && (
                    <div className="pt-2.5">
                      <dt className="text-xs text-ink-3">{t('common.date', 'Date')}</dt>
                      <dd className="text-[15px] font-semibold text-ink">{formatDisplayDate(gameDate)}</dd>
                    </div>
                  )}
                  {gameTime && (
                    <div className="pt-2.5">
                      <dt className="text-xs text-ink-3">{t('common.time', 'Time')}</dt>
                      <dd className="text-[15px] font-semibold text-ink">{gameTime}</dd>
                    </div>
                  )}
                  {gameLocation && (
                    <div className="pt-2.5">
                      <dt className="text-xs text-ink-3">{t('common.location', 'Location')}</dt>
                      <dd className="text-[15px] font-semibold text-ink">{gameLocation}</dd>
                    </div>
                  )}
                  {numberOfPeriods && periodDurationMinutes && (
                    <div className="pt-2.5">
                      <dt className="text-xs text-ink-3">{t('newGameSetupModal.periodsLabel', 'Periods')}</dt>
                      <dd className="text-[15px] font-semibold text-ink">{numberOfPeriods} x {periodDurationMinutes} min</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
            {/* The squad in the app's one player order (review 7.L5) - this followed
                the order players were ticked in. One list, a row per player. */}
            {players.length > 0 && (
              <div className={groupedListStyle}>
                {players.map((player) => {
                  const pid = player.id;
                  return (
                    <PlayerAssessmentCard
                      key={pid}
                      player={player}
                      isSaved={savedIds.includes(pid)}
                      assessment={assessments[pid]}
                      onSave={(assessment) => handleSave(pid, assessment)}
                      onDelete={onDelete ? () => handleDelete(pid) : undefined}
                      ratingStyle={ratingStyle}
                      assessmentTemplate={assessmentTemplate}
                    />
                  );
                })}
              </div>
            )}
            {selectedPlayerIds.length === 0 && (
              <p className="text-ink-2 text-center py-8">
                {t('playerAssessmentModal.noPlayers', 'No players selected')}
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default PlayerAssessmentModal;
