'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Personnel } from '@/types';
import { getRoleLabelKey } from '@/utils/personnelRoles';

interface PersonnelSummaryCardProps {
  personnel: Personnel[];
}

export const PersonnelSummaryCard: React.FC<PersonnelSummaryCardProps> = ({ personnel }) => {
  const { t } = useTranslation();

  if (!personnel || personnel.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-slate-900/60 to-slate-800/40 border border-slate-700 rounded-xl shadow-inner p-4">
      <h3 className="text-lg font-semibold text-slate-200 mb-3">
        {t('gameStats.personnelSectionTitle', 'Game Personnel')}
      </h3>
      <div className="space-y-2">
        {personnel.map(person => (
          <div
            key={person.id}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-slate-900/50 border border-slate-700/60 rounded-lg px-3 py-2"
          >
            <div className="text-slate-200 font-medium">{person.name}</div>
            <div className="text-sm text-slate-400">
              {t(getRoleLabelKey(person.role), person.role)}
            </div>
            {(person.phone || person.email) && (
              <div className="text-xs text-slate-500">
                {person.phone && <span className="mr-2">{person.phone}</span>}
                {person.email && <span>{person.email}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
