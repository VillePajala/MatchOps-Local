/**
 * Hook for managing goal event editing state and logic
 * Handles edit mode, validation, and save/cancel operations
 */

import { useState, useRef } from 'react';
import { GameEvent } from '@/types';
import { TFunction } from 'i18next';

interface UseGoalEditorParams {
  gameEvents: GameEvent[];
  onUpdateGameEvent?: (updatedEvent: GameEvent) => void;
  onDeleteGameEvent?: (goalId: string) => void;
  setLocalGameEvents: React.Dispatch<React.SetStateAction<GameEvent[]>>;
  setIsEditingNotes: (editing: boolean) => void;
  setInlineEditingField: (field: 'opponent' | 'date' | 'home' | 'away' | null) => void;
  t: TFunction;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface UseGoalEditorResult {
  editingGoalId: string | null;
  editGoalTime: string;
  editGoalScorerId: string;
  editGoalAssisterId: string | undefined;
  goalTimeInputRef: React.RefObject<HTMLInputElement | null>;
  handleStartEditGoal: (goal: GameEvent) => void;
  handleCancelEditGoal: () => void;
  handleSaveEditGoal: () => void;
  handleGoalEditKeyDown: (event: React.KeyboardEvent) => void;
  triggerDeleteEvent: (goalId: string) => void;
  confirmDeleteEvent: () => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (show: boolean) => void;
  goalIdToDelete: string | null;
  setEditGoalTime: (time: string) => void;
  setEditGoalScorerId: (scorerId: string) => void;
  setEditGoalAssisterId: (assisterId: string | undefined) => void;
}

const formatTime = (timeInSeconds: number): string => {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = timeInSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export function useGoalEditor(params: UseGoalEditorParams): UseGoalEditorResult {
  const {
    gameEvents,
    onUpdateGameEvent,
    onDeleteGameEvent,
    setLocalGameEvents,
    setIsEditingNotes,
    setInlineEditingField,
    t,
    showToast,
  } = params;

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editGoalTime, setEditGoalTime] = useState<string>('');
  const [editGoalScorerId, setEditGoalScorerId] = useState<string>('');
  const [editGoalAssisterId, setEditGoalAssisterId] = useState<string | undefined>(undefined);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [goalIdToDelete, setGoalIdToDelete] = useState<string | null>(null);
  const goalTimeInputRef = useRef<HTMLInputElement>(null);

  const handleStartEditGoal = (goal: GameEvent) => {
    setEditingGoalId(goal.id);
    setEditGoalTime(formatTime(goal.time));
    setEditGoalScorerId(goal.scorerId ?? '');
    setEditGoalAssisterId(goal.assisterId ?? '');
    setIsEditingNotes(false);
    setInlineEditingField(null);
  };

  const handleCancelEditGoal = () => {
    setEditingGoalId(null);
  };

  const handleSaveEditGoal = () => {
    if (!editingGoalId) return;

    const originalGoal = gameEvents.find(e => e.id === editingGoalId);
    if (!originalGoal) {
      handleCancelEditGoal();
      return;
    }

    // Parse time MM:SS format
    const timeParts = editGoalTime.match(/^(\d{1,2}):(\d{1,2})$/);
    let timeInSeconds = 0;

    if (timeParts) {
      const m = parseInt(timeParts[1], 10);
      const s = parseInt(timeParts[2], 10);
      if (!isNaN(m) && !isNaN(s) && m >= 0 && s >= 0 && s < 60) {
        timeInSeconds = m * 60 + s;
      } else {
        showToast(t('gameStatsModal.invalidTimeFormat', 'Invalid time format. MM:SS'), 'error');
        goalTimeInputRef.current?.focus();
        return;
      }
    } else {
      showToast(t('gameStatsModal.invalidTimeFormat', 'Invalid time format. MM:SS'), 'error');
      goalTimeInputRef.current?.focus();
      return;
    }

    const updatedScorerId = editGoalScorerId;
    const updatedAssisterId = editGoalAssisterId || undefined;

    if (!updatedScorerId) {
      showToast(t('gameStatsModal.scorerRequired', 'Scorer must be selected.'), 'error');
      return;
    }

    const updatedEvent: GameEvent = {
      ...originalGoal,
      time: timeInSeconds,
      scorerId: updatedScorerId,
      assisterId: updatedAssisterId
    };

    if (typeof onUpdateGameEvent === 'function') {
      onUpdateGameEvent(updatedEvent);
    }

    handleCancelEditGoal();
  };

  const handleGoalEditKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSaveEditGoal();
    } else if (event.key === 'Escape') {
      handleCancelEditGoal();
    }
  };

  const triggerDeleteEvent = (goalId: string) => {
    setGoalIdToDelete(goalId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteEvent = () => {
    if (goalIdToDelete && onDeleteGameEvent && typeof onDeleteGameEvent === 'function') {
      onDeleteGameEvent(goalIdToDelete);
      setLocalGameEvents(prevEvents => prevEvents.filter(event => event.id !== goalIdToDelete));
    }
    setShowDeleteConfirm(false);
    setGoalIdToDelete(null);
  };

  return {
    editingGoalId,
    editGoalTime,
    editGoalScorerId,
    editGoalAssisterId,
    goalTimeInputRef,
    handleStartEditGoal,
    handleCancelEditGoal,
    handleSaveEditGoal,
    handleGoalEditKeyDown,
    triggerDeleteEvent,
    confirmDeleteEvent,
    showDeleteConfirm,
    setShowDeleteConfirm,
    goalIdToDelete,
    setEditGoalTime,
    setEditGoalScorerId,
    setEditGoalAssisterId,
  };
}
