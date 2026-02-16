"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineXMark } from "react-icons/hi2";
import type { UpdatePhase } from "./ServiceWorkerRegistration";

interface UpdateBannerProps {
  phase: UpdatePhase;
  onInstall: () => void;
  onReload: () => void;
  onDismiss?: () => void;
  notes?: string;
}

const UpdateBanner: React.FC<UpdateBannerProps> = ({ phase, onInstall, onReload, onDismiss, notes }) => {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const handleDismiss = () => {
    setHidden(true);
    onDismiss?.();
  };

  // Determine button text and action based on phase
  const getButtonConfig = () => {
    switch (phase) {
      case 'installing':
        return {
          text: t("updateBanner.installingButton", "Asennetaan..."),
          onClick: () => {}, // No-op while installing
          disabled: true,
        };
      case 'ready':
        return {
          text: t("updateBanner.reloadButton", "Lataa uudelleen"),
          onClick: onReload,
          disabled: false,
        };
      case 'available':
      default:
        return {
          text: t("updateBanner.installButton", "Asenna päivitys"),
          onClick: onInstall,
          disabled: false,
        };
    }
  };

  const buttonConfig = getButtonConfig();

  return (
    <div
      style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(860px, calc(100vw - 24px))',
        pointerEvents: 'auto',
        animation: 'fadeSlideIn 0.3s ease-out',
      }}
      className="font-display"
    >
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/75 border border-white/12 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md ring-1 ring-inset ring-white/8">
        <div className="absolute left-1/2 top-0 h-[3px] w-[55%] max-w-[480px] -translate-x-1/2 bg-gradient-to-r from-sky-400 via-indigo-400 to-fuchsia-500 opacity-85" />
        <div className="absolute -right-24 -top-24 h-48 w-48 rounded-full bg-indigo-500/15 blur-3xl" aria-hidden="true" />

        <div className="relative flex flex-col items-center gap-3 px-5 py-3.5 text-center">
          <button
            onClick={handleDismiss}
            className="absolute top-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full text-slate-200 transition hover:bg-white/6 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 focus:ring-offset-slate-900"
            aria-label={t("updateBanner.dismissButton", "Dismiss update")}
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>

          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold tracking-tight text-white">
              {phase === 'ready'
                ? t("updateBanner.readyTitle", "Päivitys valmis")
                : t("updateBanner.title", "Päivitys saatavilla")}
            </p>
            <p className="text-xs leading-relaxed text-slate-200/90">
              {phase === 'ready'
                ? t("updateBanner.readyMessage", "Lataa sivu uudelleen ottaaksesi päivityksen käyttöön.")
                : t("updateBanner.message", "Uusia ominaisuuksia ja parannuksia.")}
            </p>
            {notes && phase !== 'ready' ? (
              <p className="mt-1 text-xs font-medium text-sky-100/90">
                {notes}
              </p>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-center">
            <button
              onClick={buttonConfig.onClick}
              disabled={buttonConfig.disabled}
              className={`rounded-full bg-gradient-to-r from-indigo-400 via-indigo-500 to-fuchsia-500 px-5 py-2 text-xs md:text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-400 focus:ring-offset-slate-900 ${
                buttonConfig.disabled
                  ? 'opacity-60 cursor-not-allowed'
                  : 'hover:brightness-110 hover:shadow-[0_10px_28px_rgba(99,102,241,0.35)] active:brightness-95'
              }`}
            >
              {buttonConfig.text}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateBanner;
