'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import {
  updateAppSettings,
  getAppSettings,
} from '@/utils/appSettings';
 

interface StartScreenProps {
  onStartNewGame: () => void;
  onLoadGame: () => void;
  onResumeGame?: () => void;
  onCreateSeason: () => void;
  onViewStats: () => void;
  canResume?: boolean;
}

const StartScreen: React.FC<StartScreenProps> = ({
  onStartNewGame,
  onLoadGame,
  onResumeGame,
  onCreateSeason,
  onViewStats,
  canResume = false,
}) => {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<string>(i18n.language);

  useEffect(() => {
    getAppSettings().then((settings) => {
      if (settings.language) {
        setLanguage(settings.language);
      }
    });
  }, []);

  useEffect(() => {
    i18n.changeLanguage(language);
    updateAppSettings({ language }).catch(() => {});
  }, [language]);

  const primaryButtonStyle =
    'w-64 px-4 py-3 rounded-md text-lg font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-md';

  const containerStyle =
    'relative flex flex-col items-center justify-center min-h-screen min-h-[100dvh] bg-slate-950 text-slate-100 font-display overflow-hidden';

  const taglineStyle =
    'text-lg sm:text-xl md:text-2xl text-slate-200/95 text-center tracking-wide drop-shadow-md relative px-4';

  const titleStyle =
    'relative text-6xl xs:text-7xl sm:text-8xl md:text-9xl lg:text-[10rem] xl:text-[12rem] font-semibold tracking-tight leading-[0.85] drop-shadow-lg mb-2 text-center text-yellow-400 px-4';

  

  return (
    <div className={containerStyle}>
      {/* 1) Noise */}
      <div className="absolute inset-0 bg-noise-texture" />
      {/* 2) Radial base gradient */}
      <div className="absolute inset-0 bg-gradient-radial from-slate-950 via-slate-900/80 to-slate-900" />
      {/* 3) Animated aurora sweep */}
      <div className="absolute inset-0 pointer-events-none animate-gradient [background:linear-gradient(120deg,theme(colors.indigo.950),theme(colors.blue.900),theme(colors.cyan.900),theme(colors.indigo.950))] opacity-25" />
      {/* 4) Subtle grid */}
      <div className="absolute inset-0 pointer-events-none sm:opacity-[0.06] opacity-[0.05] [background-image:linear-gradient(to_right,rgba(255,255,255,.25)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.25)_1px,transparent_1px)] [background-size:40px_40px]" />
      {/* 5) Diagonal color wash */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 via-sky-700/20 to-cyan-600/30 mix-blend-overlay" />
      {/* 6) Top/bottom blue tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
      {/* 7) Title spotlight */}
      <div className="absolute top-[28%] left-1/2 -translate-x-1/2 w-[60vw] h-[32vh] pointer-events-none opacity-50 [background:radial-gradient(closest-side,rgba(56,189,248,0.10),transparent_70%)] blur-[28px]" />
      {/* 8) Large blurred corner glows */}
      <div className="absolute -inset-[50px] bg-sky-400/10 blur-3xl top-0 opacity-50" />
      <div className="absolute -inset-[50px] bg-indigo-600/10 blur-3xl bottom-0 opacity-50" />
      {/* 9) Radial color accents */}
      <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_50%_at_12%_12%,theme(colors.indigo.700)/0.25_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(50%_40%_at_88%_78%,theme(colors.sky.500)/0.25_0%,transparent_70%)]" />
      {/* 10) Vignette */}
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(120%_90%_at_50%_50%,transparent_60%,rgba(0,0,0,0.25)_100%)]" />
      {/* 11) Conic rotating highlight */}
      <div className="absolute inset-0 pointer-events-none animate-rotate-slow opacity-10 [background:conic-gradient(from_150deg_at_65%_38%,theme(colors.cyan.400)/0.35_0deg,transparent_60deg,transparent_300deg,theme(colors.indigo.500)/0.35_360deg)]" />

      {/* Safe container with proper bounds */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl px-4 sm:px-6 py-6 sm:py-8 space-y-3 sm:space-y-4">
        {/* Content container with responsive padding and max-height handling */}
        <div className="w-full flex flex-col items-center space-y-3 sm:space-y-4 max-h-[85vh] overflow-visible">
        <div className="relative">
          <h1 className={titleStyle}>
            <span className="block">MatchOps</span>
            <span className="block">Local</span>
          </h1>
          <span className="absolute inset-0 -z-10 blur-[6px] opacity-60 [background:radial-gradient(closest-side,rgba(234,179,8,0.35),transparent_70%)]" />
        </div>
        <div className="relative">
          <p className={taglineStyle}>{t('startScreen.tagline', 'Suunnittele · Kirjaa · Arvioi')}</p>
          <span className="absolute inset-0 -z-10 mx-auto w-[80%] h-full pointer-events-none [background:radial-gradient(closest-side,rgba(99,102,241,0.12),transparent_70%)] blur-md" />
        </div>
          <div className="h-px w-36 sm:w-52 bg-gradient-to-r from-transparent via-sky-400/50 to-transparent mx-auto mb-6 sm:mb-8" />
          
          {/* Buttons container with responsive spacing */}
          <div className="w-full flex flex-col items-center gap-2 sm:gap-3 px-2 mb-6 sm:mb-8">
            {canResume && onResumeGame ? (
              <button className={primaryButtonStyle} onClick={onResumeGame}>
                {t('startScreen.resumeGame', 'Resume Last Game')}
              </button>
            ) : null}
            <button className={primaryButtonStyle} onClick={onStartNewGame}>
              {t('startScreen.startNewGame', 'Start New Game')}
            </button>
            <button className={primaryButtonStyle} onClick={onLoadGame}>
              {t('startScreen.loadGame', 'Load Game')}
            </button>
            <button className={primaryButtonStyle} onClick={onCreateSeason}>
              {t('startScreen.createSeasonTournament', 'Create Season/Tournament')}
            </button>
            <button className={primaryButtonStyle} onClick={onViewStats}>
              {t('startScreen.viewStats', 'View Stats')}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom-centered language switcher with safe area */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-8 md:bottom-6 z-20 px-4">
        <div className="flex rounded-lg bg-slate-800/70 border border-slate-600 backdrop-blur-sm overflow-hidden">
          <button
            aria-label={t('startScreen.languageEnglish', 'English')}
            onClick={() => setLanguage('en')}
            className={`px-3 h-8 text-xs font-bold transition-colors ${language === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700/60'}`}
          >
            EN
          </button>
          <button
            aria-label={t('startScreen.languageFinnish', 'Finnish')}
            onClick={() => setLanguage('fi')}
            className={`px-3 h-8 text-xs font-bold transition-colors border-l border-slate-600/60 ${language === 'fi' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700/60'}`}
          >
            FI
          </button>
        </div>
      </div>
    </div>
  );
};

export default StartScreen;
