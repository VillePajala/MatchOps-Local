import {
  COMPACT_ENTRY_THRESHOLD,
  chainCardLayout,
  estimateChainCardWidthPx,
  chainCardFit,
  EXPANDED_CHAIN,
  expandedChainHeightPx,
  expandedChainPlacement,
  type ChainFieldItem,
  maxChainRows,
  roomBelowPx,
  roomBesidePx,
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
      expect(chainCardLayout(n)).toEqual({ compact: false, shownEntries: n, hiddenCount: 0, columns: 1 });
    }
  });

  it('goes compact above two changes, showing the next one and counting the rest', () => {
    expect(chainCardLayout(3)).toEqual({ compact: true, shownEntries: 1, hiddenCount: 2, columns: 1 });
    expect(chainCardLayout(5)).toEqual({ compact: true, shownEntries: 1, hiddenCount: 4, columns: 1 });
  });

  /** @edge-case - a short chain in a tight formation must not collide either. */
  it('goes compact for a two-change chain when its three rows do not fit', () => {
    expect(chainCardLayout(2, 3)).toEqual({ compact: false, shownEntries: 2, hiddenCount: 0, columns: 1 });
    expect(chainCardLayout(2, 2)).toEqual({ compact: true, shownEntries: 1, hiddenCount: 1, columns: 1 });
  });

  it('never makes a single change compact - there would be nothing behind the badge', () => {
    expect(chainCardLayout(1, 1)).toEqual({ compact: false, shownEntries: 1, hiddenCount: 0, columns: 1 });
  });
});

describe('chainCardLayout on the match field (compactAbove: null)', () => {
  const MATCH = { compactAbove: null } as const;

  /** @critical - owner: the match field shows the FULL chain, not "+N". */
  it('keeps a long chain full when it fits in one column', () => {
    expect(chainCardLayout(5, 6, MATCH)).toEqual({ compact: false, shownEntries: 5, hiddenCount: 0, columns: 1 });
    expect(chainCardLayout(5, Infinity, MATCH).compact).toBe(false);
  });

  it('runs it in two columns when one column is too tall and the caller says the width is free', () => {
    expect(chainCardLayout(4, 3, { ...MATCH, twoColumnsFit: true })).toEqual({
      compact: false,
      shownEntries: 4,
      hiddenCount: 0,
      columns: 2,
    });
  });

  /** @edge-case - the no-overlap safety: compact only as the last resort. */
  it('falls back to compact when neither one nor two columns fit', () => {
    expect(chainCardLayout(4, 3, MATCH)).toEqual({ compact: true, shownEntries: 1, hiddenCount: 3, columns: 1 });
    expect(chainCardLayout(5, 3, { ...MATCH, twoColumnsFit: true }).compact).toBe(true);
  });
});

