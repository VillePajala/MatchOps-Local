import {
  POSITIONS,
  POSITION_IDS,
  POSITION_ABBREV_FALLBACK,
  POSITION_LABEL_FALLBACK,
  positionsForSport,
  orderPositionIds,
} from './positions';

describe('positions config', () => {
  it('has a fallback abbrev and label for every position id', () => {
    POSITION_IDS.forEach(id => {
      expect(POSITION_ABBREV_FALLBACK[id]).toBeTruthy();
      expect(POSITION_LABEL_FALLBACK[id]).toBeTruthy();
    });
  });

  it('filters positions by sport (legacy/undefined = soccer)', () => {
    const soccer = positionsForSport('soccer').map(p => p.id);
    const futsal = positionsForSport('futsal').map(p => p.id);
    const legacy = positionsForSport(undefined).map(p => p.id);

    expect(soccer).toContain('cb');
    expect(soccer).not.toContain('fixo');
    expect(futsal).toContain('fixo');
    expect(futsal).toContain('gk'); // GK is shared
    expect(futsal).not.toContain('cb');
    expect(legacy).toEqual(soccer); // undefined treated as soccer
  });

  it('keeps every position within the declared sport list', () => {
    POSITIONS.forEach(p => {
      expect(p.sports.length).toBeGreaterThan(0);
    });
  });

  it('orders position ids back-to-front (GK first) regardless of input order', () => {
    // st, cb, rb, gk -> gk, rb, cb, st (POSITIONS declaration order)
    expect(orderPositionIds(['st', 'cb', 'rb', 'gk'])).toEqual(['gk', 'rb', 'cb', 'st']);
  });
});
