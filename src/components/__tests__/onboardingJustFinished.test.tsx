/**
 * The first Home visit after onboarding (review R13): raised when onboarding
 * ends, cleared the first time Home leaves the screen.
 */
import { renderHook, act } from '@testing-library/react';
import {
  markOnboardingJustFinished,
  setHomeShowing,
  useOnboardingJustFinished,
} from '../setupWizardActive';

describe('onboarding just finished', () => {
  it('lasts for one Home visit', () => {
    act(() => setHomeShowing(true));
    const { result } = renderHook(() => useOnboardingJustFinished());
    expect(result.current).toBe(false);
    act(() => markOnboardingJustFinished());
    expect(result.current).toBe(true);
    // Still on Home: still the first visit.
    act(() => setHomeShowing(true));
    expect(result.current).toBe(true);
    // Leaving Home (a match opened) ends it.
    act(() => setHomeShowing(false));
    expect(result.current).toBe(false);
  });
});
