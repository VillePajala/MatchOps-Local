// src/config/manifest.config.ts

// Using 'export const' to ensure it can be imported by the build script.
//
// `iconVariant` controls which icons the manifest references:
//   - 'master'  → /icons/icon-{size}.png (the canonical production icon)
//   - 'preview' → /icons/icon-preview-{size}.png (generated at build time
//                 by generate-manifest.mjs from the master icons via a
//                 hue rotation, so a coach with both versions installed
//                 can tell them apart at a glance on the home screen)
/** @type {Object.<string, {appName: string, shortName: string, iconVariant: 'master'|'preview', themeColor: string, displayMode: string}>} */
export const manifestConfig = {
  // Config for the 'development' branch
  development: {
    appName: "MatchOps Local (Dev)",
    shortName: "MatchOps Dev",
    iconVariant: "preview",
    themeColor: "#4f46e5", // A distinct purple for dev
    displayMode: "standalone", // Match installed PWA manifest for update detection
  },
  // Config for the 'master' branch (production)
  master: {
    appName: "MatchOps Local",
    shortName: "MatchOps Local",
    iconVariant: "master",
    themeColor: "#1e293b", // Slate-800 to match top bar
    displayMode: "standalone", // Match installed PWA manifest for update detection
  },
  // A fallback for any other branch (e.g., feature branches)
  default: {
    appName: "MatchOps Local (Preview)",
    shortName: "MatchOps Preview",
    iconVariant: "preview",
    themeColor: "#a855f7", // Purple to match the preview-tinted icon
    displayMode: "standalone", // Match installed PWA manifest for update detection
  },
};