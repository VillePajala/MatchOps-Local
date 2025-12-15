'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CERTIFICATIONS } from '@/config/gameOptions';

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

  // Get available certifications (exclude already selected)
  const availableCertifications = useMemo(
    () => CERTIFICATIONS.filter(cert => !certifications.includes(cert)),
    [certifications]
  );

  const handleAdd = () => {
    // selectedCert comes from controlled dropdown with only valid options
    // Cast to string[] for includes check since CERTIFICATIONS is a const array
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
            {availableCertifications.map(cert => (
              <option key={cert} value={cert}>
                {cert}
              </option>
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
          disabled={availableCertifications.length === 0}
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
