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

const props = (overrides: Partial<React.ComponentProps<typeof GameInfoBar>> = {}) => ({
  teamName: 'PEPO',
  opponentName: 'HJK',
  homeScore: 1,
  awayScore: 0,
  onTeamNameChange: jest.fn(),
  onOpponentNameChange: jest.fn(),
  homeOrAway: 'home' as const,
  ...overrides,
});

/**
 * The bar used to underline the coach's own team in its kit colour. The owner
 * had it removed: they read the bar by the names they wrote themselves, so a
 * colour saying "this one is yours" earned nothing. The kit colour is still
 * the field's, where it tells players apart at a glance.
 */
describe('GameInfoBar marks neither side', () => {
  it.each([['home'], ['away']] as const)('draws no rule under either name (%s)', (side) => {
    render(<GameInfoBar {...props({ homeOrAway: side })} />);

    for (const name of ['PEPO', 'HJK']) {
      expect(screen.getByTitle(name).getAttribute('style') ?? '').not.toContain('inset');
    }
  });
});
