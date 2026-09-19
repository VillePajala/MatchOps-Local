'use client';

import React, { useState } from 'react';
import { MdDirectionsCar } from 'react-icons/md';
import type { TFunction } from 'i18next';
import type { HomeSummary, HomeResumeGame, HomeRecentGame, HomeUpcomingGame } from '@/utils/homeSummary';
import { formatDriveTime } from '@/utils/travelPlan';

/**
 * The Home card surface: recent games, the Pelaajat and Joukkueet tiles, the
 * stats tiles. One literal string rather than four copies, because a gradient
 * spelled out in four files drifts the moment one of them is touched. Written
 * out whole, not composed, since Tailwind scans for complete class names.
 *
 * QUIET, AND IT FADES. These are repeated cards - the ramp runs across each
 * one separately, so whatever it does it does two or three times in a row.
 * The resume card's gradient at that repetition was far too loud.
 *
 * Colour at the left, fading into the page's own slate at the right - the
 * direction the resume card already runs, so every card on Home is lit from
 * the same side. The season card was the last holdout, on a gradient that
 * differed from this one only in the slate end's alpha; it is on this surface
 * now, so Home has exactly one card surface and one hero.
 *
 * WHY 45 AND NOT LOWER. Composited over the slate-900 page, the left end sits
 * at rgb(30,33,81) against a rgb(15,23,42) background and the right end at
 * rgb(27,37,56), so the ramp itself is a blue shift of about 25 levels and
 * almost nothing in red and green. At /70 that shift was 47 and the row read
 * as stripes; below about /35 the card stops separating from the page at all,
 * which is the mistake a flat indigo-950/45 already made here once.
 */
export const HOME_CARD =
  'bg-gradient-to-r from-indigo-900/45 to-slate-800/80 border-indigo-800/35 shadow-md hover:from-indigo-800/50 hover:to-slate-800';

/** Result shown through the score colour only (no coloured card edge). */
const scoreColour: Record<'W' | 'D' | 'L', string> = {
  W: 'text-green-300',
  D: 'text-slate-200',
  L: 'text-red-300',
};

const fmtElapsed = (s: number): string => `${Math.floor(s / 60)}:${String(Math.abs(s % 60)).padStart(2, '0')}`;

/**
 * The match in progress, and - when it has a pinned venue - a way to drive to it.
 *
 * THE DIRECTIONS BUTTON IS A SIBLING, not a child. This card is a <button>, and
 * a link inside a button is invalid HTML that browsers resolve unpredictably.
 * So the card became a row: the resume action keeps the whole surface it had,
 * and the directions link is its own tap target beside it.
 *
 * It appears ONLY when the match has a location. An empty seat here would be a
 * dead control on the busiest surface in the app, and the point of putting it
 * on the front page is that a coach can press it on the way out of the door
 * rather than digging three screens down for it.
 */
/**
 * The top slot when there is neither a fixture nor a match to resume.
 *
 * THE SLOT IS NEVER EMPTY, which the owner asked for twice. The rule used to
 * be "a fixture, or failing that the last match you had open" - and both of
 * those can be gone at once: delete the only booked fixture while the match
 * you last opened was that same one, and the card simply vanished, leaving
 * Home opening on a gap where its most prominent element had been.
 *
 * ONLY WHEN THERE IS GENUINELY NOTHING. A fixture, the match you have open,
 * or failing both the latest one played will all take this slot first - so
 * reaching this card means the coach has no matches at all, and the only
 * useful thing to offer is the first one.
 */
function NoMatchCard({ onNewGame, t }: { onNewGame?: () => void; t: TFunction }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/70 px-3.5 py-3.5 text-white shadow-md">
      <div className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
        {t('startScreen.dashNextMatch', 'Next match')}
      </div>
      <p className="text-sm text-slate-300">
        {t('startScreen.dashNoMatchesYet', 'No matches yet.')}
      </p>
      <button
        type="button"
        onClick={onNewGame}
        className="mt-2.5 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-500"
      >
        {t('startScreen.newGameButton', 'New Game')}
      </button>
    </div>
  );
}

