"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlinePencil, HiOutlineTrash } from "react-icons/hi2";
import type { Player } from "@/types";
import type { ScheduledSub, ScheduledSubStatus } from "@/types/game";

export interface ScheduledSubsSectionProps {
  /** All scheduled subs currently on the game. */
  subs: ScheduledSub[];
  /** Roster used to populate the OUT/IN dropdowns. */
  availablePlayers: Player[];
  /** Add a new sub. Parent constructs the id and dispatches ADD_SCHEDULED_SUB. */
  onAdd: (sub: Omit<ScheduledSub, "id" | "status">) => void;
  /** Update an existing sub by id. */
  onUpdate: (sub: ScheduledSub) => void;
  /** Delete a sub by id. */
  onDelete: (id: string) => void;
}

interface DraftSub {
  outPlayer: string;
  inPlayer: string;
  positionRole: string;
  /** Minutes input (whole minutes — converted to seconds on save). */
  minutes: string;
}

const emptyDraft: DraftSub = {
  outPlayer: "",
  inPlayer: "",
  positionRole: "",
  minutes: "",
};

const formatMMSS = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const draftIsValid = (d: DraftSub): boolean => {
  if (!d.outPlayer || !d.inPlayer || !d.positionRole) return false;
  if (d.outPlayer === d.inPlayer) return false;
  const m = Number.parseInt(d.minutes, 10);
  return Number.isFinite(m) && m >= 0;
};

const ScheduledSubsSection: React.FC<ScheduledSubsSectionProps> = ({
  subs,
  availablePlayers,
  onAdd,
  onUpdate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSub>(emptyDraft);

  const startAdd = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setShowForm(true);
  };

  const startEdit = (sub: ScheduledSub) => {
    setEditingId(sub.id);
    setDraft({
      outPlayer: sub.outPlayer,
      inPlayer: sub.inPlayer,
      positionRole: sub.positionRole,
      minutes: Math.floor(sub.timeSeconds / 60).toString(),
    });
    setShowForm(true);
  };

  const cancel = () => {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const save = () => {
    if (!draftIsValid(draft)) return;
    const minutes = Number.parseInt(draft.minutes, 10);
    const timeSeconds = minutes * 60;
    if (editingId) {
      const existing = subs.find((s) => s.id === editingId);
      if (!existing) return;
      onUpdate({
        ...existing,
        outPlayer: draft.outPlayer,
        inPlayer: draft.inPlayer,
        positionRole: draft.positionRole,
        timeSeconds,
      });
    } else {
      onAdd({
        timeSeconds,
        outPlayer: draft.outPlayer,
        inPlayer: draft.inPlayer,
        positionRole: draft.positionRole,
      });
    }
    cancel();
  };

  const playerName = (id: string): string =>
    availablePlayers.find((p) => p.id === id)?.name ?? id;

  const statusLabel = (status: ScheduledSubStatus): string => {
    switch (status) {
      case "fired":
        return t("scheduledSubsSection.statusFired", "Applied");
      case "skipped":
        return t("scheduledSubsSection.statusSkipped", "Skipped");
      case "pending":
      default:
        return t("scheduledSubsSection.statusPending", "Pending");
    }
  };

  return (
    <section aria-label={t("scheduledSubsSection.heading", "Scheduled substitutions")}>
      <h3 className="mb-2 text-sm font-semibold text-amber-200">
        {t("scheduledSubsSection.heading", "Scheduled substitutions")}
      </h3>

      {subs.length === 0 ? (
        <p className="mb-3 text-xs text-slate-400">
          {t("scheduledSubsSection.empty", "No scheduled substitutions yet.")}
        </p>
      ) : (
        <ul className="mb-3 space-y-1">
          {subs.map((sub) => {
            const minutes = Math.floor(sub.timeSeconds / 60);
            const seconds = sub.timeSeconds % 60;
            return (
              <li
                key={sub.id}
                className="flex items-center justify-between gap-2 rounded-md bg-slate-800/40 px-3 py-2 text-sm text-slate-100"
                data-testid={`scheduled-sub-row-${sub.id}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {t(
                    "scheduledSubsSection.rowSummary",
                    "{{minutes}}:{{seconds}} — OUT {{outName}} / IN {{inName}} at {{role}}",
                    {
                      minutes,
                      seconds: seconds.toString().padStart(2, "0"),
                      outName: playerName(sub.outPlayer),
                      inName: playerName(sub.inPlayer),
                      role: sub.positionRole,
                    },
                  )}
                </span>
                <span className="flex-shrink-0 rounded-full bg-slate-700/70 px-2 py-0.5 text-xs text-slate-200">
                  {statusLabel(sub.status)}
                </span>
                <button
                  type="button"
                  className="flex-shrink-0 rounded-md p-1 text-slate-200 hover:bg-slate-700/60"
                  aria-label={t("scheduledSubsSection.editButton", "Edit") + ` ${formatMMSS(sub.timeSeconds)}`}
                  onClick={() => startEdit(sub)}
                  disabled={sub.status !== "pending"}
                >
                  <HiOutlinePencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="flex-shrink-0 rounded-md p-1 text-rose-300 hover:bg-rose-900/40"
                  aria-label={t("scheduledSubsSection.deleteButton", "Delete") + ` ${formatMMSS(sub.timeSeconds)}`}
                  onClick={() => onDelete(sub.id)}
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!showForm && (
        <button
          type="button"
          onClick={startAdd}
          className="rounded-md bg-amber-500/80 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow hover:bg-amber-400"
        >
          {t("scheduledSubsSection.addButton", "Add scheduled sub")}
        </button>
      )}

      {showForm && (
        <div className="space-y-2 rounded-md bg-slate-800/60 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-slate-300">
              {t("scheduledSubsSection.outLabel", "Out")}
              <select
                value={draft.outPlayer}
                onChange={(e) => setDraft({ ...draft, outPlayer: e.target.value })}
                className="mt-1 w-full rounded bg-slate-900 px-2 py-1 text-sm text-slate-100"
              >
                <option value="">—</option>
                {availablePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-300">
              {t("scheduledSubsSection.inLabel", "In")}
              <select
                value={draft.inPlayer}
                onChange={(e) => setDraft({ ...draft, inPlayer: e.target.value })}
                className="mt-1 w-full rounded bg-slate-900 px-2 py-1 text-sm text-slate-100"
              >
                <option value="">—</option>
                {availablePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-300">
              {t("scheduledSubsSection.roleLabel", "Role / position")}
              <input
                type="text"
                value={draft.positionRole}
                onChange={(e) => setDraft({ ...draft, positionRole: e.target.value })}
                placeholder="CDM"
                className="mt-1 w-full rounded bg-slate-900 px-2 py-1 text-sm text-slate-100"
              />
            </label>
            <label className="block text-xs text-slate-300">
              {t("scheduledSubsSection.timeLabel", "Time (minutes)")}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.minutes}
                onChange={(e) => setDraft({ ...draft, minutes: e.target.value })}
                className="mt-1 w-full rounded bg-slate-900 px-2 py-1 text-sm text-slate-100"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={cancel}
              className="rounded-md bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600"
            >
              {t("scheduledSubsSection.cancelButton", "Cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!draftIsValid(draft)}
              className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-900 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("scheduledSubsSection.saveButton", "Save")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default ScheduledSubsSection;
