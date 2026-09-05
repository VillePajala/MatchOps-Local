/**
 * Kirjuri match-report drafting (Phase 3, PR 8b).
 *
 * @critical - this module spends the coach's money and produces text about
 * named children. The tests that matter here are the refusals: no key means no
 * request, an oversized packet is refused before it is billed, and a draft that
 * names a player the packet never contained loses that item rather than having
 * it mapped onto a real child.
 */
import {
  DRAFTING_MODEL,
  DraftingError,
  MAX_COMPLETION_TOKENS,
  MAX_PACKET_CHARS,
  MAX_PLAYER_NOTE_CHARS,
  MAX_SECTION_CHARS,
  REPORT_SECTIONS,
  buildDraftingInstructions,
  draftMatchReport,
  estimateDraftUsd,
  validateDraft,
} from '../aiDrafting';
import { buildGamePacket } from '../gamePacket';
import type { GamePacket } from '../gamePacket';
import { acceptAiConsent, resetAiProviderStateForTests, setAiProviderKey } from '@/utils/aiProvider';
import type { AppState } from '@/types/game';
import type { Player } from '@/types';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  resetAiProviderStateForTests();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const connect = () => {
  acceptAiConsent();
  setAiProviderKey('sk-proj-abcdefghijklmnop');
};

const players: Player[] = [
  { id: 'p1', name: 'Emma Virtanen', nickname: 'Emma' } as Player,
  { id: 'p2', name: 'Matti Korhonen', nickname: 'Matti' } as Player,
];

const makePacket = (over: Partial<AppState> = {}): GamePacket =>
  buildGamePacket({
    game: {
      teamName: 'FC Testi',
      opponentName: 'HJK',
      gameDate: '2026-09-05',
      homeScore: 2,
      awayScore: 1,
      homeOrAway: 'home',
      numberOfPeriods: 2,
      periodDurationMinutes: 25,
      gameNotes: '',
      selectedPlayerIds: ['p1', 'p2'],
      gameEvents: [],
      ...over,
    } as unknown as AppState,
    players,
  }).packet;

const okResponse = (payload: unknown, usage?: Record<string, number>) => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: 'stop' }],
    ...(usage ? { usage } : {}),
  }),
});

const fullDraft = {
  sections: REPORT_SECTIONS.map((section) => ({ section, text: `Teksti ${section}` })),
  playerNotes: [{ ref: 'P1', text: 'Rohkeaa peliä' }],
  dataCaveat: null,
};

