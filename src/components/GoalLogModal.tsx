'use client';

import { sortPlayersByLastName, playerListLabel } from '@/utils/gamePlayerList';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Player } from '@/types';
import type { GameEvent } from '@/types/game';
import { HiOutlineEllipsisVertical, HiOutlinePencil, HiOutlineTrash, HiOutlineChevronDown, HiOutlineXMark } from 'react-icons/hi2';
import { updateGameEvent } from '@/utils/savedGames';
import { computeScoreFromEvents } from '@/datastore/gameEventScore';
import logger from '@/utils/logger';
import { TFunction } from 'i18next';

import ConfirmationModal from './ConfirmationModal';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import FirstVisitIntro from '@/components/FirstVisitIntro';
import {
  Z_LAYER,
  inputBaseStyle,
  selectStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionLabelStyle,
  groupedListStyle,
  listRowStyle,
  popoverMenuStyle,
  popoverItemStyle,
  fieldErrorStyle,
  errorBoxStyle,
  inputErrorStyle,
  modalCloseButtonStyle,
} from '@/styles/modalStyles';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

// Re-export shared types for backward compatibility with test imports
export type { GameEvent, GameEventType } from '@/types/game';

// UI sentinel for the scorer dropdown meaning "team goal, scorer unknown".
// Mapped to an undefined scorerId when the goal is logged (never persisted).
const UNKNOWN_SCORER = '__unknown__';

interface GoalLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogGoal: (scorerId: string | undefined, assisterId?: string) => void; // For logging own team's goal (undefined scorer = Unknown)
  onLogOpponentGoal: (time: number) => void; // Handler for opponent goal
  availablePlayers: Player[];
  currentTime: number; // timeElapsedInSeconds
  // Event management props
  currentGameId: string | null;
  gameEvents: GameEvent[];
  homeScore: number;
  awayScore: number;
  homeOrAway: 'home' | 'away';
  onUpdateGameEvent: (event: GameEvent) => void;
  onDeleteGameEvent: (eventId: string) => Promise<boolean>;
  onRecalculateScore: () => void; // Snap the score to the goal log
}

/**
 * The scorer/assister placeholders are written "-- Select Scorer --"; the
 * picker rows show them as plain text, so the decorative dashes are dropped.
 */
const stripPlaceholderDashes = (text: string): string => text.replace(/^[\s\-–—]+|[\s\-–—]+$/g, '');

/** A picker row's native select: transparent, filling the whole 68px row. */
const pickerSelectStyle =
  "block w-full min-h-[68px] appearance-none bg-transparent pl-[18px] pr-12 pt-7 pb-2.5 font-ui text-[17px] font-semibold text-ink-2 [color-scheme:dark] cursor-pointer rounded-[22px] focus:outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-action)] disabled:opacity-50 disabled:cursor-not-allowed";
/** The small label sitting above a picker row's value. */
const pickerLabelStyle =
  "absolute top-3 left-[18px] font-ui text-[13px] font-semibold text-ink-3 pointer-events-none";

// Helper to get event description
const getEventDescription = (event: GameEvent, players: Player[], t: TFunction): string => {
  switch (event.type) {
    case 'goal': {
      const scorer = players.find(p => p.id === event.scorerId)?.name || t('gameSettingsModal.unknownPlayer', 'Unknown Player');
      let description = scorer;
      if (event.assisterId) {
        const assister = players.find(p => p.id === event.assisterId)?.name;
        if (assister) {
          description += ` (${t('common.assist', 'Assist')}: ${assister})`;
        }
      }
      return description;
    }
    case 'opponentGoal':
      return t('gameSettingsModal.logTypeOpponentGoal', 'Opponent Goal');
    case 'periodEnd':
      return t('gameSettingsModal.logTypePeriodEnd', 'End of Period');
    case 'gameEnd':
      return t('gameSettingsModal.logTypeGameEnd', 'End of Game');
    default:
      return t('gameSettingsModal.logTypeUnknown', 'Unknown Event');
  }
};

