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
  ['dictation.transcribe', 'Transcribe 1 clip (about $0.01)', 'Litteroi 1 klippi (noin $0.01)'],
];

describe('count messages use the singular for one', () => {
  afterEach(async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it.each(cases)('%s', async (key, en, fi) => {
    expect(i18n.t(key, { count: 1, cost: '0.01' })).toBe(en);
    expect(i18n.t(key, { count: 2, cost: '0.01' })).not.toBe(en.replace('1', '2'));
    await act(async () => { await i18n.changeLanguage('fi'); });
    expect(i18n.t(key, { count: 1, cost: '0.01' })).toBe(fi);
  });
});
