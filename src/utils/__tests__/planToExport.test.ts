import { planningSessionToImportedPlan } from '../planToExport';
import { parsePlanExport, serializePlanExport } from '../planExport';
import { parsePlanBundle, serializePlanBundle } from '../planBundle';
import type { AppState } from '@/types/game';
import type { PlanningSession } from '@/types/planningSession';

const buildGame = (over: Partial<AppState> = {}): AppState =>
  ({
    teamName: 'Pepo U10',
    teamId: 't1',
    opponentName: 'Lions',
    gameDate: '2026-04-30',
    gameTime: '14:00',
    gameLocation: 'Field A',
    numberOfPeriods: 2,
    periodDurationMinutes: 12.5,
    selectedPlayerIds: ['p0', 'p1', 'p2', 'p3'],
    ...over,
  }) as unknown as AppState;

const buildSession = (
  over: Partial<PlanningSession> = {},
): PlanningSession => ({
  id: 'planningSession_1',
  teamId: 't1',
  name: 'Default',
  gameIds: ['g1'],
  draft: {
    g1: {
      startingXI: { GK: 'p0', LB: 'p1' },
      bench: ['p2', 'p3'],
      scheduledSubs: [],
      presetId: '8v8-2-1-2-1-1',
    },
  },
  isActive: false,
  createdAt: '2026-04-30T10:00:00.000Z',
  updatedAt: '2026-04-30T11:00:00.000Z',
  ...over,
});

