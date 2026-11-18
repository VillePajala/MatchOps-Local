'use client';

import React from 'react';
import { Personnel } from '@/types/personnel';
import { useTranslation } from 'react-i18next';
import { getRoleLabelKey } from '@/utils/personnelRoles';
import { sectionLabelStyle, checkboxStyle } from '@/styles/modalStyles';

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
    <div className="font-ui">
      {/* Same shape as the player picker: label + count, then one list. */}
      <div className="flex items-baseline justify-between gap-3 px-1 mb-2.5">
        <h3 className={sectionLabelStyle}>{title}</h3>
        <div className="text-[13px] text-ink-3 whitespace-nowrap">
          <span className="font-bold text-ink">{selectedPersonnelIds.length}</span>
          {' / '}
          <span>{availablePersonnel.length}</span>
          {' '}
          {t('personnel.selected', 'selected')}
        </div>
      </div>

      <div className="s1-list overflow-hidden">
      {availablePersonnel.length > 0 ? (
        <>
          <div className="border-b border-hairline">
            <label className="flex items-center gap-3.5 min-h-14 px-4 text-base font-semibold text-ink cursor-pointer">
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
                className={checkboxStyle}
              />
              <span>{t('personnel.selectAll', 'Select All')}</span>
            </label>
          </div>

          <div className="max-h-[336px] overflow-y-auto">
            {availablePersonnel.map((person) => (
              <div
                key={person.id}
                className="relative transition-colors hover:bg-white/[0.03] before:absolute before:top-0 before:left-[54px] before:right-0 before:h-px before:bg-hairline first:before:hidden"
              >
                <label className="flex items-center gap-3.5 min-h-14 px-4 py-2 cursor-pointer">
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
                    className={checkboxStyle}
                  />
                  <div className="min-w-0">
                    <span className="text-base font-medium text-ink">{person.name}</span>
                    <span className="text-ink-3 text-sm ml-1.5">
                      ({t(getRoleLabelKey(person.role), person.role)})
                    </span>
                  </div>
                </label>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center px-4 py-5 text-sm text-ink-3">
          {t('personnel.noPersonnel', 'No personnel available. Add personnel in Personnel Manager.')}
        </div>
      )}
      </div>
    </div>
  );
};

export default PersonnelSelectionSection;
