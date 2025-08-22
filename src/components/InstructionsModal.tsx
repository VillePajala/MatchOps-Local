'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark } from 'react-icons/hi2';

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
          {/* Getting Started */}
          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('instructionsModal.gettingStarted.title')}</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <p className="text-slate-200 mb-3">{t('instructionsModal.gettingStarted.intro')}</p>
              <ol className="list-decimal list-inside space-y-2 text-slate-300">
                <li><span className="font-semibold text-yellow-200">{t('instructionsModal.gettingStarted.step1Title')}</span> - {t('instructionsModal.gettingStarted.step1Desc')}</li>
                <li><span className="font-semibold text-yellow-200">{t('instructionsModal.gettingStarted.step2Title')}</span> - {t('instructionsModal.gettingStarted.step2Desc')}</li>
                <li><span className="font-semibold text-yellow-200">{t('instructionsModal.gettingStarted.step3Title')}</span> - {t('instructionsModal.gettingStarted.step3Desc')}</li>
                <li><span className="font-semibold text-yellow-200">{t('instructionsModal.gettingStarted.step4Title')}</span> - {t('instructionsModal.gettingStarted.step4Desc')}</li>
              </ol>
            </div>
          </section>

          {/* During the Game */}
          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('instructionsModal.duringGame.title')}</h3>
            <div className="space-y-3">
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                <h4 className="text-lg font-semibold text-indigo-300 mb-2">{t('instructionsModal.duringGame.fieldTitle')}</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  <li>{t('instructionsModal.duringGame.dragPlayers')}</li>
                  <li>{t('instructionsModal.duringGame.drawTactics')}</li>
                  <li>{t('instructionsModal.duringGame.trackSubs')}</li>
                </ul>
              </div>
              
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                <h4 className="text-lg font-semibold text-indigo-300 mb-2">{t('instructionsModal.duringGame.scoringTitle')}</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  <li>{t('instructionsModal.duringGame.logGoals')}</li>
                  <li>{t('instructionsModal.duringGame.timer')}</li>
                  <li>{t('instructionsModal.duringGame.periods')}</li>
                </ul>
              </div>
            </div>
          </section>

          {/* After the Game */}
          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('instructionsModal.afterGame.title')}</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li>{t('instructionsModal.afterGame.saveGame')}</li>
                <li>{t('instructionsModal.afterGame.assessPlayers')}</li>
                <li>{t('instructionsModal.afterGame.viewStats')}</li>
                <li>{t('instructionsModal.afterGame.exportData')}</li>
              </ul>
            </div>
          </section>

          {/* Key Features */}
          <section className="space-y-3">
            <h3 className="text-2xl font-bold text-yellow-300">{t('instructionsModal.keyFeatures.title')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                <h4 className="text-md font-semibold text-indigo-300 mb-1">{t('instructionsModal.keyFeatures.seasons')}</h4>
                <p className="text-sm text-slate-300">{t('instructionsModal.keyFeatures.seasonsDesc')}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                <h4 className="text-md font-semibold text-indigo-300 mb-1">{t('instructionsModal.keyFeatures.tournaments')}</h4>
                <p className="text-sm text-slate-300">{t('instructionsModal.keyFeatures.tournamentsDesc')}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                <h4 className="text-md font-semibold text-indigo-300 mb-1">{t('instructionsModal.keyFeatures.tacticsBoard')}</h4>
                <p className="text-sm text-slate-300">{t('instructionsModal.keyFeatures.tacticsBoardDesc')}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                <h4 className="text-md font-semibold text-indigo-300 mb-1">{t('instructionsModal.keyFeatures.offlineFirst')}</h4>
                <p className="text-sm text-slate-300">{t('instructionsModal.keyFeatures.offlineFirstDesc')}</p>
              </div>
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
