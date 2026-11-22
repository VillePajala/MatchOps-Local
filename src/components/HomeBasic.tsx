'use client';

/**
 * HomeBasic - the body of Home in the BASIC layout (Perusnäkymä, Onboarding v3
 * step 6). StartScreen keeps its top bar; this replaces the tabbed body and
 * there is no tab bar.
 *
 * Zones, top to bottom:
 *   1. the card, first match wins (review R2/R5/R12):
 *        a match under way          -> "Jatka ottelua"
 *        the next game              -> "Aloita ottelu" / "Merkitse poissaolijat"
 *        a game that never started  -> "Siirrä päivää" / "Poista"
 *        no players yet             -> "Lisää pelaajat" (then the next game)
 *        otherwise                  -> the last result and "Uusi ottelu"
 *   2. rows that appear once there is something behind them: the team (opens
 *      the player list), all games (from the first), statistics (from the
 *      first played game),
 *   3. "Kaikki toiminnot": what the full layout adds, and one switch to it.
 *
 * Copy rule: facts only - "Suunnitelma valmis · 14 pelaajaa", never a fairness
 * claim.
 */

import React, { useCallback, useState } from 'react';
import ConfirmationModal from '@/components/ConfirmationModal';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { splitPastedNames, PASTE_MAX_NAMES } from '@/utils/splitPastedNames';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { toLocalIsoDate } from '@/utils/nextGameDates';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import {
  HiOutlineUserGroup,
  HiOutlineFolderOpen,
  HiOutlineChartBar,
  HiOutlineChevronRight,
  HiOutlineXMark,
} from 'react-icons/hi2';
import type { HomeSummary } from '@/utils/homeSummary';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';
import { useToast } from '@/contexts/ToastProvider';
import { useNextGamePlan } from '@/hooks/useNextGamePlan';
import {
  BasicNextGameCard,
  BasicNoNextGameCard,
  ResumeCard,
  HOME_CARD,
  HOME_FOCUS,
} from '@/components/HomeDashboard';

/** Statistics get a row from the first played game (R13). */
const STATS_ROW_FROM_GAMES = 1;

export interface HomeBasicProps {
  summary: HomeSummary | null | undefined;
  onOpenGame: (id: string) => void;
  onResumeGame?: () => void;
  onNewGame?: () => void;
  /** "Ketkä ovat paikalla?" for a game; 'start' opens the game after it. */
  onOpenAttendance?: (gameId: string, mode: 'save' | 'start') => void;
  /** "Näytä suunnitelma" for a one-game plan: the compact plan screen. */
  onShowPlan?: (planId: string, gameId: string) => void;
  /** "Näytä suunnitelma" for a game in a multi-game plan: the full planner on that game. */
  onOpenPlannerAt?: (planId: string, planGameId: string) => void;
  /** The team row: the player list (tap a player to edit, add, remove - R4). */
  onOpenPlayers?: () => void;
  onLoadGame?: () => void;
  /** "Siirrä päivää" on a game that never started (R2). Resolves false on failure. */
  onMoveGameDate?: (gameId: string, gameDate: string) => Promise<boolean>;
  /** "Poista" on a game that never started (R2), after the confirm. Resolves false on failure. */
  onDeleteGame?: (gameId: string) => Promise<boolean>;
  /**
   * "Lisää pelaajat" with no players yet (R12): creates the named players and
   * resolves how many were created, in order (the rest stay in the field).
   */
  onAddPlayers?: (names: string[]) => Promise<number>;
  /** Today, YYYY-MM-DD (the date editor's starting value). */
  today?: string;
  onViewStats?: () => void;
  /** "Vaihda koko näkymään". */
  onSwitchToFull?: () => void;
  /** The next game's Pelitapa themes row (flagged accounts only), by game id. */
  renderNextGameTheme?: (gameId: string) => React.ReactNode;
  locale: string;
  t: TFunction;
}

const ROW =
  `group/row relative flex w-full min-h-14 items-center gap-3.5 pl-4 pr-4 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] first:rounded-t-[22px] last:rounded-b-[22px] ${HOME_FOCUS}`;

