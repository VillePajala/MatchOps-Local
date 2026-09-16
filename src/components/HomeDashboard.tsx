'use client';

import React from 'react';
import type { TFunction } from 'i18next';
import type { HomeSummary, HomeResumeGame, HomeRecentGame } from '@/utils/homeSummary';

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

function ResumeCard({ resume, onResume, t }: { resume: HomeResumeGame; onResume?: () => void; t: TFunction }) {
  return (
    <button
      type="button"
      onClick={onResume}
      className="w-full text-left px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-700 via-indigo-900/85 to-slate-800/80 border border-indigo-500/60 text-white shadow-md hover:from-indigo-900 hover:to-slate-800 transition-all"
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

function RecentCard({ game, onOpen }: { game: HomeRecentGame; onOpen?: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(game.id)}
      className={`flex-shrink-0 w-[108px] text-left px-2.5 py-2 rounded-xl border transition-all ${HOME_CARD}`}
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
  t,
}: {
  summary: HomeSummary;
  onResume?: () => void;
  onOpenVuosi?: () => void;
  onOpenGame?: (id: string) => void;
  t: TFunction;
}) {
  return (
    <>
      {summary.resume && <ResumeCard resume={summary.resume} onResume={onResume} t={t} />}
      {summary.vuosi && <VuosiBar vuosi={summary.vuosi} onOpen={onOpenVuosi} t={t} />}
      {summary.recent.length > 0 && (
        /* Label and strip are one block: the heading's margin is spacing
           INSIDE it, not a gap between blocks, so the Home stack's own gap is
           still the only thing separating this from what follows. */
        <div>
          <div className="text-xs font-semibold text-slate-400 px-1 mb-1.5">
            {t('startScreen.dashRecent', 'Recent')}
          </div>
          {/* The strip scrolls, and the card at the edge used to be cut clean
              through its own border - which reads as a rendering fault, not as
              an invitation to scroll. The gradient lets it dissolve instead.
              pointer-events-none so it never eats a tap on the card beneath. */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 -mx-0.5 px-0.5" style={{ scrollbarWidth: 'none' }}>
              {summary.recent.map((game) => (
                <RecentCard key={game.id} game={game} onOpen={onOpenGame} />
              ))}
            </div>
            {summary.recent.length > 2 && (
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
        {vuosi && (
          <span className="text-sm font-bold tabular-nums whitespace-nowrap">
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
  const tile = (n: React.ReactNode, label: string) => (
    <div className={`flex-1 text-center px-2 py-3 rounded-xl border ${HOME_CARD}`}>
      <div className="text-2xl font-black text-slate-100 tabular-nums leading-none">{n}</div>
      <div className="text-xs text-indigo-200/70 mt-1.5 truncate">{label}</div>
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
