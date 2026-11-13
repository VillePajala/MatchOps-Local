-- 054: players.archived - a coach can archive (arkistoi) a player who has left the team.
--
-- Archived players are hidden from every picker for new games, teams and plans, and kept
-- in old games, stats and exports. Purely additive: existing rows default to false
-- (active), no data is rewritten, and no RPC changes are needed (save_game_with_relations
-- and set_team_roster do not touch the players table's columns).

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