const GoalLogModal: React.FC<GoalLogModalProps> = ({
  isOpen,
  onClose,
  onLogGoal,
  onLogOpponentGoal,
  availablePlayers,
  currentTime,
  currentGameId,
  gameEvents,
  homeScore,
  awayScore,
  homeOrAway,
  onUpdateGameEvent,
  onDeleteGameEvent,
  onRecalculateScore,
}) => {
  const { t } = useTranslation();
  // Form state
  const [scorerId, setScorerId] = useState<string>('');
  const [assisterId, setAssisterId] = useState<string>(''); // Empty string means no assist
  const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);

  // Event editing state
  const [localGameEvents, setLocalGameEvents] = useState<GameEvent[]>(gameEvents || []);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editGoalTime, setEditGoalTime] = useState<string>('');
  const [editGoalScorerId, setEditGoalScorerId] = useState<string>('');
  const [editGoalAssisterId, setEditGoalAssisterId] = useState<string | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goalTimeError, setGoalTimeError] = useState<string | null>(null);
  const goalTimeInputRef = useRef<HTMLInputElement>(null);

  // Score derived purely from the goal log (events are the source of truth),
  // compared against the stored score so we can offer to reconcile a mismatch.
  const goalLogScore = useMemo(() => {
    // Reuse the same helper the recalculate action uses, so the mismatch check
    // and the repair can never drift apart.
    const { homeScore: derivedHome, awayScore: derivedAway } =
      computeScoreFromEvents({ homeOrAway, gameEvents });
    return {
      our: homeOrAway === 'home' ? derivedHome : derivedAway,
      opponent: homeOrAway === 'home' ? derivedAway : derivedHome,
      currentOur: homeOrAway === 'home' ? homeScore : awayScore,
      currentTheir: homeOrAway === 'home' ? awayScore : homeScore,
      mismatch: derivedHome !== homeScore || derivedAway !== awayScore,
    };
  }, [gameEvents, homeOrAway, homeScore, awayScore]);

  // Confirmation modal state
  const [showDeleteEventConfirm, setShowDeleteEventConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  const [eventActionsMenuId, setEventActionsMenuId] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [menuPositions, setMenuPositions] = useState<Record<string, boolean>>({});
  const { calculatePosition } = useDropdownPosition();

  // Format time MM:SS
  const formatTime = (timeInSeconds: number): string => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Memoize player options to avoid recalculating on every render
  // Every player select here: the app's one order and name format (review 7.L5/7.L8)
  // - the scorer list sorted by first name while the assister list right below it
  // was unsorted.
  const orderedPlayers = useMemo(() => sortPlayersByLastName(availablePlayers), [availablePlayers]);
  const playerOptions = useMemo(() => orderedPlayers.map(player => (
    <option key={player.id} value={player.id}>
      {playerListLabel(player)}
    </option>
  )), [orderedPlayers]);

  // Close actions menu when clicking outside
  useEffect(() => {
    if (!eventActionsMenuId) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setEventActionsMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [eventActionsMenuId]);

  const handleActionsMenuToggle = (e: React.MouseEvent<HTMLButtonElement>, eventId: string) => {
    const shouldOpenUpward = calculatePosition(e.currentTarget);
    setMenuPositions(prev => ({ ...prev, [eventId]: shouldOpenUpward }));
    setEventActionsMenuId(eventActionsMenuId === eventId ? null : eventId);
  };

  const handleLogOwnGoalClick = () => {
    if (scorerId) {
      // UNKNOWN_SCORER is a UI sentinel for "we scored but don't know who" —
      // map it to an undefined scorer so the goal counts for the team but isn't
      // attributed to any player.
      const resolvedScorer = scorerId === UNKNOWN_SCORER ? undefined : scorerId;
      onLogGoal(resolvedScorer, assisterId || undefined); // Pass undefined if assisterId is empty
      onClose();
    }
  };

  // Handler for the new Opponent Goal button
  const handleLogOpponentGoalClick = () => {
    onLogOpponentGoal(currentTime); // Call the passed handler with the current time
    // No need to reset local state as it's not used for opponent goal
    // onClose(); // The handler in page.tsx already closes the modal
  };

  // Event editing handlers
  const handleEditGoal = (goal: GameEvent) => {
    setEditingGoalId(goal.id);
    setEditGoalTime(formatTime(goal.time)); // Use MM:SS format for editing time
    // No scorer = an Unknown-scorer goal: surface the sentinel so the dropdown
    // shows "Unknown" and a plain save doesn't silently attribute it to a player.
    setEditGoalScorerId(goal.scorerId ? goal.scorerId : UNKNOWN_SCORER);
    setEditGoalAssisterId(goal.assisterId || undefined);
    setGoalTimeError(null);
  };

  const handleCancelEditGoal = () => {
    setEditingGoalId(null);
    setEditGoalTime('');
    setEditGoalScorerId('');
    setEditGoalAssisterId(undefined);
    setGoalTimeError(null);
  };

  // Handle saving edited goal
  const handleSaveGoal = async (goalId: string) => {
    if (!goalId || !currentGameId) {
      logger.error("[GoalLogModal] Missing goalId or currentGameId for save.");
      setError(t('gameSettingsModal.errors.missingGoalId', 'Goal ID or Game ID is missing. Cannot save.'));
      return;
    }

    setError(null);
    setGoalTimeError(null);
    setIsProcessing(true);

    let timeInSeconds = 0;
    const timeParts = editGoalTime.split(':');
    if (timeParts.length === 2) {
      const minutes = parseInt(timeParts[0], 10);
      const seconds = parseInt(timeParts[1], 10);
      // Cap at 200 min to comfortably allow extra time + long stoppage, while still rejecting garbage.
      if (!isNaN(minutes) && !isNaN(seconds) && minutes >= 0 && minutes <= 200 && seconds >= 0 && seconds < 60) {
        timeInSeconds = minutes * 60 + seconds;
      } else {
        setGoalTimeError(t('gameSettingsModal.invalidTimeFormat', "Invalid time format. Use MM:SS"));
        setIsProcessing(false);
        return;
      }
    } else if (editGoalTime) {
      setGoalTimeError(t('gameSettingsModal.invalidTimeFormat', "Invalid time format. Use MM:SS"));
      setIsProcessing(false);
      return;
    }

    const originalEvent = localGameEvents.find(e => e.id === goalId);
    if (!originalEvent) {
      logger.error(`[GoalLogModal] Original event not found for ID: ${goalId}`);
      setIsProcessing(false);
      return;
    }

    const updatedEvent: GameEvent = {
      ...originalEvent,
      id: goalId,
      time: timeInSeconds,
      // UNKNOWN_SCORER (and any empty value) maps back to an undefined scorerId.
      scorerId: editGoalScorerId && editGoalScorerId !== UNKNOWN_SCORER ? editGoalScorerId : undefined,
      assisterId: editGoalAssisterId || undefined,
    };

    setLocalGameEvents(prevEvents =>
      prevEvents.map(event => (event.id === goalId ? updatedEvent : event))
    );
    onUpdateGameEvent(updatedEvent);

    try {
      const eventIndex = gameEvents.findIndex(e => e.id === goalId);
      if (eventIndex !== -1) {
        const success = await updateGameEvent(currentGameId, eventIndex, updatedEvent);
        if (success) {
          logger.log(`[GoalLogModal] Event ${goalId} updated in game ${currentGameId}.`);
          handleCancelEditGoal();
        } else {
          logger.error(`[GoalLogModal] Failed to update event ${goalId}`);
          setError(t('gameSettingsModal.errors.updateFailed', 'Failed to update event. Please try again.'));
          // Revert optimistic update on failure so UI never shows unsaved edits.
          setLocalGameEvents(prevEvents =>
            prevEvents.map(event => (event.id === goalId ? originalEvent : event))
          );
          onUpdateGameEvent(originalEvent);
        }
      } else {
        logger.error(`[GoalLogModal] Event ${goalId} not found`);
        setError(t('gameSettingsModal.errors.eventNotFound', 'Original event not found for saving.'));
        // Revert optimistic update — event not found in props for persistence.
        setLocalGameEvents(prevEvents =>
          prevEvents.map(event => (event.id === goalId ? originalEvent : event))
        );
        onUpdateGameEvent(originalEvent);
      }
    } catch (err) {
      logger.error(`[GoalLogModal] Error updating event ${goalId}:`, err);
      setError(t('gameSettingsModal.errors.genericSaveError', 'An unexpected error occurred while saving the event.'));
      // Revert optimistic update on error.
      setLocalGameEvents(prevEvents =>
        prevEvents.map(event => (event.id === goalId ? originalEvent : event))
      );
      onUpdateGameEvent(originalEvent);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle deleting a goal
  const handleDeleteGoal = (goalId: string) => {
    if (!onDeleteGameEvent || !currentGameId) {
      logger.error("[GoalLogModal] Missing onDeleteGameEvent handler or currentGameId");
      setError(t('gameSettingsModal.errors.missingDeleteHandler', 'Cannot delete event: Critical configuration missing.'));
      return;
    }

    setEventToDelete(goalId);
    setShowDeleteEventConfirm(true);
  };

  const handleDeleteEventConfirmed = async () => {
    const goalId = eventToDelete;
    if (!goalId || !onDeleteGameEvent || !currentGameId) {
      setShowDeleteEventConfirm(false);
      setEventToDelete(null);
      return;
    }

    setError(null);
    setIsProcessing(true);
    // Save original state for rollback if parent handler fails
    const originalLocalEvents = localGameEvents;

    try {
      // Optimistic update for UI responsiveness
      setLocalGameEvents(prevEvents => prevEvents.filter(event => event.id !== goalId));

      // Call parent handler (now handles storage internally and returns success status)
      const success = await onDeleteGameEvent(goalId);

      if (!success) {
        logger.error(`[GoalLogModal] Failed to delete event ${goalId} (parent handler returned false).`);
        setError(t('gameSettingsModal.errors.deleteFailed', 'Failed to delete event. Please try again.'));
        setLocalGameEvents(originalLocalEvents); // Rollback on failure
      } else {
        logger.log(`[GoalLogModal] Event ${goalId} deleted successfully.`);
      }
    } catch (err) {
      logger.error(`[GoalLogModal] Error deleting event ${goalId}:`, err);
      setError(t('gameSettingsModal.errors.genericDeleteError', 'An unexpected error occurred while deleting the event.'));
      setLocalGameEvents(originalLocalEvents); // Rollback on error
    } finally {
      setIsProcessing(false);
      setShowDeleteEventConfirm(false);
      setEventToDelete(null);
    }
  };

  // Reset state when modal closes (or opens)
  useEffect(() => {
      if (isOpen) {
          setScorerId('');
          setAssisterId('');
      }
  }, [isOpen]);

  // Sync localGameEvents with prop changes
  useEffect(() => {
    setLocalGameEvents(gameEvents || []);
  }, [gameEvents]);

  // Focus goal time input when editing
  useEffect(() => {
    if (editingGoalId) {
      goalTimeInputRef.current?.focus();
      goalTimeInputRef.current?.select();
    }
  }, [editingGoalId]);

  // Memoize sorted events. Kirjuri note events have their own card (stats
  // modal) - listing them here would render as "Unknown Event" and let the
  // goal editor delete them.
  const sortedEvents = useMemo(() => {
    return localGameEvents.filter((e) => e.type !== 'note').sort((a, b) => a.time - b.time);
  }, [localGameEvents]);


  useEscapeToClose(isOpen, onClose, !showDeleteEventConfirm && !showRecalcConfirm);



  if (!isOpen) return null;

  return (
    // A tall bottom sheet over the dimmed match: a strip of the game stays in
    // view above it, so the coach can see they are still in the match.
    <div className={`fixed inset-0 ${Z_LAYER.modal} bg-[rgb(2_6_23/0.72)]`} role="dialog" aria-modal="true" aria-label={t('goalLog.title', 'Goal Log')}>
      <div className="absolute inset-x-0 bottom-0 top-16 flex flex-col overflow-hidden rounded-t-[28px] font-ui text-ink bg-[linear-gradient(180deg,#1c2740,#141d31)] shadow-[inset_0_1px_0_rgb(255_255_255/0.09),0_-20px_40px_-12px_rgb(2_6_23/0.8)]">
        {/* Grab handle (decorative) */}
        <div className="flex-shrink-0 w-10 h-[5px] rounded-full bg-white/[0.22] mx-auto mt-2.5 mb-3" aria-hidden="true" />

        {/* Header: title with the live match clock under it, close on the
            right where the thumb is. The clock is pinned (outside the scroll)
            so it never scrolls away while logging a goal. */}
        <div className="flex-shrink-0 flex items-start gap-3 pl-5 pr-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-[31px] leading-none tracking-[0.005em] text-ink">
              {t('goalLogModal.title', 'Log Goal Event')}
            </h2>
            <div className="mt-2.5 inline-flex items-center gap-2 h-9 px-3 rounded-full bg-white/[0.08] shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]">
              <span className="w-2 h-2 rounded-full bg-action shadow-[0_0_0_3px_rgb(255_178_36/0.2)]" aria-hidden="true" />
              <span className="font-display italic font-extrabold text-[22px] leading-none">{formatTime(currentTime)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.doneButton', 'Done')}
            title={t('common.doneButton', 'Done')}
            className={`flex w-12! h-12! ${modalCloseButtonStyle}`}
          >
            <HiOutlineXMark className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content - Split View Layout */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-5 pb-8">
          <FirstVisitIntro
            surface="goal-log"
            className="mb-4"
            text={t('firstVisit.goalLog', 'Pick the scorer - and an assister if there was one - then tap Log Goal.')}
          />
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left: Goal Logging Form (40% on desktop) */}
            <div className="md:w-2/5">
              {/* The two pickers as one list: label above value, chevron right */}
              <div className={groupedListStyle}>
                <div className="relative">
                  <label htmlFor="scorerSelect" className={pickerLabelStyle}>
                    {t('goalLogModal.scorerLabel', 'Scorer')} <span className="text-loss">*</span>
                  </label>
                  <select
                    id="scorerSelect"
                    value={scorerId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setScorerId(value);
                      // Only clear the assister if it would collide with the
                      // scorer. An Unknown-scorer goal can still keep a known
                      // assister (e.g. a scramble: you saw the pass, not the finish).
                      if (value && value !== UNKNOWN_SCORER && value === assisterId) {
                        setAssisterId('');
                      }
                    }}
                    className={pickerSelectStyle}
                  >
                    <option value="" disabled>{stripPlaceholderDashes(t('goalLogModal.selectPlaceholder', 'Select Scorer'))}</option>
                    {playerOptions}
                    <option value={UNKNOWN_SCORER}>{t('goalLogModal.unknownScorer', 'Unknown / not sure')}</option>
                  </select>
                  <HiOutlineChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-ink-3 pointer-events-none" aria-hidden="true" />
                </div>

                <div className="relative before:absolute before:top-0 before:left-[18px] before:right-0 before:h-px before:bg-hairline">
                  <label htmlFor="assisterSelect" className={pickerLabelStyle}>
                    {t('goalLogModal.assisterLabel', 'Assister (Optional)')}
                  </label>
                  <select
                    id="assisterSelect"
                    value={assisterId}
                    onChange={(e) => setAssisterId(e.target.value)}
                    className={pickerSelectStyle}
                    disabled={!scorerId}
                  >
                    <option value="">{stripPlaceholderDashes(t('goalLogModal.noAssisterPlaceholder', 'No Assist'))}</option>
                    {orderedPlayers.filter(p => p.id !== scorerId).map(player => (
                      <option key={player.id} value={player.id}>{playerListLabel(player)}</option>
                    ))}
                  </select>
                  <HiOutlineChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-ink-3 pointer-events-none" aria-hidden="true" />
                </div>
              </div>

              {/* Actions: the amber primary (dimmed until a scorer is chosen)
                  and the opponent's goal as a red outline. */}
              <div className="mt-4 grid gap-2.5">
                <button
                  type="button"
                  onClick={handleLogOwnGoalClick}
                  data-testid="tour-confirm-goal"
                  disabled={!scorerId}
                  className={`${primaryButtonStyle} w-full min-h-16 text-[19px] font-bold`}
                >
                  {t('goalLogModal.logGoalButton', 'Log Goal')}
                </button>
                <button
                  type="button"
                  onClick={handleLogOpponentGoalClick}
                  className="w-full min-h-14 rounded-full font-ui text-[17px] font-bold text-loss bg-[rgb(255_107_107/0.07)] shadow-[inset_0_0_0_1px_rgb(255_107_107/0.5)] hover:bg-[rgb(255_107_107/0.12)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-carbon"
                  title={t('goalLogModal.logOpponentGoalTooltip', 'Record a goal for the opponent at the current time') ?? undefined}
                >
                  {t('goalLogModal.logOpponentGoalButtonShort', 'Opponent +1')}
                </button>
              </div>

              {/* Score reconciliation: shown only when the stored score
                  disagrees with the goal log (events are the source of truth). */}
              {goalLogScore.mismatch && (
                <div className="mt-4 space-y-2.5">
                  <p className="text-sm text-ink-2">
                    {t(
                      'goalLogModal.scoreMismatch',
                      'Saved score ({{cur}}) doesn\'t match the goal log ({{log}}).',
                      {
                        cur: `${goalLogScore.currentOur}–${goalLogScore.currentTheir}`,
                        log: `${goalLogScore.our}–${goalLogScore.opponent}`,
                      },
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowRecalcConfirm(true)}
                    className={`${secondaryButtonStyle} w-full min-h-12`}
                  >
                    {t('goalLogModal.recalculateScoreButton', 'Recalculate score from log')}
                  </button>
                </div>
              )}
            </div>

            {/* Right: Event Log (60% on desktop) */}
            <div className="md:w-3/5">
              <h3 className={`${sectionLabelStyle} mx-1 mb-2.5`}>
                {t('gameSettingsModal.eventLogTitle', 'Event Log')}
              </h3>

              {/* Error Display */}
              {error && (
                <div className={`${errorBoxStyle} mb-3 text-sm text-ink`}>
                  {error}
                </div>
              )}

              {/* Events List. Plain s1-list (not the grouped list's
                  overflow-hidden), so a row's actions popover is not clipped. */}
              <div className="s1-list">
                {sortedEvents.map(event => (
                  <div
                    key={event.id}
                    className={`${listRowStyle} ${editingGoalId === event.id ? 'block! py-4 pr-[18px]!' : ''}`}
                  >
                    {editingGoalId === event.id ? (
                      /* Edit Mode */
                      <div className="space-y-3">
                        <input
                          ref={goalTimeInputRef}
                          type="text"
                          inputMode="numeric"
                          value={editGoalTime}
                          onChange={(e) => {
                            const value = e.target.value;
                            const filteredValue = value.replace(/[^0-9:]/g, '');
                            if (filteredValue.length <= 5) {
                              setEditGoalTime(filteredValue);
                              if (goalTimeError) setGoalTimeError(null);
                            }
                          }}
                          placeholder={t('gameSettingsModal.timeFormatPlaceholder', 'MM:SS')}
                          className={`${inputBaseStyle} ${goalTimeError ? inputErrorStyle : ''}`}
                          autoComplete="off"
                          maxLength={5}
                          onFocus={(e) => e.target.select()}
                        />
                        {goalTimeError && <p className={fieldErrorStyle}>{goalTimeError}</p>}
                        {event.type === 'goal' && (
                          <>
                            <select
                              value={editGoalScorerId}
                              onChange={(e) => setEditGoalScorerId(e.target.value)}
                              className={selectStyle}
                            >
                              <option value="">{t('gameSettingsModal.selectScorer', 'Select Scorer...')}</option>
                              {orderedPlayers.map(player => (
                                <option key={player.id} value={player.id}>{playerListLabel(player)}</option>
                              ))}
                              <option value={UNKNOWN_SCORER}>{t('goalLogModal.unknownScorer', 'Unknown / not sure')}</option>
                            </select>
                            <select
                              value={editGoalAssisterId ?? ''}
                              onChange={(e) => setEditGoalAssisterId(e.target.value || undefined)}
                              className={selectStyle}
                            >
                              <option value="">{t('gameSettingsModal.selectAssister', 'Select Assister (Optional)...')}</option>
                              {orderedPlayers.map(player => (
                                <option key={player.id} value={player.id}>{playerListLabel(player)}</option>
                              ))}
                            </select>
                          </>
                        )}
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={handleCancelEditGoal}
                            className={secondaryButtonStyle}
                            disabled={isProcessing}
                          >
                            {t('common.cancel', 'Cancel')}
                          </button>
                          <button
                            onClick={() => handleSaveGoal(event.id)}
                            className={primaryButtonStyle}
                            disabled={isProcessing}
                          >
                            {t('common.save', 'Save')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Display Mode */
                      <>
                        <span className="font-display italic font-extrabold text-xl leading-none text-ink-2 shrink-0">{formatTime(event.time)}</span>
                        <span className="flex-1 min-w-0 text-[15px] font-medium text-ink">
                          {getEventDescription(event, availablePlayers, t)}
                        </span>
                        <div className="relative shrink-0" ref={eventActionsMenuId === event.id ? actionsMenuRef : null}>
                          <button
                            onClick={(e) => handleActionsMenuToggle(e, event.id)}
                            className="w-11 h-11 flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-white/[0.06] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                            aria-label={t('gameSettingsModal.eventActions', 'Event actions')}
                            disabled={isProcessing}
                          >
                            <HiOutlineEllipsisVertical className="w-5 h-5" />
                          </button>

                          {eventActionsMenuId === event.id && (
                            <div className={`${popoverMenuStyle} ${menuPositions[event.id] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                              <button
                                onClick={() => { setEventActionsMenuId(null); handleEditGoal(event); }}
                                className={popoverItemStyle}
                                disabled={isProcessing}
                              >
                                <HiOutlinePencil className="w-4 h-4" />
                                {t('common.edit', 'Edit')}
                              </button>
                              <button
                                onClick={() => { setEventActionsMenuId(null); handleDeleteGoal(event.id); }}
                                className={`${popoverItemStyle} text-red-400!`}
                                disabled={isProcessing}
                              >
                                <HiOutlineTrash className="w-4 h-4" />
                                {t('common.delete', 'Delete')}
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {sortedEvents.length === 0 && (
                  <div className="px-[18px] py-[26px] text-center text-base text-ink-3">
                    {t('gameSettingsModal.noGoalsLogged', 'No goals logged yet.')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteEventConfirm}
        title={t('gameSettingsModal.confirmDeleteEventTitle', 'Delete Event')}
        message={t('gameSettingsModal.confirmDeleteEvent', 'Are you sure you want to delete this event? This cannot be undone.')}
        warningMessage={t('gameSettingsModal.deleteWarning', 'This action is permanent.')}
        onConfirm={handleDeleteEventConfirmed}
        onCancel={() => {
          setShowDeleteEventConfirm(false);
          setEventToDelete(null);
        }}
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
        isConfirming={isProcessing}
      />

      {/* Recalculate score from goal log */}
      <ConfirmationModal
        isOpen={showRecalcConfirm}
        title={t('goalLogModal.recalculateScoreTitle', 'Recalculate Score')}
        message={t(
          'goalLogModal.recalculateScoreConfirm',
          'Set the score to match the goal log? Current: {{cur}} → From log: {{log}}.',
          {
            cur: `${goalLogScore.currentOur}–${goalLogScore.currentTheir}`,
            log: `${goalLogScore.our}–${goalLogScore.opponent}`,
          },
        )}
        onConfirm={() => {
          onRecalculateScore();
          setShowRecalcConfirm(false);
        }}
        onCancel={() => setShowRecalcConfirm(false)}
        confirmLabel={t('goalLogModal.recalculateConfirmButton', 'Recalculate')}
      />
    </div>
  );
};

export default GoalLogModal;
