import { initialModalState, modalReducer } from '../modalReducer';

describe('modalReducer (skeleton)', () => {
  it('returns initial state unchanged for unknown action', () => {
    const state = initialModalState;
    // @ts-expect-error test unknown action
    const next = modalReducer(state, { type: 'UNKNOWN' });
    expect(next).toBe(state);
  });

  it('opens and closes loadGame modal', () => {
    const opened = modalReducer(initialModalState, { type: 'OPEN_MODAL', id: 'loadGame', at: 123 });
    expect(opened.loadGame).toBe(true);
    expect(opened.openTimestamps.loadGame).toBe(123);

    const closed = modalReducer(opened, { type: 'CLOSE_MODAL', id: 'loadGame' });
    expect(closed.loadGame).toBe(false);
    // Timestamps persist after close; reducer doesn’t clear them by default
    expect(closed.openTimestamps.loadGame).toBe(123);
  });

  it('toggles loadGame modal', () => {
    const toggledOpen = modalReducer(initialModalState, { type: 'TOGGLE_MODAL', id: 'loadGame', at: 555 });
    expect(toggledOpen.loadGame).toBe(true);
    expect(toggledOpen.openTimestamps.loadGame).toBe(555);

    const toggledClosed = modalReducer(toggledOpen, { type: 'TOGGLE_MODAL', id: 'loadGame' });
    expect(toggledClosed.loadGame).toBe(false);
  });

  it('resets modals to initial state', () => {
    const opened = modalReducer(initialModalState, { type: 'OPEN_MODAL', id: 'loadGame', at: 999 });
    const reset = modalReducer(opened, { type: 'RESET_MODALS' });
    expect(reset).toEqual(initialModalState);
  });

  it('opening newGameSetup does not affect loadGame state', () => {
    const withLoadGameOpen = modalReducer(initialModalState, { type: 'OPEN_MODAL', id: 'loadGame', at: 100 });
    const withBothOpen = modalReducer(withLoadGameOpen, { type: 'OPEN_MODAL', id: 'newGameSetup', at: 200 });
    expect(withBothOpen.loadGame).toBe(true);
    // Casting to the extended state that includes newGameSetup for this step
    const extended = withBothOpen as unknown as { loadGame: boolean; newGameSetup: boolean };
    expect(extended.newGameSetup).toBe(true);
  });

  it('opens and closes goalLog modal independently', () => {
    const opened = modalReducer(initialModalState, { type: 'OPEN_MODAL', id: 'goalLog', at: 777 });
    const extended = opened as unknown as { goalLog: boolean; openTimestamps: Record<string, number> };
    expect(extended.goalLog).toBe(true);
    expect(extended.openTimestamps.goalLog).toBe(777);

    const closed = modalReducer(opened, { type: 'CLOSE_MODAL', id: 'goalLog' });
    const closedExtended = closed as unknown as { goalLog: boolean; openTimestamps: Record<string, number> };
    expect(closedExtended.goalLog).toBe(false);
    expect(closedExtended.openTimestamps.goalLog).toBe(777);
  });

  it('opens and closes gameStats modal independently', () => {
    const opened = modalReducer(initialModalState, { type: 'OPEN_MODAL', id: 'gameStats', at: 888 });
    const extended = opened as unknown as { gameStats: boolean; openTimestamps: Record<string, number> };
    expect(extended.gameStats).toBe(true);
    expect(extended.openTimestamps.gameStats).toBe(888);

    const closed = modalReducer(opened, { type: 'CLOSE_MODAL', id: 'gameStats' });
    const closedExtended = closed as unknown as { gameStats: boolean; openTimestamps: Record<string, number> };
    expect(closedExtended.gameStats).toBe(false);
    expect(closedExtended.openTimestamps.gameStats).toBe(888);
  });

  it('handles rapid toggles correctly', () => {
    let state = initialModalState;
    state = modalReducer(state, { type: 'TOGGLE_MODAL', id: 'loadGame', at: 1 }); // open
    state = modalReducer(state, { type: 'TOGGLE_MODAL', id: 'loadGame' }); // close
    state = modalReducer(state, { type: 'TOGGLE_MODAL', id: 'loadGame', at: 2 }); // open
    expect(state.loadGame).toBe(true);
    expect(state.openTimestamps.loadGame).toBe(2);
  });

  it('is idempotent for repeated opens', () => {
    const state1 = modalReducer(initialModalState, { type: 'OPEN_MODAL', id: 'loadGame', at: 100 });
    const state2 = modalReducer(state1, { type: 'OPEN_MODAL', id: 'loadGame', at: 200 });
    expect(state2).toBe(state1);
  });

  it('keeps openTimestamps on close (analytics)', () => {
    const opened = modalReducer(initialModalState, { type: 'OPEN_MODAL', id: 'loadGame', at: 123 });
    const closed = modalReducer(opened, { type: 'CLOSE_MODAL', id: 'loadGame' });
    expect(closed.loadGame).toBe(false);
    expect(closed.openTimestamps.loadGame).toBe(123);
  });

  it('no-ops for unknown modal ids (future-proof)', () => {
    // @ts-expect-error deliberately using future modal id to verify stability
    const next = modalReducer(initialModalState, { type: 'OPEN_MODAL', id: 'future', at: 1 });
    expect(next).toBe(initialModalState);
  });
});
