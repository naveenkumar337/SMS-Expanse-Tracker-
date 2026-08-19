-- Run this once in the Supabase SQL Editor to fix duplicate SMS transaction imports.
-- Adds a stable identifier column derived from the parsed SMS (deterministic hash),
-- separate from the `id` primary key (which is a DB-generated UUID).

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sms_id TEXT;

-- Prevent the same SMS from being inserted twice for the same user
-- (NULL sms_id, e.g. manual cash entries, are not constrained by this index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_sms_id
  ON transactions(user_id, sms_id)
  WHERE sms_id IS NOT NULL;
