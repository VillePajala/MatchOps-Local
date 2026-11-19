/**
 * Basic Home's "Uusi ottelu" flow (review R1, R3, R10): the short next-game
 * step built from the account's own team, then the plan screen.
 * @critical
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NextGameFlow from '../NextGameFlow';
import { __resetModalHardwareBackForTests } from '@/hooks/useModalHardwareBack';
import { writeNextGameStepDraft, readNextGameStepDraft } from '@/utils/nextGameStepDraft';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const fb = typeof fallback === 'string' ? fallback : key;
      const vars = (typeof fallback === 'object' ? (fallback as Record<string, unknown>) : opts) ?? {};
      return fb.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars[name] ?? ''));
    },
  }),
}));
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { language: 'en', changeLanguage: jest.fn(), isInitialized: true, on: jest.fn(), off: jest.fn() },
  saveLanguagePreference: jest.fn(),
}));
const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const mockCreateNextGamePair = jest.fn();
jest.mock('@/services/nextGamePair', () => ({
  createNextGamePair: (...args: unknown[]) => mockCreateNextGamePair(...args),
}));
jest.mock('@/components/HomePage/utils/newGameHandlers', () => ({ buildAndPersistNewGame: jest.fn() }));
jest.mock('@/utils/playtimePlanner/storage', () => ({
  savePlan: jest.fn(),
  deletePlan: jest.fn(),
  getPlans: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/utils/savedGames', () => ({
  saveGame: jest.fn(),
  getSavedGames: jest.fn().mockResolvedValue({
    g1: { teamId: 'team-1', teamName: 'MePa P12', gameDate: '2026-11-15', numberOfPeriods: 2, periodDurationMinutes: 25 },
  }),
}));
jest.mock('@/utils/appSettings', () => ({ saveCurrentGameIdSetting: jest.fn() }));
jest.mock('@/utils/masterRosterManager', () => ({
  getMasterRoster: jest.fn().mockResolvedValue([
    { id: 'p1', name: 'Onni' },
    { id: 'p2', name: 'Toivo' },
  ]),
}));
jest.mock('@/utils/teams', () => ({
  getTeams: jest.fn().mockResolvedValue([
    { id: 'team-1', name: 'MePa P12', ageGroup: 'U12', createdAt: '', updatedAt: '' },
  ]),
  getAllTeamRosters: jest.fn().mockResolvedValue({}),
}));
const mockRecordMilestone = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/onboardingMilestones', () => ({
  recordMilestone: (...args: unknown[]) => mockRecordMilestone(...args),
}));
jest.mock('../PlanQuickView', () => ({
  __esModule: true,
  default: ({ onDone }: { onDone: () => void }) => (
    <button type="button" data-testid="plan-quick-view-mock" onClick={onDone}>
      plan-done
    </button>
  ),
}));

const renderFlow = (props: Partial<React.ComponentProps<typeof NextGameFlow>> = {}) => {
  const onClose = jest.fn();
  const onMoreSettings = jest.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextGameFlow userId="u1" onClose={onClose} onMoreSettings={onMoreSettings} {...props} />
    </QueryClientProvider>,
  );
  return { onClose, onMoreSettings };
};

let backSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  __resetModalHardwareBackForTests();
  backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  mockCreateNextGamePair.mockResolvedValue({ gameId: 'game-2', planId: 'plan-2', planGameId: 'pg-2' });
});
afterEach(() => backSpy.mockRestore());

const pressBack = () =>
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

describe('NextGameFlow from basic Home', () => {
  it("builds the game from the account's team, players and last game length (R1)", async () => {
    const { onClose } = renderFlow();
    expect(await screen.findByTestId('next-game-step')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('next-game-date-today'));
    fireEvent.click(screen.getByTestId('next-game-submit'));
    expect(await screen.findByTestId('plan-quick-view-mock')).toBeInTheDocument();
    const [, input] = mockCreateNextGamePair.mock.calls[0];
    expect(input).toMatchObject({
      team: { id: 'team-1', name: 'MePa P12' },
      ageGroup: 'U12',
      numberOfPeriods: 2,
      periodMinutes: 25,
      opponentName: 'Opponent',
    });
    expect(input.players.map((p: { id: string }) => p.id)).toEqual(['p1', 'p2']);
    expect(mockRecordMilestone).toHaveBeenCalledWith('firstPlanSeen', 'u1');
    // R10: back from the plan screen goes Home.
    pressBack();
    expect(onClose).toHaveBeenCalledWith('planned');
  });

  it('reopens with the answers kept before a reload (R3)', async () => {
    writeNextGameStepDraft('u1', { gameDate: '2026-12-24', opponent: 'Rantakylä' });
    renderFlow();
    await screen.findByTestId('next-game-step');
    expect(screen.getByTestId('next-game-opponent')).toHaveValue('Rantakylä');
    expect(screen.getByTestId('next-game-submit')).toBeEnabled();
  });

  it('back from the date step goes Home and forgets the step (R10)', async () => {
    const { onClose } = renderFlow();
    await screen.findByTestId('next-game-step');
    expect(readNextGameStepDraft('u1')).not.toBeNull();
    pressBack();
    expect(onClose).toHaveBeenCalledWith('skipped');
    expect(readNextGameStepDraft('u1')).toBeNull();
  });

  it('"More settings" hands over to the full New Game form', async () => {
    const { onMoreSettings, onClose } = renderFlow();
    await screen.findByTestId('next-game-step');
    fireEvent.click(screen.getByTestId('next-game-more-settings'));
    expect(onMoreSettings).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(readNextGameStepDraft('u1')).toBeNull();
  });

  it('with nobody to plan for it says so and goes back Home', async () => {
    const { getMasterRoster } = jest.requireMock('@/utils/masterRosterManager') as { getMasterRoster: jest.Mock };
    getMasterRoster.mockResolvedValueOnce([]);
    const { onClose } = renderFlow();
    expect(await screen.findByTestId('next-game-flow-failed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Back to Home'));
    expect(onClose).toHaveBeenCalledWith('skipped');
    await waitFor(() => expect(readNextGameStepDraft('u1')).toBeNull());
  });
});
