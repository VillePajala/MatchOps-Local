'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineXMark,
  HiOutlineSquares2X2,
  HiOutlinePlusCircle,
  HiOutlineBackspace,
  HiOutlineTrash,
  HiOutlineClipboard,
  HiOutlineUsers,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineQuestionMarkCircle,
  HiBars3,
  HiOutlineFolderOpen,
  HiOutlineArchiveBoxArrowDown,
  HiOutlineTrophy,
  HiOutlineDocumentArrowDown,
  HiOutlineGlobeAlt,
  HiOutlineArrowsPointingOut,
  HiOutlineCog6Tooth,
  HiOutlineBookOpen,
} from 'react-icons/hi2';

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InstructionsModal: React.FC<InstructionsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />
        <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-sky-400/10 blur-3xl opacity-50 rounded-full pointer-events-none" />
        <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-indigo-600/10 blur-3xl opacity-50 rounded-full pointer-events-none" />

        <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0 relative">
          <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
            {t('instructionsModal.title')}
          </h2>
          <button onClick={onClose} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-100" title={t('instructionsModal.closeButton')}>
            <HiOutlineXMark className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-6">
          {/* Base: Use First Game Guide content */}
          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('firstGameGuide.playerSelection', 'Player Selection (Top Bar)')}</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
                <li>{t('firstGameGuide.tapToSelect', 'Tap player disc to select')}</li>
                <li>{t('firstGameGuide.goalieInstructions', 'When player is selected, tap shield icon to set as goalie')}</li>
                <li>{t('firstGameGuide.tapFieldPlace', 'Tap field to place player')}</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('firstGameGuide.theField', 'The Field')}</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
                <li>{t('firstGameGuide.dragToAdjust', 'Drag players by dragging')}</li>
                <li>{t('firstGameGuide.doubleTapRemove', 'Double-tap to remove a player from the field')}</li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.placeAllTip', 'Place all players at once with:')}</span>
                  <HiOutlineSquares2X2 aria-hidden className="inline-block align-[-2px] ml-2 text-purple-300" size={18} />
                </li>
                <li>{t('firstGameGuide.drawTactics', 'You can draw on the field with your finger')}</li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.addOpponentTip', 'Add opponents with:')}</span>
                  <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-red-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.clearDrawingsTip', 'Clear drawings with:')}</span>
                  <HiOutlineBackspace aria-hidden className="inline-block align-[-2px] ml-2 text-amber-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.resetFieldTip', 'Reset field with:')}</span>
                  <HiOutlineTrash aria-hidden className="inline-block align-[-2px] ml-2 text-red-400" size={18} />
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('firstGameGuide.tacticalView', 'Tactical View')}</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.tacticalSwitchTip', 'Switch to tactical mode by pressing:')}</span>
                  <HiOutlineClipboard aria-hidden className="inline-block align-[-2px] ml-2 text-indigo-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.addHomeDiscTip', 'Add a home disc with:')}</span>
                  <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-purple-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.addOpponentDiscTip', 'Add an opponent disc with:')}</span>
                  <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-red-300" size={18} />
                </li>
                <li>{t('firstGameGuide.drawLinesTip', 'Draw lines on the field with your finger')}</li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.clearDrawingsTip', 'Clear drawings with:')}</span>
                  <HiOutlineBackspace aria-hidden className="inline-block align-[-2px] ml-2 text-amber-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.resetFieldTip', 'Reset field with:')}</span>
                  <HiOutlineTrash aria-hidden className="inline-block align-[-2px] ml-2 text-red-400" size={18} />
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('firstGameGuide.quickActions', 'Quick Actions (Bottom Bar)')}</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.undoRedoTip', 'Undo/Redo your last actions:')}</span>
                  <span className="inline-flex items-center ml-2 gap-1 align-[-2px]">
                    <svg className="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 010 8h-1"/></svg>
                    <svg className="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 10l4 4-4 4"/><path d="M19 14H8a4 4 0 010-8h1"/></svg>
                  </span>
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.logGoalTip', 'Log a goal:')}</span>
                  <span className="inline-block align-[-2px] ml-2 text-blue-300">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>
                  </span>
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.rosterTip', 'Open roster settings:')}</span>
                  <HiOutlineUsers aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.gameSettingsTip', 'Open game settings:')}</span>
                  <HiOutlineAdjustmentsHorizontal aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.statsTip', 'Show stats:')}</span>
                  <HiOutlineClipboardDocumentList aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.timerOverlayTip', 'Show/hide large timer:')}</span>
                  <HiOutlineClock aria-hidden className="inline-block align-[-2px] ml-2 text-green-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.helpTip', 'Open help:')}</span>
                  <HiOutlineQuestionMarkCircle aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.menuTip', 'Open the menu for more:')}</span>
                  <HiBars3 aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
                </li>
              </ul>
            </div>
          </section>

          {/* Advanced features (keep existing section) */}
          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('instructionsModal.advanced.title', 'Advanced Features')}</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
                <li><span>{t('instructionsModal.advanced.saveLoad')}</span> <span className="inline-flex items-center gap-1 ml-2 align-[-2px]"><HiOutlineArchiveBoxArrowDown className="text-slate-300" size={18}/><HiOutlineFolderOpen className="text-slate-300" size={18}/></span></li>
                <li><span>{t('instructionsModal.advanced.teams')}</span> <HiOutlineUsers className="inline-block ml-2 text-slate-300 align-[-2px]" size={18}/></li>
                <li><span>{t('instructionsModal.advanced.seasonsTournaments')}</span> <HiOutlineTrophy className="inline-block ml-2 text-slate-300 align-[-2px]" size={18}/></li>
                <li><span>{t('instructionsModal.advanced.assessments')}</span> <HiOutlineClipboard className="inline-block ml-2 text-slate-300 align-[-2px]" size={18}/></li>
                <li><span>{t('instructionsModal.advanced.backupRestore')}</span> <HiOutlineDocumentArrowDown className="inline-block ml-2 text-slate-300 align-[-2px]" size={18}/></li>
                <li><span>{t('instructionsModal.advanced.exportData')}</span> <HiOutlineDocumentArrowDown className="inline-block ml-2 text-slate-300 align-[-2px]" size={18}/></li>
                <li><span>{t('instructionsModal.advanced.training')}</span> <HiOutlineBookOpen className="inline-block ml-2 text-slate-300 align-[-2px]" size={18}/></li>
                <li><span>{t('instructionsModal.advanced.language')}</span> <HiOutlineGlobeAlt className="inline-block ml-2 text-slate-300 align-[-2px]" size={18}/></li>
                <li><span>{t('instructionsModal.advanced.fullscreen')}</span> <HiOutlineArrowsPointingOut className="inline-block ml-2 text-slate-300 align-[-2px]" size={18}/></li>
                <li><span>{t('instructionsModal.advanced.settings')}</span> <HiOutlineCog6Tooth className="inline-block ml-2 text-slate-300 align-[-2px]" size={18}/></li>
              </ul>
            </div>
          </section>

          {/* Tips (retain) */}
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
        </div>

        <div className="p-4 border-t border-slate-700/20 backdrop-blur-sm bg-slate-900/20 flex-shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors">
            {t('instructionsModal.closeButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstructionsModal;
