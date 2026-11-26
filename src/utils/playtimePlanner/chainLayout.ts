/**
 * How much of a position's substitution chain fits on the field.
 *
 * A chain card stacks the starter and every incoming player, so a long chain
 * grows down the pitch - and in a centre column, where positions sit as little
 * as 0.14 of the field apart, it ran over the next position's card and both
 * became unreadable (owner report, planner field view).
 *
 * The rules, shared by every place a chain is drawn:
 *
 *  1. PLANNER (the default): a chain of MORE THAN TWO changes is always
 *     compact: the starter, the next incoming player with their minute, and a
 *     "+N" badge for the rest. The full chain opens in a sheet on demand.
 *  2. MATCH FIELD ("Substitutions and minutes" view, `compactAbove: null`):
 *     the field has the room, so the FULL chain is drawn - one column, or two
 *     columns when one column would not fit and the caller says there is room
 *     beside the card. Compact is only the last resort there.
 *  3. Everywhere: a card never grows past the room between its own slot and
 *     the next slot below it. If even a short chain does not fit (a tight
 *     formation), it goes compact.
 *
 * Pure: no DOM, no canvas. Callers pass the field size and their own card
 * metrics, so the canvas and the DOM view apply the same rule to their own
 * pixels.
 *
 * @module chainLayout
 * @category Utils
 */

/** Chains with more changes than this are always shown compact. */
export const COMPACT_ENTRY_THRESHOLD = 2;

/** What one chain card shows. */
export interface ChainCardLayout {
  compact: boolean;
  /** Incoming players drawn on the card itself, earliest first. */
  shownEntries: number;
  /** Incoming players behind the "+N" badge. 0 when there is no badge. */
  hiddenCount: number;
  /** Columns the shown entries run in. Always 1 unless `twoColumnsFit`. */
  columns: 1 | 2;
}

export interface ChainCardLayoutOptions {
  /**
   * Chains with more changes than this are compact whatever the room.
   * `null` = never compact for length alone (the match field). Defaults to
   * COMPACT_ENTRY_THRESHOLD (the planner).
   */
  compactAbove?: number | null;
  /**
   * The caller has checked that a two-column card stays clear of the cards
   * beside it. Only then may a chain that is too tall for one column run in
   * two instead of going compact.
   */
  twoColumnsFit?: boolean;
}

/**
 * Decide a chain card's form.
 *
 * @param entryCount   planned changes at this position
 * @param rowsAvailable how many rows (header/starter row included) fit before
 *                     the card would reach the next slot below. Infinity when
 *                     the caller cannot measure.
 */
export function chainCardLayout(
  entryCount: number,
  rowsAvailable = Infinity,
  options: ChainCardLayoutOptions = {},
): ChainCardLayout {
  const compactAbove = options.compactAbove === undefined ? COMPACT_ENTRY_THRESHOLD : options.compactAbove;
  const full: ChainCardLayout = { compact: false, shownEntries: entryCount, hiddenCount: 0, columns: 1 };
  const compactCard: ChainCardLayout = { compact: true, shownEntries: 1, hiddenCount: entryCount - 1, columns: 1 };
  // A single change has nothing to hide - compact and full are the same card.
  if (entryCount <= 1) return full;
  if (compactAbove !== null && entryCount > compactAbove) return compactCard;
  if (1 + entryCount <= rowsAvailable) return full;
  if (options.twoColumnsFit && 1 + Math.ceil(entryCount / 2) <= rowsAvailable) {
    return { ...full, columns: 2 };
  }
  return compactCard;
}

/** A slot's position on the field, 0..1 in both axes (relY grows downward). */
export interface ChainSlotPoint {
  relX: number;
  relY: number;
}

/** One view's card geometry, in CSS pixels. */
export interface ChainCardMetrics {
  fieldWidthPx: number;
  fieldHeightPx: number;
  /**
   * Two slots whose centres are closer than this horizontally are treated as
   * one column - a card at one would land on the other's card.
   */
  horizontalReachPx: number;
  /** How far a card reaches ABOVE its own slot point (the card is top-anchored). */
  anchorAbovePx: number;
  /** How far the mark at the slot below reaches above ITS point. */
  neighbourAbovePx: number;
  /** Clear space kept between two cards. */
  gapPx: number;
  /** Height of one row (starter or incoming player). */
  rowPx: number;
  /** Fixed vertical chrome of the card (padding, borders). */
  chromePx: number;
}

