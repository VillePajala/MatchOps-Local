'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import {
  updateAppSettings,
  getAppSettings,
} from '@/utils/appSettings';
import InstructionsModal from '@/components/InstructionsModal';
import logger from '@/utils/logger';

interface StartScreenProps {
  onLoadGame: () => void;
  onResumeGame?: () => void;
  onGetStarted: () => void;
  onViewStats: () => void;
  onOpenSettings: () => void;
  canResume?: boolean;
  hasSavedGames?: boolean;
  isFirstTimeUser?: boolean;
}

const StartScreen: React.FC<StartScreenProps> = ({
  onLoadGame,
  onResumeGame,
  onGetStarted,
  onViewStats,
  onOpenSettings,
  canResume = false,
  hasSavedGames = false,
  isFirstTimeUser = false,
}) => {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<string>(i18n.language);
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);

  useEffect(() => {
    getAppSettings().then((settings) => {
      if (settings.language) {
        setLanguage(settings.language);
      }
    });
  }, []);

  useEffect(() => {
    i18n.changeLanguage(language);
    updateAppSettings({ language }).catch((error) => {
      logger.warn('[StartScreen] Failed to save language preference (non-critical)', { language, error });
    });
  }, [language]);

  const isEnglish = language === 'en';

  return (
    <div className="relative flex flex-col min-h-screen min-h-[100dvh] bg-slate-900 text-white overflow-hidden">
      {/* === AMBIENT BACKGROUND GLOWS === */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Amber glow - top right */}
        <div className="absolute -top-[20%] -right-[15%] w-[50%] h-[50%] bg-amber-500/20 rounded-full blur-[100px]" />
        {/* Blue glow - bottom left */}
        <div className="absolute -bottom-[20%] -left-[15%] w-[50%] h-[50%] bg-sky-500/15 rounded-full blur-[100px]" />
        {/* Subtle indigo accent - center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[40%] bg-indigo-500/5 rounded-full blur-[80px]" />
      </div>

      {/* === MAIN CONTENT === */}
      <div className="relative z-10 flex-1 flex flex-col px-6 py-8 pb-safe">

        {/* === TOP: Language Switcher === */}
        <div className="flex justify-end mb-4">
          <div className="flex rounded-lg bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm overflow-hidden">
            <button
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 text-xs font-bold transition-all ${
                language === 'en'
                  ? 'bg-amber-500 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('fi')}
              className={`px-3 py-1.5 text-xs font-bold transition-all ${
                language === 'fi'
                  ? 'bg-amber-500 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              FI
            </button>
          </div>
        </div>

        {/* === HERO: App Name === */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-center mb-8">
            {/* App Name as Logo */}
            <div className="relative inline-block mb-4">
              {/* Dual glow: amber + blue */}
              <div className="absolute -inset-4 bg-amber-500/15 blur-[50px] rounded-full" />
              <div className="absolute -inset-8 bg-sky-500/10 blur-[60px] rounded-full" />
              <h1 className="relative text-5xl sm:text-6xl font-bold">
                <span className="text-amber-400 drop-shadow-[0_0_25px_rgba(245,158,11,0.4)]">MatchOps</span>
                <br />
                <span className="text-white drop-shadow-[0_0_20px_rgba(56,189,248,0.2)]">Local</span>
              </h1>
            </div>

            {/* Tagline */}
            <p className="text-lg text-slate-400">
              {isEnglish ? 'Plan · Track · Assess' : 'Suunnittele · Kirjaa · Arvioi'}
            </p>
          </div>

          {/* === ACTION BUTTONS === */}
          <div className="max-w-sm mx-auto w-full space-y-3">
            {isFirstTimeUser ? (
              /* First-time user: single prominent button */
              <button
                type="button"
                onClick={onGetStarted}
                className="w-full p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-bold text-lg hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
              >
                {t('startScreen.getStarted', 'Get Started')}
              </button>
            ) : (
              /* Returning user: menu */
              <>
                {/* Primary action: Continue or New Game */}
                {canResume ? (
                  <button
                    type="button"
                    onClick={onResumeGame}
                    className="w-full p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-bold text-lg hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
                  >
                    {t('startScreen.continue', 'Continue')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onGetStarted}
                    className="w-full p-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 font-bold text-lg hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
                  >
                    {t('startScreen.newGame', 'New Game')}
                  </button>
                )}

                {/* Secondary actions: 2-column grid */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={onLoadGame}
                    className="p-4 rounded-xl bg-slate-800/80 border border-sky-500/20 hover:bg-slate-700/80 hover:border-sky-500/40 transition-all"
                  >
                    <span className="text-sm font-medium text-white">
                      {t('startScreen.loadGame', 'Load Game')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={hasSavedGames ? onViewStats : undefined}
                    disabled={!hasSavedGames}
                    className={`p-4 rounded-xl border transition-all ${
                      hasSavedGames
                        ? 'bg-slate-800/80 border-sky-500/20 hover:bg-slate-700/80 hover:border-sky-500/40'
                        : 'bg-slate-800/40 border-slate-700/30 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span className={`text-sm font-medium ${hasSavedGames ? 'text-white' : 'text-slate-500'}`}>
                      {t('startScreen.viewStats', 'Statistics')}
                    </span>
                  </button>
                </div>

                {/* Settings */}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="w-full p-3 rounded-xl bg-slate-800/50 border border-indigo-500/20 hover:bg-slate-700/50 hover:border-indigo-500/30 transition-all"
                >
                  <span className="text-sm font-medium text-slate-300">
                    {t('startScreen.appSettings', 'Settings')}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* === BOTTOM: Punchline === */}
        <div className="text-center mt-8">
          <p className="text-sm text-amber-500/70 font-medium">
            {isEnglish ? 'Every game remembered.' : 'Yksikään peli ei unohdu.'}
          </p>
        </div>
      </div>

      {/* Instructions Modal */}
      <InstructionsModal
        isOpen={isInstructionsModalOpen}
        onClose={() => setIsInstructionsModalOpen(false)}
      />
    </div>
  );
};

export default StartScreen;
