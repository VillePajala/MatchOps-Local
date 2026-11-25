/**
 * Report headings (2026-11-25): the match template renames two headings and
 * the multi-game reports get their own six. Old saved texts keep working.
 */
import type { TFunction } from 'i18next';
import fi from '../../../public/locales/fi/common.json';
import en from '../../../public/locales/en/common.json';
import {
  dayReportSectionHeadings,
  dayReportSectionLabel,
  reportSectionHeadings,
} from '@/utils/reportSections';
import { buildDraftingInstructions, DAY_REPORT_SECTIONS, REPORT_SECTIONS } from '@/utils/aiDrafting';
import { buildGamePacket } from '@/utils/gamePacket';
import { buildGameRecap } from '@/utils/gameRecap';
import type { AppState } from '@/types/game';
import type { Player } from '@/types';

/** A `t` that reads the shipped locale file, like i18next does. */
const tFor = (bundle: Record<string, unknown>): TFunction =>
  ((key: string, fallback?: string) => {
    const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
    return typeof value === 'string' ? value : fallback ?? key;
  }) as unknown as TFunction;

const OLD_FI_REPORT = [
  'Yleiskuva:',
  'Hyvä peli.',
  '',
  'Mikä toimi hyvin:',
  'Prässi.',
  '',
  'Kehityskohteet:',
  'Avaukset.',
].join('\n');

describe('match report headings', () => {
  it('fi: "Missä onnistuttiin" and "Mitä kehitetään", the rest unchanged', () => {
    expect(reportSectionHeadings(tFor(fi)).map((h) => h.label)).toEqual([
      'Yleiskuva',
      'Pelin kulku',
      'Missä onnistuttiin',
      'Mitä kehitetään',
      'Joukkuehenki ja asenne',
      'Erityismaininnat',
      'Seuraava askel',
    ]);
  });

  it('en: "What to improve"', () => {
    expect(reportSectionHeadings(tFor(en)).map((h) => h.label)).toContain('What to improve');
  });
});

describe('day / tournament / league report headings', () => {
  it('fi: the six owner-approved headings, no "Pelin kulku"', () => {
    expect(dayReportSectionHeadings(tFor(fi)).map((h) => h.label)).toEqual([
      'Yleiskuva',
      'Missä onnistuttiin',
      'Mitä kehitetään',
      'Joukkuehenki ja asenne',
      'Erityismaininnat',
      'Seuraava askel',
    ]);
  });

  it('en: Overview / What went well / What to improve / Team spirit and attitude / Special mentions / Next step', () => {
    expect(dayReportSectionHeadings(tFor(en)).map((h) => h.label)).toEqual([
      'Overview',
      'What went well',
      'What to improve',
      'Team spirit and attitude',
      'Special mentions',
      'Next step',
    ]);
  });

  it('uses the match keys, so an AI section maps straight onto a heading', () => {
    expect(DAY_REPORT_SECTIONS.every((s) => (REPORT_SECTIONS as readonly string[]).includes(s))).toBe(true);
    expect(dayReportSectionLabel(tFor(fi), 'worked')).toBe('Missä onnistuttiin');
  });
});

/** @edge-case reports written before the rename */
describe('old saved reports (old headings) stay compatible', () => {
  const players: Player[] = [{ id: 'p1', name: 'Emma Virtanen' } as Player];
  const game = {
    teamName: 'FC Testi',
    opponentName: 'HJK',
    gameDate: '2026-09-05',
    homeScore: 1,
    awayScore: 0,
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 25,
    gameNotes: OLD_FI_REPORT,
    selectedPlayerIds: ['p1'],
    gameEvents: [],
  } as unknown as AppState;

  it('the shared recap carries the old text unchanged', () => {
    const recap = buildGameRecap(game as unknown as Parameters<typeof buildGameRecap>[0], players, (_k, fallback) => fallback);
    expect(recap).toContain(OLD_FI_REPORT);
  });

  it('the AI packet sends the old text unchanged', () => {
    const packet = buildGamePacket({ game, players, language: 'fi', pseudonymize: true }).packet;
    expect(packet.attested.coachReport).toBe(OLD_FI_REPORT);
  });

  it('the tidy job is told the old heading names', () => {
    const packet = buildGamePacket({ game, players, language: 'fi', pseudonymize: true }).packet;
    const text = buildDraftingInstructions(packet, 'tidy');
    expect(text).toContain('"Mikä toimi hyvin" is `worked`');
    expect(text).toContain('"Kehityskohteet"');
    expect(text).toContain("What we're working on");
  });
});
