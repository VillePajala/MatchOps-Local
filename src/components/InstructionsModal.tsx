'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
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

        <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0">
          <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
            {t('instructionsModal.title')}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-6">
          {/* Base: Use First Game Guide content */}
          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('firstGameGuide.playerSelection', 'Player Selection (Top Bar)')}</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
                <li>{t('firstGameGuide.tapToSelect', 'Tap player disc to select')}</li>
                <li>{t('firstGameGuide.tapFieldPlace', 'Tap field to place player')}</li>
                <li>{t('firstGameGuide.dragToAdjust', 'Drag players to reposition them')}</li>
                <li>{t('firstGameGuide.doubleTapRemove', 'Double-tap to remove a player from the field')}</li>
                <li>{t('firstGameGuide.goalieInstructions', 'Set goalies via Menu → Roster')}</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('firstGameGuide.controlBar', 'Control Bar (Bottom)')}</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
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
            <h3 className="text-2xl font-bold text-yellow-300">{t('firstGameGuide.drawingTools', 'Drawing & Tactical Tools')}</h3>
            <p className="text-sm text-slate-300">{t('firstGameGuide.drawingToolsNote', 'After clicking Tactics Board, you can:')}</p>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
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
                  <span className="text-slate-200">{t('firstGameGuide.resetFieldTip', 'Reset field:')}</span>
                  <HiOutlineTrash aria-hidden className="inline-block align-[-2px] ml-2 text-red-400" size={18} />
                </li>
                <li>
                  <span className="text-slate-200">{t('firstGameGuide.closeToolsTip', 'Exit tools:')}</span>
                  <HiOutlineXMark aria-hidden className="inline-block align-[-2px] ml-2 text-slate-300" size={18} />
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('firstGameGuide.menuActions', 'Menu Actions')}</h3>
            <p className="text-sm text-slate-300">
              {t('firstGameGuide.menuActionsNote', 'Click the Menu button to access:')}
              <HiBars3 aria-hidden className="inline-block align-[-2px] ml-2 text-indigo-300" size={18} />
            </p>

            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('instructionsModal.menuActionsSection.gameManagement')}</h4>
              <ul className="text-sm leading-6 text-slate-200 space-y-1 list-disc pl-5 marker:text-slate-400 mb-3">
                <li>{t('instructionsModal.menuActionsSection.save')}</li>
                <li>{t('instructionsModal.menuActionsSection.loadGame')}</li>
                <li>{t('instructionsModal.menuActionsSection.newGame')}</li>
              </ul>

              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('instructionsModal.menuActionsSection.setupConfig')}</h4>
              <ul className="text-sm leading-6 text-slate-200 space-y-1 list-disc pl-5 marker:text-slate-400 mb-3">
                <li>{t('instructionsModal.menuActionsSection.gameSettings')}</li>
                <li>{t('instructionsModal.menuActionsSection.manageRoster')}</li>
                <li>{t('instructionsModal.menuActionsSection.manageTeams')}</li>
                <li>{t('instructionsModal.menuActionsSection.personnelManager')}</li>
                <li>{t('instructionsModal.menuActionsSection.manageSeasonsAndTournaments')}</li>
              </ul>

              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('instructionsModal.menuActionsSection.analysisTools')}</h4>
              <ul className="text-sm leading-6 text-slate-200 space-y-1 list-disc pl-5 marker:text-slate-400 mb-3">
                <li>{t('instructionsModal.menuActionsSection.stats')}</li>
                <li>{t('instructionsModal.menuActionsSection.assessPlayers')}</li>
                <li>{t('instructionsModal.menuActionsSection.training')}</li>
                <li>{t('instructionsModal.menuActionsSection.backupRestore')}</li>
              </ul>

              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('instructionsModal.menuActionsSection.resources')}</h4>
              <ul className="text-sm leading-6 text-slate-200 space-y-1 list-disc pl-5 marker:text-slate-400 mb-3">
                <li>{t('instructionsModal.menuActionsSection.howItWorks')}</li>
                <li>{t('instructionsModal.menuActionsSection.coachingMaterials')}</li>
                <li>{t('instructionsModal.menuActionsSection.taso')}</li>
                <li>{t('instructionsModal.menuActionsSection.docsFeatures')}</li>
              </ul>

              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t('instructionsModal.menuActionsSection.settings')}</h4>
              <ul className="text-sm leading-6 text-slate-200 space-y-1 list-disc pl-5 marker:text-slate-400">
                <li>{t('instructionsModal.menuActionsSection.appSettings')}</li>
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

        <ModalFooter>
          <button onClick={onClose} className={primaryButtonStyle}>
            {t('common.doneButton', 'Done')}
          </button>
        </ModalFooter>
      </div>
    </div>
  );
};

export default InstructionsModal;
