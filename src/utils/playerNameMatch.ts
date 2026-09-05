/**
 * Kirjuri: guess which roster player a spoken/typed note is about.
 *
 * Finnish inflects names ("Emman syöttö", "Matille pallo"), so exact matching
 * is not enough. Handles are the nickname and the first word of the name
 * (the same convention the disc and the recap use). Scoring per token:
 *   3 exact handle, 2 token starts with the handle's stem (inflection),
 *   1 one edit away (typo / recognizer slip) for handles of 4+ letters.
 * A tie between two players yields no guess - the coach picks.
 */

import type { Player } from '@/types';
import { normalizeNameForCompare } from '@/utils/normalization';

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

const tokenize = (text: string): string[] =>
  normalizeNameForCompare(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** The words a coach would say for this player: nickname, first name. */
export function playerSpeechHandles(player: Player): string[] {
  const handles = new Set<string>();
  if (player.nickname) handles.add(normalizeNameForCompare(player.nickname));
  const first = normalizeNameForCompare(player.name).split(/\s+/)[0];
  if (first) handles.add(first);
  return [...handles].filter((h) => h.length >= 2);
}

function scoreToken(token: string, handle: string): number {
  if (token === handle) return 3;
  const stem = handle.slice(0, Math.max(3, handle.length - 2));
  if (handle.length >= 3 && token.startsWith(stem)) return 2;
  if (handle.length >= 4 && Math.abs(token.length - handle.length) <= 1 && levenshtein(token, handle) <= 1) return 1;
  return 0;
}

export function matchPlayerInText(text: string, players: Player[]): Player | null {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;

  let best: Player | null = null;
  let bestScore = 0;
  let tie = false;
  for (const player of players) {
    let score = 0;
    for (const handle of playerSpeechHandles(player)) {
      for (const token of tokens) {
        score = Math.max(score, scoreToken(token, handle));
      }
    }
    if (score === 0) continue;
    if (score > bestScore) {
      best = player;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && player.id !== best?.id) {
      tie = true;
    }
  }
  return best && !tie ? best : null;
}
