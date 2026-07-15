import { renderHook, act, render, screen, fireEvent } from '@testing-library/react';
import { ModalProvider, useModalContext } from '../ModalProvider';
import React from 'react';

test('modal context toggles state', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ModalProvider>{children}</ModalProvider>
  );
  const { result } = renderHook(() => useModalContext(), { wrapper });

  act(() => {
    result.current.setIsGameSettingsModalOpen(true);
    result.current.setIsPlayerAssessmentModalOpen(true);
  });

  expect(result.current.isGameSettingsModalOpen).toBe(true);
  expect(result.current.isPlayerAssessmentModalOpen).toBe(true);
});

test('modals operate independently when opened sequentially', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ModalProvider>{children}</ModalProvider>
  );
  const { result } = renderHook(() => useModalContext(), { wrapper });

  act(() => {
    result.current.setIsGameSettingsModalOpen(true);
    result.current.setIsLoadGameModalOpen(true);
    result.current.setIsPlayerAssessmentModalOpen(true);
  });

  expect(result.current.isGameSettingsModalOpen).toBe(true);
  expect(result.current.isLoadGameModalOpen).toBe(true);
  expect(result.current.isPlayerAssessmentModalOpen).toBe(true);

  act(() => {
    result.current.setIsGameSettingsModalOpen(false);
    result.current.setIsRosterModalOpen(true);
    result.current.setIsSeasonTournamentModalOpen(true);
  });

  expect(result.current.isGameSettingsModalOpen).toBe(false);
  expect(result.current.isLoadGameModalOpen).toBe(true);
  expect(result.current.isRosterModalOpen).toBe(true);
  expect(result.current.isSeasonTournamentModalOpen).toBe(true);
  expect(result.current.isPlayerAssessmentModalOpen).toBe(true);
});

test('supports function updater form for new game setup modal', () => {
  jest.useFakeTimers({ now: new Date('2025-01-01T00:00:00.000Z') });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ModalProvider>{children}</ModalProvider>
  );
  const { result } = renderHook(() => useModalContext(), { wrapper });

  act(() => {
    result.current.setIsNewGameSetupModalOpen(prev => !prev);
  });
  expect(result.current.isNewGameSetupModalOpen).toBe(true);

  // Advance beyond anti-flash window before closing
  jest.setSystemTime(new Date('2025-01-01T00:00:00.300Z'));
  act(() => {
    result.current.setIsNewGameSetupModalOpen(prev => !prev);
  });
  expect(result.current.isNewGameSetupModalOpen).toBe(false);
  jest.useRealTimers();
});

test('supports function updater form for roster modal', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ModalProvider>{children}</ModalProvider>
  );
  const { result } = renderHook(() => useModalContext(), { wrapper });

  act(() => {
    result.current.setIsRosterModalOpen(prev => !prev);
  });
  expect(result.current.isRosterModalOpen).toBe(true);

  act(() => {
    result.current.setIsRosterModalOpen(prev => !prev);
  });
  expect(result.current.isRosterModalOpen).toBe(false);
});

test('clubStatsInitialTab is set by openClubStatsToTab and CLEARED on close (no stale tab on reopen)', () => {
  // L.4: "Team stats" targets the club-stats surface. Close must clear the
  // tab so a plain reopen lands on the surface's own default.
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ModalProvider>{children}</ModalProvider>
  );
  const { result } = renderHook(() => useModalContext(), { wrapper });

  act(() => {
    result.current.openClubStatsToTab('season');
  });
  expect(result.current.isClubStatsOpen).toBe(true);
  expect(result.current.clubStatsInitialTab).toBe('season');

  act(() => {
    result.current.setIsClubStatsOpen(false);
  });
  expect(result.current.isClubStatsOpen).toBe(false);
  expect(result.current.clubStatsInitialTab).toBeUndefined();

  // Plain reopen keeps the default landing.
  act(() => {
    result.current.setIsClubStatsOpen(true);
  });
  expect(result.current.isClubStatsOpen).toBe(true);
  expect(result.current.clubStatsInitialTab).toBeUndefined();
});

test('match stats and club stats are mutually exclusive (L.4 - same component, same z-index)', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ModalProvider>{children}</ModalProvider>
  );
  const { result } = renderHook(() => useModalContext(), { wrapper });

  act(() => {
    result.current.setIsGameStatsModalOpen(true);
  });
  act(() => {
    result.current.openClubStatsToTab('season');
  });
  expect(result.current.isClubStatsOpen).toBe(true);
  expect(result.current.isGameStatsModalOpen).toBe(false);

  act(() => {
    result.current.setIsGameStatsModalOpen(true);
  });
  expect(result.current.isGameStatsModalOpen).toBe(true);
  expect(result.current.isClubStatsOpen).toBe(false);
});

test('sign-out closes the planner (L.3c - replaces the PLANNER_OPEN_KEY cleanup)', () => {
  function PlannerProbe() {
    const { isPlaytimePlannerOpen, setIsPlaytimePlannerOpen } = useModalContext();
    return (
      <>
        <div data-testid="planner-state">{isPlaytimePlannerOpen ? 'open' : 'closed'}</div>
        <button onClick={() => setIsPlaytimePlannerOpen(true)}>open-planner</button>
      </>
    );
  }
  const { rerender } = render(
    <ModalProvider currentUserId="user-1"><PlannerProbe /></ModalProvider>,
  );
  fireEvent.click(screen.getByText('open-planner'));
  expect(screen.getByTestId('planner-state')).toHaveTextContent('open');

  // The user signs out (userId gone): the provider closes the planner so it
  // cannot auto-reopen over Home after the next sign-in.
  rerender(<ModalProvider currentUserId={undefined}><PlannerProbe /></ModalProvider>);
  expect(screen.getByTestId('planner-state')).toHaveTextContent('closed');
});
