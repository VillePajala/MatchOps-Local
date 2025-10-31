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

  // Modal-style button classes for unified UI
  const primaryButtonStyle =
    'w-full h-12 px-4 py-2 rounded-md text-base font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-800 bg-gradient-to-b from-indigo-500 to-indigo-600 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)] hover:from-indigo-600 hover:to-indigo-700 hover:shadow-lg active:scale-[0.98] active:shadow-inner border border-white/10 shadow-md [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.1),0_4px_6px_-1px_rgba(0,0,0,0.3)]';

  // Emphasized variant for primary (Continue/Get Started) — same style as primary
  const primaryEmphasisStyle =
    'w-full h-12 px-4 py-2 rounded-md text-base font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-800 bg-gradient-to-b from-indigo-500 to-indigo-600 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)] hover:from-indigo-600 hover:to-indigo-700 hover:shadow-lg active:scale-[0.98] active:shadow-inner border border-white/10 shadow-md [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.1),0_4px_6px_-1px_rgba(0,0,0,0.3)]';

  const disabledButtonStyle =
    'w-full h-12 px-4 py-2 rounded-md text-base font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-slate-500 bg-slate-800 border border-slate-600/40';

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
    <div className="relative flex flex-col items-center justify-center min-h-screen min-h-[100dvh] bg-slate-800 bg-noise-texture text-slate-100 font-display overflow-hidden">
      {/* Modal-style background effects for unified feel */}
      <div className="absolute inset-0 bg-grid-squares opacity-[0.35]" />
      <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
      <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
      <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

      {/* Safe container with proper bounds */}
      <div className="relative z-10 grid grid-rows-[auto_1fr] gap-y-2 sm:gap-y-3 items-center justify-items-center w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl px-4 py-6 sm:py-8 h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-1rem)] min-h-0">

        {/* Title section (nudged higher) */}
        <div className="row-start-1 relative flex flex-col items-center justify-center w-full mt-[clamp(8px,3vh,24px)]">
          {/* New Logo with spotlight */}
          <div className="relative flex flex-col items-center justify-center">
            {/* Spiderweb SVG - centered on logo */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ transform: 'scale(3)' }}
              viewBox="0 0 200 200"
            >
              <defs>
                {/* Radial gradient for strand opacity (stronger center, fade edges) */}
                <radialGradient id="webOpacityGradient" cx="50%" cy="50%">
                  <stop offset="0%" stopColor="rgba(255, 255, 255, 0.08)" />
                  <stop offset="50%" stopColor="rgba(255, 255, 255, 0.05)" />
                  <stop offset="100%" stopColor="rgba(255, 255, 255, 0.02)" />
                </radialGradient>
                {/* Subtle cyan-white gradient for color variation */}
                <radialGradient id="webColorGradient" cx="50%" cy="50%">
                  <stop offset="0%" stopColor="rgba(255, 255, 200, 0.06)" />
                  <stop offset="40%" stopColor="rgba(255, 255, 255, 0.05)" />
                  <stop offset="100%" stopColor="rgba(200, 240, 255, 0.03)" />
                </radialGradient>
                {/* Glow filter */}
                <filter id="webGlow">
                  <feGaussianBlur stdDeviation="0.3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                {/* Radial mask for fade-out at edges */}
                <radialGradient id="webFadeMask">
                  <stop offset="0%" stopOpacity="1" />
                  <stop offset="60%" stopOpacity="1" />
                  <stop offset="85%" stopOpacity="0.3" />
                  <stop offset="100%" stopOpacity="0" />
                </radialGradient>
                <mask id="webMask">
                  <circle cx="100" cy="96" r="300" fill="url(#webFadeMask)" />
                </mask>
              </defs>
              <g transform="translate(100, 96)">
                {/* Concentric circles with varying density (denser near center) */}
                {[15, 25, 35, 50, 65, 85, 105, 130, 160].map((radius, i) => (
                  <circle
                    key={`circle-${radius}`}
                    cx="0"
                    cy="0"
                    r={radius}
                    fill="none"
                    stroke="url(#webColorGradient)"
                    strokeWidth={i < 3 ? "0.4" : "0.3"}
                    filter="url(#webGlow)"
                    opacity={0.5 - (i * 0.05)}
                  />
                ))}
                {/* Cardinal direction lines (main cross) - solid white */}
                <line x1="0" y1="0" x2="180" y2="0" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="0.5" />
                <line x1="0" y1="0" x2="-180" y2="0" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="0.5" />
                <line x1="0" y1="0" x2="0" y2="180" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="0.5" />
                <line x1="0" y1="0" x2="0" y2="-180" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="0.5" />

                {/* Radial lines - remaining 32 lines (skipping 0, 90, 180, 270) */}
                {Array.from({ length: 36 }, (_, i) => {
                  const angle = (i * 10 * Math.PI) / 180;
                  // Skip cardinal directions (0, 90, 180, 270)
                  if (i % 9 === 0) return null;
                  const x = Math.cos(angle) * 180;
                  const y = Math.sin(angle) * 180;
                  return (
                    <line
                      key={`line-${i}`}
                      x1="0"
                      y1="0"
                      x2={x}
                      y2={y}
                      stroke="url(#webColorGradient)"
                      strokeWidth="0.3"
                      filter="url(#webGlow)"
                      opacity={0.4}
                    />
                  );
                })}
                {/* Sparkle points at random intersections */}
                {[
                  { r: 50, angle: 15 }, { r: 85, angle: 75 }, { r: 130, angle: 155 },
                  { r: 65, angle: 200 }, { r: 105, angle: 260 }, { r: 160, angle: 340 },
                ].map((sparkle, i) => {
                  const angle = (sparkle.angle * Math.PI) / 180;
                  const x = Math.cos(angle) * sparkle.r;
                  const y = Math.sin(angle) * sparkle.r;
                  return (
                    <circle
                      key={`sparkle-${i}`}
                      cx={x}
                      cy={y}
                      r="0.6"
                      fill="rgba(255, 255, 255, 0.2)"
                      filter="url(#webGlow)"
                    />
                  );
                })}
                {/* Center hub/node */}
                <circle
                  cx="0"
                  cy="0"
                  r="1.5"
                  fill="rgba(255, 255, 200, 0.1)"
                  stroke="rgba(255, 255, 255, 0.15)"
                  strokeWidth="0.4"
                  filter="url(#webGlow)"
                />
              </g>
            </svg>
            {/* Multi-layered subtle white glow behind logo */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Primary white glow - soft and subtle */}
              <div className="absolute w-[145%] h-[165%] bg-white/6 blur-[48px] rounded-full" />
              {/* Secondary white glow for depth */}
              <div className="absolute w-[165%] h-[185%] bg-white/4 blur-[64px] rounded-full" />
              {/* Outer white glow for subtle spread */}
              <div className="absolute w-[185%] h-[205%] bg-white/2 blur-[72px] rounded-full" />
            </div>
            {/* Logo with gradient depth effect using mask */}
            <div className="relative inline-block [filter:drop-shadow(6px_6px_12px_rgba(0,0,0,0.5))]">
              {/* Logo - Yellow variant with gradient mask for depth */}
              <Image
                src="/logos/app-logo-yellow.png"
                alt="MatchOps Local Logo"
                width={600}
                height={200}
                priority={true}
                className="relative h-auto w-auto max-w-[72vw] xs:max-w-[360px] sm:max-w-[420px] md:max-w-[520px] lg:max-w-[560px] max-h-[32vh] [mask-image:radial-gradient(circle_at_30%_30%,black_30%,rgba(0,0,0,0.6)_100%)]"
              />
            </div>
            {/* Tagline */}
            <p className={`text-sm sm:text-base tracking-wide text-center px-6 bg-gradient-to-b from-white to-slate-200 bg-clip-text text-transparent ${isFirstTimeUser ? 'mt-6' : 'mt-3'}`}>
              {t('startScreen.tagline', 'Plan | Track | Assess')}
            </p>
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
            <div className="relative w-full flex flex-col items-center gap-4 sm:gap-5 mt-[clamp(4px,0.5vh,8px)]">
              {/* Subtle glow behind buttons */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[105%] h-[110%] bg-indigo-500/15 blur-[50px] rounded-3xl" />
              </div>
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
            <div className="relative w-full flex flex-col items-center gap-4 sm:gap-5 mt-[clamp(8px,4vh,28px)]">
              {/* Subtle glow behind buttons */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[105%] h-[110%] bg-indigo-500/15 blur-[50px] rounded-3xl" />
              </div>
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
        <div className="flex rounded-lg bg-slate-800/95 border border-white/20 backdrop-blur-sm overflow-hidden pointer-events-auto shadow-lg">
          <button
            aria-label={t('startScreen.languageEnglish', 'English')}
            onClick={() => setLanguage('en')}
            className={`px-4 h-9 text-xs font-bold transition-all duration-200 ${language === 'en' ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
          >
            EN
          </button>
          <button
            aria-label={t('startScreen.languageFinnish', 'Finnish')}
            onClick={() => setLanguage('fi')}
            className={`px-4 h-9 text-xs font-bold transition-all duration-200 ${language === 'fi' ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
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
