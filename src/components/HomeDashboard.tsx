'use client';

import React, { useState } from 'react';
import type { TFunction } from 'i18next';
import type { HomeSummary, HomeResumeGame, HomeRecentGame, HomeUpcomingGame, HomeCounts } from '@/utils/homeSummary';
import { RESULT_CLASSES, type GameResult } from '@/utils/gameResult';
import type { TeamRecord } from '@/utils/teamRecord';
import { formatDriveTime } from '@/utils/travelPlan';

/**
 * HOME SCREEN, S1 "SYKE REFINED" (owner-approved redesign, phase 1 of 3).
 *
 * The visual system lives in two places: the role-named colour/font tokens in
 * globals.css (`bg-carbon`, `text-ink-3`, `text-action`, `font-display`, ...)
 * and the handful of multi-layer surfaces that one utility cannot express
 * (`s1-hero`, `s1-list`, `s1-primary`, ...), also in globals.css. Nothing in
 * this file hard-codes a hex value.
 *
 * Inter (`font-ui`) is the text face here; Barlow Condensed (`font-display`)
 * is for numerals and names, as in the rest of the app.
 */

/** Visible keyboard focus, the same everywhere on Home. */
export const HOME_FOCUS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-carbon';

/**
 * The Home card surface: the club tiles, the season card, the stats tiles.
 * One literal so a surface spelled out in several files cannot drift.
 */
export const HOME_CARD = 's1-list';

/* ------------------------------------------------------------------ icons */

type HomeIconName =
  | 'gear' | 'chev' | 'back' | 'arrow' | 'plus' | 'pin' | 'nav' | 'check'
  | 'pitch' | 'shield' | 'trophy' | 'bars' | 'folder';

const ICON_PATHS: Record<HomeIconName, React.ReactNode> = {
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  chev: <path d="M9 6l6 6-6 6" />,
  back: <path d="M15 6l-6 6 6 6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  nav: <path d="M3 11l18-8-8 18-2-8-8-2z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  pitch: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 4.6-3.2 8-8 9-4.8-1-8-4.4-8-9V6l8-3z" />,
  trophy: (
    <>
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 14v4M8.5 20h7" />
    </>
  ),
  bars: <path d="M5 20v-7M12 20V5M19 20v-10" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
};

/** The Home icon family: 24-unit grid, round caps, one stroke weight. Decorative. */
export function HomeIcon({ name, className = 'h-[22px] w-[22px]', strokeWidth = 1.75, fill = 'none' }: {
  name: HomeIconName;
  className?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/* ---------------------------------------------------------------- helpers */

/**
 * "2026-09-20" -> "20.9." - the form a Finnish coach writes on a whiteboard. A date
 * with a time part ("2026-09-20T...") uses its date part.
 */
export const formatDayMonth = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return `${Number(m[3])}.${Number(m[2])}.`;
};

/** The weekday of an ISO date in the app language: 'short' -> "su"/"Sun", 'long' -> "sunnuntai". */
const formatWeekday = (iso: string, locale: string, style: 'short' | 'long'): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString(locale, { weekday: style })
    .replace(/\.$/, '');
};

/**
 * "2026-09-20" -> "su 20.9." in Finnish, "Sun 20.9." in English. A coach thinks
 * in weekdays: "Sunday" places a match faster than "20.9." does, and the date
 * then only says which Sunday.
 */
const formatWeekdayDate = (iso: string, locale: string): string => {
  const weekday = formatWeekday(iso, locale, 'short');
  return weekday ? `${weekday} ${formatDayMonth(iso)}` : '';
};

const resultOf = (ours: number, theirs: number): GameResult =>
  ours > theirs ? 'W' : ours < theirs ? 'L' : 'D';

/** V / T / TA in Finnish, W / L / T in English - the letters the app's exports already use. */
const badgeLetter = (result: GameResult, t: TFunction): string =>
  result === 'W'
    ? t('export.winShort', 'W')
    : result === 'L'
      ? t('export.lossShort', 'L')
      : t('export.tieShort', 'D');

/* ------------------------------------------------------------ hero pieces */

const HERO_LABEL = 'inline-flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.16em]';
const HERO_BODY = `block w-full text-left rounded-2xl transition-opacity hover:opacity-90 ${HOME_FOCUS}`;
const PRIMARY_BTN = `s1-primary flex h-14 w-full items-center justify-center gap-2.5 rounded-full px-5 text-base font-bold transition-[filter] ${HOME_FOCUS}`;

/** Role and day: the top line of the hero card. */
function HeroTop({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      {left}
      {right}
    </div>
  );
}

/**
 * The label with the live dot: "Next match", "Last opened". Neutral on the full
 * layout's hero (owner, 2026-11-19: amber is the card's one primary button and
 * nothing else); the basic layout's card keeps the amber.
 */
function LiveLabel({ children, quiet = false }: { children: React.ReactNode; quiet?: boolean }) {
  return (
    <span className={`${HERO_LABEL} pl-[3px] ${quiet ? 'text-ink-2' : 'text-action'}`} data-testid="hero-live-label">
      <i className={quiet ? 's1-live-dot-quiet' : 's1-live-dot'} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Quiet chip on the hero's top line (the countdown). */
function HeroChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-slate-950/50 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink ring-1 ring-inset ring-white/10">
      {children}
    </span>
  );
}

/** The day/time eyebrow on the right of the top line. */
function HeroEyebrow({ children, nowrap }: { children: React.ReactNode; nowrap?: boolean }) {
  return <span className={`min-w-0 text-right text-[13px] font-medium text-ink-2 ${nowrap ? 'whitespace-nowrap' : ''}`}>{children}</span>;
}

/** Win / Draw / Loss as a pill on a played match. */
function ResultPill({ result, t }: { result: GameResult; t: TFunction }) {
  const cls = result === 'W' ? 's1-pill-win' : result === 'L' ? 's1-pill-loss' : 's1-pill-draw';
  const label = result === 'W'
    ? t('recap.resultWin', 'Win')
    : result === 'L'
      ? t('recap.resultLoss', 'Loss')
      : t('recap.resultDraw', 'Draw');
  return (
    <span className={`${HERO_LABEL} ${cls} h-7 shrink-0 gap-[5px] rounded-full pl-2 pr-3 tracking-[0.12em]`}>
      {result === 'W' && <HomeIcon name="check" className="h-4 w-4" strokeWidth={3} />}
      {label}
    </span>
  );
}

/**
 * The kick-off as the one huge number, the day sitting on its baseline.
 * The negative margins pull the italic's left overhang onto the card edge.
 */
function KickOff({ big, weekday, date }: { big: string; weekday?: string; date?: string }) {
  return (
    <span className="-ml-1.5 mt-2 block whitespace-nowrap leading-none">
      <span className="s1-numeral -ml-1 inline-block pl-1 pr-2 font-display text-[clamp(64px,22vw,88px)] font-extrabold italic leading-[0.8] tracking-[-0.015em] tabular-nums">
        {big}
      </span>
      {(weekday || date) && (
        <span className="ml-1.5 inline-block font-display text-[26px] font-bold leading-none text-ink tabular-nums">
          {weekday && (
            <b className="mb-2 block font-ui text-xs font-semibold uppercase leading-none tracking-[0.16em] text-ink-3">
              {weekday}
            </b>
          )}
          {date}
        </span>
      )}
    </span>
  );
}

/**
 * "vs Opponent" in the display face, the small "vs" inline before the name -
 * ONE pattern on every hero state (owner, 2026-11-19: the played card had
 * stacked it above the name). The opponent is its own element.
 */
function Opponent({ who, t, className = '' }: { who: string; t: TFunction; className?: string }) {
  return (
    <span className={`block break-words font-display text-[30px] font-bold leading-[1.1] tracking-[0.005em] text-ink ${className}`}>
      <small className="mr-2 align-[4px] font-ui text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
        {t('playerStats.vs', 'vs')}
      </small>
      <span>{who}</span>
    </span>
  );
}

