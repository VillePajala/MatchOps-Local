/**
 * Thin indirection over window.location.reload().
 *
 * Exists so destructive flows (hard reset, re-sync, factory reset) are unit
 * testable: JSDOM's window.location is non-replaceable, so tests mock THIS
 * module instead. Other reload callsites can migrate here opportunistically.
 */
export function reloadApp(): void {
  window.location.reload();
}

export default reloadApp;
