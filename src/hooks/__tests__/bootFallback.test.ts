/**
 * @critical - the boot decision that put the owner in the demo workspace.
 *
 * The match boots by asking two React Query caches which game is current. The
 * defect was that it could not tell "this game does not exist" from "the query
 * has not resolved", and treated both as the first - dropping the coach onto
 * the scratch workspace with no match data, the first-game "add players"
 * overlay and the DEMO watermark, for a game that exists perfectly well.
 */
const DEFAULT_GAME_ID = 'unsaved_game';

/**
 * The boot's decision, extracted exactly as it is written in
 * useGameOrchestration's init effect so the rule can be exercised on its own.
 */
type Outcome = { open: string } | { open: typeof DEFAULT_GAME_ID } | { wait: true };

const decide = (
  lastGameIdSetting: string | null,
  savedGames: Record<string, unknown>,
  isSettling: boolean,
): Outcome => {
  if (lastGameIdSetting && lastGameIdSetting !== DEFAULT_GAME_ID && savedGames[lastGameIdSetting]) {
    return { open: lastGameIdSetting };
  }
  if (lastGameIdSetting && lastGameIdSetting !== DEFAULT_GAME_ID && isSettling) {
    return { wait: true };
  }
  return { open: DEFAULT_GAME_ID };
};

const GAME = 'game_1758000000000';
const present = { [GAME]: { opponentName: 'HJK' } };

describe('which game the match boots', () => {
  it('opens the persisted game when it is in the snapshot', () => {
    expect(decide(GAME, present, false)).toEqual({ open: GAME });
  });

  /**
   * THE BUG. React Query reports a refetch as isFetching, not isLoading, so the
   * boot could run against a stale snapshot that did not contain the game yet.
   */
  it('waits rather than falling back while the snapshot is still arriving', () => {
    expect(decide(GAME, {}, true)).toEqual({ wait: true });
  });

  it('opens it once the refetch lands', () => {
    expect(decide(GAME, {}, true)).toEqual({ wait: true });
    expect(decide(GAME, present, false)).toEqual({ open: GAME });
  });

  /** A genuinely deleted game must still fall back - settled and absent. */
  it('falls back when the data is settled and the game really is gone', () => {
    expect(decide(GAME, {}, false)).toEqual({ open: DEFAULT_GAME_ID });
  });

  it('falls back when nothing is persisted at all', () => {
    expect(decide(null, present, false)).toEqual({ open: DEFAULT_GAME_ID });
  });

  /** The scratch workspace is not a game to wait for. */
  it('does not wait on the default id', () => {
    expect(decide(DEFAULT_GAME_ID, {}, true)).toEqual({ open: DEFAULT_GAME_ID });
  });
});
