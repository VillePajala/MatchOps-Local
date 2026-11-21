-- ============================================================================
-- 065: playbooks - read-only Pelitapa content shared with chosen accounts
-- ============================================================================
-- A playbook is a club's (or our own) set of playing concepts: each concept is
-- one JSON document in the Pelitapa format (src/pelitapa/types.ts, checked by
-- src/pelitapa/validateConcept.ts in the app). The content is NOT the coach's
-- data: it is written by the service role / SQL (scripts/pelitapa/seed-playbook.mjs)
-- and shared with individual accounts by a row in playbook_access. See
-- docs/03-active-plans/UNIFIED-ROADMAP.md, "Pelitapa library".
--
-- Access:
-- - RLS on for all three tables, SELECT policies only:
--   - playbook_access: a signed-in user reads their OWN grants;
--   - playbooks and playbook_concepts: readable when the user has a grant for
--     the playbook (EXISTS on playbook_access).
-- - No INSERT/UPDATE/DELETE policy, and table privileges narrowed to SELECT for
--   authenticated and nothing for anon (same reasoning as 064: RLS alone would
--   refuse writes, the REVOKE states the intent and survives a policy mistake).
-- - service_role (BYPASSRLS) keeps its default privileges: content and grants
--   are managed with SQL / the Management API.
--
-- Lifetime:
-- - Account deletion: playbook_access rows cascade (auth.users ON DELETE CASCADE).
--   The playbooks themselves are not anyone's data and stay.
-- - Deleting a playbook cascades to its concepts and grants.
-- - clear_all_user_data ("delete all cloud data", account kept) deliberately
--   does NOT touch playbook_access: access to a club's playbook is granted to
--   the account by the club/owner, it is not the coach's own data, and the
--   coach could not re-grant it. (The function lists its tables explicitly, so
--   nothing needs to change there.)
--
-- Additive and re-runnable (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS playbooks (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  owner_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE playbooks IS
  'Pelitapa playbooks (club or built-in concept sets). Written only by the service role; readable by accounts with a playbook_access row.';
COMMENT ON COLUMN playbooks.owner_note IS
  'Internal note for whoever manages the content (where it came from, permission). Not shown in the app.';

CREATE TABLE IF NOT EXISTS playbook_concepts (
  id          text NOT NULL,
  playbook_id text NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  format      text NOT NULL CHECK (format IN ('5v5', '8v8', '11v11')),
  phase       text NOT NULL,
  sort        int  NOT NULL DEFAULT 0,
  data        jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version     int  NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playbook_id, id)
);

COMMENT ON TABLE playbook_concepts IS
  'One Pelitapa concept (JSON, validated by the app before use) per row. format/phase/sort duplicate the document for filtering and ordering.';
COMMENT ON COLUMN playbook_concepts.version IS
  'Content revision, bumped by the loader when the concept changes (not the JSON format version inside data).';

CREATE TABLE IF NOT EXISTS playbook_access (
  playbook_id text NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playbook_id, user_id)
);

COMMENT ON TABLE playbook_access IS
  'Which accounts may read which playbook. Written only by the service role. Kept by clear_all_user_data, removed with the account.';

-- RLS lookups and the auth.users cascade go by user_id.
CREATE INDEX IF NOT EXISTS idx_playbook_access_user ON playbook_access (user_id);

ALTER TABLE playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON playbooks, playbook_concepts, playbook_access FROM PUBLIC, anon, authenticated;
GRANT SELECT ON playbooks, playbook_concepts, playbook_access TO authenticated;

DROP POLICY IF EXISTS "Users can read their own playbook access" ON playbook_access;
CREATE POLICY "Users can read their own playbook access"
  ON playbook_access FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can read playbooks they have access to" ON playbooks;
CREATE POLICY "Users can read playbooks they have access to"
  ON playbooks FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM playbook_access a
    WHERE a.playbook_id = playbooks.id AND a.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can read concepts of playbooks they have access to" ON playbook_concepts;
CREATE POLICY "Users can read concepts of playbooks they have access to"
  ON playbook_concepts FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM playbook_access a
    WHERE a.playbook_id = playbook_concepts.playbook_id AND a.user_id = (select auth.uid())
  ));
