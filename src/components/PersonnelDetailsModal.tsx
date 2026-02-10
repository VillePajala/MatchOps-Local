'use client';

import React, { useState } from 'react';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle, ModalAmbientGlows } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { Personnel, PersonnelRole } from '@/types/personnel';
import logger from '@/utils/logger';
import { AlreadyExistsError, ValidationError } from '@/interfaces/DataStoreErrors';
import CertificationManager from './CertificationManager';

interface PersonnelDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  personnel?: Personnel | null;
  onAddPersonnel?: (data: Omit<Personnel, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Personnel | null>;
  onUpdatePersonnel?: (personnelId: string, updates: Partial<Omit<Personnel, 'id' | 'createdAt'>>) => Promise<Personnel | null>;
  isUpdating?: boolean;
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

const PersonnelDetailsModal: React.FC<PersonnelDetailsModalProps> = ({
  isOpen,
  onClose,
  mode,
  personnel,
  onAddPersonnel,
  onUpdatePersonnel,
  isUpdating,
}) => {
  const { t } = useTranslation();

  // Form state
  const [name, setName] = useState('');
  const [role, setRole] = useState<PersonnelRole>('head_coach');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [certifications, setCertifications] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize form when personnel changes or modal opens
  React.useLayoutEffect(() => {
    if (isOpen) {
      if (mode === 'create') {
        // Reset form for create mode
        setName('');
        setRole('head_coach');
        setPhone('');
        setEmail('');
        setCertifications([]);
        setNotes('');
        setErrorMessage(null);
      } else if (personnel) {
        // Load existing personnel data for edit mode
        setName(personnel.name || '');
        setRole(personnel.role);
        setPhone(personnel.phone || '');
        setEmail(personnel.email || '');
        setCertifications(personnel.certifications || []);
        setNotes(personnel.notes || '');
        setErrorMessage(null);
      }
    }
  }, [mode, personnel, isOpen]);

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return; // Name is required
    }

    const data = {
      name: trimmedName,
      role,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      certifications: certifications.length > 0 ? certifications : undefined,
      notes: notes.trim() || undefined,
    };

    try {
      let result: Personnel | null = null;

      if (mode === 'create') {
        // Create new personnel
        if (!onAddPersonnel) return;
        result = await onAddPersonnel(data);
      } else {
        // Update existing personnel
        if (!personnel || !onUpdatePersonnel) return;

        const updates: Partial<Omit<Personnel, 'id' | 'createdAt'>> = {};

        if (data.name !== personnel.name) updates.name = data.name;
        if (data.role !== personnel.role) updates.role = data.role;
        if (data.phone !== (personnel.phone || undefined)) updates.phone = data.phone;
        if (data.email !== (personnel.email || undefined)) updates.email = data.email;

        // Compare certifications arrays
        const oldCerts = JSON.stringify(personnel.certifications || []);
        const newCerts = JSON.stringify(certifications);
        if (oldCerts !== newCerts) updates.certifications = certifications.length > 0 ? certifications : undefined;

        if (data.notes !== (personnel.notes || undefined)) updates.notes = data.notes;

        if (Object.keys(updates).length > 0) {
          result = await onUpdatePersonnel(personnel.id, updates);
        } else {
          // No changes, just close
          onClose();
          return;
        }
      }

      // Check if operation succeeded
      if (result) {
        onClose();
      } else {
        // Operation failed (duplicate name or validation error)
        setErrorMessage(
          t('personnelDetailsModal.errors.duplicateName', 'A personnel member with this name already exists. Please choose a different name.')
        );
      }
    } catch (error) {
      logger.error('Failed to save personnel:', error);

      // Check for specific error types using instanceof for type safety
      if (error instanceof AlreadyExistsError) {
        setErrorMessage(
          t('personnelDetailsModal.errors.duplicateName', 'A personnel member with this name already exists. Please choose a different name.')
        );
      } else if (error instanceof ValidationError) {
        setErrorMessage(
          t('personnelDetailsModal.errors.validationFailed', 'Invalid input. Please check the form and try again.')
        );
      } else {
        setErrorMessage(
          mode === 'create'
            ? t('personnelDetailsModal.errors.createFailed', 'Failed to add personnel. Please try again.')
            : t('personnelDetailsModal.errors.updateFailed', 'Failed to update personnel. Please try again.')
        );
      }
    }
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-[70] font-display">
      <ModalAmbientGlows />
      <div className="bg-slate-800 flex flex-col h-full w-full lg:max-w-2xl lg:max-h-[90vh] lg:rounded-lg bg-noise-texture relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />

        {/* Header */}
        <div className="flex flex-col flex-shrink-0">
          <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
              {mode === 'create'
                ? t('personnelDetailsModal.createTitle', 'Add Personnel')
                : t('personnelDetailsModal.editTitle', 'Personnel Details')}
            </h2>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
          <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6">
            <div className="space-y-3">
              {/* Error Message */}
              {errorMessage && (
                <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-md text-sm">
                  {errorMessage}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('personnelDetailsModal.nameLabel', 'Name')} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    // Clear error when user starts typing
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder={t('personnelDetailsModal.namePlaceholder', 'Enter name')}
                  className={`w-full px-3 py-2 bg-slate-700 border rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500 ${
                    errorMessage ? 'border-red-500' : 'border-slate-600'
                  }`}
                  required
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('personnelDetailsModal.roleLabel', 'Role')} *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as PersonnelRole)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {PERSONNEL_ROLES.map(({ value, labelKey }) => (
                    <option key={value} value={value}>
                      {t(labelKey, value)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('personnelDetailsModal.phoneLabel', 'Phone')}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('personnelDetailsModal.phonePlaceholder', 'Phone number')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('personnelDetailsModal.emailLabel', 'Email')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('personnelDetailsModal.emailPlaceholder', 'Email address')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Certifications */}
              <CertificationManager
                certifications={certifications}
                onCertificationsChange={setCertifications}
              />

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('personnelDetailsModal.notesLabel', 'Notes')}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('personnelDetailsModal.notesPlaceholder', 'Additional notes')}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <ModalFooter>
          <button onClick={handleCancel} className={secondaryButtonStyle}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isUpdating}
            className={primaryButtonStyle}
          >
            {isUpdating
              ? t('common.saving', 'Saving...')
              : mode === 'create'
              ? t('common.add', 'Add')
              : t('common.save', 'Save')}
          </button>
        </ModalFooter>
      </div>
    </div>
  );
};

export default PersonnelDetailsModal;
