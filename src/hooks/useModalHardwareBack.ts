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

// close() may return `true` to mean "handled internally, keep me on the
// stack" (e.g. a modal with sub-views: back steps a view instead of
// closing). Any other return (void/false) closes normally. This lets ONE
// entry own a multi-level back without a second, desync-prone entry.
type StackEntry = { close: () => void | boolean };

const modalStack: StackEntry[] = [];
let suppressedPops = 0;
let sentinelPushed = false;
let listenerAttached = false;
let handlingHardwareBack = false;

/** True while a popstate-driven close() is executing. ModalProvider's
 *  anti-flash guards check this to NEVER swallow a hardware-back close -
 *  a swallowed close leaves the modal open with its stack entry and
 *  sentinel already consumed, so the next back exits the app underneath
 *  an open modal (deep-review Issue 4). */
export function isHandlingHardwareBack(): boolean {
  return handlingHardwareBack;
}

function pushSentinel(): void {
  window.history.pushState({ liftedModal: true }, '');
  sentinelPushed = true;
}

let reArmTimer: ReturnType<typeof setTimeout> | null = null;

function reArmSentinel(): void {
  // Re-arm the guard AFTER the history traversal fully settles - as a MACRO
  // task (setTimeout), not a microtask.
  //
  // Why not synchronous, and why not a microtask: on Android WebViews the
  // popstate handler runs as part of the back-navigation task, and the
  // history stays "mid-traversal" through the end of that task - which
  // includes the microtask checkpoint. A pushState issued synchronously OR
  // in a queueMicrotask is silently dropped there, so no trap entry is
  // created and the NEXT back exits the app (owner-reported twice: planner
  // plan -> manager -> exit, with both the sync and the microtask version).
  // A setTimeout(0) runs in a fresh task after the traversal has committed,
  // where pushState reliably creates the entry - and still fires ~immediately,
  // long before any human's next tap.
  if (reArmTimer !== null) clearTimeout(reArmTimer);
  reArmTimer = setTimeout(() => {
    reArmTimer = null;
    if (modalStack.length > 0 && !sentinelPushed) pushSentinel();
  }, 0);
}

function handleGlobalPop(): void {
  if (suppressedPops > 0) {
    suppressedPops -= 1;
    return;
  }
  if (!sentinelPushed) return; // not our entry - let the navigation happen
  // The browser consumed our sentinel with this back press.
  sentinelPushed = false;
  // Peek, not pop: if close() returns true it handled the back internally
  // (e.g. stepped a sub-view) and stays open - keep its entry so the NEXT
  // back reaches it again instead of falling through to the app.
  const topmost = modalStack[modalStack.length - 1];
  handlingHardwareBack = true;
  let keepOpen = false;
  try {
    keepOpen = topmost?.close() === true;
  } finally {
    handlingHardwareBack = false;
  }
  if (!keepOpen) {
    modalStack.pop();
  }
  // Anything still open (this entry kept, or others beneath) - re-arm the
  // guard on the next microtask (NOT synchronously here - see reArmSentinel).
  if (modalStack.length > 0) {
    reArmSentinel();
  }
}

/** Test-only: clears module-level stack state between test cases. */
export function __resetModalHardwareBackForTests(): void {
  modalStack.length = 0;
  suppressedPops = 0;
  sentinelPushed = false;
  if (reArmTimer !== null) { clearTimeout(reArmTimer); reArmTimer = null; }
}

export function useModalHardwareBack(isOpen: boolean, onClose: () => void | boolean): void {
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
