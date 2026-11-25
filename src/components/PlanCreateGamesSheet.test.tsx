/**
 * "Create all games" sheet on its own: several games visibly (count, one block
 * per game, folded summaries), the opponent/side read from a planned game's
 * label, the native kick-off picker, and the venue field with fill-down.
 * The planner wiring (validation -> create -> status) is covered in
 * PlaytimePlannerModal.createGames.test.tsx.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';
import PlanCreateGamesSheet from './PlanCreateGamesSheet';
import { searchVenues } from '@/utils/venueSearch';
import type { KnownVenue } from '@/utils/venueBook';
import type { PlanGame, PlaytimePlan } from '@/utils/playtimePlanner/types';
import type { Season, Team } from '@/types';

const interpolate = (template: string, options?: Record<string, unknown>): string =>
  options
    ? template.replace(/\{\{(\w+)\}\}/g, (_m, k) => (options[k] !== undefined ? String(options[k]) : `{{${k}}}`))
    : template;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValueOrOptions?: string | Record<string, unknown>, maybeOptions?: Record<string, unknown>) =>
      typeof defaultValueOrOptions === 'string' ? interpolate(defaultValueOrOptions, maybeOptions) : _key,
    i18n: { language: 'en' },
  }),
}));
jest.mock('@/utils/venueSearch', () => {
  const actual = jest.requireActual('@/utils/venueSearch');
  return { ...actual, searchVenues: jest.fn() };
});

beforeEach(() => {
  jest.clearAllMocks();
  (searchVenues as jest.Mock).mockResolvedValue([]);
});
afterEach(() => cleanup());

const planGame = (id: string, label: string): PlanGame =>
  ({
    id,
    label,
    formationId: '8v8-2-1-2-1-1',
    numberOfPeriods: 2,
    periodMinutes: 12,
    included: true,
    startingSlots: [],
    subs: [],
  }) as unknown as PlanGame;

const makePlan = (games: PlanGame[]): PlaytimePlan =>
  ({
    id: 'cup',
    name: 'Cup',
    version: 1,
    createdAt: '',
    updatedAt: '',
    teamId: 'team1',
    players: [],
    games,
  }) as unknown as PlaytimePlan;

const team: Team = { id: 'team1', name: 'FC Koti', createdAt: '', updatedAt: '' } as Team;
const areena: KnownVenue = {
  name: 'Mitta-Keittiöt Areena',
  latitude: 61.87,
  longitude: 28.88,
  address: 'Muurarinkatu 4, Savonlinna',
  timesUsed: 3,
  lastUsed: '2026-09-15',
};

const renderSheet = (
  games: PlanGame[],
  extra: { teams?: Team[]; seasons?: Season[]; onSubmit?: jest.Mock } = {},
) => {
  const plan = makePlan(games);
  const onSubmit = extra.onSubmit ?? jest.fn(async () => ({ created: [], failed: [], skipped: [] }));
  render(
    <PlanCreateGamesSheet
      plan={plan}
      games={games}
      teams={extra.teams ?? [team]}
      seasons={extra.seasons ?? []}
      tournaments={[]}
      knownVenues={[areena]}
      onSubmit={onSubmit}
      onDone={jest.fn()}
      onClose={jest.fn()}
    />,
  );
  return { onSubmit, dialog: screen.getByRole('dialog', { name: 'Create all games' }) };
};

const threeGames = () => [planGame('g1', 'HJK'), planGame('g2', 'Game 2'), planGame('g3', 'PK-35')];

describe('PlanCreateGamesSheet', () => {
  /** @critical the coach must see that the sheet makes several games */
  it('says how many games, heads each block "Game N · label" and opens only the first', () => {
    const { dialog } = renderSheet(threeGames());
    expect(within(dialog).getByTestId('plan-create-games-count')).toHaveTextContent('3 games will be created');
    expect(within(dialog).getByText('Games (3)')).toBeInTheDocument();
    expect(within(dialog).getByTestId('plan-create-toggle-g1')).toHaveTextContent('Game 1 · HJK');
    // A default label is shown as it is, not "Game 2 · Game 2".
    expect(within(within(dialog).getByTestId('plan-create-toggle-g2')).getByText('Game 2')).toBeInTheDocument();
    expect(within(dialog).getByTestId('plan-create-toggle-g2')).not.toHaveTextContent('·  Game 2');
    expect(within(dialog).getByTestId('plan-create-toggle-g1')).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByTestId('plan-create-toggle-g3')).toHaveAttribute('aria-expanded', 'false');
    // Only the open game's fields are on screen; the folded ones show a summary.
    expect(within(dialog).getAllByLabelText('Opponent')).toHaveLength(1);
    expect(within(dialog).getByTestId('plan-create-summary-g2')).toHaveTextContent('Opponent missing · Date missing · Home');
    expect(within(dialog).getByTestId('plan-create-summary-g3')).toHaveTextContent('PK-35 · Date missing · Home');
    expect(within(dialog).getByRole('button', { name: 'Create 3 games' })).toBeInTheDocument();
  });

  it('opens and folds a game from its heading', async () => {
    const { dialog } = renderSheet(threeGames());
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId('plan-create-toggle-g3'));
    });
    expect(within(dialog).getAllByLabelText('Opponent')).toHaveLength(2);
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId('plan-create-toggle-g1'));
    });
    expect((within(dialog).getByLabelText('Opponent') as HTMLInputElement).value).toBe('PK-35');
    expect(within(dialog).getByTestId('plan-create-summary-g1')).toHaveTextContent('HJK');
  });

  it('strips "(koti)" / "(vieras)" from the opponent and sets the side; never prefills the own team', () => {
    const { dialog } = renderSheet([
      planGame('g1', 'PePo / Valkoinen (koti)'),
      planGame('g2', 'Ilves (vieras)'),
      planGame('g3', 'FC Koti'),
    ]);
    expect((within(dialog).getByLabelText('Opponent') as HTMLInputElement).value).toBe('PePo / Valkoinen');
    expect(within(dialog).getByRole('button', { name: 'Home' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByTestId('plan-create-summary-g2')).toHaveTextContent('Ilves · Date missing · Away');
    expect(within(dialog).getByTestId('plan-create-summary-g3')).toHaveTextContent('Opponent missing');
  });

  /** @critical the empty kick-off is visibly empty, never a blank box */
  it('uses the native time picker with a "--:--" hint while empty, and submits HH:MM', async () => {
    const { dialog, onSubmit } = renderSheet([planGame('g1', 'HJK')]);
    const time = within(dialog).getByLabelText('Kick-off') as HTMLInputElement;
    expect(time).toHaveAttribute('type', 'time');
    expect(within(dialog).getByTestId('plan-create-time-g1-empty-hint')).toHaveTextContent('--:--');
    expect(within(dialog).getByText('Optional')).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(time, { target: { value: '09:30' } });
      fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-12-06' } });
    });
    expect(within(dialog).queryByTestId('plan-create-time-g1-empty-hint')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create 1 games' }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1][0]).toMatchObject({ opponentName: 'HJK', gameDate: '2026-12-06', gameTime: '09:30' });
  });

  it('opens every folded game that has an error when creating fails validation', async () => {
    const { dialog, onSubmit } = renderSheet(threeGames());
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create 3 games' }));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    for (const id of ['g1', 'g2', 'g3']) {
      expect(within(dialog).getByTestId(`plan-create-toggle-${id}`)).toHaveAttribute('aria-expanded', 'true');
    }
    expect(within(dialog).getAllByText('Choose the date.')).toHaveLength(3);
    expect(within(dialog).getByText('Enter the opponent.')).toBeInTheDocument();
  });

  /** @critical venue: same field as the new-game form, filled down like the date */
  it('fills a picked venue (name, pin, address) into the empty venues after it, but not over a typed one', async () => {
    const { dialog, onSubmit } = renderSheet(threeGames());
    // Open all three; type a venue of its own into the last game first.
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId('plan-create-toggle-g2'));
      fireEvent.click(within(dialog).getByTestId('plan-create-toggle-g3'));
    });
    const names = () => within(dialog).getAllByLabelText('Venue name (optional)') as HTMLInputElement[];
    await act(async () => {
      fireEvent.change(names()[2], { target: { value: 'Kimpisen kenttä' } });
    });
    // Pick one of the coach's own venues in the first game.
    await act(async () => {
      fireEvent.change(names()[0], { target: { value: 'Mitta' } });
    });
    expect(names().map((n) => n.value)).toEqual(['Mitta', 'Mitta', 'Kimpisen kenttä']);
    await act(async () => {
      fireEvent.mouseDown(within(within(dialog).getByRole('option', { name: /Mitta-Keittiöt Areena/ })).getByRole('button'));
    });
    expect(names().map((n) => n.value)).toEqual(['Mitta-Keittiöt Areena', 'Mitta-Keittiöt Areena', 'Kimpisen kenttä']);
    // Each stays editable: the second game's venue is its own once typed.
    await act(async () => {
      fireEvent.change(names()[1], { target: { value: 'Tali' } });
    });
    expect(names().map((n) => n.value)).toEqual(['Mitta-Keittiöt Areena', 'Tali', 'Kimpisen kenttä']);

    const dates = within(dialog).getAllByLabelText('Date');
    const opponents = within(dialog).getAllByLabelText('Opponent');
    await act(async () => {
      fireEvent.change(dates[0], { target: { value: '2026-12-06' } });
      fireEvent.change(opponents[1], { target: { value: 'KuPS' } });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create 3 games' }));
    });
    const rows = onSubmit.mock.calls[0][1];
    expect(rows[0]).toMatchObject({
      gameLocation: 'Mitta-Keittiöt Areena',
      locationLat: 61.87,
      locationLng: 28.88,
      locationAddress: 'Muurarinkatu 4, Savonlinna',
    });
    // Renaming keeps the pin, exactly as the venue field does in the new-game form.
    expect(rows[1]).toMatchObject({ gameLocation: 'Tali' });
    expect(rows[2]).toMatchObject({ gameLocation: 'Kimpisen kenttä', locationLat: undefined });
  });

  it("lets a venue typed in one game replace the competition's default venue in the games after it", async () => {
    const season = { id: 's1', name: 'Liiga', location: 'Kunnan kenttä' } as Season;
    const { dialog } = renderSheet([planGame('g1', 'HJK'), planGame('g2', 'KuPS')], {
      teams: [{ ...team, boundSeasonId: 's1' } as Team],
      seasons: [season],
    });
    const name = within(dialog).getByLabelText('Venue name (optional)') as HTMLInputElement;
    expect(name.value).toBe('Kunnan kenttä');
    await act(async () => {
      fireEvent.change(name, { target: { value: 'Tali' } });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId('plan-create-toggle-g2'));
    });
    expect((within(dialog).getAllByLabelText('Venue name (optional)') as HTMLInputElement[]).map((n) => n.value)).toEqual([
      'Tali',
      'Tali',
    ]);
  });
});
