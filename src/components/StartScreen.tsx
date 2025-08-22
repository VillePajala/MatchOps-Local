'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import {
  updateAppSettings,
  getAppSettings,
} from '@/utils/appSettings';
import InstructionsModal from '@/components/InstructionsModal';
 

interface StartScreenProps {
  onStartNewGame: () => void;
  onLoadGame: () => void;
  onResumeGame?: () => void;
  onExploreApp: () => void;
  onGetStarted: () => void;
  onCreateSeason: () => void;
  onViewStats: () => void;
  onSetupRoster: () => void;
  canResume?: boolean;
  hasPlayers?: boolean;
  hasSavedGames?: boolean;
  hasSeasonsTournaments?: boolean;
  isFirstTimeUser?: boolean;
}

const StartScreen: React.FC<StartScreenProps> = ({
  onStartNewGame,
  onLoadGame,
  onResumeGame,
  onExploreApp,
  onGetStarted,
  onCreateSeason,
  onViewStats,
  onSetupRoster,
  canResume = false,
  hasPlayers = false,
  hasSavedGames = false,
  hasSeasonsTournaments = false,
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
    updateAppSettings({ language }).catch(() => {});
  }, [language]);

  const primaryButtonStyle =
    'w-full px-3 py-2.5 rounded-md text-sm sm:text-base font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-md text-center leading-tight';

  const disabledButtonStyle =
    'w-full px-3 py-2.5 rounded-md text-sm sm:text-base font-semibold text-slate-400 bg-gradient-to-r from-slate-700 to-slate-600 cursor-not-allowed shadow-md opacity-50 text-center leading-tight';

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
      <div className="relative z-10 flex flex-col items-center w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl px-4 sm:px-6 py-6 sm:py-8 h-[calc(100vh-8rem)] sm:h-[calc(100vh-6rem)]">
        
        {/* Title section */}
        <div className="flex flex-col items-center mt-4 sm:mt-6">
          <div className="relative">
            <h1 className={titleStyle}>
              <span className="block">MatchOps</span>
              <span className="block">Local</span>
            </h1>
            <span className="absolute inset-0 -z-10 blur-[6px] opacity-60 [background:radial-gradient(closest-side,rgba(234,179,8,0.35),transparent_70%)]" />
          </div>
          <div className="relative mt-3 sm:mt-4">
            <p className={taglineStyle}>{t('startScreen.tagline', 'Suunnittele · Kirjaa · Arvioi')}</p>
            <span className="absolute inset-0 -z-10 mx-auto w-[80%] h-full pointer-events-none [background:radial-gradient(closest-side,rgba(99,102,241,0.12),transparent_70%)] blur-md" />
          </div>
          <div className="h-px w-36 sm:w-52 bg-gradient-to-r from-transparent via-sky-400/50 to-transparent mx-auto mt-6 sm:mt-8" />
        </div>

        {/* Conditional interface based on user type */}
        {isFirstTimeUser ? (
          /* FIRST-TIME USER: Simplified Interface */
          <div className="w-full flex flex-col items-center justify-center flex-1 px-4 py-8 gap-6 max-w-sm mx-auto">
            {/* Large Get Started button */}
            <button 
              className="w-full px-6 py-4 rounded-lg text-lg font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xl text-center"
              onClick={onGetStarted}
            >
              {t('startScreen.getStarted', 'Get Started')}
            </button>
            
            {/* Secondary help button */}
            <button 
              className="w-full px-4 py-2.5 rounded-md text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-700/50 transition-colors border border-slate-600"
              onClick={() => setIsInstructionsModalOpen(true)}
            >
              {t('startScreen.howItWorks', 'How It Works')}
            </button>
          </div>
        ) : (
          /* EXPERIENCED USER: Full-Featured Interface */
          <div className="w-full flex flex-col items-center justify-center flex-1 px-4 py-6 gap-1.5 max-w-sm mx-auto">
            {/* Show Setup Roster as primary action for users without players */}
            {!hasPlayers && (
              <button className={primaryButtonStyle} onClick={onSetupRoster}>
                {t('startScreen.setupRoster', 'Setup Team Roster')}
              </button>
            )}
            
            {/* Resume/Explore button */}
            <button 
              className={primaryButtonStyle}
              onClick={canResume && onResumeGame ? onResumeGame : onExploreApp}
            >
              {canResume ? t('startScreen.resumeGame', 'Resume Last Game') : t('startScreen.exploreApp', 'Explore App')}
            </button>
            
            {/* Create Game button - grayed out if no players */}
            <button 
              className={hasPlayers ? primaryButtonStyle : disabledButtonStyle}
              onClick={hasPlayers ? onStartNewGame : undefined}
              disabled={!hasPlayers}
            >
              {hasSavedGames ? t('startScreen.createNewGame', 'Create New Game') : t('startScreen.createFirstGame', 'Create First Game')}
            </button>
            
            {/* Load Game button */}
            <button 
              className={hasSavedGames ? primaryButtonStyle : disabledButtonStyle} 
              onClick={hasSavedGames ? onLoadGame : undefined}
              disabled={!hasSavedGames}
            >
              {t('startScreen.loadGame', 'Load Game')}
            </button>
            
            {/* Create Season/Tournament button - grayed out if no players */}
            <button 
              className={hasPlayers ? primaryButtonStyle : disabledButtonStyle}
              onClick={hasPlayers ? onCreateSeason : undefined}
              disabled={!hasPlayers}
            >
              {hasSeasonsTournaments ? t('startScreen.createSeasonTournament', 'Seasons & Tournaments') : t('startScreen.createFirstSeasonTournament', 'First Season/Tournament')}
            </button>
            
            {/* View Stats button */}
            <button 
              className={hasSavedGames ? primaryButtonStyle : disabledButtonStyle} 
              onClick={hasSavedGames ? onViewStats : undefined}
              disabled={!hasSavedGames}
            >
              {t('startScreen.viewStats', 'View Stats')}
            </button>
          </div>
        )}
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

      {/* Instructions Modal */}
      <InstructionsModal
        isOpen={isInstructionsModalOpen}
        onClose={() => setIsInstructionsModalOpen(false)}
      />
    </div>
  );
};

export default StartScreen;
