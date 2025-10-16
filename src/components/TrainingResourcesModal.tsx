'use client';

import React, { useState } from 'react';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi2';

interface TrainingResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TrainingSection = 'warmup';

const TrainingResourcesModal: React.FC<TrainingResourcesModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [expandedSection, setExpandedSection] = useState<TrainingSection | null>('warmup');

  if (!isOpen) return null;

  type ListItem = string | { title: string; subPoints?: ListItem[] }; 

  const renderListItems = (items: string | ListItem[], itemKeyPrefix: string, level = 1): React.ReactNode => {
    let actualItems: ListItem[];
    if (typeof items === 'string') {
        const fetchedItems = t(items, { returnObjects: true });
        if (!Array.isArray(fetchedItems)) return null;
      actualItems = fetchedItems as ListItem[];
    } else {
      actualItems = items;
    }

    return actualItems.map((item: ListItem, index: number) => {
      const key = `${itemKeyPrefix}-${index}`;
      const currentPadding = `pl-${2 + level * 2}`;

      if (typeof item === 'object' && item !== null && item.title) {
        return (
          <li key={key}>
            {item.title}
            {item.subPoints && Array.isArray(item.subPoints) && item.subPoints.length > 0 && (
              <ul className={`list-disc list-inside space-y-1 ${currentPadding} mt-1`}> 
                {renderListItems(item.subPoints, key, level + 1)}
              </ul>
            )}
          </li>
        );
      }
      return <li key={key}>{String(item)}</li>;
    });
  };

  const toggleSection = (section: TrainingSection) => {
    setExpandedSection(prev => (prev === section ? null : section));
  };

  const sections: { key: TrainingSection; titleKey: string }[] = [
    { key: 'warmup', titleKey: 'trainingResourcesModal.navWarmup' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        <div className="relative z-10 flex flex-col min-h-0">
          {/* Header */}
          <div className="flex flex-col">
            {/* Title Section */}
            <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20">
              <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">
                {t('trainingResourcesModal.title', 'Training Resources')}
              </h2>
            </div>

            {/* Counter Section */}
            <div className="px-6 pt-1 pb-4 backdrop-blur-sm bg-slate-900/20 border-b border-slate-700/20">
              <div className="text-center text-sm">
                <span className="text-yellow-400 font-semibold">{sections.length}</span>
                {" "}{sections.length === 1 ? t('common.section', 'Section') : t('common.sections', 'Sections')}
              </div>
            </div>
          </div>
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-2">
          {sections.map((section) => {
            const isExpanded = expandedSection === section.key;
            return (
              <div key={section.key} className="bg-slate-900/60 rounded-lg border border-slate-700 shadow-inner overflow-hidden -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
                <button
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex justify-between items-center p-4 text-left bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 transition-all"
                  aria-expanded={isExpanded}
                >
                  <span className="font-semibold text-lg text-slate-100">{t(section.titleKey)}</span>
                  {isExpanded ? <HiOutlineChevronUp className="w-5 h-5 text-slate-400"/> : <HiOutlineChevronDown className="w-5 h-5 text-slate-400"/>}
                </button>

                {isExpanded && (
                  <div className="p-6 text-sm sm:text-base">
                    {section.key === 'warmup' && (
                        <div className="space-y-6">
                        <h3 className="text-xl font-semibold text-slate-200 mb-2">{t('warmup.title')}</h3>
                        <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                          <h4 className="text-lg font-bold mb-2 text-slate-200">{t('warmup.section1Title')}</h4>
                          <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300">{renderListItems(t('warmup.section1Points', { returnObjects: true }) as ListItem[], 's1')}</ul>
                        </section>
                        <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                            <h4 className="text-lg font-bold mb-2 text-slate-200">{t('warmup.section2Title')}</h4>
                          <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300">{renderListItems(t('warmup.section2Activities', { returnObjects: true }) as ListItem[], 's2')}</ul>
                          </section>
                          <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                            <h4 className="text-lg font-bold mb-2 text-slate-200">{t('warmup.section3Title')}</h4>
                          <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300">{renderListItems(t('warmup.section3PairWorkPoints', { returnObjects: true }) as ListItem[], 's3')}</ul>
                          </section>
                          <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                            <h4 className="text-lg font-bold mb-2 text-slate-200">{t('warmup.section3GoalieWarmup')}</h4>
                          <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300">{renderListItems(t('warmup.section3GoalieWarmupPoints', { returnObjects: true }) as ListItem[], 's4')}</ul>
                          </section>
                          <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                            <h4 className="text-lg font-bold mb-2 text-slate-200">{t('warmup.section3CombinedGoalieWarmup')}</h4>
                          <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300">{renderListItems(t('warmup.section3CombinedGoalieWarmupPoints', { returnObjects: true }) as ListItem[], 'dg')}</ul>
                          </section>
                          <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                            <h4 className="text-lg font-bold mb-2 text-slate-200">{t('warmup.section4Title')}</h4>
                          <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300">{renderListItems(t('warmup.section4Points', { returnObjects: true }) as ListItem[], 's5')}</ul>
                          </section>
                          <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-4 rounded-lg transition-all">
                            <h4 className="text-lg font-bold mb-2 text-slate-200">{t('warmup.duringGameTitle')}</h4>
                          <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300">{renderListItems(t('warmup.duringGamePoints', { returnObjects: true }) as ListItem[], 's6')}</ul>
                          </section>
                        </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

          {/* Footer */}
          <ModalFooter>
            <button onClick={onClose} className={primaryButtonStyle}>
              {t('common.doneButton', 'Done')}
            </button>
          </ModalFooter>
        </div>
      </div>
    </div>
  );
};

export default TrainingResourcesModal; 
