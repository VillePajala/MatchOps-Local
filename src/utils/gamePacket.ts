/**
 * Kirjuri GamePacket (Phase 3, PR 8a).
 *
 * One structured bundle describing a finished match, built on the device and
 * sent - only when the coach asks - to the coach's own AI provider to draft a
 * match report. This module is pure: no storage, no network, no React. The
 * caller supplies everything, which keeps the honesty rules testable.
 *
 * THREE RULES SHAPE THIS FILE (see kirjuri-ai-plan.md "Data honesty rules"):
 *
 * 1. Trust tiers are structural, not annotations. The packet's top level is
 *    `recorded` / `attested` / `planned`, so a field cannot be mislabelled by
 *    accident and the model is told what each section is worth:
 *      - recorded  = it happened, the app captured it (score, goals, cards,
 *                    penalties, the clock stamp on a note)
 *      - attested  = the coach entered it afterwards (positions played, note
 *                    text, the coach's own report). It may be written in the
 *                    report's own voice - the coach is the author and the
 *                    reader - but never dressed up as something measured.
 *      - planned   = intent from before kick-off (planner minutes, demand
 *                    level). Context only, never a claim about a player.
 *
 * 2. Absence is not evidence, so `coverage` carries denominators. "Notes on 3
 *    of 14 players" must be visible to the model; a silent gap invites it to
 *    write about players nobody watched.
 *
 * 3. Pseudonymization means no names anywhere, including inside note text.
 *    The consent gate promises "player names are replaced with codes before any
 *    drafting request", and a dictated note says "Emman syöttö", not "P3's
 *    pass". `redactPlayerNames` therefore rewrites name mentions to codes,
 *    across the WHOLE roster (a coach names unselected players too) and with
 *    Finnish declension and consonant gradation handled.
 *
 *    Its mistakes are never reviewed by a human - redaction happens before the
 *    request, and only the draft that comes back is reviewed - so each matching
 *    rule is bounded to keep ordinary words ("paine", "laittaa", "matkalla")
 *    out of it, while a word that could be two different players becomes
 *    `UNKNOWN_PLAYER_REF` rather than a guess about which child it was.
 *
 * Assessment slider values are deliberately NOT in the packet - only their
 * coverage counts. They are the coach's own judgement on a 1-10 scale, and
 * feeding numbers back to a language model is how numbers turn into claims.
 * Whether a later phase includes them is an open decision in the plan.
 */

import type { AppState, GameEvent, GameNoteSource, GameNoteTag, GameType } from '@/types/game';
import type { Player } from '@/types';
import { normalizeNameForCompare } from '@/utils/normalization';
import { levenshtein } from '@/utils/playerNameMatch';

/** Bump when the shape changes in a way a provider-side prompt must know about. */
export const GAME_PACKET_SCHEMA_VERSION = 1 as const;

/** How much a datum is worth. Mirrors the plan's trust tiers. */
export type TrustTier = 'recorded' | 'attested' | 'planned';

export interface PacketPlayer {
  /** Pseudonym ('P1') or the real name when the coach turned pseudonymization off. */
  ref: string;
  /** Positions the coach recorded for this game (attested). Absent = not recorded. */
  positions?: string[];
  /** Recorded: the app logged the card. */
  fairPlayCard?: boolean;
}

export interface PacketGoal {
  /** Whole minutes from kick-off. ABSENT when the clock was not running. */
  minute?: number;
  period?: number;
  team: 'us' | 'them';
  scorer?: string;
  assist?: string;
}

export interface PacketNote {
  /** Whole minutes from kick-off. ABSENT when the clock was not running. */
  minute?: number;
  period?: number;
  /** Player ref the note is about; absent = a note about the game. */
  about?: string;
  text: string;
  /** How the text arrived. 'dictation' text came from a transcript of speech. */
  source: GameNoteSource;
  /** Optional category: 'halftime', 'debrief', or a later AI-assigned label. */
  tag?: GameNoteTag;
}

