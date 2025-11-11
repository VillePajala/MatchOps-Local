// Prevent i18n/storage side-effects (IndexedDB) during this focused test
// Quieten environment-level IndexedDB bootstrap noise in this focused test
// (setupTests installs strict console handlers; replace with no-op here)
// eslint-disable-next-line no-console
// @ts-ignore - test override
console.error = jest.fn();

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { isInitialized: true, language: 'en', changeLanguage: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/utils/storage', () => {
  const actual = jest.requireActual('@/utils/storage');
  return {
    ...actual,
    getStorageJSON: jest.fn(async (_key: string, opts?: any) => opts?.defaultValue ?? null),
  };
});

import React, { useEffect, useState } from 'react';
import { render, fireEvent, act } from '../../utils/test-utils';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useModalContext, ModalProvider } from '@/contexts/ModalProvider';
import { DEFAULT_GAME_ID } from '@/config/constants';

// A minimal test component that uses the real ModalProvider and the real useAutoSave
// It exposes buttons to toggle modal state and to change metadata
const TestAutoSaveWithModal: React.FC<{ onSave: jest.Mock; startWithOpen?: boolean }> = ({ onSave, startWithOpen = false }) => {
  const { isLoadGameModalOpen, setIsLoadGameModalOpen, isNewGameSetupModalOpen } = useModalContext();
  const [meta, setMeta] = useState({ teamName: 'Team A', opponentName: 'Opp A', gameNotes: '' });

  // Optionally open on mount to simulate opening before any change occurs
  useEffect(() => {
    if (startWithOpen) setIsLoadGameModalOpen(true);
  }, [startWithOpen, setIsLoadGameModalOpen]);

  const currentGameId: string = 'game_test_enabled_guard'; // treat as a real saved game (not DEFAULT)

  useAutoSave({
    short: { states: { teamName: meta.teamName, opponentName: meta.opponentName, gameNotes: meta.gameNotes }, delay: 50 },
    saveFunction: onSave,
    enabled: currentGameId !== DEFAULT_GAME_ID && !(isLoadGameModalOpen || isNewGameSetupModalOpen),
    currentGameId,
  });

  return (
    <div>
      <button data-testid="toggle-load" onClick={() => setIsLoadGameModalOpen(!isLoadGameModalOpen)}>toggle-load</button>
      <button data-testid="change-meta" onClick={() => setMeta(m => ({ ...m, teamName: m.teamName + '!' }))}>change-meta</button>
    </div>
  );
};

describe('useAutoSave modal guard (regression)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('does not save while a blocking modal is open; resumes after closing', () => {
    const onSave = jest.fn();

    const { getByTestId } = render(
      <ModalProvider>
        <TestAutoSaveWithModal onSave={onSave} />
      </ModalProvider>
    );

    // 1) Change metadata once while closed → schedule save
    act(() => { fireEvent.click(getByTestId('change-meta')); });

    // 2) Open the blocking modal immediately before timer fires
    act(() => { fireEvent.click(getByTestId('toggle-load')); });

    // 3) Advance timers beyond short delay; pending save should be canceled when disabled
    act(() => { jest.advanceTimersByTime(200); });
    expect(onSave).not.toHaveBeenCalled();

    // 4) Close the modal and change metadata again → should save now
    act(() => { fireEvent.click(getByTestId('toggle-load')); });
    act(() => { fireEvent.click(getByTestId('change-meta')); });
    act(() => { jest.advanceTimersByTime(200); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