/** One cell of the stat strip: caption over a display value. */
function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-l border-hairline px-4 first:border-l-0 first:pl-0">
      <span className="block text-xs font-semibold uppercase leading-4 tracking-[0.16em] text-ink-3">{label}</span>
      {children}
    </div>
  );
}

const STAT_VALUE = 'mt-0.5 block font-display text-[28px] font-bold leading-7 tabular-nums text-ink';

/** The pitch, which never gives way. */
function PitchCell({ pitch, t }: { pitch: string; t: TFunction }) {
  return (
    <StatCell label={t('startScreen.dashPitch', 'Pitch')}>
      <b className={STAT_VALUE}>{pitch}</b>
    </StatCell>
  );
}

/** The stat strip: hairlines above and below, cells split by a hairline. */
function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 grid auto-cols-fr grid-flow-col border-y border-hairline py-2.5">
      {children}
    </div>
  );
}

/** Venue name over its street address (or town), behind a pin. */
function AddressRow({ venue, sub }: { venue?: string; sub?: string }) {
  if (!venue && !sub) return null;
  return (
    <div className="mt-3 flex items-center gap-3 text-[13px] leading-[1.3] text-ink-2">
      <HomeIcon name="pin" className="h-5 w-5 text-ink-3" />
      <div className="min-w-0 break-words">
        {venue && <b className="block text-[15px] font-semibold text-ink">{venue}</b>}
        {sub && <span className="block text-ink-3">{sub}</span>}
      </div>
    </div>
  );
}

/**
 * Turn-by-turn directions: the round button beside the primary action.
 *
 * Only ever rendered for a PINNED venue - see mapsDirectionsUrl - since a
 * button that opens a search for a typed region promises navigation and
 * delivers a guess. A SIBLING of the card's buttons, never a child: a link
 * inside a button is invalid HTML.
 */
function DirectionsButton({ href, t }: { href: string; t: TFunction }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('startScreen.driveToVenue', 'Directions to the venue')}
      title={t('startScreen.driveToVenue', 'Directions to the venue')}
      className={`s1-glass grid h-14 w-14 place-items-center rounded-full text-ink transition-opacity hover:opacity-90 ${HOME_FOCUS}`}
    >
      <HomeIcon name="nav" className="h-[22px] w-[22px] -translate-x-px translate-y-px" />
    </a>
  );
}

/** The action row: primary pill, and directions beside it when the venue is pinned. */
function HeroActions({ primary, mapsUrl, t }: { primary: React.ReactNode; mapsUrl: string | null; t: TFunction }) {
  return (
    <div className={`mt-4 grid gap-3 ${mapsUrl ? 'grid-cols-[1fr_56px]' : 'grid-cols-1'}`}>
      {primary}
      {mapsUrl && <DirectionsButton href={mapsUrl} t={t} />}
    </div>
  );
}

/** Only the first comma-separated part of a stored venue: older games kept the whole disambiguation string. */
const venueName = (venue?: string): string | undefined => venue?.split(',')[0]?.trim() || undefined;

/* -------------------------------------------------------------- the cards */

/**
 * The top slot when there is neither a fixture nor a match to resume.
 *
 * THE SLOT IS NEVER EMPTY, which the owner asked for twice: reaching this card
 * means the coach has no matches at all, and the only useful thing to offer is
 * the first one.
 */
function NoMatchCard({ onNewGame, t }: { onNewGame?: () => void; t: TFunction }) {
  return (
    <div className="s1-hero s1-hero-quiet p-5 text-ink">
      <HeroTop left={<span className={`${HERO_LABEL} text-ink-3`}>{t('startScreen.dashNextMatch', 'Next match')}</span>} />
      <p className="mt-2 text-[15px] text-ink-2">{t('startScreen.dashNoMatchesYet', 'No matches yet.')}</p>
      <div className="mt-4">
        <button type="button" onClick={onNewGame} className={PRIMARY_BTN}>
          <HomeIcon name="plus" className="h-5 w-5" strokeWidth={2.4} />
          {t('startScreen.newGame', 'New Game')}
        </button>
      </div>
    </div>
  );
}

/**
 * The match you last opened - or, when none is open, the latest one played.
 *
 * ONE SLOT, READ TOP TO BOTTOM in the order a coach asks: which match (the
 * label and its day), who and the one number, where, then the one thing to
 * do. The number is the kick-off on a match not yet started, the score on
 * anything under way or played - coloured by the result once it is played,
 * the same green / grey / red as the results list. NOTHING TRUNCATES: a long
 * name wraps and the card grows. Home and away are not shown (owner's call).
 */
export function ResumeCard({ resume, onResume, locale, t }: {
  resume: HomeResumeGame;
  onResume?: () => void;
  locale: string;
  t: TFunction;
}) {
  const result = resume.isPlayed ? resultOf(resume.ourScore, resume.theirScore) : null;
  // Not started: nothing on the clock or the scoreboard yet, and a kick-off to
  // show. Then the kick-off is the number, as on a fixture.
  const notStarted = !resume.isPlayed && !resume.timeElapsedSeconds
    && resume.ourScore === 0 && resume.theirScore === 0 && !!resume.time;
  const when = [resume.date ? formatWeekdayDate(resume.date, locale) : null, resume.time]
    .filter(Boolean)
    .join(' ');
  const who = resume.opponent || t('startScreen.dashResumeGame', 'Game');
  const name = venueName(resume.venue);
  const lastOpened = t('startScreen.dashLastOpened', 'Last opened');
  const heroTint = result === 'W' ? 's1-hero-win' : result === 'L' ? 's1-hero-loss' : '';
  // A match that is over is OPENED, not continued (owner, 2026-11-19): "Jatka"
  // promised a match still running.
  const finished = resume.isPlayed && !resume.inProgress && resume.started !== false;
  const longName = who.length > 12;
  const hasVenue = !!(name || resume.venueTown || resume.fieldNumber);

  return (
    <div className={`s1-hero ${heroTint} p-5 text-ink`}>
      {result ? (
        <HeroTop
          left={<ResultPill result={result} t={t} />}
          // Never broken mid-text: when it does not fit beside the pill, the
          // whole line wraps under it (HeroTop wraps).
          right={<HeroEyebrow nowrap>{[lastOpened, when].filter(Boolean).join(' · ')}</HeroEyebrow>}
        />
      ) : (
        <HeroTop
          left={<LiveLabel quiet>{lastOpened}</LiveLabel>}
          right={!notStarted && when ? <HeroEyebrow>{when}</HeroEyebrow> : undefined}
        />
      )}

      {notStarted ? (
        <>
          <button type="button" onClick={onResume} className={HERO_BODY}>
            <KickOff
              big={resume.time!}
              weekday={resume.date ? formatWeekday(resume.date, locale, 'long') : undefined}
              date={resume.date ? formatDayMonth(resume.date) : undefined}
            />
            <Opponent who={who} t={t} className="mt-2" />
          </button>
          {resume.fieldNumber && (
            <StatStrip>
              <PitchCell pitch={resume.fieldNumber} t={t} />
            </StatStrip>
          )}
          <AddressRow venue={name} sub={resume.venueAddress ?? resume.venueTown} />
        </>
      ) : (
        /* The opponent gets the full width (a long club name must not wrap
           into the score); the score sits opposite the venue lines below. */
        <button type="button" onClick={onResume} className={`${HERO_BODY} mt-3`}>
          {/* A short name sits beside the score (no dead space when the venue is
              missing); only a long one takes its own row above it. */}
          {longName && <Opponent who={who} t={t} className="text-[28px]" />}
          {/* A grid, so the venue can move: beside the score from 360px, UNDER
              it below that - at 320px the score crowded the venue text. */}
          <span className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3">
            {!longName && <Opponent who={who} t={t} className="col-start-1 row-start-1 pb-1 text-[28px]" />}
            {hasVenue && (
              <span className="col-start-1 row-start-2 mt-1 block break-words pb-1 text-[13px] leading-[1.35] text-ink-2 max-[359px]:col-span-2 max-[359px]:row-start-3">
                {name && <span className="block">{name}</span>}
                {(resume.venueTown || resume.fieldNumber) && (
                  <span className="block text-ink-3">
                    {resume.venueTown && <span>{resume.venueTown}</span>}
                    {resume.venueTown && resume.fieldNumber && ' · '}
                    {resume.fieldNumber && <span>{resume.fieldNumber}</span>}
                  </span>
                )}
              </span>
            )}
            <span
              className={`${result ? RESULT_CLASSES[result].numeral : 's1-numeral'} col-start-2 row-start-1 row-span-2 -mr-1.5 shrink-0 self-end whitespace-nowrap pl-1 pr-2.5 font-display text-[clamp(64px,22vw,96px)] font-extrabold italic leading-[0.8] tracking-[-0.01em] tabular-nums max-[359px]:row-span-1`}
              data-testid="hero-score"
            >
              {`${resume.ourScore}–${resume.theirScore}`}
            </span>
          </span>
        </button>
      )}

      <HeroActions
        mapsUrl={resume.mapsUrl}
        t={t}
        primary={
          // The arrow stays TEXT: the accessible name reads "Continue →", the
          // card's action, distinct from the plain launcher's Continue button.
          <button type="button" onClick={onResume} className={PRIMARY_BTN} data-testid="hero-primary">
            {finished ? t('startScreen.openGame', 'Open') : t('startScreen.resumeCard', 'Continue')} →
          </button>
        }
      />
    </div>
  );
}

