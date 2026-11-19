/**
 * The basic layout's Home (Perusnäkymä, Onboarding v3): the next-game card in
 * its states, the rows that appear with data, and "Kaikki toiminnot".
 * @critical
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  onManageTeams: jest.fn(),
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
  it('shows the team row always, played games from the first, statistics from the third', async () => {
    const { rerender } = render(<HomeBasic summary={summary()} {...handlers()} locale="en" t={t} />);
    expect(screen.getByTestId('basic-team-row')).toHaveTextContent('Team · 14 players');
    expect(screen.queryByTestId('basic-played-row')).not.toBeInTheDocument();
    rerender(<HomeBasic summary={summary({ playedCount: 1 })} {...handlers()} locale="en" t={t} />);
    expect(screen.getByTestId('basic-played-row')).toHaveTextContent('Played games · 1');
    expect(screen.queryByTestId('basic-stats-row')).not.toBeInTheDocument();
    rerender(<HomeBasic summary={summary({ playedCount: 3 })} {...handlers()} locale="en" t={t} />);
    expect(screen.getByTestId('basic-stats-row')).toBeInTheDocument();
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
