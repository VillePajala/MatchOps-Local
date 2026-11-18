/**
 * GoalEventList component - displays and manages goal events
 * Supports viewing, editing, and deleting goal events
 */

import { sortPlayersByLastName, playerListLabel } from '@/utils/gamePlayerList';
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineEllipsisVertical, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi2';
import { GameEvent, Player } from '@/types';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import {
  cardStyle,
  labelStyle,
  inputBaseStyle,
  selectStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  iconButtonEditStyle,
  popoverMenuStyle,
  popoverItemStyle,
} from '@/styles/modalStyles';

interface GoalEventListProps {
  goals: GameEvent[];
  availablePlayers: Player[];
  opponentName: string;
  editingGoalId: string | null;
  editGoalTime: string;
  editGoalScorerId: string;
  editGoalAssisterId: string | undefined;
  goalTimeInputRef: React.RefObject<HTMLInputElement | null>;
  onStartEditGoal: (goal: GameEvent) => void;
  onCancelEditGoal: () => void;
  onSaveEditGoal: () => void;
  onGoalEditKeyDown: (event: React.KeyboardEvent) => void;
  onDeleteGoal: (goalId: string) => void;
  onEditGoalTimeChange: (time: string) => void;
  onEditGoalScorerChange: (scorerId: string) => void;
  onEditGoalAssisterChange: (assisterId: string | undefined) => void;
}

const formatTime = (timeInSeconds: number): string => {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export function GoalEventList({
  goals,
  availablePlayers,
  opponentName,
  editingGoalId,
  editGoalTime,
  editGoalScorerId,
  editGoalAssisterId,
  goalTimeInputRef,
  onStartEditGoal,
  onCancelEditGoal,
  onSaveEditGoal,
  onGoalEditKeyDown,
  onDeleteGoal,
  onEditGoalTimeChange,
  onEditGoalScorerChange,
  onEditGoalAssisterChange,
}: GoalEventListProps) {
  const { t } = useTranslation();
  // The app's one player order and name format (review 7.L5/7.L8).
  const orderedPlayers = React.useMemo(() => sortPlayersByLastName(availablePlayers), [availablePlayers]);

  // State for actions menu
  const [goalActionsMenuId, setGoalActionsMenuId] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [menuPositions, setMenuPositions] = useState<Record<string, boolean>>({});
  const { calculatePosition } = useDropdownPosition();

  // Close actions menu when clicking outside
  useEffect(() => {
    if (!goalActionsMenuId) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setGoalActionsMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [goalActionsMenuId]);

  const handleActionsMenuToggle = (e: React.MouseEvent<HTMLButtonElement>, goalId: string) => {
    const shouldOpenUpward = calculatePosition(e.currentTarget);
    setMenuPositions(prev => ({ ...prev, [goalId]: shouldOpenUpward }));
    setGoalActionsMenuId(goalActionsMenuId === goalId ? null : goalId);
  };

  return (
    <div className={`${cardStyle} font-ui`}>
      <h3 className="text-base font-semibold text-ink mb-3">
        {t('gameStatsModal.goalLogTitle', 'Goal Log')}
      </h3>
      {goals.length === 0 ? (
        <p className="text-sm text-ink-3">
          {t('gameStatsModal.noGoals', 'No goals recorded.')}
        </p>
      ) : (
      <div className="space-y-2">
        {goals.map(goal => (
          <div
            key={goal.id}
            className={`p-3 rounded-2xl transition-colors ${
              editingGoalId === goal.id
                ? 'bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--color-action)]'
                : 'bg-white/[0.03] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)] hover:bg-white/[0.05]'
            }`}
          >
            {editingGoalId === goal.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelStyle}>
                      {t('common.time', 'Time')}
                    </label>
                    <input
                      ref={goalTimeInputRef}
                      type="text"
                      value={editGoalTime}
                      onChange={(e) => onEditGoalTimeChange(e.target.value)}
                      onKeyDown={onGoalEditKeyDown}
                      placeholder="MM:SS"
                      className={inputBaseStyle}
                    />
                  </div>
                  <div>
                    <label className={labelStyle}>
                      {t('common.scorer', 'Scorer')}
                    </label>
                    <select
                      value={editGoalScorerId}
                      onChange={(e) => onEditGoalScorerChange(e.target.value)}
                      className={selectStyle}
                    >
                      <option value="">{t('common.select', 'Select')}</option>
                      {orderedPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {playerListLabel(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelStyle}>
                      {t('common.assist', 'Assist')}
                    </label>
                    <select
                      value={editGoalAssisterId}
                      onChange={(e) => onEditGoalAssisterChange(e.target.value || undefined)}
                      className={selectStyle}
                    >
                      <option value="">{t('common.none', 'None')}</option>
                      {orderedPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {playerListLabel(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={onCancelEditGoal}
                    className={secondaryButtonStyle}
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={onSaveEditGoal}
                    className={primaryButtonStyle}
                  >
                    {t('common.save', 'Save')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-display text-xl font-bold text-ink-2 tabular-nums w-14">
                    {formatTime(goal.time)}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-semibold text-ink">
                      {goal.type === 'goal'
                        ? availablePlayers.find((p) => p.id === goal.scorerId)?.name || 'N/A'
                        : opponentName}
                    </span>
                    {goal.type === 'goal' && goal.assisterId && (
                      <span className="text-sm text-ink-3">
                        {t('common.assist', 'Assist')}:{' '}
                        {availablePlayers.find((p) => p.id === goal.assisterId)?.name || ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative" ref={goalActionsMenuId === goal.id ? actionsMenuRef : null}>
                  <button
                    onClick={(e) => handleActionsMenuToggle(e, goal.id)}
                    className={iconButtonEditStyle}
                    aria-label={t('common.actions', 'Actions')}
                  >
                    <HiOutlineEllipsisVertical className="w-5 h-5" />
                  </button>

                  {goalActionsMenuId === goal.id && (
                    <div className={`${popoverMenuStyle} ${menuPositions[goal.id] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                      {goal.type === 'goal' && (
                        <button
                          onClick={() => {
                            setGoalActionsMenuId(null);
                            onStartEditGoal(goal);
                          }}
                          className={popoverItemStyle}
                        >
                          <HiOutlinePencil className="w-4 h-4" />
                          {t('common.edit', 'Edit')}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setGoalActionsMenuId(null);
                          onDeleteGoal(goal.id);
                        }}
                        className={`${popoverItemStyle} text-red-400!`}
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
      </div>
      )}
    </div>
  );
}