function BasicRow({ icon: Icon, label, onClick, testId }: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  label: string;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={ROW} data-testid={testId}>
      <Icon className="h-[22px] w-[22px] flex-shrink-0 text-ink-2" aria-hidden="true" />
      <span className="flex min-h-14 flex-1 items-center gap-3 border-t border-hairline group-first/row:border-transparent">
        <span className="flex-1 break-words text-base font-semibold leading-snug text-ink">{label}</span>
        <HiOutlineChevronRight className="h-4 w-4 flex-shrink-0 text-ink-3" aria-hidden="true" />
      </span>
    </button>
  );
}

/** "Kaikki toiminnot": a short list of what the full layout adds, and the switch. */
function AllFeaturesSheet({ onClose, onSwitchToFull, t }: {
  onClose: () => void;
  onSwitchToFull?: () => void;
  t: TFunction;
}) {
  useModalHardwareBack(true, onClose);
  useEscapeToClose(true, onClose);
  const items = [
    t('allFeatures.itemTabs', 'Home with tabs: games, club, competitions and statistics'),
    t('allFeatures.itemPlanner', 'Match planning for several games, such as a tournament day'),
    t('allFeatures.itemCompetitions', 'Leagues and tournaments'),
    t('allFeatures.itemClub', 'Staff, warm-up plan and rules'),
    t('allFeatures.itemTravel', 'Venues and departure times'),
    t('allFeatures.itemExternal', 'Games played elsewhere in player statistics'),
  ];
  // Portalled to the body: Home's scrolling body is its own stacking context
  // (and masked), so a fixed sheet inside it would sit under the top bar.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70"
      onClick={onClose}
      data-testid="all-features-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('allFeatures.title', 'All features')}
        data-testid="all-features-sheet"
        className="s1-sheet w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-[28px] px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))] font-ui text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-[26px] font-bold leading-tight">{t('allFeatures.title', 'All features')}</h2>
          {/* A visible way out besides the backdrop and back (R13). */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            data-testid="all-features-close"
            className={`-mr-2 -mt-1 grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink ${HOME_FOCUS}`}
          >
            <HiOutlineXMark className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1.5 text-[15px] leading-snug text-ink-2">
          {t('allFeatures.intro', 'The basic layout shows what matters on match day. The full layout adds:')}
        </p>
        <ul className="mt-3 space-y-2" data-testid="all-features-list">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] leading-snug text-ink">
              <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-action" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            onClose();
            onSwitchToFull?.();
          }}
          disabled={!onSwitchToFull}
          data-testid="switch-to-full"
          className={`s1-primary mt-5 flex h-14 w-full items-center justify-center rounded-full px-5 text-base font-bold ${HOME_FOCUS}`}
        >
          {t('allFeatures.switchToFull', 'Switch to the full layout')}
        </button>
        <p className="mt-2.5 text-center text-[13px] text-ink-3">
          {t('allFeatures.switchNote', 'Nothing is removed. You can switch back in Settings.')}
        </p>
      </div>
    </div>,
    document.body,
  );
}

/**
 * "Lisää pelaajat" - the card when there are no players yet (R12). The same
 * input as the wizard's player step: paste the list from WhatsApp or type the
 * names one per line; numbers in front ("1.", "#12") are list positions and
 * are dropped (splitPastedNames). "Jatka" creates them and goes on to the next
 * game. After a partial failure only the names not yet created stay in the box.
 */
