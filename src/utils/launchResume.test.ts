/**
 * The game-day guardrail (two-level restructure PR 1.1): a coach at the pitch
 * NEVER pays an extra tap to get back into a live match. These tests pin the
 * launch auto-resume decision so no later restructure phase can silently
 * regress it.
 * @critical game-day speed is the product's core promise
 */

import { shouldAutoResumeOnLaunch } from './launchResume';
import type { AppState } from '@/types';

const game = (gameStatus: AppState['gameStatus']) => ({ gameStatus });

describe('shouldAutoResumeOnLaunch', () => {
  it('resumes into a match that is in progress', () => {
    expect(shouldAutoResumeOnLaunch(true, game('inProgress'))).toBe(true);
  });

  it('resumes into a match at a period break - HALF-TIME backgrounding is the common case', () => {
    expect(shouldAutoResumeOnLaunch(true, game('periodEnd'))).toBe(true);
  });

  it('does not resume before kick-off - the start screen is fine pre-game', () => {
    expect(shouldAutoResumeOnLaunch(true, game('notStarted'))).toBe(false);
  });

  it('does not resume after full time - the match is over', () => {
    expect(shouldAutoResumeOnLaunch(true, game('gameEnd'))).toBe(false);
  });

  it('never resumes on a non-first check - a refresh must not yank the user off the start screen', () => {
    expect(shouldAutoResumeOnLaunch(false, game('inProgress'))).toBe(false);
    expect(shouldAutoResumeOnLaunch(false, game('periodEnd'))).toBe(false);
  });

  it('never resumes without a game', () => {
    expect(shouldAutoResumeOnLaunch(true, undefined)).toBe(false);
    expect(shouldAutoResumeOnLaunch(true, null)).toBe(false);
  });
});
