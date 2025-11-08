import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ModalProvider } from '@/contexts/ModalProvider';
import { useHomeModalControls } from './useHomeModalControls';

describe('useHomeModalControls', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ModalProvider>{children}</ModalProvider>
  );

  it('opens load game modal when initial action is loadGame', () => {
    const { result } = renderHook(() =>
      useHomeModalControls({
        initialAction: 'loadGame',
      }), { wrapper });

    // The hook should have triggered the load game modal to open
    expect(result.current.modalState.isLoadGameModalOpen).toBe(true);
  });

  it('exposes helper to open roster modal', () => {
    const { result } = renderHook(() =>
      useHomeModalControls({}), { wrapper });

    act(() => {
      result.current.openRosterModal();
    });

    expect(result.current.modalState.isRosterModalOpen).toBe(true);
  });
});
