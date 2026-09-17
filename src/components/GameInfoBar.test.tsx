/**
 * @jest-environment jsdom
 * @critical - the kit colour is a team's identity on the one screen that is up
 * for the whole match. Painting it under the opponent tells the coach the
 * wrong side is theirs, at a glance, for ninety minutes.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import GameInfoBar from './GameInfoBar';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

const KIT = '#16A34A';

const props = (overrides: Partial<React.ComponentProps<typeof GameInfoBar>> = {}) => ({
  teamName: 'PEPO',
  opponentName: 'HJK',
  homeScore: 1,
  awayScore: 0,
  onTeamNameChange: jest.fn(),
  onOpponentNameChange: jest.fn(),
  homeOrAway: 'home' as const,
  teamColor: KIT,
  ...overrides,
});

/** The underline is an inset box-shadow, so read it off the style attribute. */
const hasKitUnderline = (name: string) => {
  const el = screen.getByTitle(name);
  return (el.getAttribute('style') ?? '').includes('inset 0 -3px 0 0');
};

describe('GameInfoBar kit colour', () => {
  it('underlines the coach\'s own team at home', () => {
    render(<GameInfoBar {...props({ homeOrAway: 'home' })} />);

    expect(hasKitUnderline('PEPO')).toBe(true);
    expect(hasKitUnderline('HJK')).toBe(false);
  });

  /**
   * The regression. The sides swap with homeOrAway, and the underline used to
   * be nailed to the LEFT span - so an away game drew the coach's colours
   * under the opponent's name.
   */
  it('still underlines the coach\'s own team away, not the opponent', () => {
    render(<GameInfoBar {...props({ homeOrAway: 'away' })} />);

    expect(hasKitUnderline('PEPO')).toBe(true);
    expect(hasKitUnderline('HJK')).toBe(false);
  });

  it('puts the opponent on the left when away, which is why the bug existed', () => {
    render(<GameInfoBar {...props({ homeOrAway: 'away' })} />);

    // Both names render; the point is only that the sides did swap.
    expect(screen.getByTitle('HJK')).toBeInTheDocument();
    expect(screen.getByTitle('PEPO')).toBeInTheDocument();
  });

  it.each([['home'], ['away']] as const)('underlines nobody without a kit colour (%s)', (side) => {
    render(<GameInfoBar {...props({ homeOrAway: side, teamColor: undefined })} />);

    expect(hasKitUnderline('PEPO')).toBe(false);
    expect(hasKitUnderline('HJK')).toBe(false);
  });

  /** jsdom keeps a box-shadow colour verbatim rather than normalising it. */
  it('uses the colour it was given', () => {
    render(<GameInfoBar {...props()} />);

    expect(screen.getByTitle('PEPO').getAttribute('style')).toContain(KIT);
  });
});
