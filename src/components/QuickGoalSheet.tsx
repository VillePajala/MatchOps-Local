'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { GameEvent } from '@/types/game';
import { sortPlayersByLastName } from '@/utils/gamePlayerList';
import { formatTime } from '@/utils/time';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { Z_LAYER, dialogTitleStyle, subtextStyle } from '@/styles/modalStyles';

interface QuickGoalSheetProps {
  /** The goal just logged by "Goal for us"; the sheet names its scorer and assister. */
  eventId: string;
  /** The live goal log. When the goal leaves it (Undo), the sheet closes. */
  gameEvents: GameEvent[];
  /** Every player in this game's squad (selectedPlayerIds) - not only the starters. */
  players: Player[];
  homeScore: number;
  awayScore: number;
  onUpdateGameEvent: (event: GameEvent) => void;
  onClose: () => void;
}

/** The name a coach knows the player by on the pitch: the disc name. */
const buttonLabel = (player: Player): string => player.nickname?.trim() || player.name;

/** A name button: large, 2-3 per row, full name for screen readers. */
const nameButtonStyle =
  'min-h-12 px-2 py-1.5 flex items-center justify-center text-center rounded-2xl s1-ghost font-ui text-[15px] font-semibold text-ink leading-tight hover:bg-white/[0.07] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-action';

/**
 * Quick goal entry (onboarding v3, D16). The goal is already in the log when
 * this opens - the score moved on the first tap - so every step here is
 * optional: name the scorer, then the assister, or skip. Skipping leaves the
 * goal without a scorer (the goal form's "Unknown"), which counts for the team
 * and for no player. The full goal form stays the place to edit goals.
 */
const QuickGoalSheet: React.FC<QuickGoalSheetProps> = ({
  eventId,
  gameEvents,
  players,
  homeScore,
  awayScore,
  onUpdateGameEvent,
  onClose,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'scorer' | 'assister'>('scorer');
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  useEscapeToClose(true, onClose);

  const event = gameEvents.find((e) => e.id === eventId && e.type === 'goal');
  const ordered = useMemo(() => sortPlayersByLastName(players), [players]);
  const choices = step === 'assister' && event?.scorerId
    ? ordered.filter((p) => p.id !== event.scorerId)
    : ordered;

  // Nothing to ask: the goal was undone, or the game has no squad to choose
  // from. The goal itself (when it is still there) stays as logged.
  const nothingToAsk = !event || choices.length === 0;
  useEffect(() => {
    if (nothingToAsk) onClose();
  }, [nothingToAsk, onClose]);
  if (nothingToAsk) return null;

  const pick = (playerId: string) => {
    if (step === 'scorer') {
      onUpdateGameEvent({ ...event, scorerId: playerId });
      // An assist needs someone other than the scorer to have made it.
      if (ordered.some((p) => p.id !== playerId)) setStep('assister');
      else onClose();
      return;
    }
    onUpdateGameEvent({ ...event, assisterId: playerId });
    onClose();
  };

  const title = step === 'scorer'
    ? t('goalQuick.who', 'Who scored?')
    : t('goalQuick.assistWho', 'Who assisted?');

  return (
    <div
      className={`fixed inset-0 ${Z_LAYER.modal} flex items-end justify-center bg-black/60`}
      onClick={onClose}
      data-testid="quick-goal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="quick-goal-sheet"
        data-step={step}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg s1-sheet rounded-t-[26px] px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] max-h-[85vh] overflow-y-auto font-ui focus:outline-none"
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" aria-hidden="true" />
        <p className={`${subtextStyle} text-ink-2`}>
          {t('goalQuick.logged', 'Goal logged · {{time}} · {{score}}', {
            time: formatTime(event.time),
            score: `${homeScore}–${awayScore}`,
          })}
        </p>
        <h2 className={`${dialogTitleStyle} mt-1 mb-4`}>{title}</h2>
        <div className="grid grid-cols-2 min-[360px]:grid-cols-3 gap-2" data-testid="quick-goal-names">
          {choices.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => pick(player.id)}
              aria-label={player.name}
              className={nameButtonStyle}
            >
              <span className="line-clamp-2 break-words min-w-0">{buttonLabel(player)}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="quick-goal-skip"
          className={`${nameButtonStyle} w-full mt-3 text-ink-2`}
        >
          {t('goalQuick.skip', 'Skip')}
        </button>
        {step === 'scorer' && (
          <p className={`${subtextStyle} mt-3 text-center`}>
            {t('goalQuick.nextAssist', 'Next: who assisted?')}
          </p>
        )}
      </div>
    </div>
  );
};

export default QuickGoalSheet;