export interface PacketCoverage {
  playersSelected: number;
  playersWithNotes: number;
  notes: number;
  playersWithPositions: number;
  assessmentsDone: number;
  /** Denominator for assessments: the squad the coach selected for this game. */
  assessmentsTotal: number;
  /** True when the coach wrote their own report before asking for a draft. */
  coachReport: boolean;
}

export interface GamePacket {
  schemaVersion: typeof GAME_PACKET_SCHEMA_VERSION;
  /** Language the draft should be written in (BCP-47-ish, e.g. 'fi'). */
  language: string;
  /** True when every player reference is a code and note text was redacted. */
  pseudonymized: boolean;
  /** What each section is worth - spelled out for the model, not just for us. */
  trust: Record<'recorded' | 'attested' | 'planned', string>;
  recorded: {
    teamName: string;
    opponentName: string;
    homeOrAway: 'home' | 'away';
    date: string;
    time?: string;
    location?: string;
    gameType?: GameType;
    ageGroup?: string;
    periods: number;
    periodMinutes: number;
    score: { us: number; them: number };
    wentToOvertime?: boolean;
    wentToPenalties?: boolean;
    goals: PacketGoal[];
  };
  attested: {
    squad: PacketPlayer[];
    notes: PacketNote[];
    /** The coach's own report text, when they wrote one before drafting. */
    coachReport?: string;
  };
  planned: {
    /** 1-5 difficulty the coach set before kick-off. Context, never a verdict. */
    demandLevel?: number;
    /**
     * Minutes from the playing-time PLAN, if a plan was linked. Intent, not
     * record: the app does not yet measure actual playing time, so these must
     * never become a fairness claim about a player.
     */
    minutes?: Array<{ ref: string; plannedMinutes: number }>;
  };
  coverage: PacketCoverage;
}

/** What the caller must keep to turn codes back into players after the draft. */
export interface GamePacketResult {
  packet: GamePacket;
  /** ref -> player id. Never sent to the provider. */
  refToPlayerId: Record<string, string>;
}

export interface BuildGamePacketOptions {
  game: AppState;
  /**
   * The FULL roster the game was picked from. Only `selectedPlayerIds` members
   * get a ref in the packet, but every roster name is used for redaction: a
   * coach may name an unselected player, and that name must not go out either.
   */
  players: Player[];
  /** Off = real names are sent. Defaults to on, matching the provider default. */
  pseudonymize?: boolean;
  language?: string;
  /** Planner minutes per player id, when a plan is linked to this game. */
  plannedMinutes?: Record<string, number>;
}

const TRUST_EXPLANATION: GamePacket['trust'] = {
  recorded: 'The app captured this as it happened. Safe to state as fact.',
  attested:
    "The coach entered this after the match, and this report is the coach's own document, so it belongs in the report's own voice. Do not attribute it back to them, and do not dress it up as something the app measured: no invented detail, no numbers that are not here.",
  planned:
    'Intent from before kick-off, not a record of what happened. Use as context only; never make a claim about a player from it.',
};

/**
 * Whole minutes from kick-off, or undefined when there is no time on the event.
 *
 * Exactly zero means the clock never ran - the coach logged a goal without
 * starting the timer - and sending `minute: 0` produced drafts reading
 * "merkittiin 0. minuutilla", an invented fact dressed as a precise one.
 *
 * Anything above zero is a real reading and is kept, including the opening
 * minute: an earlier version dropped everything under sixty seconds, which
 * threw away a genuine 0:45 goal along with the unset ones. The prompt is what
 * teaches the model to phrase minute zero as the opening minute.
 */
const toMinute = (seconds: number): number | undefined =>
  Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds / 60) : undefined;

