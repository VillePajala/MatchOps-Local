/**
 * Kirjuri GamePacket builder (Phase 3, PR 8a).
 *
 * @critical - this is the exact payload that leaves the device for the coach's
 * AI provider. Two promises are tested here rather than assumed: the consent
 * gate's "player names are replaced with codes before any drafting request"
 * (note text included), and the plan's trust tiers, which stop attested data
 * from being presented to the model as something that was observed.
 */
import {
  GAME_PACKET_SCHEMA_VERSION,
  buildGamePacket,
  gamePacketFingerprint,
  playerRedactionHandles,
  redactPlayerNames,
} from '../gamePacket';
import type { AppState, GameEvent } from '@/types/game';
import type { Player } from '@/types';

const player = (id: string, name: string, nickname?: string, extra: Partial<Player> = {}): Player => ({
  id,
  name,
  ...(nickname ? { nickname } : {}),
  ...extra,
});

const emma = player('p1', 'Emma Virtanen', 'Emma');
const matti = player('p2', 'Matti Korhonen', 'Matti');
const sofia = player('p3', 'Sofia Nieminen');
const bench = player('p4', 'Leo Laine');

const note = (id: string, time: number, text: string, over: Partial<GameEvent> = {}): GameEvent => ({
  id,
  type: 'note',
  time,
  text,
  source: 'dictation',
  ...over,
});

const baseGame = (over: Partial<AppState> = {}): AppState =>
  ({
    teamName: 'FC Testi',
    opponentName: 'HJK',
    gameDate: '2026-09-05',
    homeScore: 2,
    awayScore: 1,
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 25,
    gameNotes: '',
    selectedPlayerIds: ['p1', 'p2', 'p3'],
    availablePlayers: [],
    playersOnField: [],
    opponents: [],
    drawings: [],
    gameEvents: [],
    seasonId: '',
    tournamentId: '',
    ...over,
  }) as unknown as AppState;

const roster = [emma, matti, sofia, bench];

describe('buildGamePacket - trust tiers', () => {
  it('splits the packet into recorded / attested / planned and explains each to the model', () => {
    const { packet } = buildGamePacket({ game: baseGame(), players: roster });

    expect(packet.schemaVersion).toBe(GAME_PACKET_SCHEMA_VERSION);
    expect(packet.recorded.score).toEqual({ us: 2, them: 1 });
    expect(Object.keys(packet.trust)).toEqual(['recorded', 'attested', 'planned']);
    expect(packet.trust.attested).toMatch(/the coach/i);
    expect(packet.trust.planned).toMatch(/never/i);
  });

  it('keeps positions and note text out of the recorded section', () => {
    const { packet } = buildGamePacket({
      game: baseGame({
        playerPositions: { p1: ['LW'] },
        gameEvents: [note('n1', 60, 'Hyvä paine')],
      }),
      players: roster,
    });

    expect(JSON.stringify(packet.recorded)).not.toMatch(/LW|paine/);
    expect(packet.attested.squad.find((p) => p.ref === 'P1')?.positions).toEqual(['LW']);
    expect(packet.attested.notes[0].text).toBe('Hyvä paine');
  });

  it('marks planner minutes as planned and never as a record', () => {
    const { packet } = buildGamePacket({
      game: baseGame({ demandFactor: 4 }),
      players: roster,
      plannedMinutes: { p1: 30, p2: 20, p4: 40 },
    });

    expect(packet.planned.demandLevel).toBe(4);
    // Bench player p4 was never selected for this game, so no minutes for them.
    expect(packet.planned.minutes).toEqual([
      { ref: 'P1', plannedMinutes: 30 },
      { ref: 'P2', plannedMinutes: 20 },
    ]);
    expect(JSON.stringify(packet.recorded)).not.toMatch(/plannedMinutes|30/);
  });
});

