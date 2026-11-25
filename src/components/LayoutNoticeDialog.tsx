'use client';

/**
 * The basic-layout notice ("Aloitat kevennetyllä näkymällä"): a blocking
 * dialog that tells a new coach part of the app is hidden and how to get it.
 *
 * WHEN it shows is decided in `utils/layoutNotice.ts`; this file holds the
 * dialog itself and its Home host. The dialog has to be acknowledged: no
 * backdrop dismissal. Escape and the hardware back button count as "Selvä".
 *
 * It never hides or replaces Home's "Kevennetty näkymä · Näytä koko sovellus"
 * line: that line stays on the basic Home whatever the coach answers here.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';
import { useAppLayout, useOnboardingMilestonesSetting } from '@/hooks/useAppLayout';
import {
  deferHomePromptsThisVisit,
  useHomeShowing,
  useOnboardingJustFinished,
  useOnboardingUserId,
} from '@/components/setupWizardActive';
import { hasSeenSetupWizard, recordAppStateMilestones } from '@/utils/onboardingMilestones';
import {
  dueLayoutNotice,
  getFinishedGamesSession,
  markLayoutNoticeShownThisSession,
  shownMarks,
  wasLayoutNoticeShownThisSession,
  type LayoutNoticeFacts,
  type LayoutNoticeNumber,
} from '@/utils/layoutNotice';
import { queryKeys } from '@/config/queryKeys';
import {
  MODAL_BACKDROP_BLOCKING,
  Z_LAYER,
  dialogBodyStyle,
  dialogContainerStyle,
  dialogTitleStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/styles/modalStyles';

export interface LayoutNoticeDialogProps {
  /** Which notice: 1 = after the wizard, 2 / 3 = the reminders. */
  notice: LayoutNoticeNumber;
  /** "Selvä" (also Escape / back). */
  onAcknowledge: () => void;
  /** "Siirry koko näkymään nyt": switch, then close. */
  onSwitchToFull: () => void;
  /** "Älä näytä enää" - reminders only. */
  onStop: () => void;
}

export function LayoutNoticeDialog({ notice, onAcknowledge, onSwitchToFull, onStop }: LayoutNoticeDialogProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(containerRef, true);
  useEscapeToClose(true, onAcknowledge);
  useModalHardwareBack(true, onAcknowledge);

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  const lead =
    notice === 2
      ? t('layoutNotice.firstGame', 'First match recorded ✓')
      : notice === 3
        ? t('layoutNotice.threeGames', 'Three matches recorded ✓')
        : null;

  return createPortal(
    <div
      ref={containerRef}
      className={`${MODAL_BACKDROP_BLOCKING} ${Z_LAYER.modal}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="layout-notice-title"
      aria-describedby="layout-notice-body"
      data-testid="layout-notice"
    >
      <div className={dialogContainerStyle}>
        <h2 id="layout-notice-title" className={`${dialogTitleStyle} mb-3`}>
          {t('layoutNotice.title', 'You are starting with the Basic view')}
        </h2>
        <div id="layout-notice-body" className={`${dialogBodyStyle} mb-6 space-y-3`}>
          {lead && (
            <p className="font-semibold text-ink" data-testid="layout-notice-lead">
              {lead}
            </p>
          )}
          <p>
            {t(
              'layoutNotice.body',
              'We hid some features so getting started is easy. The Full view also has, for example, tournament-day planning, leagues and tournaments, statistics and the tactics board.',
            )}
          </p>
          <p>
            <Trans
              i18nKey="layoutNotice.switchHint"
              t={t}
              defaults="You can switch to the Full view at any time from the top of Home: <strong>See the full app</strong>."
              components={{ strong: <strong className="font-semibold text-ink" /> }}
            />
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            ref={primaryRef}
            type="button"
            onClick={onAcknowledge}
            className={`${primaryButtonStyle} w-full`}
            data-testid="layout-notice-ok"
          >
            {t('layoutNotice.ok', 'Got it')}
          </button>
          <button
            type="button"
            onClick={onSwitchToFull}
            className={`${secondaryButtonStyle} w-full`}
            data-testid="layout-notice-switch"
          >
            {t('layoutNotice.switchNow', 'Switch to the Full view now')}
          </button>
          {notice !== 1 && (
            <button
              type="button"
              onClick={onStop}
              className="mx-auto mt-1 min-h-[44px] px-3 font-ui text-[13px] text-ink-3 underline-offset-2 hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action rounded"
              data-testid="layout-notice-stop"
            >
              {t('layoutNotice.stop', "Don't show again")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface LayoutNoticeHostProps {
  /** From Home's latest read of the games; null until the first read. */
  facts: LayoutNoticeFacts | null;
  /** Another Home window is open: decide later. */
  blocked: boolean;
  /** Switch the layout to full the same way "Kaikki toiminnot" does. */
  onSwitchToFull: () => void;
}

/**
 * Decides on Home whether a notice is due and shows it. The "shown" mark is
 * stored BEFORE the dialog opens: a notice that could not be recorded is not
 * shown, so a failing store can never make it repeat.
 */
export function LayoutNoticeHost({ facts, blocked, onSwitchToFull }: LayoutNoticeHostProps) {
  const layout = useAppLayout();
  const milestones = useOnboardingMilestonesSetting();
  const userId = useOnboardingUserId();
  const homeShowing = useHomeShowing();
  const justOnboarded = useOnboardingJustFinished();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<LayoutNoticeNumber | null>(null);
  // Only an unmount drops a pending open: an input changing while the mark is
  // being written must not, or the notice would be recorded but never shown.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const invalidateSettings = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.settings.detail()] });
  }, [queryClient]);

  useEffect(() => {
    if (blocked || !homeShowing || !facts || userId === undefined || milestones === undefined) return;
    if (wasLayoutNoticeShownThisSession()) return;
    const notice = dueLayoutNotice({
      layout,
      milestones,
      // The wizard was finished or skipped: per the account's record, this
      // visit (it just ended), or a game exists (the wizard creates the first).
      wizardSeen: hasSeenSetupWizard(milestones) || justOnboarded || facts.savedGames > 0,
      facts,
      session: getFinishedGamesSession(userId ?? 'local'),
      now: new Date(),
    });
    if (notice === null) return;
    markLayoutNoticeShownThisSession();
    // The marketing prompt waits for a later visit: one dialog at a time.
    deferHomePromptsThisVisit();
    void recordAppStateMilestones(shownMarks(notice), userId).then((stored) => {
      if (!mountedRef.current || !stored) return;
      setOpen(notice);
      invalidateSettings();
    });
  }, [blocked, homeShowing, facts, userId, milestones, layout, justOnboarded, invalidateSettings]);

  // Leaving Home (a match opened from elsewhere) closes it: Home only.
  const visible = open !== null && homeShowing;

  const close = useCallback(() => setOpen(null), []);
  const handleSwitch = useCallback(() => {
    setOpen(null);
    onSwitchToFull();
  }, [onSwitchToFull]);
  const handleStop = useCallback(() => {
    setOpen(null);
    void recordAppStateMilestones(['layoutNoticeStopped'], userId).then(invalidateSettings);
  }, [userId, invalidateSettings]);

  if (!visible || open === null) return null;
  return (
    <LayoutNoticeDialog notice={open} onAcknowledge={close} onSwitchToFull={handleSwitch} onStop={handleStop} />
  );
}

export default LayoutNoticeHost;
