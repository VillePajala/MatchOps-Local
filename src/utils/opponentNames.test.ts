/**
 * @critical - this module decides whether two team names are the same team.
 * A false merge destroys real data: two squads' games collapse into one
 * opponent and neither coach can tell afterwards. The colour case below is
 * the whole reason fuzzy matching was rejected, so it is tested first.
 */
import {
  normalizeOpponentName,
  isSameOpponent,
  findExistingSpelling,
  addOpponentToList,
  groupOpponentVariants,
} from './opponentNames';

describe('normalizeOpponentName', () => {
  it('folds the writing-style differences a coach actually produces', () => {
    // Case, separators and stray whitespace - the owner's own examples.
    const key = 'ips sininen';
    expect(normalizeOpponentName('IPS/Sininen')).toBe(key);
    expect(normalizeOpponentName('IPS Sininen')).toBe(key);
    expect(normalizeOpponentName('IPS - Sininen')).toBe(key);
    expect(normalizeOpponentName('  ips   sininen ')).toBe(key);
    expect(normalizeOpponentName('IPS–Sininen')).toBe(key);
  });

  it('folds case alone', () => {
    expect(normalizeOpponentName('IPS')).toBe('ips');
    expect(normalizeOpponentName('Ips')).toBe('ips');
    expect(normalizeOpponentName('ips')).toBe('ips');
  });

  it('is empty for nothing, so a blank name can never match another blank', () => {
    expect(normalizeOpponentName('')).toBe('');
    expect(normalizeOpponentName('   ')).toBe('');
    expect(normalizeOpponentName(null)).toBe('');
    expect(normalizeOpponentName(undefined)).toBe('');
    expect(isSameOpponent('', '')).toBe(false);
    expect(isSameOpponent('  ', null)).toBe(false);
  });

  /**
   * @critical - the reason this module normalises instead of scoring
   * similarity. These two differ by one word out of two and every edit
   * distance rates them as nearly identical, but they are different teams.
   */
  it('NEVER folds two teams that differ by their colour', () => {
    expect(isSameOpponent('IPS/Punainen', 'IPS/Sininen')).toBe(false);
    expect(isSameOpponent('PePo Keltainen', 'PePo Sininen')).toBe(false);
    // Across writing styles too - the separator must not become the story.
    expect(isSameOpponent('IPS Punainen', 'IPS/Sininen')).toBe(false);
  });

  /**
   * Genuinely ambiguous: shorthand, or the club versus one of its teams.
   * Not this module's call, so it must stay unmerged.
   */
  it('does not fold a bare club name into one of its teams', () => {
    expect(isSameOpponent('IPS', 'IPS Punainen')).toBe(false);
  });

  /**
   * @edge-case - stripping diacritics would fold genuinely different Finnish
   * words. Coaches type on Finnish keyboards; this is the safer default.
   */
  it('keeps ä and ö distinct from a and o', () => {
    expect(isSameOpponent('Hämeenlinna', 'Hameenlinna')).toBe(false);
    expect(normalizeOpponentName('HÄMEENLINNA')).toBe('hämeenlinna');
  });

  it('does not fold a real typo, and is not meant to', () => {
    // A transposition is a job for a human, not for a threshold that would
    // sit uncomfortably close to the distance between two colours.
    expect(isSameOpponent('IPS Punainen', 'IPS Punaienn')).toBe(false);
  });
});

describe('findExistingSpelling / addOpponentToList', () => {
  const pool = ['IPS', 'PePo Keltainen'];

  it('offers the spelling already in use rather than the one just typed', () => {
    expect(findExistingSpelling('ips', pool)).toBe('IPS');
    expect(findExistingSpelling('pepo  keltainen', pool)).toBe('PePo Keltainen');
  });

  it('says nothing for a genuinely new name', () => {
    expect(findExistingSpelling('KuPS', pool)).toBeNull();
    expect(findExistingSpelling('   ', pool)).toBeNull();
  });

  /**
   * @critical - the entry-time half of the feature. Adding a variant must be
   * a no-op, or the list itself becomes the mess the sweep tool has to clean.
   */
  it('refuses to add a spelling of a name already in the list', () => {
    const same = addOpponentToList(pool, 'Ips');
    expect(same).toBe(pool); // by reference: nothing happened
    expect(addOpponentToList(pool, '  IPS  ')).toBe(pool);
  });

  it('adds a new name, trimmed, and keeps the coach’s own spelling', () => {
    expect(addOpponentToList(pool, '  KuPS ')).toEqual(['IPS', 'PePo Keltainen', 'KuPS']);
    // A different colour is a different team and must be addable.
    expect(addOpponentToList(pool, 'PePo Sininen')).toHaveLength(3);
  });

  it('ignores an empty name', () => {
    expect(addOpponentToList(pool, '   ')).toBe(pool);
  });
});

describe('groupOpponentVariants', () => {
  it('groups spellings of one name and leaves settled names alone', () => {
    const groups = groupOpponentVariants(['IPS', 'Ips', 'IPS', 'KuPS', 'KuPS']);
    // KuPS is spelled one way throughout - not a conflict, however often it appears.
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('ips');
    expect(groups[0].variants).toEqual(['IPS', 'Ips']);
    expect(groups[0].counts).toEqual({ IPS: 2, Ips: 1 });
    expect(groups[0].total).toBe(3);
  });

  /**
   * The suggestion is the most-used spelling, because the coach's dominant
   * habit is the best available guess. It is a default to accept or overtype,
   * never a claim about what is official.
   */
  it('suggests the most-used spelling', () => {
    const groups = groupOpponentVariants(['Ips', 'IPS', 'IPS', 'IPS']);
    expect(groups[0].suggested).toBe('IPS');
  });

  it('breaks a tie on first appearance, so the suggestion is stable', () => {
    const a = groupOpponentVariants(['Ips', 'IPS']);
    const b = groupOpponentVariants(['Ips', 'IPS']);
    expect(a[0].suggested).toBe('Ips');
    expect(b[0].suggested).toBe(a[0].suggested);
  });

  /**
   * @critical - if this ever groups, the sweep tool would offer to merge two
   * real teams and a coach might accept it.
   */
  it('never groups two teams that differ by colour', () => {
    const groups = groupOpponentVariants([
      'IPS/Punainen', 'IPS Punainen', 'IPS/Sininen', 'IPS Sininen',
    ]);
    expect(groups).toHaveLength(2);
    const keys = groups.map((g) => g.key).sort();
    expect(keys).toEqual(['ips punainen', 'ips sininen']);
  });

  it('puts the group touching the most games first', () => {
    const groups = groupOpponentVariants([
      'KuPS', 'kups',
      'IPS', 'Ips', 'IPS', 'ips', 'IPS',
    ]);
    expect(groups[0].key).toBe('ips');
    expect(groups[0].total).toBe(5);
    expect(groups[1].key).toBe('kups');
  });

  it('ignores blanks rather than grouping them together', () => {
    expect(groupOpponentVariants(['', '  ', 'IPS'])).toEqual([]);
  });
});
