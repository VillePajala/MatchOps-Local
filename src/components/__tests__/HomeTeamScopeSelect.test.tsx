/**
 * @critical - the dashboard tiles used to add every team's games together. For
 * a coach running one team per competition that produced a goal difference for
 * squads that never met. This control is what makes the numbers say whose.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeTeamScopeSelect } from '../HomeDashboard';

const t = ((_k: string, fallback?: string) => fallback ?? _k) as never;
const teams = [
  { id: 'teamA', label: 'PePo Lila (Aluesarja U10 25/26)' },
  { id: 'teamB', label: 'PePo Lila (Futsal)' },
];

describe('HomeTeamScopeSelect', () => {
  it('offers every team plus the club-wide view', () => {
    render(<HomeTeamScopeSelect teams={teams} scope="all" onChange={jest.fn()} t={t} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'All teams',
      'PePo Lila (Aluesarja U10 25/26)',
      'PePo Lila (Futsal)',
    ]);
  });

  it('shows which one the numbers are about', () => {
    render(<HomeTeamScopeSelect teams={teams} scope="teamB" onChange={jest.fn()} t={t} />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('teamB');
  });

  it('reports the coach choice', () => {
    const onChange = jest.fn();
    render(<HomeTeamScopeSelect teams={teams} scope="all" onChange={onChange} t={t} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'teamA' } });
    expect(onChange).toHaveBeenCalledWith('teamA');
  });

  /** A question with one answer is not a question. */
  it('stays out of the way when there is nothing to choose between', () => {
    const { container: one } = render(
      <HomeTeamScopeSelect teams={[teams[0]]} scope="teamA" onChange={jest.fn()} t={t} />,
    );
    expect(one).toBeEmptyDOMElement();
    const { container: none } = render(
      <HomeTeamScopeSelect teams={[]} scope="all" onChange={jest.fn()} t={t} />,
    );
    expect(none).toBeEmptyDOMElement();
  });
});
