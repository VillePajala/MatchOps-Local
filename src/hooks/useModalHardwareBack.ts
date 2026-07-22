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

let retireTimer: ReturnType<typeof setTimeout> | null = null;

// Retire the sentinel when the last modal closes via UI - but DEFER it a
// macrotask. On the Start-screen -> Match crossing, the closing modal's cleanup
// and the opening match-view guard's setup land in ONE React commit, and React
// runs cleanup BEFORE setup. A synchronous retire here would fire history.back()
// and then the match guard's pushState in the same tick - the exact back()+
// pushState interleave Android WebViews drop, leaving sentinelPushed=true with
// no real entry (first hardware back then exits the app). Deferring lets the
// same-commit setup CANCEL this retire and reuse the still-live sentinel.
function scheduleSentinelRetire(): void {
  if (retireTimer !== null) return;
  retireTimer = setTimeout(() => {
    retireTimer = null;
    // Only retire if nothing re-registered in the meantime and the sentinel
    // is still up (a same-commit reopen/crossing cancels this instead).
    if (modalStack.length === 0 && sentinelPushed) {
      sentinelPushed = false;
      suppressedPops += 1;
      window.history.back();
    }
  }, 0);
}

// --- Preemptive sub-level guards ----------------------------------------
// A modal with internal sub-views (the planner: a plan steps back to its
// manager) needs a hardware back to STEP without closing. Doing that with the
// single sentinel means consuming it and RE-PUSHING it after the popstate - and
// that re-push is silently dropped on some Android WebViews, so the NEXT back
// exits the app (owner-reported repeatedly, with the sync, microtask AND
// macrotask re-arm variants). A sub-guard sidesteps re-arm entirely: the
// sub-view pushes its OWN history entry PREEMPTIVELY (in a normal render task,
// where pushState is reliable), sitting ABOVE the sentinel. A back consumes
// that guard, we step internally, and the sentinel is never touched - so
// nothing has to be re-pushed after a back.
type SubGuard = { onPop: () => void; consumed: boolean };
const subGuards: SubGuard[] = [];

function pushSubGuard(onPop: () => void): SubGuard {
  const g: SubGuard = { onPop, consumed: false };
  subGuards.push(g);
  window.history.pushState({ liftedSubGuard: true }, '');
  return g;
}

function removeSubGuard(g: SubGuard): void {
  const i = subGuards.indexOf(g);
  if (i === -1) return; // already consumed by a hardware back - nothing to undo
  subGuards.splice(i, 1);
  // Left via the UI (or a forced state change), not a hardware back: our
  // history entry is still live, so retire it with a suppressed back().
  suppressedPops += 1;
  window.history.back();
}

function handleGlobalPop(): void {
  if (suppressedPops > 0) {
    suppressedPops -= 1;
    return;
  }
  // A preemptive sub-guard sits ABOVE the sentinel; a back consumes it first.
  // Step internally and leave the sentinel intact - no re-arm needed.
  if (subGuards.length > 0) {
    const g = subGuards[subGuards.length - 1];
    g.consumed = true;
    subGuards.pop();
    handlingHardwareBack = true;
    try {
      g.onPop();
    } finally {
      handlingHardwareBack = false;
    }
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
  subGuards.length = 0;
  suppressedPops = 0;
  sentinelPushed = false;
  if (reArmTimer !== null) { clearTimeout(reArmTimer); reArmTimer = null; }
  if (retireTimer !== null) { clearTimeout(retireTimer); retireTimer = null; }
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
    // Cancel a pending sentinel-retire: if a modal closed THIS commit (its
    // cleanup ran first) and set one, this registration reuses the still-live
    // sentinel rather than letting it retire (the Start->Match crossing).
    if (retireTimer !== null) { clearTimeout(retireTimer); retireTimer = null; }
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
          scheduleSentinelRetire();
        }
      }
      // index === -1 means a hardware back press closed this surface - the
      // pop handler already did the bookkeeping.
    };
  }, [isOpen]);
}

/**
 * Sub-level back for a modal that's already registered with
 * useModalHardwareBack. While `active` (e.g. the planner is inside a plan), a
 * hardware back runs `onBack` to step UP one internal level instead of closing
 * the modal; the modal's own sentinel stays intact underneath. Because the
 * guard entry is pushed preemptively here (not re-pushed after a back), it
 * survives on WebViews where re-arm does not.
 */
export function useHardwareBackSubLevel(active: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!active) return;

    // Share the single global listener (attached-once, never removed).
    if (!listenerAttached) {
      window.addEventListener('popstate', handleGlobalPop);
      listenerAttached = true;
    }

    const guard = pushSubGuard(() => onBackRef.current());
    return () => {
      removeSubGuard(guard);
    };
  }, [active]);
}

export default useModalHardwareBack;
