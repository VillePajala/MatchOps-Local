-- Migration 025: Add unique constraint on user_consents for ON CONFLICT support
--
-- The record_user_consent RPC uses ON CONFLICT (user_id, consent_type, policy_version)
-- but the unique constraint was missing from the table definition, causing:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Fixes MATCHOPS-LOCAL-7Q

ALTER TABLE public.user_consents
ADD CONSTRAINT user_consents_user_consent_unique
UNIQUE (user_id, consent_type, policy_version);
