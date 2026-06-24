'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { ShootoutKick } from '@/types/game';
import { getShootoutTally, getShootoutWinner } from '@/utils/shootout';

interface ShootoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Your selectable players (for naming your shooters). */
  availablePlayers: Player[];
  /** The game's existing kicks (edited as a working copy). */
  initialKicks: ShootoutKick[];
  /** Persist the kicks (commits the working copy). */
  onSave: (kicks: ShootoutKick[]) => void;
  /** Which side is "your" team. */
  homeOrAway: 'home' | 'away';
}

/**
 * Free-form penalty-shootout logger. The coach logs each kick (your players by
 * name, opponents anonymous) in whatever order/format actually happened — no
 * fixed format is enforced. The tally and winner are derived from the kicks,
 * mirroring how the match score is built from goals.
 */
const ShootoutModal: React.FC<ShootoutModalProps> = ({
  isOpen,
  onClose,
  availablePlayers,
  initialKicks,
  onSave,
  homeOrAway,
}) => {
  const { t } = useTranslation();
  const [kicks, setKicks] = useState<ShootoutKick[]>(initialKicks);
  const [scorerId, setScorerId] = useState<string>('');

  // Reset the working copy whenever the modal (re)opens.
  useEffect(() => {
    if (isOpen) {
      setKicks(initialKicks);
      setScorerId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const yourSide: 'home' | 'away' = homeOrAway === 'away' ? 'away' : 'home';
  const oppSide: 'home' | 'away' = yourSide === 'home' ? 'away' : 'home';

  const tally = getShootoutTally(kicks);
  const winner = getShootoutWinner(kicks);
  const yourScore = tally[yourSide];
  const oppScore = tally[oppSide];

  const addKick = (team: 'home' | 'away', scored: boolean, kickScorerId?: string) => {
    setKicks((prev) => [
      ...prev,
      {
        id: `so_${prev.length}_${Date.now()}`,
        team,
        scored,
        order: prev.length,
        ...(kickScorerId ? { scorerId: kickScorerId } : {}),
      },
    ]);
  };

  const removeKick = (id: string) => {
    setKicks((prev) => prev.filter((k) => k.id !== id).map((k, i) => ({ ...k, order: i })));
  };

  const handleSave = () => {
    onSave(kicks);
    onClose();
  };

  const playerName = (id?: string) =>
    (id && availablePlayers.find((p) => p.id === id)?.name) ||
    t('shootoutModal.yourPlayer', 'Your player');

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] font-display"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shootout-modal-title"
    >
      <div className="bg-slate-800 shadow-xl flex flex-col border-0 overflow-hidden h-full w-full relative">
        {/* Header */}
        <div className="flex justify-center items-center pt-10 pb-4 px-6 shrink-0">
          <h2 id="shootout-modal-title" className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
            {t('shootoutModal.title', 'Penalty Shootout')}
          </h2>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 pb-4 space-y-5">
          {/* Tally */}
          <div className="bg-slate-900/70 rounded-lg p-4 text-center border border-slate-700">
            <div className="text-4xl font-bold text-yellow-400">
              {yourScore} - {oppScore}
            </div>
            <div className="text-sm text-slate-400 mt-1">
              {t('shootoutModal.you', 'You')} · {t('shootoutModal.opponent', 'Opponent')}
            </div>
            <div className="text-sm mt-2">
              {winner === null ? (
                <span className="text-slate-400">{t('shootoutModal.tied', 'Tied — keep logging until decided')}</span>
              ) : winner === yourSide ? (
                <span className="text-green-400 font-semibold">{t('shootoutModal.youWin', 'You win the shootout')}</span>
              ) : (
                <span className="text-red-400 font-semibold">{t('shootoutModal.youLose', 'Opponent wins the shootout')}</span>
              )}
            </div>
          </div>

          {/* Your team kick entry */}
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700 space-y-2">
            <label htmlFor="shootoutScorer" className="block text-sm font-medium text-slate-300">
              {t('shootoutModal.yourKick', 'Your kick')}
            </label>
            <select
              id="shootoutScorer"
              value={scorerId}
              onChange={(e) => setScorerId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">{t('shootoutModal.unknownShooter', 'Shooter (optional)')}</option>
              {availablePlayers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { addKick(yourSide, true, scorerId || undefined); setScorerId(''); }}
                className="flex-1 px-3 py-2 rounded-md bg-green-600/80 hover:bg-green-600 text-white text-sm font-semibold transition-colors"
              >
                {t('shootoutModal.scored', 'Scored')}
              </button>
              <button
                type="button"
                onClick={() => { addKick(yourSide, false, scorerId || undefined); setScorerId(''); }}
                className="flex-1 px-3 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white text-sm font-semibold transition-colors"
              >
                {t('shootoutModal.missed', 'Missed')}
              </button>
            </div>
          </div>

          {/* Opponent kick entry */}
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700 space-y-2">
            <span className="block text-sm font-medium text-slate-300">{t('shootoutModal.opponentKick', 'Opponent kick')}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addKick(oppSide, true)}
                className="flex-1 px-3 py-2 rounded-md bg-green-600/80 hover:bg-green-600 text-white text-sm font-semibold transition-colors"
              >
                {t('shootoutModal.scored', 'Scored')}
              </button>
              <button
                type="button"
                onClick={() => addKick(oppSide, false)}
                className="flex-1 px-3 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white text-sm font-semibold transition-colors"
              >
                {t('shootoutModal.missed', 'Missed')}
              </button>
            </div>
          </div>

          {/* Kick log */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">{t('shootoutModal.kickLog', 'Kicks')}</h3>
            {kicks.length === 0 ? (
              <p className="text-sm text-slate-500">{t('shootoutModal.noKicks', 'No kicks logged yet.')}</p>
            ) : (
              <ul className="space-y-1">
                {kicks.map((kick, i) => (
                  <li key={kick.id} className="flex items-center justify-between text-sm bg-slate-900/40 rounded px-3 py-1.5">
                    <span className="text-slate-200">
                      <span className="text-slate-500 mr-2">{i + 1}.</span>
                      {kick.team === yourSide ? playerName(kick.scorerId) : t('shootoutModal.opponent', 'Opponent')}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className={kick.scored ? 'text-green-400' : 'text-slate-500'}>
                        {kick.scored ? t('shootoutModal.scored', 'Scored') : t('shootoutModal.missed', 'Missed')}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeKick(kick.id)}
                        aria-label={t('shootoutModal.removeKick', 'Remove kick')}
                        className="text-slate-500 hover:text-red-400 text-lg leading-none"
                      >
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-slate-700 bg-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            {t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShootoutModal;
