import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineSquares2X2,
  HiOutlinePlusCircle,
  HiOutlineBackspace,
  HiOutlineTrash,
  HiOutlineClipboard,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineXMark,
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

        <div className="flex-1 overflow-y-auto">
          {step === 0 && <GuideStepOne />}
          {step === 1 && <GuideStepTwo />}
          {step === 2 && <GuideStepThree />}
          {step === 3 && <GuideStepFour />}
          {step === 4 && <GuideStepFive />}
        </div>

        <div className="flex items-center justify-center gap-3 mt-4">
          {[0, 1, 2, 3, 4].map((i) => (
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
          {step < 4 ? (
            <button
              onClick={() => onStepChange(Math.min(4, step + 1))}
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
        <li>{t('firstGameGuide.tapFieldPlace', 'Tap field to place player')}</li>
        <li>{t('firstGameGuide.dragToAdjust', 'Drag players to reposition them')}</li>
        <li>{t('firstGameGuide.doubleTapRemove', 'Double-tap to remove a player from the field')}</li>
        <li>{t('firstGameGuide.goalieInstructions', 'Set goalies via Menu → Roster')}</li>
      </ul>
    </div>
  );
}

function GuideStepTwo() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.controlBar', 'Control Bar (Bottom)')}
      </h3>
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
  );
}

function GuideStepThree() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.drawingTools', 'Drawing & Tactical Tools')}
      </h3>
      <p className="text-sm text-slate-300 -mt-1">
        {t('firstGameGuide.drawingToolsNote', 'After clicking Tactics Board, you can:')}
      </p>
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
  );
}

function GuideStepFour() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.gameManagement', 'Game Management')}
      </h3>
      <p className="text-sm text-slate-300 -mt-1">
        {t('firstGameGuide.menuActionsNote', 'Click the Menu button to access:')}
        <HiBars3 aria-hidden className="inline-block align-[-2px] ml-2 text-indigo-300" size={18} />
      </p>
      <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
        <li>{t('firstGameGuide.startNewGameTip', 'Start a new game')}</li>
        <li>{t('firstGameGuide.loadGameTip', 'Load a saved game')}</li>
        <li>{t('firstGameGuide.gameSettingsTip', 'Edit game settings')}</li>
      </ul>
    </div>
  );
}

function GuideStepFive() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-indigo-200 text-base">
        {t('firstGameGuide.otherFeatures', 'Other Features')}
      </h3>
      <p className="text-sm text-slate-300 -mt-1">
        {t('firstGameGuide.otherFeaturesNote', 'Also available from the Menu:')}
        <HiBars3 aria-hidden className="inline-block align-[-2px] ml-2 text-indigo-300" size={18} />
      </p>
      <ul className="text-sm leading-6 text-slate-200 space-y-2 list-disc pl-5 marker:text-slate-400">
        <li>{t('firstGameGuide.rosterManageTip', 'Manage player list')}</li>
        <li>{t('firstGameGuide.statsReportsTip', 'View stats and download reports')}</li>
        <li>{t('firstGameGuide.seasonsTeamsTip', 'Manage seasons, teams, and personnel')}</li>
        <li>{t('firstGameGuide.appSettingsTip', 'Access app settings')}</li>
      </ul>
    </div>
  );
}
