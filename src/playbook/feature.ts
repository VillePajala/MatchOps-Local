/**
 * The Playbook (Pelikirja) feature's server-side account flag
 * (`account_features.feature`, migration 064).
 *
 * The feature was first called "Pelitapa". The stored value stays 'pelitapa'
 * for compatibility: it is granted with SQL on every environment and cached
 * per user in localStorage, so renaming it would need a data migration.
 * Always refer to the flag through this constant, never through the raw string.
 *
 * Kept in its own dependency-free module (not in useAccountFeatures) so tests
 * that mock the hooks can still import the real value.
 */
export const PLAYBOOK_FEATURE = 'pelitapa';
