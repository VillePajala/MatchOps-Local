/**
 * @jest-environment jsdom
 * @critical - Escape is the keyboard user's only way out of most of these
 * modals, and the `enabled` guard is what stops one keypress closing a nested
 * confirm and its parent together.
 */
import { renderHook } from '@testing-library/react';
import { useEscapeToClose } from './useEscapeToClose';

const pressEscape = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

describe('useEscapeToClose', () => {
  it('closes on Escape while open', () => {
    const onClose = jest.fn();
    renderHook(() => useEscapeToClose(true, onClose));
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while closed', () => {
    const onClose = jest.fn();
    renderHook(() => useEscapeToClose(false, onClose));
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  /** A child owning the key - a nested confirm, an open dropdown. */
  it('stands down when disabled', () => {
    const onClose = jest.fn();
    renderHook(() => useEscapeToClose(true, onClose, false));
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const onClose = jest.fn();
    renderHook(() => useEscapeToClose(true, onClose));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  /** A listener left behind would close a modal that is no longer on screen. */
  it('removes its listener on unmount', () => {
    const onClose = jest.fn();
    const { unmount } = renderHook(() => useEscapeToClose(true, onClose));
    unmount();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes its listener when the modal closes', () => {
    const onClose = jest.fn();
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) => useEscapeToClose(open, onClose),
      { initialProps: { open: true } },
    );
    rerender({ open: false });
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });
});
