/**
 * Unit suite for the single-sentinel hardware-back stack (deep-review):
 * the invariants live here, independent of any host component.
 */
import { renderHook, act } from '@testing-library/react';
import { useModalHardwareBack, useHardwareBackSubLevel, __resetModalHardwareBackForTests, isHandlingHardwareBack } from './useModalHardwareBack';

describe('useModalHardwareBack (single sentinel)', () => {
  let pushSpy: jest.SpyInstance;
  let backSpy: jest.SpyInstance;

  beforeEach(() => {
    __resetModalHardwareBackForTests();
    pushSpy = jest.spyOn(window.history, 'pushState').mockImplementation(() => {});
    backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  });
  afterEach(() => {
    pushSpy.mockRestore();
    backSpy.mockRestore();
  });

  const pop = async () => {
    // Dispatch the back, then deterministically flush the macrotask the hook
    // schedules to re-arm the sentinel (setTimeout(0) - runs after the history
    // traversal settles on real WebViews). This awaits the SUT's own timer, not
    // an arbitrary delay.
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  };

  it('N stacked surfaces share ONE sentinel; each back closes topmost and re-arms', async () => {
    const closeA = jest.fn();
    const closeB = jest.fn();
    const a = renderHook(({ open }) => useModalHardwareBack(open, closeA), { initialProps: { open: true } });
    const b = renderHook(({ open }) => useModalHardwareBack(open, closeB), { initialProps: { open: true } });
    expect(pushSpy).toHaveBeenCalledTimes(1); // one sentinel, not two

    await pop(); // consumes sentinel, closes topmost (B), re-pushes for A
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledTimes(2);

    await pop(); // closes A, nothing left - no re-push
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledTimes(2);
    a.unmount(); b.unmount();
  });

  it('UI-closing a NON-last surface performs no history operation at all', async () => {
    const a = renderHook(({ open }) => useModalHardwareBack(open, jest.fn()), { initialProps: { open: true } });
    const b = renderHook(({ open }) => useModalHardwareBack(open, jest.fn()), { initialProps: { open: true } });
    a.rerender({ open: false }); // close the bottom one via UI
    expect(backSpy).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledTimes(1);
    b.unmount();
  });

  it('UI-closing the LAST surface consumes the sentinel exactly once (suppressed pop)', async () => {
    const close = jest.fn();
    const a = renderHook(({ open }) => useModalHardwareBack(open, close), { initialProps: { open: true } });
    a.rerender({ open: false });
    expect(backSpy).toHaveBeenCalledTimes(1);
    // The programmatic back()'s popstate is swallowed - closes nothing.
    await pop();
    expect(close).not.toHaveBeenCalled();
  });

  it('forced close of the TOPMOST while another remains: next back closes the remaining one', async () => {
    const closeA = jest.fn();
    const a = renderHook(({ open }) => useModalHardwareBack(open, closeA), { initialProps: { open: true } });
    const b = renderHook(({ open }) => useModalHardwareBack(open, jest.fn()), { initialProps: { open: true } });
    b.rerender({ open: false }); // forced/UI close of topmost
    expect(backSpy).not.toHaveBeenCalled(); // A still open - sentinel stays
    await pop();
    expect(closeA).toHaveBeenCalledTimes(1);
    a.unmount();
  });

  it('close() returning true keeps the entry (sub-view back); next back closes it', async () => {
    // Models the planner: first back steps plan -> manager (stay open),
    // second back closes. One entry, no desync, no app exit in between.
    let view = 'plan';
    const closed = jest.fn();
    const a = renderHook(({ open }) => useModalHardwareBack(open, () => {
      if (view !== 'manager') { view = 'manager'; return true; }
      closed();
      return false;
    }), { initialProps: { open: true } });

    await pop(); // plan -> manager, entry kept, sentinel re-armed
    expect(view).toBe('manager');
    expect(closed).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledTimes(2); // initial + re-arm

    await pop(); // manager -> close
    expect(closed).toHaveBeenCalledTimes(1);
    a.unmount();
  });

  it('a sub-level guard steps internally FIRST and leaves the sentinel intact (no re-arm)', async () => {
    // Models the planner robustly: entering a plan pushes a PREEMPTIVE guard
    // above the sentinel, so back#1 steps to the manager without consuming the
    // sentinel and without any re-push-after-a-back. back#2 then closes.
    const closeMain = jest.fn();
    const stepped = jest.fn();
    const a = renderHook(({ open }) => useModalHardwareBack(open, closeMain), { initialProps: { open: true } });
    expect(pushSpy).toHaveBeenCalledTimes(1); // sentinel

    const b = renderHook(({ active }) => useHardwareBackSubLevel(active, stepped), { initialProps: { active: true } });
    expect(pushSpy).toHaveBeenCalledTimes(2); // + preemptive sub-guard

    await pop(); // consumes the sub-guard -> step; sentinel untouched, NO re-push
    expect(stepped).toHaveBeenCalledTimes(1);
    expect(closeMain).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledTimes(2);

    // The step took us out of the sub-level; that must NOT fire a second back().
    b.rerender({ active: false });
    expect(backSpy).not.toHaveBeenCalled();

    await pop(); // now the sentinel: back#2 closes the main modal
    expect(closeMain).toHaveBeenCalledTimes(1);
    a.unmount();
  });

  it('leaving a sub-level via the UI retires its guard with a suppressed back', async () => {
    const closeMain = jest.fn();
    const a = renderHook(({ open }) => useModalHardwareBack(open, closeMain), { initialProps: { open: true } });
    const b = renderHook(({ active }) => useHardwareBackSubLevel(active, jest.fn()), { initialProps: { active: true } });
    expect(pushSpy).toHaveBeenCalledTimes(2);

    b.rerender({ active: false }); // left the sub-level via UI/state, not a back
    expect(backSpy).toHaveBeenCalledTimes(1); // guard retired with a suppressed back

    await pop(); // that programmatic back's popstate is swallowed - closes nothing
    expect(closeMain).not.toHaveBeenCalled();
    a.unmount();
  });

  it('stacked sub-guards are consumed LIFO: overlay guard first, then plan guard, then close', async () => {
    // Models the planner with an overlay (confirm dialog / sub-sheet) open over
    // a plan: an overlay guard is pushed ABOVE the plan sub-guard. Hardware back
    // cancels the overlay first (leaving the plan guard intact), the next back
    // steps the plan to the manager, the next closes the planner.
    const closeMain = jest.fn();
    const stepPlan = jest.fn();
    const cancelOverlay = jest.fn();
    const a = renderHook(({ open }) => useModalHardwareBack(open, closeMain), { initialProps: { open: true } });
    const plan = renderHook(({ active }) => useHardwareBackSubLevel(active, stepPlan), { initialProps: { active: true } });
    const overlay = renderHook(({ active }) => useHardwareBackSubLevel(active, cancelOverlay), { initialProps: { active: true } });
    expect(pushSpy).toHaveBeenCalledTimes(3); // sentinel + plan guard + overlay guard

    await pop(); // topmost = overlay guard
    expect(cancelOverlay).toHaveBeenCalledTimes(1);
    expect(stepPlan).not.toHaveBeenCalled();
    expect(closeMain).not.toHaveBeenCalled();
    overlay.rerender({ active: false }); // overlay closed as a result

    await pop(); // now the plan guard
    expect(stepPlan).toHaveBeenCalledTimes(1);
    expect(closeMain).not.toHaveBeenCalled();
    plan.rerender({ active: false });

    await pop(); // now the sentinel: closes the planner
    expect(closeMain).toHaveBeenCalledTimes(1);
    a.unmount();
  });

  it('closing the main modal from INSIDE a sub-level balances the counter (no stuck pops)', async () => {
    // Models closing the planner via its X while still inside a plan: the
    // preemptive sub-guard AND the main sentinel both retire in the same
    // cleanup tick, firing two suppressed back()s. The two swallowed popstates
    // must leave the suppression counter at ZERO, so a later unrelated back is
    // not silently eaten. (Refutes the recurring review flag about this path.)
    const closeMain = jest.fn();
    const stepped = jest.fn();
    const planner = renderHook(
      ({ open }) => {
        useModalHardwareBack(open, closeMain);
        useHardwareBackSubLevel(open, stepped); // active while inside a plan
      },
      { initialProps: { open: true } },
    );
    expect(pushSpy).toHaveBeenCalledTimes(2); // sentinel + preemptive sub-guard

    planner.rerender({ open: false }); // close the planner from the sub-level via UI
    expect(backSpy).toHaveBeenCalledTimes(2); // sub-guard back + sentinel back

    // Both programmatic backs' popstates are swallowed - neither callback fires.
    await pop();
    await pop();
    expect(stepped).not.toHaveBeenCalled();
    expect(closeMain).not.toHaveBeenCalled();
    planner.unmount();

    // Counter is balanced: a brand-new modal's hardware back closes normally.
    const other = renderHook(({ open }) => useModalHardwareBack(open, closeMain), { initialProps: { open: true } });
    await pop();
    expect(closeMain).toHaveBeenCalledTimes(1);
    other.unmount();
  });

  it('exposes the hardware-back flag ONLY during a popstate-driven close', async () => {
    let flagDuringClose: boolean | null = null;
    const a = renderHook(({ open }) => useModalHardwareBack(open, () => { flagDuringClose = isHandlingHardwareBack(); }), { initialProps: { open: true } });
    expect(isHandlingHardwareBack()).toBe(false);
    await pop();
    expect(flagDuringClose).toBe(true);
    expect(isHandlingHardwareBack()).toBe(false);
    a.unmount();
  });
});
