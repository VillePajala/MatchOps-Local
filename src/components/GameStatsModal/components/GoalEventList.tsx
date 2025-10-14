/**
 * GoalEventList component - displays and manages goal events
 * Supports viewing, editing, and deleting goal events
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaEdit, FaTrashAlt } from 'react-icons/fa';
import { GameEvent, Player } from '@/types';

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
                <div className="flex items-center gap-2">
                  {goal.type === 'goal' && (
                    <button
                      onClick={() => onStartEditGoal(goal)}
                      className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-md transition-colors"
                      aria-label={t('common.edit', 'Edit')}
                    >
                      <FaEdit />
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteGoal(goal.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-md transition-colors"
                    aria-label={t('common.delete', 'Delete')}
                  >
                    <FaTrashAlt />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
