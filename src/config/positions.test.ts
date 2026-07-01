import {
  POSITIONS,
  POSITION_IDS,
  POSITION_ABBREV_FALLBACK,
  POSITION_LABEL_FALLBACK,
  POSITION_FORMATS,
  positionsForSport,
  positionsForFormat,
  inferFormat,
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

  it('scopes the palette by format; 11v11 is the full soccer set', () => {
    const five = positionsForFormat('5v5').map(p => p.id);
    const eleven = positionsForFormat('11v11').map(p => p.id);
    expect(five.length).toBeLessThan(eleven.length);
    expect(five).not.toContain('rwb'); // wing-back is 11v11 only
    expect(five).toContain('gk');
    // 11v11 covers every soccer position.
    const soccerIds = positionsForSport('soccer').map(p => p.id);
    expect([...eleven].sort()).toEqual([...soccerIds].sort());
    // every format references only real position ids
    Object.values(POSITION_FORMATS).flat().forEach(id => expect(POSITION_IDS).toContain(id));
  });

  it('infers a default format (futsal by type, else by squad size), overridable', () => {
    expect(inferFormat('futsal', 20)).toBe('futsal');
    expect(inferFormat('soccer', 7)).toBe('5v5');
    expect(inferFormat('soccer', 10)).toBe('7v7');
    expect(inferFormat('soccer', 13)).toBe('9v9');
    expect(inferFormat('soccer', 16)).toBe('11v11');
    expect(inferFormat(undefined, 16)).toBe('11v11'); // legacy = soccer
  });
});
