/**
 * Day report AI: the packet sent to the coach's own provider, and the request.
 *
 * @critical - this text is about named children. With pseudonymization on, no
 * name may leave the device: not as a scorer, not inside a game's own report.
 */
import type { Player } from '@/types';
import { TestFixtures } from '../../../tests/fixtures';
import { acceptAiConsent, resetAiProviderStateForTests, setAiProviderKey } from '@/utils/aiProvider';
import { setLabsEnabled } from '@/utils/labs';
import { DraftingError, REPORT_SECTIONS, draftDaySummary, validateDaySummary } from '@/utils/aiDrafting';
import { buildDayReport, type DayReportGameInput } from './dayReport';
import { buildDayPacket } from './dayReportPacket';
import type { PlaytimePlan } from './types';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  resetAiProviderStateForTests();
  setLabsEnabled(true);
  global.fetch = fetchMock as unknown as typeof fetch;
});

const roster: Player[] = [
  { id: 'p1', name: 'Emma Virtanen', nickname: 'Emma' } as Player,
  { id: 'p2', name: 'Matti Korhonen' } as Player,
];
const plan: PlaytimePlan = {
  id: 'plan',
  name: 'Joulufutis',
  version: 1,
  createdAt: '',
  updatedAt: '',
  players: [{ id: 'p1', name: 'Emma Virtanen' }, { id: 'p2', name: 'Matti Korhonen' }],
  games: [],
};
const t = (_k: string, fallback: string) => fallback;

const inputs = (): DayReportGameInput[] => [
  {
    planGameId: 'a',
    gameId: 'g1',
    game: TestFixtures.games.completed({
      teamName: 'Kotkat P11',
      opponentName: 'Kallion Kiri',
      homeScore: 2,
      awayScore: 1,
      homeOrAway: 'home',
      availablePlayers: roster,
      selectedPlayerIds: ['p1', 'p2'],
      gameEvents: [{ id: 'e', type: 'goal', time: 10, scorerId: 'p1', assisterId: 'p2' }],
      gameNotes: 'Emman maali oli hieno, Matille kiitos syötöstä.',
    }),
  },
  {
    planGameId: 'b',
    gameId: 'g2',
    game: TestFixtures.games.newGame({ opponentName: 'Ei pelattu', gameEvents: [], homeScore: 0, awayScore: 0 }),
  },
];

const build = (pseudonymize: boolean) => {
  const day = inputs();
  const report = buildDayReport(plan, day, roster, t);
  return buildDayPacket({ report, inputs: day, roster, pseudonymize, language: 'fi' });
};

describe('buildDayPacket', () => {
  /** @critical no names leave the device with pseudonymization on */
  it('replaces every name with a code, including inside the games\' own reports', () => {
    const { packet, refToName } = build(true);
    const json = JSON.stringify(packet);
    expect(json).not.toMatch(/Emma|Matti|Matille|Virtanen|Korhonen/);
    expect(packet.games).toHaveLength(1); // the unplayed game is not sent
    expect(packet.games[0]).toMatchObject({
      number: 1,
      opponentName: 'Kallion Kiri',
      result: 'win',
      score: { us: 2, them: 1 },
      goals: [{ scorer: 'X1', assist: 'X2' }],
    });
    expect(packet.games[0].coachReport).toContain('X1');
    expect(packet.games[0].coachReport).toContain('X2');
    expect(refToName).toMatchObject({ X1: 'Emma', X2: 'Matti Korhonen' });
    expect(packet.teamName).toBe('Kotkat P11');
  });

  it('sends names as written when the coach turned pseudonymization off', () => {
    const { packet } = build(false);
    expect(packet.pseudonymized).toBe(false);
    expect(packet.games[0].goals[0]).toEqual({ scorer: 'Emma', assist: 'Matti Korhonen' });
    expect(packet.games[0].coachReport).toContain('Emman');
  });
});

const connect = () => {
  acceptAiConsent();
  setAiProviderKey('sk-proj-abcdefghijklmnop');
};

const okResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1000, completion_tokens: 500 },
  }),
});

describe('draftDaySummary', () => {
  /** @critical labs off or no provider: no request at all */
  it('refuses without a connected provider and never calls out', async () => {
    const { packet } = build(true);
    await expect(draftDaySummary({ packet })).rejects.toMatchObject({ kind: 'unauthorized' });
    connect();
    setLabsEnabled(false);
    await expect(draftDaySummary({ packet })).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the packet and returns the sections in template order', async () => {
    connect();
    fetchMock.mockResolvedValue(
      okResponse({ sections: [{ section: 'next', text: 'Jatketaan.' }, { section: 'overview', text: 'Hyvä päivä, X1 loisti.' }] }),
    );
    const { packet } = build(true);
    const draft = await draftDaySummary({ packet });
    expect(draft.sections.map((s) => s.section)).toEqual(['overview', 'next']);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[1].content).toBe(JSON.stringify(packet));
    expect(body.response_format.json_schema.name).toBe('day_report_draft');
    expect(draft.usage?.inputTokens).toBe(1000);
  });

  it('refuses a day with no played games before any request', async () => {
    connect();
    const { packet } = build(true);
    await expect(draftDaySummary({ packet: { ...packet, games: [] } })).rejects.toBeInstanceOf(DraftingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('validateDaySummary', () => {
  it('drops unknown, duplicate and empty sections', () => {
    const sections = validateDaySummary({
      sections: [
        { section: 'overview', text: 'A' },
        { section: 'overview', text: 'B' },
        { section: 'bogus', text: 'C' },
        { section: 'flow', text: '   ' },
        ...REPORT_SECTIONS.slice(2, 3).map((section) => ({ section, text: 'D' })),
      ],
    });
    expect(sections).toEqual([
      { section: 'overview', text: 'A' },
      { section: REPORT_SECTIONS[2], text: 'D' },
    ]);
  });

  it('throws when nothing usable came back', () => {
    expect(() => validateDaySummary({ sections: [] })).toThrow(DraftingError);
  });
});
