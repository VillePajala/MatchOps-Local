/**
 * Hardware-back contract for lifted modals (two-level restructure, modal
 * governance rule): pressing the device/browser back button while lifted
 * modals are open must close ONLY THE TOPMOST one - never exit the app,
 * never close modals underneath.
 *
 * Mechanism (single-sentinel, walkthrough fix W7/W9): the app keeps at most
 * ONE guard history entry, pushed when the registration stack goes 0 -> 1
 * and consumed when it returns to 0. A hardware back consumes the sentinel,
 * closes the topmost registered surface, and RE-PUSHES the sentinel if
 * anything is still open.
 *
 * The previous design paired one history entry with every open modal; a
 * forced close (mutual exclusion, exclusive swaps) or a UI close in the
 * same tick as another open interleaved `history.back()` with `pushState`,
 * which races on Android WebViews and desynchronized the entry count -
 * symptoms: back landing on the wrong surface, then the NEXT back closing
 * the whole app. With a single sentinel the count can never drift by more
 * than the one entry we own.
 */
import { useEffect, useRef } from 'react';

type StackEntry = { close: () => void };

const modalStack: StackEntry[] = [];
let suppressedPops = 0;
let sentinelPushed = false;
let listenerAttached = false;

function pushSentinel(): void {
  window.history.pushState({ liftedModal: true }, '');
  sentinelPushed = true;
}

function handleGlobalPop(): void {
  if (suppressedPops > 0) {
    suppressedPops -= 1;
    return;
  }
  if (!sentinelPushed) return; // not our entry - let the navigation happen
  // The browser consumed our sentinel with this back press.
  sentinelPushed = false;
  const topmost = modalStack.pop();
  topmost?.close();
  // Something is still open beneath - re-arm the guard so the NEXT back
  // press comes to us instead of leaving the app.
  if (modalStack.length > 0) {
    pushSentinel();
  }
}

/** Test-only: clears module-level stack state between test cases. */
export function __resetModalHardwareBackForTests(): void {
  modalStack.length = 0;
  suppressedPops = 0;
  sentinelPushed = false;
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
    modalStack.push(entry);
    if (!sentinelPushed) {
      pushSentinel();
    }

    return () => {
      const index = modalStack.indexOf(entry);
      if (index !== -1) {
        // Closed via the surface's own UI (or force-closed by state):
        // remove the registration. Only when NOTHING is left open do we
        // consume the sentinel - and never in the same tick as another
        // surface opening, because that open re-uses the live sentinel.
        modalStack.splice(index, 1);
        if (modalStack.length === 0 && sentinelPushed) {
          sentinelPushed = false;
          suppressedPops += 1;
          window.history.back();
        }
      }
      // index === -1 means a hardware back press closed this surface - the
      // pop handler already did the bookkeeping.
    };
  }, [isOpen]);
}

export default useModalHardwareBack;
