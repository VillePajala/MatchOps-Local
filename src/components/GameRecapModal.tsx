'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineShare, HiOutlineClipboardCopy, HiOutlineCheck } from 'react-icons/hi';
import { modalContainerStyle, ModalBackgroundEffects, ModalFooter } from '@/styles/modalStyles';
import logger from '@/utils/logger';

interface GameRecapModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The pre-built recap text (see buildGameRecap). */
  recap: string;
}

/**
 * A preview of the game recap text with Share + Copy actions. The coach
 * reads/edits before sending it to the team chat. Text-only sharing via the OS
 * share sheet (no file allowlist issues), with clipboard copy as the fallback.
 * Full-screen, matching the app's other modals (navy theme, no dark backdrop).
 */
const GameRecapModal: React.FC<GameRecapModalProps> = ({ isOpen, onClose, recap }) => {
  const { t } = useTranslation();
  const [text, setText] = useState(recap);
  const [copied, setCopied] = useState(false);

  // Keep the editable preview in sync when a different game's recap opens.
  React.useEffect(() => { setText(recap); setCopied(false); }, [recap]);

  if (!isOpen) return null;

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleShare = async () => {
    try {
      await navigator.share({ text });
    } catch (e) {
      // AbortError = user dismissed the sheet; anything else is worth a log.
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        logger.warn('[GameRecapModal] share failed', e);
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      logger.warn('[GameRecapModal] copy failed', e);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] font-display flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-recap-title"
    >
      <div className={`${modalContainerStyle} bg-noise-texture relative overflow-hidden h-full w-full flex flex-col`}>
        <ModalBackgroundEffects />
        <div className="relative z-10 flex flex-col h-full min-h-0">
          {/* Header */}
          <div className="px-6 pt-10 pb-4 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20 flex-shrink-0 text-center">
            <h2 id="game-recap-title" className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">
              {t('recap.title', 'Game recap')}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t('recap.subtitle', 'Ready to paste into the team chat. Edit if you like.')}
            </p>
          </div>

          {/* Editable preview */}
          <div className="flex-1 min-h-0 px-4 sm:px-6 py-4">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              aria-label={t('recap.title', 'Game recap')}
              className="w-full h-full min-h-[16rem] resize-none bg-slate-900/60 border border-slate-600 rounded-md text-slate-100 text-sm p-3 font-mono whitespace-pre-wrap focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Footer */}
          <ModalFooter>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200"
            >
              {t('common.close', 'Close')}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="px-4 py-2 rounded-md text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 inline-flex items-center gap-1.5"
            >
              {copied ? <HiOutlineCheck className="text-emerald-400" /> : <HiOutlineClipboardCopy />}
              {copied ? t('recap.copied', 'Copied') : t('recap.copy', 'Copy')}
            </button>
            {canShare && (
              <button
                type="button"
                onClick={handleShare}
                className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white inline-flex items-center gap-1.5"
              >
                <HiOutlineShare />
                {t('recap.share', 'Share')}
              </button>
            )}
          </ModalFooter>
        </div>
      </div>
    </div>
  );
};

export default GameRecapModal;