function ResumeCard({ resume, onResume, t }: { resume: HomeResumeGame; onResume?: () => void; t: TFunction }) {
  return (
    <div className="flex items-stretch rounded-xl bg-gradient-to-r from-indigo-700 via-indigo-900/85 to-slate-800/80 border border-indigo-500/60 text-white shadow-md overflow-hidden">
    <button
      type="button"
      onClick={onResume}
      className="flex-1 min-w-0 text-left px-3.5 py-2.5 hover:bg-indigo-900/40 transition-all"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-extrabold truncate">{resume.opponent || t('startScreen.dashResumeGame', 'Game')}</span>
        <span className="text-xl font-black tabular-nums leading-none">{resume.ourScore}–{resume.theirScore}</span>
      </div>
      <div className="flex items-center justify-between mt-1 text-xs font-bold">
        <span className="text-slate-300">
          {resume.isPlayed
            ? t(resume.homeOrAway === 'home' ? 'startScreen.dashHome' : 'startScreen.dashAway', resume.homeOrAway === 'home' ? 'Home' : 'Away')
            : [
                t('startScreen.dashInProgress', 'In progress'),
                resume.currentPeriod ? `${resume.currentPeriod}.` : null,
                typeof resume.timeElapsedSeconds === 'number' ? fmtElapsed(resume.timeElapsedSeconds) : null,
              ].filter(Boolean).join(' · ')}
        </span>
        {/* The one amber thing on this card, and the only thing to press.
            Amber used to coat the whole card, which put it in direct
            competition with the amber wordmark directly above it - two large
            amber blocks, neither reading as the action. The card is still the
            most prominent surface on the tab through its gradient and border;
            amber now means "press this" and nothing else. */}
        <span className="bg-amber-500 text-slate-900 rounded-full px-3 py-1 font-extrabold">{t('startScreen.resumeCard', 'Continue')} →</span>
      </div>
    </button>
    {resume.mapsUrl ? (
      <a
        href={resume.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('startScreen.driveToVenue', 'Directions to the venue')}
        title={t('startScreen.driveToVenue', 'Directions to the venue')}
        className="flex items-center justify-center px-4 border-l border-indigo-500/40 text-indigo-100 hover:bg-indigo-900/60 transition-colors"
      >
        <MdDirectionsCar className="w-6 h-6" aria-hidden="true" />
      </a>
    ) : null}
    </div>
  );
}

/**
 * The fixture ahead of you, and a way to drive to it.
 *
 * TAKES THE TOP SLOT FROM THE RESUME CARD, because it is the one with a
 * deadline: on a Wednesday the match you are thinking about is Saturday's, not
 * the one you finished last weekend. The resume card is not deleted - it takes
 * the slot back on any day no fixture is booked.
 *
 * The countdown leads because it is what a coach scans for. "3 pv" answers the
 * question faster than a date does, and turns into "Huomenna" and "Tänään" as
 * it closes.
 */