/**
 * Vertical room, in pixels, from a slot's point to the nearest slot below it
 * in the same column - or to the bottom edge of the field when nothing is
 * below.
 */
export function roomBelowPx(
  slots: readonly ChainSlotPoint[],
  index: number,
  metrics: Pick<ChainCardMetrics, 'fieldWidthPx' | 'fieldHeightPx' | 'horizontalReachPx'>,
): { px: number; hasNeighbour: boolean } {
  const self = slots[index];
  if (!self) return { px: 0, hasNeighbour: false };
  let nearest = Infinity;
  slots.forEach((other, i) => {
    if (i === index) return;
    if (other.relY <= self.relY) return;
    if (Math.abs(other.relX - self.relX) * metrics.fieldWidthPx >= metrics.horizontalReachPx) return;
    nearest = Math.min(nearest, other.relY - self.relY);
  });
  if (nearest === Infinity) {
    return { px: Math.max(0, (1 - self.relY) * metrics.fieldHeightPx), hasNeighbour: false };
  }
  return { px: nearest * metrics.fieldHeightPx, hasNeighbour: true };
}

/**
 * Horizontal room, in pixels, from a slot's point to the nearest OTHER slot
 * whose point lies within `bandPx` above or below it - the cards that would
 * sit beside a card `bandPx` tall. Infinity when nothing is beside it.
 */
export function roomBesidePx(
  slots: readonly ChainSlotPoint[],
  index: number,
  bandPx: number,
  metrics: Pick<ChainCardMetrics, 'fieldWidthPx' | 'fieldHeightPx'>,
): number {
  const self = slots[index];
  if (!self) return 0;
  let nearest = Infinity;
  slots.forEach((other, i) => {
    if (i === index) return;
    if (Math.abs(other.relY - self.relY) * metrics.fieldHeightPx > bandPx) return;
    nearest = Math.min(nearest, Math.abs(other.relX - self.relX) * metrics.fieldWidthPx);
  });
  return nearest;
}

/**
 * How many rows a card at `slots[index]` may have without reaching the mark
 * of the next slot below. Never less than 1 - the starter always shows.
 */
export function maxChainRows(
  slots: readonly ChainSlotPoint[],
  index: number,
  metrics: ChainCardMetrics,
): number {
  const room = roomBelowPx(slots, index, metrics);
  // At the field's bottom edge there is no neighbour mark to keep clear of.
  const neighbourAbove = room.hasNeighbour ? metrics.neighbourAbovePx + metrics.gapPx : 0;
  const maxHeight = room.px + metrics.anchorAbovePx - neighbourAbove;
  const rows = Math.floor((maxHeight - metrics.chromePx) / metrics.rowPx);
  return Math.max(1, rows);
}

/**
 * One mark on the field for the side-by-side check: a chain card (pill) or a
 * plain disc. Distances are CSS pixels from the slot point.
 */
export interface ChainFieldItem extends ChainSlotPoint {
  /** How far the item reaches above its slot point. */
  abovePx: number;
  /** How far the item reaches below its slot point. */
  belowPx: number;
  /**
   * A disc: a fixed width centred on its point. Omitted = a chain card, which
   * sits at `relX` of its OWN width (an edge slot's card grows toward the
   * centre) and is what `chainCardFit` sizes and moves.
   */
  fixedWidthPx?: number;
  /**
   * A card's estimated natural width (see estimateChainCardWidthPx), used to
   * decide how far to move it. Omitted = 0 (never moved).
   */
  naturalWidthPx?: number;
}

/** How a chain card fits beside the marks at its height. */
export interface ChainCardFit {
  /** The widest the card may be; Infinity when nothing limits it. */
  maxWidthPx: number;
  /** Move the card this far sideways (negative = left) to stay in its lane. */
  shiftPx: number;
}

/** Clear space kept from the field's side lines. */
const FIELD_EDGE_MARGIN_PX = 4;

