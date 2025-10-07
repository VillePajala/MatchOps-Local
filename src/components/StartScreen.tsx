'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
// import { Audiowide } from 'next/font/google'; // Commented out - was used for animated text
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

// Title/logo font (must be at module scope for next/font)
// const titleFont = Audiowide({ subsets: ['latin'], weight: '400' }); // Commented out - was used for animated text

const StartScreen: React.FC<StartScreenProps> = ({
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
    'w-full px-4 py-3 rounded-lg text-base font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-lg text-center leading-tight ring-1 ring-inset ring-white/10 border border-white/10';

  const disabledButtonStyle =
    'w-full px-4 py-3 rounded-lg text-base font-semibold text-slate-400 bg-gradient-to-r from-slate-700 to-slate-600 cursor-not-allowed shadow-lg opacity-50 text-center leading-tight';

  const containerStyle =
    'relative flex flex-col items-center justify-center min-h-screen min-h-[100dvh] bg-slate-950 text-slate-100 font-display overflow-hidden';

  /* Commented out - was used for animated text
  const titleStyle =
    'relative text-6xl sm:text-8xl md:text-9xl lg:text-[10rem] font-extrabold tracking-tight leading-[0.9] drop-shadow-lg mb-1.5 text-center px-4';

  // A vibrant, high-contrast palette designed to pop against the dark UI
  // and complement (not compete with) the indigo/violet button colors.
  // It emphasizes cyan, lime, yellow, and magenta.
  const logoGradientPrimary = `conic-gradient(from calc(var(--holo-angle, 0deg) + var(--holo-start, 0deg)) at 50% 50%,
    #22d3ee 0deg,    // Cyan
    #a3e635 60deg,   // Lime
    #fde047 120deg,  // Yellow
    #f97316 180deg,  // Orange
    #e83d6d 240deg,  // Magenta
    #8b5cf6 300deg,  // A brighter, distinct Violet
    #22d3ee 360deg   // Cyan (to loop)
  )`;

  // A secondary gradient with complementary, translucent colors to add depth and shimmer.
  const logoGradientSecondary = `conic-gradient(from calc(var(--holo-angle2, 0deg) + var(--holo-start, 0deg)) at 50% 50%,
    rgba(34,211,238,0.4) 0deg,     // Cyan
    rgba(163,230,53,0.35) 90deg,   // Lime
    rgba(232,61,109,0.4) 180deg,   // Magenta
    rgba(253,224,71,0.35) 270deg,  // Yellow
    rgba(34,211,238,0.4) 360deg    // Cyan (to loop)
  )`;

  // A slow, tertiary wash of color to prevent static areas
  const logoGradientTertiary = `conic-gradient(from calc(var(--holo-angle3, 0deg) + var(--holo-start, 0deg)) at 50% 50%,
    rgba(236,72,153,0.2) 0deg,
    rgba(234,179,8,0.15) 120deg,
    rgba(132,204,22,0.15) 240deg,
    rgba(236,72,153,0.2) 360deg
  )`;
  */

  // 3D extrude handled via pseudo-element on each line (see .logo-line in globals.css)

  

  return (
    <div className={containerStyle}>
      {/* 1) Noise */}
      <div className="absolute inset-0 bg-noise-texture" />
      {/* 2) Radial base gradient */}
      <div className="absolute inset-0 bg-gradient-radial from-slate-950 via-slate-900/80 to-slate-900" />
      {/* 3) Animated aurora sweep */}
      <div className="absolute inset-0 pointer-events-none animate-gradient [background:linear-gradient(120deg,theme(colors.indigo.950),theme(colors.blue.950),theme(colors.cyan.900),theme(colors.indigo.950))] opacity-23" />
      {/* 4) Subtle grid */}
      <div className="absolute inset-0 pointer-events-none sm:opacity-[0.06] opacity-[0.05] [background-image:linear-gradient(to_right,rgba(255,255,255,.25)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.25)_1px,transparent_1px)] [background-size:40px_40px]" />
      {/* 5) Diagonal color wash */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/35 via-sky-800/20 to-cyan-700/30 mix-blend-overlay" />
      {/* 6) Top/bottom blue tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-500/8 via-transparent to-transparent" />
      {/* 7) Title spotlight (nudged higher) */}
      <div className="absolute top-[22%] left-1/2 -translate-x-1/2 w-[60vw] h-[32vh] pointer-events-none opacity-50 [background:radial-gradient(closest-side,rgba(56,189,248,0.10),transparent_70%)] blur-[28px]" />
      {/* 8) Large blurred corner glows */}
      <div className="absolute -inset-[50px] bg-sky-500/8 blur-3xl top-0 opacity-45" />
      <div className="absolute -inset-[50px] bg-indigo-700/8 blur-3xl bottom-0 opacity-45" />
      {/* 9) Radial color accents */}
      <div className="pointer-events-none absolute inset-0 opacity-55 [background:radial-gradient(60%_50%_at_12%_12%,theme(colors.indigo.800)/0.25_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-55 [background:radial-gradient(50%_40%_at_88%_78%,theme(colors.sky.600)/0.25_0%,transparent_70%)]" />
      {/* 10) Vignette */}
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(120%_90%_at_50%_50%,transparent_60%,rgba(0,0,0,0.25)_100%)]" />
      {/* 11) Conic rotating highlight */}
      <div className="absolute inset-0 pointer-events-none animate-rotate-slow opacity-10 [background:conic-gradient(from_150deg_at_65%_38%,theme(colors.cyan.400)/0.35_0deg,transparent_60deg,transparent_300deg,theme(colors.indigo.500)/0.35_360deg)]" />

      {/* Safe container with proper bounds */}
      <div className="relative z-10 grid grid-rows-[auto_1fr_auto] items-start w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl px-4 sm:px-6 py-6 sm:py-8 h-[calc(100dvh-8rem)] sm:h-[calc(100dvh-6rem)] min-h-0">
        
        {/* Title section (nudged higher) */}
        <div className="row-start-1 relative flex flex-col items-center mt-[clamp(8px,3vh,24px)]">
          {/* New Logo */}
          <div className="relative flex items-center justify-center w-full px-4">
            <Image
              src="/logos/app-logo.png"
              alt="MatchOps Local Logo"
              width={600}
              height={200}
              priority={true}
              className="w-full max-w-[280px] sm:max-w-[360px] md:max-w-[420px] lg:max-w-[480px] h-auto drop-shadow-2xl"
            />
          </div>

          {/* OLD ANIMATED TEXT - Commented out for easy restoration
          <div className="relative">
            <h1
              className={`${titleFont.className} ${titleStyle} start-title`}
              style={{ letterSpacing: '0.015em' }}
            >
              <span
                className="logo-line start-logo-gradient-animate"
                data-text="Match"
                style={{
                  // Different base angle for each word via --holo-start
                  ['--holo-start' as string]: '0deg',
                  background: `${logoGradientPrimary}, ${logoGradientSecondary}, ${logoGradientTertiary}`,
                  backgroundBlendMode: 'screen',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                Match
              </span>
              <span
                className="logo-line start-logo-gradient-animate"
                data-text="Ops"
                style={{
                  ['--holo-start' as string]: '45deg',
                  background: `${logoGradientPrimary}, ${logoGradientSecondary}, ${logoGradientTertiary}`,
                  backgroundBlendMode: 'screen',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                Ops
              </span>
              <span
                className="logo-line start-logo-gradient-animate"
                data-text="Local"
                style={{
                  ['--holo-start' as string]: '95deg',
                  background: `${logoGradientPrimary}, ${logoGradientSecondary}, ${logoGradientTertiary}`,
                  backgroundBlendMode: 'screen',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                Local
              </span>
            </h1>
          </div>
          */}
        </div>

        {/* Conditional interface based on user type */}
        {isFirstTimeUser ? (
          /* FIRST-TIME USER: Simplified Interface */
          <div className="row-start-2 w-full flex flex-col max-w-sm mx-auto pt-6 md:pt-7 pb-[calc(env(safe-area-inset-bottom,0px)+72px)] overflow-y-auto min-h-0">
            <div className="w-full flex flex-col items-center px-4 gap-4 sm:gap-5 mt-[clamp(16px,6vh,40px)]">
              {/* Large Get Started button */}
              <button 
                className="w-full px-6 py-4 rounded-lg text-lg font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xl text-center ring-1 ring-inset ring-white/10 border border-white/10"
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
          </div>
        ) : (
          /* EXPERIENCED USER: Full-Featured Interface */
          <div className="row-start-2 w-full flex flex-col max-w-sm mx-auto pt-6 md:pt-7 pb-[calc(env(safe-area-inset-bottom,0px)+72px)] overflow-y-auto min-h-0">
            <div className="w-full flex flex-col items-center px-4 gap-3 mt-[clamp(16px,6vh,40px)]">
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
          </div>
        )}
      </div>

      {/* Bottom-centered language switcher in its own row to avoid overlap */}
      <div className="row-start-3 z-20 flex justify-center items-end pt-3 sm:pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
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
