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
