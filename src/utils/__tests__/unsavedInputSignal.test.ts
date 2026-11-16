import { renderHook } from '@testing-library/react';
import { holdUnsavedInput, hasUnsavedInput, useHoldUnsavedInput, __resetUnsavedInputForTests } from '../unsavedInputSignal';

/** Review 7.1: a counter, so one form closing never releases another's hold. */
describe('unsavedInputSignal', () => {
  beforeEach(() => __resetUnsavedInputForTests());

  it('holds while any holder remains, and a double release counts once', () => {
    expect(hasUnsavedInput()).toBe(false);
    const roster = holdUnsavedInput();
    const player = holdUnsavedInput();
    player();
    player();
    expect(hasUnsavedInput()).toBe(true);
    roster();
    expect(hasUnsavedInput()).toBe(false);
  });

  it('the hook holds while active, releases when inactive or unmounted', () => {
    const { rerender, unmount } = renderHook(({ open }) => useHoldUnsavedInput(open), { initialProps: { open: true } });
    expect(hasUnsavedInput()).toBe(true);
    rerender({ open: false });
    expect(hasUnsavedInput()).toBe(false);
    rerender({ open: true });
    expect(hasUnsavedInput()).toBe(true);
    unmount();
    expect(hasUnsavedInput()).toBe(false);
  });
});