describe('draftMatchReport - refusals before the request', () => {
  /** @critical - no key must mean no request, not a failed one. */
  it('refuses without a connected provider and never calls out', async () => {
    await expect(draftMatchReport({ packet: makePacket() })).rejects.toMatchObject({ kind: 'unauthorized' });
    acceptAiConsent();
    await expect(draftMatchReport({ packet: makePacket() })).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** @critical - an oversized packet is refused, not billed to the coach. */
  it('refuses a packet bigger than the cap before spending anything', async () => {
    connect();
    const huge = makePacket({ gameNotes: 'x'.repeat(MAX_PACKET_CHARS + 100) });
    await expect(draftMatchReport({ packet: huge })).rejects.toMatchObject({ kind: 'tooLarge' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('draftMatchReport - the request', () => {
  it('posts the packet with the cheap model, a token cap and the key only in the header', async () => {
    connect();
    fetchMock.mockResolvedValue(okResponse(fullDraft));
    const packet = makePacket();

    await draftMatchReport({ packet });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(url).not.toContain('sk-');
    expect(init.headers.Authorization).toBe('Bearer sk-proj-abcdefghijklmnop');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe(DRAFTING_MODEL);
    expect(sent.max_completion_tokens).toBe(MAX_COMPLETION_TOKENS);
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(sent.response_format.json_schema.schema.properties.sections.items.properties.section.enum).toEqual([
      ...REPORT_SECTIONS,
    ]);
    // The packet travels as the user message, the honesty rules as the system one.
    expect(JSON.parse(sent.messages[1].content)).toEqual(packet);
    expect(sent.messages[0].content).toContain('recorded');
  });

  /** The coach's own choice wins over the default, with no silent fallback. */
  it('uses the model the coach picked, and the default when they have not', async () => {
    connect();
    fetchMock.mockResolvedValue(okResponse(fullDraft));

    await draftMatchReport({ packet: makePacket() });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe(DRAFTING_MODEL);

    const { setAiModel } = jest.requireActual('@/utils/aiProvider') as { setAiModel: (m: string | null) => void };
    setAiModel('gpt-5.4-mini');
    await draftMatchReport({ packet: makePacket() });
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(sent.model).toBe('gpt-5.4-mini');

    // And the draft records which model actually wrote it.
    const draft = await draftMatchReport({ packet: makePacket() });
    expect(draft.model).toBe('gpt-5.4-mini');

    setAiModel(null);
    await draftMatchReport({ packet: makePacket() });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body as string).model).toBe(DRAFTING_MODEL);
  });

  it('maps provider failures to typed errors', async () => {
    connect();
    const packet = makePacket();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(draftMatchReport({ packet })).rejects.toMatchObject({ kind: 'unauthorized' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(draftMatchReport({ packet })).rejects.toMatchObject({ kind: 'rateLimited' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
    await expect(draftMatchReport({ packet })).rejects.toMatchObject({ kind: 'rejected' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(draftMatchReport({ packet })).rejects.toMatchObject({ kind: 'network' });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(draftMatchReport({ packet })).rejects.toBeInstanceOf(DraftingError);
  });

  /** A wrong model id is the likeliest 400; the log must name it without
   *  echoing the match data the provider may quote back in `message`. */
  it('logs which parameter the provider objected to, never its message text', async () => {
    connect();
    const logger = (jest.requireMock('@/utils/logger') as { default: { warn: jest.Mock } }).default;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          type: 'invalid_request_error',
          code: 'model_not_found',
          param: 'model',
          message: 'The model does not exist. Request contained: Emman syöttö',
        },
      }),
    });

    await expect(draftMatchReport({ packet: makePacket() })).rejects.toMatchObject({ kind: 'rejected' });

    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('model_not_found');
    expect(logged).toContain('"param":"model"');
    expect(logged).not.toContain('Emman');
    expect(logged).not.toContain('message');
  });

  /** @critical - what the owner actually hit: a 200 with nothing usable in it.
   *  "unreadable" is useless; the cause has to reach the message. */
  it('separates an empty answer from unreadable JSON, and logs the shape without the words', async () => {
    connect();
    const logger = (jest.requireMock('@/utils/logger') as { default: { warn: jest.Mock } }).default;

    // A reasoning model that spent the whole budget thinking.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 1200, completion_tokens: 4000, completion_tokens_details: { reasoning_tokens: 4000 } },
      }),
    });
    await expect(draftMatchReport({ packet: makePacket() })).rejects.toMatchObject({
      kind: 'noOutput',
      message: expect.stringMatching(/budget/i),
      // 1200/1M * 0.25 + 4000/1M * 2.00 = 0.0003 + 0.008, rounded up to 4 places.
      billedUsd: 0.0083,
    });

    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('"reasoningTokens":4000');
    expect(logged).toContain('"finishReason":"length"');

    // Content present but not JSON, and not truncated: a different failure.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Tässä on raporttisi!' }, finish_reason: 'stop' }] }),
    });
    await expect(draftMatchReport({ packet: makePacket() })).rejects.toMatchObject({ kind: 'invalidResponse' });

    // Nothing logged carries the model's words.
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('raporttisi');
  });

  it('treats a refusal and a cut-off answer as distinct failures', async () => {
    connect();
    const packet = makePacket();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { refusal: 'I cannot help with that' } }] }),
    });
    await expect(draftMatchReport({ packet })).rejects.toMatchObject({ kind: 'rejected' });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"sections":[{"sect' }, finish_reason: 'length' }] }),
    });
    await expect(draftMatchReport({ packet })).rejects.toMatchObject({ kind: 'noOutput' });
  });

  it('passes the caller signal through so leaving the screen cancels the request', async () => {
    connect();
    fetchMock.mockResolvedValue(okResponse(fullDraft));
    const controller = new AbortController();
    await draftMatchReport({ packet: makePacket(), signal: controller.signal });
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
  });

  it('returns provenance and what the answer actually cost', async () => {
    connect();
    fetchMock.mockResolvedValue(okResponse(fullDraft, { prompt_tokens: 1500, completion_tokens: 800 }));

    const draft = await draftMatchReport({ packet: makePacket() });

    expect(draft.model).toBe(DRAFTING_MODEL);
    expect(draft.packetFingerprint).toMatch(/^v1-[0-9a-f]{16}$/);
    expect(draft.usage).toEqual({
      inputTokens: 1500,
      outputTokens: 800,
      // 1500/1M * 0.25 + 800/1M * 2.00 = 0.000375 + 0.0016
      estimatedUsd: 0.002,
    });
  });
});

