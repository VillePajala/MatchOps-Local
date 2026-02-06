-- Migration 019: Add index on subscriptions.google_purchase_token
--
-- The verify-subscription Edge Function performs an idempotency check:
--   SELECT ... FROM subscriptions WHERE google_purchase_token = ? AND user_id != ?
--
-- Without an index, this requires a sequential scan of the subscriptions table.
-- At current scale (<1000 rows) this is negligible, but adding the index now
-- prevents future performance degradation as the user base grows.

CREATE INDEX IF NOT EXISTS idx_subscriptions_purchase_token
  ON subscriptions (google_purchase_token)
  WHERE google_purchase_token IS NOT NULL;
