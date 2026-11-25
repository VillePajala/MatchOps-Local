/**
 * The seven match-report headings, in one place (Kirjuri PR 9a).
 *
 * The blank template the coach can insert and the headings an AI draft is
 * written under were previously two separate things: a single blob string in
 * the locale files, and the section keys the drafting schema uses. Composing
 * both from these keys means a renamed heading cannot leave a drafted report
 * filed under a heading the template no longer has.
 *
 * Renaming a heading is safe for reports already written: nothing in the app
 * reads a saved report back by its headings - the text is the coach's, shown
 * and shared as written. The one consumer that interprets them is the AI tidy
 * job, which is told the old names (aiDrafting.ts, the tidy rules):
 * "Mikä toimi hyvin" -> worked and "Kehityskohteet" -> improve (2026-11-25).
 */

import type { TFunction } from 'i18next';
import { DAY_REPORT_SECTIONS, REPORT_SECTIONS, type ReportSectionKey } from '@/utils/aiDrafting';

const FALLBACKS: Record<ReportSectionKey, string> = {
  overview: 'Overview',
  flow: 'How the game unfolded',
  worked: 'What went well',
  improve: 'What to improve',
  spirit: 'Team spirit & effort',
  mentions: 'Highlights',
  next: 'Next step',
};

export interface ReportSectionHeading {
  section: ReportSectionKey;
  label: string;
}

/** Localized headings in template order. */
export function reportSectionHeadings(t: TFunction): ReportSectionHeading[] {
  return REPORT_SECTIONS.map((section) => ({
    section,
    label: t(`gameStatsModal.reportSections.${section}`, FALLBACKS[section]),
  }));
}

/** One heading's label, for rendering a single drafted section. */
export function reportSectionLabel(t: TFunction, section: ReportSectionKey): string {
  return t(`gameStatsModal.reportSections.${section}`, FALLBACKS[section]);
}

/**
 * The day report's headings (a tournament day, a tournament, a league): the
 * match headings without "how the game unfolded", in their own words
 * (`planDayReport.sections.*`) - the same keys, so an AI draft's sections map
 * straight onto them.
 */
const DAY_FALLBACKS: Record<(typeof DAY_REPORT_SECTIONS)[number], string> = {
  overview: 'Overview',
  worked: 'What went well',
  improve: 'What to improve',
  spirit: 'Team spirit and attitude',
  mentions: 'Special mentions',
  next: 'Next step',
};

export function dayReportSectionLabel(t: TFunction, section: ReportSectionKey): string {
  const fallback = (DAY_FALLBACKS as Partial<Record<ReportSectionKey, string>>)[section] ?? FALLBACKS[section];
  return t(`planDayReport.sections.${section}`, fallback);
}

/** Localized day-report headings in template order. */
export function dayReportSectionHeadings(t: TFunction): ReportSectionHeading[] {
  return DAY_REPORT_SECTIONS.map((section) => ({ section, label: dayReportSectionLabel(t, section) }));
}
