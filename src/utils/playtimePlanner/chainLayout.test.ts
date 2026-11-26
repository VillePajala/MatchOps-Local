import {
  COMPACT_ENTRY_THRESHOLD,
  chainCardLayout,
  maxChainRows,
  roomBelowPx,
  type ChainCardMetrics,
} from './chainLayout';

/** A 400x500 field with simple round numbers: 25px rows, no chrome. */
const METRICS: ChainCardMetrics = {
  fieldWidthPx: 400,
  fieldHeightPx: 500,
  horizontalReachPx: 100,
  anchorAbovePx: 10,
  neighbourAbovePx: 10,
  gapPx: 0,
  rowPx: 25,
  chromePx: 0,
};

describe('chainCardLayout', () => {
  /**
   * The owner's rule: a chain longer than two changes never stacks on the
   * field - starter, the next change, and a "+N" for the rest.
   * @critical
   */
  it('keeps chains of up to two changes full when there is room', () => {
    expect(COMPACT_ENTRY_THRESHOLD).toBe(2);
    for (const n of [0, 1, 2]) {
      expect(chainCardLayout(n)).toEqual({ compact: false, shownEntries: n, hiddenCount: 0 });
    }
  });

  it('goes compact above two changes, showing the next one and counting the rest', () => {
    expect(chainCardLayout(3)).toEqual({ compact: true, shownEntries: 1, hiddenCount: 2 });
    expect(chainCardLayout(5)).toEqual({ compact: true, shownEntries: 1, hiddenCount: 4 });
  });

  /** @edge-case - a short chain in a tight formation must not collide either. */
  it('goes compact for a two-change chain when its three rows do not fit', () => {
    expect(chainCardLayout(2, 3)).toEqual({ compact: false, shownEntries: 2, hiddenCount: 0 });
    expect(chainCardLayout(2, 2)).toEqual({ compact: true, shownEntries: 1, hiddenCount: 1 });
  });

  it('never makes a single change compact - there would be nothing behind the badge', () => {
    expect(chainCardLayout(1, 1)).toEqual({ compact: false, shownEntries: 1, hiddenCount: 0 });
  });
});

describe('roomBelowPx', () => {
  it('measures to the nearest slot below in the same column', () => {
    const slots = [
      { relX: 0.5, relY: 0.2 },
      { relX: 0.5, relY: 0.6 },
      { relX: 0.52, relY: 0.4 }, // within reach (8px across): this is the nearest
    ];
    expect(roomBelowPx(slots, 0, METRICS)).toEqual({ px: 100, hasNeighbour: true });
  });

  it('ignores slots above and slots out to the side', () => {
    const slots = [
      { relX: 0.5, relY: 0.5 },
      { relX: 0.5, relY: 0.1 }, // above
      { relX: 0.8, relY: 0.6 }, // 120px across - another column
    ];
    expect(roomBelowPx(slots, 0, METRICS)).toEqual({ px: 250, hasNeighbour: false });
  });

  it('falls back to the bottom edge when nothing is below', () => {
    const room = roomBelowPx([{ relX: 0.5, relY: 0.9 }], 0, METRICS);
    expect(room.hasNeighbour).toBe(false);
    expect(room.px).toBeCloseTo(50);
  });

  it('is zero for an index that does not exist', () => {
    expect(roomBelowPx([], 3, METRICS)).toEqual({ px: 0, hasNeighbour: false });
  });
});

describe('maxChainRows', () => {
  /**
   * The owner's report: ST at 0.24 and CAM at 0.38 in the 8v8 2-1-2-1-1. A
   * card at ST may not reach the CAM card.
   * @critical
   */
  it('caps a card at the room between its slot and the mark of the slot below', () => {
    const slots = [
      { relX: 0.5, relY: 0.24 }, // ST
      { relX: 0.5, relY: 0.38 }, // CAM, 70px below
    ];
    // 70px room + 10 above own slot - 10 the CAM mark reaches up = 70px -> 2 rows.
    expect(maxChainRows(slots, 0, METRICS)).toBe(2);
    // ...so a two-change ST chain (3 rows) goes compact instead of colliding.
    expect(chainCardLayout(2, maxChainRows(slots, 0, METRICS)).compact).toBe(true);
  });

  it('subtracts the gap and the card chrome', () => {
    const slots = [
      { relX: 0.5, relY: 0.2 },
      { relX: 0.5, relY: 0.4 }, // 100px below
    ];
    expect(maxChainRows(slots, 0, METRICS)).toBe(4);
    expect(maxChainRows(slots, 0, { ...METRICS, gapPx: 5, chromePx: 6 })).toBe(3);
  });

  it('does not keep a neighbour gap at the bottom edge', () => {
    // 50px to the edge + 10 above = 60px -> 2 rows; no neighbour mark to clear.
    expect(maxChainRows([{ relX: 0.5, relY: 0.9 }], 0, { ...METRICS, gapPx: 20 })).toBe(2);
  });

  it('always allows the starter row, however tight', () => {
    const slots = [
      { relX: 0.5, relY: 0.5 },
      { relX: 0.5, relY: 0.505 },
    ];
    expect(maxChainRows(slots, 0, METRICS)).toBe(1);
  });
});
