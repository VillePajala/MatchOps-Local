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
  onGetStarted: () => void;
  onCreateSeason: () => void;
  onViewStats: () => void;
  onSetupRoster: () => void;
  onManageTeams: () => void;
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
  onGetStarted,
  onCreateSeason,
  onViewStats,
  onSetupRoster,
  onManageTeams,
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
    'w-full px-4 py-3 rounded-lg text-base font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-lg text-center leading-tight';

  const disabledButtonStyle =
    'w-full px-4 py-3 rounded-lg text-base font-semibold text-slate-400 bg-gradient-to-r from-slate-700 to-slate-600 cursor-not-allowed shadow-lg opacity-50 text-center leading-tight';

  const containerStyle =
    'relative flex flex-col items-center justify-center min-h-screen min-h-[100dvh] bg-slate-950 text-slate-100 font-display overflow-hidden';

  const taglineStyle =
    'text-lg sm:text-xl md:text-2xl text-slate-200/95 text-center tracking-wide drop-shadow-md relative px-4';

  const titleStyle =
    'relative text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-extrabold tracking-tight leading-[0.9] drop-shadow-lg mb-1.5 text-center text-yellow-400 px-4';

  

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
      {/* 7) Title spotlight (shifted slightly lower) */}
      <div className="absolute top-[36%] left-1/2 -translate-x-1/2 w-[60vw] h-[32vh] pointer-events-none opacity-50 [background:radial-gradient(closest-side,rgba(56,189,248,0.10),transparent_70%)] blur-[28px]" />
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
      <div className="relative z-10 grid grid-rows-[auto_1fr] items-start w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl px-4 sm:px-6 py-6 sm:py-8 h-[calc(100dvh-8rem)] sm:h-[calc(100dvh-6rem)]">
        
        {/* Title section (shifted slightly lower) */}
        <div className="row-start-1 relative flex flex-col items-center mt-12 sm:mt-16">
          <div className="relative">
            <h1 className={titleStyle}>
              <span className="block">MatchOps</span>
              <span className="block">Local</span>
            </h1>
            <span className="absolute inset-0 -z-10 blur-[6px] opacity-60 [background:radial-gradient(closest-side,rgba(234,179,8,0.35),transparent_70%)]" />
          </div>
          <div className="relative mt-2 sm:mt-3">
            <p className={taglineStyle}>{t('startScreen.tagline', 'Suunnittele · Kirjaa · Arvioi')}</p>
            <span className="absolute inset-0 -z-10 mx-auto w-[80%] h-full pointer-events-none [background:radial-gradient(closest-side,rgba(99,102,241,0.12),transparent_70%)] blur-md" />
          </div>
          <div className="h-px w-32 sm:w-48 bg-gradient-to-r from-transparent via-sky-400/50 to-transparent mx-auto mt-6 sm:mt-8" />
        </div>

        {/* Conditional interface based on user type */}
        {isFirstTimeUser ? (
          /* FIRST-TIME USER: Simplified Interface */
          <div className="row-start-2 w-full flex flex-col items-center justify-end min-h-[38vh] sm:min-h-[40vh] px-4 pt-4 pb-6 sm:pb-8 gap-4 sm:gap-5 max-w-sm mx-auto">
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
          <div className="row-start-2 w-full flex flex-col items-center justify-center flex-1 px-4 pt-14 pb-6 gap-3 max-w-sm mx-auto">
            {/* Show Setup Roster as primary action for users without players */}
            {!hasPlayers && (
              <button className={primaryButtonStyle} onClick={onSetupRoster}>
                {t('startScreen.setupRoster', 'Setup Team Roster')}
              </button>
            )}
            
            {/* Resume Last Game button - always shown, dimmed when unavailable */}
            <button 
              className={canResume ? primaryButtonStyle : disabledButtonStyle}
              onClick={canResume && onResumeGame ? onResumeGame : undefined}
              disabled={!canResume}
            >
              {t('startScreen.resumeGame', 'Resume Last Game')}
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
            
            {/* Manage Teams button - grayed out if no players */}
            <button 
              className={hasPlayers ? primaryButtonStyle : disabledButtonStyle}
              onClick={hasPlayers ? onManageTeams : undefined}
              disabled={!hasPlayers}
            >
              {t('startScreen.manageTeams', 'Manage Teams')}
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