describe('buildGamePacket - pseudonymization', () => {
  /** @critical - the consent gate promises codes, including inside note text. */
  it('sends no player name anywhere, note text included', () => {
    const { packet, refToPlayerId } = buildGamePacket({
      game: baseGame({
        gameEvents: [
          note('n1', 125, 'Emman syöttö oli rohkea'),
          note('n2', 300, 'Matille kannustusta, Sofia piti pään kylmänä', { entityId: 'p2' }),
        ],
        gameNotes: 'Emma ja Matti johtivat peliä.',
      }),
      players: roster,
    });

    const json = JSON.stringify(packet);
    for (const name of ['Emma', 'Emman', 'Matti', 'Matille', 'Sofia', 'Virtanen', 'Korhonen', 'Nieminen']) {
      expect(json).not.toContain(name);
    }
    expect(packet.attested.notes[0].text).toBe('P1 syöttö oli rohkea');
    expect(packet.attested.notes[1].text).toBe('P2 kannustusta, P3 piti pään kylmänä');
    expect(packet.attested.coachReport).toBe('P1 ja P2 johtivat peliä.');
    expect(packet.pseudonymized).toBe(true);
    // The mapping back stays with the caller and is not part of the payload.
    expect(refToPlayerId).toEqual({ P1: 'p1', P2: 'p2', P3: 'p3' });
    expect(json).not.toContain('refToPlayerId');
  });

  it('uses real names when the coach turned pseudonymization off, and keeps refs unique', () => {
    const otherEmma = player('p5', 'Emma Salo', 'Emma');
    const { packet, refToPlayerId } = buildGamePacket({
      game: baseGame({ selectedPlayerIds: ['p1', 'p5'], gameEvents: [note('n1', 60, 'Emman syöttö')] }),
      players: [emma, otherEmma],
      pseudonymize: false,
    });

    expect(packet.pseudonymized).toBe(false);
    expect(packet.attested.squad.map((p) => p.ref)).toEqual(['Emma', 'Emma (2)']);
    expect(refToPlayerId).toEqual({ Emma: 'p1', 'Emma (2)': 'p5' });
    // Text is left alone: the coach chose to send names.
    expect(packet.attested.notes[0].text).toBe('Emman syöttö');
  });

  it('leaves a note about an unselected player without a subject rather than leaking one', () => {
    const { packet } = buildGamePacket({
      game: baseGame({ gameEvents: [note('n1', 60, 'Hyvä veto', { entityId: 'p4' })] }),
      players: roster,
    });

    expect(packet.attested.notes[0].about).toBeUndefined();
    expect(packet.attested.squad).toHaveLength(3);
  });
});

describe('redactPlayerNames', () => {
  const refOf = (id: string) => ({ p1: 'P1', p2: 'P2' }[id]);

  it('replaces Finnish inflections and keeps the surrounding text intact', () => {
    expect(redactPlayerNames('Emmalle syöttö, Emman veto!', [emma, matti], refOf)).toBe('P1 syöttö, P1 veto!');
    expect(redactPlayerNames('Matin ja Emman yhteistyö', [emma, matti], refOf)).toBe('P2 ja P1 yhteistyö');
  });

  it('replaces surnames too - a coach may say one out loud', () => {
    expect(redactPlayerNames('Virtanen puolusti hyvin', [emma], refOf)).toBe('P1 puolusti hyvin');
  });

  it('survives a one-character transcription slip', () => {
    expect(redactPlayerNames('Emna otti pallon', [emma], refOf)).toBe('P1 otti pallon');
  });

  it('leaves text alone when nothing matches, and when there is no mapping', () => {
    expect(redactPlayerNames('Joukkue puolusti hyvin', [emma, matti], refOf)).toBe('Joukkue puolusti hyvin');
    expect(redactPlayerNames('Emman syöttö', [emma], () => undefined)).toBe('Emman syöttö');
  });

  it('collects nickname and every name part as a handle, ignoring short ones', () => {
    expect(playerRedactionHandles(player('x', 'Bo Li', 'Bo'))).toEqual([]);
    expect(playerRedactionHandles(emma).sort()).toEqual(['emma', 'virtanen']);
  });
});