describe('planningSessionToImportedPlan', () => {
  it('produces a structurally valid envelope (round-trips through parsePlanExport)', () => {
    const out = planningSessionToImportedPlan(
      buildSession(),
      { g1: buildGame() },
    );
    // Round-trip: serialise → reparse → byte-equivalent on the
    // structural fields. Failure here means the converter emitted
    // a shape parsePlanExport rejects.
    const text = serializePlanExport(out);
    const reParsed = parsePlanExport(text);
    expect(reParsed.ok).toBe(true);
  });

  it('maps session.draft.startingXI verbatim onto the per-game envelope', () => {
    const session = buildSession({
      gameIds: ['g1', 'g2'],
      draft: {
        g1: { startingXI: { GK: 'p0' }, bench: [], scheduledSubs: [] },
        g2: { startingXI: { GK: 'p1' }, bench: [], scheduledSubs: [] },
      },
    });
    const out = planningSessionToImportedPlan(session, {
      g1: buildGame(),
      g2: buildGame({ opponentName: 'Tigers' }),
    });
    expect(out.games[0].startingXI).toEqual({ GK: 'p0' });
    expect(out.games[1].startingXI).toEqual({ GK: 'p1' });
  });

  it('synthesises outPlayer for scheduledSubs from the role pre-sub occupant', () => {
    // Drafts don't store outPlayer; the converter must walk each
    // role's sub list in chronological order and stamp the prior
    // occupant onto each sub for the wire shape.
    const session = buildSession({
      draft: {
        g1: {
          startingXI: { GK: 'p0' },
          bench: [],
          scheduledSubs: [
            { id: 's1', timeSeconds: 600, inPlayer: 'p1', positionRole: 'GK' },
            // Second sub at the same role: outPlayer should be sub-1's inPlayer.
            { id: 's2', timeSeconds: 1200, inPlayer: 'p2', positionRole: 'GK' },
          ],
        },
      },
    });
    const out = planningSessionToImportedPlan(session, { g1: buildGame() });
    const subs = out.games[0].scheduledSubs;
    expect(subs).toHaveLength(2);
    expect(subs[0].outPlayer).toBe('p0'); // role's starter
    expect(subs[1].outPlayer).toBe('p1'); // sub-1's inPlayer
  });

  it('marks every game as included when includedGameIds is undefined', () => {
    const session = buildSession({
      gameIds: ['g1', 'g2'],
      draft: {
        g1: { startingXI: {}, bench: [], scheduledSubs: [] },
        g2: { startingXI: {}, bench: [], scheduledSubs: [] },
      },
      includedGameIds: undefined,
    });
    const out = planningSessionToImportedPlan(session, {
      g1: buildGame(),
      g2: buildGame(),
    });
    expect(out.included).toEqual([true, true]);
  });

  it('projects includedGameIds onto session.gameIds order', () => {
    const session = buildSession({
      gameIds: ['g1', 'g2', 'g3'],
      draft: {
        g1: { startingXI: {}, bench: [], scheduledSubs: [] },
        g2: { startingXI: {}, bench: [], scheduledSubs: [] },
        g3: { startingXI: {}, bench: [], scheduledSubs: [] },
      },
      // Out-of-order on the wire to confirm projection (not just
      // equality) is what's exercised.
      includedGameIds: ['g3', 'g1'],
    });
    const out = planningSessionToImportedPlan(session, {
      g1: buildGame(),
      g2: buildGame(),
      g3: buildGame(),
    });
    expect(out.included).toEqual([true, false, true]);
  });

  it('falls back to placeholder fields when a game record is missing', () => {
    // Cloud-sync races can leave session.gameIds pointing at a
    // game the local client hasn't loaded yet. Export must stay
    // resilient — the result still parses.
    const out = planningSessionToImportedPlan(
      buildSession({ gameIds: ['g_unknown'] }),
      {}, // empty savedGames
    );
    expect(out.games).toHaveLength(1);
    expect(out.games[0].id).toBe('g_unknown');
    // Opponent must be non-empty to round-trip (parsePlanExport
    // rejects empty strings); converter falls back to the game id.
    expect(out.games[0].opponent).toBe('Game g_unknown');
    expect(out.games[0].label).toBe('Game g_unknown');
    const reParsed = parsePlanExport(serializePlanExport(out));
    expect(reParsed.ok).toBe(true);
  });

  it('uses the draft.presetId as the formation id by default', () => {
    const out = planningSessionToImportedPlan(
      buildSession(),
      { g1: buildGame() },
    );
    expect(out.formationId).toBe('8v8-2-1-2-1-1');
  });

  it('uses session.name as currentVersionName by default', () => {
    const out = planningSessionToImportedPlan(
      buildSession({ name: 'Variant A' }),
      { g1: buildGame() },
    );
    expect(out.currentVersionName).toBe('Variant A');
  });

  it('respects explicit currentVersionName=null override', () => {
    const out = planningSessionToImportedPlan(
      buildSession(),
      { g1: buildGame() },
      { currentVersionName: null },
    );
    expect(out.currentVersionName).toBeNull();
  });

  it('uses session.updatedAt as savedAt by default', () => {
    const out = planningSessionToImportedPlan(
      buildSession({ updatedAt: '2026-05-01T08:00:00.000Z' }),
      { g1: buildGame() },
    );
    expect(out.savedAt).toBe('2026-05-01T08:00:00.000Z');
  });

  it('feeds serializePlanBundle so a parent+child family round-trips through parsePlanBundle', () => {
    // The PR-F-2 export UI builds a Record<name, ImportedPlan>
    // straight from the version family and passes it to
    // serializePlanBundle. This test locks the converter →
    // serializePlanBundle → parsePlanBundle pipeline so a future
    // breaking change on either side is caught here, not in the UI
    // smoke test.
    const parent = buildSession({ id: 'p1', name: 'Default' });
    const child = buildSession({
      id: 'c1',
      name: 'Variant A',
      parentSessionId: 'p1',
    });
    const games = { g1: buildGame() };
    const versions = {
      [parent.name]: planningSessionToImportedPlan(parent, games),
      [child.name]: planningSessionToImportedPlan(child, games),
    };
    const json = serializePlanBundle({
      versions,
      currentVersionName: child.name,
    });
    const parsed = parsePlanBundle(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.kind).toBe('bundle');
    if (parsed.kind !== 'bundle') return;
    expect(Object.keys(parsed.bundle.versions).sort()).toEqual([
      'Default',
      'Variant A',
    ]);
    expect(parsed.bundle.currentVersionName).toBe('Variant A');
  });
});
