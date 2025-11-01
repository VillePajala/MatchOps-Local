'use client';

import React from 'react';
import { Personnel } from '@/types/personnel';
import { useTranslation } from 'react-i18next';
import { getRoleLabelKey } from '@/utils/personnelRoles';

export interface PersonnelSelectionSectionProps {
  availablePersonnel: Personnel[];
  selectedPersonnelIds: string[];
  onSelectedPersonnelChange: (ids: string[]) => void;
  title: string;
  disabled?: boolean;
}

const PersonnelSelectionSection: React.FC<PersonnelSelectionSectionProps> = ({
  availablePersonnel,
  selectedPersonnelIds,
  onSelectedPersonnelChange,
  title,
  disabled,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-4 rounded-lg shadow-inner transition-all">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
        <div className="text-sm text-slate-400">
          <span className="text-yellow-400 font-semibold">{selectedPersonnelIds.length}</span>
          {' / '}
          <span className="text-yellow-400 font-semibold">{availablePersonnel.length}</span>
          {' '}
          {t('personnel.selected', 'selected')}
        </div>
      </div>

      {availablePersonnel.length > 0 ? (
        <>
          <div className="flex items-center py-2 px-1 border-b border-slate-700/50">
            <label className="flex items-center text-sm text-slate-300 hover:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                disabled={disabled}
                checked={availablePersonnel.length === selectedPersonnelIds.length}
                onChange={() => {
                  if (disabled) return;
                  if (selectedPersonnelIds.length === availablePersonnel.length) {
                    onSelectedPersonnelChange([]);
                  } else {
                    onSelectedPersonnelChange(availablePersonnel.map((p) => p.id));
                  }
                }}
                className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-700 border-slate-500 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
              />
              <span className="ml-2">{t('personnel.selectAll', 'Select All')}</span>
            </label>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {availablePersonnel.map((person) => (
              <div
                key={person.id}
                className="flex items-center py-1.5 px-1 rounded hover:bg-slate-800/40 transition-colors"
              >
                <label className="flex items-center flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selectedPersonnelIds.includes(person.id)}
                    onChange={() => {
                      if (disabled) return;
                      if (selectedPersonnelIds.includes(person.id)) {
                        onSelectedPersonnelChange(
                          selectedPersonnelIds.filter((id) => id !== person.id)
                        );
                      } else {
                        onSelectedPersonnelChange([...selectedPersonnelIds, person.id]);
                      }
                    }}
                    className="form-checkbox h-4 w-4 text-indigo-600 bg-slate-700 border-slate-500 rounded focus:ring-indigo-500 focus:ring-offset-slate-800"
                  />
                  <div className="ml-2">
                    <span className="text-slate-200">{person.name}</span>
                    <span className="text-slate-400 text-sm ml-2">
                      ({t(getRoleLabelKey(person.role), person.role)})
                    </span>
                  </div>
                </label>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-4 text-slate-400">
          {t('personnel.noPersonnel', 'No personnel available. Add personnel in Personnel Manager.')}
        </div>
      )}
    </div>
  );
};

export default PersonnelSelectionSection;
