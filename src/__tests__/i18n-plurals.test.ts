/**
 * Review 8.7: count messages printed "1 voice notes" / "1 äänimuistiinpanoa",
 * "1 changes waiting", "1 players"... Each is now a _one/_other pair.
 */
import { act } from '@testing-library/react';
import i18n from '@/i18n';

const cases: Array<[string, string, string]> = [
  ['gameStatsModal.wrapUpVoiceNotes', '1 voice note to review', '1 äänimuistiinpano käsittelemättä'],
  ['syncStatus.pendingTitle', '1 change waiting to sync', '1 muutos odottaa synkronointia'],
  ['teamManager.playersCount', '1 player', '1 pelaaja'],
  ['dictation.clipCount', '1 voice note', '1 äänimuistiinpano'],
  ['dictation.transcribe', 'Transcribe 1 clip (about $0.01)', 'Litteroi 1 klippi (noin $0.01)'],
  // Demo prep 2026-11-25: the planner said "1 peliä" for a one-game plan.
  ['playtimePlanner.overview.formatSummary', '1 game · 2×10 min', '1 peli · 2×10 min'],
  ['playtimePlanner.manager.games', '1 game', '1 peli'],
  ['playtimePlanner.manager.players', '1 player', '1 pelaaja'],
  ['playtimePlanner.overview.reapplyDoneNoRoster',
    'Updated 1 game; 1 had no players in their roster and were left unchanged.',
    'Päivitettiin 1 peli; 1 pelissä ei ollut pelaajia listalla, joten ne jätettiin ennalleen.'],
];

const vars = { cost: '0.01', periods: 2, minutes: 10, skipped: 1 };

describe('count messages use the singular for one', () => {
  afterEach(async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it.each(cases)('%s', async (key, en, fi) => {
    expect(i18n.t(key, { ...vars, count: 1 })).toBe(en);
    expect(i18n.t(key, { ...vars, count: 2 })).not.toBe(en.replace('1', '2'));
    await act(async () => { await i18n.changeLanguage('fi'); });
    expect(i18n.t(key, { ...vars, count: 1 })).toBe(fi);
  });
});

/** The planner's plural forms in Finnish: "1 peli", "2 peliä". */
it('writes the planner game count as 2 peliä in Finnish', async () => {
  await act(async () => { await i18n.changeLanguage('fi'); });
  expect(i18n.t('playtimePlanner.manager.games', { count: 2 })).toBe('2 peliä');
  expect(i18n.t('playtimePlanner.overview.formatSummary', { ...vars, count: 3 })).toBe('3 peliä · 2×10 min');
  await act(async () => { await i18n.changeLanguage('en'); });
});
