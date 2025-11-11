import React from 'react';
import { useTranslation } from 'react-i18next';
import {
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
} from 'react-icons/hi2';

interface FirstGameGuideProps {
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}

export function FirstGameGuide({ step, onStepChange, onClose }: FirstGameGuideProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none px-6 py-12">
      <div className="relative bg-slate-800/95 rounded-2xl p-7 sm:p-8 max-w-md sm:max-w-lg w-full pointer-events-auto shadow-2xl backdrop-blur-sm max-h-[85vh] flex flex-col ring-1 ring-indigo-400/30">
        <div className="text-center mb-3">
          <h2 className="text-xl sm:text-2xl font-bold text-indigo-300 leading-snug max-w-[20ch] mx-auto">
            {t('firstGameGuide.title', 'Welcome to Your First Game!')}
          </h2>
          <p className="text-slate-300 text-sm mt-1">
            {t('firstGameGuide.subtitle', "Let's quickly go over the basics")}
          </p>
          <div className="h-px bg-indigo-400/20 mt-3" />
        </div>

        <div className="flex-1 overflow-hidden">
          {step === 0 && <GuideStepOne />}
          {step === 1 && <GuideStepTwo />}
          {step === 2 && <GuideStepThree />}
          {step === 3 && <GuideStepFour />}
        </div>

        <div className="flex items-center justify-center gap-3 mt-4">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              onClick={() => onStepChange(i)}
              className={`h-3 w-3 rounded-full ${step === i ? 'bg-indigo-300' : 'bg-slate-600'} transition-colors`}
              aria-label={t('firstGameGuide.step', 'Step {{step}}', { step: i + 1 })}
            />
          ))}
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={() => onStepChange(Math.max(0, step - 1))}
            className="inline-flex items-center justify-center gap-2 px-4 h-10 bg-slate-700/80 hover:bg-slate-600/80 rounded-lg text-slate-200 ring-1 ring-white/10 shadow-sm transition-colors text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M12.78 15.53a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 010-1.06l4.5-4.5a.75.75 0 111.06 1.06L8.81 10l3.97 3.97a.75.75 0 010 1.06z"
                clipRule="evenodd"
              />
            </svg>
            {t('common.backButton', 'Back')}
          </button>
          {step < 3 ? (
            <button
              onClick={() => onStepChange(Math.min(3, step + 1))}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 h-10 rounded-lg font-semibold text-white transition-colors text-sm bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-900/30 ring-1 ring-white/10"
            >
              {t('common.next', 'Next')}
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M7.22 4.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06L11.19 10 7.22 6.03a.75.75 0 010-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 h-10 rounded-lg font-semibold text-white transition-colors text-sm bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-900/30 ring-1 ring-white/10"
            >
              {t('firstGameGuide.gotIt', "Got it, let's start!")}
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M7.22 4.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06L11.19 10 7.22 6.03a.75.75 0 010-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GuideStepOne() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.playerSelection', 'Player Selection (Top Bar)')}
      </h3>
      <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
        <li>{t('firstGameGuide.tapToSelect', 'Tap player disc to select')}</li>
        <li>{t('firstGameGuide.goalieInstructions', 'When player is on field, tap shield icon to set as goalie')}</li>
        <li>{t('firstGameGuide.tapFieldPlace', 'Tap field to place player')}</li>
      </ul>
    </div>
  );
}

function GuideStepTwo() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.theField', 'The Field')}
      </h3>
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
  );
}

function GuideStepThree() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.tacticalView', 'Tactical View')}
      </h3>
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
  );
}

function GuideStepFour() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.quickActions', 'Quick Actions (Bottom Bar)')}
      </h3>
      <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
        <li>
          <span className="text-slate-200">{t('firstGameGuide.undoRedoTip', 'Undo/Redo your last actions:')}</span>
          <span className="inline-flex items-center ml-2 gap-1 align-[-2px]">
            <svg className="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14l-4-4 4-4" />
              <path d="M5 10h11a4 4 0 010 8h-1" />
            </svg>
            <svg className="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 10l4 4-4 4" />
              <path d="M19 14H8a4 4 0 010-8h1" />
            </svg>
          </span>
        </li>
        <li>
          <span className="text-slate-200">{t('firstGameGuide.logGoalTip', 'Log a goal:')}</span>
          <span className="inline-block align-[-2px] ml-2 text-blue-300">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
            </svg>
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
  );
}
