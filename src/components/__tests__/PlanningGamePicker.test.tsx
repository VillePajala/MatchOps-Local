import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningGamePicker, {
  type PlanningGamePickerGame,
} from '../PlanningGamePicker';

const baseGame = (
  id: string,
  overrides: Partial<PlanningGamePickerGame['game']> = {},
): PlanningGamePickerGame => ({
  id,
  game: {
    teamName: 'My Team',
    opponentName: 'Opponent',
    gameDate: '2026-04-28',
    numberOfPeriods: 2,
    periodDurationMinutes: 25,
    teamId: 'team_1',
    ...overrides,
  },
});

const renderPicker = (
  overrides: Partial<React.ComponentProps<typeof PlanningGamePicker>> = {},
) => {
  const props = {
    games: [baseGame('g1'), baseGame('g2'), baseGame('g3')],
    teamFilterId: 'team_1',
    onBack: jest.fn(),
    onContinue: jest.fn(),
    ...overrides,
  };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <PlanningGamePicker {...props} />
      </I18nextProvider>,
    ),
    props,
  };
};

describe('PlanningGamePicker', () => {
  it('renders empty state when no games match the team filter', () => {
    renderPicker({ games: [], teamFilterId: 'team_1' });
    expect(
      screen.getByText(/No games available|Aktiiviselle joukkueelle ei ole pelejä/i),
    ).toBeInTheDocument();
  });

  it('lists eligible games when there is at least one', () => {
    renderPicker();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('filters out games whose teamId does not match teamFilterId', () => {
    renderPicker({
      games: [
        baseGame('g1', { teamId: 'team_1' }),
        baseGame('g2', { teamId: 'team_OTHER' }),
        baseGame('g3', { teamId: 'team_1' }),
      ],
    });
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('continue is disabled until at least one game is selected', () => {
    renderPicker();
    const continueBtn = screen.getByRole('button', {
      name: /continue|jatka/i,
    });
    expect(continueBtn).toBeDisabled();
  });

  it('continue enables when one game is selected; calls onContinue with the id', () => {
    const { props } = renderPicker();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    const continueBtn = screen.getByRole('button', {
      name: /continue|jatka/i,
    });
    expect(continueBtn).not.toBeDisabled();
    fireEvent.click(continueBtn);
    expect(props.onContinue).toHaveBeenCalledWith(['g1']);
  });

  it('blocks continue with a hint when selection mixes period counts', () => {
    const { props } = renderPicker({
      games: [
        baseGame('g1', { numberOfPeriods: 2 }),
        baseGame('g2', { numberOfPeriods: 1 }),
      ],
    });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(
      screen.getByText(
        /Selected games must share|Valittujen pelien tulee jakaa/i,
      ),
    ).toBeInTheDocument();
    const continueBtn = screen.getByRole('button', {
      name: /continue|jatka/i,
    });
    expect(continueBtn).toBeDisabled();
    fireEvent.click(continueBtn);
    expect(props.onContinue).not.toHaveBeenCalled();
  });

  it('blocks continue when selection mixes period durations', () => {
    renderPicker({
      games: [
        baseGame('g1', { periodDurationMinutes: 25 }),
        baseGame('g2', { periodDurationMinutes: 30 }),
      ],
    });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(
      screen.getByRole('button', { name: /continue|jatka/i }),
    ).toBeDisabled();
  });

  it('blocks continue when selection mixes teamIds (defensive — picker also pre-filters)', () => {
    // Pass through the teamFilterId so games for different teams stay in
    // the list to exercise the homogeneous guard at the validation layer.
    renderPicker({
      teamFilterId: undefined,
      games: [
        baseGame('g1', { teamId: 'team_a' }),
        baseGame('g2', { teamId: 'team_b' }),
      ],
    });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(
      screen.getByRole('button', { name: /continue|jatka/i }),
    ).toBeDisabled();
  });

  it('allows multiple games sharing all relevant fields', () => {
    const { props } = renderPicker({
      games: [
        baseGame('g1'),
        baseGame('g2', { gameDate: '2026-05-01' }),
        baseGame('g3', { gameDate: '2026-05-02' }),
      ],
    });
    screen.getAllByRole('checkbox').forEach((cb) => fireEvent.click(cb));
    const continueBtn = screen.getByRole('button', {
      name: /continue|jatka/i,
    });
    expect(continueBtn).not.toBeDisabled();
    fireEvent.click(continueBtn);
    expect(props.onContinue).toHaveBeenCalledWith(['g1', 'g2', 'g3']);
  });

  it('calls onBack when back is clicked', () => {
    const { props } = renderPicker();
    fireEvent.click(screen.getAllByRole('button', { name: /back|takaisin/i })[0]);
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});
