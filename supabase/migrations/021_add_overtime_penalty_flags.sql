-- Migration 021: Add overtime and penalty shootout flags to games
-- These are simple boolean metadata flags for recording whether a game
-- went to overtime or was decided by penalty shootout.
--
-- NOTE: The RPC function is updated in migration 023 to include these columns.
-- Originally this migration contained a broken RPC rewrite that dropped
-- optimistic locking and changed the return type. That was removed.

-- Add columns
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS went_to_overtime boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS went_to_penalties boolean NOT NULL DEFAULT false;
