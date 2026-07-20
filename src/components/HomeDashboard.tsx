'use client';

import React from 'react';
import type { TFunction } from 'i18next';
import type { HomeSummary, HomeResumeGame, HomeRecentGame } from '@/utils/homeSummary';

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
      className="w-full text-left px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition-all"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-extrabold truncate">{resume.opponent || t('startScreen.dashResumeGame', 'Game')}</span>
        <span className="text-xl font-black tabular-nums leading-none">{resume.ourScore}–{resume.theirScore}</span>
      </div>
      <div className="flex items-center justify-between mt-1 text-xs font-bold">
        <span className="opacity-80">
          {resume.isPlayed
            ? t(resume.homeOrAway === 'home' ? 'startScreen.dashHome' : 'startScreen.dashAway', resume.homeOrAway === 'home' ? 'Home' : 'Away')
            : [
                t('startScreen.dashInProgress', 'In progress'),
                resume.currentPeriod ? `${resume.currentPeriod}.` : null,
                typeof resume.timeElapsedSeconds === 'number' ? fmtElapsed(resume.timeElapsedSeconds) : null,
              ].filter(Boolean).join(' · ')}
        </span>
        <span className="bg-slate-900 text-amber-200 rounded-full px-3 py-0.5">{t('startScreen.resumeCard', 'Continue')} →</span>
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
      <span className="tabular-nums whitespace-nowrap">
        <span className="text-green-400 font-bold">{vuosi.wins}</span>
        <span className="text-slate-500">-{vuosi.ties}-</span>
        <span className="text-red-400 font-bold">{vuosi.losses}</span>
      </span>
      <span className="text-slate-600" aria-hidden="true">·</span>
      <span className="text-slate-300 tabular-nums">{vuosi.goalsFor}–{vuosi.goalsAgainst}</span>
      <span className="ml-auto text-slate-500" aria-hidden="true">›</span>
    </button>
  );
}

function RecentCard({ game, onOpen }: { game: HomeRecentGame; onOpen?: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(game.id)}
      className="flex-shrink-0 w-[108px] text-left px-2.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/60 hover:bg-slate-700/70 transition-all"
    >
      <div className="text-xs font-semibold text-slate-100 truncate">{game.opponent || '—'}</div>
      <div className={`text-sm font-black tabular-nums ${scoreColour[game.result]}`}>{game.ourScore}–{game.theirScore}</div>
      <div className="text-[10px] text-slate-500 tabular-nums">{game.date?.slice(5).replace('-', '.')}</div>
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
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 px-0.5">
            {t('startScreen.dashRecent', 'Recent')}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5" style={{ scrollbarWidth: 'none' }}>
            {summary.recent.map((game) => (
              <RecentCard key={game.id} game={game} onOpen={onOpenGame} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Joukkue tab: a one-line roster/team/personnel count header. */
export function HomeCountsBar({ counts, t }: { counts: HomeSummary['counts']; t: TFunction }) {
  const parts = [
    `${counts.players} ${t('startScreen.dashPlayers', 'players')}`,
    `${counts.teams} ${t('startScreen.dashTeams', 'teams')}`,
    `${counts.personnel} ${t('startScreen.dashPersonnel', 'staff')}`,
  ];
  return (
    <div className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-[13px] text-slate-300 mb-4">
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
      className="w-full text-left p-3.5 rounded-xl bg-gradient-to-r from-indigo-900/70 to-slate-800/70 border border-indigo-700/40 hover:from-indigo-900/90 hover:to-slate-800/90 transition-all mb-4"
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300/80">
        {t('startScreen.dashClubSeason', 'This season')}
      </div>
      <div className="flex items-baseline justify-between gap-3 mt-0.5">
        <span className="text-base font-extrabold text-white">
          {vuosi ? `${t('startScreen.dashSeason', 'Season')} ${vuosi.label}` : t('seasonTournamentModal.title', 'Competitions')}
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
        {counts.seasons} {t('startScreen.dashSeasons', 'seasons')} · {counts.tournaments} {t('startScreen.dashTournaments', 'tournaments')}
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
  const tile = (n: React.ReactNode, label: string) => (
    <div className="flex-1 text-center p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
      <div className="text-lg font-black text-slate-100 tabular-nums leading-tight">{n}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">{label}</div>
    </div>
  );
  return (
    <div className="flex gap-2 mb-4">
      {tile(
        <span><span className="text-green-400">{vuosi.wins}</span>-{vuosi.ties}-<span className="text-red-400">{vuosi.losses}</span></span>,
        t('startScreen.dashTileResults', 'Results'),
      )}
      {tile(
        `${vuosi.goalDifference >= 0 ? '+' : ''}${vuosi.goalDifference}`,
        t('startScreen.dashTileGoalDiff', 'Goal diff'),
      )}
      {tile(
        topScorer ? <span className="text-sm">{topScorer.name} {topScorer.goals}⚽</span> : '–',
        t('startScreen.dashTileScorer', 'Top scorer'),
      )}
    </div>
  );
}

export default HomeDashboard;
