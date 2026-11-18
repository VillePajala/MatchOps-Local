'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { labelStyle, selectStyle, secondaryButtonStyle } from '@/styles/modalStyles';
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
      <label className={labelStyle}>
        {t('personnelDetailsModal.certifications', 'Certifications')}
      </label>

      {/* Display existing certifications */}
      {certifications.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {certifications.map((cert) => (
            <div
              key={cert}
              className="flex items-center gap-1 pl-3.5 pr-1 min-h-11 rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)] font-ui text-sm font-medium text-ink"
            >
              <span>{cert}</span>
              <button
                type="button"
                onClick={() => handleRemove(cert)}
                className="inline-flex items-center justify-center min-h-9 min-w-9 rounded-full text-lg leading-none text-ink-3 hover:text-red-400 hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
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
        <div className="space-y-3">
          <select
            value={selectedCert}
            onChange={(e) => setSelectedCert(e.target.value)}
            className={selectStyle}
            aria-label={t('personnelDetailsModal.selectCertification', 'Select certification')}
          >
            <option value="">{t('personnelDetailsModal.selectCertificationPlaceholder', 'Select Certification')}</option>
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedCert}
              className={`${secondaryButtonStyle} flex-1`}
              aria-label={t('common.add', 'Add')}
            >
              {t('common.add', 'Add')}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className={`${secondaryButtonStyle} flex-1`}
            >
              {t('common.cancel', 'Cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          disabled={!hasAvailableCertifications}
          className={`${secondaryButtonStyle} w-full`}
          aria-label={t('personnelDetailsModal.addCertification', 'Add Certification')}
        >
          + {t('personnelDetailsModal.addCertification', 'Add Certification')}
        </button>
      )}
    </div>
  );
};

export default CertificationManager;