function NextMatchCard({
  game,
  onOpen,
  onAdjustTravel,
  t,
}: {
  game: HomeUpcomingGame;
  onOpen?: (id: string) => void;
  /** Sets this match's own arrival buffer and the drive time actually taken. */
  onAdjustTravel?: (id: string, next: { arrivalBufferMinutes?: number; travelMinutes?: number }) => void;
  t: TFunction;
}) {
  const [adjusting, setAdjusting] = useState(false);
  // "132 min" has to be divided in the head before it means anything, and the
  // head is busy. The hour word is localised; the arithmetic is not.
  const driveTime = game.travel
    ? formatDriveTime(game.travel.travelMinutes, t('common.hourShort', 'h'))
    : '';
  const countdown =
    game.daysAway === 0
      ? t('startScreen.dashToday', 'Today')
      : game.daysAway === 1
        ? t('startScreen.dashTomorrow', 'Tomorrow')
        : t('startScreen.dashInDays', '{{count}} d', { count: game.daysAway });
  // Only the first comma-separated part of the venue. Newly picked locations
  // already store just "venue, town", but games saved before that kept the
  // whole disambiguation string - and a card that truncates mid-word tells the
  // coach less than a short name does. The town is not worth the ellipsis on
  // your own fixture.
  const venueName = game.venue?.split(',')[0]?.trim();
  const where = [venueName, game.venueTown, game.fieldNumber].filter(Boolean).join(' · ');

  return (
    // The wrapper positions; the card inside it clips. They cannot be the same
    // element: rounded corners need overflow-hidden, and an overflowing panel
    // is exactly what the adjustment sheet is.
    <div className="relative">
    <div className="flex flex-col rounded-xl bg-gradient-to-r from-indigo-700 via-indigo-900/85 to-slate-800/80 border border-indigo-500/60 text-white shadow-md overflow-hidden">
      <div className="flex items-stretch">
      <button
        type="button"
        onClick={() => onOpen?.(game.id)}
        className="flex-1 min-w-0 text-left px-3.5 py-2.5 hover:bg-indigo-900/40 transition-all"
      >
        <div className="text-[10px] font-extrabold tracking-[0.14em] uppercase text-indigo-200 mb-0.5">
          {t('startScreen.dashNextMatch', 'Next match')} · {countdown}
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base font-extrabold truncate">
            {game.opponent || t('startScreen.dashResumeGame', 'Game')}
          </span>
          {game.time && <span className="text-[15px] font-bold leading-none">{game.time}</span>}
        </div>
        {where && <div className="text-[11.5px] text-indigo-200 truncate mt-0.5">{where}</div>}
        {/* WHEN TO LEAVE, which is the question a fixture actually raises. It is
            kick-off minus the time you must already BE there minus the drive -
            never kick-off minus the drive, which reads as helpful and is late.
            Marked as an arvio until the coach has driven it once, because a
            straight-line guess about roads it has never seen is not a promise. */}
      </button>
      {/* Only ever shown for a PINNED venue - see mapsDirectionsUrl. */}
      {game.mapsUrl ? (
        <a
          href={game.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('startScreen.driveToVenue', 'Directions to the venue')}
          title={t('startScreen.driveToVenue', 'Directions to the venue')}
          className="flex items-center justify-center px-4 border-l border-indigo-500/40 text-indigo-100 hover:bg-indigo-900/60 transition-colors"
        >
          <MdDirectionsCar className="w-6 h-6" aria-hidden="true" />
        </a>
      ) : null}
      </div>

      {/* WHEN TO LEAVE, and the two numbers behind it, in one place. It is
          kick-off minus the time you must already BE there minus the drive -
          never kick-off minus the drive, which reads as helpful and is late.
          Tapping opens both adjustments here rather than adding fields to a
          match form the owner already finds long, and it is the same tap that
          turns the estimate into a measured time. */}
      {game.travel && (
        <div className="border-t border-indigo-500/40 bg-indigo-950/30">
          <button
            type="button"
            onClick={() => setAdjusting((v) => !v)}
            aria-expanded={adjusting}
            className="flex w-full items-baseline gap-1.5 px-3.5 py-2 text-left text-[11.5px] transition-colors hover:bg-indigo-900/40"
          >
            <span className="font-semibold text-amber-200">
              {t('startScreen.departAt', 'Leave {{time}}', { time: game.travel.departure })}
            </span>
            {/* Just the drive. The parentheses and the word "arvio" were
                honest and were also most of the line, and a number the coach
                can already see is derived does not need announcing twice. The
                tilde keeps the hedge at one character. */}
            <span className="font-normal text-indigo-300">
              · {game.travel.isEstimate ? `~${driveTime}` : driveTime}
            </span>
            <span className="ml-auto shrink-0 text-indigo-300">{adjusting ? '▾' : '▸'}</span>
          </button>

        </div>
      )}
    </div>

          {/* OVER the content below, not shoved into it. Expanding in the flow
          pushed the season bar, the results strip and every button down the
          page - the coach adjusts one number and the whole screen moves
          under their thumb. Absolute, so only this panel moves. */}
      {adjusting && game.travel && (
        <div className="absolute left-0 right-0 top-full z-30 space-y-2.5 rounded-b-xl border-x border-b border-indigo-500/60 bg-indigo-950 px-3.5 pb-3 pt-2 shadow-xl">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-300">
              {t('startScreen.arriveBefore', 'At the ground before kick-off')}
            </div>
            <div className="flex gap-1.5">
              {[30, 45, 60].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => onAdjustTravel?.(game.id, { arrivalBufferMinutes: minutes })}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    game.travel?.arrivalBufferMinutes === minutes
                      ? 'bg-amber-500 text-slate-900'
                      : 'bg-indigo-900/70 text-indigo-100 hover:bg-indigo-800'
                  }`}
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-300">
              {t('startScreen.actualDrive', 'How long the drive really takes')}
            </div>
            {/* A measured time replaces a straight-line guess that knows
                nothing about the lake you drive around - and, looked up by
                venue, answers for every later match at the same place. */}
            <input
              type="number"
              min={0}
              max={600}
              inputMode="numeric"
              defaultValue={game.travel.travelMinutes}
              onBlur={(e) => {
                // An EMPTIED field is not a zero-minute drive. Number('')
                // is 0, which passed a >= 0 check and would have recorded
                // "this venue takes no time to reach" for every later match
                // there - a measured value is exactly the thing that
                // overrides the estimate, so a blank must change nothing.
                const raw = e.target.value.trim();
                if (!raw) return;
                const minutes = Number(raw);
                if (Number.isFinite(minutes) && minutes > 0) {
                  onAdjustTravel?.(game.id, { travelMinutes: Math.round(minutes) });
                }
              }}
              aria-label={t('startScreen.actualDrive', 'How long the drive really takes')}
              className="w-24 rounded-md border border-indigo-500/50 bg-indigo-950/60 px-2 py-1 text-sm text-white"
            />
            <span className="ml-1.5 text-xs text-indigo-300">min</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** One fixture in the Tulevat strip: when it is, not how it went. */
function UpcomingCard({ game, onOpen, t }: { game: HomeUpcomingGame; onOpen?: (id: string) => void; t: TFunction }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(game.id)}
      className="flex-shrink-0 w-[108px] text-left px-2.5 py-2 rounded-xl border transition-all bg-gradient-to-r from-indigo-900/45 to-slate-800/80 border-indigo-800/35 hover:from-indigo-800/50 hover:to-slate-800"
    >
      <span className="block text-[11px] font-semibold text-white truncate">
        {game.opponent || t('startScreen.dashResumeGame', 'Game')}
      </span>
      <span className="block text-xs font-bold text-indigo-200">{game.time || '–'}</span>
      <span className="block text-[9.5px] text-slate-500">{game.date.slice(5).replace('-', '.')}.</span>
    </button>
  );
}

function VuosiBar({ vuosi, onOpen, t }: { vuosi: NonNullable<HomeSummary['vuosi']>; onOpen?: () => void; t: TFunction }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 hover:bg-slate-700/70 transition-all text-[13px]"
    >
      <span className="font-extrabold text-indigo-200 whitespace-nowrap">{t('startScreen.dashSeason', 'Season')} {vuosi.label}</span>
      <span className="text-slate-600" aria-hidden="true">·</span>
      <span className="text-slate-300 tabular-nums">{vuosi.gamesPlayed} {t('startScreen.dashGames', 'games')}</span>
      <span className="text-slate-600" aria-hidden="true">·</span>
      {/* Green-grey-red is the football convention for W-D-L, so the colours
          label these without spending width on words. */}
      <span
        className="tabular-nums whitespace-nowrap"
        title={t('startScreen.dashRecordTitle', 'Wins - draws - losses')}
      >
        <span className="text-green-400 font-bold">{vuosi.wins}</span>
        <span className="text-slate-500">-{vuosi.ties}-</span>
        <span className="text-red-400 font-bold">{vuosi.losses}</span>
      </span>
      <span className="text-slate-600" aria-hidden="true">·</span>
      {/* Goal DIFFERENCE, not "117–154". The pair was two unlabelled numbers a
          reader had to interpret; the difference is one number that says the
          same thing, and its sign carries the meaning on its own. */}
      <span
        className={`tabular-nums font-bold ${
          vuosi.goalDifference > 0
            ? 'text-green-400'
            : vuosi.goalDifference < 0
              ? 'text-red-400'
              : 'text-slate-300'
        }`}
        title={t('startScreen.dashGoalDiffTitle', 'Goal difference')}
      >
        {vuosi.goalDifference >= 0 ? '+' : ''}{vuosi.goalDifference}
      </span>
      <span className="ml-auto text-slate-500" aria-hidden="true">›</span>
    </button>
  );
}

/**
 * `accented` marks the match the coach last had open - wayfinding, not status.
 *
 * Suppressed by the caller when the card ABOVE is already showing that same
 * match: the accent's whole job is "your last match is down here", and there is
 * nothing to point at when it is the first thing on the screen. Leaving it on
 * would be the app saying one sentence twice in a single glance.
 */
function RecentCard({ game, onOpen, accented }: { game: HomeRecentGame; onOpen?: (id: string) => void; accented?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(game.id)}
      className={`flex-shrink-0 w-[108px] text-left px-2.5 py-2 rounded-xl border transition-all ${
        accented
          ? 'bg-gradient-to-r from-amber-900/40 to-slate-800/85 border-amber-500/70 shadow-[0_0_16px_rgba(245,158,11,0.14)]'
          : HOME_CARD
      }`}
    >
      <div className="text-xs font-semibold text-slate-100 truncate">{game.opponent || '—'}</div>
      <div className={`text-sm font-black tabular-nums ${scoreColour[game.result]}`}>{game.ourScore}–{game.theirScore}</div>
      <div className="text-xs text-slate-400 tabular-nums">{game.date?.slice(5).replace('-', '.')}</div>
    </button>
  );
}

/**
 * The opt-in Pelit-tab dashboard: an informative resume card, the current
 * club-season (Vuosi) record, and a swipeable recent-games strip. Purely
 * presentational - all data is precomputed in `buildHomeSummary`.
 */
export function HomeDashboard({
  summary,
  onResume,
  onOpenVuosi,
  onOpenGame,
  onAdjustTravel,
  onNewGame,
  t,
}: {
  summary: HomeSummary;
  onResume?: () => void;
  onOpenVuosi?: () => void;
  onOpenGame?: (id: string) => void;
  onAdjustTravel?: (id: string, next: { arrivalBufferMinutes?: number; travelMinutes?: number }) => void;
  /** Opens the new-game flow from the empty top card. */
  onNewGame?: () => void;
  t: TFunction;
}) {
  /**
   * Which strip the coach is looking at.
   *
   * ONLY THE COACH'S EXPLICIT CHOICE IS STORED - null until they tap the
   * toggle. The default is derived from what exists right now, so booking the
   * season's first fixture without leaving Home switches the strip to it.
   * Storing the resolved default instead froze it at mount: a coach who opened
   * Home with no fixtures stayed on Tulukset even after creating one.
   *
   * Fixtures win the default when any exist, because a coach who has booked
   * matches is usually asking "what is next" rather than "how did we do". The
   * toggle only renders when BOTH exist - one kind of match is not a choice.
   */
  const [chosenStrip, setStrip] = useState<'upcoming' | 'recent' | null>(null);

  const hasBoth = summary.upcomingList.length > 0 && summary.recent.length > 0;
  const showing = summary.upcomingList.length === 0 ? 'recent'
    : summary.recent.length === 0 ? 'upcoming'
      : chosenStrip ?? 'upcoming';

  // The accent has a job only while the top card is showing something ELSE.
  // With the resume card up there, the match it would point at is already the
  // first thing on the screen.
  const accentId = summary.upcoming ? summary.resume?.id : undefined;

  return (
    <>
      {/* Always something here - see NoMatchCard for why the slot must not
          be allowed to empty. */}
      {summary.upcoming
        ? <NextMatchCard game={summary.upcoming} onOpen={onOpenGame} onAdjustTravel={onAdjustTravel} t={t} />
        : summary.resume
          ? <ResumeCard resume={summary.resume} onResume={onResume} t={t} />
          // Nothing booked and nothing open: the latest match played, with the
          // same Jatka action. A card that opens a real match beats a prompt
          // that opens nothing - and after deleting the fixture you had open,
          // the match before it is what a coach reaches for next.
          : summary.lastPlayed
            ? <ResumeCard resume={summary.lastPlayed} onResume={() => onOpenGame?.(summary.lastPlayed!.id)} t={t} />
            : <NoMatchCard onNewGame={onNewGame} t={t} />}
      {summary.vuosi && <VuosiBar vuosi={summary.vuosi} onOpen={onOpenVuosi} t={t} />}
      {(summary.recent.length > 0 || summary.upcomingList.length > 0) && (
        /* Label and strip are one block: the heading's margin is spacing
           INSIDE it, not a gap between blocks, so the Home stack's own gap is
           still the only thing separating this from what follows. */
        <div>
          {/* THE TOGGLE IS THE LABEL, not a control above it. As a segmented
              pill it stood ~10px taller than the heading it replaced and
              pushed every row below it down the screen - on a tab the owner
              had already said was full. Two words at the heading's own size
              cost nothing, so the capability stops having to justify itself. */}
          <div className="flex items-center gap-2 px-1 mb-1.5 text-xs font-semibold">
            {hasBoth ? (
              <div className="flex items-center gap-2" role="tablist">
                {(['upcoming', 'recent'] as const).map((which, i) => (
                  <React.Fragment key={which}>
                    {i > 0 && <span className="text-slate-600" aria-hidden="true">·</span>}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={showing === which}
                      onClick={() => setStrip(which)}
                      className={`transition-colors ${
                        showing === which ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
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
              <div className="text-slate-400">
                {showing === 'upcoming'
                  ? t('startScreen.dashUpcoming', 'Upcoming')
                  : t('startScreen.dashRecent', 'Recent')}
              </div>
            )}
          </div>
          {/* The strip scrolls, and the card at the edge used to be cut clean
              through its own border - which reads as a rendering fault, not as
              an invitation to scroll. The gradient lets it dissolve instead.
              pointer-events-none so it never eats a tap on the card beneath. */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 -mx-0.5 px-0.5" style={{ scrollbarWidth: 'none' }}>
              {showing === 'upcoming'
                ? summary.upcomingList.map((game) => (
                    <UpcomingCard key={game.id} game={game} onOpen={onOpenGame} t={t} />
                  ))
                : summary.recent.map((game) => (
                    <RecentCard
                      key={game.id}
                      game={game}
                      onOpen={onOpenGame}
                      accented={!!accentId && game.id === accentId}
                    />
                  ))}
            </div>
            {(showing === 'upcoming' ? summary.upcomingList.length : summary.recent.length) > 2 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 right-0 h-full w-10 bg-gradient-to-l from-slate-900 to-transparent"
              />
            )}
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
 * one team should not be asked a question with one answer. Hidden entirely
 * rather than shown disabled, because a control that cannot change anything is
 * noise on the busiest screen in the app.
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
  // One row whatever the roster of teams looks like. Pills wrapped into a
  // wall once real data (six same-named teams with context) hit them.
  return (
    <label
      className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 text-[13px] focus-within:ring-2 focus-within:ring-indigo-500"
      data-testid="home-team-scope"
    >
      <span className="font-extrabold text-indigo-200 whitespace-nowrap">{t('startScreen.dashTeamLabel', 'Team')}</span>
      <span className="text-slate-600" aria-hidden="true">·</span>
      <select
        value={scope}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('startScreen.dashTeamScope', 'Which team these numbers are about')}
        className="flex-1 min-w-0 bg-transparent text-slate-200 truncate focus:outline-none"
      >
        <option value="all">{t('startScreen.dashAllTeams', 'All teams')}</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>{team.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Joukkue tab: a one-line roster/team/personnel count header. */
export function HomeCountsBar({ counts, t }: { counts: HomeSummary['counts']; t: TFunction }) {
  // Pluralised: the previous form concatenated a number with a fixed plural
  // noun, so Finnish read "1 joukkuetta" - the partitive is only correct above
  // one. i18next handles both languages from one key.
  const parts = [
    t('startScreen.dashPlayersCount', '{{count}} players', { count: counts.players }),
    t('startScreen.dashTeamsCount', '{{count}} teams', { count: counts.teams }),
    t('startScreen.dashPersonnelCount', '{{count}} staff', { count: counts.personnel }),
  ];
  return (
    <div className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-[13px] text-slate-300">
      {parts.map((p, i) => (
        <React.Fragment key={p}>
          {i > 0 && <span className="text-slate-600" aria-hidden="true">·</span>}
          <span className="tabular-nums">{p}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Kilpailut tab: the current club-season context card (no single "active"
 *  season - shows the club season + how many Kaudet/Turnaukset exist). */
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
      className={`w-full text-left p-3.5 rounded-xl border transition-all ${HOME_CARD}`}
    >
      <div className="text-xs font-semibold text-indigo-300/80">
        {t('startScreen.dashClubSeason', 'This season')}
      </div>
      <div className="flex items-baseline justify-between gap-3 mt-0.5">
        <span className="text-base font-extrabold text-white">
          {vuosi ? vuosi.label : t('seasonTournamentModal.title', 'Competitions')}
        </span>
        {/* Was text-sm - SMALLER than the "This season" label beside it, which
            is backwards whatever else one thinks about numerals. */}
        {vuosi && (
          <span className="text-xl font-black tabular-nums whitespace-nowrap leading-none">
            <span className="text-green-400">{vuosi.wins}</span>
            <span className="text-slate-400">-{vuosi.ties}-</span>
            <span className="text-red-400">{vuosi.losses}</span>
          </span>
        )}
      </div>
      <div className="text-xs text-indigo-200/70 mt-1 tabular-nums">
        {t('startScreen.dashSeasonsCount', '{{count}} leagues', { count: counts.seasons })}
        {' · '}
        {t('startScreen.dashTournamentsCount', '{{count}} tournaments', { count: counts.tournaments })}
      </div>
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
  // These tiles exist to be READ AT A GLANCE, and they were set at text-lg -
  // smaller than the row labels underneath them, which inverted the emphasis
  // on the one tab whose whole job is numbers.
  // The shared Home card surface. The W-D-L and goal-difference greens and
  // reds are semantic and stay as they are; they still carry on this ground.
  // Not pressable, so no hover - the constant's hover classes are inert on a div.
  //
  // NUMBERS LEAD (owner, 2026-09-16). The figure was text-2xl over a text-xs
  // label - barely a 2:1 ratio, so the tile read as a sentence rather than as
  // a statistic. These three figures are the whole reason the Tilastot tab
  // exists, so the number becomes the display element and the label drops to a
  // caption. Rajdhani is a condensed face drawn for sport; this is the one
  // place on Home that is purely numbers, and it was being set like body text.
  const tile = (n: React.ReactNode, label: string) => (
    <div className={`flex-1 text-center px-2 py-3 rounded-xl border ${HOME_CARD}`}>
      <div className="text-4xl font-black text-white tabular-nums leading-none tracking-tight">{n}</div>
      <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-indigo-200/70 mt-2 truncate">
        {label}
      </div>
    </div>
  );
  return (
    <div className="flex gap-2">
      {tile(
        <span><span className="text-green-400">{vuosi.wins}</span>-{vuosi.ties}-<span className="text-red-400">{vuosi.losses}</span></span>,
        t('startScreen.dashTileResults', 'Results'),
      )}
      {tile(
        `${vuosi.goalDifference >= 0 ? '+' : ''}${vuosi.goalDifference}`,
        t('startScreen.dashTileGoalDiff', 'Goal diff'),
      )}
      {/* Goals big, name as the label. The name used to BE the number, set in
          text-lg font-black, so anything longer than "Esko" overflowed a
          third-width tile - and it broke the row's own rule that the big
          figure is the figure and the small line names it. */}
      {tile(
        topScorer ? topScorer.goals : '–',
        topScorer ? topScorer.name : t('startScreen.dashTileScorer', 'Top scorer'),
      )}
    </div>
  );
}

export default HomeDashboard;
