'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { ShootoutKick } from '@/types/game';
import { getShootoutTally, getShootoutWinner } from '@/utils/shootout';
import { CollapsibleModalHeader, ModalStickyPrimary, useCollapsingHeader } from '@/styles/modalStyles';

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
  /** Team names, shown instead of generic "You"/"Opponent" labels. */
  teamName: string;
  opponentName: string;
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
  teamName,
  opponentName,
}) => {
  const { t } = useTranslation();
  const headerCollapse = useCollapsingHeader();
  const [kicks, setKicks] = useState<ShootoutKick[]>(initialKicks);
  const [scorerId, setScorerId] = useState<string>('');
  // Which side took the first kick (coin toss). Drives the alternation guide.
  const [firstKick, setFirstKick] = useState<'you' | 'opponent'>('you');

  // Reset the working copy whenever the modal (re)opens.
  useEffect(() => {
    if (isOpen) {
      setKicks(initialKicks);
      setScorerId('');
      const ys = homeOrAway === 'away' ? 'away' : 'home';
      setFirstKick(initialKicks.length > 0 ? (initialKicks[0].team === ys ? 'you' : 'opponent') : 'you');
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

  // Whose kick is up next, by strict alternation from the starter. Once kicks
  // exist the starter is whoever actually kicked first. This is a guide only —
  // either side's buttons stay tappable for unusual formats.
  const starter: 'you' | 'opponent' =
    kicks.length > 0 ? (kicks[0].team === yourSide ? 'you' : 'opponent') : firstKick;
  const nextUp: 'you' | 'opponent' =
    kicks.length % 2 === 0 ? starter : starter === 'you' ? 'opponent' : 'you';
  const starterLocked = kicks.length > 0;

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
      aria-label={t('shootoutModal.title', 'Penalty Shootout')}
    >
      <div className="bg-slate-800 shadow-xl flex flex-col border-0 overflow-hidden h-full w-full relative">
        {/* Chrome slimming: full-screen X-header (Cancel folds into the X);
            the instructions line collapses on scroll. */}
        <CollapsibleModalHeader
          title={t('shootoutModal.title', 'Penalty Shootout')}
          onClose={onClose}
          closeLabel={t('common.cancel', 'Cancel')}
          collapse={headerCollapse}
        >
          <p className="text-sm text-slate-400 text-center px-6 pb-3">
            {t('shootoutModal.instructions', 'Log each shot as it happens.')}
          </p>
        </CollapsibleModalHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 pb-4 pt-4 space-y-5" onScroll={headerCollapse.onScroll}>
          {/* Tally */}
          <div className="bg-slate-900/70 rounded-lg p-4 text-center border border-slate-700">
            <div className="text-4xl font-bold text-yellow-400">
              {yourScore} - {oppScore}
            </div>
            <div className="text-sm text-slate-400 mt-1">
              {teamName} · {opponentName}
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

          {/* Who shoots first — sets the alternation guide (locked once kicks exist) */}
          <div className="space-y-2">
            <p className="text-sm text-slate-400 text-center">{t('shootoutModal.firstKick', 'First shot')}</p>
            <div className="flex gap-2">
              {(['you', 'opponent'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  disabled={starterLocked}
                  onClick={() => setFirstKick(side)}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${starter === side ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} ${starterLocked ? 'opacity-70 cursor-default' : ''}`}
                >
                  {side === 'you' ? teamName : opponentName}
                </button>
              ))}
            </div>
          </div>

          {/* Your team kick entry */}
          <div className={`bg-slate-900/50 rounded-lg p-3 border space-y-2 ${nextUp === 'you' ? 'border-indigo-400 ring-2 ring-indigo-400/40' : 'border-slate-700'}`}>
            <label htmlFor="shootoutScorer" className="flex items-center justify-between text-sm font-medium text-slate-300">
              <span>{teamName}</span>
              {nextUp === 'you' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">{t('shootoutModal.upNext', 'Up next')}</span>
              )}
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
          <div className={`bg-slate-900/50 rounded-lg p-3 border space-y-2 ${nextUp === 'opponent' ? 'border-indigo-400 ring-2 ring-indigo-400/40' : 'border-slate-700'}`}>
            <span className="flex items-center justify-between text-sm font-medium text-slate-300">
              <span>{opponentName}</span>
              {nextUp === 'opponent' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">{t('shootoutModal.upNext', 'Up next')}</span>
              )}
            </span>
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

          {/* Kick log — newest first, latest highlighted, so each tap visibly adds a row */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">
              {t('shootoutModal.kickLog', 'Kicks')}{kicks.length > 0 ? ` (${kicks.length})` : ''}
            </h3>
            {kicks.length === 0 ? (
              <p className="text-sm text-slate-400">{t('shootoutModal.noKicks', 'No kicks logged yet.')}</p>
            ) : (
              <ul className="space-y-1">
                {[...kicks].reverse().map((kick) => {
                  const isNewest = kick.order === kicks.length - 1;
                  return (
                    <li
                      key={kick.id}
                      className={`flex items-center justify-between text-sm rounded px-3 py-1.5 transition-colors ${isNewest ? 'bg-indigo-500/15 ring-1 ring-indigo-400/40' : 'bg-slate-900/40'}`}
                    >
                      <span className={isNewest ? 'text-white' : 'text-slate-200'}>
                        <span className="text-slate-400 mr-2">{kick.order + 1}.</span>
                        {kick.team === yourSide ? playerName(kick.scorerId) : opponentName}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className={kick.scored ? 'text-green-400' : 'text-slate-400'}>
                          {kick.scored ? t('shootoutModal.scored', 'Scored') : t('shootoutModal.missed', 'Missed')}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeKick(kick.id)}
                          aria-label={t('shootoutModal.removeKick', 'Remove kick')}
                          className="text-slate-400 hover:text-red-400 text-lg leading-none"
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Sticky primary in the thumb zone. Cancel lives in the header X. */}
        <ModalStickyPrimary onClick={handleSave}>
          {t('common.save', 'Save')}
        </ModalStickyPrimary>
      </div>
    </div>
  );
};

export default ShootoutModal;
