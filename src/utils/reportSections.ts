/**
 * The seven match-report headings, in one place (Kirjuri PR 9a).
 *
 * The blank template the coach can insert and the headings an AI draft is
 * written under were previously two separate things: a single blob string in
 * the locale files, and the section keys the drafting schema uses. Composing
 * both from these keys means a renamed heading cannot leave a drafted report
 * filed under a heading the template no longer has.
 */

import type { TFunction } from 'i18next';
import { REPORT_SECTIONS, type ReportSectionKey } from '@/utils/aiDrafting';

const FALLBACKS: Record<ReportSectionKey, string> = {
  overview: 'Overview',
  flow: 'How the game unfolded',
  worked: 'What went well',
  improve: "What we're working on",
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
