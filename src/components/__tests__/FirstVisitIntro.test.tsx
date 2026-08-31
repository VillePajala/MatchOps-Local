import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FirstVisitIntro from '../FirstVisitIntro';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({ userId: 'user-1' }),
}));

const KEY = 'matchops_first_visit_team-form_user-1';

beforeEach(() => {
  localStorage.clear();
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
   * @edge-case - The field variant overlays (absolute) instead of flowing,
   * so it can sit on the pitch without blocking it.
   */
  it('overlay variant positions absolutely', () => {
    render(<FirstVisitIntro surface="match-field" text="This is your field." overlay />);
    expect(screen.getByTestId('first-visit-match-field').className).toContain('absolute');
  });
});