describe('validateDraft', () => {
  const packet = makePacket();

  /** @critical - an invented ref must never be mapped onto a real child. */
  it('drops a player note whose ref was not in the packet', () => {
    const draft = validateDraft(
      {
        sections: [{ section: 'overview', text: 'Hyvä ottelu' }],
        playerNotes: [
          { ref: 'P1', text: 'Rohkea' },
          { ref: 'P9', text: 'Loistava suoritus' },
          { ref: 'Emma', text: 'Nimellä' },
        ],
        dataCaveat: null,
      },
      packet,
    );

    expect(draft.playerNotes).toEqual([{ ref: 'P1', text: 'Rohkea' }]);
  });

  it('keeps only known sections, de-duplicates them and restores template order', () => {
    const draft = validateDraft(
      {
        sections: [
          { section: 'next', text: 'Seuraava' },
          { section: 'overview', text: 'Yleis' },
          { section: 'overview', text: 'Toinen yleis' },
          { section: 'invented', text: 'Ei kuulu' },
        ],
        playerNotes: [],
        dataCaveat: null,
      },
      packet,
    );

    expect(draft.sections).toEqual([
      { section: 'overview', text: 'Yleis' },
      { section: 'next', text: 'Seuraava' },
    ]);
  });

  it('clamps long text instead of letting it through', () => {
    const draft = validateDraft(
      {
        sections: [{ section: 'overview', text: 'a'.repeat(MAX_SECTION_CHARS + 500) }],
        playerNotes: [{ ref: 'P2', text: 'b'.repeat(MAX_PLAYER_NOTE_CHARS + 500) }],
        dataCaveat: null,
      },
      packet,
    );

    expect(draft.sections[0].text).toHaveLength(MAX_SECTION_CHARS);
    expect(draft.playerNotes[0].text).toHaveLength(MAX_PLAYER_NOTE_CHARS);
  });

  it('rejects a response with nothing usable in it', () => {
    expect(() => validateDraft(null, packet)).toThrow(DraftingError);
    expect(() => validateDraft({ sections: 'nope' }, packet)).toThrow(DraftingError);
    expect(() => validateDraft({ sections: [{ section: 'overview', text: '   ' }] }, packet)).toThrow(DraftingError);
  });

  it('keeps a data caveat when the model wrote one, and omits it otherwise', () => {
    const base = { sections: [{ section: 'overview', text: 'Hyvä' }], playerNotes: [] };
    expect(validateDraft({ ...base, dataCaveat: 'Vähän havaintoja.' }, packet).dataCaveat).toBe('Vähän havaintoja.');
    expect(validateDraft({ ...base, dataCaveat: null }, packet).dataCaveat).toBeUndefined();
  });
});

describe('instructions and cost hint', () => {
  it('tells the model the trust tiers, the unknown ref and the coverage rule', () => {
    const text = buildDraftingInstructions(makePacket());
    expect(text).toContain('recorded');
    // The report is the coach's own document, so it is written in the report's
    // voice, not attributed back to the person reading it.
    expect(text).toMatch(/impersonal/i);
    expect(text).toMatch(/passive/i);
    expect(text).not.toMatch(/the coach noted/i);
    expect(text).toMatch(/not licence to claim more than the data holds/i);
    expect(text).toContain('P?');
    expect(text).toMatch(/coverage/i);
    expect(text).toMatch(/never invent/i);
    expect(text).toContain('fi');
  });

  /** Without this the model guesses: position codes read as initials, two
   *  periods are not halves, and nine-year-olds get professional analysis. */
  it('explains the sport, the age group, the structure and the position codes', () => {
    const text = buildDraftingInstructions(
      makePacket({ ageGroup: 'U11', gameType: 'soccer', wentToPenalties: true } as never),
    );

    expect(text).toMatch(/association football \(soccer\)/i);
    expect(text).toMatch(/U11/);
    expect(text).toMatch(/not professional analysis/i);
    expect(text).toMatch(/a parent may well read it/i);
    expect(text).toMatch(/call them halves/i);
    // The codes are roles, and the model is told which line each belongs to.
    expect(text).toMatch(/GK goalkeeper/);
    expect(text).toMatch(/LW ST RW the front line/);
    expect(text).toMatch(/"us" in the goal list means FC Testi/);
    expect(text).toMatch(/penalty shootout/i);
  });

  it('describes futsal differently, because it is a different game', () => {
    const text = buildDraftingInstructions(makePacket({ gameType: 'futsal' } as never));

    expect(text).toMatch(/futsal \(five-a-side indoor football\)/i);
    expect(text).toMatch(/smaller heavier ball/i);
    expect(text).not.toMatch(/association football/i);
  });

  /** @critical - real drafts came back narrating the bookkeeping: "torjuntoja
   *  kirjattiin tarkeiksi", "maali merkittiin 0. minuutilla". */
  it('forbids writing about the act of recording, and about a minute that is not there', () => {
    const text = buildDraftingInstructions(makePacket());

    expect(text).toMatch(/NEVER WRITE ABOUT THE RECORD ITSELF/);
    expect(text).toMatch(/kirjattiin/);
    expect(text).toMatch(/merkittiin/);
    expect(text).toMatch(/never guess one/i);
    // Minute 0 is real - the opening minute - and must be phrased, not denied.
    expect(text).toMatch(/opening minute/i);
    expect(text).toMatch(/never "0\. minuutilla"/i);
  });

  it('estimates a cost the UI can show before spending anything', () => {
    const usd = estimateDraftUsd(makePacket());
    expect(usd).toBeGreaterThan(0);
    expect(usd).toBeLessThan(0.02);
  });
});
