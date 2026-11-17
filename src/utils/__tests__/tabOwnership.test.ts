import { getTabOwnership, setTabOwnership, tabMayRunDataLayer, onTabOwnershipChange, __resetTabOwnershipForTests } from '../tabOwnership';

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
});
