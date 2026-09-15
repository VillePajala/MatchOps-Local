'use client';

import { useEffect } from 'react';

/**
 * Close a modal on Escape.
 *
 * WHY THIS EXISTS. Eleven of the app's thirty-one modals handled Escape and
 * twenty did not, because each one that did had hand-rolled the same effect -
 * add a keydown listener, check the key, call onClose, remove the listener.
 * An eight-line ritual nobody repeats thirty-one times, so most modals simply
 * went without, and whether Escape works became a coin flip.
 *
 * Deliberately only Escape. Focus trapping is `useFocusTrap`, and hardware
 * back is `useModalHardwareBack` - three separate concerns that happen to
 * arrive together, and folding them into one hook would force every caller to
 * take all three whether they can support them or not.
 *
 * @param isOpen  whether the modal is showing; the listener is removed when not
 * @param onClose what Escape should do
 * @param enabled set false to stand down while a CHILD owns the key - a nested
 *                confirm, an open dropdown, an editor mid-edit. Without this a
 *                single Escape closes the child AND its parent, which reads as
 *                the app losing your place.
 *
 * @module useEscapeToClose
 * @category Hooks
 */
export function useEscapeToClose(
  isOpen: boolean,
  onClose: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!isOpen || !enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, enabled]);
}

export default useEscapeToClose;
