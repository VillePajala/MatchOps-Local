/**
 * @critical - the dashboard tiles used to add every team's games together. For
 * a coach running one team per competition that produced a goal difference for
 * squads that never met. This control is what makes the numbers say whose.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeTeamScopePills } from '../HomeDashboard';

const t = ((_k: string, fallback?: string) => fallback ?? _k) as never;
const teams = [
  { id: 'teamA', name: 'P10 Aluesarja' },
  { id: 'teamB', name: 'P10 Futsal' },
];

describe('HomeTeamScopePills', () => {
  it('offers every team plus the club-wide view', () => {
    render(<HomeTeamScopePills teams={teams} scope="all" onChange={jest.fn()} t={t} />);
    expect(screen.getByRole('button', { name: 'All teams' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'P10 Aluesarja' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'P10 Futsal' })).toBeInTheDocument();
  });

  it('shows which one the numbers are about', () => {
    render(<HomeTeamScopePills teams={teams} scope="teamB" onChange={jest.fn()} t={t} />);
    expect(screen.getByRole('button', { name: 'P10 Futsal' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All teams' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the coach choice', () => {
    const onChange = jest.fn();
    render(<HomeTeamScopePills teams={teams} scope="all" onChange={onChange} t={t} />);
    fireEvent.click(screen.getByRole('button', { name: 'P10 Aluesarja' }));
    expect(onChange).toHaveBeenCalledWith('teamA');
  });

  /** A question with one answer is not a question. */
  it('stays out of the way when there is nothing to choose between', () => {
    const { container: one } = render(
      <HomeTeamScopePills teams={[teams[0]]} scope="teamA" onChange={jest.fn()} t={t} />,
    );
    expect(one).toBeEmptyDOMElement();

    const { container: none } = render(
      <HomeTeamScopePills teams={[]} scope="all" onChange={jest.fn()} t={t} />,
    );
    expect(none).toBeEmptyDOMElement();
  });
});
