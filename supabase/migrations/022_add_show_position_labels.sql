-- Migration 022: Add show_position_labels to games
-- Per-game toggle for showing/hiding position labels (GK, CB, ST, etc.) on the field.
-- Defaults to true (labels visible), matching existing behavior.
--
-- NOTE: The RPC function is updated in migration 023 to include this column.
-- Originally this migration contained a broken RPC rewrite that dropped
-- optimistic locking and changed the return type. That was removed.

-- Add column
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS show_position_labels boolean NOT NULL DEFAULT true;
