// src/config/manifest.config.js

// Using 'export const' to ensure it can be imported by the build script.
/** @type {Object.<string, {appName: string, shortName: string, iconPath: string, themeColor: string, description: string}>} */
export const manifestConfig = {
  // Config for the 'development' branch
  development: {
    appName: "MatchOps Local (Dev)",
    shortName: "MatchOps Dev",
    iconPath: "/icons/icon-512x512.png",
    themeColor: "#4f46e5", // Purple for dev
    description: "MatchOps Local - Development Build",
  },
  // Config for the 'master' branch (production)
  master: {
    appName: "MatchOps Local",
    shortName: "MatchOps Local",
    iconPath: "/icons/icon-512x512.png",
    themeColor: "#1e293b", // Slate for production
    description: "MatchOps Local - Soccer Coaching Assistant",
  },
  // Config for staging/preview branches
  staging: {
    appName: "MatchOps Local (Staging)",
    shortName: "MatchOps Stage",
    iconPath: "/icons/icon-512x512.png",
    themeColor: "#059669", // Green for staging
    description: "MatchOps Local - Staging Environment",
  },
  // A fallback for any other branch (e.g., feature branches)
  default: {
    appName: "MatchOps Local (Preview)",
    shortName: "MatchOps Preview",
    iconPath: "/icons/icon-512x512.png",
    themeColor: "#ca8a04", // Yellow/amber for previews
    description: "MatchOps Local - Preview Build",
  },
};