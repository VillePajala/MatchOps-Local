"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import type { ScheduledSub } from "@/types/game";

export interface ScheduledSubBannerProps {
  /** The scheduled sub currently being prompted. Banner is hidden when null/undefined. */
  prompt: ScheduledSub | null | undefined;
  /** Resolved display name for the player going off. Falls back to player id. */
  outPlayerName?: string;
  /** Resolved display name for the player coming on. Falls back to player id. */
  inPlayerName?: string;
  /** Coach taps Apply → parent should dispatch APPLY_SCHEDULED_SUB. */
  onApply: () => void;
  /** Coach taps Skip → parent should dispatch SKIP_SCHEDULED_SUB. */
  onSkip: () => void;
}

const ScheduledSubBanner: React.FC<ScheduledSubBannerProps> = ({
  prompt,
  outPlayerName,
  inPlayerName,
  onApply,
  onSkip,
}) => {
  const { t } = useTranslation();

  if (!prompt) return null;

  const outName = outPlayerName ?? prompt.outPlayer;
  const inName = inPlayerName ?? prompt.inPlayer;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        width: "min(860px, calc(100vw - 24px))",
        pointerEvents: "auto",
        animation: "fadeSlideIn 0.3s ease-out",
      }}
      className="font-display"
    >
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/85 border border-amber-300/30 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md ring-1 ring-inset ring-amber-300/20">
        <div className="absolute left-1/2 top-0 h-[3px] w-[55%] max-w-[480px] -translate-x-1/2 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 opacity-90" />
        <div className="relative flex flex-col items-center gap-3 px-5 py-3.5 text-center">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold tracking-tight text-amber-100">
              {t("scheduledSubBanner.title", "Planned substitution")}
            </p>
            <p className="text-base leading-relaxed text-white">
              {t("scheduledSubBanner.summary", "OUT {{outName}} / IN {{inName}}", {
                outName,
                inName,
              })}
            </p>
            <p className="text-xs leading-relaxed text-slate-200/90">
              {t("scheduledSubBanner.atRole", "at {{role}}", {
                role: prompt.positionRole,
              })}
            </p>
          </div>

          <div className="mt-1 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onApply}
              className="rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 px-5 py-2 text-xs md:text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition duration-150 hover:brightness-110 hover:shadow-[0_10px_28px_rgba(16,185,129,0.35)] active:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 focus:ring-offset-slate-900"
            >
              {t("scheduledSubBanner.applyButton", "Apply")}
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-full bg-slate-700/70 px-5 py-2 text-xs md:text-sm font-semibold text-slate-100 shadow-lg shadow-slate-900/40 transition duration-150 hover:bg-slate-600 active:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 focus:ring-offset-slate-900"
            >
              {t("scheduledSubBanner.skipButton", "Skip")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduledSubBanner;
