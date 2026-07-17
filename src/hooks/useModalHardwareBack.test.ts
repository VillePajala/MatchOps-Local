/**
 * Unit suite for the single-sentinel hardware-back stack (deep-review):
 * the invariants live here, independent of any host component.
 */
import { renderHook, act } from '@testing-library/react';
import { useModalHardwareBack, __resetModalHardwareBackForTests, isHandlingHardwareBack } from './useModalHardwareBack';

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
