'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Personnel, PersonnelRole } from '@/types/personnel';
import {
  HiOutlineXMark,
  HiOutlineCheck,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineEllipsisVertical,
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';
import { getRoleLabelKey } from '@/utils/personnelRoles';
import { getGamesWithPersonnel } from '@/utils/personnelManager';
import ConfirmationModal from './ConfirmationModal';
import {
  ModalFooter,
  modalContainerStyle,
  titleStyle,
  cardStyle,
  inputBaseStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  iconButtonBaseStyle,
} from '@/styles/modalStyles';

interface PersonnelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  personnel: Personnel[];
  onAddPersonnel: (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdatePersonnel: (personnelId: string, updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>) => Promise<void>;
  onRemovePersonnel: (personnelId: string) => Promise<void>;
  isUpdating?: boolean;
  error?: string | null;
}

const PERSONNEL_ROLES: { value: PersonnelRole; labelKey: string }[] = [
  { value: 'head_coach', labelKey: 'personnel.roles.headCoach' },
  { value: 'assistant_coach', labelKey: 'personnel.roles.assistantCoach' },
  { value: 'goalkeeper_coach', labelKey: 'personnel.roles.goalkeeperCoach' },
  { value: 'fitness_coach', labelKey: 'personnel.roles.fitnessCoach' },
  { value: 'physio', labelKey: 'personnel.roles.physio' },
  { value: 'team_manager', labelKey: 'personnel.roles.teamManager' },
  { value: 'support_staff', labelKey: 'personnel.roles.supportStaff' },
  { value: 'other', labelKey: 'personnel.roles.other' },
];

const PersonnelManagerModal: React.FC<PersonnelManagerModalProps> = ({
  isOpen,
  onClose,
  personnel,
  onAddPersonnel,
  onUpdatePersonnel,
  onRemovePersonnel,
  isUpdating,
  error,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [editingPersonnelId, setEditingPersonnelId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>>({
    name: '',
    role: 'head_coach',
    phone: '',
    email: '',
    certifications: [],
    notes: '',
  });

  const [isAddingPersonnel, setIsAddingPersonnel] = useState(false);
  const [newPersonnelData, setNewPersonnelData] = useState<Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>>({
    name: '',
    role: 'head_coach',
    phone: '',
    email: '',
    certifications: [],
    notes: '',
  });

  const [searchText, setSearchText] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const personnelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Confirmation modal state
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [personnelToDelete, setPersonnelToDelete] = useState<{
    id: string;
    name: string;
    gamesCount: number;
  } | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEditingPersonnelId(null);
      setIsAddingPersonnel(false);
      setNewPersonnelData({
        name: '',
        role: 'head_coach',
        phone: '',
        email: '',
        certifications: [],
        notes: '',
      });
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

  // Scroll to editing personnel with cleanup to prevent memory leaks
  useEffect(() => {
    if (editingPersonnelId) {
      const timer = setTimeout(() => {
        const target = personnelRefs.current[editingPersonnelId];
        if (target?.scrollIntoView) {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);

      return () => clearTimeout(timer); // Cleanup on unmount or when editingPersonnelId changes
    }
  }, [editingPersonnelId]);

  // Handle start editing
  const handleStartEdit = (personnelId: string) => {
    const personToEdit = personnel.find(p => p.id === personnelId);
    if (!personToEdit) {
      logger.error('Personnel not found for editing:', personnelId);
      return;
    }

    setEditingPersonnelId(personnelId);
    setEditData({
      name: personToEdit.name,
      role: personToEdit.role,
      phone: personToEdit.phone || '',
      email: personToEdit.email || '',
      certifications: personToEdit.certifications || [],
      notes: personToEdit.notes || '',
    });
    // Scroll behavior handled by useEffect below
  };

  const handleCancelEdit = () => {
    setEditingPersonnelId(null);
  };

  const handleSaveEdit = async (personnelId: string) => {
    const trimmedName = editData.name.trim();
    if (!trimmedName) {
      showToast(
        t('personnelManager.nameRequired', {
          defaultValue: 'Personnel name cannot be empty.',
        }),
        'error'
      );
      return;
    }

    try {
      await onUpdatePersonnel(personnelId, {
        ...editData,
        name: trimmedName,
      });
      setEditingPersonnelId(null);
      showToast(
        t('personnelManager.updateSuccess', {
          defaultValue: 'Personnel updated successfully',
          name: trimmedName,
        }),
        'success'
      );
    } catch (error) {
      logger.error('Error saving personnel:', error);
      showToast(
        t('personnelManager.updateError', {
          defaultValue: 'Failed to update personnel',
        }),
        'error'
      );
    }
  };

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

  const handleAddPersonnel = async () => {
    const trimmedName = newPersonnelData.name.trim();
    if (!trimmedName) {
      showToast(
        t('personnelManager.nameRequired', {
          defaultValue: 'Personnel name cannot be empty.',
        }),
        'error'
      );
      return;
    }

    try {
      await onAddPersonnel({
        ...newPersonnelData,
        name: trimmedName,
      });
      setIsAddingPersonnel(false);
      setNewPersonnelData({
        name: '',
        role: 'head_coach',
        phone: '',
        email: '',
        certifications: [],
        notes: '',
      });
      showToast(
        t('personnelManager.addSuccess', {
          defaultValue: 'Personnel added successfully',
          name: trimmedName,
        }),
        'success'
      );
    } catch (error) {
      logger.error('Error adding personnel:', error);

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
          t('personnelManager.addError', {
            defaultValue: 'Failed to add personnel',
          }),
          'error'
        );
      }
    }
  };

  // Filter personnel by search (memoized to avoid re-computation on every render)
  const filteredPersonnel = useMemo(() => {
    return personnel.filter(p =>
      p.name.toLowerCase().includes(searchText.toLowerCase()) ||
      p.role.toLowerCase().includes(searchText.toLowerCase()) ||
      t(getRoleLabelKey(p.role)).toLowerCase().includes(searchText.toLowerCase())
    );
  }, [personnel, searchText, t]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className={`${modalContainerStyle} bg-noise-texture relative overflow-hidden h-full w-full flex flex-col`}>
        {/* Background effects */}
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col min-h-0 h-full">
          {/* Header */}
          <div className="flex flex-col">
            {/* Title Section */}
            <div className="flex justify-center items-center pt-10 pb-4 backdrop-blur-sm bg-slate-900/20">
              <h2 className={`${titleStyle} drop-shadow-lg`}>
                {t('personnelManager.title', 'Personnel Manager')}
              </h2>
            </div>

            {/* Fixed Section (Stats, Add Button) */}
            <div className="px-6 pt-1 pb-4 backdrop-blur-sm bg-slate-900/20">
              {/* Personnel Counter */}
              <div className="mb-5 text-center text-sm">
                <div className="flex justify-center items-center text-slate-300">
                  <span>
                    <span className="text-yellow-400 font-semibold">{personnel.length}</span>
                    {" "}{t(
                      personnel.length === 1
                        ? 'personnelManager.totalPersonnelSingular'
                        : 'personnelManager.totalPersonnelPlural',
                      'Personnel'
                    )}
                  </span>
                </div>
              </div>

              {/* Add Personnel Button */}
              <button
                onClick={() => { setIsAddingPersonnel(true); setEditingPersonnelId(null); }}
                className={`${primaryButtonStyle} w-full bg-indigo-600 hover:bg-indigo-700`}
                disabled={!!editingPersonnelId || isUpdating || isAddingPersonnel}
              >
                {t('personnelManager.addPersonnel', 'Add Personnel')}
              </button>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
            {/* Search Input */}
            <input
              type="text"
              placeholder={t('personnelManager.searchPlaceholder', 'Search personnel...')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              autoComplete="off"
              className="w-full px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            {/* Add Personnel Form */}
            {isAddingPersonnel && (
              <div className={`${cardStyle} mt-4 space-y-3`}>
                <h3 className="text-lg font-semibold text-slate-200">
                  {t('personnelManager.addNew', 'Add New Personnel')}
                </h3>

                <input
                  type="text"
                  placeholder={t('personnelManager.namePlaceholder', 'Full Name')}
                  value={newPersonnelData.name}
                  onChange={(e) => setNewPersonnelData({ ...newPersonnelData, name: e.target.value })}
                  className={inputBaseStyle}
                />

                <select
                  value={newPersonnelData.role}
                  onChange={(e) => setNewPersonnelData({ ...newPersonnelData, role: e.target.value as PersonnelRole })}
                  className={inputBaseStyle}
                >
                  {PERSONNEL_ROLES.map(({ value, labelKey }) => (
                    <option key={value} value={value}>
                      {t(labelKey, value)}
                    </option>
                  ))}
                </select>

                <input
                  type="tel"
                  placeholder={t('personnelManager.phonePlaceholder', 'Phone (optional)')}
                  value={newPersonnelData.phone}
                  onChange={(e) => setNewPersonnelData({ ...newPersonnelData, phone: e.target.value })}
                  className={inputBaseStyle}
                />

                <input
                  type="email"
                  placeholder={t('personnelManager.emailPlaceholder', 'Email (optional)')}
                  value={newPersonnelData.email}
                  onChange={(e) => setNewPersonnelData({ ...newPersonnelData, email: e.target.value })}
                  className={inputBaseStyle}
                />

                <textarea
                  placeholder={t('personnelManager.notesPlaceholder', 'Notes (optional)')}
                  value={newPersonnelData.notes}
                  onChange={(e) => setNewPersonnelData({ ...newPersonnelData, notes: e.target.value })}
                  className={`${inputBaseStyle} h-20 resize-none`}
                  rows={3}
                />

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setIsAddingPersonnel(false)}
                    className={secondaryButtonStyle}
                    disabled={isUpdating}
                  >
                    {t('common.cancelButton', 'Cancel')}
                  </button>
                  <button
                    onClick={handleAddPersonnel}
                    className={primaryButtonStyle}
                    disabled={isUpdating}
                  >
                    {t('personnelManager.confirmAddPersonnel', 'Add Personnel')}
                  </button>
                </div>
                {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
              </div>
            )}

            {/* Personnel List */}
            <div className={`${cardStyle} mt-4`}>
              <div className="space-y-3">
                {filteredPersonnel.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    {searchText
                      ? t('personnelManager.noResults', 'No personnel found')
                      : t('personnelManager.empty', 'No personnel yet. Add your first person above.')
                    }
                  </div>
                ) : (
                  filteredPersonnel.map((person) => (
                    <div
                      key={person.id}
                      ref={(el) => {
                        if (el) personnelRefs.current[person.id] = el;
                        else delete personnelRefs.current[person.id];
                      }}
                      className={`p-4 rounded-lg transition-all ${
                        editingPersonnelId === person.id
                          ? 'bg-slate-700/75'
                          : 'bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40'
                      }`}
                    >
                      {editingPersonnelId === person.id ? (
                        // Edit mode
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editData.name}
                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                            className={inputBaseStyle}
                          />
                          <select
                            value={editData.role}
                            onChange={(e) => setEditData({ ...editData, role: e.target.value as PersonnelRole })}
                            className={inputBaseStyle}
                          >
                            {PERSONNEL_ROLES.map(({ value, labelKey }) => (
                              <option key={value} value={value}>
                                {t(labelKey, value)}
                              </option>
                            ))}
                          </select>
                          <input
                            type="tel"
                            placeholder={t('personnelManager.phonePlaceholder', 'Phone (optional)')}
                            value={editData.phone}
                            onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                            className={inputBaseStyle}
                          />
                          <input
                            type="email"
                            placeholder={t('personnelManager.emailPlaceholder', 'Email (optional)')}
                            value={editData.email}
                            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                            className={inputBaseStyle}
                          />
                          <textarea
                            placeholder={t('personnelManager.notesPlaceholder', 'Notes (optional)')}
                            value={editData.notes}
                            onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                            className={`${inputBaseStyle} h-20 resize-none`}
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveEdit(person.id)}
                              className={`${iconButtonBaseStyle} bg-green-600 hover:bg-green-700 text-white flex-1 flex items-center justify-center gap-2`}
                            >
                              <HiOutlineCheck className="h-5 w-5" />
                              {t('common.save', 'Save')}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className={`${iconButtonBaseStyle} bg-slate-600 hover:bg-slate-700 text-white flex-1 flex items-center justify-center gap-2`}
                            >
                              <HiOutlineXMark className="h-5 w-5" />
                              {t('common.cancelButton', 'Cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-slate-200 text-lg">{person.name}</h4>
                            <p className="text-sm text-slate-400">
                              {t(getRoleLabelKey(person.role), person.role)}
                            </p>
                            {person.phone && (
                              <p className="text-sm text-slate-400 mt-1">{person.phone}</p>
                            )}
                            {person.email && (
                              <p className="text-sm text-slate-400 mt-1">{person.email}</p>
                            )}
                            {person.notes && (
                              <p className="text-xs text-slate-500 mt-2 italic">{person.notes}</p>
                            )}
                          </div>
                          <div className="relative ml-4" ref={openMenuId === person.id ? menuRef : null}>
                            <button
                              onClick={() => setOpenMenuId(openMenuId === person.id ? null : person.id)}
                              className={`${iconButtonBaseStyle} text-slate-400 hover:text-slate-200`}
                              disabled={!!editingPersonnelId || isUpdating}
                              aria-label="More options"
                            >
                              <HiOutlineEllipsisVertical className="h-5 w-5" />
                            </button>
                            {openMenuId === person.id && (
                              <div className="absolute right-0 top-full mt-1 w-36 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10">
                                <button
                                  onClick={() => {
                                    handleStartEdit(person.id);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700 rounded-t-lg flex items-center gap-2"
                                >
                                  <HiOutlinePencil className="h-4 w-4" />
                                  {t('common.edit', 'Edit')}
                                </button>
                                <button
                                  onClick={() => {
                                    handleRemove(person.id, person.name);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-slate-700 rounded-b-lg flex items-center gap-2"
                                >
                                  <HiOutlineTrash className="h-4 w-4" />
                                  {t('common.delete', 'Delete')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer with Close Button */}
          <ModalFooter>
            <button
              onClick={onClose}
              className={secondaryButtonStyle}
            >
              {t('common.close', 'Close')}
            </button>
          </ModalFooter>
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
    </div>
  );
};

export default PersonnelManagerModal;
