'use client';

import React from 'react';
import { ModalFooter, primaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2';

interface RulesDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Official rule document links from Palloliitto.
 *
 * MAINTENANCE NOTE: PDF URLs contain year-specific identifiers and change annually
 * when new rule editions are published (typically each January/February for the new season).
 * Update these links when Palloliitto releases new rule documents.
 *
 * To verify links: Visit https://www.palloliitto.fi/saannot-maaraykset-ja-ohjeet
 * and update the PDF URLs from the "Lajisäännöt" section.
 *
 * @see https://www.palloliitto.fi/saannot-maaraykset-ja-ohjeet - Main rules page (stable URL)
 */
const RULE_LINKS = {
  soccerRules: 'https://www-assets.palloliitto.fi/62562/1739435685-jalkapallosaannot-2025.pdf',
  futsalRules: 'https://www-assets.palloliitto.fi/62562/1760095939-futsalsaannot-2025-2026.pdf',
  youthRules: 'https://www-assets.palloliitto.fi/62562/1737814984-1710753804-kaikki-pelaa-ohjelma-2025.pdf',
  palloliitoAll: 'https://www.palloliitto.fi/saannot-maaraykset-ja-ohjeet',
};

const openLink = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

// Link button component
const LinkButton = ({ url, label }: { url: string; label: string }) => (
  <button
    onClick={() => openLink(url)}
    aria-label={`Open ${label} in new window`}
    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 rounded-lg text-left transition-all group"
  >
    <span className="text-slate-200 text-sm font-medium">{label}</span>
    <HiOutlineArrowTopRightOnSquare className="w-4 h-4 text-slate-400 group-hover:text-slate-200 flex-shrink-0" />
  </button>
);

// Section component
const Section = ({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-3">
    <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
    <div className="space-y-2">
      {children}
    </div>
  </div>
);

const RulesDirectoryModal: React.FC<RulesDirectoryModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

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
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
              {t('rulesDirectory.title', 'Säännöt')}
            </h2>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 space-y-6">

              {/* Palloliitto Section */}
              <Section title="Palloliitto">
                <LinkButton
                  url={RULE_LINKS.soccerRules}
                  label={t('rulesDirectory.soccerRules', 'Jalkapallosäännöt 2025')}
                />
                <LinkButton
                  url={RULE_LINKS.futsalRules}
                  label={t('rulesDirectory.futsalRules', 'Futsalsäännöt 2025-2026')}
                />
                <LinkButton
                  url={RULE_LINKS.youthRules}
                  label={t('rulesDirectory.youthRules', 'Kaikki Pelaa 2025')}
                />
                <LinkButton
                  url={RULE_LINKS.palloliitoAll}
                  label={t('rulesDirectory.allRules', 'Kaikki säännöt ja määräykset')}
                />
              </Section>

              {/* Footer info */}
              <p className="text-xs text-slate-500 text-center pt-2">
                {t('rulesDirectory.footer', 'Linkit avautuvat selaimessa. Säännöt ylläpitää Palloliitto.')}
              </p>
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

export default RulesDirectoryModal;
