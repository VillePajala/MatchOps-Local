/**
 * Hardware-back contract for lifted modals (two-level restructure, modal
 * governance rule): pressing the device/browser back button while lifted
 * modals are open must close ONLY THE TOPMOST one - never exit the app,
 * never close modals underneath.
 *
 * Mechanism: each open modal pushes one history entry and registers itself
 * on a module-level stack. A single shared popstate listener closes only
 * the most recently opened modal (its history entry is already consumed by
 * the browser's back action). When a modal is closed through its own UI
 * instead, it removes itself from the stack and consumes its history entry
 * with history.back(); the popstate that programmatic back() fires is
 * counted and swallowed so it cannot close another modal.
 */
import { useEffect, useRef } from 'react';

type StackEntry = { close: () => void };

const modalStack: StackEntry[] = [];
let suppressedPops = 0;
let listenerAttached = false;

function handleGlobalPop(): void {
  if (suppressedPops > 0) {
    suppressedPops -= 1;
    return;
  }
  const topmost = modalStack.pop();
  topmost?.close();
}

/** Test-only: clears module-level stack state between test cases. */
export function __resetModalHardwareBackForTests(): void {
  modalStack.length = 0;
  suppressedPops = 0;
}

export function useModalHardwareBack(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    // Attached once, never removed: detaching while a suppressed pop is
    // still in flight would leak the suppression count into the next open.
    if (!listenerAttached) {
      window.addEventListener('popstate', handleGlobalPop);
      listenerAttached = true;
    }

    const entry: StackEntry = { close: () => onCloseRef.current() };
    window.history.pushState({ liftedModal: true }, '');
    modalStack.push(entry);

    return () => {
      const index = modalStack.indexOf(entry);
      if (index !== -1) {
        // Closed via the modal's own UI: consume our history entry so the
        // NEXT back press doesn't need two taps.
        modalStack.splice(index, 1);
        suppressedPops += 1;
        window.history.back();
      }
      // index === -1 means a hardware back press closed this modal - both
      // the stack entry and the history entry were consumed already.
    };
  }, [isOpen]);
}

export default useModalHardwareBack;