describe('buildGamePacket - events, notes and coverage', () => {
  it('puts goals in clock order with minutes, sides and refs', () => {
    const { packet } = buildGamePacket({
      game: baseGame({
        gameEvents: [
          { id: 'g2', type: 'opponentGoal', time: 1500 },
          { id: 'g1', type: 'goal', time: 125, scorerId: 'p1', assisterId: 'p2', period: 1 },
        ] as GameEvent[],
      }),
      players: roster,
    });

    expect(packet.recorded.goals).toEqual([
      { minute: 2, team: 'us', period: 1, scorer: 'P1', assist: 'P2' },
      { minute: 25, team: 'them' },
    ]);
  });

  it('carries note source, period, subject and tag, in clock order', () => {
    const { packet } = buildGamePacket({
      game: baseGame({
        gameEvents: [
          note('n2', 600, 'Puoliaikapuhe', { source: 'manual', period: 2, tag: 'halftime' }),
          note('n1', 90, 'Rohkea aloitus', { entityId: 'p3' }),
        ],
      }),
      players: roster,
    });

    expect(packet.attested.notes).toEqual([
      { minute: 1, text: 'Rohkea aloitus', source: 'dictation', about: 'P3' },
      { minute: 10, text: 'Puoliaikapuhe', source: 'manual', period: 2, tag: 'halftime' },
    ]);
  });

  it('reports coverage with denominators so the model can see the gaps', () => {
    const { packet } = buildGamePacket({
      game: baseGame({
        playerPositions: { p1: ['CM'], p2: [] },
        assessments: { p1: { overall: 7, sliders: {} } } as unknown as AppState['assessments'],
        gameEvents: [note('n1', 60, 'x', { entityId: 'p1' }), note('n2', 120, 'y', { entityId: 'p1' })],
        gameNotes: 'Yleiskuva: hyvä',
      }),
      players: roster,
    });

    expect(packet.coverage).toEqual({
      playersSelected: 3,
      playersWithNotes: 1,
      notes: 2,
      playersWithPositions: 1,
      assessmentsDone: 1,
      assessmentsTotal: 3,
      coachReport: true,
    });
  });

  /** The coach's ratings are their judgement, not material for a draft. */
  it('never sends assessment values, only their coverage', () => {
    const { packet } = buildGamePacket({
      game: baseGame({
        assessments: {
          p1: { overall: 9, sliders: { effort: 10, passing: 3 } },
        } as unknown as AppState['assessments'],
      }),
      players: roster,
    });

    const json = JSON.stringify(packet);
    expect(json).not.toContain('sliders');
    expect(json).not.toContain('effort');
    expect(packet.coverage.assessmentsDone).toBe(1);
  });

  it('omits optional fields the app has no value for', () => {
    const { packet } = buildGamePacket({ game: baseGame(), players: roster });

    expect(packet.recorded).not.toHaveProperty('time');
    expect(packet.recorded).not.toHaveProperty('location');
    expect(packet.recorded).not.toHaveProperty('wentToOvertime');
    expect(packet.attested).not.toHaveProperty('coachReport');
    expect(packet.planned).toEqual({});
  });
});

describe('gamePacketFingerprint', () => {
  it('is stable for the same data and changes when the data changes', () => {
    const build = (over: Partial<AppState> = {}) =>
      buildGamePacket({ game: baseGame(over), players: roster }).packet;

    expect(gamePacketFingerprint(build())).toBe(gamePacketFingerprint(build()));
    expect(gamePacketFingerprint(build())).not.toBe(gamePacketFingerprint(build({ homeScore: 5 })));
    expect(gamePacketFingerprint(build())).toMatch(/^v1-[0-9a-f]{16}$/);
  });
});
