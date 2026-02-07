-- Migration: 010_subscriptions
-- Description: Create subscriptions table for Play Store billing
-- Part of: Billing Implementation Phase 1

-- ============================================================================
-- HELPER FUNCTION FOR AUTO-UPDATE TIMESTAMPS
-- ============================================================================

-- Create the updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================

-- Subscription status type
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'none',       -- Never subscribed
    'active',     -- Paid and valid
    'cancelled',  -- User cancelled, but period not ended
    'grace',      -- Payment failed, in grace period (7 days)
    'expired'     -- Grace ended, no access
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Main subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status subscription_status NOT NULL DEFAULT 'none',

  -- Google Play fields
  google_purchase_token TEXT,
  google_order_id TEXT,
  product_id TEXT,

  -- Period tracking
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  grace_end TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,

  -- Ensure one subscription per user
  CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription
-- Note: No INSERT/UPDATE policy for users - only Edge Functions (service role) can write
CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================

-- Trigger to auto-update updated_at
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

-- Function to get subscription status (used by app)
-- Returns subscription info for the authenticated user
CREATE OR REPLACE FUNCTION get_subscription_status()
RETURNS TABLE (
  status subscription_status,
  period_end TIMESTAMPTZ,
  grace_end TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.status,
    s.period_end,
    s.grace_end,
    (s.status IN ('active', 'cancelled', 'grace')) AS is_active
  FROM subscriptions s
  WHERE s.user_id = auth.uid();

  -- If no subscription record exists, return default 'none' status
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'none'::subscription_status AS status,
      NULL::TIMESTAMPTZ AS period_end,
      NULL::TIMESTAMPTZ AS grace_end,
      FALSE AS is_active;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_subscription_status() TO authenticated;

-- ============================================================================
-- HELPER FUNCTION FOR EDGE FUNCTIONS
-- ============================================================================

-- Function to upsert subscription (called by Edge Function with service role)
-- This is NOT exposed to regular users via RLS
CREATE OR REPLACE FUNCTION upsert_subscription(
  p_user_id UUID,
  p_status subscription_status,
  p_google_purchase_token TEXT DEFAULT NULL,
  p_google_order_id TEXT DEFAULT NULL,
  p_product_id TEXT DEFAULT NULL,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_grace_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result subscriptions;
BEGIN
  INSERT INTO subscriptions (
    user_id,
    status,
    google_purchase_token,
    google_order_id,
    product_id,
    period_start,
    period_end,
    grace_end,
    last_verified_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_status,
    p_google_purchase_token,
    p_google_order_id,
    p_product_id,
    p_period_start,
    p_period_end,
    p_grace_end,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    status = EXCLUDED.status,
    google_purchase_token = COALESCE(EXCLUDED.google_purchase_token, subscriptions.google_purchase_token),
    google_order_id = COALESCE(EXCLUDED.google_order_id, subscriptions.google_order_id),
    product_id = COALESCE(EXCLUDED.product_id, subscriptions.product_id),
    period_start = COALESCE(EXCLUDED.period_start, subscriptions.period_start),
    period_end = COALESCE(EXCLUDED.period_end, subscriptions.period_end),
    grace_end = COALESCE(EXCLUDED.grace_end, subscriptions.grace_end),
    last_verified_at = NOW(),
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- Only service role can execute this (Edge Functions).
-- Regular users cannot call this function.
-- NOTE: No explicit GRANT to service_role is needed because the service_role
-- in Supabase is a PostgreSQL superuser that bypasses all permission checks,
-- including EXECUTE privileges and RLS policies. The REVOKE statements below
-- ensure that the anon and authenticated roles cannot call this function via
-- PostgREST, while the service_role used by Edge Functions is unaffected.
REVOKE EXECUTE ON FUNCTION upsert_subscription FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION upsert_subscription FROM authenticated;
