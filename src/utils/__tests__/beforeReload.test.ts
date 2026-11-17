/**
 * Review 9.3: reloads the app starts itself (an update's "Reload to apply") wait for
 * pending saves first - capped, so a stuck save cannot block the update.
 */
import { registerBeforeReload, runBeforeReload } from '../beforeReload';

describe('beforeReload', () => {
  it('waits for every registered hook', async () => {
    let finish!: () => void;
    const unregister = registerBeforeReload(() => new Promise<void>((resolve) => { finish = resolve; }));
    let done = false;
    const run = runBeforeReload(10_000).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    finish();
    await run;
    expect(done).toBe(true);
    unregister();
  });

  it('gives up waiting after the cap', async () => {
    jest.useFakeTimers();
    try {
      const unregister = registerBeforeReload(() => new Promise<void>(() => {}));
      const run = runBeforeReload(3000);
      await jest.advanceTimersByTimeAsync(3000);
      await expect(run).resolves.toBeUndefined();
      unregister();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a failing hook does not stop the reload; unregistered hooks are not run', async () => {
    const failing = registerBeforeReload(() => Promise.reject(new Error('save failed')));
    const removed = jest.fn();
    registerBeforeReload(removed)();
    await expect(runBeforeReload(1000)).resolves.toBeUndefined();
    expect(removed).not.toHaveBeenCalled();
    failing();
  });
});
