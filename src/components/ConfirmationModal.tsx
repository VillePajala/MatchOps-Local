'use client';

import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle } from '@/styles/modalStyles';

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  warningMessage?: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming?: boolean;
  confirmDisabled?: boolean;
  variant?: 'danger' | 'primary';
}

/**
 * Shared confirmation modal component
 *
 * Provides consistent UX for all confirmation dialogs across the app.
 * Replaces browser-native confirm() and alert() with beautiful custom modal.
 *
 * Features:
 * - Consistent styling with design system
 * - Optional warning messages
 * - Loading states
 * - Disabled states
 * - Danger/primary variants
 * - Full WCAG 2.1 AA accessibility (ARIA, focus management, keyboard navigation)
 */
const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  warningMessage,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  isConfirming = false,
  confirmDisabled = false,
  variant = 'primary',
}) => {
  const { t } = useTranslation();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Focus management and keyboard handler
  useEffect(() => {
    if (isOpen) {
      // Store the element that had focus before modal opened
      previousActiveElementRef.current = document.activeElement as HTMLElement;

      // Auto-focus the confirm button when modal opens
      confirmButtonRef.current?.focus();

      // ESC key handler to close modal
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onCancel();
        }
      };

      document.addEventListener('keydown', handleEscape);

      return () => {
        document.removeEventListener('keydown', handleEscape);

        // Return focus to the element that triggered the modal
        if (previousActiveElementRef.current) {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const finalConfirmLabel = confirmLabel || t('common.confirm', 'Confirm');
  const finalCancelLabel = cancelLabel || t('common.cancel', 'Cancel');
  const titleId = 'confirmation-modal-title';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] font-display"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="bg-slate-800 p-6 rounded-lg border border-slate-600 max-w-md w-full mx-4 shadow-2xl">
        {/* Title */}
        <h3 id={titleId} className="text-lg font-semibold text-slate-100 mb-4">
          {title}
        </h3>

        {/* Main Message */}
        <div className="text-slate-300 mb-6 space-y-3">
          {typeof message === 'string' ? (
            <p>{message}</p>
          ) : (
            message
          )}

          {/* Warning Message */}
          {warningMessage && (
            <div className="p-3 bg-red-900/20 border border-red-600/30 rounded-md">
              {typeof warningMessage === 'string' ? (
                <p className="text-red-300 text-sm">{warningMessage}</p>
              ) : (
                warningMessage
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isConfirming}
            className={secondaryButtonStyle}
          >
            {finalCancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={isConfirming || confirmDisabled}
            className={variant === 'danger' ? dangerButtonStyle : primaryButtonStyle}
          >
            {isConfirming
              ? t('common.processing', 'Processing...')
              : finalConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
