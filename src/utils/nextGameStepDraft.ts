/**
 * The open "Milloin seuraava peli?" step, kept on the device (review R3).
 *
 * The step is the bridge between the setup wizard (or basic Home's "Uusi
 * ottelu") and the coach's first plan, and Android may kill the app while the
 * coach checks the fixture list in another app. While the step is open its
 * answers live here; on the next start Home opens the step again with them.
 * The record is removed when the step is left (plan made, "Ei nyt", back).
 *
 * localStorage, not sessionStorage like the wizard's own draft: this one has to
 * survive a full process kill, and it holds nothing but a date and a name. A
 * record older than a week is ignored - a step left open that long is not one
 * the coach is still in the middle of.
 */

const PREFIX = 'matchops_next_game_step_';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface NextGameStepDraft {
  /** YYYY-MM-DD, or '' while no date is picked. */
  gameDate: string;
  opponent: string;
}

interface StoredDraft extends NextGameStepDraft {
  savedAt: number;
}

const keyFor = (userId: string | null | undefined): string => `${PREFIX}${userId ?? 'local'}`;

/** The open step's answers, or null when no step is open. */
export function readNextGameStepDraft(
  userId: string | null | undefined,
  now: number = Date.now(),
): NextGameStepDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    // eslint-disable-next-line no-restricted-globals -- one onboarding step's answers, not app data
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (!parsed || typeof parsed.savedAt !== 'number' || now - parsed.savedAt > MAX_AGE_MS) return null;
    return {
      gameDate: typeof parsed.gameDate === 'string' && ISO_DATE.test(parsed.gameDate) ? parsed.gameDate : '',
      opponent: typeof parsed.opponent === 'string' ? parsed.opponent : '',
    };
  } catch {
    return null;
  }
}

/** The step is open (or its answers changed). */
export function writeNextGameStepDraft(
  userId: string | null | undefined,
  draft: NextGameStepDraft,
  now: number = Date.now(),
): void {
  try {
    const value: StoredDraft = { gameDate: draft.gameDate, opponent: draft.opponent, savedAt: now };
    // eslint-disable-next-line no-restricted-globals -- one onboarding step's answers, not app data
    localStorage.setItem(keyFor(userId), JSON.stringify(value));
  } catch {
    // Not persistable: the step still works for this page load.
  }
}

/** The step was left: nothing to reopen. */
export function clearNextGameStepDraft(userId: string | null | undefined): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- one onboarding step's answers, not app data
    localStorage.removeItem(keyFor(userId));
  } catch {
    // Nothing to clear.
  }
}
