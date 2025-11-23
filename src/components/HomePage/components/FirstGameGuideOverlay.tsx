import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineSquares2X2,
  HiOutlinePlusCircle,
  HiOutlineBackspace,
  HiOutlineTrash,
  HiOutlineUsers,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineClipboardDocumentList,
  HiOutlineClock,
  HiOutlineQuestionMarkCircle,
  HiBars3
} from 'react-icons/hi2';

interface FirstGameGuideOverlayProps {
  isVisible: boolean;
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}

export function FirstGameGuideOverlay({
  isVisible,
  step,
  onStepChange,
  onClose
}: FirstGameGuideOverlayProps) {
  const { t } = useTranslation();

  if (!isVisible) {
    return null;
  }

  const guideSteps = [
    {
      title: t('firstGameGuide.playerSelection', 'Player Selection (Top Bar)'),
      content: (
        <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
          <li>{t('firstGameGuide.tapToSelect', 'Tap player disc to select')}</li>
          <li>{t('firstGameGuide.goalieInstructions', 'When player is on field, tap shield icon to set as goalie')}</li>
          <li>{t('firstGameGuide.tapFieldPlace', 'Tap field to place player')}</li>
        </ul>
      )
    },
    {
      title: t('firstGameGuide.theField', 'The Field'),
      content: (
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
            <HiOutlineTrash aria-hidden className="inline-block align-[-2px] ml-2 text-rose-300" size={18} />
          </li>
        </ul>
      )
    },
    {
      title: t('firstGameGuide.tacticalView', 'Tactical View'),
      content: (
        <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
          <li>
            <span className="text-slate-200">{t('firstGameGuide.tacticalSwitchTip', 'Switch to tactical mode by pressing:')}</span>
            <HiOutlineSquares2X2 aria-hidden className="inline-block align-[-2px] ml-2 text-emerald-300" size={18} />
          </li>
          <li>
            <span className="text-slate-200">{t('firstGameGuide.addHomeDiscTip', 'Add a home disc with:')}</span>
            <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-sky-300" size={18} />
          </li>
          <li>
            <span className="text-slate-200">{t('firstGameGuide.addOpponentDiscTip', 'Add an opponent disc with:')}</span>
            <HiOutlinePlusCircle aria-hidden className="inline-block align-[-2px] ml-2 text-rose-300" size={18} />
          </li>
          <li>{t('firstGameGuide.drawLinesTip', 'Draw lines on the field with your finger')}</li>
          <li>
            <span className="text-slate-200">{t('firstGameGuide.clearDrawingsTip', 'Clear drawings with:')}</span>
            <HiOutlineBackspace aria-hidden className="inline-block align-[-2px] ml-2 text-amber-300" size={18} />
          </li>
          <li>
            <span className="text-slate-200">{t('firstGameGuide.resetFieldTip', 'Reset field with:')}</span>
            <HiOutlineTrash aria-hidden className="inline-block align-[-2px] ml-2 text-rose-300" size={18} />
          </li>
        </ul>
      )
    },
    {
      title: t('firstGameGuide.quickActions', 'Quick Actions (Bottom Bar) 1/2'),
      content: (
        <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
          <li>
            <span className="text-slate-200">{t('firstGameGuide.undoRedoTip', 'Undo/Redo your last actions:')}</span>
            <span className="inline-flex items-center ml-2 gap-1 align-[-2px]">
              <svg className="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14l-4-4 4-4" /><path d="M5 10h11a4 4 0 010 8h-1" /></svg>
              <svg className="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 10l4 4-4 4" /><path d="M19 14H8a4 4 0 010-8h1" /></svg>
            </span>
          </li>
          <li>
            <span className="text-slate-200">{t('firstGameGuide.logGoalTip', 'Log a goal:')}</span>
            <span className="inline-block align-[-2px] ml-2 text-blue-300">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg>
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
        </ul>
      )
    },
    {
      title: t('firstGameGuide.quickActions2', 'Quick Actions (Bottom Bar) 2/2'),
      content: (
        <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
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
      )
    },
    {
      title: t('firstGameGuide.menuActions', 'Menu Actions 1/2'),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">{t('firstGameGuide.menuActionsNote', 'Click the Menu button to access:')}</p>
          <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
            <li>{t('firstGameGuide.startNewGameTip', 'Start a new game')}</li>
            <li>{t('firstGameGuide.loadGameTip', 'Load a saved game')}</li>
            <li>{t('firstGameGuide.quickSaveTip', 'Quick save your game (Ctrl/Cmd+S)')}</li>
            <li>{t('firstGameGuide.goalLogTip', 'Log goals and events')}</li>
            <li>{t('firstGameGuide.rosterManageTip', 'Manage your roster')}</li>
          </ul>
        </div>
      )
    },
    {
      title: t('firstGameGuide.menuActions2', 'Menu Actions 2/2'),
      content: (
        <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
          <li>{t('firstGameGuide.gameSettingsTip', 'Edit game settings')}</li>
          <li>{t('firstGameGuide.statsReportsTip', 'View stats and reports')}</li>
          <li>{t('firstGameGuide.seasonsTeamsTip', 'Manage seasons, teams, and personnel')}</li>
          <li>{t('firstGameGuide.helpTip', 'Get help and instructions')}</li>
          <li>{t('firstGameGuide.appSettingsTip', 'Access app settings')}</li>
        </ul>
      )
    }
  ];

  const currentStep = guideSteps[step];

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none px-6 py-12">
      <div className="relative bg-slate-800/95 rounded-2xl p-7 sm:p-8 max-w-md sm:max-w-lg w-full pointer-events-auto shadow-2xl backdrop-blur-sm max-h-[85vh] flex flex-col ring-1 ring-indigo-400/30">
        <header className="text-center mb-3">
          <h2 className="text-xl sm:text-2xl;font-bold text-indigo-300 leading-snug max-w-[20ch] mx-auto">
            {t('firstGameGuide.title', 'Welcome to Your First Game!')}
          </h2>
          <p className="text-slate-300 text-sm mt-1">
            {t('firstGameGuide.subtitle', "Let's quickly go over the basics")}
          </p>
          <div className="h-px bg-indigo-400/20 mt-3" />
        </header>

        <section className="flex-1 overflow-hidden">
          <div className="space-y-3">
            <h3 className="font-semibold text-indigo-200 text-base">{currentStep.title}</h3>
            {currentStep.content}
          </div>
        </section>

        <footer className="mt-6 flex items-center justify-between gap-4">
          <button
            onClick={() => onStepChange(Math.max(0, step - 1))}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={step === 0}
          >
            {t('common.previous', 'Previous')}
          </button>
          <div className="flex-1 flex justify-center gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map((indicator) => (
              <button
                key={indicator}
                onClick={() => onStepChange(indicator)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  step === indicator ? 'bg-indigo-400' : 'bg-slate-600 hover:bg-slate-500'
                }`}
                aria-label={t('firstGameGuide.step', 'Step {{step}}', { step: indicator + 1 })}
              />
            ))}
          </div>
          <button
            onClick={step === 6 ? onClose : () => onStepChange(Math.min(6, step + 1))}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            {step === 6 ? t('firstGameGuide.finish', 'Finish') : t('common.next', 'Next')}
          </button>
        </footer>
      </div>
    </div>
  );
}
