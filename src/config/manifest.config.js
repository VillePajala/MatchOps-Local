// src/config/manifest.config.ts

// Using 'export const' to ensure it can be imported by the build script.
/** @type {Object.<string, {appName: string, shortName: string, iconPath: string, themeColor: string, displayMode: string}>} */
export const manifestConfig = {
  // Config for the 'development' branch
  development: {
    appName: "PePo Ops (Dev)",
    shortName: "PePo Ops Dev",
    iconPath: "/icons/icon-512x512.png", // New MatchOps icon
    themeColor: "#4f46e5", // A distinct purple for dev
    displayMode: "standalone", // Match installed PWA manifest for update detection
  },
  // Config for the 'master' branch (production)
  master: {
    appName: "MatchOps Local",
    shortName: "MatchOps Local",
    iconPath: "/icons/icon-512x512.png",
    themeColor: "#1e293b", // Slate-800 to match top bar
    displayMode: "standalone", // Match installed PWA manifest for update detection
  },
  // PePo club preview (branch club/pepo-preview - NEVER merged; preview only)
  'club/pepo-preview': {
    appName: "PePo Ops",
    shortName: "PePo Ops",
    iconPath: "/icons/icon-512x512.png",
    themeColor: "#170a18", // PePo aubergine canvas
    displayMode: "standalone",
  },
  // A fallback for any other branch (e.g., feature branches)
  default: {
    appName: "PePo Ops (Preview)",
    shortName: "PePo Ops",
    iconPath: "/icons/icon-512x512.png",
    themeColor: "#170a18", // Same as production for consistent appearance (preview indicator shown in Settings)
    displayMode: "standalone", // Match installed PWA manifest for update detection
  },
};