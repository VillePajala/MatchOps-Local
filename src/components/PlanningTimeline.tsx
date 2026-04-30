'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineCheck,
  HiOutlineXMark,
} from 'react-icons/hi2';
import type { Player } from '@/types';
import type { FormationPreset } from '@/config/formationPresets';
import type {
  DraftScheduledSub,
  PlanDraft,
  PlayerId,
  RoleName,
} from '@/utils/planSwapEngine';
import {
  computePlayerSeconds,
  getRoleSegments,
} from '@/utils/planFairness';

export interface PlanningTimelineProps {
  draft: PlanDraft;
  preset: FormationPreset;
  roster: Player[];
  /**
   * Total game duration in seconds. The form's add/edit guard treats
   * this as the upper bound for sub time. When multiple games are
   * selected with mixed durations the caller passes the MINIMUM
   * across them so the form can't accept a time invalid for a
   * shorter game; per-game enforcement happens separately at Apply
   * time via applyDraftToGame's gameDurationSec arg.
   */
  gameDurationSec: number;
  onAddSub: (sub: DraftScheduledSub) => void;
  onUpdateSub: (subId: string, updates: Partial<DraftScheduledSub>) => void;
  onRemoveSub: (subId: string) => void;
  /** Disable all interactions (e.g. while applying or during a banner). */
  disabled?: boolean;
}

const newSubId = (): string => `s_${crypto.randomUUID()}`;

const formatMMSS = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
};

const parseMMSS = (text: string): number | null => {
  // Strict MM:SS — accept "M:SS" (single-digit minutes) but require
  // exactly two digits for seconds to match the placeholder + error
  // copy. "10:5" was previously accepted as 10:05; that's surprising.
  const m = text.trim().match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (sec >= 60) return null;
  return min * 60 + sec;
};

interface SubFormState {
  /** Empty when adding; sub.id when editing. */
  subId: string | null;
  timeText: string;
  positionRole: RoleName;
  inPlayer: PlayerId;
}

