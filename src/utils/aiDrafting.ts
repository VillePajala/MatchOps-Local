/**
 * Kirjuri match-report drafting (Phase 3, PR 8b).
 *
 * Sends a GamePacket from this device to the coach's own AI provider and turns
 * the answer into a DRAFT the coach reviews item by item (PR 9). Nothing here
 * writes to the game: this module returns a proposal, never a saved record.
 *
 * WHAT PROTECTS THE COACH HERE:
 *
 * - **Their money.** The model is the cheap tier, `max_completion_tokens` is
 *   capped, and an oversized packet is refused before the request rather than
 *   billed. `estimateDraftUsd` gives the UI a number to show first.
 * - **Their key.** It travels in the Authorization header only - never a URL,
 *   never a log, never a thrown error.
 * - **The children in the data.** `validateDraft` drops any item referring to
 *   a player ref the packet did not contain. A model that invents "P9" must
 *   not have that mapped onto a real child by the review screen.
 * - **Their patience.** 60 s timeout, and the caller's AbortSignal is honoured
 *   so leaving the screen cancels the request.
 *
 * The seven headings are fixed and match the report template the app already
 * ships. Keys are stable identifiers, not the Finnish or English labels, so the
 * review screen renders them in the coach's language.
 */

import { AI_PROVIDERS, getAiProviderKey, getAiProviderState } from '@/utils/aiProvider';
import type { GamePacket } from '@/utils/gamePacket';
import { gamePacketFingerprint } from '@/utils/gamePacket';
import logger from '@/utils/logger';

/**
 * Cheap reasoning-light tier: this is the coach's own bill, and a match report
 * is a summarising job. Verify against the provider's current model list before
 * a release; a wrong id fails loudly with `rejected` rather than costing money.
 */
export const DRAFTING_MODEL = 'gpt-5-mini';
/** Rough list prices in USD per 1M tokens, for the cost hint only. */
export const DRAFTING_USD_PER_1M_INPUT = 0.25;
export const DRAFTING_USD_PER_1M_OUTPUT = 2.0;
/**
 * Hard ceiling on what we will pay for in one answer.
 *
 * Sized for a reasoning-capable model: those spend part of this budget thinking
 * before they write, and a budget that only covers the prose comes back with an
 * empty answer and `finish_reason: 'length'`. 4000 output tokens is still under
 * a cent at this tier.
 */
export const MAX_COMPLETION_TOKENS = 4000;
/** Refuse before sending: a packet this big means something is wrong upstream. */
export const MAX_PACKET_CHARS = 60_000;
const REQUEST_TIMEOUT_MS = 60_000;
/** Caps applied to whatever comes back, before the coach ever sees it. */
export const MAX_SECTION_CHARS = 1200;
export const MAX_PLAYER_NOTE_CHARS = 400;
export const MAX_PLAYER_NOTES = 30;

/** The seven headings of the app's own match-report template, in order. */
export const REPORT_SECTIONS = [
  'overview',
  'flow',
  'worked',
  'improve',
  'spirit',
  'mentions',
  'next',
] as const;
export type ReportSectionKey = (typeof REPORT_SECTIONS)[number];

export interface DraftSection {
  section: ReportSectionKey;
  text: string;
}

export interface DraftPlayerNote {
  /** A ref from the packet's squad. Anything else is dropped in validation. */
  ref: string;
  text: string;
}

export interface DraftUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

export interface ReportDraft {
  sections: DraftSection[];
  playerNotes: DraftPlayerNote[];
  /** The model's own note about thin data, when it had something to say. */
  dataCaveat?: string;
  /** Provenance for `aiMeta`: which model, from which packet. */
  model: string;
  packetFingerprint: string;
  usage?: DraftUsage;
}

export type DraftingFailure =
  | 'unauthorized'
  | 'rateLimited'
  | 'network'
  | 'rejected'
  | 'tooLarge'
  /** The call succeeded but the model wrote nothing usable, or ran out of budget. */
  | 'noOutput'
  | 'invalidResponse';

export class DraftingError extends Error {
  constructor(
    public readonly kind: DraftingFailure,
    message: string = kind,
  ) {
    super(message);
    this.name = 'DraftingError';
  }
}

/** Chars per token, near enough for a pre-flight cost hint. */
const CHARS_PER_TOKEN = 4;

export function estimateDraftUsd(packet: GamePacket): number {
  const inputTokens = JSON.stringify(packet).length / CHARS_PER_TOKEN;
  const usd =
    (inputTokens / 1_000_000) * DRAFTING_USD_PER_1M_INPUT +
    (MAX_COMPLETION_TOKENS / 1_000_000) * DRAFTING_USD_PER_1M_OUTPUT;
  return Math.ceil(usd * 100) / 100;
}

/**
 * What the model is told before it sees the data.
 *
 * Every line here exists because of the plan's data honesty rules: the trust
 * tiers decide what may be stated as fact, coverage decides what must not be
 * generalised, and a youth-football report about named children is no place
 * for invented detail.
 */
