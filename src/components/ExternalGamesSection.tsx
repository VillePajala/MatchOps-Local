'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { useDataStore } from '@/hooks/useDataStore';
import type { TranslationKey } from '@/i18n-types';
import { Player, Season, Tournament, Team } from '@/types';
import type { PlayerStatAdjustment } from '@/types';
import type { GameType, Gender } from '@/types/game';
import { getAdjustmentsForPlayer, addPlayerAdjustment, updatePlayerAdjustment, deletePlayerAdjustment } from '@/utils/playerAdjustments';
import { getTeamDisplayName } from '@/utils/teams';
import { preferredSpellings, settleSpelling, NO_ADOPTION, type SpellingAdoption } from '@/utils/opponentNames';
import SuggestionChips from './SuggestionChips';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import { ModalSwitch, labelStyle, inputBaseStyle, selectStyle, secondaryButtonStyle, primaryButtonStyle, segmentTrackStyle, segmentStyle, segmentSelectedStyle, cardStyle, subtextStyle, fieldHintStyle, popoverMenuStyle, popoverItemStyle, iconButtonEditStyle } from '@/styles/modalStyles';
import { format } from 'date-fns';
import { fi, enUS } from 'date-fns/locale';
import { positionsForSport } from '@/config/positions';
import { AGE_GROUPS } from '@/config/gameOptions';
import PlayerPositionsEditor from './PlayerPositionsEditor';
import ConfirmationModal from './ConfirmationModal';
import logger from '@/utils/logger';
import { ENTITY_DOT } from '@/config/palette';

/** Result strip colour, shared with the stats view's own game list. */
export const getResultClass = (result: 'W' | 'L' | 'D' | 'N/A') => {
  switch (result) {
    case 'W': return 'bg-green-500';
    case 'L': return 'bg-red-500';
    case 'D': return 'bg-gray-500';
    default: return 'bg-gray-700';
  }
};

const NO_POOL: string[] = [];

/**
 * A player's external games (ulkoiset pelit): the collapsible list plus the
 * add and edit forms, lifted out of PlayerStatsView so the same section can
 * sit on the player card in Seura and behind "Lisää ulkoinen peli" on Home.
 *
 * The section owns the rows: it loads them for the player and reports every
 * change through `onAdjustmentsChange`, so a parent that folds them into
 * stats (PlayerStatsView) stays in step without a second fetch.
 */
export interface ExternalGamesSectionProps {
  player: Player | null;
  seasons: Season[];
  tournaments: Tournament[];
  teams?: Team[];
  /** The stats view's sport filter: the positions editor follows it when a row has no sport of its own. */
  selectedGameTypeFilter?: GameType | 'all';
  /** Ids that reach the parent's totals under its filters. Absent means every row counts (no scope in play). */
  countedIds?: Set<string>;
  onAdjustmentsChange?: (rows: PlayerStatAdjustment[]) => void;
  /** Start expanded (the dedicated modal) instead of collapsed (the stats drill-down). */
  defaultOpen?: boolean;
  /** Start with the add form open. */
  startWithAdd?: boolean;
  /**
   * Every opponent name the coach has used (knownOpponentPool): offered as
   * chips under the opponent box and adopted on blur, exactly as the game
   * form does, so one opponent stays one opponent across both kinds of game.
   */
  opponentPool?: string[];
}

/** What a linked team or competition fills into the form: sport, gender, age group. */
type AutoScope = { gameType: GameType | ''; gender: Gender | ''; ageGroup: string };
const sameScope = (a: AutoScope, b: AutoScope) => a.gameType === b.gameType && a.gender === b.gender && a.ageGroup === b.ageGroup;

/** The positions the given sport knows; a sport the link flips to must not keep the other sport's positions. */
const prunePositions = (ids: string[], sport: GameType): string[] => {
  const allowed = new Set(positionsForSport(sport).map(p => p.id));
  const kept = ids.filter(id => allowed.has(id));
  return kept.length === ids.length ? ids : kept;
};

interface ExternalScopeState {
  positions: string[];
  gameType: GameType | '';
  gender: Gender | '';
  ageGroup: string;
  /** What the linked team or competition filled in last, so a later link change can replace it. */
  auto: AutoScope;
  /** Which fields the coach set by hand; a hand-picked value is never treated as auto-filled. */
  manual: { gameType: boolean; gender: boolean; ageGroup: boolean };
}
const emptyScopeState = (): ExternalScopeState => ({
  positions: [], gameType: '', gender: '', ageGroup: '',
  auto: { gameType: '', gender: '', ageGroup: '' }, manual: { gameType: false, gender: false, ageGroup: false },
});

/**
 * The 053 fields of one external-game form, add or edit, as one piece of
 * state with functional updates: no refs to keep in step, and two link
 * changes in one tick each see the other's result. `applyLink` fills only
 * empty, non-hand-picked fields, replaces what it filled last time, clears
 * them when the link goes, and prunes positions when it flips the sport.
 */
function useExternalScope() {
  const [state, setState] = useState<ExternalScopeState>(emptyScopeState);
  const setPositions = useCallback((positions: string[]) => setState(s => ({ ...s, positions })), []);
  const setGameType = useCallback((v: GameType | '') => setState(s => ({ ...s, gameType: v, manual: { ...s.manual, gameType: v !== '' } })), []);
  const setGender = useCallback((v: Gender | '') => setState(s => ({ ...s, gender: v, manual: { ...s.manual, gender: v !== '' } })), []);
  const setAgeGroup = useCallback((v: string) => setState(s => ({ ...s, ageGroup: v, manual: { ...s.manual, ageGroup: v !== '' } })), []);
  const applyLink = useCallback((next: AutoScope) => setState(s => {
    if (sameScope(next, s.auto)) return s;
    const gameType = !s.manual.gameType && (!s.gameType || s.gameType === s.auto.gameType) ? next.gameType : s.gameType;
    const positions = gameType && gameType !== s.gameType ? prunePositions(s.positions, gameType) : s.positions;
    const gender = !s.manual.gender && (!s.gender || s.gender === s.auto.gender) ? next.gender : s.gender;
    const ageGroup = !s.manual.ageGroup && (!s.ageGroup || s.ageGroup === s.auto.ageGroup) ? next.ageGroup : s.ageGroup;
    return { ...s, gameType, positions, gender, ageGroup, auto: next };
  }), []);
  const reset = useCallback((init?: Partial<ExternalScopeState>) => setState({ ...emptyScopeState(), ...init }), []);
  return { state, setPositions, setGameType, setGender, setAgeGroup, applyLink, reset };
}

/**
 * The 053 fields of an external game: positions played, sport, gender, age
 * group. One component for the add and the edit form so the two cannot drift.
 * Sport and gender toggle off when tapped again; "not recorded" is a real
 * value here (it keeps the row out of filtered views, and the hint says so).
 */