const PlanningTimeline: React.FC<PlanningTimelineProps> = ({
  draft,
  preset,
  roster,
  gameDurationSec,
  onAddSub,
  onUpdateSub,
  onRemoveSub,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<SubFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const rosterMap = useMemo(() => {
    const m = new Map<PlayerId, Player>();
    for (const p of roster) m.set(p.id, p);
    return m;
  }, [roster]);

  const playerLabel = useCallback(
    (id: PlayerId): string => {
      const p = rosterMap.get(id);
      if (!p) return id;
      return p.nickname || p.name || id;
    },
    [rosterMap],
  );

  // Sort subs ascending by time for stable render order. The draft
  // already maintains this invariant on every mutation, but the sort
  // here is defensive against an out-of-order source.
  const sortedSubs = useMemo(
    () => [...draft.scheduledSubs].sort((a, b) => a.timeSeconds - b.timeSeconds),
    [draft.scheduledSubs],
  );

  const minutes = useMemo(
    () => computePlayerSeconds(draft, gameDurationSec),
    [draft, gameDurationSec],
  );

  // Roles available for sub assignment: any role currently in the
  // starting XI (you can't sub into an empty slot via the timeline —
  // assign someone via the pitch first).
  const assignedRoles = useMemo(
    () =>
      (preset.roles ?? [])
        .map((r) => r.name)
        .filter((name) => Boolean(draft.startingXI[name])),
    [preset, draft.startingXI],
  );

  // When editing a sub, exclude it from segment computation so the
  // outPlayer resolves to the pre-sub occupant, not the sub's own
  // inPlayer (Codex P1).
  const draftWithoutSub = useCallback(
    (excludeSubId: string | null): PlanDraft => {
      if (excludeSubId === null) return draft;
      return {
        ...draft,
        scheduledSubs: draft.scheduledSubs.filter(
          (s) => s.id !== excludeSubId,
        ),
      };
    },
    [draft],
  );

  const playerAtRoleTime = useCallback(
    (
      roleName: RoleName,
      timeSec: number,
      excludeSubId: string | null,
    ): PlayerId | '' => {
      const segs = getRoleSegments(
        draftWithoutSub(excludeSubId),
        roleName,
        gameDurationSec,
      );
      for (const seg of segs) {
        if (timeSec >= seg.startSec && timeSec < seg.endSec) return seg.playerId;
      }
      const last = segs[segs.length - 1];
      return last ? last.playerId : '';
    },
    [draftWithoutSub, gameDurationSec],
  );

  // Excludes the current occupant (no-op self-sub) and players on the
  // field at another role at that time (double-position guard).
  const eligibleInPlayers = useCallback(
    (
      roleName: RoleName,
      timeSec: number,
      excludeSubId: string | null,
    ): Player[] => {
      if (!roleName) return [];
      const draftForSegs = draftWithoutSub(excludeSubId);
      const onFieldElsewhere = new Set<PlayerId>();
      for (const r of preset.roles ?? []) {
        if (r.name === roleName) continue;
        const segs = getRoleSegments(draftForSegs, r.name, gameDurationSec);
        for (const seg of segs) {
          if (timeSec >= seg.startSec && timeSec < seg.endSec) {
            onFieldElsewhere.add(seg.playerId);
          }
        }
      }
      const currentlyAtRole = playerAtRoleTime(roleName, timeSec, excludeSubId);
      return roster.filter(
        (p) => !onFieldElsewhere.has(p.id) && p.id !== currentlyAtRole,
      );
    },
    [
      draftWithoutSub,
      gameDurationSec,
      preset,
      roster,
      playerAtRoleTime,
    ],
  );

  const openAddForm = () => {
    setFormError(null);
    setForm({
      subId: null,
      timeText: '00:00',
      positionRole: assignedRoles[0] ?? '',
      inPlayer: '',
    });
  };

  const openEditForm = (sub: DraftScheduledSub) => {
    setFormError(null);
    setForm({
      subId: sub.id,
      timeText: formatMMSS(sub.timeSeconds),
      positionRole: sub.positionRole,
      inPlayer: sub.inPlayer,
    });
  };

  const closeForm = () => {
    setForm(null);
    setFormError(null);
  };

  // Hide (don't disable) while `disabled` is true. Otherwise an open
  // form's Save/Cancel buttons would be inert and the coach would be
  // stuck. State survives the cycle so re-enabling restores the form.
  const formVisible = form !== null && !disabled;

  const submitForm = () => {
    if (!form) return;
    const timeSec = parseMMSS(form.timeText);
    if (timeSec === null) {
      setFormError(t('planningTimeline.errBadTime', 'Invalid time. Use MM:SS.'));
      return;
    }
    if (timeSec >= gameDurationSec) {
      // ===: a sub at exactly game-end fires after the timer stops; the
      // incoming player would play 0 seconds. Treat as out-of-range.
      setFormError(
        t(
          'planningTimeline.errTimeOutOfRange',
          'Time must be between 00:00 and the game duration.',
        ),
      );
      return;
    }
    if (!form.positionRole) {
      setFormError(t('planningTimeline.errNoRole', 'Pick a role.'));
      return;
    }
    if (!form.inPlayer) {
      setFormError(t('planningTimeline.errNoPlayer', 'Pick a player.'));
      return;
    }
    const outPlayer = playerAtRoleTime(form.positionRole, timeSec, form.subId);
    if (!outPlayer) {
      setFormError(
        t(
          'planningTimeline.errNoOccupant',
          "No player at that role at that time. Assign one via the pitch first.",
        ),
      );
      return;
    }
    if (outPlayer === form.inPlayer) {
      setFormError(
        t(
          'planningTimeline.errSelfSub',
          'The chosen player is already at that role at that time.',
        ),
      );
      return;
    }
    // Re-check the double-position guard at submit time. The "in"
    // dropdown filters by current state, but a pitch swap concurrent
    // with the form (form open while user taps the pitch) can place
    // the picked player on field at another role. Without this guard
    // the persisted sub would put a player at two positions
    // simultaneously.
    const draftForCheck = draftWithoutSub(form.subId);
    for (const r of preset.roles ?? []) {
      if (r.name === form.positionRole) continue;
      const segs = getRoleSegments(draftForCheck, r.name, gameDurationSec);
      const occupied = segs.some(
        (seg) =>
          timeSec >= seg.startSec &&
          timeSec < seg.endSec &&
          seg.playerId === form.inPlayer,
      );
      if (occupied) {
        setFormError(
          t(
            'planningTimeline.errDoublePosition',
            'That player is already on the field at another role at that time.',
          ),
        );
        return;
      }
    }
    if (form.subId) {
      onUpdateSub(form.subId, {
        timeSeconds: timeSec,
        positionRole: form.positionRole,
        inPlayer: form.inPlayer,
      });
    } else {
      onAddSub({
        id: newSubId(),
        timeSeconds: timeSec,
        positionRole: form.positionRole,
        inPlayer: form.inPlayer,
      });
    }
    closeForm();
  };

  // Filter out pure-bench players to keep the panel scannable as
  // rosters grow. Match computePlayerSeconds's referenced-set rule.
  const minuteEntries = useMemo(() => {
    const referenced = new Set<PlayerId>(Object.values(draft.startingXI));
    for (const s of draft.scheduledSubs) {
      referenced.add(s.inPlayer);
    }
    return roster
      .filter((p) => referenced.has(p.id))
      .map((p) => ({
        id: p.id,
        label: playerLabel(p.id),
        seconds: minutes.get(p.id) ?? 0,
      }));
  }, [roster, minutes, playerLabel, draft.startingXI, draft.scheduledSubs]);

  // Recomputed on every keystroke when typing into the time input
  // without memoization; cheap to gate behind useMemo. When the time
  // text is unparseable, return [] so the dropdown empties — falling
  // back to t=0 would show players eligible at game-start, which can
  // mislead the coach into picking someone who's actually invalid at
  // the intended time.
  const eligibleForForm = useMemo(() => {
    if (!form) return [];
    const timeSec = parseMMSS(form.timeText);
    if (timeSec === null) return [];
    return eligibleInPlayers(form.positionRole, timeSec, form.subId);
  }, [form, eligibleInPlayers]);

  return (
    <div className="space-y-3" data-testid="planning-timeline">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs uppercase tracking-wider text-slate-400">
          {t('planningTimeline.title', 'Timeline')}
        </h3>
        <span className="text-[10px] text-slate-500">
          {t('planningTimeline.totalDuration', 'Game length: {{mmss}}', {
            mmss: formatMMSS(gameDurationSec),
          })}
        </span>
      </div>

      {/* Per-player minutes summary */}
      <div
        role="region"
        aria-label={t('planningTimeline.minutesPanel', 'Player minutes')}
        className="grid grid-cols-3 gap-1 text-xs"
        data-testid="planning-timeline-minutes"
      >
        {minuteEntries.map((entry) => (
          <div
            key={entry.id}
            className="flex justify-between rounded-md bg-slate-800/60 px-2 py-1"
            data-testid={`planning-timeline-minutes-${entry.id}`}
          >
            <span className="truncate text-slate-300">{entry.label}</span>
            <span className="font-mono text-slate-200">
              {formatMMSS(entry.seconds)}
            </span>
          </div>
        ))}
      </div>

      {/* Sub list */}
      <div data-testid="planning-timeline-subs" className="space-y-1">
        {sortedSubs.length === 0 ? (
          <p className="text-xs italic text-slate-500">
            {t(
              'planningTimeline.empty',
              'No scheduled subs yet. Press “Add sub” to schedule one.',
            )}
          </p>
        ) : (
          sortedSubs.map((sub) => {
            // Excluding the sub itself prevents the trivial
            // "out resolves to its own inPlayer" loop.
            const outPlayer = playerAtRoleTime(
              sub.positionRole,
              sub.timeSeconds,
              sub.id,
            );
            return (
              <div
                key={sub.id}
                data-testid={`planning-timeline-sub-${sub.id}`}
                className="flex items-center justify-between gap-2 rounded-md bg-slate-800/60 px-2 py-1.5 text-sm"
              >
                <span className="font-mono text-slate-300">
                  {formatMMSS(sub.timeSeconds)}
                </span>
                <span className="text-slate-400">{sub.positionRole}</span>
                <span className="flex-1 truncate text-slate-100">
                  {outPlayer ? playerLabel(outPlayer) : '—'} → {playerLabel(sub.inPlayer)}
                </span>
                <button
                  type="button"
                  onClick={() => openEditForm(sub)}
                  disabled={disabled}
                  aria-label={t('planningTimeline.editSub', 'Edit sub')}
                  data-testid={`planning-timeline-sub-edit-${sub.id}`}
                  className="rounded p-1 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                >
                  <HiOutlinePencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSub(sub.id)}
                  disabled={disabled}
                  aria-label={t('planningTimeline.removeSub', 'Remove sub')}
                  data-testid={`planning-timeline-sub-remove-${sub.id}`}
                  className="rounded p-1 text-rose-300 hover:bg-rose-900/40 disabled:opacity-50"
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add/edit form (inline, controlled) */}
      {formVisible && form ? (
        <div
          className="space-y-2 rounded-md border border-slate-700 bg-slate-900/70 p-3"
          data-testid="planning-timeline-form"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs text-slate-400">
              {t('planningTimeline.time', 'Time (mm:ss)')}
              <input
                type="text"
                value={form.timeText}
                onChange={(e) =>
                  setForm((f) => {
                    if (!f) return f;
                    const next = e.target.value;
                    const timeSec = parseMMSS(next);
                    // Eligibility depends on (role, time). Keep the
                    // previous inPlayer if it's still eligible at the
                    // new time so a one-second tweak doesn't force a
                    // re-pick; clear it otherwise so the empty-player
                    // guard can fire.
                    const stillEligible =
                      timeSec !== null &&
                      eligibleInPlayers(f.positionRole, timeSec, f.subId).some(
                        (p) => p.id === f.inPlayer,
                      );
                    return {
                      ...f,
                      timeText: next,
                      inPlayer: stillEligible ? f.inPlayer : '',
                    };
                  })
                }
                disabled={disabled}
                placeholder="00:00"
                data-testid="planning-timeline-form-time"
                className="mt-0.5 w-full rounded bg-slate-800 px-2 py-1 font-mono text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-400">
              {t('planningTimeline.role', 'Role')}
              <select
                value={form.positionRole}
                onChange={(e) =>
                  setForm((f) => {
                    if (!f) return f;
                    const nextRole = e.target.value;
                    const timeSec = parseMMSS(f.timeText);
                    const stillEligible =
                      timeSec !== null &&
                      eligibleInPlayers(nextRole, timeSec, f.subId).some(
                        (p) => p.id === f.inPlayer,
                      );
                    return {
                      ...f,
                      positionRole: nextRole,
                      inPlayer: stillEligible ? f.inPlayer : '',
                    };
                  })
                }
                disabled={disabled}
                data-testid="planning-timeline-form-role"
                className="mt-0.5 w-full rounded bg-slate-800 px-2 py-1 text-sm text-slate-100"
              >
                {assignedRoles.length === 0 ? (
                  <option value="">
                    {t('planningTimeline.noRoles', '— no assigned roles —')}
                  </option>
                ) : (
                  assignedRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="text-xs text-slate-400 sm:col-span-2">
              {t('planningTimeline.inPlayer', 'Player coming on')}
              <select
                value={form.inPlayer}
                onChange={(e) =>
                  setForm((f) => f && { ...f, inPlayer: e.target.value })
                }
                disabled={disabled}
                data-testid="planning-timeline-form-in"
                className="mt-0.5 w-full rounded bg-slate-800 px-2 py-1 text-sm text-slate-100"
              >
                <option value="">
                  {t('planningTimeline.pickPlayer', '— pick a player —')}
                </option>
                {eligibleForForm.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname || p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {formError ? (
            <p
              role="alert"
              className="text-xs text-rose-300"
              data-testid="planning-timeline-form-error"
            >
              {formError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              disabled={disabled}
              data-testid="planning-timeline-form-cancel"
              className="inline-flex items-center gap-1 rounded-md bg-slate-700/70 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              <HiOutlineXMark className="h-3 w-3" />
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={submitForm}
              disabled={disabled}
              data-testid="planning-timeline-form-save"
              className="inline-flex items-center gap-1 rounded-md bg-amber-500/90 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
            >
              <HiOutlineCheck className="h-3 w-3" />
              {form.subId
                ? t('common.save', 'Save')
                : t('planningTimeline.addSub', 'Add sub')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openAddForm}
          disabled={disabled || assignedRoles.length === 0}
          data-testid="planning-timeline-add"
          className="inline-flex items-center gap-1 rounded-md bg-slate-700/70 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <HiOutlinePlus className="h-3 w-3" />
          {t('planningTimeline.addSub', 'Add sub')}
        </button>
      )}
    </div>
  );
};

export default PlanningTimeline;
