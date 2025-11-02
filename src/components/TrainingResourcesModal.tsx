'use client';

import React from 'react';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import logger from '@/utils/logger';

interface TrainingResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TrainingResourcesModal: React.FC<TrainingResourcesModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  type ListItem = string | { title: string; subPoints?: ListItem[] };

  const renderListItems = (items: string | ListItem[], itemKeyPrefix: string, level = 1): React.ReactNode => {
    let actualItems: ListItem[];
    if (typeof items === 'string') {
      const fetchedItems = t(items, { returnObjects: true });
      // Type guard: validate translation returns an array
      if (!Array.isArray(fetchedItems)) {
        logger.warn(`Translation key "${items}" did not return an array`, { fetchedItems });
        return null;
      }
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        <div className="relative z-10 flex flex-col min-h-0 h-full">
          {/* Header */}
          <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20 flex-shrink-0">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">
              {t('controlBar.training', 'Warmup Plan')}
            </h2>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6">
              <div className="space-y-4">
                <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3">{t('warmup.section1Title', 'General Warmup')}</h3>
                  <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-sm">
                    {renderListItems(t('warmup.section1Points', { returnObjects: true, defaultValue: [] }) as ListItem[], 's1')}
                  </ul>
                </section>

                <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3">{t('warmup.section2Title', 'Dynamic Warmup')}</h3>
                  <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-sm">
                    {renderListItems(t('warmup.section2Activities', { returnObjects: true, defaultValue: [] }) as ListItem[], 's2')}
                  </ul>
                </section>

                <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3">{t('warmup.section3Title', 'Pair Work')}</h3>
                  <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-sm">
                    {renderListItems(t('warmup.section3PairWorkPoints', { returnObjects: true, defaultValue: [] }) as ListItem[], 's3')}
                  </ul>
                </section>

                <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3">{t('warmup.section3GoalieWarmup', 'Goalkeeper Warmup')}</h3>
                  <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-sm">
                    {renderListItems(t('warmup.section3GoalieWarmupPoints', { returnObjects: true, defaultValue: [] }) as ListItem[], 's4')}
                  </ul>
                </section>

                <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3">{t('warmup.section3CombinedGoalieWarmup', 'Combined Goalkeeper Warmup')}</h3>
                  <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-sm">
                    {renderListItems(t('warmup.section3CombinedGoalieWarmupPoints', { returnObjects: true, defaultValue: [] }) as ListItem[], 'dg')}
                  </ul>
                </section>

                <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3">{t('warmup.section4Title', 'Pre-Game')}</h3>
                  <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-sm">
                    {renderListItems(t('warmup.section4Points', { returnObjects: true, defaultValue: [] }) as ListItem[], 's5')}
                  </ul>
                </section>

                <section className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3">{t('warmup.duringGameTitle', 'During Game')}</h3>
                  <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-sm">
                    {renderListItems(t('warmup.duringGamePoints', { returnObjects: true, defaultValue: [] }) as ListItem[], 's6')}
                  </ul>
                </section>
              </div>
            </div>
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
