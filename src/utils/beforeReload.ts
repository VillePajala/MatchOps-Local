/**
 * Work that must finish before the app reloads itself (review 9.3).
 *
 * "Reload to apply" (an app update) navigated away at once. The autosave also saves
 * on pagehide, but that is fire-and-forget: an IndexedDB write started while the page
 * unloads can be cut off, so a goal or substitution entered in the last moments - still
 * inside its 0.5-2 s autosave delay - could be lost. Reloads the app starts itself now
 * wait for these hooks first (capped, so a stuck save never blocks the update).
 */
type BeforeReloadHook = () => Promise<void> | void;

const hooks = new Set<BeforeReloadHook>();

/** Register a hook; returns its unregister function. */
export function registerBeforeReload(hook: BeforeReloadHook): () => void {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

/** Run every hook; resolves when all settle or after `timeoutMs`, whichever is first. */
export async function runBeforeReload(timeoutMs = 3000): Promise<void> {
  if (hooks.size === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  const all = Promise.allSettled([...hooks].map((hook) => Promise.resolve().then(hook))).then(() => undefined);
  await Promise.race([all, timeout]);
  if (timer) clearTimeout(timer);
}
