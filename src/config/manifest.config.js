// src/config/manifest.config.ts

// Using 'export const' to ensure it can be imported by the build script.
/** @type {Object.<string, {appName: string, shortName: string, iconPath: string, themeColor: string, displayMode: string}>} */
export const manifestConfig = {
  // Config for the 'development' branch
  development: {
    appName: "MatchOps Local (Dev)",
    shortName: "MatchOps Dev",
    iconPath: "/icons/icon-512x512.png", // New MatchOps icon
    themeColor: "#4f46e5", // A distinct purple for dev
    displayMode: "fullscreen", // Keep fullscreen for PWA identity consistency
  },
  // Config for the 'master' branch (production)
  master: {
    appName: "MatchOps Local",
    shortName: "MatchOps Local",
    iconPath: "/icons/icon-512x512.png",
    themeColor: "#1e293b", // Slate-800 to match top bar
    displayMode: "fullscreen", // Keep fullscreen for PWA identity consistency
  },
  // A fallback for any other branch (e.g., feature branches)
  default: {
    appName: "MatchOps Local (Preview)",
    shortName: "MatchOps Preview",
    iconPath: "/icons/icon-512x512.png",
    themeColor: "#ca8a04", // A yellow/amber for previews
    displayMode: "fullscreen", // Keep fullscreen for PWA identity consistency
  },
};