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
/** One full sentence per type (review 8.8): a Finnish suffix glued onto the type word
 * gave "toiseen joukkuen" / "toiseen turnausn". */
const HINT_KEYS = {
  season: 'deleteBlocked.deleteHintSeason',
  tournament: 'deleteBlocked.deleteHintTournament',
  team: 'deleteBlocked.deleteHintTeam',
} as const;

const DeleteBlockedDialog: React.FC<DeleteBlockedDialogProps> = ({
  isOpen,
  onClose,
  entityType,
  entityName,
  references,
  onArchive,
}) => {
  const { t, i18n } = useTranslation();

  // What the entity is used by, from the counts (review 8.8): the stores' summary is
  // an English sentence, which the Finnish dialog printed as is.
  const { games = 0, teams = 0, adjustments = 0 } = references.counts;
  const usedBy = [
    games > 0 ? t('deleteBlocked.refGames', { count: games }) : null,
    teams > 0 ? t('deleteBlocked.refTeams', { count: teams }) : null,
    adjustments > 0 ? t('deleteBlocked.refAdjustments', { count: adjustments }) : null,
  ].filter((part): part is string => part !== null);
  const usedByList = new Intl.ListFormat(i18n.language?.startsWith('en') ? 'en' : 'fi', {
    type: 'conjunction',
  }).format(usedBy);
  // A reference kind this dialog doesn't know yet: fall back to the store's summary
  // rather than "used by ." (untranslated, but not broken).
  const reason = usedBy.length > 0
    ? t('deleteBlocked.reason', 'This {{type}} is used by {{list}}.', {
      type: t(`entityType.${entityType}`, entityType),
      list: usedByList,
    })
    : references.summary;
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
          <p>{reason}</p>

          <p>{t('deleteBlocked.archiveOption', 'You can archive it instead, which will:')}</p>

          <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-2">
            <li>{t('deleteBlocked.hideFromLists', 'Hide it from lists and dropdowns')}</li>
            <li>{t('deleteBlocked.keepData', 'Keep all linked data intact')}</li>
            <li>{t('deleteBlocked.canRestore', 'Allow you to restore it later')}</li>
          </ul>

          <p className="text-sm text-slate-400">
            {t(HINT_KEYS[entityType])}
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
