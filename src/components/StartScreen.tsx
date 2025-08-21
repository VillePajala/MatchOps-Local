'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import {
  updateAppSettings,
  getAppSettings,
} from '@/utils/appSettings';
import { exportFullBackup } from '@/utils/fullBackup';
import logger from '@/utils/logger';

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
    'w-64 px-4 py-3 rounded-md text-lg font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm';

  const secondaryButtonStyle =
    'w-64 px-4 py-3 rounded-md text-lg font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500';

  const containerStyle =
    'relative flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 font-display overflow-hidden py-24';

  const taglineStyle =
    'text-xl text-slate-300 text-center max-w-sm drop-shadow-lg';

  const titleStyle =
    'text-5xl font-bold text-yellow-400 tracking-wide drop-shadow-lg mb-4 text-center';

  const handleBackupNow = async () => {
    try {
      await exportFullBackup();
      alert(t('settingsModal.backupCreated', 'Backup created successfully.'));
    } catch (err) {
      logger.error('Failed to create backup', err);
      const message = err instanceof Error ? err.message : String(err);
      alert(
        `${t('settingsModal.backupError', 'Failed to create backup.')}: ${message}`,
      );
    }
  };

  return (
    <div className={containerStyle}>
      <div className="absolute inset-0 bg-noise-texture" />
      <div className="absolute inset-0 bg-gradient-radial from-slate-950 via-slate-900/80 to-slate-900" />
      <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
      <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
      <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

      <div className="relative z-10 flex flex-col items-center space-y-5">
        <h1 className={titleStyle}>
          <span className="block">MatchOps</span>
          <span className="block">Local</span>
        </h1>
        <p className={taglineStyle}>{t('startScreen.tagline', 'Suunnittele • Kirjaa • Arvioi')}</p>
        <div className="h-px w-40 bg-slate-500/30 my-4" />
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium text-slate-300 mb-1">
            {t('startScreen.languageLabel', 'Language')}
          </span>
          <div className="flex space-x-2">
            <button
              aria-label={t('startScreen.languageEnglish', 'English')}
              onClick={() => setLanguage('en')}
              className={`w-12 h-8 rounded-md text-xs font-semibold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${language === 'en' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
            >
              EN
            </button>
            <button
              aria-label={t('startScreen.languageFinnish', 'Finnish')}
              onClick={() => setLanguage('fi')}
              className={`w-12 h-8 rounded-md text-xs font-semibold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${language === 'fi' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
            >
              FI
            </button>
          </div>
        </div>
        {canResume && onResumeGame ? (
          <button className={primaryButtonStyle} onClick={onResumeGame}>
            {t('startScreen.resumeGame', 'Resume Last Game')}
          </button>
        ) : null}
        <button className={primaryButtonStyle} onClick={onStartNewGame}>
          {t('startScreen.startNewGame', 'Start New Game')}
        </button>
        <button className={secondaryButtonStyle} onClick={onLoadGame}>
          {t('startScreen.loadGame', 'Load Game')}
        </button>
        <button className={secondaryButtonStyle} onClick={onCreateSeason}>
          {t('startScreen.createSeasonTournament', 'Create Season/Tournament')}
        </button>
        <button className={secondaryButtonStyle} onClick={onViewStats}>
          {t('startScreen.viewStats', 'View Stats')}
        </button>
        <button className={secondaryButtonStyle} onClick={handleBackupNow}>
          {t('startScreen.backupNow', 'Backup Now')}
        </button>
      </div>
    </div>
  );
};

export default StartScreen;
