"use client";

import React from "react";
import { useTranslation } from "react-i18next";

/**
 * Banner shown while the app runs offline on a cached session (auth grace period).
 *
 * It is rendered as a direct child of <body>, so the global `body > div` rule in
 * globals.css (height: 100%) applies to it. Without an override the fixed banner
 * becomes full-screen and swallows every tap, which made the app unusable offline at
 * the pitch. The override must be an inline style: Tailwind 4 utilities live in a
 * cascade layer, and the unlayered global rule beats any layered class (an `h-auto`
 * class was measured at 844px in a real browser). z-40 matches the ControlBar:
 * visible during normal use, below modals (z-[60]) and the sidebar (z-50).
 */
export default function OfflineGraceBanner() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      data-testid="offline-grace-banner"
      className="fixed top-0 left-0 right-0 z-40 bg-amber-500/90 text-slate-900 px-4 py-2 text-sm text-center font-medium"
      style={{ height: 'auto' }}
    >
      {t('page.offlineGracePeriod', 'Offline — changes saved locally, will sync when connected')}
    </div>
  );
}
