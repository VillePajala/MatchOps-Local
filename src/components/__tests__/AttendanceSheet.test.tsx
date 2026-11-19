/**
 * "Ketkä ovat paikalla?" sheet: ticked chips, the present/total count, the
 * hand-edit warning before a re-do, and no editing after kick-off.
 * @critical
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AttendanceSheet from '../AttendanceSheet';
import type { AttendanceDeps } from '@/services/attendance';
import { buildFirstPlan } from '@/services/nextGamePair';
import { buildReapplyPatch } from '@/utils/playtimePlanner/reapply';
import { TestFixtures } from '../../../tests/fixtures';
import type { AppState, Player } from '@/types';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';

jest.mock('@/utils/logger', () => {
  const log = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() };
  return { __esModule: true, default: log, createLogger: () => log };
});
jest.mock('@/datastore/factory', () => ({ getDataStore: jest.fn() }));
const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback || key).replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) => String(options?.[n] ?? '')),
  }),
}));

const squad: Player[] = ['Onni', 'Toivo', 'Aatos', 'Otso', 'Aapo', 'Elias', 'Leevi', 'Eeli', 'Eino', 'Niilo'].map(
  (name, i) => ({ id: `p${i + 1}`, name }),
);

function makeDeps(mutate?: (game: AppState) => AppState) {
  const plan = buildFirstPlan({
    team: { id: 't', name: 'MePa' },
    players: squad,
    fieldSize: '8v8',
    gameType: 'soccer',
    ageGroup: '',
    numberOfPeriods: 2,
    periodMinutes: 25,
    gameDate: '2026-11-22',
    opponentName: 'FC',
  });
  const base = TestFixtures.games.newGame({ availablePlayers: squad, selectedPlayerIds: squad.map((p) => p.id) });
  let game: AppState = { ...base, ...buildReapplyPatch(base, plan, plan.games[0], squad).patch! };
  if (mutate) game = mutate(game);
  let storedPlan: PlaytimePlan = plan;
  const deps: AttendanceDeps = {
    getGame: jest.fn(async () => game),
    saveGame: jest.fn(async (_id, g) => {
      game = g;
      return g;
    }),
    getPlanLink: jest.fn(async () => ({ planId: plan.id, planGameId: plan.games[0].id })),
    getPlan: jest.fn(async () => storedPlan),
    savePlan: jest.fn(async (p) => {
      storedPlan = p;
      return p;
    }),
    getMasterRoster: jest.fn(async () => squad),
    setGameSubs: jest.fn(async () => true),
  };
  return { deps, getGame: () => game, getPlan: () => storedPlan };
}

beforeEach(() => jest.clearAllMocks());

describe('AttendanceSheet', () => {
  it('starts with everyone ticked; tapping a player marks them absent and the count follows', async () => {
    const { deps } = makeDeps();
    render(<AttendanceSheet gameId="g" mode="save" userId="u" onClose={jest.fn()} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId('attendance-count')).toHaveTextContent('10 / 10'));
    fireEvent.click(screen.getByRole('button', { name: 'Leevi' }));
    expect(screen.getByTestId('attendance-count')).toHaveTextContent('9 / 10');
    expect(screen.getByRole('button', { name: 'Leevi' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Save writes the absence to the plan and the game, then closes', async () => {
    const { deps, getGame, getPlan } = makeDeps();
    const onClose = jest.fn();
    const onSaved = jest.fn();
    render(<AttendanceSheet gameId="g" mode="save" userId="u" onClose={onClose} onSaved={onSaved} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId('attendance-count')).toHaveTextContent('10 / 10'));
    fireEvent.click(screen.getByRole('button', { name: 'Leevi' }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('attendance-save'));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalledWith('g');
    expect(getPlan().games[0].absentIds).toEqual(['p7']);
    expect(getGame().selectedPlayerIds).not.toContain('p7');
  });

  it('Start mode opens the game after saving', async () => {
    const { deps } = makeDeps();
    const onStart = jest.fn();
    render(<AttendanceSheet gameId="g" mode="start" userId="u" onClose={jest.fn()} onStart={onStart} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId('attendance-count')).toHaveTextContent('10 / 10'));
    expect(screen.getByTestId('attendance-save')).toHaveTextContent('Start');
    await act(async () => {
      fireEvent.click(screen.getByTestId('attendance-save'));
    });
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    // Nothing changed, so nothing was written.
    expect(deps.saveGame).not.toHaveBeenCalled();
  });

  it('warns that the line-up is redone when it was edited by hand, once a change is made', async () => {
    const { deps } = makeDeps((g) => ({
      ...g,
      playersOnField: g.playersOnField.map((p, i) => (i === 0 ? { ...p, relX: 0.1, relY: 0.1 } : p)),
    }));
    render(<AttendanceSheet gameId="g" mode="save" userId="u" onClose={jest.fn()} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId('attendance-count')).toBeInTheDocument());
    expect(screen.queryByTestId('attendance-redo-warning')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leevi' }));
    expect(screen.getByTestId('attendance-redo-warning')).toHaveTextContent('The line-up will be made again');
  });

  it('after kick-off it only says so and offers to open the match', async () => {
    const { deps } = makeDeps((g) => ({ ...g, gameStatus: 'inProgress' }));
    const onStart = jest.fn();
    render(<AttendanceSheet gameId="g" mode="start" userId="u" onClose={jest.fn()} onStart={onStart} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId('attendance-started')).toBeInTheDocument());
    expect(screen.queryByTestId('attendance-chips')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('attendance-save'));
    expect(onStart).toHaveBeenCalled();
    expect(deps.saveGame).not.toHaveBeenCalled();
  });
});

/** R13: match day is when the coach finally knows who the opponent is. */
describe('AttendanceSheet opponent field', () => {
  it('asks for the opponent while it is still the placeholder, and saves it with the attendance', async () => {
    const { deps, getGame } = makeDeps((g) => ({ ...g, opponentName: 'Vastustaja' }));
    const onClose = jest.fn();
    const onSaved = jest.fn();
    render(<AttendanceSheet gameId="g" mode="save" userId="u" onClose={onClose} onSaved={onSaved} deps={deps} />);
    const field = await screen.findByTestId('attendance-opponent');
    fireEvent.change(field, { target: { value: '  Rantakylän FC ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Leevi' }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('attendance-save'));
    });
    expect(getGame().opponentName).toBe('Rantakylän FC');
    // The attendance change landed too (the opponent write must not undo it).
    expect(getGame().selectedPlayerIds).not.toContain('p7');
    expect(onSaved).toHaveBeenCalledWith('g');
    expect(onClose).toHaveBeenCalled();
  });

  it('a named opponent alone is a change worth saving', async () => {
    const { deps, getGame } = makeDeps((g) => ({ ...g, opponentName: 'Opponent' }));
    const onSaved = jest.fn();
    render(<AttendanceSheet gameId="g" mode="save" userId="u" onClose={jest.fn()} onSaved={onSaved} deps={deps} />);
    fireEvent.change(await screen.findByTestId('attendance-opponent'), { target: { value: 'HJK' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('attendance-save'));
    });
    expect(getGame().opponentName).toBe('HJK');
    expect(onSaved).toHaveBeenCalledWith('g');
  });

  it('does not ask when the game already has a real opponent', async () => {
    const { deps } = makeDeps((g) => ({ ...g, opponentName: 'Rantakylän FC' }));
    render(<AttendanceSheet gameId="g" mode="save" userId="u" onClose={jest.fn()} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId('attendance-count')).toBeInTheDocument());
    expect(screen.queryByTestId('attendance-opponent')).not.toBeInTheDocument();
  });
});
