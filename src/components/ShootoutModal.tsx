'use client';

import { sortPlayersByLastName, playerListLabel } from '@/utils/gamePlayerList';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { ShootoutKick } from '@/types/game';
import { getShootoutTally, getShootoutWinner } from '@/utils/shootout';
import {
  CollapsibleModalHeader,
  ModalStickyPrimary,
  MODAL_BACKDROP,
  Z_LAYER,
  modalContainerStyle,
  cardStyle,
  sectionLabelStyle,
  subtextStyle,
  selectStyle,
  labelStyle,
  segmentTrackStyle,
  segmentStyle,
  segmentSelectedStyle,
  secondaryButtonStyle,
  neutralBadgeStyle,
  groupedListStyle,
  listRowStyle,
  iconButtonDangerStyle,
} from '@/styles/modalStyles';
import { HiOutlineXMark } from 'react-icons/hi2';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';

interface ShootoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The game's players - names of recorded shooters are looked up here. */
  availablePlayers: Player[];
  /**
   * The match squad (review 7.L2): only they are offered as a new shooter, like
   * every other match picker. Without it, the whole game list is offered.
   */
  squadIds?: string[];
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
  squadIds,
  initialKicks,
  onSave,
  homeOrAway,
  teamName,
  opponentName,
}) => {
  const { t } = useTranslation();
  const shooterOptions = useMemo(
    // The app's one player order (review 7.L5).
    () => sortPlayersByLastName(squadIds ? availablePlayers.filter((p) => squadIds.includes(p.id)) : availablePlayers),
    [availablePlayers, squadIds],
  );
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

  // Closing KEEPS the kicks (review 4.35, owner decision 2026-11-16): back, Escape
  // and the X save the working copy like Save does - losing ten live-recorded kicks
  // is far worse than keeping one the coach did not want (it can be removed here).
  // An untouched window saves nothing. No confirm prompt mid-shootout.
  const closeKeepingKicks = React.useCallback(() => {
    if (JSON.stringify(kicks) !== JSON.stringify(initialKicks)) onSave(kicks);
    onClose();
  }, [kicks, initialKicks, onSave, onClose]);

  useEscapeToClose(isOpen, closeKeepingKicks);
  // Hardware back closes THIS overlay first (review 4.18). Unregistered, back went
  // to whatever sat underneath (the timer overlay, or Match details together with
  // the shootout), and a second back left the match. Registered last, so topmost.
  useHardwareBackSubLevel(isOpen, closeKeepingKicks);


  if (!isOpen) return null;

  const yourSide: 'home' | 'away' = homeOrAway === 'away' ? 'away' : 'home';
  const oppSide: 'home' | 'away' = yourSide === 'home' ? 'away' : 'home';

  const tally = getShootoutTally(kicks);
  const winner = getShootoutWinner(kicks);
  // Everything here reads in the match scoreboard's order, home first: the
  // score, the names under it, the first-shot switch and the two kick panels.
  const homeName = yourSide === 'home' ? teamName : opponentName;
  const awayName = yourSide === 'home' ? opponentName : teamName;
  const sidesInOrder: Array<'you' | 'opponent'> = yourSide === 'home' ? ['you', 'opponent'] : ['opponent', 'you'];

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

  // "Scored" records a result, so it carries the result colour (green); "Missed"
  // is the plain ghost pill. Both are the house 44px pills.
  const scoredButtonClass = `${secondaryButtonStyle} flex-1 text-win! bg-win/[0.08]! shadow-[inset_0_0_0_1.5px_rgb(63_224_140/0.5)]!`;
  const missedButtonClass = `${secondaryButtonStyle} flex-1`;
  // The side that kicks next gets the amber ring (selection) and an "Up next" pill.
  const entryCardClass = (up: boolean) =>
    `${cardStyle} space-y-3 font-ui ${up ? 'shadow-[inset_0_0_0_1.5px_var(--color-action),0_16px_26px_-18px_rgb(2_6_23/0.85)]!' : ''}`;

  const playerName = (id?: string) =>
    (id && availablePlayers.find((p) => p.id === id)?.name) ||
    t('shootoutModal.yourPlayer', 'Your player');

  // Your team's kick entry: shooter picker + result.
  const yourPanel = (
    <div key="you" className={entryCardClass(nextUp === 'you')}>
      <label htmlFor="shootoutScorer" className={`${labelStyle} flex items-center justify-between gap-2 mb-2! text-[15px]! font-semibold! text-ink!`}>
        <span className="min-w-0 truncate">{teamName}</span>
        {nextUp === 'you' && (
          <span className={neutralBadgeStyle}>{t('shootoutModal.upNext', 'Up next')}</span>
        )}
      </label>
      <select
        id="shootoutScorer"
        value={scorerId}
        onChange={(e) => setScorerId(e.target.value)}
        className={selectStyle}
      >
        <option value="">{t('shootoutModal.unknownShooter', 'Shooter (optional)')}</option>
        {shooterOptions.map((p) => (
          <option key={p.id} value={p.id}>{playerListLabel(p)}</option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { addKick(yourSide, true, scorerId || undefined); setScorerId(''); }}
          className={scoredButtonClass}
        >
          {t('shootoutModal.scored', 'Scored')}
        </button>
        <button
          type="button"
          onClick={() => { addKick(yourSide, false, scorerId || undefined); setScorerId(''); }}
          className={missedButtonClass}
        >
          {t('shootoutModal.missed', 'Missed')}
        </button>
      </div>
    </div>
  );

  // The opponent's kick entry (anonymous shooters).
  const opponentPanel = (
    <div key="opponent" className={entryCardClass(nextUp === 'opponent')}>
      <span className="flex items-center justify-between gap-2 text-[15px] font-semibold text-ink">
        <span className="min-w-0 truncate">{opponentName}</span>
        {nextUp === 'opponent' && (
          <span className={neutralBadgeStyle}>{t('shootoutModal.upNext', 'Up next')}</span>
        )}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => addKick(oppSide, true)}
          className={scoredButtonClass}
        >
          {t('shootoutModal.scored', 'Scored')}
        </button>
        <button
          type="button"
          onClick={() => addKick(oppSide, false)}
          className={missedButtonClass}
        >
          {t('shootoutModal.missed', 'Missed')}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`${MODAL_BACKDROP} ${Z_LAYER.modalNested}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('shootoutModal.title', 'Penalty shootout')}
    >
      <div className={`${modalContainerStyle} h-full w-full relative`}>
        {/* Full-screen X-header (the X closes and keeps the kicks, 4.35); a
            one-line title and no subtitle, so the score sits high. */}
        <CollapsibleModalHeader
          title={t('shootoutModal.title', 'Penalty shootout')}
          onClose={closeKeepingKicks}
          closeLabel={t('common.close', 'Close')}
        />

        {/* Scrollable body */}
        {/* space-y-4 and a compact tally keep the "Shots (n)" label above the
            sticky Save bar at first fold on a ~366px phone. */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 pb-4 pt-2 space-y-4 font-ui">
          {/* Tally: the score as the home screen's italic numerals, result-coloured
              once the shootout is decided (green/red mean results). */}
          <div className={`${cardStyle} text-center`}>
            <div
              className={`font-display text-[56px] font-bold italic leading-none tabular-nums pr-[3px] ${
                winner === null ? 's1-numeral' : winner === yourSide ? 's1-numeral-win' : 's1-numeral-loss'
              }`}
            >
              {tally.home} - {tally.away}
            </div>
            <div className="text-sm text-ink-3 mt-2">
              {homeName} · {awayName}
            </div>
            <div className="text-[15px] mt-2">
              {winner === null ? (
                <span className="text-ink-2">{t('shootoutModal.tied', 'Tied — keep logging until decided')}</span>
              ) : winner === yourSide ? (
                <span className="text-win font-semibold">{t('shootoutModal.youWin', 'Shootout won')}</span>
              ) : (
                <span className="text-loss font-semibold">{t('shootoutModal.youLose', 'Shootout lost')}</span>
              )}
            </div>
          </div>

          {/* Who shoots first — sets the alternation guide (locked once kicks exist) */}
          <div>
            <p className={`${sectionLabelStyle} px-1 mb-2.5`}>{t('shootoutModal.firstKick', 'First shot')}</p>
            <div className={segmentTrackStyle}>
              {sidesInOrder.map((side) => (
                <button
                  key={side}
                  type="button"
                  disabled={starterLocked}
                  onClick={() => setFirstKick(side)}
                  aria-pressed={starter === side}
                  className={`${starter === side ? segmentSelectedStyle : segmentStyle} truncate ${starterLocked ? 'disabled:opacity-70 disabled:cursor-default' : ''}`}
                >
                  {side === 'you' ? teamName : opponentName}
                </button>
              ))}
            </div>
          </div>

          {/* The two kick panels, home first (scoreboard order). */}
          {sidesInOrder.map((side) => (side === 'you' ? yourPanel : opponentPanel))}

          {/* Kick log — newest first, latest highlighted, so each tap visibly adds a row */}
          <div>
            <h3 className={`${sectionLabelStyle} px-1 mb-2.5`}>
              {t('shootoutModal.kickLog', 'Shots')}{kicks.length > 0 ? ` (${kicks.length})` : ''}
            </h3>
            {kicks.length === 0 ? (
              <p className={`${subtextStyle} px-1`}>{t('shootoutModal.noKicks', 'No shots logged yet.')}</p>
            ) : (
              <ul className={groupedListStyle}>
                {[...kicks].reverse().map((kick) => {
                  const isNewest = kick.order === kicks.length - 1;
                  return (
                    <li
                      key={kick.id}
                      className={`${listRowStyle} justify-between text-[15px] ${isNewest ? 'bg-white/[0.05]' : ''}`}
                    >
                      <span className={`min-w-0 truncate ${isNewest ? 'text-ink font-semibold' : 'text-ink-2'}`}>
                        <span className="text-ink-3 tabular-nums mr-2">{kick.order + 1}.</span>
                        {kick.team === yourSide ? playerName(kick.scorerId) : opponentName}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <span className={`text-sm font-semibold ${kick.scored ? 'text-win' : 'text-ink-3'}`}>
                          {kick.scored ? t('shootoutModal.scored', 'Scored') : t('shootoutModal.missed', 'Missed')}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeKick(kick.id)}
                          aria-label={t('shootoutModal.removeKick', 'Remove shot')}
                          className={iconButtonDangerStyle}
                        >
                          <HiOutlineXMark className="w-5 h-5" aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Sticky primary in the thumb zone. Close (keeps the kicks) lives in the header X. */}
        <ModalStickyPrimary onClick={handleSave}>
          {t('common.save', 'Save')}
        </ModalStickyPrimary>
      </div>
    </div>
  );
};

export default ShootoutModal;