const ExternalGameScopeFields: React.FC<{
  player: Player;
  prefix: string;
  positions: string[];
  onPositions: (next: string[]) => void;
  gameType: GameType | '';
  onGameType: (next: GameType | '') => void;
  gender: Gender | '';
  onGender: (next: Gender | '') => void;
  ageGroup: string;
  onAgeGroup: (next: string) => void;
  /** Which position set the editor shows when the row names no sport. */
  fallbackGameType: GameType;
}> = ({ player, prefix, positions, onPositions, gameType, onGameType, gender, onGender, ageGroup, onAgeGroup, fallbackGameType }) => {
  const { t } = useTranslation();
  // Soccer and futsal have different position sets, so switching from one
  // sport to the other drops the positions the new sport does not know rather
  // than keeping a wrong one (the parent does the same when a link flips the
  // sport). Clearing the sport altogether keeps them: the editor merely falls
  // back to a position set for display, and losing picks over a cleared
  // toggle would be data loss with no signal.
  const changeSport = (next: GameType | '') => {
    onGameType(next);
    if (!next) return;
    const kept = prunePositions(positions, next);
    if (kept !== positions) onPositions(kept);
  };
  const choice = (on: boolean) => (on ? segmentSelectedStyle : segmentStyle);
  return (
    <>
      <div className="lg:col-span-3">
        <label className={labelStyle}>{t('playerStats.positionsLabel', 'Positions played')}</label>
        <p className={`${fieldHintStyle} mb-2 mt-0`}>{t('playerStats.externalPositionsHint', 'Where the player played in this game. Counted in the positions played.')}</p>
        <PlayerPositionsEditor
          players={[player]}
          value={{ [player.id]: positions }}
          gameType={gameType || fallbackGameType}
          onChange={(next) => onPositions(next[player.id] ?? [])}
        />
      </div>
      <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelStyle}>{t('common.gameTypeLabel', 'Sport Type')}</label>
          <div className={segmentTrackStyle}>
            <button type="button" data-testid={`${prefix}-sport-soccer`} aria-pressed={gameType === 'soccer'} onClick={() => changeSport(gameType === 'soccer' ? '' : 'soccer')} className={choice(gameType === 'soccer')}>{t('common.gameTypeSoccer', 'Soccer')}</button>
            <button type="button" data-testid={`${prefix}-sport-futsal`} aria-pressed={gameType === 'futsal'} onClick={() => changeSport(gameType === 'futsal' ? '' : 'futsal')} className={choice(gameType === 'futsal')}>{t('common.gameTypeFutsal', 'Futsal')}</button>
          </div>
        </div>
        <div>
          <label className={labelStyle}>{t('common.genderLabel', 'Gender')}</label>
          <div className={segmentTrackStyle}>
            <button type="button" data-testid={`${prefix}-gender-boys`} aria-pressed={gender === 'boys'} onClick={() => onGender(gender === 'boys' ? '' : 'boys')} className={choice(gender === 'boys')}>{t('common.genderBoys', 'Boys')}</button>
            <button type="button" data-testid={`${prefix}-gender-girls`} aria-pressed={gender === 'girls'} onClick={() => onGender(gender === 'girls' ? '' : 'girls')} className={choice(gender === 'girls')}>{t('common.genderGirls', 'Girls')}</button>
          </div>
        </div>
        <div>
          <label className={labelStyle} htmlFor={`${prefix}-age-group`}>{t('newGameSetupModal.ageGroupLabel', 'Age Group (Optional)')}</label>
          <select id={`${prefix}-age-group`} value={ageGroup} onChange={e => onAgeGroup(e.target.value)} className={selectStyle}>
            <option value="">{t('common.none', 'None')}</option>
            {AGE_GROUPS.map((group) => (<option key={group} value={group}>{group}</option>))}
            {/* A stored label outside today's list (the list has changed before) still shows and survives a save. */}
            {ageGroup && !AGE_GROUPS.includes(ageGroup) && <option value={ageGroup}>{ageGroup}</option>}
          </select>
        </div>
        <p className={`sm:col-span-3 ${fieldHintStyle}`}>{t('playerStats.externalScopeHint', 'Sport and gender place the game under the stats filters. If either is missing, the game stays out of a filtered view.')}</p>
      </div>
    </>
  );
};

