-- Migration 027: Drop redundant unique index on user_consents
--
-- Migration 008 created a unique INDEX (idx_user_consents_unique) and
-- migration 025 added a unique CONSTRAINT (user_consents_user_consent_unique)
-- on the same columns (user_id, consent_type, policy_version).
-- The constraint's implicit index makes the explicit index redundant,
-- doubling index maintenance cost on every INSERT/UPDATE.

DROP INDEX IF EXISTS idx_user_consents_unique;
