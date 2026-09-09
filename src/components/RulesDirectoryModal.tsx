'use client';

import React from 'react';
import { CollapsibleModalHeader } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2';
import ruleLinks from '@/config/ruleLinks.json';
import type { TranslationKey } from '@/i18n-types';

interface RulesDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Official rule document links from Palloliitto.
 *
 * The links themselves live in src/config/ruleLinks.json, because a weekly CI
 * check (scripts/check-rule-links.mjs) reads the same file. Keeping one source
 * is the point: Palloliitto re-issues a rulebook under a new asset id and keeps
 * serving the old file, so the way these go wrong is not a broken link but a
 * working link to a superseded edition. That is invisible to a human reader and
 * obvious to a check that asks whether the URL is still listed on the index.
 *
 * @see https://www.palloliitto.fi/saannot-maaraykset-ja-ohjeet - Main rules page (stable URL)
 */
const RULE_LINKS = ruleLinks.links;

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
          {/* Chrome slimming: X-header replaces the header + close-only footer. */}
          <CollapsibleModalHeader
            title={t('rulesDirectory.title', 'Säännöt')}
            onClose={onClose}
            closeLabel={t('common.doneButton', 'Done')}
          />

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
            <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 space-y-6">

              {/* Palloliitto Section */}
              <Section title="Palloliitto">
                {RULE_LINKS.map((link) => (
                  <LinkButton
                    key={link.id}
                    url={link.url}
                    label={t(link.labelKey as TranslationKey, link.fallbackLabel)}
                  />
                ))}
              </Section>

              {/* Footer info, with the date the links were last verified against
                  Palloliitto's index - a superseded PDF still opens, so the age
                  of the check is the only thing that tells a coach how much to
                  trust what they are about to read. */}
              <p className="text-xs text-slate-500 text-center pt-2">
                {t('rulesDirectory.footer', 'Linkit avautuvat selaimessa. Säännöt ylläpitää Palloliitto.')}
                {' '}
                {t('rulesDirectory.checkedOn', 'Linkit tarkistettu {{date}}.', { date: ruleLinks.checkedOn })}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default RulesDirectoryModal;
