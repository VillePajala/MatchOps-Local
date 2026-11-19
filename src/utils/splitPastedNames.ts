/**
 * Turn a pasted player list into separate names (onboarding wizard, D8).
 *
 * Coaches paste the squad from WhatsApp, a club system or a note:
 *   "1. Onni\n2. Toivo", "7 Onni", "- Onni", "Onni, Toivo", "Onni; Toivo".
 *
 * Rules:
 * - With line breaks, split on line breaks ONLY - so "Meikäläinen, Matti" on
 *   one line stays one name.
 * - Without line breaks, split on ";" if present, else on ",".
 * - A leading number ("1.", "7)", "12", "#12") or bullet ("-", "*", "•") is
 *   stripped. It is a list position, not a shirt number (D8): numbers can be
 *   added later.
 * - Trim, drop empty entries, cap each name at `maxNameLength` characters and
 *   the list at `maxNames` entries.
 *
 * Pure; the wizard decides what to do with the result.
 */

export interface SplitPastedNamesOptions {
  /** Longest name kept (characters); longer names are cut. */
  maxNameLength?: number;
  /** Most names returned. */
  maxNames?: number;
}

/** Defaults sized to what the store accepts and a real youth squad. */
export const PASTE_MAX_NAMES = 60;

const LEADING_MARKER = /^\s*(?:#?\s*\d+\s*[.):-]?|[-*•–])\s*/u;

/** Remove a leading list number or bullet; "1. Onni" / "#12 Onni" -> "Onni". */
export function stripListMarker(line: string): string {
  // A line that is ONLY a number ("7") is not a name - strip it to empty.
  return line.replace(LEADING_MARKER, '').trim();
}

/** True when the text looks like more than one name (worth splitting on input). */
export function looksLikeNameList(text: string): boolean {
  return /[\r\n;,]/.test(text);
}

export function splitPastedNames(text: string, options: SplitPastedNamesOptions = {}): string[] {
  const maxNameLength = options.maxNameLength ?? 100;
  const maxNames = options.maxNames ?? PASTE_MAX_NAMES;
  if (!text) return [];

  const normalized = text.replace(/\r\n?/g, '\n');
  let parts: string[];
  if (normalized.includes('\n')) {
    parts = normalized.split('\n');
  } else if (normalized.includes(';')) {
    parts = normalized.split(';');
  } else {
    parts = normalized.split(',');
  }

  const names: string[] = [];
  for (const part of parts) {
    const name = stripListMarker(part).replace(/\s+/g, ' ').slice(0, maxNameLength).trim();
    if (!name) continue;
    names.push(name);
    if (names.length >= maxNames) break;
  }
  return names;
}

/**
 * The disc name for a pasted/typed player: "Matti Meikäläinen" -> "Matti". A
 * multi-word name gets its first word as the nickname (the disc renders
 * nickname || name); a single word stays nickname-free so the roster list does
 * not echo "Aino (Aino)". Shared by the setup wizard and basic Home's
 * "Lisää pelaajat" so both create the same players.
 */
export function defaultNickname(name: string): string {
  const trimmed = name.trim();
  const firstWord = trimmed.split(/\s+/)[0] ?? '';
  return firstWord === trimmed ? '' : firstWord;
}
