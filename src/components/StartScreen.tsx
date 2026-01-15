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
        {/* Blue glow - top right */}
        <div className="absolute -top-[20%] -right-[15%] w-[60%] h-[60%] bg-sky-500/10 rounded-full blur-3xl" />
        {/* Blue glow - bottom left */}
        <div className="absolute -bottom-[15%] -left-[10%] w-[55%] h-[55%] bg-sky-500/15 rounded-full blur-3xl" />
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
          <div className="text-center mb-6">
            {/* App Name as Logo */}
            <div className="relative inline-block mb-3">
              <h1 className="relative text-6xl sm:text-7xl font-bold tracking-tight">
                <span className="text-amber-400">MatchOps</span>
                <br />
                <span className="text-white">Local</span>
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
                    className="p-4 rounded-xl bg-slate-800/90 border-2 border-sky-500/30 hover:bg-slate-700/90 hover:border-sky-400/50 transition-all"
                  >
                    <span className="text-sm font-semibold text-white">
                      {t('startScreen.loadGame', 'Load Game')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={hasSavedGames ? onViewStats : undefined}
                    disabled={!hasSavedGames}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      hasSavedGames
                        ? 'bg-slate-800/90 border-sky-500/30 hover:bg-slate-700/90 hover:border-sky-400/50'
                        : 'bg-slate-800/40 border-slate-700/40 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span className={`text-sm font-semibold ${hasSavedGames ? 'text-white' : 'text-slate-500'}`}>
                      {t('startScreen.viewStats', 'Statistics')}
                    </span>
                  </button>
                </div>

                {/* Settings - subtle text link style */}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="w-full py-3 text-slate-400 hover:text-slate-200 transition-all"
                >
                  <span className="text-sm">
                    {t('startScreen.appSettings', 'Settings')}
                  </span>
                </button>
              </>
            )}
          </div>
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
