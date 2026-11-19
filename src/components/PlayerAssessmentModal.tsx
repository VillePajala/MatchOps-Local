'use client';

import { sortPlayersByLastName } from '@/utils/gamePlayerList';
import React, { useState, useEffect } from 'react';
import { CollapsibleModalHeader, useCollapsingHeader, modalContainerStyle, groupedListStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import type { Player, PlayerAssessment } from '@/types';
import type { AssessmentRatingStyle, AssessmentTemplate } from '@/types/settings';
import PlayerAssessmentCard from './PlayerAssessmentCard';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { appLocale } from '@/utils/localeFormat';

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
  ratingStyle = 'words',
  assessmentTemplate = 'balanced',
}) => {
  const { t, i18n } = useTranslation();
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

  // "26.9." / "26/09": the year adds nothing to the one-line summary. A
  // YYYY-MM-DD date is read as a local calendar day; anything else is shown as is.
  const formatShortDate = (isoDate: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    if (!m) return isoDate;
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(date.getTime())) return isoDate;
    return date.toLocaleDateString(appLocale(i18n.language), { day: 'numeric', month: 'numeric' });
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
            {/* The match in one line, teams in scoreboard (home - away) order:
                "FC Kuusankoski – PePo / Musta · 1–2 · 26.9." */}
            {(teamName || opponentName) && (
              <p className="mb-4 px-1 text-sm text-ink-2" data-testid="assessment-game-summary">
                <span className="font-semibold text-ink">
                  {displayHomeTeamName || t('common.home', 'Home')} – {displayAwayTeamName || t('common.away', 'Away')}
                </span>
                {/* The " ·" separator is glued (no-break space) to the part
                    before it, so a narrow phone wraps AFTER a separator - never
                    starting a line with one or breaking the score or date. */}
                <span className="text-ink-3">{'\u00a0·'} </span>
                <span className="font-semibold text-ink tabular-nums whitespace-nowrap">{homeScore}–{awayScore}</span>
                {gameDate && (
                  <>
                    <span className="text-ink-3">{'\u00a0·'} </span>
                    <span className="tabular-nums whitespace-nowrap">{formatShortDate(gameDate)}</span>
                  </>
                )}
              </p>
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
