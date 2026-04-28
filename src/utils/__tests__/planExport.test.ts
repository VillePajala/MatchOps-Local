/**
 * Tests for the planner-bridge JSON envelope reader/writer.
 *
 * @critical The wire shape is shared with the standalone `matchops-planner`.
 * Any change here that breaks round-trip will silently desync coaches who
 * move plans between the two apps.
 */

import {
  parsePlanExport,
  serializePlanExport,
  PLAN_FORMAT_VERSION,
  PLAN_EXPORT_KIND,
} from '../planExport';
import type { ImportedPlan } from '../planExport';

const validWireSub = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  timeSec: 600,
  role: 'CDM',
  outPlayer: 'p1',
  inPlayer: 'p2',
  ...overrides,
});

const validWireGame = (overrides: Record<string, unknown> = {}) => ({
  id: 'g1',
  label: 'Game 1',
  time: '14:00',
  field: 'Field A',
  opponent: 'Opponent FC',
  numberOfPeriods: 2,
  periodDurationMinutes: 12.5,
  durationMin: 25,
  halfTimeMin: 12.5,
  startingXI: { GK: 'p0', CDM: 'p1', ST: 'p3' },
  scheduledSubs: [validWireSub()],
  ...overrides,
});

const validEnvelope = (overrides: Record<string, unknown> = {}) => ({
  formatVersion: PLAN_FORMAT_VERSION,
  kind: PLAN_EXPORT_KIND,
  savedAt: '2026-04-28T12:00:00.000Z',
  tournament: {
    teamName: 'Pepo U10',
    formationId: '8v8-2-1-2-1-1',
    rosterSize: 11,
    games: [validWireGame()],
  },
  included: [true],
  currentVersionName: null,
  ...overrides,
});

describe('parsePlanExport', () => {
  it('accepts a well-formed envelope and translates field names', () => {
    const result = parsePlanExport(JSON.stringify(validEnvelope()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.teamName).toBe('Pepo U10');
    expect(result.plan.games).toHaveLength(1);

    const sub = result.plan.games[0].scheduledSubs[0];
    // standalone `timeSec` → MatchOps-Local `timeSeconds`
    expect(sub.timeSeconds).toBe(600);
    // standalone `role` → MatchOps-Local `positionRole`
    expect(sub.positionRole).toBe('CDM');
    // status is stamped on import (standalone has no status field)
    expect(sub.status).toBe('pending');
  });

  it('rejects malformed JSON with a parse error', () => {
    const result = parsePlanExport('{ not valid json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/JSON parse error/);
  });

  it('rejects wrong formatVersion', () => {
    const result = parsePlanExport(
      JSON.stringify(validEnvelope({ formatVersion: 2 })),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toBe('formatVersion');
  });

  it('rejects wrong kind', () => {
    const result = parsePlanExport(
      JSON.stringify(validEnvelope({ kind: 'something-else' })),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toBe('kind');
  });

  it('rejects missing tournament', () => {
    const env = validEnvelope();
    delete (env as Record<string, unknown>).tournament;
    const result = parsePlanExport(JSON.stringify(env));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toBe('tournament');
  });

  it('rejects empty games array', () => {
    const result = parsePlanExport(
      JSON.stringify(
        validEnvelope({
          tournament: {
            teamName: 'X',
            formationId: 'f',
            rosterSize: 1,
            games: [],
          },
        }),
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toBe('tournament.games');
  });

  it('rejects fractional rosterSize', () => {
    const result = parsePlanExport(
      JSON.stringify(
        validEnvelope({
          tournament: {
            teamName: 'X',
            formationId: 'f',
            rosterSize: 1.5,
            games: [validWireGame()],
          },
        }),
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toBe('tournament.rosterSize');
  });

  it('rejects scheduledSubs with non-integer timeSec', () => {
    const result = parsePlanExport(
      JSON.stringify(
        validEnvelope({
          tournament: {
            teamName: 'X',
            formationId: 'f',
            rosterSize: 1,
            games: [
              validWireGame({
                scheduledSubs: [validWireSub({ timeSec: 600.5 })],
              }),
            ],
          },
        }),
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toContain('timeSec');
  });

  it('rejects scheduledSubs with outPlayer === inPlayer', () => {
    const result = parsePlanExport(
      JSON.stringify(
        validEnvelope({
          tournament: {
            teamName: 'X',
            formationId: 'f',
            rosterSize: 1,
            games: [
              validWireGame({
                scheduledSubs: [
                  validWireSub({ outPlayer: 'p1', inPlayer: 'p1' }),
                ],
              }),
            ],
          },
        }),
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/outPlayer and inPlayer/);
  });

  it('rejects duplicate scheduledSub ids within the same game', () => {
    const result = parsePlanExport(
      JSON.stringify(
        validEnvelope({
          tournament: {
            teamName: 'X',
            formationId: 'f',
            rosterSize: 1,
            games: [
              validWireGame({
                scheduledSubs: [
                  validWireSub({ id: 'dup' }),
                  validWireSub({ id: 'dup', timeSec: 1200 }),
                ],
              }),
            ],
          },
        }),
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/duplicate/i);
  });

  it('pads missing/short included[] with true', () => {
    const result = parsePlanExport(
      JSON.stringify(
        validEnvelope({
          tournament: {
            teamName: 'X',
            formationId: 'f',
            rosterSize: 1,
            games: [
              validWireGame({ id: 'g1' }),
              validWireGame({ id: 'g2', label: 'Game 2' }),
            ],
          },
          included: [false], // shorter than games.length
        }),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.included).toEqual([false, true]);
  });
});

describe('serializePlanExport', () => {
  it('round-trips a parsed envelope (parse → serialize → parse equals input)', () => {
    const input = validEnvelope();
    const parsed = parsePlanExport(JSON.stringify(input));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const reSerialized = serializePlanExport(parsed.plan, {
      savedAt: input.savedAt,
    });
    const reParsed = parsePlanExport(reSerialized);
    expect(reParsed.ok).toBe(true);
    if (!reParsed.ok) return;

    expect(reParsed.plan.teamName).toBe(parsed.plan.teamName);
    expect(reParsed.plan.games).toEqual(parsed.plan.games);
    expect(reParsed.plan.included).toEqual(parsed.plan.included);
  });

  it('writes the standalone wire shape (timeSec/role, not timeSeconds/positionRole)', () => {
    const plan: ImportedPlan = {
      formatVersion: PLAN_FORMAT_VERSION,
      kind: PLAN_EXPORT_KIND,
      teamName: 'X',
      formationId: 'f',
      rosterSize: 1,
      games: [
        {
          id: 'g1',
          label: 'Game 1',
          time: '14:00',
          field: 'A',
          opponent: 'B',
          numberOfPeriods: 2,
          periodDurationMinutes: 12.5,
          durationMin: 25,
          halfTimeMin: 12.5,
          startingXI: { GK: 'p0' },
          scheduledSubs: [
            {
              id: 'sub_1',
              timeSeconds: 600,
              positionRole: 'CDM',
              outPlayer: 'p1',
              inPlayer: 'p2',
              status: 'pending',
            },
          ],
        },
      ],
      included: [true],
      currentVersionName: null,
    };

    const wire = JSON.parse(serializePlanExport(plan));
    const sub = wire.tournament.games[0].scheduledSubs[0];
    expect(sub.timeSec).toBe(600);
    expect(sub.role).toBe('CDM');
    expect(sub.timeSeconds).toBeUndefined();
    expect(sub.positionRole).toBeUndefined();
    // status is internal to MatchOps-Local; not part of the wire format
    expect(sub.status).toBeUndefined();
  });
});
