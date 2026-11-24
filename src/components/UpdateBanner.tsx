"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineXMark } from "react-icons/hi2";
import type { UpdatePhase } from "./ServiceWorkerRegistration";
import { primaryButtonStyle } from "@/styles/modalStyles";

interface UpdateBannerProps {
  phase: UpdatePhase;
  onInstall: () => void;
  onReload: () => void;
  onDismiss?: () => void;
  notes?: string[];
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
    >
      <div className="relative overflow-hidden rounded-2xl bg-surface-2 font-ui shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10),0_16px_32px_-8px_rgb(12_4_13/0.9)]">
        <div className="relative flex flex-col items-center gap-3 px-12 py-4 text-center">
          <button
            onClick={handleDismiss}
            className="absolute top-1.5 right-1.5 flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
            aria-label={t("updateBanner.dismissButton", "Dismiss update")}
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>

          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold tracking-tight text-ink">
              {phase === 'ready'
                ? t("updateBanner.readyTitle", "Päivitys valmis")
                : t("updateBanner.title", "Päivitys saatavilla")}
            </p>
            <p className="text-sm leading-relaxed text-ink-2">
              {phase === 'ready'
                ? t("updateBanner.readyMessage", "Lataa sivu uudelleen ottaaksesi päivityksen käyttöön.")
                : t("updateBanner.message", "Uusia ominaisuuksia ja parannuksia.")}
            </p>
            {notes && notes.length > 0 && phase !== 'ready' ? (
              <ul className="mt-1 inline-block space-y-0.5 text-left text-[13px] font-medium text-ink-2">
                {notes.map((note, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden="true" className="text-ink-3">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-center">
            <button
              onClick={buttonConfig.onClick}
              disabled={buttonConfig.disabled}
              className={primaryButtonStyle}
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