describe('roomBesidePx', () => {
  it('measures across to the nearest slot at a similar height', () => {
    const slots = [
      { relX: 0.5, relY: 0.5 },
      { relX: 0.25, relY: 0.52 }, // 10px lower, 100px across
      { relX: 0.45, relY: 0.9 }, // far below: not beside it
    ];
    expect(roomBesidePx(slots, 0, 20, METRICS)).toBe(100);
    expect(roomBesidePx([{ relX: 0.5, relY: 0.5 }], 0, 20, METRICS)).toBe(Infinity);
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

describe('chainCardFit (side by side)', () => {
  const FIELD = { fieldWidthPx: 400, fieldHeightPx: 500, gapPx: 4 };
  /** A one-row card (40px tall, centred on its point) at an 8v8 LM/RM spot. */
  const card = (relX: number, over: Partial<ChainFieldItem> = {}): ChainFieldItem => ({
    relX,
    relY: 0.52,
    abovePx: 20,
    belowPx: 20,
    ...over,
  });
  /** Where a card of width w lands: anchored at relX of its width, then shifted. */
  const span = (c: ChainFieldItem, w: number, shift: number) => {
    const left = c.relX * FIELD.fieldWidthPx - c.relX * w + shift;
    return { left, right: left + w };
  };

  /**
   * Owner report: the LM and RM compact cards overlapped when both were wide.
   * Each keeps to its side of the midpoint, moved toward its touchline.
   * @critical
   */
  it('moves two wide facing cards apart so they never touch, without truncating', () => {
    const items = [card(0.25, { naturalWidthPx: 160 }), card(0.75, { naturalWidthPx: 160 })];
    const lm = chainCardFit(items, 0, FIELD);
    const rm = chainCardFit(items, 1, FIELD);
    // Lanes: 4..198 and 202..396 - 194px each, so 160 fits whole.
    expect(lm.maxWidthPx).toBeCloseTo(194, 5);
    expect(rm.maxWidthPx).toBeCloseTo(194, 5);
    const a = span(items[0], 160, lm.shiftPx);
    const b = span(items[1], 160, rm.shiftPx);
    expect(lm.shiftPx).toBeLessThan(0); // toward its own touchline
    expect(rm.shiftPx).toBeGreaterThan(0);
    expect(b.left - a.right).toBeGreaterThanOrEqual(4);
    expect(a.left).toBeGreaterThanOrEqual(4);
    expect(b.right).toBeLessThanOrEqual(396);
  });

  it('leaves cards that already fit where they are', () => {
    const items = [card(0.25, { naturalWidthPx: 90 }), card(0.75, { naturalWidthPx: 90 })];
    expect(chainCardFit(items, 0, FIELD).shiftPx).toBe(0);
    expect(chainCardFit(items, 1, FIELD).shiftPx).toBe(0);
  });

  it('caps a card wider than its whole lane (its names truncate)', () => {
    // Four midfielders: the inner cards' lanes run midpoint to midpoint.
    const xs = [0.15, 0.38, 0.62, 0.85];
    const items = xs.map((x) => card(x, { naturalWidthPx: 200 }));
    const fits = items.map((_, i) => chainCardFit(items, i, FIELD));
    expect(fits[1].maxWidthPx).toBeCloseTo(((0.38 + 0.62) / 2 - (0.15 + 0.38) / 2) * 400 - 4, 5);
    // Placed at their caps, no two neighbours touch.
    const spans = items.map((c, i) => span(c, fits[i].maxWidthPx, fits[i].shiftPx));
    for (let i = 1; i < spans.length; i++) expect(spans[i].left - spans[i - 1].right).toBeGreaterThanOrEqual(4 - 1e-9);
  });

  it('keeps clear of a plain disc beside it by the disc edge', () => {
    // A back's card beside the goalkeeper's disc that reaches into its row.
    const items = [card(0.25, { naturalWidthPx: 140 }), card(0.5, { fixedWidthPx: 44, relY: 0.56, abovePx: 22, belowPx: 22 })];
    const fit = chainCardFit(items, 0, FIELD);
    expect(fit.maxWidthPx).toBeCloseTo(200 - 22 - 4 - 4, 5);
    expect(span(items[0], 140, fit.shiftPx).right).toBeLessThanOrEqual(200 - 22 - 4 + 1e-9);
    expect(chainCardFit(items, 1, FIELD)).toEqual({ maxWidthPx: Infinity, shiftPx: 0 }); // discs never move
  });

  it('ignores marks in another row and cards in the same column', () => {
    const items = [card(0.25), card(0.75, { relY: 0.82 }), card(0.25, { relY: 0.24 })];
    expect(chainCardFit(items, 0, FIELD)).toEqual({ maxWidthPx: Infinity, shiftPx: 0 });
  });

  it('counts a tall stacked card that hangs down into the row below', () => {
    const items = [card(0.25, { relY: 0.4, abovePx: 13, belowPx: 80 }), card(0.75)];
    expect(chainCardFit(items, 0, FIELD).maxWidthPx).toBeLessThan(Infinity);
  });
});

describe('estimateChainCardWidthPx', () => {
  it('sums a one-row card and takes the widest row of a stacked one', () => {
    const subs = [{ minute: 8, name: 'Kalle' }];
    const row = estimateChainCardWidthPx({ starter: 'Jussi', subs, more: true, stacked: false });
    const noMore = estimateChainCardWidthPx({ starter: 'Jussi', subs, more: false, stacked: false });
    expect(row - noMore).toBe(37);
    const stacked = estimateChainCardWidthPx({
      starter: 'Jo',
      subs: [{ minute: 8, name: 'Kalle' }, { minute: 16, name: 'Alexander' }],
      more: false,
      stacked: true,
    });
    const longest = estimateChainCardWidthPx({
      starter: 'Jo',
      subs: [{ minute: 16, name: 'Alexander' }],
      more: false,
      stacked: true,
    });
    expect(stacked).toBe(longest);
  });
});

describe('expandedChainPlacement', () => {
  /** A 360px phone's planner pitch (328 x 437). */
  const PHONE = { widthPx: 328, heightPx: 437 };
  const m = EXPANDED_CHAIN.marginPx;

  it('is a header plus one fixed row per player', () => {
    expect(expandedChainHeightPx(4)).toBe(EXPANDED_CHAIN.headerPx + 4 * EXPANDED_CHAIN.rowPx + EXPANDED_CHAIN.chromePx);
  });

  it('hangs down from the compact card, centred on it, when there is room', () => {
    const p = expandedChainPlacement({ centerX: 164, top: 120, bottom: 200 }, 230, PHONE);
    expect(p).toEqual({ left: 164 - EXPANDED_CHAIN.widthPx / 2, top: 120, width: EXPANDED_CHAIN.widthPx, direction: 'down' });
  });

  /** @edge-case - a back's chain near the goal line must not run off the field. */
  it('flips up to end at the card bottom near the bottom edge', () => {
    const p = expandedChainPlacement({ centerX: 164, top: 330, bottom: 410 }, 230, PHONE);
    expect(p.direction).toBe('up');
    expect(p.top).toBe(410 - 230);
    expect(p.top + 230).toBeLessThanOrEqual(PHONE.heightPx - m);
  });

  /** @edge-case - a winger's chain shifts in from the side line. */
  it('shifts sideways to stay inside the side lines', () => {
    const left = expandedChainPlacement({ centerX: 20, top: 50, bottom: 120 }, 200, PHONE);
    expect(left.left).toBe(m);
    const right = expandedChainPlacement({ centerX: 320, top: 50, bottom: 120 }, 200, PHONE);
    expect(right.left + right.width).toBe(PHONE.widthPx - m);
  });

  it('narrows to the field on a very narrow field', () => {
    const p = expandedChainPlacement({ centerX: 100, top: 10, bottom: 60 }, 150, { widthPx: 200, heightPx: 400 });
    expect(p.width).toBe(200 - 2 * m);
    expect(p.left).toBe(m);
  });

  /** @edge-case - fits the field but neither down nor up from a mid-field card. */
  it('pins to the field when neither direction from the card fits', () => {
    const p = expandedChainPlacement({ centerX: 164, top: 200, bottom: 250 }, 400, PHONE);
    expect(p.top).toBe(PHONE.heightPx - m - 400);
    expect(p.top).toBeGreaterThanOrEqual(m);
    expect(p.maxHeight).toBeUndefined();
  });

  it('scrolls inside a card taller than the whole field', () => {
    const p = expandedChainPlacement({ centerX: 164, top: 200, bottom: 250 }, 600, PHONE);
    expect(p.top).toBe(m);
    expect(p.maxHeight).toBe(PHONE.heightPx - 2 * m);
  });
});