/**
 * The fixture ahead of you, and a way to drive to it.
 *
 * TAKES THE TOP SLOT FROM THE RESUME CARD, because it is the one with a
 * deadline. The countdown chip is what a coach scans for ("3 pv", then
 * "Huomenna" and "Tänään" as it closes); the kick-off is the big number and
 * appears nowhere else on the card.
 */
/** The next-match card's plan actions; passed only when the game has a plan. */
export interface NextMatchPlanActions {
  onShowPlan?: () => void;
  onShare?: () => void;
}

/** A quiet outline pill for the next-match card's plan actions. */
const PLAN_PILL = `s1-ghost flex h-12 flex-auto items-center justify-center whitespace-nowrap rounded-full px-4 text-[15px] font-semibold text-ink-2 transition-colors hover:text-ink ${HOME_FOCUS}`;

function NextMatchCard({
  game,
  onOpen,
  onAdjustTravel,
  onSetStartingPoint,
  onMarkAbsences,
  planActions,
  themeSlot,
  locale,
  t,
}: {
  game: HomeUpcomingGame;
  onOpen?: (id: string) => void;
  /** The game's Playbook themes row (flagged accounts), at the end of the card. */
  themeSlot?: React.ReactNode;
  /** "Näytä suunnitelma" / "Jaa" - only for a game made from a plan. */
  planActions?: NextMatchPlanActions;
  /** "Merkitse poissaolijat": the attendance sheet for this fixture (Onboarding v3). */
  onMarkAbsences?: (id: string) => void;
  /** Opens where the starting point is set; offered on a pinned fixture with no departure time. */
  onSetStartingPoint?: () => void;
  /** Sets this match's own arrival buffer and the drive time actually taken. */
  onAdjustTravel?: (id: string, next: { arrivalBufferMinutes?: number; travelMinutes?: number }) => void;
  locale: string;
  t: TFunction;
}) {
  const [adjusting, setAdjusting] = useState(false);
  // "132 min" has to be divided in the head before it means anything.
  const driveTime = game.travel
    ? formatDriveTime(game.travel.travelMinutes, t('common.hourShort', 'h'))
    : '';
  const countdown =
    game.daysAway === 0
      ? t('startScreen.dashToday', 'Today')
      : game.daysAway === 1
        ? t('startScreen.dashTomorrow', 'Tomorrow')
        : t('startScreen.dashInDays', '{{count}} d', { count: game.daysAway });
  const who = game.opponent || t('startScreen.dashResumeGame', 'Game');
  const weekday = formatWeekday(game.date, locale, 'long');
  const date = formatDayMonth(game.date);
  const showDeparture = !!game.travel || !!game.mapsUrl;

  return (
    // The wrapper positions; the card inside it clips (rounded corners need
    // overflow-hidden, and the adjustment panel overflows by design).
    <div className="relative">
      <div className="s1-hero p-5 text-ink">
        <HeroTop
          left={<LiveLabel quiet>{t('startScreen.dashNextMatch', 'Next match')}</LiveLabel>}
          right={<HeroChip>{countdown}</HeroChip>}
        />
        <button type="button" onClick={() => onOpen?.(game.id)} className={HERO_BODY}>
          {/* No kick-off time booked: the date becomes the number. */}
          <KickOff
            big={game.time || date || '–'}
            weekday={weekday || undefined}
            date={game.time ? date : undefined}
          />
          <Opponent who={who} t={t} className="mt-2" />
        </button>

        {/* WHEN TO LEAVE, and the pitch. Departure is kick-off minus the time
            you must already BE there minus the drive. Tapping it opens both
            adjustments; a pinned venue with no departure time gets the offer
            to set a starting point instead, where the coach is looking. */}
        {(showDeparture || game.fieldNumber) && (
          <StatStrip>
            {showDeparture && (
              <StatCell label={t('startScreen.dashDeparture', 'Departure')}>
                {game.travel ? (
                  <button
                    type="button"
                    onClick={() => setAdjusting((v) => !v)}
                    aria-expanded={adjusting}
                    className={`-mx-1 flex min-h-11 items-baseline gap-1.5 rounded-lg px-1 text-left ${HOME_FOCUS}`}
                  >
                    <b className={STAT_VALUE}>{game.travel.departure}</b>
                    {/* Just the drive; the tilde is the whole hedge on a guess. */}
                    <span className="text-[13px] font-medium text-ink-3">
                      · {game.travel.isEstimate ? `~${driveTime}` : driveTime}
                    </span>
                    <span className="text-[13px] text-ink-3" aria-hidden="true">{adjusting ? '▾' : '▸'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSetStartingPoint}
                    className={`-mx-1 mt-1 block min-h-11 rounded-lg px-1 text-left text-[13px] font-semibold leading-snug text-ink-2 ${HOME_FOCUS}`}
                  >
                    <span className="text-ink underline decoration-ink-3 underline-offset-2">
                      {t('startScreen.setStartingPoint', 'Set a starting point')}
                    </span>
                    <span className="ml-1">{t('startScreen.setStartingPointWhy', 'to see when to leave')}</span>
                  </button>
                )}
              </StatCell>
            )}
            {game.fieldNumber && <PitchCell pitch={game.fieldNumber} t={t} />}
          </StatStrip>
        )}

        <AddressRow venue={venueName(game.venue)} sub={game.venueAddress ?? game.venueTown} />

        <HeroActions
          mapsUrl={game.mapsUrl}
          t={t}
          primary={
            <button type="button" onClick={() => onOpen?.(game.id)} className={PRIMARY_BTN}>
              {t('playtimePlanner.overview.openGame', 'Open the game')}
              <HomeIcon name="arrow" className="h-5 w-5" strokeWidth={2.4} />
            </button>
          }
        />
        {onMarkAbsences && (
          <button
            type="button"
            onClick={() => onMarkAbsences(game.id)}
            data-testid="next-match-mark-absences"
            className={`mt-2.5 flex h-12 w-full items-center justify-center rounded-full border border-dashed border-white/25 px-4 text-[15px] font-semibold text-ink-2 transition-colors hover:text-ink ${HOME_FOCUS}`}
          >
            {t('basicHome.markAbsences', 'Mark who is away')}
          </button>
        )}
        {/* The game's plan, as in the basic layout: quiet pills, the amber stays
            on "Avaa ottelu". They size to their words and wrap rather than
            squeeze, so "Näytä suunnitelma" fits a 320px screen. */}
        {planActions && (planActions.onShowPlan || planActions.onShare) && (
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            {planActions.onShowPlan && (
              <button type="button" onClick={planActions.onShowPlan} className={PLAN_PILL} data-testid="next-match-show-plan">
                {t('basicHome.showPlan', 'Show rotation')}
              </button>
            )}
            {planActions.onShare && (
              <button type="button" onClick={planActions.onShare} className={PLAN_PILL} data-testid="next-match-share">
                {t('basicHome.share', 'Share')}
              </button>
            )}
          </div>
        )}
        {themeSlot}
      </div>

      {/* OVER the content below, not shoved into it: expanding in the flow
          moved every row under the coach's thumb. Absolute, so only this
          panel moves. */}
      {adjusting && game.travel && (
        <div className="s1-sheet absolute left-0 right-0 top-full z-30 mt-2 space-y-3 rounded-[22px] px-4 pb-4 pt-3">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
              {t('startScreen.arriveBefore', 'At the ground before kick-off')}
            </div>
            <div className="flex gap-2">
              {[30, 45, 60].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => onAdjustTravel?.(game.id, { arrivalBufferMinutes: minutes })}
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold transition-colors ${HOME_FOCUS} ${
                    game.travel?.arrivalBufferMinutes === minutes
                      ? 'bg-action text-on-action'
                      : 'bg-surface-2 text-ink-2 hover:text-ink'
                  }`}
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
              {t('startScreen.actualDrive', 'How long the drive really takes')}
            </div>
            {/* A measured time replaces a straight-line guess, and - looked up
                by venue - answers for every later match at the same place. */}
            <input
              type="number"
              min={0}
              max={600}
              inputMode="numeric"
              defaultValue={game.travel.travelMinutes}
              onBlur={(e) => {
                // An EMPTIED field is not a zero-minute drive: Number('') is 0,
                // and a measured value overrides the estimate for every later
                // match at this venue, so a blank must change nothing.
                const raw = e.target.value.trim();
                if (!raw) return;
                const minutes = Number(raw);
                if (Number.isFinite(minutes) && minutes > 0) {
                  onAdjustTravel?.(game.id, { travelMinutes: Math.round(minutes) });
                }
              }}
              aria-label={t('startScreen.actualDrive', 'How long the drive really takes')}
              className="h-11 w-24 rounded-xl border border-hairline bg-carbon px-3 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
            />
            <span className="ml-2 text-sm text-ink-3">min</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ the list */

/** How many rows the results / fixtures list shows; the rest live in Saved games. */
const LIST_ROWS = 3;

const LIST_ROW = `relative flex min-h-14 w-full items-center gap-3 rounded-2xl py-1.5 pl-3 pr-4 text-left transition-colors hover:bg-white/[0.03] ${HOME_FOCUS}`;

/** Hairline between rows, starting after the badge. */
function RowRule() {
  return <span className="pointer-events-none absolute left-14 right-4 top-0 h-px bg-hairline" aria-hidden="true" />;
}

/** One fixture in the list: when it is, not how it went. */
function UpcomingRow({ game, onOpen, locale, first, t }: {
  game: HomeUpcomingGame;
  onOpen?: (id: string) => void;
  locale: string;
  first: boolean;
  t: TFunction;
}) {
  return (
    <button type="button" onClick={() => onOpen?.(game.id)} className={LIST_ROW}>
      {!first && <RowRule />}
      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/[0.08] font-display text-[13px] font-bold uppercase text-ink-2">
        {formatWeekday(game.date, locale, 'short')}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px] font-semibold leading-5 text-ink">
          {game.opponent || t('startScreen.dashResumeGame', 'Game')}
        </b>
        <span className="block truncate text-xs leading-4 text-ink-3">
          <span>{formatDayMonth(game.date)}</span>
          {game.venueTown && <> · <span>{game.venueTown}</span></>}
        </span>
      </span>
      <span className="min-w-[46px] pr-[3px] text-right font-display text-[22px] font-bold italic leading-none text-ink-2 tabular-nums">
        {game.time || '–'}
      </span>
    </button>
  );
}

/**
 * One result in the list. `accented` marks the match the coach last had open -
 * wayfinding, not status - and is suppressed by the caller when the card above
 * already shows that match (the same sentence twice in one glance).
 */
function RecentRow({ game, onOpen, accented, first, t }: {
  game: HomeRecentGame;
  onOpen?: (id: string) => void;
  accented?: boolean;
  first: boolean;
  t: TFunction;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(game.id)}
      className={`${LIST_ROW} ${accented ? 'bg-action/[0.07] ring-1 ring-inset ring-action/45' : ''}`}
    >
      {!first && !accented && <RowRule />}
      <span className={`grid h-8 w-8 flex-none place-items-center rounded-full font-display text-[17px] font-bold leading-none ${RESULT_CLASSES[game.result].disc}`}>
        {badgeLetter(game.result, t)}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px] font-semibold leading-5 text-ink">{game.opponent || '—'}</b>
        {/* Town only - see HomeRecentGame.venueTown for why not the venue. */}
        <span className="block truncate text-xs leading-4 text-ink-3">
          {game.date && <span>{formatDayMonth(game.date)}</span>}
          {game.date && game.venueTown && ' · '}
          {game.venueTown && <span>{game.venueTown}</span>}
        </span>
      </span>
      <span
        className={`min-w-[46px] pr-[3px] text-right font-display text-[28px] font-bold italic leading-none tabular-nums ${RESULT_CLASSES[game.result].numeral}`}
        data-testid="home-recent-score"
      >
        {game.ourScore}–{game.theirScore}
      </span>
    </button>
  );
}


const SECTION_LABEL = 'text-xs font-bold uppercase tracking-[0.16em]';

/**
 * The Pelit-tab dashboard: the hero card for the match this screen is about,
 * then the latest results (or upcoming fixtures) as a list. Purely
 * presentational - all data is precomputed in `buildHomeSummary`.
 */
export function HomeDashboard({
  summary,
  onResume,
  onOpenGame,
  onAdjustTravel,
  onNewGame,
  onSetStartingPoint,
  onMarkAbsences,
  nextMatchPlan,
  renderNextMatchTheme,
  afterHero,
  locale = 'fi',
  t,
}: {
  summary: HomeSummary;
  /** The next fixture's Playbook themes row (flagged accounts only), by game id. */
  renderNextMatchTheme?: (gameId: string) => React.ReactNode;
  /** The next fixture's "Näytä suunnitelma" / "Jaa", when it has a plan. */
  nextMatchPlan?: NextMatchPlanActions;
  /**
   * What sits directly under the hero, above the list: "Uusi ottelu" (owner,
   * 2026-11-19 - starting a match is the next thing a coach looks for).
   */
  afterHero?: React.ReactNode;
  /** The next fixture's "Merkitse poissaolijat" (Onboarding v3). */
  onMarkAbsences?: (id: string) => void;
  onResume?: () => void;
  onOpenVuosi?: () => void;
  onOpenGame?: (id: string) => void;
  onAdjustTravel?: (id: string, next: { arrivalBufferMinutes?: number; travelMinutes?: number }) => void;
  /** Opens the new-game flow from the empty top card. */
  onNewGame?: () => void;
  /** Opens the settings where the starting point lives. */
  onSetStartingPoint?: () => void;
  /** The app language, for weekday names - the same default as i18n.ts. */
  locale?: string;
  t: TFunction;
}) {
  /**
   * Which list the coach is looking at. ONLY THE COACH'S EXPLICIT CHOICE IS
   * STORED - null until they tap the toggle - so the default stays derived
   * from what exists right now: booking the season's first fixture without
   * leaving Home switches the list to it. The toggle only renders when BOTH
   * exist - one kind of match is not a choice.
   */
  const [chosenStrip, setStrip] = useState<'upcoming' | 'recent' | null>(null);

  const hasBoth = summary.upcomingList.length > 0 && summary.recent.length > 0;
  const showing = summary.upcomingList.length === 0 ? 'recent'
    : summary.recent.length === 0 ? 'upcoming'
      : chosenStrip ?? 'upcoming';

  // The accent has a job only while the top card is showing something ELSE.
  const accentId = summary.upcoming ? summary.resume?.id : undefined;

  return (
    <>
      {/* Always something here - see NoMatchCard for why the slot must not
          be allowed to empty. */}
      {summary.upcoming
        ? <NextMatchCard game={summary.upcoming} onOpen={onOpenGame} onAdjustTravel={onAdjustTravel} onSetStartingPoint={onSetStartingPoint} onMarkAbsences={onMarkAbsences} planActions={nextMatchPlan} themeSlot={renderNextMatchTheme?.(summary.upcoming.id)} locale={locale} t={t} />
        : summary.resume
          ? <ResumeCard resume={summary.resume} onResume={onResume} locale={locale} t={t} />
          // Nothing booked and nothing open: the latest match played, with the
          // same Jatka action - a card that opens a real match beats a prompt.
          : summary.lastPlayed
            ? <ResumeCard resume={summary.lastPlayed} onResume={() => onOpenGame?.(summary.lastPlayed!.id)} locale={locale} t={t} />
            : <NoMatchCard onNewGame={onNewGame} t={t} />}
      {afterHero}
      {(summary.recent.length > 0 || summary.upcomingList.length > 0) && (
        <div>
          {/* THE TOGGLE IS THE LABEL, not a control above it: two words at the
              heading's own size cost no height. */}
          {/* The season record lives in Kilpailut / Tilastot (owner 2026-11-19),
              so this header is just the toggle and always fits one line. */}
          <div className="-mb-0.5 flex items-center gap-2 px-1">
            {hasBoth ? (
              <div className="flex items-center gap-1" role="tablist">
                {(['upcoming', 'recent'] as const).map((which, i) => (
                  <React.Fragment key={which}>
                    {i > 0 && <span className="text-ink-3" aria-hidden="true">·</span>}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={showing === which}
                      onClick={() => setStrip(which)}
                      className={`${SECTION_LABEL} min-h-11 rounded-lg px-1 transition-colors ${HOME_FOCUS} ${
                        showing === which ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
                      }`}
                    >
                      {which === 'upcoming'
                        ? t('startScreen.dashUpcoming', 'Upcoming')
                        : t('startScreen.dashRecent', 'Recent')}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <h2 className={`${SECTION_LABEL} flex min-h-11 items-center text-ink-3`}>
                {showing === 'upcoming'
                  ? t('startScreen.dashUpcoming', 'Upcoming')
                  : t('startScreen.dashRecent', 'Recent')}
              </h2>
            )}
          </div>
          <div className="s1-list p-0.5">
            {showing === 'upcoming'
              ? summary.upcomingList.slice(0, LIST_ROWS).map((game, i) => (
                  <UpcomingRow key={game.id} game={game} onOpen={onOpenGame} locale={locale} first={i === 0} t={t} />
                ))
              : summary.recent.slice(0, LIST_ROWS).map((game, i) => (
                  <RecentRow
                    key={game.id}
                    game={game}
                    onOpen={onOpenGame}
                    accented={!!accentId && game.id === accentId}
                    first={i === 0}
                    t={t}
                  />
                ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Which team the numbers below are about.
 *
 * Only shown when there is more than one team to choose between: a coach with
 * one team should not be asked a question with one answer.
 */
export function HomeTeamScopeSelect({
  teams,
  scope,
  onChange,
  t,
}: {
  teams: Array<{ id: string; label: string }>;
  scope: string;
  onChange: (scope: string) => void;
  t: TFunction;
}) {
  if (teams.length < 2) return null;
  return (
    <label
      className={`${HOME_CARD} relative flex min-h-14 w-full items-center gap-3 px-4 focus-within:ring-2 focus-within:ring-action`}
      data-testid="home-team-scope"
    >
      <span className="whitespace-nowrap text-xs font-bold uppercase tracking-[0.16em] text-ink-3">
        {t('startScreen.dashTeamLabel', 'Team')}
      </span>
      <select
        value={scope}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('startScreen.dashTeamScope', 'Which team these numbers are about')}
        className="min-h-11 min-w-0 flex-1 appearance-none truncate bg-transparent pr-7 text-base font-semibold text-ink focus:outline-none [&>option]:bg-surface"
      >
        <option value="all">{t('startScreen.dashAllTeams', 'All teams')}</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>{team.label}</option>
        ))}
      </select>
      <HomeIcon name="chev" className="pointer-events-none absolute right-4 h-4 w-4 rotate-90 text-ink-3" strokeWidth={2} />
    </label>
  );
}

/** The season label to show, or null for the off-season (it has no label of its own). */
const seasonLabelOf = (vuosi: HomeSummary['vuosi']): string | null =>
  vuosi && vuosi.label !== 'off-season' ? vuosi.label : null;

/**
 * The full season record, wins - draws - losses, each in its result colour.
 * Shown in Kilpailut and Tilastot only (owner, 2026-11-19); the Seura card
 * keeps its compact line and the Pelit list has none.
 */
function SeasonRecord({ vuosi, className = '', t }: {
  vuosi: NonNullable<HomeSummary['vuosi']>;
  className?: string;
  t: TFunction;
}) {
  return (
    <span
      className={`whitespace-nowrap pr-[3px] font-display font-extrabold italic leading-none tabular-nums ${className}`}
      title={t('startScreen.dashRecordTitle', 'Wins - draws - losses')}
    >
      <span className="sr-only">{t('startScreen.dashRecordTitle', 'Wins - draws - losses')}: </span>
      <span className="text-win">{vuosi.wins}</span>
      <span className="text-ink-3">-</span>
      <span className="text-draw">{vuosi.ties}</span>
      <span className="text-ink-3">-</span>
      <span className="text-loss">{vuosi.losses}</span>
    </span>
  );
}

/** A count on Home: Barlow Condensed italic, like every other number here. */
export function HomeCount({ n, className = '' }: { n: React.ReactNode; className?: string }) {
  return <span className={`pr-[2px] font-display font-bold italic tabular-nums ${className}`}>{n}</span>;
}

/**
 * The last results as small letter chips, NEWEST FIRST - the same order and
 * the same badge colours as Pelit's results list, so the two read alike.
 */
function FormStrip({ form, t, testId = 'competitions-form', small = false }: {
  form: GameResult[];
  t: TFunction;
  testId?: string;
  /** 24px discs - a "Joukkueet" row shares its line with the goal difference. */
  small?: boolean;
}) {
  const label = t('startScreen.dashForm', 'Recent form');
  return (
    <span className="flex items-center gap-1" role="img" aria-label={`${label}: ${form.map((r) => badgeLetter(r, t)).join(' ')}`} data-testid={testId}>
      {form.map((r, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-result={r}
          className={`grid place-items-center rounded-full px-1 font-display font-bold leading-none ${small ? 'h-6 min-w-6 text-[13px]' : 'h-7 min-w-7 text-[15px]'} ${RESULT_CLASSES[r].disc}`}
        >
          {badgeLetter(r, t)}
        </span>
      ))}
    </span>
  );
}

/** How many results Kilpailut's form strip shows. */
const FORM_GAMES = 5;

/**
 * Kilpailut tab's hero: the club season (the previous one while the current
 * has no game yet) - its label, the full record, "N games · GF–GA" and the
 * last five results. It opens OVERALL stats: the record is the club season's,
 * not one league's.
 */
export function HomeSeasonHero({ vuosi, recent, onOpen, t }: {
  vuosi: HomeSummary['vuosi'];
  /** Played games, newest first (the summary's `recent`); the first five form the strip. */
  recent?: HomeRecentGame[];
  onOpen?: () => void;
  t: TFunction;
}) {
  const label = seasonLabelOf(vuosi);
  const played = !!vuosi && vuosi.gamesPlayed > 0;
  const form = (recent ?? []).slice(0, FORM_GAMES).map((g) => g.result);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="competitions-hero"
      className={`s1-hero s1-hero-quiet block w-full px-5 py-5 text-left text-ink transition-opacity hover:opacity-95 ${HOME_FOCUS}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.09em] text-ink-3">
          {t('startScreen.dashSeason', 'Season')}
        </span>
        <HomeIcon name="chev" className="h-4 w-4 text-ink-3" strokeWidth={2} />
      </span>
      <span className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <span className="font-display text-[34px] font-bold leading-none text-ink">
          {label ?? t('startScreen.tabSeasons', 'Competitions')}
        </span>
        {played && <SeasonRecord vuosi={vuosi} className="text-[44px]" t={t} />}
      </span>
      {(vuosi || form.length > 0) && (
        <span className="mt-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline pt-3">
          {vuosi && (
            <span className="text-[13px] text-ink-2" data-testid="competitions-hero-line">
              {played ? (
                <>
                  <HomeCount n={vuosi.gamesPlayed} className="text-lg text-ink" />{' '}
                  {t('startScreen.dashGamesWord', 'games', { count: vuosi.gamesPlayed })}
                  <span className="mx-1 text-ink-3" aria-hidden="true">·</span>
                  <HomeCount n={`${vuosi.goalsFor}–${vuosi.goalsAgainst}`} className="text-lg text-ink" />
                </>
              ) : (
                t('startScreen.dashStatsEmpty', 'No games played yet')
              )}
            </span>
          )}
          {form.length > 0 && <FormStrip form={form} t={t} />}
        </span>
      )}
    </button>
  );
}

/**
 * Seura tab: the club card (owner's pick "A · Seurakortti", 2026-11-19), the
 * sister of the Pelit tab's hero. Three counts that each open their manager,
 * then the season record - the same club-wide number Home already computes,
 * nothing new. No top scorer: Home is about teams, not individuals (owner,
 * 2026-11-21).
 *
 * Counts show a dash until the enriched summary has loaded, so a still-loading
 * 0 never reads as "you have none". The footer only appears once the season
 * has a played game: a 0-0-0 line says nothing.
 */
export function HomeClubCard({ title, showClubEyebrow, counts, vuosi, onPlayers, onTeams, onPersonnel, t }: {
  /** The shared club name from the team names, or the neutral "Seura". */
  title: string;
  /** True when `title` is a real club name, so the eyebrow says "Seura". */
  showClubEyebrow: boolean;
  counts?: HomeCounts;
  vuosi: HomeSummary['vuosi'];
  onPlayers?: () => void;
  onTeams?: () => void;
  onPersonnel?: () => void;
  t: TFunction;
}) {
  const seasonLabel = vuosi && vuosi.label !== 'off-season' ? vuosi.label : null;
  const eyebrow = [
    showClubEyebrow ? t('startScreen.tabTeam', 'Club') : null,
    seasonLabel ? `${t('startScreen.dashSeason', 'Season')} ${seasonLabel}` : null,
  ].filter(Boolean).join(' · ');
  const showRecord = !!vuosi && vuosi.gamesPlayed > 0;
  const stat = (n: number | undefined, label: string, onClick: (() => void) | undefined, testId: string, first = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-testid={testId}
      className={`relative flex min-h-16 min-w-0 flex-col items-start justify-center gap-1 rounded-[14px] px-1.5 py-1.5 text-left transition-colors ${HOME_FOCUS} ${
        // A straight hairline between the counts; an inset shadow followed the
        // rounded corner and drew a bracket.
        first ? '' : 'before:absolute before:inset-y-1.5 before:left-0 before:w-px before:bg-hairline'
      } ${onClick ? 'hover:bg-white/[0.04] active:bg-white/[0.06]' : 'cursor-not-allowed opacity-40'}`}
    >
      {n === undefined ? (
        <span className="font-display text-[34px] font-extrabold italic leading-none text-ink-3" aria-hidden="true">–</span>
      ) : (
        <span className="s1-numeral pr-[3px] font-display text-[34px] font-extrabold italic leading-none tabular-nums">{n}</span>
      )}
      <span className="flex max-w-full items-center text-xs font-medium text-ink-2">
        <span className="truncate">{label}</span>
        <HomeIcon name="chev" className="h-3 w-3 flex-shrink-0 text-ink-3" strokeWidth={2} />
      </span>
    </button>
  );
  return (
    // px-4, not the other heroes' p-5: at 320px the third-width counts need
    // the room for "Joukkueet" and its chevron without truncating.
    <div className="s1-hero s1-hero-quiet px-4 py-5 text-ink" data-testid="club-card">
      {eyebrow && (
        <span className="block text-xs font-semibold uppercase tracking-[0.09em] text-ink-3">{eyebrow}</span>
      )}
      <h2 className={`${eyebrow ? 'mt-2' : ''} break-words font-display text-[34px] font-bold leading-none tracking-[0.005em] text-ink`}>
        {title}
      </h2>
      <div className="-mx-1.5 mt-4 grid grid-cols-3">
        {stat(counts?.players, t('startScreen.rowPlayers', 'Players'), onPlayers, 'club-count-players', true)}
        {stat(counts?.teams, t('startScreen.rowTeams', 'Teams'), onTeams, 'club-count-teams')}
        {stat(counts?.personnel, t('startScreen.clubCountPersonnel', 'Staff'), onPersonnel, 'club-count-personnel')}
      </div>
      {showRecord && (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline pt-3 text-[13px] text-ink-2" data-testid="club-card-season">
          <span
            className="whitespace-nowrap font-display text-lg font-bold italic leading-none tabular-nums"
            title={t('startScreen.dashRecordTitle', 'Wins - draws - losses')}
          >
            <span className="sr-only">{t('startScreen.dashRecordTitle', 'Wins - draws - losses')}: </span>
            <span className="text-win">{vuosi.wins}</span>
            <span className="text-ink-3">-</span>
            <span className="text-draw">{vuosi.ties}</span>
            <span className="text-ink-3">-</span>
            <span className="text-loss">{vuosi.losses}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** One tappable figure on the Tilastot hero: the number, then what it is. */
function StatTile({ figure, label, onClick, testId }: {
  figure: React.ReactNode;
  label: React.ReactNode;
  onClick?: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-testid={testId}
      className={`flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-2 rounded-[18px] bg-white/[0.04] px-1.5 py-3 text-center ring-1 ring-inset ring-white/[0.07] transition-colors enabled:hover:bg-white/[0.07] enabled:active:bg-white/[0.09] ${HOME_FOCUS}`}
    >
      <span className="block whitespace-nowrap font-display text-[clamp(32px,11vw,44px)] font-extrabold italic leading-none text-ink tabular-nums">
        {figure}
      </span>
      {/* Sentence case and allowed to wrap: an uppercase caption was wider
          than a third-width tile on a 320px phone. */}
      <span className="block max-w-full break-words text-xs font-semibold leading-tight text-ink-2">{label}</span>
    </button>
  );
}

/**
 * Tilastot tab's hero: the club season's two figures, each labelled and each
 * opening overall stats. The "Joukkueet" card below splits them per team.
 */
export function HomeStatsHero({ vuosi, onOpenOverall, t }: {
  vuosi: HomeSummary['vuosi'];
  onOpenOverall?: () => void;
  t: TFunction;
}) {
  if (!vuosi) return null;
  // Nothing played yet: one clear message instead of a row of zero tiles.
  if (vuosi.gamesPlayed === 0) {
    return (
      <div className="s1-hero s1-hero-quiet px-5 py-5 text-center text-ink" data-testid="home-stats-empty">
        <p className="text-base font-semibold text-ink">{t('startScreen.dashStatsEmpty', 'No games played yet')}</p>
        <p className="mt-1 text-[13px] text-ink-3">{t('startScreen.dashStatsEmptyHint', "The season record and each team's results appear here after the first game.")}</p>
      </div>
    );
  }
  const label = seasonLabelOf(vuosi);
  return (
    <div className="s1-hero s1-hero-quiet px-4 py-5 text-ink" data-testid="stats-hero">
      <span className="flex items-baseline justify-between gap-3 px-1 text-xs font-semibold uppercase tracking-[0.09em] text-ink-3">
        <span>{[t('startScreen.dashSeason', 'Season'), label].filter(Boolean).join(' ')}</span>
        <span className="normal-case tracking-normal text-[13px] font-medium text-ink-2">
          <HomeCount n={vuosi.gamesPlayed} className="text-base text-ink" />{' '}
          {t('startScreen.dashGamesWord', 'games', { count: vuosi.gamesPlayed })}
        </span>
      </span>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <StatTile
          testId="stats-tile-record"
          figure={<SeasonRecord vuosi={vuosi} t={t} />}
          label={t('startScreen.dashTileRecord', 'W–D–L')}
          onClick={onOpenOverall}
        />
        <StatTile
          testId="stats-tile-goal-diff"
          figure={`${vuosi.goalDifference >= 0 ? '+' : ''}${vuosi.goalDifference}`}
          label={t('startScreen.dashTileGoalDiff', 'Goal diff')}
          onClick={onOpenOverall}
        />
      </div>
    </div>
  );
}

/** Win / loss colour for a goal difference; level stays neutral. */
function goalDiffClass(diff: number): string {
  return diff > 0 ? 'text-win' : diff < 0 ? 'text-loss' : 'text-ink-2';
}

/** "+3" / "-2" / "0". */
const signedDiff = (diff: number): string => `${diff > 0 ? '+' : ''}${diff}`;

/** The W-D-L figures in the result colours, as one inline run. */
function RecordFigures({ record, className = '', t }: {
  record: Pick<TeamRecord, 'wins' | 'ties' | 'losses'>;
  className?: string;
  t: TFunction;
}) {
  return (
    <span
      className={`whitespace-nowrap pr-[2px] font-display font-bold italic leading-none tabular-nums ${className}`}
      title={t('startScreen.dashRecordTitle', 'Wins - draws - losses')}
    >
      <span className="sr-only">{t('startScreen.dashRecordTitle', 'Wins - draws - losses')}: </span>
      <span className="text-win">{record.wins}</span>
      <span className="text-ink-3">-</span>
      <span className="text-draw">{record.ties}</span>
      <span className="text-ink-3">-</span>
      <span className="text-loss">{record.losses}</span>
    </span>
  );
}

/** "+5 Maaliero" - the coloured goal difference with its label. */
function GoalDiff({ diff, t }: { diff: number; t: TFunction }) {
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap" data-testid="team-row-goal-diff">
      <HomeCount n={signedDiff(diff)} className={`text-base leading-none ${goalDiffClass(diff)}`} />
      <span className="text-[11px] font-medium text-ink-3">{t('startScreen.dashTileGoalDiff', 'Goal diff')}</span>
    </span>
  );
}

/**
 * Tilastot tab: "Joukkueet" - one row per team that played in the hero's
 * games (same club season, team scope, played-only, no friendlies): kit
 * swatch, name, W-D-L, then the last five results and the goal difference. Most games
 * first, then by name. A row opens overall stats filtered to that team.
 *
 * With only ONE team in scope a team row would repeat the hero, so the card
 * shows that team's home / away split instead (not tappable: the stats view
 * has no home / away filter).
 *
 * Replaced the top-scorers card (owner, 2026-11-21): Home is about teams.
 */
export function HomeTeamsCard({ summary, teams, onOpenTeam, t }: {
  summary: Pick<HomeSummary, 'teamRecords' | 'homeAway'>;
  /** The team pills' options: the display name and kit colour per team id. */
  teams: ReadonlyArray<{ id: string; label: string; color?: string }>;
  onOpenTeam?: (teamId: string) => void;
  t: TFunction;
}) {
  const records = summary.teamRecords ?? [];
  if (records.length === 0) return null;

  if (records.length === 1) {
    const split = summary.homeAway;
    if (!split) return null;
    const sides = [
      ['home', t('startScreen.dashAtHome', 'Home'), split.home],
      ['away', t('startScreen.dashAway', 'Away'), split.away],
    ] as const;
    return (
      <div className="s1-list p-0.5" data-testid="home-away">
        <h3 className={`${SECTION_LABEL} flex min-h-11 items-center px-4 text-ink-3`}>
          {t('startScreen.dashHomeAway', 'Home and away')}
        </h3>
        {sides.map(([key, label, rec]) => (
          <div key={key} className="relative flex min-h-14 w-full items-center gap-3 py-1.5 pl-4 pr-4" data-testid={`home-away-${key}`}>
            <RowRule />
            <b className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-5 text-ink">{label}</b>
            {rec.gamesPlayed > 0 ? (
              <span className="flex items-baseline gap-3">
                <RecordFigures record={rec} className="text-[22px]" t={t} />
                <GoalDiff diff={rec.goalDifference} t={t} />
              </span>
            ) : (
              <span className="text-[13px] text-ink-3">{t('startScreen.dashNoGames', 'No games')}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  const byId = new Map(teams.map((team) => [team.id, team]));
  const rows = records
    .map((r) => {
      const team = r.teamId ? byId.get(r.teamId) : undefined;
      const name = team?.label || r.fallbackName || t('startScreen.dashNoTeam', 'No team');
      return { ...r, name, color: team?.color };
    })
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name));

  return (
    <div className="s1-list p-0.5" data-testid="home-teams">
      <h3 className={`${SECTION_LABEL} flex min-h-11 items-center px-4 text-ink-3`}>
        {t('startScreen.dashTeamsCard', 'Teams')}
      </h3>
      {rows.map((r) => {
        const body = (
          <>
            <RowRule />
            {/* Kit swatch, as in the teams list: the team's own colour, or an
                empty outline so the names still line up. */}
            <span
              aria-hidden="true"
              className="h-10 w-3.5 flex-none self-center rounded-[5px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.15)]"
              style={r.color ? { backgroundColor: r.color } : undefined}
              data-testid="team-row-swatch"
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-baseline justify-between gap-3">
                <b className="min-w-0 truncate text-[15px] font-semibold leading-5 text-ink" data-testid="team-row-name">{r.name}</b>
                <RecordFigures record={r} className="text-[22px]" t={t} />
              </span>
              <span className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                {r.form.length > 0 ? <FormStrip form={r.form} t={t} testId="team-row-form" small /> : <span />}
                <GoalDiff diff={r.goalDifference} t={t} />
              </span>
            </span>
          </>
        );
        return onOpenTeam ? (
          <button
            key={r.teamId || 'legacy'}
            type="button"
            onClick={() => onOpenTeam(r.teamId)}
            data-testid={`team-row-${r.teamId || 'legacy'}`}
            className={`${LIST_ROW} py-2.5`}
          >
            {body}
          </button>
        ) : (
          <div key={r.teamId || 'legacy'} data-testid={`team-row-${r.teamId || 'legacy'}`} className="relative flex min-h-14 w-full items-center gap-3 py-2.5 pl-3 pr-4">
            {body}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------- basic layout (Perusnäkymä) */

/** The quiet outline pill under the basic card's primary action. */
const GHOST_PILL = `s1-ghost flex h-12 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-2.5 text-[15px] font-semibold text-ink transition-colors ${HOME_FOCUS}`;

/** What the basic card knows about the game's plan (looked up asynchronously). */
export type BasicCardPlanState = 'loading' | 'none' | 'ready';

/**
 * The basic layout's next-game card (Onboarding v3, step 6): the same hero
 * surface and top line as the full layout's next-match card, then the match,
 * "Suunnitelma valmis · N pelaajaa", ONE primary action - "Aloita ottelu" on game
 * day, "Merkitse poissaolijat" before it - and "Näytä suunnitelma" / "Jaa" for a
 * game made from a plan. No travel row: the basic layout leaves it out.
 */
export function BasicNextGameCard({
  game,
  planState,
  onOpen,
  onPrimary,
  onShowPlan,
  onShare,
  onMoveDate,
  onDelete,
  themeSlot,
  today,
  locale,
  t,
}: {
  game: HomeUpcomingGame;
  planState: BasicCardPlanState;
  /** The game's Playbook themes row (flagged accounts), at the end of the card. */
  themeSlot?: React.ReactNode;
  /** Opens the game on the pitch (the card body). */
  onOpen: () => void;
  /** Game day: start (the attendance sheet, then the game); otherwise mark absences. */
  onPrimary: () => void;
  onShowPlan?: () => void;
  onShare?: () => void;
  /**
   * A game whose day passed without it kicking off (`game.daysOverdue`, R2):
   * "Siirrä päivää" saves a new date. Resolves false when the save failed.
   */
  onMoveDate?: (gameDate: string) => Promise<boolean>;
  /** ...and "Poista" (the caller confirms first). */
  onDelete?: () => void;
  /** Today, YYYY-MM-DD - the date editor's starting value. */
  today?: string;
  locale: string;
  t: TFunction;
}) {
  const overdue = game.daysOverdue !== undefined;
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const gameDay = !overdue && game.daysAway === 0;
  const countdown = overdue
    ? t('basicHome.overdueDays', '{{count}} d ago', { count: game.daysOverdue })
    : gameDay
      ? t('startScreen.dashToday', 'Today')
      : game.daysAway === 1
        ? t('startScreen.dashTomorrow', 'Tomorrow')
        : t('startScreen.dashInDays', '{{count}} d', { count: game.daysAway });
  const when = [formatWeekdayDate(game.date, locale), game.time].filter(Boolean).join(' ');
  const opponent = game.opponent || t('startScreen.dashResumeGame', 'Game');
  const title = game.teamName ? `${game.teamName} – ${opponent}` : opponent;
  const players = t('basicHome.players', '{{count}} players', { count: game.squadCount ?? 0 });

  return (
    <div className="s1-hero p-5 text-ink" data-testid="basic-next-game">
      <HeroTop
        left={<LiveLabel>{[t('basicHome.nextGame', 'Next game'), when].filter(Boolean).join(' · ')}</LiveLabel>}
        right={<HeroChip>{countdown}</HeroChip>}
      />
      <button type="button" onClick={onOpen} className={`${HERO_BODY} mt-3`}>
        <span className="block break-words font-display text-[28px] font-bold leading-[1.1] tracking-[0.005em] text-ink">
          {title}
        </span>
        <span className="mt-2 flex items-center gap-2 text-[15px] text-ink-2" data-testid="basic-plan-line">
          {planState === 'ready' && <HomeIcon name="check" className="h-[18px] w-[18px] text-win" strokeWidth={2.4} />}
          {planState === 'ready' ? `${t('basicHome.planReady', 'Rotation ready')} · ${players}` : players}
        </span>
      </button>
      {overdue ? (
        <>
          <p className="mt-3 text-[15px] leading-snug text-ink-2" data-testid="basic-overdue-note">
            {t('basicHome.overdueNote', 'This game was not started. Move it to a new date or remove it.')}
          </p>
          {editingDate ? (
            <form
              className="mt-4 flex flex-col gap-2.5"
              data-testid="basic-move-date-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!dateDraft || savingDate || !onMoveDate) return;
                setSavingDate(true);
                void onMoveDate(dateDraft).then((ok) => {
                  setSavingDate(false);
                  if (ok) setEditingDate(false);
                });
              }}
            >
              <input
                type="date"
                required
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                aria-label={t('basicHome.newDate', 'New date')}
                data-testid="basic-move-date-input"
                className="h-12 w-full rounded-2xl bg-white/[0.06] px-4 text-base text-ink [color-scheme:dark] ring-1 ring-inset ring-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
              />
              <div className="flex gap-2.5">
                <button type="button" onClick={() => setEditingDate(false)} className={GHOST_PILL}>
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!dateDraft || savingDate}
                  className={`s1-primary flex h-12 min-w-0 flex-1 items-center justify-center rounded-full px-2.5 text-[15px] font-bold disabled:opacity-50 ${HOME_FOCUS}`}
                  data-testid="basic-move-date-save"
                >
                  {t('common.save', 'Save')}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setDateDraft(today ?? game.date);
                    setEditingDate(true);
                  }}
                  disabled={!onMoveDate}
                  className={PRIMARY_BTN}
                  data-testid="basic-move-date"
                >
                  {t('basicHome.moveDate', 'Move to another day')}
                </button>
              </div>
              {onDelete && (
                <div className="mt-2.5 flex gap-2.5">
                  <button type="button" onClick={onDelete} className={GHOST_PILL} data-testid="basic-delete-game">
                    {t('basicHome.deleteGame', 'Remove')}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="mt-4">
          <button type="button" onClick={onPrimary} className={PRIMARY_BTN} data-testid="basic-primary">
            {gameDay ? t('basicHome.startMatch', 'Start the match') : t('basicHome.markAbsences', 'Mark who is away')}
          </button>
        </div>
      )}
      {!overdue && planState === 'ready' && (onShowPlan || onShare) && (
        <div className="mt-2.5 flex gap-2.5">
          {onShowPlan && (
            <button type="button" onClick={onShowPlan} className={GHOST_PILL} data-testid="basic-show-plan">
              {t('basicHome.showPlan', 'Show rotation')}
            </button>
          )}
          {onShare && (
            <button type="button" onClick={onShare} className={GHOST_PILL} data-testid="basic-share">
              {t('basicHome.share', 'Share')}
            </button>
          )}
        </div>
      )}
      {!overdue && themeSlot}
    </div>
  );
}

/**
 * The basic layout's card when no game is booked: the latest result, if there
 * is one, and "Uusi ottelu". The body opens that game.
 */
export function BasicNoNextGameCard({
  last,
  onOpenLast,
  onNewGame,
  locale,
  t,
}: {
  last: HomeResumeGame | null;
  onOpenLast?: () => void;
  onNewGame?: () => void;
  locale: string;
  t: TFunction;
}) {
  const result = last && last.isPlayed ? resultOf(last.ourScore, last.theirScore) : null;
  return (
    <div className="s1-hero s1-hero-quiet p-5 text-ink" data-testid="basic-no-next-game">
      {last ? (
        <>
          <HeroTop
            left={
              <span className={`${HERO_LABEL} text-ink-3`}>
                {[t('basicHome.lastGame', 'Last game'), last.date ? formatWeekdayDate(last.date, locale) : '']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            }
            right={result ? <ResultPill result={result} t={t} /> : undefined}
          />
          <button type="button" onClick={onOpenLast} className={`${HERO_BODY} mt-3 flex items-end justify-between gap-3`}>
            <span className="min-w-0 break-words font-display text-[28px] font-bold leading-[1.1] text-ink">
              {last.opponent || t('startScreen.dashResumeGame', 'Game')}
            </span>
            <span
              className={`${result ? RESULT_CLASSES[result].numeral : 's1-numeral'} shrink-0 font-display text-[44px] font-extrabold italic leading-none tabular-nums`}
            >
              {`${last.ourScore}–${last.theirScore}`}
            </span>
          </button>
          <p className="mt-3 text-[15px] text-ink-2">{t('basicHome.noNextGame', 'No next game yet')}</p>
        </>
      ) : (
        <>
          <HeroTop left={<span className={`${HERO_LABEL} text-ink-3`}>{t('basicHome.nextGame', 'Next game')}</span>} />
          <p className="mt-2 text-[15px] text-ink-2">{t('startScreen.dashNoMatchesYet', 'No matches yet.')}</p>
        </>
      )}
      <div className="mt-4">
        <button type="button" onClick={onNewGame} className={PRIMARY_BTN} data-testid="basic-new-game">
          <HomeIcon name="plus" className="h-5 w-5" strokeWidth={2.4} />
          {t('basicHome.newGame', 'New game')}
        </button>
      </div>
    </div>
  );
}

export default HomeDashboard;