export function buildDraftingInstructions(packet: GamePacket): string {
  return [
    'You draft a youth football match report for the coach who was there.',
    `Write in ${packet.language}. Plain prose, no markdown, no headings inside a section's text.`,
    '',
    'THE DATA HAS THREE KINDS OF RELIABILITY, and you must respect them:',
    `- recorded: ${packet.trust.recorded}`,
    `- attested: ${packet.trust.attested}`,
    `- planned: ${packet.trust.planned}`,
    '',
    'RULES:',
    '1. Never invent an event, a player, a number or a detail that is not in the data.',
    '2. Players are referred to by their ref exactly as given (for example P1). Never guess a name.',
    `3. "${'P?'}" means the note did not identify which player it was. Write about it without attributing it to anyone.`,
    '4. The coverage numbers say how thin the data is. Say nothing about a player nobody wrote a note about, and do not turn a few observations into a verdict on the team.',
    '5. Player notes must each rest on something in the notes for that same player. If nothing was written about a player, they get no note.',
    '6. Be concrete and short. A coach reads this on a phone after a match.',
    '7. If the data is too thin for a section, write one honest sentence instead of padding.',
    '',
    'Return the seven sections in the given order, plus player notes only where the data supports them.',
  ].join('\n');
}

/** Structured-outputs schema: the provider enforces the shape for us. */
function responseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['sections', 'playerNotes', 'dataCaveat'],
    properties: {
      sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['section', 'text'],
          properties: {
            section: { type: 'string', enum: [...REPORT_SECTIONS] },
            text: { type: 'string' },
          },
        },
      },
      playerNotes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'text'],
          properties: {
            ref: { type: 'string' },
            text: { type: 'string' },
          },
        },
      },
      dataCaveat: {
        type: ['string', 'null'],
        description: 'One sentence when the data was too thin to say much, otherwise null.',
      },
    },
  };
}

const clamp = (text: string, max: number): string => {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
};

/**
 * Turn whatever the provider returned into a draft we are willing to show, or
 * throw `invalidResponse`.
 *
 * Structured outputs make the shape likely, not certain: a refusal, a truncated
 * answer or an older model can all produce something else. Two rules matter
 * beyond shape - sections must be ones we asked for, and a player note must
 * name a ref the packet actually contained, because the review screen maps refs
 * back onto real children.
 */
export function validateDraft(raw: unknown, packet: GamePacket): Omit<ReportDraft, 'model' | 'packetFingerprint'> {
  if (!raw || typeof raw !== 'object') throw new DraftingError('invalidResponse', 'Draft was not an object');
  const body = raw as { sections?: unknown; playerNotes?: unknown; dataCaveat?: unknown };

  const knownRefs = new Set(packet.attested.squad.map((p) => p.ref));
  const seenSections = new Set<ReportSectionKey>();
  const sections: DraftSection[] = [];

  if (Array.isArray(body.sections)) {
    for (const entry of body.sections) {
      if (!entry || typeof entry !== 'object') continue;
      const { section, text } = entry as { section?: unknown; text?: unknown };
      if (typeof section !== 'string' || typeof text !== 'string') continue;
      if (!REPORT_SECTIONS.includes(section as ReportSectionKey)) continue;
      const key = section as ReportSectionKey;
      if (seenSections.has(key)) continue;
      const clamped = clamp(text, MAX_SECTION_CHARS);
      if (!clamped) continue;
      seenSections.add(key);
      sections.push({ section: key, text: clamped });
    }
  }
  if (sections.length === 0) throw new DraftingError('invalidResponse', 'Draft had no usable sections');
  // Present them in template order regardless of what the model chose.
  sections.sort((a, b) => REPORT_SECTIONS.indexOf(a.section) - REPORT_SECTIONS.indexOf(b.section));

  const playerNotes: DraftPlayerNote[] = [];
  if (Array.isArray(body.playerNotes)) {
    for (const entry of body.playerNotes) {
      if (playerNotes.length >= MAX_PLAYER_NOTES) break;
      if (!entry || typeof entry !== 'object') continue;
      const { ref, text } = entry as { ref?: unknown; text?: unknown };
      if (typeof ref !== 'string' || typeof text !== 'string') continue;
      // A ref we never sent is an invention; it must not reach a real player.
      if (!knownRefs.has(ref)) {
        logger.warn('[aiDrafting] Dropped a note for a player ref that was not in the packet');
        continue;
      }
      const clamped = clamp(text, MAX_PLAYER_NOTE_CHARS);
      if (clamped) playerNotes.push({ ref, text: clamped });
    }
  }

  const caveat = typeof body.dataCaveat === 'string' ? clamp(body.dataCaveat, MAX_SECTION_CHARS) : '';
  return { sections, playerNotes, ...(caveat ? { dataCaveat: caveat } : {}) };
}

/**
 * The provider's own words about why it said no - but only the fields that name
 * a parameter, never `message`, which can quote back what we sent.
 */
