/**
 * How much of a position's substitution chain fits on the field.
 *
 * A chain card stacks the starter and every incoming player, so a long chain
 * grows down the pitch - and in a centre column, where positions sit as little
 * as 0.14 of the field apart, it ran over the next position's card and both
 * became unreadable (owner report, planner field view).
 *
 * Two rules decide the card, shared by every place a chain is drawn (the
 * planner's field view and the match field's "Substitutions and minutes" view):
 *
 *  1. A chain of MORE THAN TWO changes is always compact: the starter, the next
 *     incoming player with their minute, and a "+N" badge for the rest. The
 *     full chain opens in a sheet on demand.
 *  2. A card never grows past the room between its own slot and the next slot
 *     below it. If even a short chain does not fit (a tight formation), it goes
 *     compact too.
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
}

/**
 * Decide a chain card's form.
 *
 * @param entryCount   planned changes at this position
 * @param rowsAvailable how many rows (header/starter row included) fit before
 *                     the card would reach the next slot below. Infinity when
 *                     the caller cannot measure.
 */
export function chainCardLayout(entryCount: number, rowsAvailable = Infinity): ChainCardLayout {
  const fullRows = 1 + entryCount;
  // A single change has nothing to hide - compact and full are the same card.
  const compact =
    entryCount > COMPACT_ENTRY_THRESHOLD || (entryCount > 1 && fullRows > rowsAvailable);
  if (!compact) return { compact: false, shownEntries: entryCount, hiddenCount: 0 };
  return { compact: true, shownEntries: 1, hiddenCount: entryCount - 1 };
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
