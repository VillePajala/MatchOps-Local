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
  onLoadGame: () => void;
  onResumeGame?: () => void;
  onGetStarted: () => void;
  onViewStats: () => void;
  onOpenSettings: () => void;
  canResume?: boolean;
  hasSavedGames?: boolean;
  isFirstTimeUser?: boolean;
}

// Title/logo font (must be at module scope for next/font)
// const titleFont = Audiowide({ subsets: ['latin'], weight: '400' }); // Commented out - was used for animated text

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
    updateAppSettings({ language }).catch(() => {});
  }, [language]);

  // (Reverted) No last game meta fetching here.

  // Option 1 — Brighter Indigo Buttons for stronger contrast
  const primaryButtonStyle =
    'w-full h-12 px-6 rounded-lg text-base font-semibold tracking-[0.02em] text-[#F8FBFF] bg-indigo-600 hover:bg-indigo-500 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ring-1 ring-inset ring-white/10 border border-white/8 shadow-[0_10px_24px_rgba(7,18,38,.45)] hover:shadow-[0_16px_36px_rgba(7,18,38,.55)] hover:-translate-y-0.5 active:translate-y-0 text-center relative before:content-[\'\'] before:absolute before:inset-0 before:rounded-lg before:pointer-events-none before:shadow-[inset_0_1px_0_rgba(255,255,255,.14)] drop-shadow-[0_1px_0_rgba(0,0,0,.35)]';

  // Emphasized variant for primary (Continue) — slightly brighter
  const primaryEmphasisStyle =
    'w-full h-12 px-6 rounded-lg text-base font-semibold tracking-[0.02em] text-[#F8FBFF] bg-indigo-500 hover:bg-indigo-400 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ring-1 ring-inset ring-white/10 border border-white/8 shadow-[0_12px_26px_rgba(7,18,38,.5)] hover:shadow-[0_18px_38px_rgba(7,18,38,.6)] hover:-translate-y-0.5 active:translate-y-0 text-center relative before:content-[\'\'] before:absolute before:inset-0 before:rounded-lg before:pointer-events-none before:shadow-[inset_0_1px_0_rgba(255,255,255,.16)] drop-shadow-[0_1px_0_rgba(0,0,0,.35)]';

  const disabledButtonStyle =
    'w-full h-12 px-6 rounded-lg text-base font-semibold text-slate-500 bg-[#0E1A2C] cursor-not-allowed opacity-60 text-center leading-tight border border-slate-600/40 ring-1 ring-inset ring-white/10';

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
      {/* 1) Base slate gradient (PlayerBar colors) */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-slate-900" />
      {/* 2) Noise texture */}
      <div className="absolute inset-0 bg-noise-texture opacity-35" />
      {/* 3) Animated blue aurora sweep (subtler) */}
      <div className="absolute inset-0 pointer-events-none animate-gradient [background:linear-gradient(120deg,theme(colors.indigo.900/40),theme(colors.sky.800/35),theme(colors.cyan.800/40),theme(colors.indigo.900/40))] opacity-25" />
      {/* 4) Subtle grid for texture (dimmed) */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] [background-image:linear-gradient(to_right,rgba(255,255,255,.22)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.22)_1px,transparent_1px)] [background-size:40px_40px]" />
      {/* 5) Corner lighting - top */}
      <div className="absolute -inset-[50px] bg-sky-500/5 blur-3xl top-0 left-0 opacity-40" />
      {/* 6) Corner lighting - bottom */}
      <div className="absolute -inset-[50px] bg-cyan-600/6 blur-3xl bottom-0 right-0 opacity-35" />
      {/* 7) Radial accent lights */}
      <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(50%_40%_at_20%_20%,theme(colors.sky.700/20)_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-26 [background:radial-gradient(45%_35%_at_80%_70%,theme(colors.cyan.700/18)_0%,transparent_70%)]" />
      {/* 8) Vignette for depth */}
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.3)_100%)]" />

      {/* 9) Stadium light beams */}
      <div className="stadium-beam" />
      <div className="stadium-beam alt" />

      {/* Safe container with proper bounds */}
      <div className="relative z-10 grid grid-rows-[auto_1fr] gap-y-2 sm:gap-y-3 items-center justify-items-center w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl px-4 py-6 sm:py-8 h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-1rem)] min-h-0">

        {/* Title section (nudged higher) */}
        <div className="row-start-1 relative flex flex-col items-center justify-center w-full mt-[clamp(8px,3vh,24px)]">
          {/* New Logo with spotlight */}
          <div className="relative flex items-center justify-center">
            {/* Spotlight behind logo */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[120%] h-[140%] bg-gradient-radial from-cyan-400/20 via-sky-400/10 to-transparent blur-2xl" />
            </div>
            {/* Logo */}
            <Image
              src="/logos/app-logo.png"
              alt="MatchOps Local Logo"
              width={600}
              height={200}
              priority={true}
              className="relative h-auto w-auto max-w-[72vw] xs:max-w-[360px] sm:max-w-[420px] md:max-w-[520px] lg:max-w-[560px] max-h-[32vh] drop-shadow-2xl"
            />
          </div>
        </div>

        {/* OLD ANIMATED TEXT - Commented out for easy restoration
        <div className="row-start-1 relative flex flex-col items-center mt-[clamp(8px,3vh,24px)]">
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

        {/* Conditional interface based on user type */}
        {isFirstTimeUser ? (
          /* FIRST-TIME USER: Simplified Interface */
          <div className="row-start-2 w-full flex flex-col max-w-sm mx-auto pt-6 md:pt-7 pb-[calc(env(safe-area-inset-bottom,0px)+110px)] overflow-y-auto min-h-0">
            <div className="w-full flex flex-col items-center gap-4 sm:gap-5 mt-[clamp(8px,4vh,28px)]">
              {/* Large Get Started button */}
              <button
                className={primaryButtonStyle}
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
          <div className="row-start-2 w-full flex flex-col max-w-sm mx-auto pt-6 md:pt-7 pb-[calc(env(safe-area-inset-bottom,0px)+110px)] overflow-y-auto min-h-0">
            <div className="w-full flex flex-col items-center gap-4 sm:gap-5 mt-[clamp(8px,4vh,28px)]">
              {/* Continue / Jatka button */}
              <button
                className={canResume ? primaryEmphasisStyle : disabledButtonStyle}
                onClick={canResume && onResumeGame ? onResumeGame : undefined}
                disabled={!canResume}
              >
                {t('startScreen.continue', 'Continue')}
              </button>

              {/* Load Game button */}
              <button
                className={primaryButtonStyle}
                onClick={onLoadGame}
              >
                {t('startScreen.loadGame', 'Load Game')}
              </button>

              {/* View Stats button */}
              <button
                className={hasSavedGames ? primaryButtonStyle : disabledButtonStyle}
                onClick={hasSavedGames ? onViewStats : undefined}
                disabled={!hasSavedGames}
              >
                {t('startScreen.viewStats', 'View Stats')}
              </button>

              {/* App Settings button */}
              <button
                className={primaryButtonStyle}
                onClick={onOpenSettings}
              >
                {t('startScreen.appSettings', 'App Settings')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom-centered language switcher - absolutely positioned to prevent overlap */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col justify-center items-center min-h-[56px] pt-1 sm:pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pointer-events-none">
        <div className="flex rounded-lg bg-slate-800/90 border border-slate-700 backdrop-blur-sm overflow-hidden pointer-events-auto shadow-lg">
          <button
            aria-label={t('startScreen.languageEnglish', 'English')}
            onClick={() => setLanguage('en')}
            className={`px-4 h-9 text-xs font-bold transition-all duration-200 ${language === 'en' ? 'bg-gradient-to-b from-indigo-600 to-indigo-700 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            EN
          </button>
          <button
            aria-label={t('startScreen.languageFinnish', 'Finnish')}
            onClick={() => setLanguage('fi')}
            className={`px-4 h-9 text-xs font-bold transition-all duration-200 border-l border-slate-700 ${language === 'fi' ? 'bg-gradient-to-b from-indigo-600 to-indigo-700 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
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
