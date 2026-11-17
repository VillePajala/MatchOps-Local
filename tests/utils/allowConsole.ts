/**
 * Allow console warnings/errors containing these strings, in THIS test file only
 * (review 9.5). For a file that deliberately exercises a module's error logging;
 * every other file still fails on the same message. See src/setupTests.mjs.
 */
export function allowConsoleMessagesInThisFile(patterns: string[]): void {
  (globalThis as unknown as { __allowConsoleMessagesInThisFile: (p: string[]) => void })
    .__allowConsoleMessagesInThisFile(patterns);
}
