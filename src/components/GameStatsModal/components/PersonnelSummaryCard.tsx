'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Personnel } from '@/types';
import { getRoleLabelKey } from '@/utils/personnelRoles';

interface PersonnelSummaryCardProps {
  personnel?: Personnel[];
}

export const PersonnelSummaryCard: React.FC<PersonnelSummaryCardProps> = ({ personnel }) => {
  const { t } = useTranslation();

  const list = personnel ?? [];

  return (
    <div className="s1-list p-4 font-ui">
      <h3 className="text-base font-semibold text-ink mb-3">
        {t('gameStats.personnelSectionTitle', 'Game Personnel')}
      </h3>
      {list.length === 0 ? (
        <p className="text-sm text-ink-3">
          {t('gameStats.personnelEmpty', 'No personnel assigned.')}
        </p>
      ) : (
        <div className="space-y-2">
          {list.map(person => (
            <div
              key={person.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-white/[0.03] border border-hairline rounded-lg px-3 py-2"
            >
              <div className="text-ink font-medium">{person.name}</div>
              <div className="text-sm text-ink-3">
                {t(getRoleLabelKey(person.role), person.role)}
              </div>
              {(person.phone || person.email) && (
                <div className="text-xs text-ink-3">
                  {person.phone && <span className="mr-2">{person.phone}</span>}
                  {person.email && <span>{person.email}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
