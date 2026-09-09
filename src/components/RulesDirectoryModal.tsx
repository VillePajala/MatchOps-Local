'use client';

import React from 'react';
import { CollapsibleModalHeader } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2';
import ruleLinks from '@/config/ruleLinks.json';
import { GAME_FORMATS, GAME_FORMATS_SOURCE, GAME_FORMATS_GENERAL_NOTES } from '@/config/gameFormats';
import { searchRules, lawUrl, rulebookUrl, type RulesSport } from '@/config/rulesIndex';
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
const SERIES_LINKS = RULE_LINKS.filter((l) => l.group === 'series');
const RULEBOOK_LINKS = RULE_LINKS.filter((l) => l.group === 'rulebooks');

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
  const { t, i18n } = useTranslation();
  const [sport, setSport] = React.useState<RulesSport>('football');
  const [query, setQuery] = React.useState('');
  const lang = i18n.language?.startsWith('en') ? 'en' : 'fi';
  const hits = React.useMemo(() => searchRules(sport, query, lang), [sport, query, lang]);

  // The stored date is ISO so the config stays machine-readable; a Finnish
  // reader should still see 9.9.2026 rather than a raw config value.
  const checkedOn = React.useMemo(() => {
    const parsed = new Date(ruleLinks.checkedOn);
    if (Number.isNaN(parsed.getTime())) return ruleLinks.checkedOn;
    return parsed.toLocaleDateString(i18n.language || undefined);
  }, [i18n.language]);

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

              {/* Look up a law without opening a 139-page PDF and scrolling.
                  Deliberately an INDEX, not the rules: IFAB and FIFA reserve
                  all rights and their terms allow using the text only on their
                  own sites, so the app carries our topic wording plus the law
                  numbers, titles and pages, and every result opens the rights
                  holder's own document at that page. Never paste rule text. */}
              <Section title={t('rulesDirectory.lookupTitle', 'Etsi sääntö')}>
                <div className="flex gap-2">
                  {(['football', 'futsal'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSport(s)}
                      aria-pressed={sport === s}
                      data-testid={`rules-sport-${s}`}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        sport === s ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {s === 'football'
                        ? t('rulesDirectory.sportFootball', 'Jalkapallo')
                        : t('rulesDirectory.sportFutsal', 'Futsal')}
                    </button>
                  ))}
                </div>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  data-testid="rules-search"
                  aria-label={t('rulesDirectory.lookupTitle', 'Etsi sääntö')}
                  placeholder={t('rulesDirectory.searchPlaceholder', 'Esim. paitsio, kentältäpoisto, vaihdot')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {hits.length === 0 ? (
                  <p className="text-xs text-slate-400" data-testid="rules-no-hits">
                    {t('rulesDirectory.noHits', 'Ei osumia. Kokeile toista sanaa tai selaa sääntökirjaa.')}
                  </p>
                ) : (
                  <ul className="space-y-1" data-testid="rules-hits">
                    {hits.map((h) => (
                      <li key={h.key}>
                        <button
                          type="button"
                          onClick={() => {
                            // Guidance sections have no law number, so they are
                            // addressed by page directly.
                            const url =
                              h.law === null
                                ? `${rulebookUrl(sport) ?? ''}#page=${h.page}`
                                : lawUrl(sport, h.law);
                            if (url) openLink(url);
                          }}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-slate-800/70 hover:bg-slate-700/70 text-left transition-colors"
                        >
                          <span className="min-w-0">
                            <span className="text-sm text-slate-200">
                              {h.law === null
                                ? h.title
                                : `${t('rulesDirectory.lawN', 'Sääntö {{n}}', { n: h.law })} - ${h.title}`}
                            </span>
                            {h.via && <span className="block text-xs text-slate-400 truncate">{h.via}</span>}
                          </span>
                          <span className="shrink-0 text-xs text-slate-500">
                            {t('rulesDirectory.pageN', 's. {{n}}', { n: h.page })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-slate-500">
                  {t('rulesDirectory.lookupNote', 'Avaa virallisen sääntökirjan oikealta sivulta. Säännöt julkaisee IFAB (jalkapallo) ja FIFA (futsal).')}
                </p>
              </Section>

              {/* Palloliitto does not publish "the rules" in one place, and a
                  screen that hides that fact is the reason this one felt
                  half-finished: some futsal numbers, then four documents.
                  There are three different kinds of rule and they live apart,
                  so the page says which is which and puts the coach's OWN
                  series first - that is the only one that is actually theirs. */}
              <p className="text-xs text-slate-400">
                {t(
                  'rulesDirectory.intro',
                  'Säännöt ovat kolmessa paikassa: oman sarjasi säännöt, ikäluokkien pelimuodot ja lajisäännöt.',
                )}
              </p>

              <Section title={t('rulesDirectory.seriesTitle', 'Oman sarjasi säännöt')}>
                <p className="text-xs text-slate-400 -mt-1">
                  {t(
                    'rulesDirectory.seriesHelp',
                    'Pelaajamäärä, peliaika ja kentän koko ovat sarjakohtaisia. Valitse sarjasi ja avaa Info > Säännöt.',
                  )}
                </p>
                {SERIES_LINKS.map((link) => (
                  <LinkButton
                    key={link.id}
                    url={link.url}
                    label={t(link.labelKey as TranslationKey, link.fallbackLabel)}
                  />
                ))}
              </Section>

              {/* The formats table, second: it answers the question a coach
                  actually has ("how long are our halves?") without opening a
                  document. The links below stay for the full text.

                  The heading says NATIONAL DEFAULT deliberately. A series may
                  deviate, and its own rules live in Palloliitto's results
                  service behind an API key the app does not have, so stating
                  these as "your rules" would be confidently wrong for anyone
                  whose league differs. */}
              {/* The title names the SPORT and SEASON from the data itself, not
                  a generic "game formats". Most coaches here play football, and
                  a football coach reading futsal's 4v4 as their own would be
                  exactly the confidently-wrong answer this section exists to
                  prevent. Football is absent because no extractable source
                  exists yet (see the roadmap), and the caveat says so. */}
              <Section
                title={t('rulesDirectory.formatsTitle', 'Pelimuodot - futsal {{season}}', {
                  season: GAME_FORMATS_SOURCE.season,
                })}
              >
                <p className="text-xs text-slate-400 -mt-1">
                  {t(
                    'rulesDirectory.formatsCaveat',
                    'Palloliiton valtakunnalliset oletukset ikäluokittain. Sarja voi poiketa näistä - tarkista oman sarjasi tiedot.',
                  )}
                </p>
                <p className="text-xs text-amber-300/90">
                  {t(
                    'rulesDirectory.formatsFutsalOnly',
                    'Taulukko koskee vain futsalia. Jalkapallon pelimuodot eivät ole täällä; katso sarjasi tiedot.',
                  )}
                </p>
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-left text-xs" data-testid="formats-table">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="py-1.5 pr-3 font-medium">{t('rulesDirectory.colAge', 'Ikäluokka')}</th>
                        <th className="py-1.5 pr-3 font-medium">{t('rulesDirectory.colPlayers', 'Pelimuoto')}</th>
                        <th className="py-1.5 pr-3 font-medium whitespace-nowrap">{t('rulesDirectory.colTime', 'Peliaika')}</th>
                        <th className="py-1.5 pr-3 font-medium whitespace-nowrap">{t('rulesDirectory.colField', 'Kenttä')}</th>
                        <th className="py-1.5 font-medium whitespace-nowrap">{t('rulesDirectory.colBall', 'Pallo')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {GAME_FORMATS.map((f) => (
                        <React.Fragment key={f.sourceLabel}>
                          <tr className="border-t border-slate-700/60 align-top">
                            <td className="py-1.5 pr-3 text-slate-200 whitespace-nowrap">{f.sourceLabel}</td>
                            <td className="py-1.5 pr-3 text-yellow-400 font-semibold whitespace-nowrap">{f.fieldSize}</td>
                            <td className="py-1.5 pr-3 text-slate-300">{f.playingTimeText}</td>
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{f.field}</td>
                            <td className="py-1.5 text-slate-300 whitespace-nowrap">{f.ball}</td>
                          </tr>
                          {/* The source's "keskeiset sääntönostot" column, which is
                              the most useful part for a coach: it is where the
                              rules actually differ by age (back-pass, restarts).
                              A spanning row rather than a sixth column, because a
                              sixth column is unreadable on a phone. */}
                          {f.notes.length > 0 && (
                            <tr>
                              <td colSpan={5} className="pb-2 text-slate-400 leading-relaxed">
                                {f.notes.join(' · ')}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                {GAME_FORMATS_GENERAL_NOTES.map((n) => (
                  <p key={n} className="text-xs text-slate-400">{n}</p>
                ))}
                <p className="text-xs text-slate-500">
                  {t('rulesDirectory.formatsSource', 'Lähde: {{title}}', { title: GAME_FORMATS_SOURCE.title })}
                </p>
              </Section>

              {/* The laws of the game: same for everyone, and the least
                  likely thing a coach is actually looking for, so last. */}
              <Section title={t('rulesDirectory.rulebooksTitle', 'Lajisäännöt')}>
                {RULEBOOK_LINKS.map((link) => (
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
                {t('rulesDirectory.checkedOn', 'Linkit tarkistettu {{date}}.', { date: checkedOn })}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default RulesDirectoryModal;