async function describeProviderError(response: Response): Promise<Record<string, string>> {
  try {
    const body = (await response.json()) as { error?: { type?: unknown; code?: unknown; param?: unknown } };
    const out: Record<string, string> = {};
    for (const field of ['type', 'code', 'param'] as const) {
      const value = body.error?.[field];
      if (typeof value === 'string' && value.length <= 100) out[field] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function withTimeout(signal?: AbortSignal): AbortSignal | undefined {
  const timeout = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined;
  if (signal && timeout && typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);
  return signal ?? timeout;
}

export interface DraftReportOptions {
  packet: GamePacket;
  signal?: AbortSignal;
  /** Override for tests and for a future model picker in Settings. */
  model?: string;
}

/**
 * Ask the coach's provider for a report draft.
 *
 * Only ever called from an explicit coach action. Throws `DraftingError` with a
 * kind the UI can explain; never resolves with a half-checked draft.
 */
export async function draftMatchReport({
  packet,
  signal,
  model = DRAFTING_MODEL,
}: DraftReportOptions): Promise<ReportDraft> {
  if (!getAiProviderState().connected) {
    throw new DraftingError('unauthorized', 'No AI provider is connected on this device');
  }
  const key = getAiProviderKey();
  if (!key) throw new DraftingError('unauthorized', 'No provider key on this device');

  const packetJson = JSON.stringify(packet);
  if (packetJson.length > MAX_PACKET_CHARS) {
    // Refused here rather than billed to the coach.
    throw new DraftingError('tooLarge', 'This match has more data than one request should carry');
  }

  let response: Response;
  try {
    response = await fetch(`${AI_PROVIDERS.openai.host}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        messages: [
          { role: 'system', content: buildDraftingInstructions(packet) },
          { role: 'user', content: packetJson },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'match_report_draft', strict: true, schema: responseSchema() },
        },
      }),
      signal: withTimeout(signal),
    });
  } catch (error) {
    // Never log the request: it carries the key and the match data.
    logger.warn('[aiDrafting] request failed', { name: error instanceof Error ? error.name : 'unknown' });
    throw new DraftingError('network');
  }

  if (response.status === 401 || response.status === 403) throw new DraftingError('unauthorized');
  if (response.status === 429) throw new DraftingError('rateLimited');
  if (!response.ok) {
    // A rejected request is usually a wrong model id or an unsupported
    // parameter, and a bare status number makes that undiagnosable. Log the
    // provider's structured error fields only - type/code/param name the
    // problem, while `message` can echo request content, so it stays out.
    logger.warn('[aiDrafting] provider returned an error status', {
      status: response.status,
      ...(await describeProviderError(response)),
    });
    throw new DraftingError(response.status >= 500 ? 'network' : 'rejected');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DraftingError('invalidResponse', 'Provider response was not JSON');
  }

  const completion = body as {
    choices?: Array<{ message?: { content?: unknown; refusal?: unknown }; finish_reason?: unknown }>;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      completion_tokens_details?: { reasoning_tokens?: unknown };
    };
  };
  const choice = completion.choices?.[0];
  if (typeof choice?.message?.refusal === 'string' && choice.message.refusal) {
    throw new DraftingError('rejected', 'The provider declined to draft this report');
  }

  const content = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : '';
  const ranOut = choice?.finish_reason === 'length';
  // Diagnostics that name the failure without carrying any of the answer's
  // words: this is the difference between "unreadable" and a fixable cause.
  const shape = {
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : 'unknown',
    contentChars: content.length,
    promptTokens: Number(completion.usage?.prompt_tokens ?? 0),
    completionTokens: Number(completion.usage?.completion_tokens ?? 0),
    reasoningTokens: Number(completion.usage?.completion_tokens_details?.reasoning_tokens ?? 0),
  };

  if (!content) {
    logger.warn('[aiDrafting] provider returned no content', shape);
    throw new DraftingError(
      'noOutput',
      ranOut
        ? 'The model spent its whole output budget before writing anything'
        : 'Provider returned no draft content',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    logger.warn('[aiDrafting] draft content was not JSON', shape);
    // A cut-off answer lands here too: the budget ended mid-string.
    if (ranOut) {
      throw new DraftingError('noOutput', 'The draft was cut off before it finished');
    }
    throw new DraftingError('invalidResponse', 'Draft was not valid JSON');
  }

  const draft = validateDraft(parsed, packet);
  const inputTokens = Number(completion.usage?.prompt_tokens ?? 0);
  const outputTokens = Number(completion.usage?.completion_tokens ?? 0);

  return {
    ...draft,
    model,
    packetFingerprint: gamePacketFingerprint(packet),
    ...(inputTokens || outputTokens
      ? {
          usage: {
            inputTokens,
            outputTokens,
            estimatedUsd:
              Math.ceil(
                ((inputTokens / 1_000_000) * DRAFTING_USD_PER_1M_INPUT +
                  (outputTokens / 1_000_000) * DRAFTING_USD_PER_1M_OUTPUT) *
                  10_000,
              ) / 10_000,
          },
        }
      : {}),
  };
}
