/**
 * The basic layout's Home (Perusnäkymä, Onboarding v3): the next-game card in
 * its states, the rows that appear with data, and "Kaikki toiminnot".
 * @critical
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { TFunction } from 'i18next';
import HomeBasic from '../HomeBasic';
import type { HomeSummary, HomeUpcomingGame, HomeResumeGame } from '@/utils/homeSummary';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import { buildFirstPlan } from '@/services/nextGamePair';

jest.mock('@/utils/logger', () => {
  const log = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() };
  return { __esModule: true, default: log, createLogger: () => log };
});
jest.mock('@/datastore/factory', () => ({ getDataStore: jest.fn() }));
const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const mockGetPlanLink = jest.fn();
const mockGetPlan = jest.fn();
jest.mock('@/utils/playtimePlanner/planLinks', () => ({
  getPlanLink: (...args: unknown[]) => mockGetPlanLink(...args),
}));
jest.mock('@/utils/playtimePlanner/storage', () => ({
  ...jest.requireActual('@/utils/playtimePlanner/storage'),
  getPlan: (...args: unknown[]) => mockGetPlan(...args),
}));

/** Interpolating t, plural-blind - enough for these assertions. */
const t = ((key: string, fallback?: string | Record<string, unknown>, options?: Record<string, unknown>) => {
  const text = typeof fallback === 'string' ? fallback : key;
  const vars = (typeof fallback === 'object' ? fallback : options) ?? {};
  return text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars[name] ?? ''));
}) as unknown as TFunction;

