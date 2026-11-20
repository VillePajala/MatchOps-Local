// Default game ID for unsaved/temporary games
export const DEFAULT_GAME_ID = 'unsaved_game';

/**
 * Premium enforcement feature flag
 *
 * When false: Premium features are bypassed (everyone has access)
 * When true: Premium gating is enforced in production
 *
 * Set to true when ready to launch premium features with Play Billing.
 *
 * @see Issue #258 - Premium gating preparation
 */
export const PREMIUM_ENFORCEMENT_ENABLED = false;

/**
 * Current Terms of Service and Privacy Policy version.
 *
 * Format: YYYY-MM (year and month when policy was last updated)
 *
 * IMPORTANT: When updating Terms or Privacy Policy:
 * 1. Update this version string
 * 2. Update the actual content in /app/terms and /app/privacy-policy
 * 3. Users will be prompted to re-consent on next login
 *
 * This is used for GDPR compliance - consent records are stored server-side
 * with this version to prove which policy the user agreed to.
 *
 * @see docs/02-technical/database/supabase-schema.md Section 16 (user_consents)
 */
export const POLICY_VERSION = '2026-11';

/**
 * Version shown to coaches and sent with support emails: the newest
 * release-notes date plus the commit, baked in at build time (next.config.ts).
 * Not package.json's version - that was never bumped and always read 1.0.0.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
