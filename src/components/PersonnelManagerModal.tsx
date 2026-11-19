'use client';

import { matchesSearch } from '@/utils/listSearch';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Personnel } from '@/types/personnel';
import {
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineEllipsisVertical,
  HiOutlinePhone,
  HiOutlineEnvelope,
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';
import { getRoleLabelKey } from '@/utils/personnelRoles';
import { getGamesWithPersonnel } from '@/utils/personnelManager';
import { getSafeTelHref, getSafeMailtoHref } from '@/utils/contactValidation';
import ConfirmationModal from './ConfirmationModal';
import PersonnelDetailsModal from './PersonnelDetailsModal';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { HiOutlineMagnifyingGlass, HiOutlinePlus } from 'react-icons/hi2';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import {
  CollapsibleModalHeader,
  useCollapsingHeader,
  modalContainerStyle,
  groupedListStyle,
  primaryButtonStyle,
  iconButtonEditStyle,
  searchInputStyle,
  popoverMenuStyle,
  popoverItemStyle,
  subtextStyle,
} from '@/styles/modalStyles';

interface PersonnelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  personnel: Personnel[];
  onAddPersonnel: (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Personnel | null>;
  onUpdatePersonnel: (personnelId: string, updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>) => Promise<Personnel | null>;
  onRemovePersonnel: (personnelId: string) => Promise<void>;
  isUpdating?: boolean;
}

const PersonnelManagerModal: React.FC<PersonnelManagerModalProps> = ({
  isOpen,
  onClose,
  personnel,
  onAddPersonnel,
  onUpdatePersonnel,
  onRemovePersonnel,
  isUpdating,
}) => {
  const { t } = useTranslation();
  const headerCollapse = useCollapsingHeader();
  const { showToast } = useToast();

  // Modal state
  const [createPersonnelModalOpen, setCreatePersonnelModalOpen] = useState(false);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string | null>(null);

  const [searchText, setSearchText] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPositions, setMenuPositions] = useState<Record<string, boolean>>({});
  const { calculatePosition } = useDropdownPosition();

  // Confirmation modal state
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [personnelToDelete, setPersonnelToDelete] = useState<{
    id: string;
    name: string;
    gamesCount: number;
  } | null>(null);

  // Reset state when modal closes
  React.useLayoutEffect(() => {
    if (!isOpen) {
      setCreatePersonnelModalOpen(false);
      setSelectedPersonnelId(null);
      setSearchText('');
      setOpenMenuId(null);
    }
  }, [isOpen]);

  // Handle click outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuId]);

  const handleActionsMenuToggle = (e: React.MouseEvent<HTMLButtonElement>, personId: string) => {
    const shouldOpenUpward = calculatePosition(e.currentTarget);
    setMenuPositions(prev => ({ ...prev, [personId]: shouldOpenUpward }));
    setOpenMenuId(openMenuId === personId ? null : personId);
  };

  // Handle opening edit modal
  const handleEditPersonnel = (personnelId: string) => {
    setSelectedPersonnelId(personnelId);
    setOpenMenuId(null);
  };

  // Handle remove personnel
  const handleRemove = async (personnelId: string, personName: string) => {
    try {
      // Check if personnel is assigned to any games
      const gamesWithPersonnel = await getGamesWithPersonnel(personnelId);

      // Open confirmation modal with game count
      setPersonnelToDelete({
        id: personnelId,
        name: personName,
        gamesCount: gamesWithPersonnel.length,
      });
      setIsDeleteConfirmOpen(true);
      setOpenMenuId(null); // Close dropdown menu
    } catch (error) {
      logger.error('Error checking personnel game assignments:', error);
      showToast(
        t('personnelManager.checkError', {
          defaultValue: 'Failed to check game assignments',
        }),
        'error'
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!personnelToDelete) return;

    try {
      // TOCTOU Protection: Re-check game count before actual deletion
      // Prevents race condition where game assignments change between
      // confirmation dialog and actual deletion
      const currentGames = await getGamesWithPersonnel(personnelToDelete.id);
      const currentCount = currentGames.length;

      if (currentCount !== personnelToDelete.gamesCount) {
        // Count changed - abort deletion and warn user
        showToast(
          t('personnelManager.impactChanged', {
            defaultValue: 'Impact changed: was {{oldCount}} game(s), now {{newCount}}. Please review and retry.',
            oldCount: personnelToDelete.gamesCount,
            newCount: currentCount,
          }),
          'info'
        );
        setIsDeleteConfirmOpen(false);
        setPersonnelToDelete(null);
        return; // ABORT - don't proceed with deletion
      }

      // Count matches - safe to proceed
      await onRemovePersonnel(personnelToDelete.id);
      showToast(
        t('personnelManager.deleteSuccess', {
          defaultValue: 'Personnel removed successfully',
          name: personnelToDelete.name,
        }),
        'success'
      );
      setIsDeleteConfirmOpen(false);
      setPersonnelToDelete(null);
    } catch (error) {
      logger.error('Error removing personnel:', error);

      // Provide specific error messages based on error type
      const errorName = error instanceof Error ? error.name : 'Unknown';

      if (errorName === 'QuotaExceededError') {
        showToast(
          t('personnelManager.quotaExceeded', {
            defaultValue: 'Storage quota full. Delete some old games first to free space.',
          }),
          'error'
        );
      } else if (errorName === 'InvalidStateError') {
        showToast(
          t('personnelManager.databaseCorrupted', {
            defaultValue: 'Database error detected. Try refreshing the page.',
          }),
          'error'
        );
      } else {
        showToast(
          t('personnelManager.deleteError', {
            defaultValue: 'Failed to remove personnel',
          }),
          'error'
        );
      }
    }
  };

  const handleCancelDelete = () => {
    setIsDeleteConfirmOpen(false);
    setPersonnelToDelete(null);
  };

  // Filter personnel by search (memoized to avoid re-computation on every render)
  const filteredPersonnel = useMemo(() => {
    // The app's one search (review 7.L6): name and role (as stored and as shown).
    return personnel.filter(p => matchesSearch(searchText, [p.name, p.role, t(getRoleLabelKey(p.role))]));
  }, [personnel, searchText, t]);

  useEscapeToClose(isOpen, onClose);


  if (!isOpen) return null;

  return (
    <div className={`${MODAL_BACKDROP} ${Z_LAYER.modal}`} role="dialog" aria-modal="true" aria-label={t('personnelManager.title', 'Personnel Manager')}>
      <div className={`${modalContainerStyle} relative h-full w-full flex flex-col`}>

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col min-h-0 h-full">
          {/* Chrome slimming: X-header; Add Personnel collapses on scroll. */}
          <CollapsibleModalHeader
            title={t('personnelManager.title', 'Personnel Manager')}
            onClose={onClose}
            closeLabel={t('common.doneButton', 'Done')}
            collapse={headerCollapse}
          >
            <div className="px-4 pt-2 pb-4">
              <button
                onClick={() => setCreatePersonnelModalOpen(true)}
                className={`${primaryButtonStyle} w-full min-h-[52px] text-base`}
                disabled={isUpdating}
              >
                <HiOutlinePlus className="w-5 h-5" aria-hidden="true" />
                {t('personnelManager.addPersonnel', 'Add Personnel')}
              </button>
            </div>
          </CollapsibleModalHeader>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-3 pb-6" onScroll={headerCollapse.onScroll}>
            {/* Search Input */}
            <div className="relative">
              <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-3" aria-hidden="true" />
              <input
                type="text"
                placeholder={t('personnelManager.searchPlaceholder', 'Search personnel...')}
                aria-label={t('personnelManager.searchPlaceholder', 'Search personnel...')}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                autoComplete="off"
                className={searchInputStyle}
              />
            </div>

            {/* Personnel List */}
            <div className={`${groupedListStyle} mt-3`}>
              <div className="divide-y divide-hairline">
                {filteredPersonnel.length === 0 ? (
                  <div className={`text-center py-8 ${subtextStyle}`}>
                    {searchText
                      ? t('personnelManager.noResults', 'No personnel found')
                      : t('personnelManager.empty', 'No personnel yet. Add your first person above.')
                    }
                  </div>
                ) : (
                  filteredPersonnel.map((person) => (
                    <div
                      key={person.id}
                      className="py-3.5 pl-[18px] pr-2 font-ui transition-colors hover:bg-white/[0.03]"
                    >
                      <div className="flex items-start justify-between">
                        <div
                          className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => handleEditPersonnel(person.id)}
                          title={t('common.edit', 'Edit')}
                        >
                          <h4 className="font-display text-[26px] font-bold leading-[1.1] text-ink">{person.name}</h4>
                          <p className="mt-1 text-sm text-ink-3">
                            {t(getRoleLabelKey(person.role), person.role)}
                          </p>
                          {(() => {
                            const telHref = getSafeTelHref(person.phone);
                            return telHref ? (
                              <a
                                href={telHref}
                                // Prevent triggering parent card's onClick (which opens edit modal)
                                onClick={(e) => e.stopPropagation()}
                                aria-label={t('personnel.callPhone', { phone: person.phone })}
                                className="flex items-center gap-2 min-h-8 text-sm text-ink-3 hover:text-ink-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action rounded"
                              >
                                <HiOutlinePhone className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                                <span>{person.phone}</span>
                              </a>
                            ) : null;
                          })()}
                          {(() => {
                            const mailtoHref = getSafeMailtoHref(person.email);
                            return mailtoHref ? (
                              <a
                                href={mailtoHref}
                                // Prevent triggering parent card's onClick (which opens edit modal)
                                onClick={(e) => e.stopPropagation()}
                                aria-label={t('personnel.sendEmail', { email: person.email })}
                                className="flex items-center gap-2 min-h-8 text-sm text-ink-3 hover:text-ink-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action rounded"
                              >
                                <HiOutlineEnvelope className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                                <span>{person.email}</span>
                              </a>
                            ) : null;
                          })()}
                        </div>
                        <div className="relative ml-2" ref={openMenuId === person.id ? menuRef : null}>
                          <button
                            onClick={(e) => handleActionsMenuToggle(e, person.id)}
                            className={iconButtonEditStyle}
                            disabled={isUpdating}
                            aria-label={t('common.moreOptions', 'More options')}
                          >
                            <HiOutlineEllipsisVertical className="h-5 w-5" />
                          </button>
                          {openMenuId === person.id && (
                            <div className={`${popoverMenuStyle} ${menuPositions[person.id] ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                              <button
                                onClick={() => handleEditPersonnel(person.id)}
                                className={popoverItemStyle}
                              >
                                <HiOutlinePencil className="h-4 w-4" />
                                {t('common.edit', 'Edit')}
                              </button>
                              <button
                                onClick={() => {
                                  handleRemove(person.id, person.name);
                                  setOpenMenuId(null);
                                }}
                                className={`${popoverItemStyle} text-red-400! hover:bg-red-500/10!`}
                              >
                                <HiOutlineTrash className="h-4 w-4" />
                                {t('common.delete', 'Delete')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        title={t('personnelManager.confirmDeleteTitle', {
          defaultValue: 'Delete Personnel',
        })}
        message={
          personnelToDelete?.gamesCount && personnelToDelete.gamesCount > 0
            ? t('personnelManager.confirmDeleteWithGames', {
                defaultValue: '{{name}} is assigned to {{count}} game(s). Removing this personnel will unassign them from all games. Continue?',
                name: personnelToDelete.name,
                count: personnelToDelete.gamesCount,
              })
            : t('personnelManager.confirmDelete', {
                defaultValue: 'Are you sure you want to remove {{name}}?',
                name: personnelToDelete?.name || '',
              })
        }
        warningMessage={
          personnelToDelete?.gamesCount && personnelToDelete.gamesCount > 0
            ? t('personnelManager.deleteWarning', {
                defaultValue: 'This action cannot be undone. The personnel will be removed from {{count}} game(s).',
                count: personnelToDelete.gamesCount,
              })
            : undefined
        }
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        isConfirming={isUpdating}
        variant="danger"
      />

      {/* Personnel Create Modal */}
      <PersonnelDetailsModal
        isOpen={createPersonnelModalOpen}
        onClose={() => setCreatePersonnelModalOpen(false)}
        mode="create"
        onAddPersonnel={onAddPersonnel}
        isUpdating={isUpdating}
      />

      {/* Personnel Edit Modal */}
      <PersonnelDetailsModal
        isOpen={selectedPersonnelId !== null}
        onClose={() => setSelectedPersonnelId(null)}
        mode="edit"
        personnel={personnel.find(p => p.id === selectedPersonnelId) || null}
        onUpdatePersonnel={onUpdatePersonnel}
        isUpdating={isUpdating}
      />
    </div>
  );
};

export default PersonnelManagerModal;
