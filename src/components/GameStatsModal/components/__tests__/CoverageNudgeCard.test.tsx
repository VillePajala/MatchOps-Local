import React from 'react';
import { render, screen } from '@testing-library/react';
import CoverageNudgeCard from '../CoverageNudgeCard';
import type { Player } from '@/types';
import type { CoverageGame } from '@/utils/noteCoverage';
import type { GameEvent } from '@/types/game';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? '')),
  }),
}));

const player = (id: string, name: string): Player => ({ id, name }) as Player;
const roster = [player('p1', 'Emma'), player('p2', 'Matti'), player('p3', 'Sofia')];

const note = (id: string, about?: string): GameEvent =>
  ({ id, type: 'note', time: 100, text: 'jotain', entityId: about }) as GameEvent;

const game = (over: Partial<CoverageGame> = {}): CoverageGame =>
  ({ isPlayed: true, selectedPlayerIds: ['p1', 'p2', 'p3'], gameEvents: [], ...over }) as CoverageGame;

describe('CoverageNudgeCard', () => {
  it('names who has nothing written about them, with the matches beside them', () => {
    render(
      <CoverageNudgeCard
        games={[game({ gameEvents: [note('n1', 'p1')] }), game()]}
        players={roster}
      />,
    );

    expect(screen.getByTestId('coverage-nudge-summary')).toHaveTextContent(
      'Notes on 1 of 3 players over 2 matches.',
    );
    const list = screen.getByTestId('coverage-nudge-list');
    expect(list).toHaveTextContent('Matti');
    expect(list).toHaveTextContent('Sofia');
    expect(list).not.toHaveTextContent('Emma');
    // The denominator is the point: two zeros are not the same gap.
    expect(list).toHaveTextContent('2 matches');
  });

  /**
   * @critical - this card must never read as a verdict on a child. It has only
   * a count of notes, so there is nothing to rank by; this pins that the output
   * carries no score, grade or ordering language.
   */
  it('says nothing about how anyone played', () => {
    render(<CoverageNudgeCard games={[game()]} players={roster} />);
    const card = screen.getByTestId('coverage-nudge');
    expect(card.textContent).not.toMatch(/rating|score|best|worst|weak|strong|top|poor/i);
  });

  it('tells a coach who has covered everyone, rather than showing an empty list', () => {
    render(
      <CoverageNudgeCard
        games={[game({ gameEvents: [note('n1', 'p1'), note('n2', 'p2'), note('n3', 'p3')] })]}
        players={roster}
      />,
    );
    expect(screen.getByTestId('coverage-nudge-complete')).toBeInTheDocument();
    expect(screen.queryByTestId('coverage-nudge-list')).not.toBeInTheDocument();
  });

  it('summarises the tail instead of listing a whole squad', () => {
    const big = Array.from({ length: 10 }, (_, i) => player(`b${i}`, `Pelaaja ${i}`));
    render(
      <CoverageNudgeCard
        games={[game({ selectedPlayerIds: big.map((p) => p.id) })]}
        players={big}
        limit={3}
      />,
    );
    expect(screen.getByTestId('coverage-nudge-list').children).toHaveLength(3);
    expect(screen.getByTestId('coverage-nudge-rest')).toHaveTextContent('and 7 more');
  });

  it('shows nothing at all when there is no scope to speak about', () => {
    const { container } = render(<CoverageNudgeCard games={[]} players={roster} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing for a stretch with only unplayed matches', () => {
    // A planned match is not a chance the coach missed.
    const { container } = render(
      <CoverageNudgeCard games={[game({ isPlayed: false })]} players={roster} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