const plan: PlaytimePlan = buildFirstPlan({
  team: { id: 'team-1', name: 'MePa P12' },
  players: Array.from({ length: 14 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` })),
  fieldSize: '8v8',
  gameType: 'soccer',
  ageGroup: 'U12',
  numberOfPeriods: 2,
  periodMinutes: 25,
  gameDate: '2026-11-22',
  opponentName: 'Rantakylän FC',
});

const upcoming = (overrides: Partial<HomeUpcomingGame> = {}): HomeUpcomingGame => ({
  id: 'game-1',
  opponent: 'Rantakylän FC',
  date: '2026-11-22',
  time: '10:00',
  mapsUrl: null,
  daysAway: 3,
  travel: null,
  teamName: 'MePa P12',
  squadCount: 14,
  ...overrides,
});

const lastPlayed: HomeResumeGame = {
  id: 'game-0',
  opponent: 'Joen Pallo',
  ourScore: 2,
  theirScore: 1,
  homeOrAway: 'home',
  isPlayed: true,
  date: '2026-11-15',
  mapsUrl: null,
};

const summary = (overrides: Partial<HomeSummary> = {}): HomeSummary => ({
  resume: null,
  lastPlayed: null,
  vuosi: null,
  recent: [],
  upcoming: upcoming(),
  upcomingList: [],
  counts: { players: 14, teams: 1, personnel: 0, seasons: 0, tournaments: 0 },
  countsReady: true,
  topScorer: null,
  playedCount: 0,
  ...overrides,
});

const handlers = () => ({
  onOpenGame: jest.fn(),
  onNewGame: jest.fn(),
  onOpenAttendance: jest.fn(),
  onShowPlan: jest.fn(),
  onOpenPlannerAt: jest.fn(),
  onOpenPlayers: jest.fn(),
  onLoadGame: jest.fn(),
  onViewStats: jest.fn(),
  onSwitchToFull: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlanLink.mockResolvedValue({ planId: plan.id, planGameId: plan.games[0].id });
  mockGetPlan.mockResolvedValue(plan);
});

describe('HomeBasic next-game card', () => {
  it('a game made from a plan: "Rotation ready · 14 players", Show rotation and Share', async () => {
    const h = handlers();
    render(<HomeBasic summary={summary()} {...h} locale="en" t={t} />);
    await waitFor(() => expect(screen.getByTestId('basic-plan-line')).toHaveTextContent('Rotation ready · 14 players'));
    expect(screen.getByText('MePa P12 – Rantakylän FC')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('basic-show-plan'));
    expect(h.onShowPlan).toHaveBeenCalledWith(plan.id, 'game-1');
    expect(screen.getByTestId('basic-share')).toBeInTheDocument();
  });

  it('before game day the primary action marks absences (save mode)', async () => {
    const h = handlers();
    render(<HomeBasic summary={summary()} {...h} locale="en" t={t} />);
    expect(screen.getByTestId('basic-primary')).toHaveTextContent('Mark who is away');
    fireEvent.click(screen.getByTestId('basic-primary'));
    expect(h.onOpenAttendance).toHaveBeenCalledWith('game-1', 'save');
    await waitFor(() => expect(screen.getByTestId('basic-show-plan')).toBeInTheDocument());
  });

  it('on game day it is "Start the match", which opens the sheet in start mode', async () => {
    const h = handlers();
    render(<HomeBasic summary={summary({ upcoming: upcoming({ daysAway: 0 }) })} {...h} locale="en" t={t} />);
    expect(screen.getByTestId('basic-primary')).toHaveTextContent('Start the match');
    fireEvent.click(screen.getByTestId('basic-primary'));
    expect(h.onOpenAttendance).toHaveBeenCalledWith('game-1', 'start');
    await waitFor(() => expect(screen.getByTestId('basic-show-plan')).toBeInTheDocument());
  });

  it('a game without a plan shows the squad only, no plan actions', async () => {
    mockGetPlanLink.mockResolvedValue(null);
    render(<HomeBasic summary={summary()} {...handlers()} locale="en" t={t} />);
    await waitFor(() => expect(mockGetPlanLink).toHaveBeenCalled());
    expect(screen.getByTestId('basic-plan-line')).toHaveTextContent('14 players');
    expect(screen.getByTestId('basic-plan-line')).not.toHaveTextContent('Rotation ready');
    expect(screen.queryByTestId('basic-show-plan')).not.toBeInTheDocument();
    expect(screen.queryByTestId('basic-share')).not.toBeInTheDocument();
  });

  it('a game from a multi-game plan opens the planner on its game', async () => {
    const multi = { ...plan, games: [plan.games[0], { ...plan.games[0], id: 'g2' }] };
    mockGetPlan.mockResolvedValue(multi);
    const h = handlers();
    render(<HomeBasic summary={summary()} {...h} locale="en" t={t} />);
    await waitFor(() => expect(screen.getByTestId('basic-show-plan')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('basic-show-plan'));
    expect(h.onOpenPlannerAt).toHaveBeenCalledWith(plan.id, plan.games[0].id);
    expect(h.onShowPlan).not.toHaveBeenCalled();
  });

  it('Share copies the plan text when the OS share sheet is missing', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<HomeBasic summary={summary()} {...handlers()} locale="en" t={t} />);
    await waitFor(() => expect(screen.getByTestId('basic-share')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('basic-share'));
    });
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('MePa P12 – Rantakylän FC');
    expect(text).toContain('Starting:');
    expect(text).toContain('(GK)');
    expect(text).toContain('Changes:');
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'success');
  });

  it('with no next game: the last result and New game', () => {
    const h = handlers();
    render(<HomeBasic summary={summary({ upcoming: null, lastPlayed, playedCount: 1 })} {...h} locale="en" t={t} />);
    const card = screen.getByTestId('basic-no-next-game');
    expect(card).toHaveTextContent('Joen Pallo');
    expect(card).toHaveTextContent('2–1');
    expect(card).toHaveTextContent('No next game yet');
    fireEvent.click(screen.getByTestId('basic-new-game'));
    expect(h.onNewGame).toHaveBeenCalled();
  });
});

describe('HomeBasic rows and Kaikki toiminnot', () => {
  it('shows the team row always, all games from the first game, statistics from the first played (R5, R13)', async () => {
    const h = handlers();
    const { rerender } = render(<HomeBasic summary={summary({ gameCount: 0 })} {...h} locale="en" t={t} />);
    expect(screen.getByTestId('basic-team-row')).toHaveTextContent('Team · 14 players');
    expect(screen.queryByTestId('basic-all-games-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('basic-stats-row')).not.toBeInTheDocument();
    // The team row is the player list (R4).
    fireEvent.click(screen.getByTestId('basic-team-row'));
    expect(h.onOpenPlayers).toHaveBeenCalledTimes(1);
    // One game booked, none played: "Kaikki ottelut" already, statistics not yet.
    rerender(<HomeBasic summary={summary({ gameCount: 1 })} {...h} locale="en" t={t} />);
    expect(screen.getByTestId('basic-all-games-row')).toHaveTextContent('All games · 1');
    expect(screen.queryByTestId('basic-stats-row')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('basic-all-games-row'));
    expect(h.onLoadGame).toHaveBeenCalledTimes(1);
    rerender(<HomeBasic summary={summary({ gameCount: 2, playedCount: 1 })} {...h} locale="en" t={t} />);
    expect(screen.getByTestId('basic-stats-row')).toHaveTextContent('Statistics · 1 games');
    await waitFor(() => expect(mockGetPlan).toHaveBeenCalled());
  });

  it('shows a permanent full-app line under the header that opens the All features sheet', () => {
    render(<HomeBasic summary={summary()} {...handlers()} locale="en" t={t} />);
    const line = screen.getByTestId('full-app-line');
    expect(line).toHaveTextContent('Simplified view · See the full app');
    fireEvent.click(line);
    expect(screen.getByTestId('all-features-sheet')).toBeInTheDocument();
  });

  it('Kaikki toiminnot closes from its close button and with Escape (R13)', async () => {
    render(<HomeBasic summary={summary()} {...handlers()} locale="en" t={t} />);
    fireEvent.click(screen.getByTestId('all-features'));
    fireEvent.click(screen.getByTestId('all-features-close'));
    expect(screen.queryByTestId('all-features-sheet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('all-features'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('all-features-sheet')).not.toBeInTheDocument();
    await waitFor(() => expect(mockGetPlan).toHaveBeenCalled());
  });

  it('Kaikki toiminnot lists what the full layout adds and switches to it', async () => {
    const h = handlers();
    render(<HomeBasic summary={summary()} {...h} locale="en" t={t} />);
    fireEvent.click(screen.getByTestId('all-features'));
    expect(screen.getByTestId('all-features-list').querySelectorAll('li').length).toBeGreaterThan(3);
    fireEvent.click(screen.getByTestId('switch-to-full'));
    expect(h.onSwitchToFull).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('all-features-sheet')).not.toBeInTheDocument();
    await waitFor(() => expect(mockGetPlan).toHaveBeenCalled());
  });
});

describe('HomeBasic card priorities (R2, R5, R12)', () => {
  /** @critical a match under way always wins the card */
  it('a match under way wins over the next game: "Jatka ottelua"', async () => {
    const h = handlers();
    const onResumeGame = jest.fn();
    const live: HomeResumeGame = { ...lastPlayed, id: 'live', inProgress: true, started: true };
    render(
      <HomeBasic summary={summary({ unfinished: live, resume: live })} {...h} onResumeGame={onResumeGame} locale="en" t={t} />,
    );
    expect(screen.queryByTestId('basic-next-game')).not.toBeInTheDocument();
    expect(screen.getByTestId('basic-new-game-secondary')).toBeInTheDocument();
    await waitFor(() => expect(mockGetPlan).toHaveBeenCalled());
  });

  it('a match under way that is not the current game opens by id', async () => {
    const h = handlers();
    const live: HomeResumeGame = { ...lastPlayed, id: 'other-live', inProgress: true, started: true };
    render(<HomeBasic summary={summary({ unfinished: live, resume: null })} {...h} locale="en" t={t} />);
    fireEvent.click(screen.getByRole('button', { name: /continue|jatka/i }));
    expect(h.onOpenGame).toHaveBeenCalledWith('other-live');
    await waitFor(() => expect(mockGetPlan).toHaveBeenCalled());
  });

  /** @critical a game that never kicked off is never "Viimeisin peli 0-0" */
  it('a past game that never started keeps the card: move it or remove it', async () => {
    const h = handlers();
    const onMoveGameDate = jest.fn().mockResolvedValue(true);
    const onDeleteGame = jest.fn().mockResolvedValue(true);
    render(
      <HomeBasic
        summary={summary({ upcoming: null, overdue: upcoming({ daysOverdue: 4, daysAway: 0 }) })}
        {...h}
        onMoveGameDate={onMoveGameDate}
        onDeleteGame={onDeleteGame}
        today="2026-11-26"
        locale="en"
        t={t}
      />,
    );
    const card = screen.getByTestId('basic-next-game');
    expect(card).toHaveTextContent('4 d ago');
    expect(screen.queryByTestId('basic-primary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('basic-no-next-game')).not.toBeInTheDocument();

    // Move: the editor starts on today and saves the picked day.
    fireEvent.click(screen.getByTestId('basic-move-date'));
    const input = screen.getByTestId('basic-move-date-input') as HTMLInputElement;
    expect(input.value).toBe('2026-11-26');
    fireEvent.change(input, { target: { value: '2026-11-29' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('basic-move-date-save'));
    });
    expect(onMoveGameDate).toHaveBeenCalledWith('game-1', '2026-11-29');
    await waitFor(() => expect(screen.queryByTestId('basic-move-date-form')).not.toBeInTheDocument());

    // Remove: only after the confirm.
    fireEvent.click(screen.getByTestId('basic-delete-game'));
    expect(onDeleteGame).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    });
    expect(onDeleteGame).toHaveBeenCalledWith('game-1');
  });

  it('a resumable game that never started is not shown as the last result', async () => {
    const notStarted: HomeResumeGame = { ...lastPlayed, id: 'fresh', ourScore: 0, theirScore: 0, started: false };
    render(<HomeBasic summary={summary({ upcoming: null, resume: notStarted, lastPlayed })} {...handlers()} locale="en" t={t} />);
    expect(screen.getByTestId('basic-no-next-game')).toHaveTextContent('Joen Pallo');
    expect(screen.getByTestId('basic-no-next-game')).not.toHaveTextContent('0–0');
  });

  it('no players yet: "Add players" takes a pasted list and creates it', async () => {
    const onAddPlayers = jest.fn().mockResolvedValue(3);
    render(
      <HomeBasic
        summary={summary({ upcoming: null, counts: { players: 0, teams: 1, personnel: 0, seasons: 0, tournaments: 0 } })}
        {...handlers()}
        onAddPlayers={onAddPlayers}
        locale="en"
        t={t}
      />,
    );
    fireEvent.change(screen.getByTestId('basic-add-players-input'), { target: { value: '1. Onni\n#12 Toivo\nAatos' } });
    expect(screen.getByTestId('basic-add-players-count')).toHaveTextContent('3 players added');
    await act(async () => {
      fireEvent.click(screen.getByTestId('basic-add-players-submit'));
    });
    expect(onAddPlayers).toHaveBeenCalledWith(['Onni', 'Toivo', 'Aatos']);
  });

  it('after a partial failure only the names not yet created stay', async () => {
    const onAddPlayers = jest.fn().mockResolvedValue(1);
    render(
      <HomeBasic
        summary={summary({ upcoming: null, counts: { players: 0, teams: 1, personnel: 0, seasons: 0, tournaments: 0 } })}
        {...handlers()}
        onAddPlayers={onAddPlayers}
        locale="en"
        t={t}
      />,
    );
    fireEvent.change(screen.getByTestId('basic-add-players-input'), { target: { value: 'Onni\nToivo' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('basic-add-players-submit'));
    });
    expect((screen.getByTestId('basic-add-players-input') as HTMLTextAreaElement).value).toBe('Toivo');
  });
});
