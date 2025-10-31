'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Personnel, PersonnelRole } from '@/types/personnel';
import {
  HiOutlineXMark,
  HiOutlineCheck,
  HiOutlinePencil,
  HiOutlineTrash,
  HiPlusCircle,
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';
import { getRoleLabelKey } from '@/utils/personnelRoles';

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
  const personnelRefs = useRef<(HTMLDivElement | null)[]>([]);

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
    }
  }, [isOpen]);

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

    // Scroll into view
    setTimeout(() => {
      const personIndex = personnel.findIndex(p => p.id === personnelId);
      if (personnelRefs.current[personIndex]) {
        personnelRefs.current[personIndex]?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }, 50);
  };

  const handleCancelEdit = () => {
    setEditingPersonnelId(null);
  };

  const handleSaveEdit = async (personnelId: string) => {
    const trimmedName = editData.name.trim();
    if (!trimmedName) {
      showToast(t('personnelManager.nameRequired', 'Personnel name cannot be empty.'), 'error');
      return;
    }

    try {
      await onUpdatePersonnel(personnelId, editData);
      setEditingPersonnelId(null);
      showToast(t('personnelManager.updateSuccess', 'Personnel updated successfully'), 'success');
    } catch (error) {
      logger.error('Error saving personnel:', error);
      showToast(t('personnelManager.updateError', 'Failed to update personnel'), 'error');
    }
  };

  const handleRemove = async (personnelId: string, personName: string) => {
    if (!confirm(t('personnelManager.confirmDelete', 'Are you sure you want to remove {{name}}?', { name: personName }))) {
      return;
    }

    try {
      await onRemovePersonnel(personnelId);
      showToast(t('personnelManager.deleteSuccess', 'Personnel removed successfully'), 'success');
    } catch (error) {
      logger.error('Error removing personnel:', error);
      showToast(t('personnelManager.deleteError', 'Failed to remove personnel'), 'error');
    }
  };

  const handleAddPersonnel = async () => {
    const trimmedName = newPersonnelData.name.trim();
    if (!trimmedName) {
      showToast(t('personnelManager.nameRequired', 'Personnel name cannot be empty.'), 'error');
      return;
    }

    try {
      await onAddPersonnel(newPersonnelData);
      setIsAddingPersonnel(false);
      setNewPersonnelData({
        name: '',
        role: 'head_coach',
        phone: '',
        email: '',
        certifications: [],
        notes: '',
      });
      showToast(t('personnelManager.addSuccess', 'Personnel added successfully'), 'success');
    } catch (error) {
      logger.error('Error adding personnel:', error);
      showToast(t('personnelManager.addError', 'Failed to add personnel'), 'error');
    }
  };

  // Filter personnel by search
  const filteredPersonnel = personnel.filter(p =>
    p.name.toLowerCase().includes(searchText.toLowerCase()) ||
    p.role.toLowerCase().includes(searchText.toLowerCase()) ||
    t(getRoleLabelKey(p.role)).toLowerCase().includes(searchText.toLowerCase())
  );

  if (!isOpen) return null;

  // Style definitions (matching RosterSettingsModal)
  const modalContainerStyle = "bg-slate-800 rounded-none shadow-xl flex flex-col border-0 overflow-hidden";
  const titleStyle = "text-3xl font-bold text-yellow-400 tracking-wide";
  const cardStyle = "bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner";
  const inputBaseStyle = "block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 focus:bg-slate-700 sm:text-sm text-white";
  const buttonBaseStyle = "px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed";
  const primaryButtonStyle = `${buttonBaseStyle} bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-lg`;
  const secondaryButtonStyle = `${buttonBaseStyle} bg-gradient-to-b from-slate-600 to-slate-700 text-slate-200 hover:from-slate-700 hover:to-slate-600`;
  const iconButtonBaseStyle = "p-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className={`${modalContainerStyle} bg-noise-texture relative overflow-hidden h-full w-full flex flex-col`}>
        {/* Background effects */}
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col min-h-0">
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
                    {" "}{t('personnelManager.totalPersonnel', 'Total Personnel')}
                  </span>
                </div>
              </div>

              {/* Add Personnel Button */}
              <button
                onClick={() => { setIsAddingPersonnel(true); setEditingPersonnelId(null); }}
                className={`${primaryButtonStyle} w-full bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center gap-2`}
                disabled={!!editingPersonnelId || isUpdating || isAddingPersonnel}
              >
                <HiPlusCircle className="h-5 w-5" />
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
                  filteredPersonnel.map((person, index) => (
                    <div
                      key={person.id}
                      ref={(el) => { personnelRefs.current[index] = el; }}
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
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={() => handleStartEdit(person.id)}
                              className={`${iconButtonBaseStyle} bg-indigo-600 hover:bg-indigo-700 text-white`}
                              disabled={!!editingPersonnelId || isUpdating}
                            >
                              <HiOutlinePencil className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleRemove(person.id, person.name)}
                              className={`${iconButtonBaseStyle} bg-red-600 hover:bg-red-700 text-white`}
                              disabled={!!editingPersonnelId || isUpdating}
                            >
                              <HiOutlineTrash className="h-5 w-5" />
                            </button>
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
          <div className="px-6 py-4 backdrop-blur-sm bg-slate-900/20 border-t border-slate-700">
            <button
              onClick={onClose}
              className={`${secondaryButtonStyle} w-full`}
            >
              {t('common.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonnelManagerModal;
