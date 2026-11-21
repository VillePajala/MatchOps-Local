/**
 * Opening a game: a quick open must not flash the branded loading screen;
 * a genuinely slow one still shows it (owner, 2026-11-21).
 * @critical
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';

let mockBootstrapping = true;

jest.mock('@/components/HomePage/hooks/useGameOrchestration', () => ({
  useGameOrchestration: () => ({
    gameContainerProps: {},
    modalManagerProps: {},
    isBootstrapping: mockBootstrapping,
  }),
}));
jest.mock('@/components/HomePage/containers/GameContainer', () => ({
  GameContainer: () => <div data-testid="game-container" />,
}));
jest.mock('@/components/HomePage/containers/ModalManager', () => ({
  ModalManager: () => null,
}));
jest.mock('@/components/LoadingScreen', () => ({
  LoadingScreen: ({ message }: { message: string }) => <div data-testid="branded-loader">{message}</div>,
}));
jest.mock('@/contexts/ModalProvider', () => ({
  useModalContext: () => ({ isAppResetting: false }),
}));
jest.mock('@/hooks/useAssessmentRatingStyle', () => ({ useAssessmentRatingStyle: () => 'words' }));
jest.mock('@/hooks/useAssessmentTemplate', () => ({ useAssessmentTemplate: () => undefined }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string) => fallback }),
}));

import HomePage from '@/components/HomePage';

const noProps = {} as React.ComponentProps<typeof HomePage>;

describe('HomePage game-open loader', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockBootstrapping = true;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows only the plain canvas while a game opens quickly', () => {
    const { container, rerender } = render(<HomePage {...noProps} />);
    expect(screen.queryByTestId('branded-loader')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

    act(() => { jest.advanceTimersByTime(300); });
    mockBootstrapping = false;
    rerender(<HomePage {...noProps} />);
    expect(screen.queryByTestId('branded-loader')).toBeNull();
    expect(screen.getByTestId('game-container')).toBeInTheDocument();
  });

  it('shows the branded loader when opening takes longer than the threshold', () => {
    render(<HomePage {...noProps} />);
    expect(screen.queryByTestId('branded-loader')).toBeNull();
    act(() => { jest.advanceTimersByTime(500); });
    expect(screen.getByTestId('branded-loader')).toHaveTextContent('Loading Game Data...');
  });

  it('does not reuse a slow-loader state on the next open', () => {
    const { rerender } = render(<HomePage {...noProps} />);
    act(() => { jest.advanceTimersByTime(500); });
    expect(screen.getByTestId('branded-loader')).toBeInTheDocument();

    mockBootstrapping = false;
    rerender(<HomePage {...noProps} />);
    mockBootstrapping = true;
    rerender(<HomePage {...noProps} />);
    expect(screen.queryByTestId('branded-loader')).toBeNull();
  });
});
