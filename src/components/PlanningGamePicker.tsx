'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineCheck,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';
import type { AppState } from '@/types/game';

export interface PlanningGamePickerGame {
  id: string;
  /** AppState snapshot (we only read a few fields). */
  game: Pick<
    AppState,
    | 'teamName'
    | 'opponentName'
    | 'gameDate'
    | 'numberOfPeriods'
    | 'periodDurationMinutes'
    | 'teamId'
  >;
}

// Mixed legacy/modern semantics: a game with a teamId is never same-team
// as one without — the missing id signals legacy data of unknown
// provenance. Both-missing falls back to teamName equality.
function sameTeam(
  a: PlanningGamePickerGame,
  b: PlanningGamePickerGame,
): boolean {
  if (a.game.teamId && b.game.teamId) {
    return a.game.teamId === b.game.teamId;
  }
  if (!a.game.teamId && !b.game.teamId) {
    return a.game.teamName === b.game.teamName;
  }
  return false;
}

export interface PlanningGamePickerProps {
  /**
   * Games available for selection. The caller pre-filters to the active
   * team if desired; the picker treats the list as authoritative.
   */
  games: PlanningGamePickerGame[];
  /** "Active" team id — only games matching are eligible (when set). */
  teamFilterId?: string;
  /**
   * Active team's display name. When set alongside `teamFilterId`,
   * legacy games (saved before `teamId` was assigned) match if their
   * `teamName` equals this — otherwise they'd be silently excluded.
   */
  teamFilterName?: string;
  /** "Back" navigation. */
  onBack: () => void;
  /** Called with the chosen game ids when the coach confirms a homogeneous set. */
  onContinue: (gameIds: string[]) => void;
}

function isHomogeneousWith(a: PlanningGamePickerGame, b: PlanningGamePickerGame): boolean {
  return (
    sameTeam(a, b) &&
    a.game.numberOfPeriods === b.game.numberOfPeriods &&
    a.game.periodDurationMinutes === b.game.periodDurationMinutes
  );
}

const PlanningGamePicker: React.FC<PlanningGamePickerProps> = ({
  games,
  teamFilterId,
  teamFilterName,
  onBack,
  onContinue,
}) => {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // When a team filter is active, also include legacy games (no teamId)
  // whose teamName matches the active team — otherwise older saved games
  // disappear silently behind the empty state.
  const eligibleGames = teamFilterId
    ? games.filter(
        (g) =>
          g.game.teamId === teamFilterId ||
          (!g.game.teamId &&
            teamFilterName !== undefined &&
            g.game.teamName === teamFilterName),
      )
    : games;

  // Single source of truth for selection: every downstream consumer
  // (count display, banner gate, validation, onContinue payload) reads
  // off this list, so they can't diverge if `games` refreshes and drops
  // a previously-selected id.
  const eligibleSelected = eligibleGames.filter((g) => selectedIds.has(g.id));

  // Empty selection → invalid but no message; the disabled Continue
  // button is the only signal needed in that state.
  const computeValidation = (): { isValid: boolean; message: string } => {
    if (eligibleSelected.length === 0) {
      return { isValid: false, message: '' };
    }
    const reference = eligibleSelected[0];
    for (const candidate of eligibleSelected.slice(1)) {
      if (!isHomogeneousWith(reference, candidate)) {
        return {
          isValid: false,
          message: t(
            'planningGamePicker.heterogeneousSet',
            'Selected games must share the same team, period count, and period duration. Adjust your selection or plan them separately.',
          ),
        };
      }
    }
    return { isValid: true, message: '' };
  };
  const validation = computeValidation();

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleContinue = () => {
    if (!validation.isValid) return;
    onContinue(eligibleSelected.map((g) => g.id));
  };

  return (
    <div className="space-y-4" data-testid="planning-game-picker">
      <div className="space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-100"
        >
          <HiOutlineArrowLeft className="h-4 w-4" />
          {t('common.backButton', 'Back')}
        </button>
        {/* Below the back row, not inline, so a 320 px-wide phone has
            room for the full sentence without crowding the button. */}
        <p className="text-xs text-slate-400">
          {t(
            'planningGamePicker.subtitle',
            'Pick the games this plan covers. They must share team, period count, and period duration.',
          )}
        </p>
      </div>

      {eligibleGames.length === 0 ? (
        <p className="text-sm text-slate-300 text-center py-6">
          {t(
            'planningGamePicker.empty',
            'No games available for the active team. Save a game first.',
          )}
        </p>
      ) : (
        <ul className="space-y-1 max-h-96 overflow-y-auto pr-1">
          {eligibleGames.map((g) => {
            const checked = selectedIds.has(g.id);
            return (
              <li key={g.id}>
                <label
                  className={`flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer ${
                    checked
                      ? 'bg-amber-500/15 border border-amber-400/40'
                      : 'bg-slate-800/40 border border-slate-700 hover:bg-slate-800/70'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(g.id)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-100 truncate">
                      {g.game.teamName} <span className="text-slate-400">vs</span>{' '}
                      {g.game.opponentName}
                    </span>
                    <span className="block text-xs text-slate-400 truncate">
                      {g.game.gameDate} · {g.game.numberOfPeriods}×
                      {g.game.periodDurationMinutes} min
                    </span>
                  </span>
                  {checked ? (
                    <HiOutlineCheck className="h-4 w-4 text-amber-300 flex-shrink-0" />
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {!validation.isValid && eligibleSelected.length > 1 ? (
        <div
          id="planning-game-picker-validation"
          role="alert"
          className="flex items-start gap-2 rounded-md bg-amber-900/30 border border-amber-700/40 p-3 text-sm text-amber-100"
        >
          <HiOutlineExclamationTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>{validation.message}</p>
        </div>
      ) : null}

      <div className="flex justify-between items-center pt-2">
        <span className="text-xs text-slate-400">
          {t('planningGamePicker.selectedCount', '{{count}} selected', {
            count: eligibleSelected.length,
          })}
        </span>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!validation.isValid}
          aria-describedby={
            !validation.isValid && eligibleSelected.length > 1
              ? 'planning-game-picker-validation'
              : undefined
          }
          className="inline-flex items-center gap-2 rounded-md bg-amber-500/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('planningGamePicker.continueButton', 'Continue')}
          <HiOutlineArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default PlanningGamePicker;