/**
 * Keep a chain card clear of the marks beside it - those whose vertical extent
 * overlaps the card's (the LM and RM cards of one midfield row, a back's card
 * and the goalkeeper's disc).
 *
 * The card gets a lane: up to the midpoint between its slot and a card beside
 * it (both cards use the same midpoint, so two lanes never overlap), up to a
 * disc's edge, and inside the field's side lines - each less half the gap. A
 * card that would cross its lane's edge is first MOVED back into the lane
 * (there is usually room toward the touchline), and only a card wider than
 * the whole lane is capped, its names truncating.
 */
export function chainCardFit(
  items: readonly ChainFieldItem[],
  index: number,
  metrics: Pick<ChainCardMetrics, 'fieldWidthPx' | 'fieldHeightPx' | 'gapPx'>,
): ChainCardFit {
  const self = items[index];
  if (!self || self.fixedWidthPx !== undefined) return { maxWidthPx: Infinity, shiftPx: 0 };
  const { fieldWidthPx: w, fieldHeightPx: h, gapPx: gap } = metrics;
  const x = self.relX * w;
  const selfTop = self.relY * h - self.abovePx;
  const selfBottom = self.relY * h + self.belowPx;
  let laneLeft = FIELD_EDGE_MARGIN_PX;
  let laneRight = w - FIELD_EDGE_MARGIN_PX;
  let limited = false;
  items.forEach((other, i) => {
    if (i === index) return;
    const otherTop = other.relY * h - other.abovePx;
    const otherBottom = other.relY * h + other.belowPx;
    if (otherTop >= selfBottom || selfTop >= otherBottom) return;
    const ox = other.relX * w;
    if (ox === x) return; // same column: the vertical rule (maxChainRows) applies
    const edge =
      other.fixedWidthPx !== undefined
        ? ox > x
          ? ox - other.fixedWidthPx / 2 - gap
          : ox + other.fixedWidthPx / 2 + gap
        : ox > x
          ? (x + ox) / 2 - gap / 2
          : (x + ox) / 2 + gap / 2;
    limited = true;
    if (ox > x) laneRight = Math.min(laneRight, edge);
    else laneLeft = Math.max(laneLeft, edge);
  });
  if (!limited) return { maxWidthPx: Infinity, shiftPx: 0 };
  const maxWidthPx = Math.max(0, laneRight - laneLeft);
  const width = Math.min(self.naturalWidthPx ?? 0, maxWidthPx);
  const left = x - self.relX * width;
  let shiftPx = 0;
  if (left + width > laneRight) shiftPx = laneRight - (left + width);
  if (left + shiftPx < laneLeft) shiftPx = laneLeft - left;
  return { maxWidthPx, shiftPx };
}

/** Glyph metrics of the planner's chain card text (10px bold names, 12px minutes). */
const CARD_TEXT = { namePxPerChar: 6.5, minuteDigitPx: 7.5, minuteChromePx: 14, segmentPadPx: 16, morePx: 37, borderPx: 4 };

/**
 * A chain card's natural width, estimated from its text (no DOM needed, so
 * every card's cap can be worked out in one pass). Errs slightly wide.
 *
 * @param stacked  rows (starter on top, each change below) instead of one row
 */
export function estimateChainCardWidthPx(card: {
  starter: string;
  subs: readonly { minute: number; name: string }[];
  more: boolean;
  stacked: boolean;
}): number {
  const c = CARD_TEXT;
  const name = (s: string) => s.length * c.namePxPerChar;
  const minute = (m: number) => String(m).length * c.minuteDigitPx + c.minuteChromePx;
  const starter = c.segmentPadPx + name(card.starter);
  if (card.stacked) {
    const rows = card.subs.map((s) => c.segmentPadPx + minute(s.minute) + 4 + name(s.name));
    return Math.max(starter, ...rows) + c.borderPx;
  }
  const subs = card.subs.reduce((sum, s) => sum + 1 + c.segmentPadPx + Math.max(minute(s.minute), name(s.name)), 0);
  return starter + subs + (card.more ? c.morePx : 0) + c.borderPx;
}
