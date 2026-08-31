import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import FirstVisitIntro from '../FirstVisitIntro';
import { setGuidedTourActive, setOnboardingUserId } from '../setupWizardActive';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const KEY = 'matchops_first_visit_team-form_user-1';

beforeEach(() => {
  localStorage.clear();
  // The component is store-fed (no contexts) - set the stores directly.
  setOnboardingUserId('user-1');
  setGuidedTourActive(false);
});

describe('FirstVisitIntro', () => {
  /**
   * @critical - The education layer's contract: shown on the first visit,
   * "Got it" dismisses it forever for THIS user.
   */
  it('shows once and dismisses forever via the Got it button', () => {
    render(<FirstVisitIntro surface="team-form" text="Three steps to a team." />);

    const banner = screen.getByTestId('first-visit-team-form');
    expect(banner).toHaveTextContent('Three steps to a team.');

    fireEvent.click(screen.getByTestId('first-visit-team-form-dismiss'));
    expect(screen.queryByTestId('first-visit-team-form')).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('renders nothing when the surface was already seen', () => {
    localStorage.setItem(KEY, '1');
    const { container } = render(<FirstVisitIntro surface="team-form" text="Three steps." />);
    expect(container).toBeEmptyDOMElement();
  });

  it('flags are per-surface: seeing one surface does not hide another', () => {
    localStorage.setItem(KEY, '1');
    render(<FirstVisitIntro surface="game-setup" text="Pick your team." />);
    expect(screen.getByTestId('first-visit-game-setup')).toBeInTheDocument();
  });

  /**
   * @critical - Review #728 Issue 1: while the guided tour is active its own
   * hints own the surface - the banner must not stack a second message (and
   * must not consume its one showing).
   */
  it('yields to an ACTIVE guided tour without marking itself seen', () => {
    setGuidedTourActive(true);
    render(<FirstVisitIntro surface="team-form" text="Three steps." />);
    expect(screen.queryByTestId('first-visit-team-form')).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();

    // Tour over: the store change re-renders the subscriber - the banner gets
    // its turn on the same mount.
    act(() => setGuidedTourActive(false));
    expect(screen.getByTestId('first-visit-team-form')).toBeInTheDocument();
  });

  it('flags are per-user: another account sees the banner fresh', () => {
    localStorage.setItem(KEY, '1');
    setOnboardingUserId('user-2');
    render(<FirstVisitIntro surface="team-form" text="Three steps." />);
    expect(screen.getByTestId('first-visit-team-form')).toBeInTheDocument();
  });

  it('renders nothing while auth is still resolving (userId undefined)', () => {
    setOnboardingUserId(undefined);
    const { container } = render(<FirstVisitIntro surface="team-form" text="Three steps." />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * @edge-case - Storage failure counts as seen: never nag a user whose
   * dismissal we could not persist.
   */
  it('renders nothing when localStorage is unavailable', () => {
    // Spy on the INSTANCE, not Storage.prototype - the jest environment's
    // localStorage does not route getItem through the prototype (round-2 CI).
    const spy = jest.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const { container } = render(<FirstVisitIntro surface="team-form" text="Three steps." />);
      expect(container).toBeEmptyDOMElement();
    } finally {
      spy.mockRestore();
    }
  });

  /**
   * @edge-case - The field variant overlays (absolute) instead of flowing,
   * so it can sit on the pitch without blocking it.
   */
  it('overlay variant positions absolutely', () => {
    render(<FirstVisitIntro surface="match-field" text="This is your field." overlay />);
    expect(screen.getByTestId('first-visit-match-field').className).toContain('absolute');
  });
});