/** Inside a name, these join parts that are also used on their own. */
const NAME_JOINERS = /[-\u2010-\u2015'\u2019\u02bc]/;

/**
 * Shortest handle we keep. Two-letter names exist ("Bo", "JP"), and dropping
 * them meant the app promised codes and then sent the child's real name.
 * They are matched exactly rather than inflected - see tokenMatchesHandle.
 */
const MIN_HANDLE = 2;
/** Below this length a handle matches only itself, never an inflection. */
const MIN_INFLECTED_HANDLE = 3;

/**
 * Every word that could identify this player: nickname plus each part of the
 * name. Surnames included - a coach may well say one out loud, and redaction
 * has to cover what pseudonymization promises.
 *
 * A hyphenated or apostrophed name yields BOTH the whole and its parts, because
 * a coach says either: "Juha-Pekka" in the team sheet is "Juha" on the pitch.
 * Keeping only the whole is how the child's real first name reached the
 * provider in cleartext.
 */
export function playerRedactionHandles(player: Player): string[] {
  const handles = new Set<string>();
  const add = (raw: string): void => {
    const norm = normalizeNameForCompare(raw);
    if (!norm) return;
    handles.add(norm);
    for (const part of norm.split(NAME_JOINERS)) {
      if (part) handles.add(part);
    }
  };
  if (player.nickname) add(player.nickname);
  for (const part of normalizeNameForCompare(player.name).split(/\s+/)) add(part);
  return [...handles].filter((h) => h.length >= MIN_HANDLE);
}

/**
 * Ref used when a name belongs to somebody outside this game's squad, or when
 * two players cannot be told apart from the word alone. The name is still
 * removed; what is dropped is only the claim about *which* player it was.
 */
export const UNKNOWN_PLAYER_REF = 'P?';

/** Longest case ending we accept after a name ("Emma" -> "Emmalle", +3). */
const MAX_ENDING = 4;
/** Longest ending after a gradated stem ("Matti" -> "Matille": stem "mat", +4). */
const MAX_GRADATED_ENDING = 4;
/**
 * Consonant gradation in Finnish only weakens k, p and t, and for names it
 * shows up as a doubled consonant before the final vowel: Matti -> Matin,
 * Pekka -> Pekalle. Only those names get a shortened stem, which is why
 * "Laine" cannot match "laittaa" while "Matti" still matches "Matille".
 */
const GRADATING_NAME = /([kpt])\1[aeiouyäö]$/;

/**
 * Is this word the player's name, possibly inflected or mis-transcribed?
 *
 * Finnish declines names ("Emma" -> "Emman", "Emmalle") and gradates consonants
 * ("Matti" -> "Matin"), so an exact compare is not enough. Each rule below is
 * bounded, because this decides whether an ordinary word gets replaced by a
 * code: an earlier draft matched a truncated stem with no length bound and
 * turned "paine" into a code (one letter from the surname "Laine") and
 * "leopardin" into one (three letters from "Leo").
 */
function tokenMatchesHandle(token: string, handle: string): boolean {
  if (token === handle) return true;
  // A very short name is matched exactly and no other way. "Bo" must not drag
  // in "bonus", and no inflection rule is safe at two letters.
  if (handle.length < MIN_INFLECTED_HANDLE) return false;
  // The whole name plus a case ending.
  if (token.startsWith(handle) && token.length - handle.length <= MAX_ENDING) return true;
  // Consonant gradation eats one of the doubled letters, so allow a shortened
  // stem - only for the names that actually gradate.
  if (handle.length >= 5 && GRADATING_NAME.test(handle)) {
    const stem = handle.slice(0, -2);
    if (token.startsWith(stem) && token.length - stem.length <= MAX_GRADATED_ENDING) return true;
  }
  // A one-character transcription slip, but only when the word starts the same
  // way. Without that guard, every five-letter word one edit from a surname
  // ("paine" / "Laine") would be redacted.
  return (
    handle.length >= 4 &&
    token.slice(0, 2) === handle.slice(0, 2) &&
    Math.abs(token.length - handle.length) <= 1 &&
    levenshtein(token, handle) <= 1
  );
}

/**
 * Replace player-name mentions in free text with their refs.
 *
 * Matches an exact handle, a Finnish inflection of it ("Emman", "Emmalle" for
 * "Emma") and a one-character typo, then swaps the whole word for the ref.
 * Word boundaries come from the same Unicode split the matcher uses, so the
 * surrounding punctuation and spacing survive untouched.
 *
 * Pass the FULL roster, not just the squad: a coach dictating about this match
 * may still name a player who was not selected, and that name has to go too.
 * Anyone without a ref, and any word that could be two different players,
 * becomes `UNKNOWN_PLAYER_REF` - removing the name without inventing a subject.
 *
 * Eager on purpose: a false positive costs a word, a false negative leaks a
 * name. The coach still reviews every drafted line before it is saved.
 */
export function redactPlayerNames(
  text: string,
  players: Player[],
  refOf: (playerId: string) => string | undefined,
): string {
  const handled = players
    .map((p) => ({ ref: refOf(p.id) ?? UNKNOWN_PLAYER_REF, handles: playerRedactionHandles(p) }))
    .filter((p) => p.handles.length > 0);
  if (handled.length === 0) return text;

  // Hyphens and apostrophes stay INSIDE a word, so "Juha-Pekka" and "O'Brien"
  // are examined whole. Splitting on them first turned one name into two
  // ordinary-looking words that matched nothing and went out as written.
  return text.replace(/[\p{L}\p{N}]+(?:[-\u2010-\u2015'\u2019\u02bc][\p{L}\p{N}]+)*/gu, (word) => {
    const token = normalizeNameForCompare(word);
    if (token.length < MIN_HANDLE) return word;
    // The whole compound first, then its parts: "Juha-Pekka" is one name, but
    // so is the "Juha" in "Juha-Pekan". Any part being a name removes the whole
    // word - a false positive costs a word, a false negative leaks a child.
    const pieces = [token, ...token.split(NAME_JOINERS).filter((piece) => piece.length >= MIN_HANDLE)];
    const refs = new Set<string>();
    for (const { ref, handles } of handled) {
      if (pieces.some((piece) => handles.some((handle) => tokenMatchesHandle(piece, handle)))) {
        refs.add(ref);
      }
    }
    if (refs.size === 0) return word;
    // Two players answer to this word: drop the name, never guess the child.
    return refs.size === 1 ? [...refs][0] : UNKNOWN_PLAYER_REF;
  });
}

const isNote = (e: GameEvent): boolean => e.type === 'note';

/**
 * Build the packet for one finished match.
 *
 * Deterministic: same inputs, same bytes. That matters because PR 9 records a
 * hash of the packet next to whatever the model produced from it.
 */
export function buildGamePacket({
  game,
  players,
  pseudonymize = true,
  language = 'fi',
  plannedMinutes,
}: BuildGamePacketOptions): GamePacketResult {
  const selectedIds = game.selectedPlayerIds ?? [];
  // Squad order follows the coach's selection, so refs are stable across
  // rebuilds of the same game.
  const squadPlayers = selectedIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);

  const refToPlayerId: Record<string, string> = {};
  const playerIdToRef = new Map<string, string>();
  squadPlayers.forEach((player, index) => {
    const ref = pseudonymize ? `P${index + 1}` : player.nickname?.trim() || player.name;
    // Real-name mode can collide (two Emmas); keep refs unique either way.
    const unique = refToPlayerId[ref] ? `${ref} (${index + 1})` : ref;
    refToPlayerId[unique] = player.id;
    playerIdToRef.set(player.id, unique);
  });
  const refOf = (playerId: string): string | undefined => playerIdToRef.get(playerId);

  const positions = game.playerPositions ?? {};
  const squad: PacketPlayer[] = squadPlayers.map((player) => {
    const entry: PacketPlayer = { ref: playerIdToRef.get(player.id) as string };
    const played = positions[player.id];
    if (played && played.length > 0) entry.positions = [...played];
    if (player.receivedFairPlayCard) entry.fairPlayCard = true;
    return entry;
  });

  const events = game.gameEvents ?? [];
  const goals: PacketGoal[] = events
    .filter((e) => e.type === 'goal' || e.type === 'opponentGoal')
    .slice()
    .sort((a, b) => a.time - b.time)
    .map((e) => {
      const minute = toMinute(e.time);
      const goal: PacketGoal = {
        team: e.type === 'goal' ? 'us' : 'them',
        ...(minute === undefined ? {} : { minute }),
      };
      if (typeof e.period === 'number') goal.period = e.period;
      const scorerRef = e.scorerId ? refOf(e.scorerId) : undefined;
      if (scorerRef) goal.scorer = scorerRef;
      const assistRef = e.assisterId ? refOf(e.assisterId) : undefined;
      if (assistRef) goal.assist = assistRef;
      return goal;
    });

  const noteEvents = events.filter(isNote).slice().sort((a, b) => a.time - b.time);
  const notes: PacketNote[] = noteEvents.map((e) => {
    const raw = (e.text ?? '').trim();
    const minute = toMinute(e.time);
    const note: PacketNote = {
      text: pseudonymize ? redactPlayerNames(raw, players, refOf) : raw,
      source: e.source ?? 'manual',
      ...(minute === undefined ? {} : { minute }),
    };
    if (typeof e.period === 'number') note.period = e.period;
    const aboutRef = e.entityId ? refOf(e.entityId) : undefined;
    if (aboutRef) note.about = aboutRef;
    if (e.tag) note.tag = e.tag;
    return note;
  });

  const coachReport = (game.gameNotes ?? '').trim();
  const assessments = game.assessments ?? {};
  const playersWithNotes = new Set(
    noteEvents.map((e) => e.entityId).filter((id): id is string => !!id && playerIdToRef.has(id)),
  ).size;

  const packet: GamePacket = {
    schemaVersion: GAME_PACKET_SCHEMA_VERSION,
    language,
    pseudonymized: pseudonymize,
    trust: TRUST_EXPLANATION,
    recorded: {
      teamName: game.teamName,
      opponentName: game.opponentName,
      homeOrAway: game.homeOrAway ?? 'home',
      date: game.gameDate,
      periods: game.numberOfPeriods ?? 2,
      periodMinutes: game.periodDurationMinutes,
      score: { us: game.homeScore, them: game.awayScore },
      goals,
    },
    attested: {
      squad,
      notes,
    },
    planned: {},
    coverage: {
      playersSelected: squadPlayers.length,
      playersWithNotes,
      notes: notes.length,
      playersWithPositions: squadPlayers.filter((p) => (positions[p.id] ?? []).length > 0).length,
      assessmentsDone: squadPlayers.filter((p) => !!assessments[p.id]).length,
      assessmentsTotal: squadPlayers.length,
      coachReport: coachReport.length > 0,
    },
  };

  // Optional recorded fields: present only when the app actually has them, so
  // the model never sees an empty string it might read as a value.
  if (game.gameTime) packet.recorded.time = game.gameTime;
  if (game.gameLocation) packet.recorded.location = game.gameLocation;
  if (game.gameType) packet.recorded.gameType = game.gameType;
  if (game.ageGroup) packet.recorded.ageGroup = game.ageGroup;
  if (game.wentToOvertime) packet.recorded.wentToOvertime = true;
  if (game.wentToPenalties) packet.recorded.wentToPenalties = true;
  // The coach's own report is prose about named children just as much as a
  // dictated note is; it goes through the same redaction.
  if (coachReport) {
    packet.attested.coachReport = pseudonymize
      ? redactPlayerNames(coachReport, players, refOf)
      : coachReport;
  }
  if (typeof game.demandFactor === 'number') packet.planned.demandLevel = game.demandFactor;

  if (plannedMinutes) {
    const minutes = squadPlayers
      .filter((p) => typeof plannedMinutes[p.id] === 'number')
      .map((p) => ({ ref: playerIdToRef.get(p.id) as string, plannedMinutes: plannedMinutes[p.id] }));
    if (minutes.length > 0) packet.planned.minutes = minutes;
  }

  return { packet, refToPlayerId };
}

/**
 * Stable fingerprint of a packet, for recording next to a draft (PR 9's
 * `aiMeta`): it tells later readers which data produced which text. Not a
 * security hash - a short non-cryptographic digest is enough here and needs no
 * async Web Crypto call.
 */
export function gamePacketFingerprint(packet: GamePacket): string {
  const json = JSON.stringify(packet);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `v${GAME_PACKET_SCHEMA_VERSION}-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}
