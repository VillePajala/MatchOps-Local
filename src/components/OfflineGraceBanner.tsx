"use client";

import React from "react";
import { useTranslation } from "react-i18next";

/**
 * Banner shown while the app runs offline on a cached session (auth grace period).
 *
 * History: it was once a direct child of <body>, where a global `body > div` rule
 * (height: 100%; display: flex; flex-direction: column) made the fixed banner
 * full-screen and swallow every tap - the app was unusable offline at the pitch. That
 * rule is now scoped to #app-root (review 10.9); the inline override is kept as a
 * guard. It must be inline: Tailwind 4 utilities live in a
 * cascade layer, and the unlayered global rule beats any layered class (an `h-auto`
 * class was measured at 844px in a real browser). `display: block` keeps any future
 * icon or second element on one line instead of stacking. z-40 matches the ControlBar:
 * visible during normal use, below modals (z-[60]) and the sidebar (z-50).
 */
export default function OfflineGraceBanner() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      data-testid="offline-grace-banner"
      className="fixed top-0 left-0 right-0 z-40 bg-amber-500/90 text-slate-900 px-4 py-2 text-sm text-center font-medium"
      style={{ height: 'auto', display: 'block' }}
    >
      {t('page.offlineGracePeriod', 'Offline — changes saved locally, will sync when connected')}
    </div>
  );
}
