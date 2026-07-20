'use client';

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsibleModalHeader } from '@/styles/modalStyles';
import packageJson from '../../package.json';
import {
  HiOutlineSquares2X2,
  HiOutlinePlusCircle,
  HiOutlineClipboard,
  HiBars3,
  HiOutlineTrash,
  HiOutlineBackspace,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineXMark,
} from 'react-icons/hi2';

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "How it works" guide, rebuilt for the two-level app structure:
 *  - Home (the club hub) with its four tabs + gear, and
 *  - Match Mode (the field) with its tools.
 * Opened from the Home gear sheet. The old version described a single-screen
 * "open the Menu" layout that the two-level restructure replaced.
 */
const InstructionsModal: React.FC<InstructionsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sectionBox = 'bg-slate-900/50 rounded-lg p-4 border border-slate-700/50';
  const list = 'text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400';
  const heading = 'text-2xl font-bold text-yellow-300';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display" role="dialog" aria-modal="true" aria-label={t('instructionsModal.title')}>
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
        <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-sky-400/10 blur-3xl opacity-50 rounded-full pointer-events-none" />
        <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-indigo-600/10 blur-3xl opacity-50 rounded-full pointer-events-none" />

        <CollapsibleModalHeader
          title={t('instructionsModal.title')}
          onClose={onClose}
          closeLabel={t('common.doneButton', 'Done')}
        />

        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-6">
          {/* === HOME: the club hub === */}
          <section className="space-y-3">
            <h3 className={heading}>{t('appGuide.homeTitle', 'Home — your club hub')}</h3>
            <p className="text-sm text-slate-300">{t('appGuide.homeIntro', 'The Home screen has four tabs plus the gear menu. Everything about your club lives here; a match opens on its own field.')}</p>
            <div className={sectionBox}>
              <ul className={list}>
                <li>{t('appGuide.homeGamesTab', 'Games: start a new match, continue where you left off, open saved games and the match planner.')}</li>
                <li>{t('appGuide.homeTeamTab', 'Team: your players, teams, staff, and the warmup plan.')}</li>
                <li>{t('appGuide.homeCompetitionsTab', 'Competitions: set up seasons and tournaments to group your games.')}</li>
                <li>{t('appGuide.homeStatsTab', 'Stats: season, tournament, overall and player statistics.')}</li>
                <li>{t('appGuide.homeGear', 'The gear icon (top-left): settings, backups, your account, and this guide.')}</li>
              </ul>
            </div>
          </section>

          {/* === MATCH MODE: the field === */}
          <section className="space-y-3">
            <h3 className={heading}>{t('firstGameGuide.playerSelection', 'Player Selection (Top Bar)')}</h3>
            <div className={sectionBox}>
              <ul className={list}>
                <li>{t('firstGameGuide.tapToSelect', 'Tap player disc to select')}</li>
                <li>{t('firstGameGuide.tapFieldPlace', 'Tap field to place player')}</li>
                <li>{t('firstGameGuide.dragToAdjust', 'Drag players to reposition them')}</li>
                <li>{t('firstGameGuide.doubleTapRemove', 'Double-tap to remove a player from the field')}</li>
                <li>{t('firstGameGuide.goalieInstructions', 'Set goalies by tapping a player disc in the top bar')}</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className={heading}>{t('firstGameGuide.controlBar', 'Control Bar (Bottom)')}</h3>
            <div className={sectionBox}>
              <ul className={list}>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.tacticsButtonTip', 'Click Tactics Board to access drawing tools:')}</span>
                  <HiOutlineClipboard aria-hidden className="inline-block align-[-2px] ml-2 text-indigo-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.placeAllTip', 'Place all players at once:')}</span>
                  <HiOutlineSquares2X2 aria-hidden className="inline-block align-[-2px] ml-2 text-purple-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.timerTip', 'Click timer to show/hide large overlay')}</span>
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.resetFieldTip', 'Reset field:')}</span>
                  <HiOutlineTrash aria-hidden className="inline-block align-[-2px] ml-2 text-red-400" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.menuTip', 'Open menu for more options:')}</span>
                  <HiBars3 aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className={heading}>{t('firstGameGuide.drawingTools', 'Drawing & Tactical Tools')}</h3>
            <p className="text-sm text-slate-300">{t('firstGameGuide.drawingToolsNote', 'After clicking Tactics Board, you can:')}</p>
            <div className={sectionBox}>
              <ul className={list}>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.undoRedoTip', 'Undo/Redo actions:')}</span>
                  <span className="inline-flex items-center ml-2 gap-1 align-[-2px]">
                    <HiOutlineArrowUturnLeft aria-hidden className="text-slate-300" size={16} />
                    <HiOutlineArrowUturnRight aria-hidden className="text-slate-300" size={16} />
                  </span>
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.addHomeDiscTip', 'Add home disc (tactics mode):')}</span>
                  <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-purple-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.addOpponentTip', 'Add opponents/discs:')}</span>
                  <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-red-300" size={18} />
                </li>
                <li>{t('firstGameGuide.drawLinesTip', 'Draw lines and arrows with your finger')}</li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.clearDrawingsTip', 'Clear drawings:')}</span>
                  <HiOutlineBackspace aria-hidden className="inline-block align-[-2px] ml-2 text-amber-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.closeToolsTip', 'Exit tools:')}</span>
                  <HiOutlineXMark aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
                </li>
              </ul>
            </div>
          </section>

          {/* === IN-MATCH MENU (slim - match-scope only) === */}
          <section className="space-y-3">
            <h3 className={heading}>{t('appGuide.matchMenuTitle', 'The match menu')}</h3>
            <p className="text-sm text-slate-300">
              {t('appGuide.matchMenuNote', 'While in a match, the menu holds match-day actions:')}
              <HiBars3 aria-hidden className="inline-block align-[-2px] ml-2 text-indigo-300" size={18} />
            </p>
            <div className={sectionBox}>
              <ul className={list}>
                <li>{t('firstGameGuide.gameSettingsTip', 'Edit match details')}</li>
                <li>{t('firstGameGuide.assessPlayersTip', 'Assess players and view match stats')}</li>
                <li>{t('firstGameGuide.backHomeTip', 'Return to the Home screen (Koti) — the phone back button does the same')}</li>
              </ul>
            </div>
          </section>

          {/* Tips */}
          <section className="space-y-3">
            <h3 className="text-xl font-semibold text-yellow-300">{t('instructionsModal.tips.title')}</h3>
            <div className="bg-indigo-900/30 rounded-lg p-4 border border-indigo-700/50">
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li>{t('instructionsModal.tips.tip1')}</li>
                <li>{t('instructionsModal.tips.tip2')}</li>
                <li>{t('instructionsModal.tips.tip3')}</li>
              </ul>
            </div>
          </section>

          <p className="text-xs text-slate-500 text-center pt-2">v{packageJson.version}</p>
        </div>
      </div>
    </div>
  );
};

export default InstructionsModal;
