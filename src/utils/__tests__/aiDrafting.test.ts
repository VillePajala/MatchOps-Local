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
    await expect(draftMatchReport({ packet })).rejects.toMatchObject({ kind: 'invalidResponse' });
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
    expect(text).toContain('the coach noted');
    expect(text).toContain('P?');
    expect(text).toMatch(/coverage/i);
    expect(text).toMatch(/never invent/i);
    expect(text).toContain('fi');
  });

  it('estimates a cost the UI can show before spending anything', () => {
    const usd = estimateDraftUsd(makePacket());
    expect(usd).toBeGreaterThan(0);
    expect(usd).toBeLessThan(0.02);
  });
});
