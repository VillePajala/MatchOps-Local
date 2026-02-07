-- Migration: 024_distributed_rate_limiting
-- Description: Add distributed rate limiting for Edge Functions
-- Replaces per-instance in-memory rate limiting with PostgreSQL-backed counters
-- that work across all Edge Function instances and survive cold starts.
-- Closes: #325

-- ============================================================================
-- RATE LIMITS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS needed — this table is only accessed via service_role from Edge Functions.
-- Regular users (anon/authenticated) cannot access it directly.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CHECK RATE LIMIT RPC
-- ============================================================================

-- Atomic check-and-increment function.
-- Returns TRUE if request is allowed, FALSE if rate limited.
-- Cleans up expired rows on each call (bounded by DELETE LIMIT).
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_window_ms INT DEFAULT 60000,
  p_max_requests INT DEFAULT 10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window_interval INTERVAL;
  v_now TIMESTAMPTZ := NOW();
  v_record rate_limits%ROWTYPE;
BEGIN
  v_window_interval := (p_window_ms || ' milliseconds')::INTERVAL;

  -- Cleanup expired rows (limit to 100 to bound cost per call)
  DELETE FROM rate_limits
  WHERE window_start < v_now - v_window_interval
  AND ctid IN (
    SELECT ctid FROM rate_limits
    WHERE window_start < v_now - v_window_interval
    LIMIT 100
  );

  -- Try to insert a new row for this key
  INSERT INTO rate_limits (key, count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE SET
    -- If window expired, reset; otherwise increment
    count = CASE
      WHEN rate_limits.window_start < v_now - v_window_interval THEN 1
      ELSE rate_limits.count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start < v_now - v_window_interval THEN v_now
      ELSE rate_limits.window_start
    END
  RETURNING * INTO v_record;

  -- Return TRUE if under limit (allowed), FALSE if over (blocked)
  RETURN v_record.count <= p_max_requests;
END;
$$;

-- Only service role can execute this (Edge Functions).
REVOKE EXECUTE ON FUNCTION check_rate_limit FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_rate_limit FROM authenticated;
