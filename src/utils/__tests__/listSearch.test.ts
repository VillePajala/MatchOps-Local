import { foldForSearch, matchesSearch, playerSearchFields } from '../listSearch';

/** Review 7.L6: one search behaviour for every list. */
describe('listSearch', () => {
  it('folds case and accents', () => {
    expect(foldForSearch('  Äino  MÄKI ')).toBe('aino maki');
    expect(foldForSearch(7)).toBe('7');
    expect(foldForSearch(undefined)).toBe('');
  });

  it('ignores accents and case both ways', () => {
    expect(matchesSearch('maki', ['Leo Mäki'])).toBe(true);
    expect(matchesSearch('MÄKI', ['leo maki'])).toBe(true);
  });

  it('needs every word, in any order, partial words allowed', () => {
    expect(matchesSearch('virta aino', ['Aino Virta'])).toBe(true);
    expect(matchesSearch('vir', ['Aino Virta'])).toBe(true);
    expect(matchesSearch('aino leo', ['Aino Virta'])).toBe(false);
  });

  it('matches across fields', () => {
    expect(matchesSearch('aino 7', playerSearchFields({ name: 'Aino Virta', jerseyNumber: '7' }))).toBe(true);
    expect(matchesSearch('ainska', playerSearchFields({ name: 'Aino Virta', nickname: 'Ainska' }))).toBe(true);
  });

  it('treats slashes and dashes as spaces on both sides, but keeps dots', () => {
    expect(matchesSearch('ips/sininen', ['IPS Sininen'])).toBe(true);
    expect(matchesSearch('ips sininen', ['IPS-Sininen'])).toBe(true);
    expect(matchesSearch('17.9.', ['17.9.2026'])).toBe(true);
  });

  it('an empty query matches everything', () => {
    expect(matchesSearch('   ', ['anything'])).toBe(true);
  });
});