function AddPlayersCard({ onAddPlayers, t }: {
  onAddPlayers?: (names: string[]) => Promise<number>;
  t: TFunction;
}) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const names = splitPastedNames(text, { maxNameLength: VALIDATION_LIMITS.PLAYER_NAME_MAX, maxNames: PASTE_MAX_NAMES });

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (splitPastedNames(clip).length === 0) {
        showToast(t('setupWizard.pasteEmpty', 'No names found on the clipboard.'), 'info');
        return;
      }
      setText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n${clip}` : clip));
    } catch {
      showToast(
        t('setupWizard.pasteUnavailable', 'Could not read the clipboard. Long-press the name field and choose Paste.'),
        'info',
      );
    }
  };

  const submit = async () => {
    if (!onAddPlayers || names.length === 0 || saving) return;
    setSaving(true);
    try {
      const created = await onAddPlayers(names);
      if (created < names.length) setText(names.slice(created).join('\n'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="s1-hero p-5 text-ink" data-testid="basic-add-players">
      <h2 className="font-display text-[26px] font-bold leading-tight">{t('basicHome.addPlayersTitle', 'Add players')}</h2>
      <p className="mt-1.5 text-[15px] leading-snug text-ink-2">
        {t('basicHome.addPlayersHint', 'Paste the list or type the names, one per line. First names are enough.')}
      </p>
      <button
        type="button"
        onClick={() => void pasteFromClipboard()}
        className={`s1-ghost mt-4 flex h-12 w-full items-center justify-center rounded-full px-4 text-[15px] font-semibold text-ink ${HOME_FOCUS}`}
        data-testid="basic-add-players-paste"
      >
        {t('setupWizard.pasteButton', 'Paste from clipboard')}
      </button>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={VALIDATION_LIMITS.PLAYER_NAME_MAX * PASTE_MAX_NAMES}
        aria-label={t('basicHome.addPlayersTitle', 'Add players')}
        placeholder={t('basicHome.addPlayersPlaceholder', 'Onni\nToivo\nAatos') ?? undefined}
        data-testid="basic-add-players-input"
        className="mt-3 w-full resize-none rounded-2xl bg-white/[0.06] px-4 py-3 text-base leading-snug text-ink placeholder:text-ink-3 ring-1 ring-inset ring-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
      />
      <p className="mt-1.5 text-right text-sm text-ink-3" data-testid="basic-add-players-count">
        {t('setupWizard.playersAdded', '{{count}} players added', { count: names.length })}
      </p>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!onAddPlayers || names.length === 0 || saving}
        className={`s1-primary mt-3 flex h-14 w-full items-center justify-center rounded-full px-5 text-base font-bold disabled:opacity-50 ${HOME_FOCUS}`}
        data-testid="basic-add-players-submit"
      >
        {saving ? t('setupWizard.saving', 'Saving…') : t('basicHome.addPlayersContinue', 'Continue')}
      </button>
    </div>
  );
}

const HomeBasic: React.FC<HomeBasicProps> = ({
  summary,
  onOpenGame,
  onResumeGame,
  onNewGame,
  onOpenAttendance,
  onShowPlan,
  onOpenPlannerAt,
  onOpenPlayers,
  onLoadGame,
  onMoveGameDate,
  onDeleteGame,
  onAddPlayers,
  today,
  onViewStats,
  onSwitchToFull,
  renderNextGameTheme,
  locale,
  t,
}) => {
  const [allFeaturesOpen, setAllFeaturesOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The game on the card: the next one, else one whose day passed without it
  // kicking off (R2) - which keeps its "Siirrä päivää / Poista" card.
  const upcoming = summary?.upcoming ?? summary?.overdue ?? null;
  const nextPlan = useNextGamePlan({ game: upcoming, refreshKey: summary, onShowPlan, onOpenPlannerAt, locale, t });

  // A match under way always wins the card (R5), the current game or another.
  const unfinished = summary?.unfinished ?? (summary?.resume?.inProgress ? summary.resume : null);
  // Never a match that has not begun as "Viimeisin peli 0-0" (R2).
  const last = (summary?.resume?.started ? summary.resume : null) ?? summary?.lastPlayed ?? null;
  const counts = summary?.countsReady ? summary.counts : undefined;
  const playedCount = summary?.playedCount ?? 0;
  const gameCount = summary?.gameCount ?? 0;
  const noPlayers = !!counts && counts.players === 0;

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDeleteId || !onDeleteGame || deleting) return;
    setDeleting(true);
    try {
      if (await onDeleteGame(confirmDeleteId)) setConfirmDeleteId(null);
    } finally {
      setDeleting(false);
    }
  }, [confirmDeleteId, onDeleteGame, deleting]);

  return (
    <div className="flex min-h-full flex-col gap-3.5" data-testid="home-basic">
      <button
        type="button"
        onClick={() => setAllFeaturesOpen(true)}
        data-testid="full-app-line"
        className={`-my-2 flex min-h-[44px] w-full items-center justify-center gap-1 px-2 text-[13px] text-ink-3 ${HOME_FOCUS}`}
      >
        <span className="truncate">{t('allFeatures.fullAppLine', 'Simplified view · See the full app')}</span>
        <HiOutlineChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
      {unfinished ? (
        <ResumeCard
          // Under way, so no result yet: no win/draw/loss pill on a live score.
          resume={{ ...unfinished, isPlayed: false }}
          onResume={
            // The current game resumes in place; another one under way opens by id.
            unfinished.id === summary?.resume?.id ? onResumeGame : () => onOpenGame(unfinished.id)
          }
          locale={locale}
          t={t}
        />
      ) : upcoming ? (
        <BasicNextGameCard
          game={upcoming}
          planState={nextPlan.state}
          onOpen={() => onOpenGame(upcoming.id)}
          onPrimary={() => onOpenAttendance?.(upcoming.id, upcoming.daysAway === 0 ? 'start' : 'save')}
          onShowPlan={nextPlan.showPlan}
          onShare={nextPlan.share}
          onMoveDate={onMoveGameDate ? (date) => onMoveGameDate(upcoming.id, date) : undefined}
          onDelete={onDeleteGame ? () => setConfirmDeleteId(upcoming.id) : undefined}
          themeSlot={renderNextGameTheme?.(upcoming.id)}
          today={today ?? toLocalIsoDate(new Date())}
          locale={locale}
          t={t}
        />
      ) : noPlayers ? (
        <AddPlayersCard onAddPlayers={onAddPlayers} t={t} />
      ) : (
        <BasicNoNextGameCard
          last={last}
          onOpenLast={last ? () => onOpenGame(last.id) : undefined}
          onNewGame={onNewGame}
          locale={locale}
          t={t}
        />
      )}

      <div className={`${HOME_CARD} flex flex-col`}>
        <BasicRow
          icon={HiOutlineUserGroup}
          label={
            counts && counts.players > 0
              ? t('basicHome.teamRow', 'Team · {{count}} players', { count: counts.players })
              : t('basicHome.teamRowEmpty', 'Team')
          }
          onClick={onOpenPlayers}
          testId="basic-team-row"
        />
        {/* Every game, played or not, once there is one (R5). */}
        {gameCount > 0 && (
          <BasicRow
            icon={HiOutlineFolderOpen}
            label={t('basicHome.allGamesRow', 'All games · {{count}}', { count: gameCount })}
            onClick={onLoadGame}
            testId="basic-all-games-row"
          />
        )}
        {playedCount >= STATS_ROW_FROM_GAMES && (
          <BasicRow
            icon={HiOutlineChartBar}
            label={t('basicHome.statsRow', 'Statistics · {{count}} games', { count: playedCount })}
            onClick={onViewStats}
            testId="basic-stats-row"
          />
        )}
      </div>

      {/* "Uusi ottelu" is the card's own action when nothing is booked; with a
          game booked it is here, one tap below the card. */}
      {(unfinished || upcoming) && onNewGame && (
        <button
          type="button"
          onClick={onNewGame}
          className={`s1-ghost flex h-12 w-full items-center justify-center rounded-full px-4 text-[15px] font-semibold text-ink ${HOME_FOCUS}`}
          data-testid="basic-new-game-secondary"
        >
          {t('basicHome.newGame', 'New game')}
        </button>
      )}

      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setAllFeaturesOpen(true)}
        data-testid="all-features"
        className={`s1-ghost flex h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold text-ink-2 ${HOME_FOCUS}`}
      >
        {t('allFeatures.title', 'All features')}
        <HiOutlineChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>

      {allFeaturesOpen && (
        <AllFeaturesSheet onClose={() => setAllFeaturesOpen(false)} onSwitchToFull={onSwitchToFull} t={t} />
      )}

      <ConfirmationModal
        isOpen={confirmDeleteId !== null}
        title={t('basicHome.deleteGameTitle', 'Remove this game?')}
        message={t('basicHome.deleteGameMessage', 'The game and its plan are removed. This cannot be undone.')}
        confirmLabel={t('basicHome.deleteGame', 'Remove')}
        variant="danger"
        isConfirming={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
};

export default HomeBasic;
