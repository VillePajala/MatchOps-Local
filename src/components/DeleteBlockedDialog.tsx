'use client';

import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityReferences } from '@/interfaces/DataStore';
import { DialogBackdrop, dialogContainerStyle, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface DeleteBlockedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'season' | 'tournament' | 'team';
  entityName: string;
  references: EntityReferences;
  onArchive: () => void;
}

/**
 * Dialog shown when user tries to delete an entity that has references.
 * Explains why deletion is blocked and offers archive as an alternative.
 */
const DeleteBlockedDialog: React.FC<DeleteBlockedDialogProps> = ({
  isOpen,
  onClose,
  entityType,
  entityName,
  references,
  onArchive,
}) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, isOpen);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleArchive = () => {
    onArchive();
    onClose();
  };

  return (
    <DialogBackdrop
      className="z-[70]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div ref={modalRef} className={dialogContainerStyle} role="dialog" aria-modal="true" aria-labelledby="delete-blocked-title">
        <h3 id="delete-blocked-title" className="text-lg font-semibold text-slate-100 mb-4">
          {t('deleteBlocked.title', 'Cannot Delete "{{name}}"', { name: entityName })}
        </h3>

        <div className="text-slate-300 mb-6 space-y-4">
          <p>
            {t('deleteBlocked.reason', 'This {{type}} is {{summary}}.', {
              type: t(`entityType.${entityType}`, entityType),
              summary: references.summary.toLowerCase(),
            })}
          </p>

          <p>{t('deleteBlocked.archiveOption', 'You can archive it instead, which will:')}</p>

          <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
            <li>{t('deleteBlocked.hideFromLists', 'Hide it from lists and dropdowns')}</li>
            <li>{t('deleteBlocked.keepData', 'Keep all linked data intact')}</li>
            <li>{t('deleteBlocked.canRestore', 'Allow you to restore it later')}</li>
          </ul>

          <p className="text-sm text-slate-400">
            {t(
              'deleteBlocked.deleteHint',
              'To permanently delete, first remove all references (reassign games to another {{type}} or delete them).',
              { type: t(`entityType.${entityType}`, entityType) }
            )}
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className={secondaryButtonStyle}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleArchive}
            className={primaryButtonStyle}
          >
            {t('deleteBlocked.archiveInstead', 'Archive Instead')}
          </button>
        </div>
      </div>
    </DialogBackdrop>
  );
};

export default DeleteBlockedDialog;
