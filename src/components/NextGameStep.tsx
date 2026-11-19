'use client';

/**
 * "Milloin seuraava peli?" - the one short step after the setup wizard
 * (Onboarding v3, step 4), and basic Home's "Uusi ottelu" (review R1). Date +
 * optional opponent; "Tee suunnitelma" creates the game and its one-game plan
 * (the caller does that - this is the form). A quiet link goes to Home
 * instead, creating nothing; from Home a second quiet link, "Lisää asetuksia",
 * opens the full New Game form.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { formatShortGameDay, toLocalIsoDate, upcomingWeekendDates } from '@/utils/nextGameDates';
import type { NextGameStepDraft } from '@/utils/nextGameStepDraft';
import {
  titleStyle,
  subtextStyle,
  labelStyle,
  inputBaseStyle,
  chipStyle,
  chipSelectedStyle,
  primaryButtonStyle,
} from '@/styles/modalStyles';

export interface NextGameStepProps {
  /** Create the game + plan. Rejections are handled by the caller (toast). */
  onSubmit: (gameDate: string, opponentName: string) => void | Promise<void>;
  /** Go to Home without creating a game. */
  onSkip: () => void;
  isSaving: boolean;
  /** Answers to start from (the step reopened after a reload, R3). */
  initialDraft?: NextGameStepDraft | null;
  /** Every change, so the caller can keep the answers across an app kill (R3). */
  onDraftChange?: (draft: NextGameStepDraft) => void;
  /** "Lisää asetuksia": the full New Game form instead (Home only, R1). */
  onMoreSettings?: () => void;
  /** Injectable "today" (tests). */
  today?: Date;
}

const NextGameStep: React.FC<NextGameStepProps> = ({
  onSubmit,
  onSkip,
  isSaving,
  initialDraft,
  onDraftChange,
  onMoreSettings,
  today,
}) => {
  const { t } = useTranslation();
  const [language] = useAppLanguage();
  // Computed once: the chips must not move under the coach's thumb at midnight.
  // "Tänään" first (R13: a coach at the pitch on a weekday), then the weekend.
  const [todayIso] = useState(() => toLocalIsoDate(today ?? new Date()));
  const [weekend] = useState(() => upcomingWeekendDates(today ?? new Date()).filter((iso) => iso !== todayIso));
  const [gameDate, setGameDateState] = useState(initialDraft?.gameDate ?? '');
  const [opponent, setOpponentState] = useState(initialDraft?.opponent ?? '');
  const [showPicker, setShowPicker] = useState(false);

  const setGameDate = (value: string) => {
    setGameDateState(value);
    onDraftChange?.({ gameDate: value, opponent });
  };
  const setOpponent = (value: string) => {
    setOpponentState(value);
    onDraftChange?.({ gameDate, opponent: value });
  };

  const chips = [todayIso, ...weekend];
  const pickedOther = gameDate !== '' && !chips.includes(gameDate);
  const otherLabel = useMemo(
    () => (pickedOther ? formatShortGameDay(gameDate, language) : t('nextGameStep.pickDate', 'Pick a date')),
    [pickedOther, gameDate, language, t],
  );

  return (
    <div
      data-testid="next-game-step"
      className="s1-canvas relative flex flex-col h-screen h-[100dvh] font-ui text-ink overflow-y-auto"
    >
      <form
        className="relative z-10 w-full max-w-sm mx-auto flex flex-col flex-1 px-5 pt-8 pb-6 pb-safe"
        onSubmit={(e) => {
          e.preventDefault();
          if (!gameDate || isSaving) return;
          void onSubmit(gameDate, opponent.trim());
        }}
      >
        <h1 className={titleStyle}>{t('nextGameStep.title', 'When is the next game?')}</h1>
        <p className={`${subtextStyle} mt-1 mb-6`}>
          {t('nextGameStep.body', "We'll make a ready plan for the game. You can change everything later.")}
        </p>

        <p className={labelStyle} id="next-game-date-label">
          {t('nextGameStep.dateLabel', 'Date')}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="next-game-date-label">
          {chips.map((iso) => (
            <button
              key={iso}
              type="button"
              data-testid={iso === todayIso ? 'next-game-date-today' : `next-game-date-${iso}`}
              aria-pressed={gameDate === iso}
              onClick={() => {
                setGameDate(iso);
                setShowPicker(false);
              }}
              className={`${gameDate === iso ? chipSelectedStyle : chipStyle} min-h-11`}
            >
              {iso === todayIso ? t('nextGameStep.today', 'Today') : formatShortGameDay(iso, language)}
            </button>
          ))}
          <button
            type="button"
            data-testid="next-game-date-other"
            aria-pressed={pickedOther}
            aria-expanded={showPicker}
            onClick={() => setShowPicker((v) => !v)}
            className={`${pickedOther ? chipSelectedStyle : chipStyle} min-h-11`}
          >
            {otherLabel}
          </button>
        </div>
        {showPicker && (
          <input
            type="date"
            data-testid="next-game-date-input"
            aria-label={t('nextGameStep.pickDate', 'Pick a date')}
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value)}
            className={`${inputBaseStyle} mt-3 [color-scheme:dark]`}
          />
        )}

        <label htmlFor="next-game-opponent" className={`${labelStyle} mt-6`}>
          {t('nextGameStep.opponentLabel', 'Against whom?')}{' '}
          <span className="font-normal text-ink-3">{t('nextGameStep.optional', 'optional')}</span>
        </label>
        <input
          id="next-game-opponent"
          data-testid="next-game-opponent"
          type="text"
          value={opponent}
          maxLength={VALIDATION_LIMITS.TEAM_NAME_MAX}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder={t('nextGameStep.opponentPlaceholder', 'e.g. FC Kasiysi') ?? undefined}
          className={inputBaseStyle}
        />

        <div className="mt-auto pt-8 space-y-1">
          <button
            type="submit"
            data-testid="next-game-submit"
            disabled={!gameDate || isSaving}
            className={`${primaryButtonStyle} w-full min-h-12 text-base`}
          >
            {isSaving ? t('setupWizard.saving', 'Saving…') : t('nextGameStep.submit', 'Make the plan')}
          </button>
          <button
            type="button"
            data-testid="next-game-skip"
            onClick={onSkip}
            disabled={isSaving}
            className="inline-flex w-full min-h-11 items-center justify-center px-3 font-ui text-sm text-ink-3 hover:text-ink-2 underline decoration-ink-3/60 underline-offset-[3px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50"
          >
            {t('nextGameStep.skip', 'Not now - go to Home')}
          </button>
          {onMoreSettings && (
            <button
              type="button"
              data-testid="next-game-more-settings"
              onClick={onMoreSettings}
              disabled={isSaving}
              className="inline-flex w-full min-h-11 items-center justify-center px-3 font-ui text-sm text-ink-3 hover:text-ink-2 underline decoration-ink-3/60 underline-offset-[3px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50"
            >
              {t('nextGameStep.moreSettings', 'More settings')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default NextGameStep;
