/**
 * @jest-environment jsdom
 * @critical - these suggestions sit above every other field in the new-game
 * form. Uncapped they buried the form itself: a coach with thirty-odd teams
 * could not see the team name, the date, the season, or the create button.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TeamOpponentInputs from './TeamOpponentInputs';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _k).replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) =>
        String(options?.[n] ?? ''),
      ),
  }),
}));

/** A pool the size a real coach reaches after a season or two. */
const manyTeams = [
  'KTP Juniorit / Raita',
  'KJP/3',
  'KJP/4',
  'JIPPO / Valkoinen',
  'Ylämyllyn Yllätys / Sinivalkoinen',
  'FC LaPa P9',
  'LAUTP P9 / Valkoinen',
  'Nopsa2016 / Punainen',
  'FC Loviisa',
  'KJP/5',
  'PePo -17/2',
  'LAUTP / Sininen',
];

const renderInputs = (props: Partial<React.ComponentProps<typeof TeamOpponentInputs>> = {}) =>
  render(
    <TeamOpponentInputs
      teamName=""
      opponentName=""
      onTeamNameChange={jest.fn()}
      onOpponentNameChange={jest.fn()}
      teamLabel="Your team"
      teamPlaceholder="Your team"
      opponentLabel="Opponent"
      opponentPlaceholder="Opponent"
      opponentOptions={manyTeams}
      {...props}
    />,
  );

const chipNames = () =>
  Array.from(screen.getByTestId('opponent-options').querySelectorAll('button')).map(
    (b) => b.textContent,
  );

describe('TeamOpponentInputs suggestion chips', () => {
  it('shows only a handful before anything is typed', () => {
    renderInputs();
    expect(chipNames()).toHaveLength(6);
  });

  /** The order it truncates is the caller's: likeliest teams first. */
  it('keeps the first teams the caller offered', () => {
    renderInputs();
    expect(chipNames()).toEqual(manyTeams.slice(0, 6));
  });

  /**
   * A truncated list that looks complete is the dangerous version: a coach
   * whose team is not shown types the name fresh, which is how a second
   * spelling gets created.
   */
  it('says how many it is not showing', () => {
    renderInputs();
    expect(screen.getByTestId('opponent-options-more')).toHaveTextContent('+6');
  });

  it('says nothing about more when it is showing everything', () => {
    renderInputs({ opponentOptions: ['HJK', 'KuPS'] });
    expect(screen.queryByTestId('opponent-options-more')).not.toBeInTheDocument();
  });

  /** Nothing is unreachable: typing searches the whole pool, not the six. */
  it('finds a team that the resting list had hidden', () => {
    renderInputs({ opponentName: 'lautp' });
    expect(chipNames()).toEqual(
      expect.arrayContaining(['LAUTP P9 / Valkoinen', 'LAUTP / Sininen']),
    );
  });

  it('still fills the field when a chip is tapped', () => {
    const onOpponentNameChange = jest.fn();
    renderInputs({ onOpponentNameChange });
    fireEvent.click(screen.getByRole('button', { name: 'KJP/3' }));
    expect(onOpponentNameChange).toHaveBeenCalledWith('KJP/3');
  });

  it('renders no chip list when the caller offers none', () => {
    renderInputs({ opponentOptions: [] });
    expect(screen.queryByTestId('opponent-options')).not.toBeInTheDocument();
  });
});
