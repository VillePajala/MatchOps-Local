/**
 * GoalEventList component - displays and manages goal events
 * Supports viewing, editing, and deleting goal events
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineEllipsisVertical, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi2';
import { GameEvent, Player } from '@/types';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';

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
  const seconds = timeInSeconds % 60;
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
    <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <h3 className="text-xl font-semibold text-slate-200 mb-4">
        {t('gameStatsModal.goalLogTitle', 'Goal Log')}
      </h3>
      <div className="space-y-2">
        {goals.filter(g => g.type === 'goal' || g.type === 'opponentGoal').map(goal => (
          <div
            key={goal.id}
            className={`p-3 rounded-md border transition-all ${
              editingGoalId === goal.id
                ? 'bg-slate-700/75 border-indigo-500'
                : 'bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 border-slate-700/50'
            }`}
          >
            {editingGoalId === goal.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      {t('common.time', 'Time')}
                    </label>
                    <input
                      ref={goalTimeInputRef}
                      type="text"
                      value={editGoalTime}
                      onChange={(e) => onEditGoalTimeChange(e.target.value)}
                      onKeyDown={onGoalEditKeyDown}
                      placeholder="MM:SS"
                      className="w-full bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      {t('common.scorer', 'Scorer')}
                    </label>
                    <select
                      value={editGoalScorerId}
                      onChange={(e) => onEditGoalScorerChange(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 text-sm"
                    >
                      <option value="">{t('common.select', 'Select...')}</option>
                      {availablePlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      {t('common.assist', 'Assist')}
                    </label>
                    <select
                      value={editGoalAssisterId}
                      onChange={(e) => onEditGoalAssisterChange(e.target.value || undefined)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 text-sm"
                    >
                      <option value="">{t('common.none', 'None')}</option>
                      {availablePlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={onCancelEditGoal}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded-md text-sm font-medium transition-colors"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={onSaveEditGoal}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors"
                  >
                    {t('common.save', 'Save Changes')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-slate-300 text-lg w-16">
                    {formatTime(goal.time)}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-100">
                      {goal.type === 'goal'
                        ? availablePlayers.find((p) => p.id === goal.scorerId)?.name || 'N/A'
                        : opponentName}
                    </span>
                    {goal.type === 'goal' && goal.assisterId && (
                      <span className="text-sm text-slate-400">
                        {t('common.assist', 'Assist')}:{' '}
                        {availablePlayers.find((p) => p.id === goal.assisterId)?.name || ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative" ref={goalActionsMenuId === goal.id ? actionsMenuRef : null}>
                  <button
                    onClick={(e) => handleActionsMenuToggle(e, goal.id)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-600 transition-colors"
                    aria-label={t('common.actions', 'Actions')}
                  >
                    <HiOutlineEllipsisVertical className="w-5 h-5" aria-hidden="true" />
                  </button>

                  {goalActionsMenuId === goal.id && (
                    <div className={`absolute right-0 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-50 ${menuPositions[goal.id] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                      {goal.type === 'goal' && (
                        <button
                          onClick={() => {
                            setGoalActionsMenuId(null);
                            onStartEditGoal(goal);
                          }}
                          className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 first:rounded-t-md transition-colors"
                        >
                          <HiOutlinePencil className="w-4 h-4" aria-hidden="true" />
                          {t('common.edit', 'Edit')}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setGoalActionsMenuId(null);
                          onDeleteGoal(goal.id);
                        }}
                        className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600/20 flex items-center gap-2 last:rounded-b-md transition-colors"
                      >
                        <HiOutlineTrash className="w-4 h-4" aria-hidden="true" />
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
    </div>
  );
}
