'use client';

import React, { useState } from 'react';
import type { TFunction } from 'i18next';
import type { HomeSummary, HomeResumeGame, HomeRecentGame, HomeUpcomingGame } from '@/utils/homeSummary';
import type { GameResult } from '@/utils/gameResult';
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
 * is for numerals and names. The rest of the app stays on Rajdhani.
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
const formatDayMonth = (iso: string): string => {
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

/** Big score numeral, coloured by result. A match not yet played has none. */
const numeralClass: Record<GameResult, string> = {
  W: 's1-numeral-win',
  D: 's1-numeral-draw',
  L: 's1-numeral-loss',
};

/** Round result badge in the results list. */
const badgeClass: Record<GameResult, string> = {
  W: 'bg-win/15 text-win',
  D: 'bg-white/10 text-draw',
  L: 'bg-loss/15 text-loss',
};

/** V / T / TA in Finnish, W / L / T in English - the letters the app's exports already use. */
const badgeLetter = (result: GameResult, t: TFunction): string =>
  result === 'W'
    ? t('export.winShort', 'W')
    : result === 'L'
      ? t('export.lossShort', 'L')
      : t('export.tieShort', 'T');

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

/** Amber label with the live dot: "Next match", "Last opened". */
function LiveLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className={`${HERO_LABEL} pl-[3px] text-action`}>
      <i className="s1-live-dot" aria-hidden="true" />
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

/** "vs Opponent" in the display face. The opponent is its own element. */
function Opponent({ who, t, stacked = false, className = '' }: { who: string; t: TFunction; stacked?: boolean; className?: string }) {
  return (
    <span className={`block break-words font-display text-[30px] font-bold leading-[1.1] tracking-[0.005em] text-ink ${className}`}>
      <small className={`font-ui text-xs font-semibold uppercase tracking-[0.14em] text-ink-3 ${stacked ? 'mb-1 block' : 'mr-2 align-[4px]'}`}>
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
function ResumeCard({ resume, onResume, locale, t }: {
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
          left={<LiveLabel>{lastOpened}</LiveLabel>}
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
          {who.length > 12 && <Opponent who={who} t={t} stacked className="text-[28px]" />}
          <span className="mt-1 flex items-end justify-between gap-3">
            <span className="block min-w-0 pb-1">
              {who.length <= 12 && <Opponent who={who} t={t} stacked className="text-[28px]" />}
              {(name || resume.venueTown || resume.fieldNumber) && (
                <span className="mt-1 block break-words text-[13px] leading-[1.35] text-ink-2">
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
            </span>
            <span
              className={`${result ? numeralClass[result] : 's1-numeral'} -mr-1.5 shrink-0 whitespace-nowrap pl-1 pr-2.5 font-display text-[clamp(64px,22vw,96px)] font-extrabold italic leading-[0.8] tracking-[-0.01em] tabular-nums`}
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
          <button type="button" onClick={onResume} className={PRIMARY_BTN}>
            {t('startScreen.resumeCard', 'Continue')} →
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
function NextMatchCard({
  game,
  onOpen,
  onAdjustTravel,
  onSetStartingPoint,
  locale,
  t,
}: {
  game: HomeUpcomingGame;
  onOpen?: (id: string) => void;
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
          left={<LiveLabel>{t('startScreen.dashNextMatch', 'Next match')}</LiveLabel>}
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
                    <span className="text-action underline decoration-action/60 underline-offset-2">
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
      <span className={`grid h-8 w-8 flex-none place-items-center rounded-full font-display text-[17px] font-bold leading-none ${badgeClass[game.result]}`}>
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
        className={`min-w-[46px] pr-[3px] text-right font-display text-[28px] font-bold italic leading-none tabular-nums ${
          game.result === 'D' ? 'text-ink-2' : 'text-ink'
        }`}
      >
        {game.ourScore}–{game.theirScore}
      </span>
    </button>
  );
}

/**
 * The season's record, on the list header's right-hand side - the "see all"
 * link: it opens the club stats. Green-grey-red is the football convention
 * for W-D-L, so the colours label it without spending width on words.
 */
function SeasonLink({ vuosi, onOpen, t }: { vuosi: NonNullable<HomeSummary['vuosi']>; onOpen?: () => void; t: TFunction }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`ml-auto inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg pl-3 text-[13px] font-semibold text-action ${HOME_FOCUS}`}
      title={t('startScreen.dashRecordTitle', 'Wins - draws - losses')}
    >
      <span>{t('startScreen.dashSeason', 'Season')} {vuosi.label}</span>
      <span className="text-ink-3" aria-hidden="true">·</span>
      <span className="tabular-nums">
        <span className="font-bold text-win">{vuosi.wins}</span>
        <span className="text-ink-3">-{vuosi.ties}-</span>
        <span className="font-bold text-loss">{vuosi.losses}</span>
      </span>
      <HomeIcon name="chev" className="h-4 w-4" strokeWidth={2} />
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
  onOpenVuosi,
  onOpenGame,
  onAdjustTravel,
  onNewGame,
  onSetStartingPoint,
  locale = 'fi',
  t,
}: {
  summary: HomeSummary;
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
        ? <NextMatchCard game={summary.upcoming} onOpen={onOpenGame} onAdjustTravel={onAdjustTravel} onSetStartingPoint={onSetStartingPoint} locale={locale} t={t} />
        : summary.resume
          ? <ResumeCard resume={summary.resume} onResume={onResume} locale={locale} t={t} />
          // Nothing booked and nothing open: the latest match played, with the
          // same Jatka action - a card that opens a real match beats a prompt.
          : summary.lastPlayed
            ? <ResumeCard resume={summary.lastPlayed} onResume={() => onOpenGame?.(summary.lastPlayed!.id)} locale={locale} t={t} />
            : <NoMatchCard onNewGame={onNewGame} t={t} />}
      {(summary.recent.length > 0 || summary.upcomingList.length > 0) && (
        <div>
          {/* THE TOGGLE IS THE LABEL, not a control above it: two words at the
              heading's own size cost no height. */}
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
            {summary.vuosi && <SeasonLink vuosi={summary.vuosi} onOpen={onOpenVuosi} t={t} />}
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

/** Seura tab: a one-line roster/team/personnel count header. */
export function HomeCountsBar({ counts, t }: { counts: HomeSummary['counts']; t: TFunction }) {
  // Pluralised through i18next: Finnish partitive is only correct above one.
  const parts = [
    t('startScreen.dashPlayersCount', '{{count}} players', { count: counts.players }),
    t('startScreen.dashTeamsCount', '{{count}} teams', { count: counts.teams }),
    t('startScreen.dashPersonnelCount', '{{count}} staff', { count: counts.personnel }),
  ];
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 px-1 py-1 text-[13px] font-medium text-ink-2">
      {parts.map((p, i) => (
        <React.Fragment key={p}>
          {i > 0 && <span className="text-ink-3" aria-hidden="true">·</span>}
          <span className="tabular-nums">{p}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Kilpailut tab: the current club-season card - the club season and how many
 *  Kaudet / Turnaukset exist. */
export function HomeSeasonCard({ vuosi, counts, onOpen, t }: {
  vuosi: HomeSummary['vuosi'];
  counts: HomeSummary['counts'];
  onOpen?: () => void;
  t: TFunction;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${HOME_CARD} flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.03] ${HOME_FOCUS}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-[0.16em] text-ink-3">
          {t('startScreen.dashClubSeason', 'This season')}
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-3">
          <span className="font-display text-[30px] font-bold leading-none text-ink">
            {vuosi ? vuosi.label : t('startScreen.tabSeasons', 'Competitions')}
          </span>
          {vuosi && (
            <span className="whitespace-nowrap font-display text-[34px] font-extrabold italic leading-none tabular-nums">
              <span className="text-win">{vuosi.wins}</span>
              <span className="text-ink-3">-{vuosi.ties}-</span>
              <span className="text-loss">{vuosi.losses}</span>
            </span>
          )}
        </span>
        <span className="mt-2 block text-[13px] text-ink-3 tabular-nums">
          {t('startScreen.dashSeasonsCount', '{{count}} leagues', { count: counts.seasons })}
          {' · '}
          {t('startScreen.dashTournamentsCount', '{{count}} tournaments', { count: counts.tournaments })}
        </span>
      </span>
      <HomeIcon name="chev" className="h-4 w-4 text-ink-3" strokeWidth={2} />
    </button>
  );
}

/** Tilastot tab: a three-tile overview of the current club season. */
export function HomeStatsTiles({ vuosi, topScorer, t }: {
  vuosi: HomeSummary['vuosi'];
  topScorer: HomeSummary['topScorer'];
  t: TFunction;
}) {
  if (!vuosi) return null;
  // NUMBERS LEAD (owner, 2026-09-16): these three figures are the whole reason
  // the Tilastot tab exists, so the number is the display element and the
  // label drops to a caption. Not pressable, so no hover.
  const tile = (n: React.ReactNode, label: string) => (
    <div className={`${HOME_CARD} min-w-0 flex-1 px-1.5 py-4 text-center`}>
      <div className="font-display text-[40px] font-extrabold italic leading-none text-ink tabular-nums">{n}</div>
      <div className="mt-2 break-words text-xs font-semibold uppercase leading-tight tracking-[0.04em] text-ink-3">
        {label}
      </div>
    </div>
  );
  return (
    <div className="flex gap-2.5">
      {tile(
        <span><span className="text-win">{vuosi.wins}</span>-{vuosi.ties}-<span className="text-loss">{vuosi.losses}</span></span>,
        t('startScreen.dashTileResults', 'Results'),
      )}
      {tile(
        `${vuosi.goalDifference >= 0 ? '+' : ''}${vuosi.goalDifference}`,
        t('startScreen.dashTileGoalDiff', 'Goal diff'),
      )}
      {/* Goals big, name as the label - a name set as the big number overflowed a third-width tile. */}
      {tile(
        topScorer ? topScorer.goals : '–',
        topScorer ? topScorer.name : t('startScreen.dashTileScorer', 'Top scorer'),
      )}
    </div>
  );
}

export default HomeDashboard;
