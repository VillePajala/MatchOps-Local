/**
 * The card is the game's own record on screen. It must show the captain when
 * one was named and say nothing at all when none was, because an empty
 * "Captain" label reads as a game nobody was willing to lead.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { GameInfoCard } from '../GameInfoCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const base = {
  homeTeamName: 'Tigers',
  awayTeamName: 'Lions',
  homeScore: 2,
  awayScore: 1,
  formattedDate: '9.9.2026',
  numPeriods: 2,
  periodDurationMinutes: 25,
};

describe('GameInfoCard captain', () => {
  it('names the captain when one was recorded', () => {
    render(<GameInfoCard {...base} captainName="Noah Brown" />);
    expect(screen.getByText('Captain')).toBeInTheDocument();
    expect(screen.getByText('Noah Brown')).toBeInTheDocument();
  });

  it('shows no captain row at all when none was named', () => {
    render(<GameInfoCard {...base} />);
    expect(screen.queryByText('Captain')).not.toBeInTheDocument();
  });

  /**
   * @edge-case - the caller resolves the id to a name and hands over nothing
   * when the player has been deleted from the roster entirely. A label with an
   * empty value beside it would be worse than no row.
   */
  it('shows no captain row when the id no longer resolves to a player', () => {
    render(<GameInfoCard {...base} captainName={undefined} />);
    expect(screen.queryByText('Captain')).not.toBeInTheDocument();
  });
});

/** Review 11.1 (owner 2026-11-17): the extra-time score beside the final one. */
describe('GameInfoCard extra time', () => {
  it('shows the extra-time score in place of the bare OT mark, before the shootout', () => {
    render(
      <GameInfoCard {...base} homeScore={2} awayScore={2} wentToOvertime wentToPenalties
        extraTimeScore={{ home: 1, away: 1 }} shootoutScore={{ home: 4, away: 3 }} />,
    );
    expect(screen.getByText('(ET 1-1, 4-3 PKs)')).toBeInTheDocument();
  });

  it('keeps the OT mark for an overtime recorded without extra time on the clock', () => {
    render(<GameInfoCard {...base} wentToOvertime />);
    expect(screen.getByText('(OT)')).toBeInTheDocument();
  });
});
