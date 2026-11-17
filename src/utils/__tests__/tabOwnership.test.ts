import { getTabOwnership, setTabOwnership, tabMayRunDataLayer, onTabOwnershipChange, startSyncWhenTabOwned, __resetTabOwnershipForTests } from '../tabOwnership';

/** Review 7.19: a blocked tab must not run the data layer; an undecided one waits. */
describe('tabOwnership', () => {
  beforeEach(() => __resetTabOwnershipForTests());

  it('starts undecided, and only an owner (or no lock support) may run the data layer', () => {
    expect(getTabOwnership()).toBe('pending');
    expect(tabMayRunDataLayer()).toBe(false);
    setTabOwnership('blocked');
    expect(tabMayRunDataLayer()).toBe(false);
    setTabOwnership('owner');
    expect(tabMayRunDataLayer()).toBe(true);
    setTabOwnership('unsupported');
    expect(tabMayRunDataLayer()).toBe(true);
  });

  it('tells listeners about changes, once each, until they unsubscribe', () => {
    const seen: string[] = [];
    const stop = onTabOwnershipChange((v) => seen.push(v));
    setTabOwnership('owner');
    setTabOwnership('owner');
    stop();
    setTabOwnership('blocked');
    expect(seen).toEqual(['owner']);
  });

  /** @critical - two engines on one sync queue is what this prevents. */
  describe('startSyncWhenTabOwned', () => {
    const store = () => ({ startSync: jest.fn(), stopSync: jest.fn() });
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('owner (or no lock support): starts at once', () => {
      setTabOwnership('owner');
      const s = store();
      startSyncWhenTabOwned(s, 5000);
      expect(s.startSync).toHaveBeenCalledTimes(1);
    });

    it('blocked: never starts, not even after the wait', () => {
      setTabOwnership('blocked');
      const s = store();
      startSyncWhenTabOwned(s, 5000);
      jest.advanceTimersByTime(10_000);
      expect(s.startSync).not.toHaveBeenCalled();
    });

    it('pending then owner: starts on the answer, once', () => {
      const s = store();
      startSyncWhenTabOwned(s, 5000);
      expect(s.startSync).not.toHaveBeenCalled();
      setTabOwnership('owner');
      jest.advanceTimersByTime(10_000);
      expect(s.startSync).toHaveBeenCalledTimes(1);
    });

    it('pending then blocked: never starts', () => {
      const s = store();
      startSyncWhenTabOwned(s, 5000);
      setTabOwnership('blocked');
      jest.advanceTimersByTime(10_000);
      expect(s.startSync).not.toHaveBeenCalled();
    });

    it('no answer at all (a page without the guard): starts after the wait', () => {
      const s = store();
      startSyncWhenTabOwned(s, 5000);
      jest.advanceTimersByTime(4999);
      expect(s.startSync).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(s.startSync).toHaveBeenCalledTimes(1);
    });

    it('started by the fallback, then found blocked: the engine is stopped', () => {
      const s = store();
      startSyncWhenTabOwned(s, 5000);
      jest.advanceTimersByTime(5000);
      setTabOwnership('blocked');
      expect(s.stopSync).toHaveBeenCalledTimes(1);
    });

    it('the returned function cancels a pending start', () => {
      const s = store();
      const stop = startSyncWhenTabOwned(s, 5000);
      stop();
      jest.advanceTimersByTime(10_000);
      setTabOwnership('owner');
      expect(s.startSync).not.toHaveBeenCalled();
    });
  });
});
