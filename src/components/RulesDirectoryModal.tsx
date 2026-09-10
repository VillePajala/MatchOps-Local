'use client';

import React from 'react';
import { CollapsibleModalHeader } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2';
import ruleLinks from '@/config/ruleLinks.json';
import { GAME_FORMATS, GAME_FORMATS_SOURCE, GAME_FORMATS_GENERAL_NOTES, findFormatForAgeGroup } from '@/config/gameFormats';
import { AGE_GROUPS } from '@/config/gameOptions';
import { searchRules, rulebookUrl, type RulesSport } from '@/config/rulesIndex';
import RuleViewerModal from '@/components/RuleViewerModal';
import type { TranslationKey } from '@/i18n-types';

interface RulesDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Sport to open on, derived from the coach's own games (see rulesContext). */
  defaultSport?: RulesSport;
  /** Age group to open on, likewise derived rather than assumed. */
  defaultAgeGroup?: string;
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

const RulesDirectoryModal: React.FC<RulesDirectoryModalProps> = ({
  isOpen,
  onClose,
  defaultSport = 'football',
  defaultAgeGroup,
}) => {
  const { t, i18n } = useTranslation();
  const [sport, setSport] = React.useState<RulesSport>(defaultSport);
  // The age band the coach cares about. '' means show every band.
  const [ageGroup, setAgeGroup] = React.useState<string>(defaultAgeGroup ?? '');
  const [showAllFormats, setShowAllFormats] = React.useState(false);

  // Re-derive on each open: the coach may have added games since last time.
  const [prevOpenCtx, setPrevOpenCtx] = React.useState(isOpen);
  if (prevOpenCtx !== isOpen) {
    setPrevOpenCtx(isOpen);
    if (isOpen) {
      setSport(defaultSport);
      setAgeGroup(defaultAgeGroup ?? '');
      setShowAllFormats(false);
    }
  }
  const [query, setQuery] = React.useState('');
  const lang = i18n.language?.startsWith('en') ? 'en' : 'fi';
  const hits = React.useMemo(() => searchRules(sport, query, lang), [sport, query, lang]);
  // What the coach tapped: the viewer opens the book at that page in the app,
  // because the "#page=" fragment only works in a desktop PDF viewer.
  const [viewing, setViewing] = React.useState<{ page: number; title: string } | null>(null);

  // One band when the coach has named an age group, all of them otherwise. An
  // age we cannot place falls back to the whole table rather than showing
  // nothing, since an empty table reads as "no rules exist".
  const shownFormats = React.useMemo(() => {
    if (!ageGroup) return GAME_FORMATS;
    const band = findFormatForAgeGroup(ageGroup);
    return band ? [band] : GAME_FORMATS;
  }, [ageGroup]);

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
                          onClick={() =>
                            setViewing({
                              page: h.page,
                              title:
                                h.law === null
                                  ? h.title
                                  : `${t('rulesDirectory.lawN', 'Sääntö {{n}}', { n: h.law })} - ${h.title}`,
                            })
                          }
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
                          {/* The page is the actionable part, so it is not a
                              faint aside. "#page=" is a desktop PDF-viewer
                              feature; on a phone the book opens at page 1 and
                              the reader navigates themselves, so the number
                              has to be readable at a glance. */}
                          <span className="shrink-0 text-sm font-semibold text-yellow-400 tabular-nums">
                            {t('rulesDirectory.pageN', 's. {{n}}', { n: h.page })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-slate-400">
                  {t('rulesDirectory.pageHint2', 'Sääntö avautuu suoraan oikealta sivulta. Vain luetut sivut ladataan.')}
                </p>
                <p className="text-xs text-slate-500">
                  {t('rulesDirectory.lookupNote', 'Säännöt julkaisee IFAB (jalkapallo) ja FIFA (futsal).')}
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
                  'Säännöt ovat kolmessa paikassa: sarjakohtaiset säännöt, ikäluokkien pelimuodot ja lajisäännöt.',
                )}
              </p>

              <Section title={t('rulesDirectory.seriesTitle', 'Sarjakohtaiset säännöt')}>
                <p className="text-xs text-slate-400 -mt-1">
                  {t(
                    'rulesDirectory.seriesHelp',
                    'Pelaajamäärä, peliaika ja kentän koko määritellään sarjoittain, eikä sovellus tiedä missä sarjassa joukkueesi pelaa - MatchOps ei ole yhteydessä Palloliiton järjestelmään. Etsi sarjasi listasta ja avaa Info > Säännöt.',
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
              {/* Contextual, not a permanent fixture. The table used to sit here
                  for every coach whatever they played, which described what was
                  available to build rather than anything they needed - futsal is
                  simply the only sport whose formats Palloliitto publishes as
                  data. Football coaches now get one line instead of a table they
                  must scroll past, and futsal coaches get their own age band. */}
              <Section
                title={t('rulesDirectory.formatsTitle', 'Pelimuodot - futsal {{season}}', {
                  season: GAME_FORMATS_SOURCE.season,
                })}
              >
                {sport === 'football' && !showAllFormats ? (
                  <>
                    <p className="text-xs text-slate-400 -mt-1">
                      {t(
                        'rulesDirectory.formatsFootballNone',
                        'Jalkapallon pelimuotoja ei julkaista taulukkona. Katso oman sarjasi tiedot yltä.',
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAllFormats(true)}
                      data-testid="formats-expand"
                      className="w-full px-3 py-2 rounded-md text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-100"
                    >
                      {t('rulesDirectory.formatsShowFutsal', 'Näytä futsalin pelimuodot')}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-slate-400 -mt-1">
                      {t(
                        'rulesDirectory.formatsCaveat',
                        'Palloliiton valtakunnalliset oletukset ikäluokittain. Sarja voi poiketa näistä - tarkista oman sarjasi tiedot.',
                      )}
                    </p>
                    <select
                      value={ageGroup}
                      onChange={(e) => setAgeGroup(e.target.value)}
                      data-testid="formats-age"
                      aria-label={t('rulesDirectory.formatsAgeLabel', 'Ikäluokka')}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">{t('rulesDirectory.formatsAllAges', 'Kaikki ikäluokat')}</option>
                      {AGE_GROUPS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
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
                          {shownFormats.map((f) => (
                            <React.Fragment key={f.sourceLabel}>
                              <tr className="border-t border-slate-700/60 align-top">
                                <td className="py-1.5 pr-3 text-slate-200 whitespace-nowrap">{f.sourceLabel}</td>
                                <td className="py-1.5 pr-3 text-yellow-400 font-semibold whitespace-nowrap">{f.fieldSize}</td>
                                <td className="py-1.5 pr-3 text-slate-300">{f.playingTimeText}</td>
                                <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{f.field}</td>
                                <td className="py-1.5 text-slate-300 whitespace-nowrap">{f.ball}</td>
                              </tr>
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
                    {ageGroup && shownFormats.length < GAME_FORMATS.length && (
                      <button
                        type="button"
                        onClick={() => setAgeGroup('')}
                        data-testid="formats-show-all"
                        className="text-xs text-slate-400 hover:text-slate-200 underline"
                      >
                        {t('rulesDirectory.formatsAllAges', 'Kaikki ikäluokat')}
                      </button>
                    )}
                    {GAME_FORMATS_GENERAL_NOTES.map((n) => (
                      <p key={n} className="text-xs text-slate-400">{n}</p>
                    ))}
                    <p className="text-xs text-slate-500">
                      {t('rulesDirectory.formatsSource', 'Lähde: {{title}}', { title: GAME_FORMATS_SOURCE.title })}
                    </p>
                  </>
                )}
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

      <RuleViewerModal
        isOpen={viewing !== null}
        onClose={() => setViewing(null)}
        url={rulebookUrl(sport)}
        page={viewing?.page ?? 1}
        title={viewing?.title ?? ''}
      />
    </div>
  );
};

export default RulesDirectoryModal;
