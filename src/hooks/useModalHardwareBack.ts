/**
 * Hardware-back contract for lifted modals (two-level restructure, modal
 * governance rule): pressing the device/browser back button while a lifted
 * modal is open must CLOSE THE MODAL - never exit the app, never reveal the
 * screen underneath unexpectedly.
 *
 * Mechanism: when the modal opens, push one history entry; a popstate while
 * open means the user pressed back - close the modal (the entry is already
 * consumed). When the modal is closed through its own UI instead, consume
 * our entry with history.back() so the stack never accumulates ghosts.
 */
import { useEffect, useRef } from 'react';

export function useModalHardwareBack(isOpen: boolean, onClose: () => void): void {
  const pushedRef = useRef(false);
  const closingViaPopRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ liftedModal: true }, '');
    pushedRef.current = true;

    const onPop = () => {
      // Back pressed while open: the entry is consumed by the browser.
      pushedRef.current = false;
      closingViaPopRef.current = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      if (pushedRef.current) {
        // Closed via the modal's own UI: consume our history entry so the
        // NEXT back press doesn't need two taps.
        pushedRef.current = false;
        window.history.back();
      }
      closingViaPopRef.current = false;
    };
  }, [isOpen]);
}

export default useModalHardwareBack;
