/**
 * The open "Milloin seuraava peli?" step survives a reload and an app kill
 * (review R3): its answers are kept per account on the device.
 * @critical
 */
import { clearNextGameStepDraft, readNextGameStepDraft, writeNextGameStepDraft } from '../nextGameStepDraft';

const NOW = Date.parse('2026-11-19T10:00:00Z');

beforeEach(() => localStorage.clear());

describe('nextGameStepDraft', () => {
  it('round-trips the answers per account', () => {
    writeNextGameStepDraft('u1', { gameDate: '2026-11-22', opponent: 'HJK' }, NOW);
    expect(readNextGameStepDraft('u1', NOW)).toEqual({ gameDate: '2026-11-22', opponent: 'HJK' });
    expect(readNextGameStepDraft('u2', NOW)).toBeNull();
  });

  it('an open step with nothing picked yet still counts as open', () => {
    writeNextGameStepDraft('u1', { gameDate: '', opponent: '' }, NOW);
    expect(readNextGameStepDraft('u1', NOW)).toEqual({ gameDate: '', opponent: '' });
  });

  it('is gone once cleared', () => {
    writeNextGameStepDraft('u1', { gameDate: '2026-11-22', opponent: '' }, NOW);
    clearNextGameStepDraft('u1');
    expect(readNextGameStepDraft('u1', NOW)).toBeNull();
  });

  it('ignores a step left open for over a week', () => {
    writeNextGameStepDraft('u1', { gameDate: '2026-11-22', opponent: '' }, NOW);
    expect(readNextGameStepDraft('u1', NOW + 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it('drops a malformed date and survives corrupt storage', () => {
    localStorage.setItem('matchops_next_game_step_u1', JSON.stringify({ gameDate: 'soon', opponent: 'X', savedAt: NOW }));
    expect(readNextGameStepDraft('u1', NOW)).toEqual({ gameDate: '', opponent: 'X' });
    localStorage.setItem('matchops_next_game_step_u1', '{not json');
    expect(readNextGameStepDraft('u1', NOW)).toBeNull();
  });
});