const ExternalGamesSection: React.FC<ExternalGamesSectionProps> = ({ player, seasons, tournaments, teams = [], selectedGameTypeFilter, countedIds, onAdjustmentsChange, defaultOpen = false, startWithAdd = false, opponentPool = NO_POOL }) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { userId } = useDataStore();
  const [adjustments, setAdjustments] = useState<PlayerStatAdjustment[]>([]);
  const [showAdjForm, setShowAdjForm] = useState(startWithAdd);
  const [adjSeasonId, setAdjSeasonId] = useState('');
  const [adjTournamentId, setAdjTournamentId] = useState('');
  const [adjExternalTeam, setAdjExternalTeam] = useState('');
  /** Which of the coach's own teams this game was for. '' = another team. */
  const [adjTeamId, setAdjTeamId] = useState('');
  const [adjOpponentName, setAdjOpponentName] = useState('');
  const [adjScoreFor, setAdjScoreFor] = useState<number | ''>('');
  const [adjScoreAgainst, setAdjScoreAgainst] = useState<number | ''>('');
  const [adjGameDate, setAdjGameDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [adjHomeAway, setAdjHomeAway] = useState<'home' | 'away' | 'neutral'>('neutral');
  const [adjGames, setAdjGames] = useState(1);
  const [adjGoals, setAdjGoals] = useState(0);
  const [adjAssists, setAdjAssists] = useState(0);
  const [adjFairPlayCards, setAdjFairPlayCards] = useState(0);
  const [adjNote, setAdjNote] = useState('');
  const [adjIncludeInSeasonTournament, setAdjIncludeInSeasonTournament] = useState(false);
  // 053: where the player played, and what kind of game it was (one state object per form)
  const adjScope = useExternalScope();
  const [editingAdjId, setEditingAdjId] = useState<string | null>(null);
  const [editGames, setEditGames] = useState<number>(0);
  const [editGoals, setEditGoals] = useState<number>(0);
  const [editAssists, setEditAssists] = useState<number>(0);
  const [editFairPlayCards, setEditFairPlayCards] = useState<number>(0);
  const [editNote, setEditNote] = useState('');
  const [editHomeAway, setEditHomeAway] = useState<'home' | 'away' | 'neutral'>('neutral');
  const [editExternalTeam, setEditExternalTeam] = useState('');
  const [editOpponentName, setEditOpponentName] = useState('');
  const [editSeasonId, setEditSeasonId] = useState('');
  const [editTournamentId, setEditTournamentId] = useState('');
  /** Which of the coach's own teams an existing external game was for. */
  const [editTeamId, setEditTeamId] = useState('');
  const [editGameDate, setEditGameDate] = useState('');
  const [editScoreFor, setEditScoreFor] = useState<number | ''>('');
  const [editScoreAgainst, setEditScoreAgainst] = useState<number | ''>('');
  const [editIncludeInSeasonTournament, setEditIncludeInSeasonTournament] = useState(false);
  const editScope = useExternalScope();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [showExternalGames, setShowExternalGames] = useState(defaultOpen);

  useEffect(() => { onAdjustmentsChange?.(adjustments); }, [adjustments, onAdjustmentsChange]);

  // Team names from this player's earlier added games, most-used spelling of
  // each: the guest team they keep playing for is the one they will type again.
  const teamPool = useMemo(() => preferredSpellings(adjustments.map(a => a.externalTeamName ?? '')), [adjustments]);
  // One adoption state per name box; refs, since it only matters on blur.
  const adjOpponentAdoption = useRef<SpellingAdoption>(NO_ADOPTION);
  const adjTeamAdoption = useRef<SpellingAdoption>(NO_ADOPTION);
  const editOpponentAdoption = useRef<SpellingAdoption>(NO_ADOPTION);
  const editTeamAdoption = useRef<SpellingAdoption>(NO_ADOPTION);
  /** The add form starts with no adoption history, so an earlier "keep mine" cannot leak into the next game. */
  const resetAdjAdoption = () => { adjOpponentAdoption.current = NO_ADOPTION; adjTeamAdoption.current = NO_ADOPTION; };
  /**
   * Editing seeds each box with the stored value as the coach's own choice:
   * tabbing through without typing must never rewrite a name they saved on
   * purpose, and a different name they then type is adopted as usual.
   */
  const seedEditAdoption = (opponentName: string, teamName: string) => {
    editOpponentAdoption.current = { insisted: opponentName.trim(), last: null };
    editTeamAdoption.current = { insisted: teamName.trim(), last: null };
  };
  /** Settle a box on an earlier spelling when it loses focus; the coach can type theirs again to keep it. */
  const settle = (ref: React.MutableRefObject<SpellingAdoption>, value: string, pool: readonly string[], set: (v: string) => void) => {
    const next = settleSpelling(ref.current, value, pool);
    ref.current = next.state;
    if (next.value !== value) set(next.value);
  };
  const isCounted = (id: string) => (countedIds ? countedIds.has(id) : true);

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), i18n.language === 'fi' ? 'd.M.yyyy' : 'PP', {
        locale: i18n.language === 'fi' ? fi : enUS
      });
    } catch (error) {
      logger.warn('Failed to format date in PlayerStatsView', { dateStr, error });
      return dateStr;
    }
  };

  useEffect(() => {
    if (!player) return;
    getAdjustmentsForPlayer(player.id, userId).then(setAdjustments).catch(() => setAdjustments([]));
    // Reset form/UI state when switching away from this player (cleanup runs before next effect)
    return () => {
      setShowAdjForm(false);
      setEditingAdjId(null);
      setShowExternalGames(false);
      setShowDeleteConfirm(null);
      setShowActionsMenu(null);
    };
  }, [player, userId]);

  // Close actions menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showActionsMenu && !(event.target as Element).closest('.actions-menu-container')) {
        setShowActionsMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showActionsMenu) {
        event.stopImmediatePropagation();
        setShowActionsMenu(null);
      }
    };
    
    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showActionsMenu]);

  /**
   * What picking a team means for the rest of the form.
   *
   * Written once and used by both the add and the edit form. Two copies of
   * this would drift, and drifting copies of one rule is what put another
   * team's games in a team's totals to begin with.
   *
   * Mirrors new game setup: the team brings its name and its bound competition
   * across, and both stay editable, since a team bound to the league may still
   * have played a cup match. A team with NO binding clears the competition
   * rather than leaving the previous team's - new game setup has that gap and
   * this deliberately does not inherit it.
   *
   * The name is only cleared when it is the one we filled in ourselves, so
   * correcting an old entry never silently discards what the coach typed.
   */
  const teamAutofill = useCallback(
    (teamId: string, currentName: string, previousTeamId: string) => {
      const team = teamId ? teams.find(t => t.id === teamId) : undefined;
      if (team) {
        return {
          name: team.name,
          seasonId: team.boundSeasonId ?? '',
          tournamentId: team.boundSeasonId ? '' : (team.boundTournamentId ?? ''),
          include: Boolean(team.boundSeasonId || team.boundTournamentId),
        };
      }
      const previous = previousTeamId ? teams.find(t => t.id === previousTeamId) : undefined;
      const wasOurs = Boolean(previous && currentName === previous.name);
      return {
        name: wasOurs ? '' : currentName,
        seasonId: '',
        tournamentId: '',
        include: false,
      };
    },
    [teams],
  );

  /**
   * Sport, gender and age group from what the game is linked to: the season
   * or tournament first (they carry gender), the team as fallback. Only empty
   * fields are filled, so a value the coach chose stays; a field that still
   * holds what we filled in last time follows the new link, or clears when
   * the link goes, the way the name and competition already behave.
   */
  const scopeOf = useCallback(
    (teamId: string, seasonId: string, tournamentId: string) => {
      const team = teamId ? teams.find(t => t.id === teamId) : undefined;
      const season = seasonId ? seasons.find(s => s.id === seasonId) : undefined;
      const tournament = tournamentId ? tournaments.find(t => t.id === tournamentId) : undefined;
      const comp = season ?? tournament;
      return {
        gameType: (comp?.gameType ?? team?.gameType ?? '') as GameType | '',
        gender: (comp?.gender ?? '') as Gender | '',
        ageGroup: comp?.ageGroup ?? team?.ageGroup ?? '',
      };
    },
    [teams, seasons, tournaments],
  );
  const { applyLink: applyAdjLink } = adjScope;
  const { applyLink: applyEditLink } = editScope;
  const applyAdjScope = useCallback((teamId: string, seasonId: string, tournamentId: string) => applyAdjLink(scopeOf(teamId, seasonId, tournamentId)), [applyAdjLink, scopeOf]);
  const applyEditScope = useCallback((teamId: string, seasonId: string, tournamentId: string) => applyEditLink(scopeOf(teamId, seasonId, tournamentId)), [applyEditLink, scopeOf]);

  const applyAdjTeam = useCallback((teamId: string) => {
    const filled = teamAutofill(teamId, adjExternalTeam, adjTeamId);
    setAdjTeamId(teamId);
    setAdjExternalTeam(filled.name);
    setAdjSeasonId(filled.seasonId);
    setAdjTournamentId(filled.tournamentId);
    setAdjIncludeInSeasonTournament(filled.include);
    applyAdjScope(teamId, filled.seasonId, filled.tournamentId);
  }, [teamAutofill, adjExternalTeam, adjTeamId, applyAdjScope]);

  /** The same, for correcting an entry that predates the question. */
  const applyEditTeam = useCallback((teamId: string) => {
    const filled = teamAutofill(teamId, editExternalTeam, editTeamId);
    setEditTeamId(teamId);
    setEditExternalTeam(filled.name);
    setEditSeasonId(filled.seasonId);
    setEditTournamentId(filled.tournamentId);
    setEditIncludeInSeasonTournament(filled.include);
    applyEditScope(teamId, filled.seasonId, filled.tournamentId);
  }, [teamAutofill, editExternalTeam, editTeamId, applyEditScope]);


  const hasAdjustments = adjustments.length > 0;
  // Dynamic labels for score inputs so user knows whose score goes where
  const teamNameForScore = (adjExternalTeam || t('playerStats.team', 'Team')) as string;
  const opponentNameForScore = (adjOpponentName || t('playerStats.opponent', 'Opponent')) as string;
  // Left = Home score; Right = Away score
  const leftScoreLabel = adjHomeAway === 'away' ? opponentNameForScore : teamNameForScore;
  const rightScoreLabel = adjHomeAway === 'away' ? teamNameForScore : opponentNameForScore;
  const getLeftScore = () => (adjHomeAway === 'away' ? adjScoreAgainst : adjScoreFor);
  const setLeftScore = (val: number | '') => (adjHomeAway === 'away' ? setAdjScoreAgainst(val) : setAdjScoreFor(val));
  const getRightScore = () => (adjHomeAway === 'away' ? adjScoreFor : adjScoreAgainst);
  const setRightScore = (val: number | '') => (adjHomeAway === 'away' ? setAdjScoreFor(val) : setAdjScoreAgainst(val));

  if (!player) return null;
  return (
    <>
        {/* External Games Section - Collapsible */}
        <div className="mt-6 mb-4">
          <button
            type="button"
            onClick={() => setShowExternalGames(v => !v)}
            className="text-left w-full min-h-14 s1-list px-[18px] py-3 font-ui flex justify-between items-center gap-3 hover:bg-white/[0.03] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
            aria-expanded={showExternalGames}
          >
            <span className="font-semibold text-ink">{t('playerStats.externalGames', 'Added stats')}</span>
            <span className="shrink-0 text-xl leading-none text-ink-3">{showExternalGames ? '−' : '+'}</span>
          </button>
          {showExternalGames && (
            <div className="mt-3">
              <button
                type="button"
                className={`${secondaryButtonStyle} w-full`}
                data-testid="add-external-game"
                onClick={() => { if (!showAdjForm) { adjScope.reset(); resetAdjAdoption(); } setShowAdjForm(!showAdjForm); setEditingAdjId(null); }}
              >
                {t('playerStats.addExternalStats', 'Add game')}
              </button>
          {showAdjForm && (
            <form
              className={`${cardStyle} mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!player) return;
                
                // Comprehensive Validation
                if (!adjExternalTeam.trim()) {
                  showToast(t('playerStats.teamRequired', 'Team name is required.'), 'error');
                  return;
                }
                if (!adjOpponentName.trim()) {
                  showToast(t('playerStats.opponentRequired', 'Opponent name is required.'), 'error');
                  return;
                }
                if (adjGames < 0 || adjGoals < 0 || adjAssists < 0) {
                  showToast(t('playerStats.negativeStatsError', 'Stats cannot be negative.'), 'error');
                  return;
                }
                if (adjGames === 0 && adjGoals === 0 && adjAssists === 0) {
                  showToast(t('playerStats.emptyStatsError', 'Please enter at least one statistic (games, goals, or assists).'), 'error');
                  return;
                }
                if (adjGames > 0 && adjGoals > adjGames * 20) {
                  showToast(t('playerStats.unrealisticGoalsError', 'Goals per game seems unrealistic. Please check your input.'), 'error');
                  return;
                }
                if (adjGames > 0 && adjAssists > adjGames * 20) {
                  showToast(t('playerStats.unrealisticAssistsError', 'Assists per game seems unrealistic. Please check your input.'), 'error');
                  return;
                }
                
                try {
                  const created = await addPlayerAdjustment({
                    playerId: player.id,
                    seasonId: adjSeasonId || undefined,
                    tournamentId: adjTournamentId || undefined,
                    teamId: adjTeamId || undefined,
                    externalTeamName: adjExternalTeam.trim(),
                    opponentName: adjOpponentName.trim(),
                    scoreFor: typeof adjScoreFor === 'number' ? adjScoreFor : undefined,
                    scoreAgainst: typeof adjScoreAgainst === 'number' ? adjScoreAgainst : undefined,
                    gameDate: adjGameDate || undefined,
                    homeOrAway: adjHomeAway,
                    gamesPlayedDelta: Math.max(0, Number(adjGames) || 0),
                    goalsDelta: Math.max(0, Number(adjGoals) || 0),
                    assistsDelta: Math.max(0, Number(adjAssists) || 0),
                    fairPlayCardsDelta: Math.max(0, Number(adjFairPlayCards) || 0),
                    note: adjNote.trim() || undefined,
                    includeInSeasonTournament: adjIncludeInSeasonTournament,
                    positions: adjScope.state.positions.length > 0 ? adjScope.state.positions : undefined,
                    gameType: adjScope.state.gameType || undefined,
                    gender: adjScope.state.gender || undefined,
                    ageGroup: adjScope.state.ageGroup || undefined,
                  }, userId);
                  setAdjustments(prev => [...prev, created]);
                  setShowAdjForm(false);
                  // Reset form
                  setAdjGames(1); setAdjGoals(0); setAdjAssists(0); setAdjFairPlayCards(0); setAdjNote('');
                  setAdjSeasonId(''); setAdjTournamentId(''); setAdjExternalTeam(''); setAdjOpponentName(''); setAdjScoreFor(''); setAdjScoreAgainst('');
                  setAdjTeamId('');
                  setAdjGameDate(new Date().toISOString().split('T')[0]);
                  setAdjHomeAway('neutral');
                  setAdjIncludeInSeasonTournament(false);
                  adjScope.reset();
                  resetAdjAdoption();
                } catch (error) {
                  logger.error('[PlayerStatsView] Failed to add external game', { error });
                  showToast(t('playerStats.addError', 'Failed to save the external game entry.'), 'error');
                }
              }}
            >
              {/* Who was this game for? Asked BEFORE the competition, because
                  the answer often fills the competition in. */}
              <div className="lg:col-span-3">
                <label className={labelStyle} htmlFor="adj-team">
                  {t('playerStats.whichTeam', 'Which team was this game for?')}
                </label>
                <select
                  id="adj-team"
                  data-testid="adj-team-select"
                  value={adjTeamId}
                  onChange={e => applyAdjTeam(e.target.value)}
                  className={selectStyle}
                >
                  {/* Default, and the common case: he played for somebody else. */}
                  <option value="">{t('playerStats.anotherTeam', 'Another team (not one of mine)')}</option>
                  {/* NAME PLUS CONTEXT, because the name alone does not
                      identify a team. Teams are bound to a competition, so one
                      squad appears once per season it plays in - the owner's
                      list showed "PePo Lila" four times with nothing to choose
                      between them. Same helper the game-setup picker uses. */}
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>
                      {getTeamDisplayName(team, seasons, tournaments)}
                    </option>
                  ))}
                </select>
                <p className={fieldHintStyle}>
                  {adjTeamId
                    ? t('playerStats.whichTeamMineHint', 'Counts toward this team in team statistics.')
                    : t('playerStats.whichTeamOtherHint', 'Counts toward the player, but not toward any of your teams.')}
                </p>
              </div>

              {/* Season / Tournament tabs — mutually exclusive, matching GameSettingsModal */}
              <div className="lg:col-span-3">
                <label className={labelStyle}>{t('gameSettingsModal.seasonOrTournament', 'Season / Tournament')}</label>
                <div className={`${segmentTrackStyle} mb-2`}>
                  <button type="button" onClick={() => { setAdjSeasonId(''); setAdjTournamentId(''); setAdjIncludeInSeasonTournament(false); applyAdjScope(adjTeamId, '', ''); }} className={!adjSeasonId && !adjTournamentId ? segmentSelectedStyle : segmentStyle}>
                    {t('gameSettingsModal.eiMitaan', 'None')}
                  </button>
                  <button type="button" onClick={() => { const nextSeasonId = seasons.length > 0 ? (adjSeasonId || seasons[0].id) : ''; setAdjTournamentId(''); setAdjSeasonId(nextSeasonId); if (nextSeasonId) setAdjIncludeInSeasonTournament(true); applyAdjScope(adjTeamId, nextSeasonId, ''); }} className={adjSeasonId ? segmentSelectedStyle : segmentStyle}>
                    {t('gameSettingsModal.kausi', 'League')}
                  </button>
                  <button type="button" onClick={() => { const nextTournamentId = tournaments.length > 0 ? (adjTournamentId || tournaments[0].id) : ''; setAdjSeasonId(''); setAdjTournamentId(nextTournamentId); if (nextTournamentId) setAdjIncludeInSeasonTournament(true); applyAdjScope(adjTeamId, '', nextTournamentId); }} className={adjTournamentId ? segmentSelectedStyle : segmentStyle}>
                    {t('gameSettingsModal.turnaus', 'Tournament')}
                  </button>
                </div>
                {adjSeasonId !== '' && (
                  <select
                    data-testid="adj-season-select"
                    value={adjSeasonId}
                    onChange={(e) => { setAdjSeasonId(e.target.value); applyAdjScope(adjTeamId, e.target.value, ''); }}
                    className={selectStyle}
                  >
                    {seasons.map(s => (
                      <option key={s.id} value={s.id}>{getSeasonDisplayName(s)}</option>
                    ))}
                  </select>
                )}
                {adjTournamentId !== '' && (
                  <select
                    value={adjTournamentId}
                    onChange={(e) => {
                      const tournamentId = e.target.value;
                      setAdjTournamentId(tournamentId);
                      applyAdjScope(adjTeamId, '', tournamentId);
                      // Prefill tournament data when selected
                      if (tournamentId) {
                        const tournament = tournaments.find(t => t.id === tournamentId);
                        if (tournament) {
                          const tournamentDate = tournament.startDate || (tournament.gameDates && tournament.gameDates[0]);
                          if (tournamentDate) {
                            setAdjGameDate(tournamentDate);
                          }
                        }
                      }
                    }}
                    className={selectStyle}
                  >
                    {tournaments.map(t => (
                      <option key={t.id} value={t.id}>{getTournamentDisplayName(t)}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className={labelStyle}>{t('playerStats.homeAway', 'Home/Away')}</label>
                <select value={adjHomeAway} onChange={e => setAdjHomeAway(e.target.value as 'home' | 'away' | 'neutral')} className={selectStyle}>
                  <option value="home">{t('playerStats.home', 'Home')}</option>
                  <option value="away">{t('playerStats.away', 'Away')}</option>
                  <option value="neutral">{t('playerStats.neutral', 'Neutral')}</option>
                </select>
              </div>
              <div>
                <label className={labelStyle}>{t('playerStats.team', 'Team')} <span className="text-loss">*</span></label>
                <input type="text" data-testid="adj-external-team" value={adjExternalTeam} onChange={e => setAdjExternalTeam(e.target.value)} onBlur={() => settle(adjTeamAdoption, adjExternalTeam, teamPool, setAdjExternalTeam)} className={inputBaseStyle} placeholder={t('playerStats.externalTeam', 'Team name') as string} required />
                <SuggestionChips value={adjExternalTeam} options={teamPool} onPick={setAdjExternalTeam} testId="adj-team-options" />
              </div>
              <div>
                <label className={labelStyle}>{t('playerStats.opponent', 'Opponent')} <span className="text-loss">*</span></label>
                <input type="text" data-testid="adj-opponent-input" value={adjOpponentName} onChange={e => setAdjOpponentName(e.target.value)} onBlur={() => settle(adjOpponentAdoption, adjOpponentName, opponentPool, setAdjOpponentName)} className={inputBaseStyle} placeholder={t('playerStats.opponentName', 'Opponent name') as string} required />
                <SuggestionChips value={adjOpponentName} options={opponentPool} onPick={setAdjOpponentName} testId="adj-opponent-options" />
              </div>
              <div>
                <label className={labelStyle}>{t('playerStats.score', 'Score')}</label>
                <div className="flex justify-between font-ui text-[13px] text-ink-3 mb-1">
                  <span>{leftScoreLabel}</span>
                  <span>{rightScoreLabel}</span>
                </div>
                <div className="flex items-center gap-2" aria-label={`${leftScoreLabel} - ${rightScoreLabel}`}>
                  <input aria-label={`${leftScoreLabel} ${t('playerStats.goals', 'Goals')}`} type="number" inputMode="numeric" pattern="[0-9]*" value={getLeftScore()} onChange={e => setLeftScore(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))} className={`${inputBaseStyle} w-20 text-center`} placeholder="0" min="0" />
                  <span className="mx-1 text-lg font-bold">-</span>
                  <input aria-label={`${rightScoreLabel} ${t('playerStats.goals', 'Goals')}`} type="number" inputMode="numeric" pattern="[0-9]*" value={getRightScore()} onChange={e => setRightScore(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))} className={`${inputBaseStyle} w-20 text-center`} placeholder="0" min="0" />
                </div>
              </div>
              <div>
                <label className={labelStyle}>{t('playerStats.gameDate', 'Game date')}</label>
                <input type="date" value={adjGameDate} onChange={e => setAdjGameDate(e.target.value)} className={inputBaseStyle} />
              </div>
              <div>
                <label className={labelStyle}>{t('playerStats.gamesPlayed', 'Games Played')}</label>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={t('playerStats.decreaseGames', 'Decrease games')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setAdjGames(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                  <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(adjGames)} onChange={e => setAdjGames(Math.max(0, parseInt(e.target.value || '0', 10)))} className={`${inputBaseStyle} flex-1 min-w-0 text-center`} min="0" />
                  <button type="button" aria-label={t('playerStats.increaseGames', 'Increase games')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setAdjGames(v => (Number(v) || 0) + 1)}>+</button>
                </div>
              </div>
              <div>
                <label className={labelStyle}>{t('playerStats.goals', 'Goals')}</label>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={t('playerStats.decreaseGoals', 'Decrease goals')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setAdjGoals(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                  <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(adjGoals)} onChange={e => setAdjGoals(Math.max(0, parseInt(e.target.value || '0', 10)))} className={`${inputBaseStyle} flex-1 min-w-0 text-center`} min="0" />
                  <button type="button" aria-label={t('playerStats.increaseGoals', 'Increase goals')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setAdjGoals(v => (Number(v) || 0) + 1)}>+</button>
                </div>
              </div>
              <div>
                <label className={labelStyle}>{t('playerStats.assists', 'Assists')}</label>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={t('playerStats.decreaseAssists', 'Decrease assists')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setAdjAssists(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                  <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(adjAssists)} onChange={e => setAdjAssists(Math.max(0, parseInt(e.target.value || '0', 10)))} className={`${inputBaseStyle} flex-1 min-w-0 text-center`} min="0" />
                  <button type="button" aria-label={t('playerStats.increaseAssists', 'Increase assists')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setAdjAssists(v => (Number(v) || 0) + 1)}>+</button>
                </div>
              </div>
              <div>
                <ModalSwitch
                  checked={adjFairPlayCards > 0}
                  onToggle={() => setAdjFairPlayCards(adjFairPlayCards > 0 ? 0 : 1)}
                >
                  <span className="inline-flex items-center gap-2">
                    {t('playerStats.receivedFairPlayCard', 'Received Fair Play Card')}
                    <span className="inline-flex items-center rounded-full bg-win/[0.14] px-2 py-0.5 text-xs font-bold text-win">FP</span>
                  </span>
                </ModalSwitch>
              </div>
              <ExternalGameScopeFields
                player={player}
                prefix="adj"
                positions={adjScope.state.positions}
                onPositions={adjScope.setPositions}
                gameType={adjScope.state.gameType}
                onGameType={adjScope.setGameType}
                gender={adjScope.state.gender}
                onGender={adjScope.setGender}
                ageGroup={adjScope.state.ageGroup}
                onAgeGroup={adjScope.setAgeGroup}
                fallbackGameType={selectedGameTypeFilter && selectedGameTypeFilter !== 'all' ? selectedGameTypeFilter : 'soccer'}
              />
              <div className="lg:col-span-3">
                <ModalSwitch
                  checked={adjIncludeInSeasonTournament}
                  onToggle={() => setAdjIncludeInSeasonTournament(v => !v)}
                >
                  {t('playerStats.includeInSeasonTournament', 'Include in league/tournament statistics')}
                </ModalSwitch>
                <p className={`${fieldHintStyle} ml-1`}>
                  {t('playerStats.includeInSeasonTournamentHelp', 'Check this if the game was played for the same team')}
                </p>
              </div>
              <div className="lg:col-span-3">
                <label className={labelStyle}>{t('playerStats.note', 'Note')}</label>
                <input type="text" value={adjNote} onChange={e => setAdjNote(e.target.value)} className={inputBaseStyle} placeholder={t('playerStats.noteOptional', 'Optional note about this game') as string} />
              </div>
              <div className="lg:col-span-3 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAdjForm(false)} className={secondaryButtonStyle}>{t('common.cancel', 'Cancel')}</button>
                <button type="submit" data-testid="save-external-game" className={primaryButtonStyle}>{t('common.save', 'Save')}</button>
              </div>
            </form>
          )}

        {/* External stats list - inside collapsible section */}
        {hasAdjustments && (
          <div className={`mb-4 mt-4 ${subtextStyle}`}>
            {/* The old caption promised every game here was in the totals. Once
                filters started excluding some, that stopped being true, and a
                list that lies about its own numbers is the bug this whole
                change is about. Every game is still SHOWN, so none looks lost
                and all stay editable; the ones outside the filter say so. */}
            {(!countedIds || countedIds.size === adjustments.length)
              ? t('playerStats.adjustmentsInfo', 'Added stats are counted in the totals.')
              : t(
                  'playerStats.adjustmentsPartlyCounted',
                  'Added stats are counted in the totals. The dimmed ones fall outside the filters you have chosen and are not counted here.',
                )}
            <div className="mt-3 space-y-3">
              {/* Newest GAME first, as in the player's game log (review 7.L4) - not the
                  time the entry was saved - and on a copy: sorting the state array
                  in place during render mutated it. */}
              {[...adjustments]
                .sort((a, b) => new Date(b.gameDate || b.appliedAt).getTime() - new Date(a.gameDate || a.appliedAt).getTime())
                .map(a => {
                  const seasonObj = seasons.find(s => s.id === a.seasonId);
                  const seasonName = seasonObj ? getSeasonDisplayName(seasonObj) : undefined;
                  const tournamentObj = tournaments.find(t => t.id === a.tournamentId);
                  const tournamentName = tournamentObj ? getTournamentDisplayName(tournamentObj) : undefined;
                  // Team names should always exist due to validation, but fallback just in case
                  const extName = a.externalTeamName || 'Unknown Team';
                  const oppName = a.opponentName || 'Unknown Opponent';
                  const dateText = a.gameDate ? formatDisplayDate(a.gameDate) : formatDisplayDate(a.appliedAt);

                  // Determine match result display based on home/away
                  const getScoreDisplay = () => {
                    if (typeof a.scoreFor !== 'number' || typeof a.scoreAgainst !== 'number') {
                      return null;
                    }

                    if (a.homeOrAway === 'home') {
                      return `${extName} ${a.scoreFor} - ${a.scoreAgainst} ${oppName}`;
                    } else if (a.homeOrAway === 'away') {
                      return `${oppName} ${a.scoreAgainst} - ${a.scoreFor} ${extName}`;
                    } else {
                      return `${extName} ${a.scoreFor} - ${a.scoreAgainst} ${oppName}`;
                    }
                  };

                  const scoreDisplay = getScoreDisplay();

                  // If editing this adjustment, show the edit form inline
                  if (editingAdjId === a.id) {
                    return (
                      <form
                        key={a.id}
                        className={`${cardStyle} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ring-1 ring-action/60`}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!player) return;

                          // Comprehensive Validation
                          if (!editExternalTeam.trim() || !editOpponentName.trim()) {
                            showToast(t('playerStats.requiredFields', 'Team and opponent names are required.'), 'error');
                            return;
                          }
                          if (editGames < 0 || editGoals < 0 || editAssists < 0) {
                            showToast(t('playerStats.negativeStatsError', 'Stats cannot be negative.'), 'error');
                            return;
                          }
                          if (editGames === 0 && editGoals === 0 && editAssists === 0) {
                            showToast(t('playerStats.emptyStatsError', 'Please enter at least one statistic (games, goals, or assists).'), 'error');
                            return;
                          }
                          if (editGames > 0 && editGoals > editGames * 20) {
                            showToast(t('playerStats.unrealisticGoalsError', 'Goals per game seems unrealistic. Please check your input.'), 'error');
                            return;
                          }
                          if (editGames > 0 && editAssists > editGames * 20) {
                            showToast(t('playerStats.unrealisticAssistsError', 'Assists per game seems unrealistic. Please check your input.'), 'error');
                            return;
                          }

                          try {
                            const updated = await updatePlayerAdjustment(player.id, editingAdjId, {
                              gamesPlayedDelta: Math.max(0, Number(editGames) || 0),
                              goalsDelta: Math.max(0, Number(editGoals) || 0),
                              assistsDelta: Math.max(0, Number(editAssists) || 0),
                              fairPlayCardsDelta: Math.max(0, Number(editFairPlayCards) || 0),
                              note: editNote.trim() || undefined,
                              homeOrAway: editHomeAway,
                              externalTeamName: editExternalTeam.trim(),
                              opponentName: editOpponentName.trim(),
                              seasonId: editSeasonId || undefined,
                              tournamentId: editTournamentId || undefined,
                              teamId: editTeamId || undefined,
                              gameDate: editGameDate || undefined,
                              scoreFor: typeof editScoreFor === 'number' ? editScoreFor : undefined,
                              scoreAgainst: typeof editScoreAgainst === 'number' ? editScoreAgainst : undefined,
                              includeInSeasonTournament: editIncludeInSeasonTournament,
                              positions: editScope.state.positions.length > 0 ? editScope.state.positions : undefined,
                              gameType: editScope.state.gameType || undefined,
                              gender: editScope.state.gender || undefined,
                              ageGroup: editScope.state.ageGroup || undefined,
                            }, userId);
                            if (updated) {
                              setAdjustments(prev => prev.map(x => x.id === updated.id ? updated : x));
                              setEditingAdjId(null);
                            } else {
                              showToast(t('playerStats.updateError', 'Failed to update the external game entry.'), 'error');
                            }
                          } catch (error) {
                            logger.error('[PlayerStatsView] Failed to update external game', { error });
                            showToast(t('playerStats.updateError', 'Failed to update the external game entry.'), 'error');
                          }
                        }}
                      >
                        {/* Season / Tournament tabs — mutually exclusive, matching GameSettingsModal */}
                        <div className="lg:col-span-3">
                          <label className={labelStyle}>{t('gameSettingsModal.seasonOrTournament', 'Season / Tournament')}</label>
                          <div className={`${segmentTrackStyle} mb-2`}>
                            <button type="button" onClick={() => { setEditSeasonId(''); setEditTournamentId(''); setEditIncludeInSeasonTournament(false); applyEditScope(editTeamId, '', ''); }} className={!editSeasonId && !editTournamentId ? segmentSelectedStyle : segmentStyle}>
                              {t('gameSettingsModal.eiMitaan', 'None')}
                            </button>
                            <button type="button" onClick={() => { const nextSeasonId = editSeasonId || (seasons.length > 0 ? seasons[0].id : ''); setEditTournamentId(''); setEditSeasonId(nextSeasonId); if (nextSeasonId) setEditIncludeInSeasonTournament(true); applyEditScope(editTeamId, nextSeasonId, ''); }} className={editSeasonId ? segmentSelectedStyle : segmentStyle}>
                              {t('gameSettingsModal.kausi', 'League')}
                            </button>
                            <button type="button" onClick={() => { const nextTournamentId = editTournamentId || (tournaments.length > 0 ? tournaments[0].id : ''); setEditSeasonId(''); setEditTournamentId(nextTournamentId); if (nextTournamentId) setEditIncludeInSeasonTournament(true); applyEditScope(editTeamId, '', nextTournamentId); }} className={editTournamentId ? segmentSelectedStyle : segmentStyle}>
                              {t('gameSettingsModal.turnaus', 'Tournament')}
                            </button>
                          </div>
                          {editSeasonId !== '' && (
                            <select
                              value={editSeasonId}
                              data-testid="edit-season-select"
                              onChange={(e) => { setEditSeasonId(e.target.value); applyEditScope(editTeamId, e.target.value, ''); }}
                              className={selectStyle}
                            >
                              {seasons.map(s => (
                                <option key={s.id} value={s.id}>{getSeasonDisplayName(s)}</option>
                              ))}
                            </select>
                          )}
                          {editTournamentId !== '' && (
                            <select
                              value={editTournamentId}
                              data-testid="edit-tournament-select"
                              onChange={(e) => { setEditTournamentId(e.target.value); applyEditScope(editTeamId, '', e.target.value); }}
                              className={selectStyle}
                            >
                              {tournaments.map(t => (
                                <option key={t.id} value={t.id}>{getTournamentDisplayName(t)}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div>
                          <label className={labelStyle}>{t('playerStats.homeAway', 'Home/Away')}</label>
                          <select value={editHomeAway} onChange={e => setEditHomeAway(e.target.value as 'home' | 'away' | 'neutral')} className={selectStyle}>
                            <option value="home">{t('playerStats.home', 'Home')}</option>
                            <option value="away">{t('playerStats.away', 'Away')}</option>
                            <option value="neutral">{t('playerStats.neutral', 'Neutral')}</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelStyle}>{t('playerStats.team', 'Team')} <span className="text-loss">*</span></label>
                          <input type="text" data-testid="edit-external-team" value={editExternalTeam} onChange={e => setEditExternalTeam(e.target.value)} onBlur={() => settle(editTeamAdoption, editExternalTeam, teamPool, setEditExternalTeam)} className={inputBaseStyle} required />
                          <SuggestionChips value={editExternalTeam} options={teamPool} onPick={setEditExternalTeam} testId="edit-team-options" />
                          {/* Editable too: existing entries predate this question
                              and all read as "another team" until corrected. */}
                          <label className={`${labelStyle} mt-3`} htmlFor={`edit-team-${a.id}`}>
                            {t('playerStats.whichTeam', 'Which team was this game for?')}
                          </label>
                          <select
                            id={`edit-team-${a.id}`}
                            data-testid="edit-team-select"
                            value={editTeamId}
                            onChange={e => applyEditTeam(e.target.value)}
                            className={selectStyle}
                          >
                            <option value="">{t('playerStats.anotherTeam', 'Another team (not one of mine)')}</option>
                            {/* Same as the add form above: a team's name does
                                not identify it, and editing is where a wrong
                                guess gets locked in. */}
                            {teams.map(team => (
                              <option key={team.id} value={team.id}>
                                {getTeamDisplayName(team, seasons, tournaments)}
                              </option>
                            ))}
                          </select>
                          <p className={fieldHintStyle}>
                            {editTeamId
                              ? t('playerStats.whichTeamMineHint', 'Counts toward this team in team statistics.')
                              : t('playerStats.whichTeamOtherHint', 'Counts toward the player, but not toward any of your teams.')}
                          </p>
                        </div>
                        <div>
                          <label className={labelStyle}>{t('playerStats.opponent', 'Opponent')} <span className="text-loss">*</span></label>
                          <input type="text" data-testid="edit-opponent-input" value={editOpponentName} onChange={e => setEditOpponentName(e.target.value)} onBlur={() => settle(editOpponentAdoption, editOpponentName, opponentPool, setEditOpponentName)} className={inputBaseStyle} required />
                          <SuggestionChips value={editOpponentName} options={opponentPool} onPick={setEditOpponentName} testId="edit-opponent-options" />
                        </div>
                        <div className="lg:col-span-2">
                          <label className={labelStyle}>{t('playerStats.score', 'Score')}</label>
                          <div className="flex justify-between font-ui text-[13px] text-ink-3 mb-1">
                            <span>{editHomeAway === 'away' ? (editOpponentName || t('playerStats.opponent', 'Opponent')) : (editExternalTeam || t('playerStats.team', 'Team'))}</span>
                            <span>{editHomeAway === 'away' ? (editExternalTeam || t('playerStats.team', 'Team')) : (editOpponentName || t('playerStats.opponent', 'Opponent'))}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input type="number" inputMode="numeric" pattern="[0-9]*" value={editHomeAway === 'away' ? editScoreAgainst : editScoreFor} onChange={e => {
                              const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0);
                              void (editHomeAway === 'away' ? setEditScoreAgainst(val) : setEditScoreFor(val));
                            }} className={`${inputBaseStyle} w-20 text-center`} placeholder="0" min="0" />
                            <span className="mx-1 text-lg font-bold">-</span>
                            <input type="number" inputMode="numeric" pattern="[0-9]*" value={editHomeAway === 'away' ? editScoreFor : editScoreAgainst} onChange={e => {
                              const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0);
                              void (editHomeAway === 'away' ? setEditScoreFor(val) : setEditScoreAgainst(val));
                            }} className={`${inputBaseStyle} w-20 text-center`} placeholder="0" min="0" />
                          </div>
                        </div>
                        <div>
                          <label className={labelStyle}>{t('playerStats.gameDate', 'Game date')}</label>
                          <input type="date" value={editGameDate} onChange={e => setEditGameDate(e.target.value)} className={inputBaseStyle} />
                        </div>
                        <div>
                          <label className={labelStyle}>{t('playerStats.gamesPlayed', 'Games Played')}</label>
                          <div className="flex items-center gap-2">
                            <button type="button" aria-label={t('playerStats.decreaseGames', 'Decrease games')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setEditGames(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                            <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(editGames)} onChange={e => setEditGames(Math.max(0, parseInt(e.target.value || '0', 10)))} className={`${inputBaseStyle} flex-1 min-w-0 text-center`} min="0" />
                            <button type="button" aria-label={t('playerStats.increaseGames', 'Increase games')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setEditGames(v => (Number(v) || 0) + 1)}>+</button>
                          </div>
                        </div>
                        <div>
                          <label className={labelStyle}>{t('playerStats.goals', 'Goals')}</label>
                          <div className="flex items-center gap-2">
                            <button type="button" aria-label={t('playerStats.decreaseGoals', 'Decrease goals')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setEditGoals(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                            <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(editGoals)} onChange={e => setEditGoals(Math.max(0, parseInt(e.target.value || '0', 10)))} className={`${inputBaseStyle} flex-1 min-w-0 text-center`} min="0" />
                            <button type="button" aria-label={t('playerStats.increaseGoals', 'Increase goals')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setEditGoals(v => (Number(v) || 0) + 1)}>+</button>
                          </div>
                        </div>
                        <div>
                          <label className={labelStyle}>{t('playerStats.assists', 'Assists')}</label>
                          <div className="flex items-center gap-2">
                            <button type="button" aria-label={t('playerStats.decreaseAssists', 'Decrease assists')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setEditAssists(v => Math.max(0, (Number(v) || 0) - 1))}>-</button>
                            <input type="tel" inputMode="numeric" pattern="[0-9]*" value={String(editAssists)} onChange={e => setEditAssists(Math.max(0, parseInt(e.target.value || '0', 10)))} className={`${inputBaseStyle} flex-1 min-w-0 text-center`} min="0" />
                            <button type="button" aria-label={t('playerStats.increaseAssists', 'Increase assists')} className={`${secondaryButtonStyle} min-w-12 px-0 text-xl`} onClick={() => setEditAssists(v => (Number(v) || 0) + 1)}>+</button>
                          </div>
                        </div>
                        <div>
                          <ModalSwitch
                            checked={editFairPlayCards > 0}
                            onToggle={() => setEditFairPlayCards(editFairPlayCards > 0 ? 0 : 1)}
                          >
                            <span className="inline-flex items-center gap-2">
                              {t('playerStats.receivedFairPlayCard', 'Received Fair Play Card')}
                              <span className="inline-flex items-center rounded-full bg-win/[0.14] px-2 py-0.5 text-xs font-bold text-win">FP</span>
                            </span>
                          </ModalSwitch>
                        </div>
                        <ExternalGameScopeFields
                          player={player}
                          prefix={`edit-${a.id}`}
                          positions={editScope.state.positions}
                          onPositions={editScope.setPositions}
                          gameType={editScope.state.gameType}
                          onGameType={editScope.setGameType}
                          gender={editScope.state.gender}
                          onGender={editScope.setGender}
                          ageGroup={editScope.state.ageGroup}
                          onAgeGroup={editScope.setAgeGroup}
                          fallbackGameType={selectedGameTypeFilter && selectedGameTypeFilter !== 'all' ? selectedGameTypeFilter : 'soccer'}
                        />
                        <div className="lg:col-span-3">
                          <ModalSwitch
                            checked={editIncludeInSeasonTournament}
                            onToggle={() => setEditIncludeInSeasonTournament(v => !v)}
                          >
                            {t('playerStats.includeInSeasonTournament', 'Include in league/tournament statistics')}
                          </ModalSwitch>
                          <p className={`${fieldHintStyle} ml-1`}>
                            {t('playerStats.includeInSeasonTournamentHelp', 'Check this if the game was played for the same team')}
                          </p>
                        </div>
                        <div className="lg:col-span-3">
                          <label className={labelStyle}>{t('playerStats.note', 'Note')}</label>
                          <input type="text" value={editNote} onChange={e => setEditNote(e.target.value)} className={inputBaseStyle} placeholder={t('playerStats.noteOptional', 'Optional note about this game') as string} />
                        </div>
                        <div className="lg:col-span-3 flex justify-end gap-3 pt-2">
                          <button type="button" onClick={() => setEditingAdjId(null)} className={secondaryButtonStyle}>{t('common.cancel', 'Cancel')}</button>
                          <button type="submit" className={primaryButtonStyle}>{t('common.save', 'Save')}</button>
                        </div>
                      </form>
                    );
                  }

                  // Determine result for the colored strip
                  const getAdjustmentResult = (): 'W' | 'L' | 'D' | 'N/A' => {
                    if (typeof a.scoreFor !== 'number' || typeof a.scoreAgainst !== 'number') return 'N/A';
                    if (a.scoreFor > a.scoreAgainst) return 'W';
                    if (a.scoreFor < a.scoreAgainst) return 'L';
                    return 'D';
                  };
                  const adjResult = getAdjustmentResult();

                  const counted = isCounted(a.id);

                  return (
                    <div
                      key={a.id}
                      data-testid={counted ? 'external-game-counted' : 'external-game-uncounted'}
                      className={`relative s1-list p-4 font-ui overflow-hidden ${counted ? '' : 'opacity-50'}`}
                    >
                      {!counted && (
                        <p className="pl-2 mb-1 text-[13px] font-medium text-ink-3">
                          {t('playerStats.adjustmentNotCounted', 'Not counted under the current filters')}
                        </p>
                      )}
                      {/* Result color strip */}
                      <span className={`absolute inset-y-0 left-0 w-1 ${getResultClass(adjResult)}`}></span>

                      {/* Card layout with two rows */}
                      <div className="flex flex-col gap-2">
                        {/* Top row: Match info and stats */}
                        <div className="flex justify-between items-start">
                          {/* Left side: Match info */}
                          <div className="flex-1 pl-2">
                            <p className="font-semibold text-ink">
                              {scoreDisplay ? scoreDisplay : <>{extName} {t('playerStats.vs', 'vs')} {oppName}</>}
                            </p>
                            {/* Note if present */}
                            {a.note && (
                              <p className="text-sm text-ink-2 italic mt-1">&ldquo;{a.note}&rdquo;</p>
                            )}
                          </div>

                          {/* Right side: Stats and actions */}
                          <div className="flex items-center gap-2">
                            {/* Stats */}
                            <div className="flex items-center">
                              <div className="text-center mx-2">
                                <p className={`font-display text-2xl font-bold italic ${a.goalsDelta > 0 ? 'text-win' : 'text-ink-2'}`}>{a.goalsDelta}</p>
                                <p className="text-[13px] text-ink-3">{t('playerStats.goals', 'Goals')}</p>
                              </div>
                              <div className="text-center mx-2">
                                <p className={`font-display text-2xl font-bold italic ${a.assistsDelta > 0 ? 'text-win' : 'text-ink-2'}`}>{a.assistsDelta}</p>
                                <p className="text-[13px] text-ink-3">{t('playerStats.assists', 'Assists')}</p>
                              </div>
                            </div>

                            {/* Actions menu */}
                            <div className="shrink-0 relative actions-menu-container">
                              <button
                                type="button"
                                className={iconButtonEditStyle}
                                onClick={() => setShowActionsMenu(showActionsMenu === a.id ? null : a.id)}
                                aria-label={t('common.actions', 'Actions')}
                                aria-haspopup="menu"
                                aria-expanded={showActionsMenu === a.id}
                              >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-ink-3">
                                  <circle cx="8" cy="2.5" r="1.5"/>
                                  <circle cx="8" cy="8" r="1.5"/>
                                  <circle cx="8" cy="13.5" r="1.5"/>
                                </svg>
                              </button>
                              {showActionsMenu === a.id && (
                                <div role="menu" className={`${popoverMenuStyle} top-full mt-1`}>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className={popoverItemStyle}
                                    onClick={() => {
                                      setShowAdjForm(false); // Close add form when editing
                                      setEditingAdjId(a.id);
                                      setEditGames(a.gamesPlayedDelta);
                                      setEditGoals(a.goalsDelta);
                                      setEditAssists(a.assistsDelta);
                                      setEditFairPlayCards(a.fairPlayCardsDelta || 0);
                                      setEditNote(a.note || '');
                                      setEditHomeAway(a.homeOrAway || 'neutral');
                                      setEditExternalTeam(a.externalTeamName || '');
                                      setEditOpponentName(a.opponentName || '');
                                      setEditSeasonId(a.seasonId || '');
                                      setEditTournamentId(a.tournamentId || '');
                                      setEditTeamId(a.teamId || '');
                                      setEditGameDate(a.gameDate || '');
                                      setEditScoreFor(typeof a.scoreFor === 'number' ? a.scoreFor : '');
                                      setEditScoreAgainst(typeof a.scoreAgainst === 'number' ? a.scoreAgainst : '');
                                      setEditIncludeInSeasonTournament(a.includeInSeasonTournament || false);
                                      // The row's own values count as the coach's; the link it already has fills nothing on open.
                                      seedEditAdoption(a.opponentName ?? '', a.externalTeamName ?? '');
                                      editScope.reset({
                                        positions: a.positions ?? [], gameType: a.gameType ?? '', gender: a.gender ?? '', ageGroup: a.ageGroup ?? '',
                                        auto: scopeOf(a.teamId ?? '', a.seasonId ?? '', a.tournamentId ?? ''),
                                        manual: { gameType: !!a.gameType, gender: !!a.gender, ageGroup: !!a.ageGroup },
                                      });
                                      setShowActionsMenu(null);
                                    }}
                                  >
                                    {t('common.edit', 'Edit')}
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className={`${popoverItemStyle} text-red-400! hover:bg-red-500/10!`}
                                    onClick={() => {
                                      setShowDeleteConfirm(a.id);
                                      setShowActionsMenu(null);
                                    }}
                                  >
                                    {t('common.delete', 'Delete')}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Bottom row: Date left, category labels right */}
                        <div className="flex items-end justify-between gap-4 pl-2 text-[13px]">
                          {/* Left: Date */}
                          <p className="text-ink-3">{dateText}</p>

                          {/* Right: Category labels */}
                          <div className="flex flex-wrap-reverse justify-end content-end gap-1.5">
                            <span className="inline-flex items-center gap-1.5 h-[26px] px-[11px] rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] font-ui text-xs font-semibold text-ink-2" title={t('playerStats.externalGame', 'Added game')}>
                              <span className={`w-1.5 h-1.5 rounded-full ${ENTITY_DOT.tournament}`}></span>
                              {t('playerStats.external', 'ADDED')}
                            </span>
                            {(a.positions ?? []).length > 0 && (
                              <span className="inline-flex items-center gap-1.5 h-[26px] px-[11px] rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] font-ui text-xs font-semibold text-ink-2" title={t('playerStats.positionsLabel', 'Positions played')}>
                                {(a.positions ?? []).map(id => t(`playingPositions.${id}.abbrev` as TranslationKey, id.toUpperCase())).join(' · ')}
                              </span>
                            )}
                            {(a.gameType || a.ageGroup) && (
                              <span className="inline-flex items-center gap-1.5 h-[26px] px-[11px] rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] font-ui text-xs font-semibold text-ink-2">
                                {[a.gameType ? t(a.gameType === 'futsal' ? 'common.gameTypeFutsal' : 'common.gameTypeSoccer', a.gameType) : null, a.ageGroup ?? null].filter(Boolean).join(' · ')}
                              </span>
                            )}
                            {seasonName && (
                              <span className="inline-flex items-center gap-1.5 h-[26px] px-[11px] rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] font-ui text-xs font-semibold text-ink-2" title={seasonName}>
                                <span className={`w-1.5 h-1.5 rounded-full ${ENTITY_DOT.season}`}></span>
                                {seasonName}
                              </span>
                            )}
                            {tournamentName && (
                              <span className="inline-flex items-center gap-1.5 h-[26px] px-[11px] rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] font-ui text-xs font-semibold text-ink-2" title={tournamentName}>
                                <span className={`w-1.5 h-1.5 rounded-full ${ENTITY_DOT.series}`}></span>
                                {tournamentName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <ConfirmationModal
          isOpen={showDeleteConfirm !== null}
          title={t('common.confirmDelete', 'Are you sure you want to delete this item?')}
          message={t('playerStats.deleteConfirmMessage', 'Delete this added game? This action cannot be undone.')}
          onConfirm={async () => {
            if (!player || !showDeleteConfirm) return;
            try {
              const success = await deletePlayerAdjustment(player.id, showDeleteConfirm, userId);
              if (success) {
                setAdjustments(prev => prev.filter(a => a.id !== showDeleteConfirm));
                setShowDeleteConfirm(null);
              } else {
                showToast(t('playerStats.deleteError', 'Failed to delete the added game.'), 'error');
              }
            } catch (error) {
              logger.error('[PlayerStatsView] Failed to delete external game', { error });
              showToast(t('playerStats.deleteError', 'Failed to delete the added game.'), 'error');
            }
          }}
          onCancel={() => setShowDeleteConfirm(null)}
          confirmLabel={t('common.delete', 'Delete')}
          variant="danger"
        />
    </>
  );
};

export default ExternalGamesSection;
