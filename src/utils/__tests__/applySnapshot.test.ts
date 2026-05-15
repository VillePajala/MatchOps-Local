import { captureApplyableFields, UNDO_WINDOW_MS } from '@/utils/applySnapshot';
import type { AppState, ScheduledSub } from '@/types/game';
import type { Player } from '@/types';

const makePlayer = (over: Partial<Player> = {}): Player => ({
  id: 'p1',
  name: 'Player 1',
  isGoalie: false,
  jerseyNumber: '7',
  relX: 0.5,
  relY: 0.5,
  ...over,
});

const makeSub = (over: Partial<ScheduledSub> = {}): ScheduledSub => ({
  id: 's1',
  timeSeconds: 600,
  outPlayer: 'p1',
  inPlayer: 'p2',
  positionRole: 'LB',
  status: 'pending',
  ...over,
});

const makeGame = (over: Partial<AppState> = {}): AppState =>
  ({
    playersOnField: [makePlayer()],
    selectedPlayerIds: ['p1'],
    scheduledSubs: [makeSub()],
    ...over,
  }) as AppState;

describe('captureApplyableFields', () => {
  it('preserves undefined-vs-array distinction for legacy games', () => {
    // Some load paths treat undefined and [] differently; the snapshot
    // must not erase the distinction.
    const empty = makeGame({
      playersOnField: undefined,
      selectedPlayerIds: undefined,
      scheduledSubs: undefined,
    });
    const snap = captureApplyableFields(empty);
    expect(snap.playersOnField).toBeUndefined();
    expect(snap.selectedPlayerIds).toBeUndefined();
    expect(snap.scheduledSubs).toBeUndefined();
  });

  it('snapshot is decoupled from later in-place playersOnField mutation', () => {
    // Future engineer mutates Player.relX in place after Apply — the
    // snapshot must preserve the pre-Apply value so undo restores
    // truth. Cloning each Player object is what enforces this.
    const game = makeGame();
    const snap = captureApplyableFields(game);
    // Mutate the live game's player coords post-snapshot.
    if (game.playersOnField) {
      game.playersOnField[0].relX = 0.9;
      game.playersOnField[0].relY = 0.9;
    }
    expect(snap.playersOnField?.[0].relX).toBe(0.5);
    expect(snap.playersOnField?.[0].relY).toBe(0.5);
  });

  it('snapshot array refs are decoupled from the live arrays', () => {
    // Push to live arrays after snapshot, snapshot length must not
    // grow.
    const game = makeGame();
    const snap = captureApplyableFields(game);
    game.selectedPlayerIds!.push('px');
    game.scheduledSubs!.push(makeSub({ id: 'sx' }));
    expect(snap.selectedPlayerIds).toHaveLength(1);
    expect(snap.scheduledSubs).toHaveLength(1);
  });

  it('cloned ScheduledSub is decoupled from later in-place mutation', () => {
    // Mirrors the playersOnField test for the sub-entry clone.
    const game = makeGame();
    const snap = captureApplyableFields(game);
    if (game.scheduledSubs) {
      game.scheduledSubs[0].timeSeconds = 9999;
    }
    expect(snap.scheduledSubs?.[0].timeSeconds).toBe(600);
  });
});

describe('UNDO_WINDOW_MS', () => {
  it('is 30 seconds (locked so a copy-edit can\'t silently shift the undo grace period)', () => {
    expect(UNDO_WINDOW_MS).toBe(30_000);
  });
});
