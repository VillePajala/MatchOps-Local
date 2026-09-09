'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineShare, HiOutlineClipboardCopy, HiOutlineCheck } from 'react-icons/hi';
import { modalContainerStyle, ModalBackgroundEffects, CollapsibleModalHeader } from '@/styles/modalStyles';
import logger from '@/utils/logger';

/** One switch over what the text contains, for a caller that builds it in parts. */
export interface RecapSection {
  key: string;
  label: string;
  checked: boolean;
}

interface GameRecapModalProps {
  /** Header and subtitle; default to the recap's own. The Taso helper reuses this modal. */
  title?: string;
  /** Explicit null means no subtitle at all - some texts explain themselves. */
  subtitle?: string | null;
  isOpen: boolean;
  onClose: () => void;
  /** The pre-built recap text (see buildGameRecap). */
  recap: string;
  /**
   * What the text is made of, when the caller can build it in parts. A season
   * of matches makes a game list longer than anyone reads, so the coach picks
   * what belongs in this particular copy.
   */
  sections?: RecapSection[];
  onToggleSection?: (key: string) => void;
}

/**
 * A preview of the game recap text with Share + Copy actions. The coach
 * reads/edits before sending it to the team chat. Text-only sharing via the OS
 * share sheet (no file allowlist issues), with clipboard copy as the fallback.
 * Full-screen, matching the app's other modals (navy theme, no dark backdrop).
 */
const GameRecapModal: React.FC<GameRecapModalProps> = ({ isOpen, onClose, recap, title, subtitle, sections, onToggleSection }) => {
  const { t } = useTranslation();
  const heading = title ?? t('recap.title', 'Game recap');
  const hint = subtitle === undefined
    ? t('recap.subtitle', 'Ready to paste into the team chat. Edit if you like.')
    : subtitle;
  const [text, setText] = useState(recap);
  const [copied, setCopied] = useState(false);
  /** The generated text the box currently reflects; anything else is the coach's own edit. */
  const appliedRef = React.useRef(recap);
  const [stale, setStale] = useState(false);

  /**
   * Follow the generated text, unless the coach has written over it.
   *
   * Ticking a section rebuilds the text, and simply replacing the box would
   * throw away whatever they had just written into it without a word. So an
   * edited box keeps its edit and says the content has changed, with a button
   * to take the new version when they are ready.
   */
  React.useEffect(() => {
    setCopied(false);
    setText((current) => {
      if (current === appliedRef.current) {
        appliedRef.current = recap;
        setStale(false);
        return recap;
      }
      setStale(recap !== appliedRef.current);
      return current;
    });
  }, [recap]);

  const applyGenerated = () => {
    appliedRef.current = recap;
    setText(recap);
    setStale(false);
  };

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
      aria-label={heading}
    >
      <div className={`${modalContainerStyle} bg-noise-texture relative overflow-hidden h-full w-full flex flex-col`}>
        <ModalBackgroundEffects />
        <div className="relative z-10 flex flex-col h-full min-h-0">
          {/* Chrome slimming: X-header (Close->X); subtitle pinned below. */}
          <CollapsibleModalHeader
            title={heading}
            onClose={onClose}
            closeLabel={t('common.close', 'Close')}
          >
            {hint && (
              <p className="text-xs text-slate-400 px-6 pb-3 text-center">
                {hint}
              </p>
            )}
          </CollapsibleModalHeader>

          {/* Editable preview with its Copy/Share actions inline beneath it. */}
          <div className="flex-1 min-h-0 px-4 sm:px-6 py-4 flex flex-col gap-3">
            {sections && sections.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-2" data-testid="recap-sections">
                {sections.map(section => (
                  <label key={section.key} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={section.checked}
                      onChange={() => onToggleSection?.(section.key)}
                      data-testid={`recap-section-${section.key}`}
                      className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    {section.label}
                  </label>
                ))}
              </div>
            )}
            {stale && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs" data-testid="recap-stale">
                <span className="flex-1">
                  {t('recap.staleEdits', 'You have edited this text, so it did not change. Take the new version?')}
                </span>
                <button
                  type="button"
                  onClick={applyGenerated}
                  data-testid="recap-apply-generated"
                  className="shrink-0 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 font-semibold"
                >
                  {t('recap.staleApply', 'Rebuild')}
                </button>
              </div>
            )}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              aria-label={heading}
              className="flex-1 w-full min-h-[16rem] resize-none bg-slate-900/60 border border-slate-600 rounded-md text-slate-100 text-sm p-3 font-mono whitespace-pre-wrap focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex flex-wrap gap-2">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameRecapModal;
