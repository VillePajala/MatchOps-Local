'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineShare, HiOutlineClipboardCopy, HiOutlineCheck } from 'react-icons/hi';
import logger from '@/utils/logger';

interface GameRecapModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The pre-built recap text (see buildGameRecap). */
  recap: string;
}

/**
 * A small preview of the game recap text with Share + Copy actions. The coach
 * reads/edits before sending it to the team chat. Text-only sharing via the OS
 * share sheet (no file allowlist issues), with clipboard copy as the fallback.
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
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[80] font-display p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-recap-title"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-slate-700">
          <h2 id="game-recap-title" className="text-lg font-semibold text-slate-100">
            {t('recap.title', 'Game recap')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('recap.subtitle', 'Ready to paste into the team chat. Edit if you like.')}
          </p>
        </div>

        <div className="p-5 flex-1 min-h-0">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            aria-label={t('recap.title', 'Game recap')}
            className="w-full h-full min-h-[16rem] resize-none bg-slate-900 border border-slate-600 rounded-md text-slate-100 text-sm p-3 font-mono whitespace-pre-wrap focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200"
          >
            {t('common.close', 'Close')}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-2 rounded-md text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 inline-flex items-center gap-1.5"
          >
            {copied ? <HiOutlineCheck className="text-emerald-400" /> : <HiOutlineClipboardCopy />}
            {copied ? t('recap.copied', 'Copied') : t('recap.copy', 'Copy')}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={handleShare}
              className="px-3 py-2 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white inline-flex items-center gap-1.5"
            >
              <HiOutlineShare />
              {t('recap.share', 'Share')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameRecapModal;
