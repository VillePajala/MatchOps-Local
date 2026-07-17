'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Player } from '@/types';
import type { GameEvent } from '@/types/game';
import { HiOutlineEllipsisVertical, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi2';
import { updateGameEvent } from '@/utils/savedGames';
import { computeScoreFromEvents } from '@/datastore/gameEventScore';
import logger from '@/utils/logger';
import { TFunction } from 'i18next';

import ConfirmationModal from './ConfirmationModal';
import { CollapsibleModalHeader } from '@/styles/modalStyles';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';

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
  const playerOptions = useMemo(() => {
    // Sort players alphabetically for easier selection
    const sortedPlayers = [...availablePlayers].sort((a, b) => a.name.localeCompare(b.name));
    return sortedPlayers.map(player => (
      <option key={player.id} value={player.id}>
        {player.name}
      </option>
    ));
  }, [availablePlayers]);

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

  // Memoize sorted events
  const sortedEvents = useMemo(() => {
    return [...localGameEvents].sort((a, b) => a.time - b.time);
  }, [localGameEvents]);


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display" role="dialog" aria-modal="true" aria-label={t('goalLog.title', 'Goal Log')}>
      <div className="bg-slate-800 rounded-none shadow-xl flex flex-col border-0 overflow-hidden h-full w-full bg-noise-texture relative">
        {/* Background effects (standard 4-layer pattern) */}
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Chrome slimming: X-header. The live match clock is PINNED (no
              collapse prop) so it never scrolls away while logging a goal. */}
          <CollapsibleModalHeader
            title={t('goalLogModal.title', 'Log Goal Event')}
            onClose={onClose}
            closeLabel={t('common.doneButton', 'Done')}
          >
            <div className="px-6 pt-1 pb-2 text-center text-sm">
              <div className="flex justify-center items-center text-slate-300">
                <span className="text-yellow-400 font-semibold">{formatTime(currentTime)}</span>
              </div>
            </div>
          </CollapsibleModalHeader>

          {/* Scrollable Content - Split View Layout */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
            <div className="flex flex-col md:flex-row gap-4 h-full">
              {/* Left: Goal Logging Form (40% on desktop) */}
              <div className="md:w-2/5 space-y-4">
                <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:mx-0 -mt-2 sm:-mt-4 md:mt-0">
                  {/* Goal Form */}
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="scorerSelect" className="block text-sm font-medium text-slate-300 mb-1">
                        {t('goalLogModal.scorerLabel', 'Scorer')} <span className="text-red-500">*</span>
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
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="" disabled>{t('goalLogModal.selectPlaceholder', '-- Select Scorer --')}</option>
                        {playerOptions}
                        <option value={UNKNOWN_SCORER}>{t('goalLogModal.unknownScorer', 'Unknown / not sure')}</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="assisterSelect" className="block text-sm font-medium text-slate-300 mb-1">
                        {t('goalLogModal.assisterLabel', 'Assister (Optional)')}
                      </label>
                      <select
                        id="assisterSelect"
                        value={assisterId}
                        onChange={(e) => setAssisterId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        disabled={!scorerId}
                      >
                        <option value="">{t('goalLogModal.noAssisterPlaceholder', '-- No Assist --')}</option>
                        {availablePlayers.filter(p => p.id !== scorerId).map(player => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Action Buttons Inside Form Card */}
                    <div className="pt-2 space-y-2">
                      <button
                        type="button"
                        onClick={handleLogOwnGoalClick}
                        disabled={!scorerId}
                        className="w-full px-4 py-2 rounded-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-400/30"
                      >
                        {t('goalLogModal.logGoalButton', 'Log Goal')}
                      </button>
                      <button
                        type="button"
                        onClick={handleLogOpponentGoalClick}
                        className="w-full px-4 py-2 rounded-md font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
                        title={t('goalLogModal.logOpponentGoalTooltip', 'Record a goal for the opponent at the current game time') ?? undefined}
                      >
                        {t('goalLogModal.logOpponentGoalButtonShort', 'Opponent +1')}
                      </button>
                    </div>

                    {/* Score reconciliation: shown only when the stored score
                        disagrees with the goal log (events are the source of truth). */}
                    {goalLogScore.mismatch && (
                      <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                        <p className="text-xs text-amber-300">
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
                          className="w-full px-4 py-2 rounded-md font-semibold text-white bg-amber-600 hover:bg-amber-500 transition-colors shadow-sm"
                        >
                          {t('goalLogModal.recalculateScoreButton', 'Recalculate score from log')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Event Log (60% on desktop) */}
              <div className="md:w-3/5 space-y-4">
                <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:mx-0 -mt-2 sm:-mt-4 md:mt-0">
                  <h3 className="text-lg font-semibold text-slate-200 mb-4">
                    {t('gameSettingsModal.eventLogTitle', 'Event Log')}
                  </h3>

                  {/* Error Display */}
                  {error && (
                    <div className="mb-3 p-2 bg-red-900/30 border border-red-700/50 rounded text-red-200 text-sm">
                      {error}
                    </div>
                  )}

                  {/* Events List */}
                  <div className="space-y-2">
                    {sortedEvents.map(event => (
                      <div
                        key={event.id}
                        className={`p-3 rounded-md ${
                          editingGoalId === event.id
                            ? 'bg-slate-700/75 border border-indigo-500'
                            : 'bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40'
                        }`}
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
                              className={`w-full px-3 py-2 bg-slate-700 border rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm ${goalTimeError ? 'border-red-500' : 'border-slate-600'}`}
                              autoComplete="off"
                              maxLength={5}
                              onFocus={(e) => e.target.select()}
                            />
                            {goalTimeError && <p className="mt-1 text-sm text-red-400">{goalTimeError}</p>}
                            {event.type === 'goal' && (
                              <>
                                <select
                                  value={editGoalScorerId}
                                  onChange={(e) => setEditGoalScorerId(e.target.value)}
                                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                                >
                                  <option value="">{t('gameSettingsModal.selectScorer', 'Select Scorer...')}</option>
                                  {availablePlayers.map(player => (
                                    <option key={player.id} value={player.id}>{player.name}</option>
                                  ))}
                                  <option value={UNKNOWN_SCORER}>{t('goalLogModal.unknownScorer', 'Unknown / not sure')}</option>
                                </select>
                                <select
                                  value={editGoalAssisterId ?? ''}
                                  onChange={(e) => setEditGoalAssisterId(e.target.value || undefined)}
                                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                                >
                                  <option value="">{t('gameSettingsModal.selectAssister', 'Select Assister (Optional)...')}</option>
                                  {availablePlayers.map(player => (
                                    <option key={player.id} value={player.id}>{player.name}</option>
                                  ))}
                                </select>
                              </>
                            )}
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={handleCancelEditGoal}
                                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded-md text-sm font-medium transition-colors shadow-sm"
                                disabled={isProcessing}
                              >
                                {t('common.cancel', 'Cancel')}
                              </button>
                              <button
                                onClick={() => handleSaveGoal(event.id)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-sm text-sm font-medium transition-colors border border-indigo-400/30"
                                disabled={isProcessing}
                              >
                                {t('common.save', 'Save')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Display Mode */
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <span className="text-slate-300 font-mono">{formatTime(event.time)}</span>
                              <span className="text-slate-100">
                                {getEventDescription(event, availablePlayers, t)}
                              </span>
                            </div>
                            <div className="relative" ref={eventActionsMenuId === event.id ? actionsMenuRef : null}>
                              <button
                                onClick={(e) => handleActionsMenuToggle(e, event.id)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-600 transition-colors"
                                aria-label={t('gameSettingsModal.eventActions', 'Event actions')}
                                disabled={isProcessing}
                              >
                                <HiOutlineEllipsisVertical className="w-5 h-5" />
                              </button>

                              {eventActionsMenuId === event.id && (
                                <div className={`absolute right-0 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50 ${menuPositions[event.id] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                                  <button
                                    onClick={() => { setEventActionsMenuId(null); handleEditGoal(event); }}
                                    className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 first:rounded-t-md transition-colors"
                                    disabled={isProcessing}
                                  >
                                    <HiOutlinePencil className="w-4 h-4" />
                                    {t('common.edit', 'Edit')}
                                  </button>
                                  <button
                                    onClick={() => { setEventActionsMenuId(null); handleDeleteGoal(event.id); }}
                                    className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600/20 flex items-center gap-2 last:rounded-b-md transition-colors"
                                    disabled={isProcessing}
                                  >
                                    <HiOutlineTrash className="w-4 h-4" />
                                    {t('common.delete', 'Delete')}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {sortedEvents.length === 0 && (
                      <div className="text-slate-400 text-center py-4">
                        {t('gameSettingsModal.noGoalsLogged', 'No goals logged yet.')}
                      </div>
                    )}
                  </div>
                </div>
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
