import React from 'react';
import { render, fireEvent, screen } from '../../utils/test-utils';
import { useModalContext } from '@/contexts/ModalProvider';

const TestConsumer: React.FC = () => {
  const {
    isLoadGameModalOpen,
    setIsLoadGameModalOpen,
    isNewGameSetupModalOpen,
    setIsNewGameSetupModalOpen,
  } = useModalContext();
  return (
    <div>
      <div data-testid="load-state">{String(isLoadGameModalOpen)}</div>
      <button data-testid="open-load" onClick={() => setIsLoadGameModalOpen(true)}>open-load</button>
      <button data-testid="close-load" onClick={() => setIsLoadGameModalOpen(false)}>close-load</button>

      <div data-testid="new-state">{String(isNewGameSetupModalOpen)}</div>
      <button data-testid="open-new" onClick={() => setIsNewGameSetupModalOpen(true)}>open-new</button>
      <button data-testid="close-new" onClick={() => setIsNewGameSetupModalOpen(false)}>close-new</button>
    </div>
  );
};

describe('Modal anti-flash guard (ignore immediate close after open)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2025-01-01T00:00:00.000Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('Load Game: immediate close is ignored, later close succeeds', () => {
    render(<TestConsumer />);
    const openBtn = screen.getByTestId('open-load');
    const closeBtn = screen.getByTestId('close-load');

    fireEvent.click(openBtn);
    expect(screen.getByTestId('load-state').textContent).toBe('true');

    // Immediate close attempt should be ignored
    fireEvent.click(closeBtn);
    expect(screen.getByTestId('load-state').textContent).toBe('true');

    // Advance clock beyond guard window
    jest.setSystemTime(new Date('2025-01-01T00:00:00.300Z'));
    fireEvent.click(closeBtn);
    expect(screen.getByTestId('load-state').textContent).toBe('false');
  });

  it('New Game Setup: immediate close is ignored, later close succeeds', () => {
    render(<TestConsumer />);
    const openBtn = screen.getByTestId('open-new');
    const closeBtn = screen.getByTestId('close-new');

    fireEvent.click(openBtn);
    expect(screen.getByTestId('new-state').textContent).toBe('true');

    fireEvent.click(closeBtn);
    expect(screen.getByTestId('new-state').textContent).toBe('true');

    jest.setSystemTime(new Date('2025-01-01T00:00:00.300Z'));
    fireEvent.click(closeBtn);
    expect(screen.getByTestId('new-state').textContent).toBe('false');
  });
});

