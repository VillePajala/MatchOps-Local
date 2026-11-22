'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { HiCheck, HiOutlineKey } from 'react-icons/hi2';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';
import { formatCodeInput, isCodeComplete, type RedeemCodeError, type RedeemCodeResult } from './playbookCodes';

/**
 * The "enter a club code" sheet over the library: one input (shown upper-case,
 * with or without dashes), Unlock, and either a friendly reason the code did
 * not work or the unlocked playbook's name. The redeem itself (and the fetch
 * of the new playbook) is the caller's `onRedeem`; `onUnlocked` lets the
 * library switch to the playbook right away.
 */

interface PlaybookCodeSheetProps {
  onClose: () => void;
  onRedeem: (code: string) => Promise<RedeemCodeResult>;
  onUnlocked: (playbookId: string) => void;
}

function errorText(error: RedeemCodeError, t: TFunction): string {
  switch (error) {
    case 'invalid':
      return t('playbook.code.errors.invalid', "That code doesn't work. Check it and try again.");
    case 'expired':
      return t('playbook.code.errors.expired', 'This code has expired. Ask your club for a new one.');
    case 'used_up':
      return t('playbook.code.errors.usedUp', 'This code has been used up. Ask your club for a new one.');
    case 'revoked':
      return t('playbook.code.errors.revoked', 'This code is no longer valid. Ask your club for a new one.');
    case 'rate_limited':
      return t('playbook.code.errors.rateLimited', 'Too many attempts. Try again in an hour.');
    case 'offline':
      return t('playbook.code.errors.offline', 'A network connection is needed.');
    default:
      return t('playbook.code.errors.failed', 'Something went wrong. Try again.');
  }
}

export default function PlaybookCodeSheet({ onClose, onRedeem, onUnlocked }: PlaybookCodeSheetProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RedeemCodeError | null>(null);
  const [unlocked, setUnlocked] = useState<{ name: string; already: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEscapeToClose(true, onClose);
  useHardwareBackSubLevel(true, onClose);

  const canSubmit = !busy && isCodeComplete(code);
  const submit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!canSubmit) return;
      setBusy(true);
      setError(null);
      const result = await onRedeem(code);
      if (!mounted.current) return;
      setBusy(false);
      if (result.ok) {
        setUnlocked({ name: result.playbookName, already: result.already });
        onUnlocked(result.playbookId);
      } else {
        setError(result.error);
        inputRef.current?.focus();
      }
    },
    [canSubmit, code, onRedeem, onUnlocked],
  );

  return (
    <div className="fixed inset-0 z-[61] flex items-end justify-center bg-[rgb(2_6_23/0.6)] sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="playbook-code-title"
        data-testid="playbook-code-sheet"
        className="s1-sheet w-full max-w-md rounded-t-[28px] px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] font-ui text-ink sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        {unlocked ? (
          <div className="flex flex-col items-center gap-4 py-2 text-center" role="status" data-testid="playbook-code-success">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-action/15 text-action">
              <HiCheck className="h-7 w-7" aria-hidden="true" />
            </span>
            <h3 id="playbook-code-title" className="font-display text-[24px] font-extrabold leading-tight">
              {unlocked.already
                ? t('playbook.code.already', '{{name}} is already unlocked', { name: unlocked.name })
                : t('playbook.code.unlocked', '{{name}} unlocked', { name: unlocked.name })}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="s1-primary h-12 w-full rounded-full text-[16px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              data-testid="playbook-code-show"
            >
              {t('playbook.code.show', 'Show')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h3 id="playbook-code-title" className="flex items-center gap-2.5 font-display text-[24px] font-extrabold leading-tight">
              <HiOutlineKey className="h-6 w-6 flex-shrink-0 text-ink-3" aria-hidden="true" />
              {t('playbook.code.title', 'Enter a club code')}
            </h3>
            <p className="mt-2 text-[15px] leading-snug text-ink-2">
              {t('playbook.code.hint', 'Your club gives its coaches a code. It unlocks the club’s content for this account.')}
            </p>
            <label className="mt-4 block">
              <span className="sr-only">{t('playbook.code.label', 'Club code')}</span>
              <input
                ref={inputRef}
                // Focus when the sheet opens (the keyboard comes up with it).
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(formatCodeInput(e.target.value));
                  if (error) setError(null);
                }}
                placeholder={t('playbook.code.placeholder', 'XXXX-XXXX-XXXX')}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="go"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'playbook-code-error' : undefined}
                className={`h-14 w-full rounded-[14px] border bg-[#0b1222] px-4 text-center font-mono text-[20px] uppercase tracking-[0.12em] text-ink placeholder:text-ink-3/60 focus:outline-none ${
                  error ? 'border-red-400/70' : 'border-white/[0.08] focus:border-action/60'
                }`}
                data-testid="playbook-code-input"
              />
            </label>
            <p id="playbook-code-error" role="alert" className="min-h-[24px] pt-2 text-[14px] text-red-300" data-testid="playbook-code-error">
              {error ? errorText(error, t) : ''}
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="s1-ghost h-12 flex-1 rounded-full text-[16px] font-semibold"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="s1-primary h-12 flex-1 rounded-full text-[16px] font-bold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                data-testid="playbook-code-submit"
              >
                {busy ? t('playbook.code.checking', 'Checking…') : t('playbook.code.submit', 'Unlock')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
