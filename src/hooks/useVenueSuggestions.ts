import { useEffect, useState } from 'react';
import { searchVenues, type VenueSuggestion } from '@/utils/venueSearch';

/**
 * Debounced venue lookup, shared by the two inputs in the location field.
 *
 * WHY A HOOK. The field names the place and a second input attaches its pin.
 * Both search the same service under the same rules, and both must cancel a
 * superseded request cleanly. Two copies of an async-cancellation pattern that
 * have to behave identically is exactly where a bug hides quietly.
 *
 * IT ONLY FETCHES. Whether a list is on screen is the caller's business, which
 * is what lets a pick close the list for good instead of having results
 * re-open it a moment later.
 *
 * @module useVenueSuggestions
 */

/** Below this a query matches half of Finland and costs a request to say so. */
export const VENUE_MIN_QUERY = 3;

/** Long enough that the coach has stopped typing, short enough to feel live. */
const DEBOUNCE_MS = 300;

export interface VenueSuggestionsState {
  suggestions: VenueSuggestion[];
  isSearching: boolean;
  /** The query the last completed search was FOR, so "nothing found" is shown
   *  for that exact text and does not linger over the next keystroke. */
  searchedFor: string | null;
}

/**
 * @param query what the coach has typed so far.
 * @param ignore a query to NOT search for - the label a pick just inserted.
 *   Expressing it as a value rather than a one-shot flag matters: a flag set on
 *   a path where the query does not change stays armed and swallows the NEXT
 *   real search, which is a bug this shape cannot have.
 */
export function useVenueSuggestions(
  query: string,
  ignore?: string | null,
): VenueSuggestionsState {
  const [suggestions, setSuggestions] = useState<VenueSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);

  const q = query.trim();

  useEffect(() => {
    // Nothing is cleared here on purpose: callers derive visibility from the
    // current query, so a too-short one hides the list without a synchronous
    // setState in an effect body (which cascades renders, and which
    // react-hooks/set-state-in-effect rightly refuses).
    if (q.length < VENUE_MIN_QUERY) return;
    if (ignore && q === ignore) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchVenues(q, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setSearchedFor(q);
      } finally {
        // Not in the aborted branch alone: a superseded request must also stop
        // the spinner, or it spins forever on the last keystroke of a word.
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, ignore]);

  return { suggestions, isSearching, searchedFor };
}

export default useVenueSuggestions;
