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

  it('includes legacy games with matching teamName when teamFilterName is set', () => {
    // Older saved games have no `teamId`; falling back to `teamName`
    // keeps them visible instead of disappearing behind the empty state.
    renderPicker({
      teamFilterId: 'team_1',
      teamFilterName: 'My Team',
      games: [
        baseGame('g1', { teamId: 'team_1' }),
        baseGame('g2', { teamId: undefined, teamName: 'My Team' }),
        baseGame('g3', { teamId: undefined, teamName: 'Other Team' }),
      ],
    });
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('excludes legacy games whose teamName does not match teamFilterName', () => {
    renderPicker({
      teamFilterId: 'team_1',
      teamFilterName: 'My Team',
      games: [baseGame('g1', { teamId: undefined, teamName: 'Other Team' })],
    });
    expect(
      screen.getByText(/No games available|Aktiiviselle joukkueelle ei ole pelejä/i),
    ).toBeInTheDocument();
  });

  it('does not fall back to teamName when teamFilterName is undefined', () => {
    // Without teamFilterName the picker can't know the active team's
    // display name, so legacy games stay excluded — preserving the
    // previous strict behavior for callers that don't supply it.
    renderPicker({
      teamFilterId: 'team_1',
      teamFilterName: undefined,
      games: [
        baseGame('g1', { teamId: 'team_1' }),
        baseGame('g2', { teamId: undefined, teamName: 'My Team' }),
      ],
    });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
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

  it('blocks continue for legacy games with no teamId but different teamNames (Codex P2)', () => {
    // Both games have undefined teamId but different teamNames — these
    // are likely different teams. Older code accepted them because
    // `undefined === undefined` is true; the homogeneity check now
    // falls back to teamName when teamId is absent on both sides.
    renderPicker({
      teamFilterId: undefined,
      games: [
        baseGame('g1', { teamId: undefined, teamName: 'Pepo U10' }),
        baseGame('g2', { teamId: undefined, teamName: 'Pepo U12' }),
      ],
    });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(
      screen.getByRole('button', { name: /continue|jatka/i }),
    ).toBeDisabled();
  });

  it('blocks mixing legacy (no teamId) and modern (with teamId) games', () => {
    // Defensive: a game without teamId is unknown-provenance; never merge
    // with a game that has one, even if the teamName matches.
    renderPicker({
      teamFilterId: undefined,
      games: [
        baseGame('g1', { teamId: 'team_a', teamName: 'Pepo U10' }),
        baseGame('g2', { teamId: undefined, teamName: 'Pepo U10' }),
      ],
    });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(
      screen.getByRole('button', { name: /continue|jatka/i }),
    ).toBeDisabled();
  });

  it('allows two legacy games with the same teamName when teamId is missing on both', () => {
    const { props } = renderPicker({
      teamFilterId: undefined,
      games: [
        baseGame('g1', { teamId: undefined, teamName: 'Pepo U10' }),
        baseGame('g2', {
          teamId: undefined,
          teamName: 'Pepo U10',
          gameDate: '2026-05-01',
        }),
      ],
    });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: /continue|jatka/i }));
    expect(props.onContinue).toHaveBeenCalledWith(['g1', 'g2']);
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

  it('forwards only eligible-filtered ids to onContinue (defensive)', () => {
    // If `games` prop refreshes mid-interaction (e.g., a saved-games
    // query refetch removes one of the previously-selected games), the
    // internal Set still references the dropped id. The picker must
    // strip it before forwarding so PR 5d never receives an id that
    // no longer corresponds to an eligible game.
    const onContinue = jest.fn();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <PlanningGamePicker
          games={[baseGame('g1'), baseGame('g2', { gameDate: '2026-05-01' })]}
          teamFilterId="team_1"
          onBack={jest.fn()}
          onContinue={onContinue}
        />
      </I18nextProvider>,
    );
    // Select both games.
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    // Simulate `games` refresh — g2 is gone. Internal selectedIds Set
    // still has g2, but it must not be forwarded.
    rerender(
      <I18nextProvider i18n={i18n}>
        <PlanningGamePicker
          games={[baseGame('g1')]}
          teamFilterId="team_1"
          onBack={jest.fn()}
          onContinue={onContinue}
        />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /continue|jatka/i }));
    expect(onContinue).toHaveBeenCalledWith(['g1']);
  });

  it('calls onBack when back is clicked', () => {
    const { props } = renderPicker();
    fireEvent.click(screen.getAllByRole('button', { name: /back|takaisin/i })[0]);
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});
