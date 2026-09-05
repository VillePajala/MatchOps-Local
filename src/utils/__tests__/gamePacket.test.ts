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
    expect(packet.trust.attested).toMatch(/no invented detail/i);
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

describe('buildGamePacket - names outside the squad', () => {
  /** @critical - the leak this test was written to catch: a roster player who
   *  was not selected still gets named in dictation, and had gone out in full. */
  it('redacts a roster name that has no ref in this game', () => {
    const { packet } = buildGamePacket({
      game: baseGame({ gameEvents: [note('n1', 60, 'Leo tuli hyvin mukaan, Emma syötti')] }),
      players: roster,
    });

    expect(packet.attested.notes[0].text).toBe('P? tuli hyvin mukaan, P1 syötti');
    expect(JSON.stringify(packet)).not.toContain('Leo');
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

  /**
   * @critical - a hyphenated first name went to the provider in cleartext. The
   * handle was the joined "juha-pekka" while the text tokeniser split the word
   * on the hyphen, so neither half ever met its handle and the promise of
   * "codes, always" quietly did not hold for these children.
   */
  it('redacts a hyphenated name, whole or by either part', () => {
    const jp = { id: 'p1', name: 'Juha-Pekka Virtanen' } as Player;
    expect(redactPlayerNames('Juha-Pekka teki syötön', [jp], refOf)).toBe('P1 teki syötön');
    // The pitch name, not the team-sheet name.
    expect(redactPlayerNames('Juha teki syötön', [jp], refOf)).toBe('P1 teki syötön');
    expect(redactPlayerNames('Pekka teki syötön', [jp], refOf)).toBe('P1 teki syötön');
    // ...and inflected on the compound.
    expect(redactPlayerNames('Juha-Pekan syöttö', [jp], refOf)).toBe('P1 syöttö');
  });

  it('redacts a name held together by an apostrophe', () => {
    const liam = { id: 'p1', name: "Liam O'Brien" } as Player;
    expect(redactPlayerNames("O'Brien torjui", [liam], refOf)).toBe('P1 torjui');
  });

  /**
   * @critical - two-letter names exist, and the old three-character floor meant
   * the app said "names are replaced with codes" and then sent them.
   */
  it('redacts a two-letter name, but only where it stands alone', () => {
    const bo = { id: 'p1', name: 'Bo Nieminen' } as Player;
    expect(redactPlayerNames('Bo puolusti hyvin', [bo], refOf)).toBe('P1 puolusti hyvin');
    // No inflection rule is safe at two letters, so nothing else may match.
    expect(redactPlayerNames('Bonus oli iso, bussi tuli', [bo], refOf)).toBe('Bonus oli iso, bussi tuli');
  });

  it('leaves ordinary hyphenated words alone', () => {
    expect(redactPlayerNames('ala-aste ja sivu-ura', [emma, matti], refOf)).toBe('ala-aste ja sivu-ura');
  });

  it('leaves text alone when nothing matches', () => {
    expect(redactPlayerNames('Joukkue puolusti hyvin', [emma, matti], refOf)).toBe('Joukkue puolusti hyvin');
  });

  /** @critical - a name with no ref is still a child's name. */
  it('removes a name that has no ref instead of leaving it in cleartext', () => {
    expect(redactPlayerNames('Emman syöttö', [emma], () => undefined)).toBe('P? syöttö');
  });

  /** @critical - two Emmas in one team: drop the name, never guess the child. */
  it('uses the unknown ref when a word could be either of two players', () => {
    const otherEmma = player('p9', 'Emma Salo', 'Emma');
    expect(redactPlayerNames('Emman veto', [emma, otherEmma], (id) => ({ p1: 'P1', p9: 'P2' }[id]))).toBe(
      'P? veto',
    );
  });

  it('tells similar but distinct names apart instead of giving up', () => {
    const emmi = player('p9', 'Emmi Koski', 'Emmi');
    const ref = (id: string) => ({ p1: 'P1', p9: 'P2' }[id]);
    expect(redactPlayerNames('Emman ja Emmin veto', [emma, emmi], ref)).toBe('P1 ja P2 veto');
  });

  /** @critical - redaction happens BEFORE the request, so its mistakes are never
   *  reviewed by anyone; ordinary Finnish words must survive it. */
  it('leaves ordinary Finnish words alone next to similar names', () => {
    const leo = player('p8', 'Leo Laine', 'Leo');
    const squad = [emma, matti, sofia, leo];
    const ref = (id: string) => ({ p1: 'P1', p2: 'P2', p3: 'P3', p8: 'P4' }[id]);
    const words = 'Hyvä paine ja laittaa pallo, aikaa oli, sofalla istuttiin, emmekä luovuttaneet';
    expect(redactPlayerNames(words, squad, ref)).toBe(words);
  });

  it('still catches real inflections and gradation', () => {
    const squad = [emma, matti, sofia];
    const ref = (id: string) => ({ p1: 'P1', p2: 'P2', p3: 'P3' }[id]);
    expect(redactPlayerNames('Matin pallo Emmalle, Sofian veto', squad, ref)).toBe('P2 pallo P1, P3 veto');
    expect(redactPlayerNames('Matille ja Mattia kehuttiin', squad, ref)).toBe('P2 ja P2 kehuttiin');
    expect(redactPlayerNames('Niemisen kulmapotku', squad, ref)).toBe('P3 kulmapotku');
  });

  it('does not let a three-letter name swallow a long unrelated word', () => {
    const leo = player('p8', 'Leo Laine', 'Leo');
    const ref = (id: string) => (id === 'p8' ? 'P1' : undefined);
    expect(redactPlayerNames('leopardin nopeus', [leo], ref)).toBe('leopardin nopeus');
    expect(redactPlayerNames('Leolle syöttö', [leo], ref)).toBe('P1 syöttö');
  });

  /**
   * This test used to assert that "Bo Li" produced NO handles - i.e. it pinned
   * the leak in place as if it were a rule. A child whose name is two letters
   * is still a child the consent gate promised to replace with a code, so the
   * floor is now two and short handles match only themselves.
   */
  it('collects nickname and every name part as a handle, down to two letters', () => {
    expect(playerRedactionHandles(player('x', 'Bo Li', 'Bo')).sort()).toEqual(['bo', 'li']);
    expect(playerRedactionHandles(emma).sort()).toEqual(['emma', 'virtanen']);
  });

  it('keeps a compound name and each of its parts', () => {
    expect(playerRedactionHandles(player('x', 'Juha-Pekka Virtanen')).sort())
      .toEqual(['juha', 'juha-pekka', 'pekka', 'virtanen']);
  });

  it('drops a single letter, which cannot be told from an initial', () => {
    expect(playerRedactionHandles(player('x', 'A Virtanen')).sort()).toEqual(['virtanen']);
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

  /**
   * @critical - a goal at clock ZERO has no time on it, and sending minute 0
   * made the draft state an invented fact ("merkittiin 0. minuutilla"). A goal
   * at 0:45 is a real reading and must survive: an earlier fix dropped
   * everything under a minute and threw those away with the unset ones.
   */
  it('omits the minute only when the clock never ran', () => {
    const { packet } = buildGamePacket({
      game: baseGame({
        gameEvents: [
          { id: 'g1', type: 'goal', time: 0, scorerId: 'p1' },
          { id: 'g2', type: 'goal', time: 45, scorerId: 'p2' },
          { id: 'g3', type: 'opponentGoal', time: 900 },
          note('n1', 0, 'Hyvä alku'),
          note('n2', 600, 'Hyvä paine'),
        ] as GameEvent[],
      }),
      players: roster,
    });

    // Clock never ran: no minute at all.
    expect(packet.recorded.goals[0]).not.toHaveProperty('minute');
    expect(packet.attested.notes[0]).not.toHaveProperty('minute');
    // A real reading in the opening minute survives as minute 0.
    expect(packet.recorded.goals[1].minute).toBe(0);
    expect(packet.recorded.goals[2].minute).toBe(15);
    expect(packet.attested.notes[1].minute).toBe(10);
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
