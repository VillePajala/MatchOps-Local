'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineShare, HiOutlineClipboardCopy, HiOutlineCheck } from 'react-icons/hi';
import {
  modalContainerStyle,
  ModalBackgroundEffects,
  CollapsibleModalHeader,
  checkboxStyle,
  warningBoxStyle,
  textareaStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/styles/modalStyles';
import logger from '@/utils/logger';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

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
  const heading = title ?? t('recap.title', 'Share match report');
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

  /**
   * Opening is always a fresh start.
   *
   * The instance outlives one use: the coach can edit a summary, close it,
   * switch to another player, and open it again. Keeping the edit across that
   * showed one player's words under another player's name, which is worse than
   * the lost edit this preservation was added to prevent. So an edit survives
   * only while the modal stays open.
   */
  const wasOpenRef = React.useRef(isOpen);
  React.useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      appliedRef.current = recap;
      setText(recap);
      setStale(false);
      setCopied(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, recap]);

  const applyGenerated = () => {
    appliedRef.current = recap;
    setText(recap);
    setStale(false);
  };

  useEscapeToClose(isOpen, onClose);


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
      className="fixed inset-0 z-[80] flex"
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
            {/* pt-2: the subtitle sat flush against the header with no
                breathing room above it. */}
            {hint && (
              <p className="font-ui text-sm text-ink-3 px-6 pt-2 pb-3 text-center">
                {hint}
              </p>
            )}
          </CollapsibleModalHeader>

          {/* Editable preview with its Copy/Share actions inline beneath it. */}
          <div className="flex-1 min-h-0 px-4 py-4 flex flex-col gap-3 font-ui">
            {sections && sections.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-2" data-testid="recap-sections">
                {sections.map(section => (
                  <label key={section.key} className="flex min-h-11 items-center gap-2.5 text-[15px] text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={section.checked}
                      onChange={() => onToggleSection?.(section.key)}
                      data-testid={`recap-section-${section.key}`}
                      className={checkboxStyle}
                    />
                    {section.label}
                  </label>
                ))}
              </div>
            )}
            {stale && (
              <div className={`${warningBoxStyle} flex items-center gap-3 !p-3 text-ink-2 text-[13px]`} data-testid="recap-stale">
                <span className="flex-1">
                  {t('recap.staleEdits', 'You have edited this text, so it did not change. Take the new version?')}
                </span>
                <button
                  type="button"
                  onClick={applyGenerated}
                  data-testid="recap-apply-generated"
                  className={`${secondaryButtonStyle} shrink-0`}
                >
                  {t('recap.staleApply', 'Rebuild')}
                </button>
              </div>
            )}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              aria-label={heading}
              className={`${textareaStyle} flex-1 min-h-[16rem] !text-sm !font-normal font-mono whitespace-pre-wrap`}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className={`${secondaryButtonStyle} flex-1`}
              >
                {copied ? <HiOutlineCheck className="text-win" /> : <HiOutlineClipboardCopy />}
                {copied ? t('recap.copied', 'Copied') : t('recap.copy', 'Copy')}
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={handleShare}
                  className={`${primaryButtonStyle} flex-1`}
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
