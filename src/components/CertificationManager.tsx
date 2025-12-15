'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CERTIFICATIONS, CERTIFICATION_GROUPS } from '@/config/gameOptions';

interface CertificationManagerProps {
  certifications: string[];
  onCertificationsChange: (certifications: string[]) => void;
}

/**
 * Manages coach certifications with dropdown selection.
 * Allows adding and removing certifications from a predefined list.
 * Follows the same pattern as TournamentSeriesManager.
 */
const CertificationManager: React.FC<CertificationManagerProps> = ({
  certifications,
  onCertificationsChange,
}) => {
  const { t } = useTranslation();

  // UI state for adding new certification
  const [isAdding, setIsAdding] = useState(false);
  const [selectedCert, setSelectedCert] = useState('');

  // Get available certifications grouped (exclude already selected)
  const availableGroups = useMemo(
    () => CERTIFICATION_GROUPS.map(group => ({
      ...group,
      certifications: group.certifications.filter(cert => !certifications.includes(cert)),
    })).filter(group => group.certifications.length > 0),
    [certifications]
  );

  // Flat list for checking if any certifications remain
  const hasAvailableCertifications = availableGroups.some(g => g.certifications.length > 0);

  /**
   * Validates and adds selected certification:
   * 1. Must not be empty
   * 2. Must be from CERTIFICATIONS list (dropdown enforces this, defensive check)
   * 3. Must not already exist (filtered by availableCertifications, defensive check)
   */
  const handleAdd = () => {
    if (!selectedCert || !(CERTIFICATIONS as readonly string[]).includes(selectedCert)) return;
    if (certifications.includes(selectedCert)) return;

    onCertificationsChange([...certifications, selectedCert]);
    setSelectedCert('');
    setIsAdding(false);
  };

  const handleRemove = (cert: string) => {
    onCertificationsChange(certifications.filter(c => c !== cert));
  };

  const handleCancel = () => {
    setIsAdding(false);
    setSelectedCert('');
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">
        {t('personnelDetailsModal.certifications', 'Certifications')}
      </label>

      {/* Display existing certifications */}
      {certifications.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {certifications.map((cert) => (
            <div
              key={cert}
              className="flex items-center gap-1 bg-slate-600 px-2 py-1 rounded-md text-sm"
            >
              <span>{cert}</span>
              <button
                type="button"
                onClick={() => handleRemove(cert)}
                className="text-slate-400 hover:text-red-400 ml-1"
                aria-label={`${t('common.remove', 'Remove')}: ${cert}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new certification UI */}
      {isAdding ? (
        <div className="flex gap-2">
          <select
            value={selectedCert}
            onChange={(e) => setSelectedCert(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
            aria-label={t('personnelDetailsModal.selectCertification', 'Select certification')}
          >
            <option value="">{t('personnelDetailsModal.selectCertificationPlaceholder', '-- Select Certification --')}</option>
            {availableGroups.map(group => (
              <optgroup key={group.labelKey} label={t(group.labelKey, group.label)}>
                {group.certifications.map(cert => (
                  <option key={cert} value={cert}>
                    {cert}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedCert}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-md text-sm"
            aria-label={t('common.add', 'Add')}
          >
            {t('common.add', 'Add')}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-sm"
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          disabled={!hasAvailableCertifications}
          className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-md text-sm"
          aria-label={t('personnelDetailsModal.addCertification', 'Add certification')}
        >
          + {t('personnelDetailsModal.addCertification', 'Add Certification')}
        </button>
      )}
    </div>
  );
};

export default CertificationManager;
