/**
 * Review 3.21b: the composite duplicate check used by both data stores' update
 * methods (teams, seasons, tournaments).
 * @critical
 */
import { isNewCompositeDuplicate } from '../validation';

type R = { id: string; key: string };
const keyOf = (r: R) => r.key;

describe('isNewCompositeDuplicate', () => {
  const pair: R[] = [{ id: 'a', key: 'same' }, { id: 'b', key: 'same' }, { id: 'c', key: 'other' }];

  it('an edit of one of two synced same-key records keeps its key: not a new duplicate', () => {
    expect(isNewCompositeDuplicate(pair, 'b', 'same', keyOf)).toBe(false);
  });

  it('changing a key onto another record\'s key IS a duplicate', () => {
    expect(isNewCompositeDuplicate(pair, 'c', 'same', keyOf)).toBe(true);
  });

  it('changing to a free key is fine', () => {
    expect(isNewCompositeDuplicate(pair, 'c', 'free', keyOf)).toBe(false);
  });

  it('a record not in the list (fresh) collides with any holder of the key', () => {
    expect(isNewCompositeDuplicate(pair, 'z', 'other', keyOf)).toBe(true);
  });
});
