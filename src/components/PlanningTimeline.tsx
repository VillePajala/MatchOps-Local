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
  computePlayerMinutes,
  getRoleSegments,
} from '@/utils/planFairness';

export interface PlanningTimelineProps {
  draft: PlanDraft;
  preset: FormationPreset;
  roster: Player[];
  /** Total game duration in seconds. Caller derives this from
   * numberOfPeriods × periodDurationMinutes × 60. */
  gameDurationSec: number;
  onAddSub: (sub: DraftScheduledSub) => void;
  onUpdateSub: (subId: string, updates: Partial<DraftScheduledSub>) => void;
  onRemoveSub: (subId: string) => void;
  /** Disable all interactions (e.g. while applying or during a banner). */
  disabled?: boolean;
}

const newSubId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `s_${crypto.randomUUID()}`;
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
};

const formatMMSS = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
};

const parseMMSS = (text: string): number | null => {
  const m = text.trim().match(/^(\d+):(\d{1,2})$/);
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
  inPlayerId: PlayerId;
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
    () => computePlayerMinutes(draft, gameDurationSec),
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

  // Compute the would-be outPlayer at a given (role, time): the player
  // occupying that role just before `timeSeconds`. When editing an
  // existing sub, exclude that sub from the segment computation so the
  // "out" doesn't resolve to the sub's own inPlayer (Codex P1).
  const playerAtRoleTime = useCallback(
    (
      roleName: RoleName,
      timeSec: number,
      excludeSubId: string | null,
    ): PlayerId | '' => {
      const filteredSubs =
        excludeSubId === null
          ? draft.scheduledSubs
          : draft.scheduledSubs.filter((s) => s.id !== excludeSubId);
      const draftForSegs = { ...draft, scheduledSubs: filteredSubs };
      const segs = getRoleSegments(draftForSegs, roleName, gameDurationSec);
      for (const seg of segs) {
        if (timeSec >= seg.startSec && timeSec < seg.endSec) return seg.playerId;
      }
      // timeSec at/past the last segment: fall back to the last occupant.
      const last = segs[segs.length - 1];
      return last ? last.playerId : '';
    },
    [draft, gameDurationSec],
  );

  // Eligible "in" players at (role, time): excludes the current
  // occupant (no-op self-sub) and players on the field at another role
  // at that time (double-position guard, mirroring the standalone
  // planner).
  const eligibleInPlayers = useCallback(
    (
      roleName: RoleName,
      timeSec: number,
      excludeSubId: string | null,
    ): Player[] => {
      if (!roleName) return [];
      const onFieldElsewhere = new Set<PlayerId>();
      for (const r of preset.roles ?? []) {
        if (r.name === roleName) continue;
        const filteredSubs =
          excludeSubId === null
            ? draft.scheduledSubs
            : draft.scheduledSubs.filter((s) => s.id !== excludeSubId);
        const segs = getRoleSegments(
          { ...draft, scheduledSubs: filteredSubs },
          r.name,
          gameDurationSec,
        );
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
    [draft, gameDurationSec, preset, roster, playerAtRoleTime],
  );

  const openAddForm = () => {
    setFormError(null);
    setForm({
      subId: null,
      timeText: '00:00',
      positionRole: assignedRoles[0] ?? '',
      inPlayerId: '',
    });
  };

  const openEditForm = (sub: DraftScheduledSub) => {
    setFormError(null);
    setForm({
      subId: sub.id,
      timeText: formatMMSS(sub.timeSeconds),
      positionRole: sub.positionRole,
      inPlayerId: sub.inPlayer,
    });
  };

  const closeForm = () => {
    setForm(null);
    setFormError(null);
  };

  const submitForm = () => {
    if (!form) return;
    const timeSec = parseMMSS(form.timeText);
    if (timeSec === null) {
      setFormError(t('planningTimeline.errBadTime', 'Invalid time. Use MM:SS.'));
      return;
    }
    if (timeSec > gameDurationSec) {
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
    if (!form.inPlayerId) {
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
    if (outPlayer === form.inPlayerId) {
      setFormError(
        t(
          'planningTimeline.errSelfSub',
          'The chosen player is already at that role at that time.',
        ),
      );
      return;
    }
    if (form.subId) {
      onUpdateSub(form.subId, {
        timeSeconds: timeSec,
        positionRole: form.positionRole,
        inPlayer: form.inPlayerId,
        outPlayer,
      });
    } else {
      onAddSub({
        id: newSubId(),
        timeSeconds: timeSec,
        positionRole: form.positionRole,
        inPlayer: form.inPlayerId,
        outPlayer,
      });
    }
    closeForm();
  };

  const sortedMinutes = useMemo(
    () =>
      roster.map((p) => ({
        id: p.id,
        label: playerLabel(p.id),
        seconds: minutes.get(p.id) ?? 0,
      })),
    [roster, minutes, playerLabel],
  );

  // Recomputed on every keystroke when typing into the time input
  // without memoization; cheap to gate behind useMemo.
  const eligibleForForm = useMemo(
    () =>
      form
        ? eligibleInPlayers(
            form.positionRole,
            parseMMSS(form.timeText) ?? 0,
            form.subId,
          )
        : [],
    [form, eligibleInPlayers],
  );

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
        className="grid grid-cols-3 gap-1 text-xs"
        data-testid="planning-timeline-minutes"
      >
        {sortedMinutes.map((entry) => (
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
          sortedSubs.map((sub) => (
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
                {playerLabel(sub.outPlayer)} → {playerLabel(sub.inPlayer)}
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
          ))
        )}
      </div>

      {/* Add/edit form (inline, controlled) */}
      {form ? (
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
                  setForm((f) =>
                    f && {
                      ...f,
                      timeText: e.target.value,
                      // Eligibility depends on (role, time); a stale
                      // inPlayerId after a time change can sneak past
                      // the empty-player guard.
                      inPlayerId: '',
                    }
                  )
                }
                disabled={disabled}
                inputMode="numeric"
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
                  setForm((f) =>
                    f && {
                      ...f,
                      positionRole: e.target.value,
                      // Eligibility depends on (role, time); reset to
                      // force a fresh pick.
                      inPlayerId: '',
                    }
                  )
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
                value={form.inPlayerId}
                onChange={(e) =>
                  setForm((f) => f && { ...f, inPlayerId: e.target.value })
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
